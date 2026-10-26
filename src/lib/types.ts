export type TransactionType =
  | "expense"
  | "income"
  | "transfer"
  | "refund"
  | "cc_repayment";

export type TransactionStatus =
  | "confirmed"
  | "pending"
  | "declined"
  | "reversed";

export type VerificationStatus = "verified" | "needs_review" | "flagged";

export type EntrySource =
  | "manual"
  | "receipt_ocr"
  | "sms_parse"
  | "screenshot_ocr"
  | "csv_import"
  | "recurring_confirmed";

export type PaymentMethod =
  | "credit_card"
  | "debit_card"
  | "bank_transfer"
  | "cash"
  | "apple_pay"
  | "samsung_pay"
  | "direct_debit";

export type IncomeKind =
  | "salary"
  | "bonus"
  | "reimbursement"
  | "freelance"
  | "investment"
  | "other";

export type AccountType =
  | "checking"
  | "savings"
  | "salary"
  | "wallet"
  | "cash";

export type CardType = "debit" | "credit" | "prepaid";

export type CardNetwork =
  | "Visa"
  | "Mastercard"
  | "Amex"
  | "Jaywan"
  | "UnionPay"
  | "Other";

export type StatementStatus =
  | "upcoming"
  | "due_soon"
  | "overdue"
  | "partially_paid"
  | "paid";

export type ExtractionSourceType =
  | "receipt_camera"
  | "receipt_upload"
  | "sms_text"
  | "screenshot_ocr"
  | "csv_statement";

export type ExtractionJobStatus =
  | "pending"
  | "processing"
  | "needs_review"
  | "confirmed"
  | "failed";

