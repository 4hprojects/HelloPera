import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { extractionResultSchema } from '@/lib/ocr/schema';
import type {
  ExtractionProvider,
  ProviderInput,
  ProviderResult,
} from '@/lib/ocr/provider';
import { ProviderError } from '@/lib/ocr/provider';

/**
 * Claude extraction provider.
 *
 * Chosen because the platform forces it: HelloDeploy generates its own
 * container image, so poppler and pdfium are unavailable and HelloPera cannot
 * rasterise a PDF (PLATFORM-HELLODEPLOY.md row I3). Claude accepts PDFs
 * directly, which removes the requirement entirely rather than working around
 * it.
 *
 * It also collapses OCR and extraction into one call. §5 keeps those concepts
 * separate and §7 permits a vision provider to serve both — the separation
 * that matters is that neither one may write a balance.
 */

const MODEL = 'claude-opus-5';

const SYSTEM_PROMPT = `You read financial documents and return structured data.

You are reading receipts, bills, invoices, bank records and e-wallet screenshots,
mostly from the Philippines.

Rules:
- Report only what the document actually shows. If a field is not present, return
  null. Never infer, estimate, or fill a plausible value.
- Amounts are plain decimal strings: "1234.56". No currency symbol, no thousands
  separators, no negative sign.
- Dates are YYYY-MM-DD. Philippine documents often write DD/MM/YYYY; when a
  numeric date is genuinely ambiguous, prefer the reading consistent with other
  dates on the document, and lower your confidence for that field.
- Give per-field confidence between 0 and 1 reflecting how clearly you could read
  each value. Do not report high confidence for a value you inferred from context.
- If no currency is printed, set currencyCode to the user's default and set
  currencyInferred to true.

Choosing suggestedTarget:
- A receipt or payment confirmation for money already spent -> "transaction"
- A bill stating an amount due on a future date -> "bill"
- An invoice you issued to someone else -> "receivable"
- A payslip or advice for money not yet received -> "expected_income"
- Anything unclear -> "unknown"

"unknown" is a correct answer. A wrong guess costs the user more than an
honest one, because they will trust it.`;

/** Tool call rather than free text: the schema is enforced, not requested. */
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'record_extraction',
  description: 'Record the financial fields read from the document.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      documentType: { type: 'string' },
      suggestedTarget: { type: 'string' },
      merchantName: { type: ['string', 'null'] },
      providerName: { type: ['string', 'null'] },
      partyName: { type: ['string', 'null'] },
      amount: { type: ['string', 'null'], description: 'Plain decimal, e.g. "1234.56"' },
      currencyCode: { type: ['string', 'null'], description: 'ISO 4217, e.g. "PHP"' },
      currencyInferred: { type: 'boolean' },
      transactionDate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
      dueDate: { type: ['string', 'null'] },
      expectedDate: { type: ['string', 'null'] },
      referenceNumber: { type: ['string', 'null'] },
      accountNumber: { type: ['string', 'null'] },
      paymentMethod: { type: ['string', 'null'] },
      categorySuggestion: { type: ['string', 'null'] },
      description: { type: ['string', 'null'] },
      confidence: {
        type: 'object',
        additionalProperties: { type: 'number' },
        description: 'Per-field confidence 0-1, keyed by field name',
      },
      visibleText: {
        type: ['string', 'null'],
        description: 'Text read from the document',
      },
    },
    required: ['documentType', 'suggestedTarget', 'currencyInferred', 'confidence'],
  },
};

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export class ClaudeExtractionProvider implements ExtractionProvider {
  readonly name = 'claude';
  readonly acceptsPdfNatively = true;

  private client: Anthropic;

  constructor(apiKey?: string) {
    // Zero-arg resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or a stored
    // credential profile — so deployment does not have to hardcode a key.
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async extract(input: ProviderInput): Promise<ProviderResult> {
    const started = Date.now();
    const isPdf = input.mimeType === 'application/pdf';

    const documentBlock: Anthropic.ContentBlockParam = isPdf
      ? {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: toBase64(input.bytes),
          },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: input.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
            data: toBase64(input.bytes),
          },
        };

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        thinking: { type: 'adaptive' },
        tools: [EXTRACTION_TOOL],
        messages: [
          {
            role: 'user',
            content: [
              documentBlock,
              {
                type: 'text',
                text:
                  `Read this document and call record_extraction.\n` +
                  `The user's default currency is ${input.defaultCurrency} and their ` +
                  `timezone is ${input.timezone}. Today is ` +
                  `${new Date().toISOString().slice(0, 10)}.`,
              },
            ],
          },
        ],
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new ProviderError(
          'The document reader is busy. Try again shortly.',
          'RATE_LIMIT',
        );
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new ProviderError('Document reading is not configured.', 'AUTH');
      }
      throw new ProviderError('We could not read this document.', 'PROVIDER_ERROR');
    }

    // A refusal is a normal 200 response, not an exception.
    if (response.stop_reason === 'refusal') {
      throw new ProviderError('We could not read this document.', 'REFUSED');
    }

    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'record_extraction',
    );
    if (!call) {
      throw new ProviderError('The document reader returned no fields.', 'NO_OUTPUT');
    }

    // Validate even though the tool is strict. Provider output is untrusted
    // input (§17); a schema-valid shape can still carry an impossible date.
    const raw = call.input as Record<string, unknown>;
    const { confidence, visibleText, ...fields } = raw;

    const parsed = extractionResultSchema.safeParse({
      fields,
      confidence: confidence ?? {},
      rawText: visibleText ?? null,
    });

    if (!parsed.success) {
      throw new ProviderError(
        'The document reader returned unusable fields.',
        'INVALID_OUTPUT',
      );
    }

    return {
      ...parsed.data,
      provider: this.name,
      durationMs: Date.now() - started,
      metadata: {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
