import { z } from "zod";

/**
 * Security guard: Rejects strings that contain full 13-19 digit PAN card numbers,
 * CVV/CVC labels, PINs, or OTP codes so sensitive credentials are never persisted.
 */
const FULL_PAN_REGEX = /\b(?:\d[ -]*?){13,19}\b/;

export function containsProhibitedCardSecret(value: string): boolean {
  if (!value) return false;
  if (FULL_PAN_REGEX.test(value)) return true;
  if (/\b(?:cvv|cvc|pin\s*code|otp\s*code|internet\s*banking\s*password)\s*[:=]?\s*\d{3,8}\b/i.test(value)) {
    return true;
  }
  return false;
}

const safeTextSchema = (maxLen = 500) =>
  z
    .string()
    .max(maxLen)
    .refine(
      (val) => !containsProhibitedCardSecret(val),
      "Never enter full card numbers (PAN), CVV, PIN, or OTPs. Only last 4 digits are permitted."
    );

export const transactionInputSchema = z.object({
  transaction_type: z.enum([
    "expense",
    "income",
    "transfer",
    "refund",
    "cc_repayment",
  ]),
  status: z.enum(["confirmed", "pending", "declined", "reversed"]).default("confirmed"),
  verification_status: z
    .enum(["verified", "needs_review", "flagged"])
    .default("verified"),
  entry_source: z
    .enum([
      "manual",
      "receipt_ocr",
      "sms_parse",
      "screenshot_ocr",
      "csv_import",
      "recurring_confirmed",
    ])
    .default("manual"),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(100_000_000, "Amount exceeds maximum allowed limit"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "Currency must be a 3-letter ISO code (e.g. AED)")
    .default("AED"),
  vat_amount: z.coerce.number().min(0).nullable().optional().default(0),
  merchant: safeTextSchema(160).refine(
    (s) => s.trim().length >= 1,
    "Merchant or payee name is required"
  ),
  merchant_location: safeTextSchema(160).nullable().optional(),
  category_name: z.string().min(1, "Category is required").max(80),
  subcategory_name: z.string().max(80).nullable().optional(),
  transaction_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  transaction_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
  payment_method: z
    .enum([
      "credit_card",
      "debit_card",
      "bank_transfer",
      "cash",
      "apple_pay",
      "samsung_pay",
      "direct_debit",
    ])
    .default("credit_card"),
  account_id: z.string().nullable().optional(),
  card_id: z.string().nullable().optional(),
  target_card_id: z.string().nullable().optional(),
  target_account_id: z.string().nullable().optional(),
  reference_number: safeTextSchema(100).nullable().optional(),
  receipt_id: z.string().nullable().optional(),
  extraction_job_id: z.string().nullable().optional(),
  income_kind: z
    .enum([
      "salary",
      "bonus",
      "reimbursement",
      "freelance",
      "investment",
      "other",
    ])
    .nullable()
    .optional(),
  tags: z.array(z.string().max(40)).optional().default([]),
  line_items: z
    .array(
      z.object({
        description: z.string().max(200),
        quantity: z.coerce.number().min(0),
        unit_price: z.coerce.number().min(0),
        total: z.coerce.number().min(0),
      })
    )
    .optional()
    .default([]),
  notes: safeTextSchema(500).nullable().optional(),
});