export type ReceiptRetentionPolicy =
  | "delete_with_transaction"
  | "retain_archive_90d"
  | "retain_indefinitely";

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  default_currency: string;
  timezone: string;
  monthly_salary: number; // Stored in AED decimal (2 places), calculated via integer fils
  salary_payment_day: number;
  monthly_savings_target: number;
  opening_balance_verified: boolean;
  receipt_retention_policy: ReceiptRetentionPolicy;
  is_demo_mode?: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinancialAccount {
  id: string;
  user_id: string;
  display_name: string;
  bank_name: string;
  account_type: AccountType;
  currency: string;
  last_four: string | null;
  nickname: string | null;
  opening_balance: number;
  manual_balance: number | null;
  is_manual_balance_verified: boolean;
  balance_updated_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardRecord {
  id: string;
  user_id: string;
  linked_account_id: string | null;
  display_name: string;
  bank_name: string;
  card_type: CardType;
  card_network: CardNetwork;
  currency: string;
  last_four: string; // Strictly 4 digits only
  nickname: string | null;
  credit_limit: number | null;
  billing_cycle_closing_day: number | null;
  payment_due_day: number | null;
  due_date_rule_days_after_close: number | null;
  minimum_payment_percent: number | null;
  minimum_payment_fixed: number | null;
  statement_balance: number;
  current_outstanding_balance: number;
  opening_balance: number;
  is_balance_manual: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryRecord {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  kind: "expense" | "income" | "transfer" | "repayment";
  color: string;
  icon: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface ReceiptRecord {
  id: string;
  user_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  file_size_bytes: number;
  sha256_hash: string | null;
  source_kind:
    | "receipt_photo"
    | "gallery_upload"
    | "screenshot"
    | "statement_attachment";
  preview_data_url?: string; // Available via signed URL endpoint only
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExtractedTransactionCandidate {
  id: string;
  merchant: string;
  transaction_date: string;
  transaction_time: string | null;
  amount: number;
  currency: string;
  vat_amount: number | null;
  reference_number: string | null;
  payment_method: PaymentMethod;
  card_network: CardNetwork | null;
  card_last_four: string | null;
  merchant_location: string | null;
  category_name: string;
  transaction_type: TransactionType;
  status: TransactionStatus;
  line_items: ReceiptLineItem[];
  notes: string | null;
  confidence: {
    merchant: number;
    amount: number;
    date: number;
    currency: number;
    overall: number;
  };
  flagged_fields: string[];
  duplicate_of_id?: string | null;
}

export interface ExtractionJob {
  id: string;
  user_id: string;
  receipt_id: string | null;
  source_type: ExtractionSourceType;
  status: ExtractionJobStatus;
  raw_input_preview: string | null;
  candidates: ExtractedTransactionCandidate[];
  flagged_fields: string[];
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface TransactionRecord {
  id: string;
  user_id: string;
  transaction_type: TransactionType;
  status: TransactionStatus;
  verification_status: VerificationStatus;
  entry_source: EntrySource;
  amount: number;
  currency: string;
  vat_amount: number | null;
  merchant: string;
  merchant_location: string | null;
  category_id: string | null;
  category_name: string;
  subcategory_name: string | null;
  transaction_date: string; // YYYY-MM-DD in Asia/Dubai
  transaction_time: string | null; // HH:mm
  occurred_at: string;
  payment_method: PaymentMethod;
  account_id: string | null;
  card_id: string | null;
  target_card_id: string | null; // Used when transaction_type === 'cc_repayment'
  target_account_id: string | null; // Used when transaction_type === 'transfer'
  reference_number: string | null;
  receipt_id: string | null;
  extraction_job_id: string | null;
  income_kind: IncomeKind | null;
  tags: string[];
  line_items: ReceiptLineItem[];
  notes: string | null;
  duplicate_fingerprint: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetRecord {
  id: string;
  user_id: string;
  month_key: string; // YYYY-MM
  category_id: string | null;
  category_name: string;
  is_overall: boolean;
  limit_amount: number;
  currency: string;
  alert_thresholds: number[]; // e.g., [50, 75, 90, 100]
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringTransactionRecord {
  id: string;
  user_id: string;
  name: string;
  kind: "expense" | "income";
  amount: number;
  currency: string;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  category_id: string | null;
  category_name: string;
  account_id: string | null;
  card_id: string | null;
  reminder_days_before: number[];
  auto_create_draft: boolean;
  is_active: boolean;
  last_confirmed_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditCardStatementRecord {
  id: string;
  user_id: string;
  card_id: string;
  statement_period_label: string;
  period_start_date: string;
  closing_date: string;
  payment_due_date: string;
  statement_balance: number;
  minimum_payment: number;
  amount_paid: number;
  outstanding_balance: number;
  status: StatementStatus;
  statement_receipt_id: string | null;
  is_manual_entry: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditCardPaymentRecord {
  id: string;
  user_id: string;
  card_id: string;
  statement_id: string | null;
  source_account_id: string | null;
  linked_transaction_id: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type LoanType =
  | "personal_loan"
  | "auto_loan"
  | "home_mortgage"
  | "bnpl_installment"
  | "card_installment_plan";

export type LoanStatus = "active" | "overdue" | "paid_off";

export interface LoanRecord {
  id: string;
  user_id: string;
  loan_name: string;
  lender_name: string;
  loan_type: LoanType;
  currency: string;
  principal_amount: number;
  outstanding_principal: number;
  interest_rate_apr: number;
  monthly_emi: number;
  total_installments: number;
  paid_installments: number;
  remaining_installments: number;
  start_date: string;
  next_payment_due_date: string;
  due_day_of_month: number;
  linked_account_id: string | null;
  linked_card_id: string | null;
  status: LoanStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanPaymentRecord {
  id: string;
  user_id: string;
  loan_id: string;
  source_account_id: string | null;
  linked_transaction_id: string | null;
  amount: number;
  principal_component: number;
  interest_component: number;
  currency: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferenceRecord {
  id: string;
  user_id: string;
  cc_due_reminder_days: number[];
  recurring_reminder_days: number[];
  budget_warning_thresholds: number[];
  enable_in_app: boolean;
  enable_browser_push: boolean;
  notify_failed_extractions: boolean;
  notify_overdue_bills: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  kind:
    | "cc_upcoming"
    | "cc_overdue"
    | "budget_threshold"
    | "extraction_failed"
    | "recurring_due"
    | "security_info";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action:
    | "create"
    | "update"
    | "delete"
    | "confirm_extraction"
    | "export"
    | "repayment";
  summary: string;
  created_at: string;
}

export interface UserFinancialState {
  profile: UserProfile;
  accounts: FinancialAccount[];
  cards: CardRecord[];
  categories: CategoryRecord[];
  transactions: TransactionRecord[];
  budgets: BudgetRecord[];
  recurring: RecurringTransactionRecord[];
  statements: CreditCardStatementRecord[];
  cc_payments: CreditCardPaymentRecord[];
  loans: LoanRecord[];
  loan_payments: LoanPaymentRecord[];
  receipts: ReceiptRecord[];
  extraction_jobs: ExtractionJob[];
  notification_preferences: NotificationPreferenceRecord;
  notifications: NotificationItem[];
  audit_logs: AuditLogItem[];
}
