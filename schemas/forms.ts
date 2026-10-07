import { z } from 'zod';
import { formSchema } from '@/lib/validation/form';

/**
 * The exact fields each server action accepts — one place to read them all.
 *
 * Every schema is strict: a request carrying any other field is rejected
 * before the action does anything. Semantic validation lives in the domain
 * schemas next door; this file only fixes the shape.
 *
 * Note what is absent. No user-facing form accepts `user_id`, `role`,
 * `status`, `plan`, a balance, or any other server-owned column: the caller is
 * always `requireUser()`, and ownership is checked against that. The admin
 * forms that do take a `userId` are behind `requireAdmin()`.
 *
 * `forms.test.ts` reads each action's source and fails if an action reads a
 * field missing here, or if a field here is never read.
 */

/** Actions that take no input still reject a body with fields in it. */
const none = formSchema([]);

export const FORMS = {
  account: {
    deleteAccount: formSchema(['password', 'confirmation']),
  },
  admin: {
    setUserStatus: formSchema(['userId', 'status', 'reason', 'confirmation']),
    setUserRole: formSchema(['userId', 'role', 'reason', 'confirmation']),
    addSupportNote: formSchema(['userId', 'note']),
    setFlag: formSchema(['key', 'enabled', 'reason', 'confirmation']),
    grantOverride: formSchema(['userId', 'entitlementKey', 'value', 'endsAt', 'reason']),
    revokeOverride: formSchema(['overrideId', 'userId', 'reason']),
    adjustUsage: formSchema(['userId', 'featureKey', 'quantityDelta', 'reason']),
    repairBalance: formSchema(['accountId', 'userId', 'reason', 'confirmation']),
    runIntegrityCheck: formSchema(['reason']),
  },
  ai: {
    askAssistant: formSchema(['question', 'conversationId']),
  },
  auth: {
    registerWithEmail: formSchema([
      'firstName',
      'lastName',
      'email',
      'password',
      'confirmPassword',
    ]),
    loginWithEmail: formSchema(['email', 'password']),
    requestPasswordReset: formSchema(['email']),
    resetPassword: formSchema(['password', 'confirmPassword']),
    updateProfile: formSchema(['firstName', 'lastName', 'timezone', 'defaultCurrency']),
  },
  documents: {
    archiveDocument: formSchema(['id', 'archived']),
  },
  extraction: {
    runExtraction: formSchema(['documentId', 'redirectTo']),
    discardExtraction: formSchema(['extractionId', 'documentId']),
    confirmDrafts: formSchema(
      ['extractionId', 'documentId', 'count', 'accountId', 'currency'],
      {
        // One group per draft card, d0 to d29 (the action caps count at 30).
        patterns: [
          /^d([0-9]|[12][0-9])\.(selected|target|name|amount|date|categoryId|description|direction)$/,
        ],
      },
    ),
  },
  finance: {
    createAccount: formSchema([
      'requestId',
      'name',
      'type',
      'nature',
      'currencyCode',
      'openingBalance',
      'institutionName',
      'bankLast4',
      'bankKind',
      'paymentAmount',
      'paymentFrequency',
      'nextDueDate',
      'principal',
      'loanStartDate',
      'interestRateApr',
      'termMonths',
      'createReminder',
    ]),
    archiveAccount: formSchema(['id', 'archived']),
    createTransaction: formSchema([
      'requestId',
      'type',
      'direction',
      'amount',
      'currencyCode',
      'transactionDate',
      'sourceAccountId',
      'destinationAccountId',
      'categoryId',
      'merchantName',
      'description',
      'notes',
    ]),
    voidTransaction: formSchema(['id', 'reason']),
    deleteAccount: formSchema(['id']),
    updateAccount: formSchema([
      'id',
      'name',
      'institutionName',
      'bankLast4',
      'bankKind',
      'paymentAmount',
      'paymentFrequency',
      'nextDueDate',
      'principal',
      'interestRateApr',
      'termMonths',
    ]),
    updateTransaction: formSchema([
      'id',
      'amount',
      'transactionDate',
      'categoryId',
      'merchantName',
      'description',
      'notes',
    ]),
  },
  notifications: {
    markNotificationRead: formSchema(['id']),
    markAllNotificationsRead: none,
    updateNotificationPreferences: formSchema([
      'billDueSoon',
      'billOverdue',
      'receivableDueSoon',
      'receivableOverdue',
      'expectedIncome',
      'recurringEvents',
      'ocrReview',
      'forecastShortfall',
      'inAppEnabled',
      'pushEnabled',
      'quietHoursEnabled',
      'quietHoursStart',
      'quietHoursEnd',
      'timezone',
    ]),
  },
  obligations: {
    createBill: formSchema([
      'providerName',
      'description',
      'amount',
      'currencyCode',
      'dueDate',
      'categoryId',
      'notes',
      'installmentAmount',
      'installmentCount',
      'installmentsPrior',
    ]),
    createReceivable: formSchema([
      'partyName',
      'description',
      'amount',
      'currencyCode',
      'borrowedDate',
      'dueDate',
      'notes',
    ]),
    createExpectedIncome: formSchema([
      'sourceName',
      'description',
      'amount',
      'currencyCode',
      'expectedDate',
      'categoryId',
      'notes',
      'frequency',
      'endDate',
    ]),
    recordPayment: formSchema([
      'requestId',
      'mode',
      'obligationType',
      'obligationId',
      'amount',
      'accountId',
      'transactionDate',
      'transactionId',
    ]),
    cancelObligation: formSchema(['id', 'kind']),
    updateObligation: formSchema([
      'id',
      'kind',
      'scope',
      'name',
      'amount',
      'date',
      'description',
      'notes',
      'categoryId',
      'installmentAmount',
      'installmentCount',
      'installmentsPrior',
      'borrowedDate',
      'frequency',
      'endDate',
    ]),
  },
  push: {
    subscribeToPush: formSchema(['endpoint', 'p256dh', 'auth', 'userAgent']),
    unsubscribeFromPush: formSchema(['endpoint']),
  },
  recurring: {
    createRecurringRule: formSchema([
      'ruleType',
      'name',
      'description',
      'amount',
      'currencyCode',
      'frequency',
      'intervalCount',
      'dayOfMonth',
      'dayOfWeek',
      'startDate',
      'endDate',
      'accountId',
      'categoryId',
      'providerName',
      'sourceName',
    ]),
    updateRecurringRule: formSchema([
      'id',
      'applyToFuture',
      'ruleType',
      'name',
      'description',
      'amount',
      'currencyCode',
      'frequency',
      'intervalCount',
      'dayOfMonth',
      'dayOfWeek',
      'startDate',
      'endDate',
      'accountId',
      'categoryId',
      'providerName',
      'sourceName',
    ]),
    transitionRule: formSchema(['id', 'action', 'endDate']),
    expectedEvent: formSchema(['id', 'action', 'transactionId']),
    generateOccurrences: none,
  },
} as const;

/**
 * Actions called from client code with plain arguments instead of a form.
 * The same rule applies: exactly these fields, nothing else.
 */
export const ACTION_ARGS = {
  /** documents.prepareUploadAction(size) */
  prepareUpload: z.number().int().positive().finite(),
  /** documents.finalizeUploadAction(input) */
  finalizeUpload: z.strictObject({
    stagedPath: z.string().min(1).max(512),
    filename: z.string().max(512),
    declaredMimeType: z.string().max(255),
    documentType: z.string().max(64),
  }),
  /** obligations.searchPaymentCandidatesAction(input) */
  searchPaymentCandidates: z.strictObject({
    kind: z.enum(['bill', 'receivable', 'expected_income']),
    currency: z.string().max(3),
    search: z.string().max(200).optional(),
    cursor: z.string().max(512).nullable().optional(),
  }),
} as const;