export const cardInputSchema = z.object({
  display_name: safeTextSchema(100).refine(
    (v) => v.trim().length >= 2,
    "Display name is required"
  ),
  bank_name: safeTextSchema(100).refine(
    (v) => v.trim().length >= 2,
    "Bank name is required"
  ),
  linked_account_id: z.string().nullable().optional(),
  card_type: z.enum(["debit", "credit", "prepaid"]),
  card_network: z
    .enum(["Visa", "Mastercard", "Amex", "Jaywan", "UnionPay", "Other"])
    .default("Visa"),
  currency: z.string().length(3).default("AED"),
  last_four: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter strictly the last 4 digits only (never full card number)"),
  nickname: safeTextSchema(80).nullable().optional(),
  credit_limit: z.coerce.number().min(0).nullable().optional(),
  billing_cycle_closing_day: z.coerce.number().int().min(1).max(31).nullable().optional(),
  payment_due_day: z.coerce.number().int().min(1).max(31).nullable().optional(),
  due_date_rule_days_after_close: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .nullable()
    .optional(),
  minimum_payment_percent: z.coerce.number().min(0).max(100).nullable().optional(),
  minimum_payment_fixed: z.coerce.number().min(0).nullable().optional(),
  statement_balance: z.coerce.number().min(0).default(0),
  current_outstanding_balance: z.coerce.number().min(0).default(0),
  opening_balance: z.coerce.number().min(0).default(0),
  is_balance_manual: z.boolean().default(false),
  is_active: z.boolean().default(true),
  notes: safeTextSchema(400).nullable().optional(),
});

export const financialAccountInputSchema = z.object({
  display_name: safeTextSchema(100).refine(
    (v) => v.trim().length >= 2,
    "Account display name is required"
  ),
  bank_name: safeTextSchema(100).refine(
    (v) => v.trim().length >= 2,
    "Bank name is required"
  ),
  account_type: z.enum(["checking", "savings", "salary", "wallet", "cash"]),
  currency: z.string().length(3).default("AED"),
  last_four: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Last 4 digits must be 4 numeric digits")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  nickname: safeTextSchema(80).nullable().optional(),
  opening_balance: z.coerce.number().default(0),
  manual_balance: z.coerce.number().nullable().optional(),
  is_manual_balance_verified: z.boolean().default(false),
  is_active: z.boolean().default(true),
  notes: safeTextSchema(400).nullable().optional(),
});

export const statementInputSchema = z.object({
  card_id: z.string().min(1, "Card is required"),
  statement_period_label: z.string().min(2).max(80),
  period_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statement_balance: z.coerce.number().min(0),
  minimum_payment: z.coerce.number().min(0).default(100),
  amount_paid: z.coerce.number().min(0).default(0),
  notes: safeTextSchema(400).nullable().optional(),
});

export const ccRepaymentInputSchema = z.object({
  card_id: z.string().min(1, "Target credit card is required"),
  statement_id: z.string().nullable().optional(),
  source_account_id: z.string().nullable().optional(),
  amount: z.coerce.number().positive("Repayment amount must be positive"),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference_number: safeTextSchema(100).nullable().optional(),
  notes: safeTextSchema(400).nullable().optional(),
});

export const loanInputSchema = z.object({
  loan_name: safeTextSchema(120).refine(
    (v) => v.trim().length >= 2,
    "Loan name is required"
  ),
  lender_name: safeTextSchema(100).refine(
    (v) => v.trim().length >= 2,
    "Bank or lender name is required"
  ),
  loan_type: z
    .enum([
      "personal_loan",
      "auto_loan",
      "home_mortgage",
      "bnpl_installment",
      "card_installment_plan",
    ])
    .default("personal_loan"),
  currency: z.string().length(3).default("AED"),
  principal_amount: z.coerce.number().positive("Original loan amount must be > 0"),
  outstanding_principal: z.coerce.number().min(0),
  interest_rate_apr: z.coerce.number().min(0).max(100).default(0),
  monthly_emi: z.coerce.number().positive("Monthly EMI must be > 0"),
  total_installments: z.coerce.number().int().min(1).max(480).default(36),
  paid_installments: z.coerce.number().int().min(0).default(0),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  next_payment_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_day_of_month: z.coerce.number().int().min(1).max(31).default(1),
  linked_account_id: z.string().nullable().optional(),
  linked_card_id: z.string().nullable().optional(),
  notes: safeTextSchema(400).nullable().optional(),
});

