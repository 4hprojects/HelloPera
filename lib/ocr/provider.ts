import type { ExtractionOutput } from '@/lib/ocr/schema';

/**
 * OCR / extraction provider abstraction — Phase 05 §6, §23.
 *
 * HelloPera business logic must not depend on one provider. The interface is
 * deliberately coarse: give it a document, get structured fields back.
 *
 * The spec separates "what text is visible" from "what does it mean" (§5).
 * A vision-capable model collapses those into one call, which §7 explicitly
 * permits — and which the platform forces, since HelloDeploy's container
 * cannot rasterise a PDF, so the provider must accept one directly.
 */

export type ProviderInput = {
  bytes: Uint8Array;
  /** 'application/pdf' or an image type. */
  mimeType: string;
  /** The user's currency, used only as a fallback assumption (§26). */
  defaultCurrency: string;
  /** The user's timezone, so relative dates resolve correctly. */
  timezone: string;
};

export type ProviderResult = ExtractionOutput & {
  provider: string;
  durationMs: number;
  /** Provider-specific metadata. Never secrets. */
  metadata?: Record<string, unknown>;
};

export interface ExtractionProvider {
  readonly name: string;
  /** Whether this provider can read a PDF without rasterising it first. */
  readonly acceptsPdfNatively: boolean;
  extract(input: ProviderInput): Promise<ProviderResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string = 'PROVIDER_ERROR',
  ) {
    super(message);
  }
}