export const loanPaymentInputSchema = z.object({
  loan_id: z.string().min(1, "Target loan is required"),
  source_account_id: z.string().nullable().optional(),
  amount: z.coerce.number().positive("Payment amount must be positive"),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference_number: safeTextSchema(100).nullable().optional(),
  notes: safeTextSchema(400).nullable().optional(),
});

export const budgetInputSchema = z.object({
  month_key: z.string().regex(/^\d{4}-\d{2}$/),
  category_name: z.string().min(1).max(80),
  is_overall: z.boolean().default(false),
  limit_amount: z.coerce.number().min(0),
  currency: z.string().length(3).default("AED"),
  alert_thresholds: z
    .array(z.number().int().min(1).max(200))
    .default([50, 75, 90, 100]),
  notes: safeTextSchema(300).nullable().optional(),
});

export const recurringInputSchema = z.object({
  name: safeTextSchema(120).refine((v) => v.trim().length >= 2, "Name is required"),
  kind: z.enum(["expense", "income"]).default("expense"),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).default("AED"),
  frequency: z
    .enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"])
    .default("monthly"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_name: z.string().min(1).max(80),
  account_id: z.string().nullable().optional(),
  card_id: z.string().nullable().optional(),
  reminder_days_before: z.array(z.number().int().min(0).max(60)).default([7, 3, 1]),
  is_active: z.boolean().default(true),
  notes: safeTextSchema(300).nullable().optional(),
});

export const ALLOWED_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates file MIME type, size, and magic header bytes to reject executable
 * or spoofed payloads uploaded as receipt images.
 */
export function validateUploadedFileBytes(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  headerBytes: Uint8Array;
}): { valid: boolean; reason?: string } {
  const { mimeType, sizeBytes, headerBytes } = params;

  if (
    !ALLOWED_RECEIPT_MIME_TYPES.includes(
      mimeType as (typeof ALLOWED_RECEIPT_MIME_TYPES)[number]
    )
  ) {
    return {
      valid: false,
      reason: `Unsupported file type "${mimeType}". Allowed: JPEG, PNG, WebP, PDF.`,
    };
  }

  if (sizeBytes <= 0 || sizeBytes > MAX_RECEIPT_FILE_BYTES) {
    return {
      valid: false,
      reason: `File size must be between 1 byte and 10 MB.`,
    };
  }

  if (headerBytes.length < 4) {
    return { valid: false, reason: "File content is too short or corrupted." };
  }

  // Check magic signatures
  const isJpeg =
    headerBytes[0] === 0xff &&
    headerBytes[1] === 0xd8 &&
    headerBytes[2] === 0xff;
  const isPng =
    headerBytes[0] === 0x89 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x4e &&
    headerBytes[3] === 0x47;
  const isWebp =
    headerBytes.length >= 12 &&
    headerBytes[0] === 0x52 && // R
    headerBytes[1] === 0x49 && // I
    headerBytes[2] === 0x46 && // F
    headerBytes[3] === 0x46 && // F
    headerBytes[8] === 0x57 && // W
    headerBytes[9] === 0x45 && // E
    headerBytes[10] === 0x42 && // B
    headerBytes[11] === 0x50; // P
  const isPdf =
    headerBytes[0] === 0x25 && // %
    headerBytes[1] === 0x50 && // P
    headerBytes[2] === 0x44 && // D
    headerBytes[3] === 0x46; // F

  if (mimeType === "image/jpeg" && !isJpeg) {
    return { valid: false, reason: "File header does not match JPEG signature." };
  }
  if (mimeType === "image/png" && !isPng) {
    return { valid: false, reason: "File header does not match PNG signature." };
  }
  if (mimeType === "image/webp" && !isWebp) {
    return { valid: false, reason: "File header does not match WebP signature." };
  }
  if (mimeType === "application/pdf" && !isPdf) {
    return { valid: false, reason: "File header does not match PDF signature." };
  }

  return { valid: true };
}
