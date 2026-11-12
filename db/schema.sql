-- =============================================================================
-- DirhamPulse — plain PostgreSQL schema (self-hosted, no Supabase)
-- Applied automatically by the app on startup (src/lib/db.ts); safe to re-run.
-- Money: NUMERIC(14, 2). IDs: TEXT (the app generates ids such as "tx_ab12cd").
-- Every row carries user_id; the app scopes every query by it.
-- Intra-entity foreign keys are DEFERRABLE INITIALLY DEFERRED so a whole user
-- state can be written in one transaction regardless of row order.
-- sort_order preserves the app's list order (counted from the end of the list,
-- loaded with ORDER BY sort_order DESC).
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  default_currency TEXT NOT NULL CHECK (char_length(default_currency) = 3),
  timezone TEXT NOT NULL,
  monthly_salary NUMERIC(14, 2) NOT NULL CHECK (monthly_salary >= 0),
  salary_payment_day INTEGER NOT NULL CHECK (salary_payment_day BETWEEN 1 AND 31),
  monthly_savings_target NUMERIC(14, 2) NOT NULL CHECK (monthly_savings_target >= 0),
  opening_balance_verified BOOLEAN NOT NULL,
  receipt_retention_policy TEXT NOT NULL
    CHECK (receipt_retention_policy IN ('delete_with_transaction', 'retain_archive_90d', 'retain_indefinitely')),
  is_demo_mode BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  display_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('checking', 'savings', 'salary', 'wallet', 'cash')),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  last_four TEXT CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$'),
  nickname TEXT,
  opening_balance NUMERIC(14, 2) NOT NULL,
  manual_balance NUMERIC(14, 2),
  is_manual_balance_verified BOOLEAN NOT NULL,
  balance_updated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Never stores full PAN, CVV, PIN or OTP: last_four must be exactly 4 digits.
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  linked_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  display_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('debit', 'credit', 'prepaid')),
  card_network TEXT NOT NULL CHECK (card_network IN ('Visa', 'Mastercard', 'Amex', 'Jaywan', 'UnionPay', 'Other')),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  last_four TEXT NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
  nickname TEXT,
  credit_limit NUMERIC(14, 2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  billing_cycle_closing_day INTEGER CHECK (billing_cycle_closing_day IS NULL OR billing_cycle_closing_day BETWEEN 1 AND 31),
  payment_due_day INTEGER CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31),
  due_date_rule_days_after_close INTEGER CHECK (due_date_rule_days_after_close IS NULL OR due_date_rule_days_after_close BETWEEN 1 AND 60),
  minimum_payment_percent NUMERIC(5, 2) CHECK (minimum_payment_percent IS NULL OR (minimum_payment_percent >= 0 AND minimum_payment_percent <= 100)),
  minimum_payment_fixed NUMERIC(14, 2) CHECK (minimum_payment_fixed IS NULL OR minimum_payment_fixed >= 0),
  statement_balance NUMERIC(14, 2) NOT NULL,
  current_outstanding_balance NUMERIC(14, 2) NOT NULL,
  opening_balance NUMERIC(14, 2) NOT NULL,
  is_balance_manual BOOLEAN NOT NULL,
  is_active BOOLEAN NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer', 'repayment')),
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_system BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, slug)
);

-- Receipt metadata. The image itself lives in receipt_blobs.
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  sha256_hash TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('receipt_photo', 'gallery_upload', 'screenshot', 'statement_attachment')),
  is_archived BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Private receipt images (data URLs). Written before the receipt row exists,
-- so there is no foreign key to receipts.
CREATE TABLE IF NOT EXISTS receipt_blobs (
  receipt_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  data_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extraction_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  receipt_id TEXT REFERENCES receipts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  source_type TEXT NOT NULL CHECK (source_type IN ('receipt_camera', 'receipt_upload', 'sms_text', 'screenshot_ocr', 'csv_statement')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'needs_review', 'confirmed', 'failed')),
  raw_input_preview TEXT,
  candidates JSONB NOT NULL,
  flagged_fields TEXT[] NOT NULL,
  error_message TEXT,
  retry_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('expense', 'income', 'transfer', 'refund', 'cc_repayment')),
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'pending', 'declined', 'reversed')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'needs_review', 'flagged')),
  entry_source TEXT NOT NULL CHECK (entry_source IN ('manual', 'receipt_ocr', 'sms_parse', 'screenshot_ocr', 'csv_import', 'recurring_confirmed')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  vat_amount NUMERIC(14, 2) CHECK (vat_amount IS NULL OR vat_amount >= 0),
  merchant TEXT NOT NULL,
  merchant_location TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  category_name TEXT NOT NULL,
  subcategory_name TEXT,
  transaction_date DATE NOT NULL,
  transaction_time TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('credit_card', 'debit_card', 'bank_transfer', 'cash', 'apple_pay', 'samsung_pay', 'direct_debit')),
  account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  card_id TEXT REFERENCES cards(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  target_card_id TEXT REFERENCES cards(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  target_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  reference_number TEXT,
  receipt_id TEXT REFERENCES receipts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  extraction_job_id TEXT REFERENCES extraction_jobs(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  income_kind TEXT CHECK (income_kind IS NULL OR income_kind IN ('salary', 'bonus', 'reimbursement', 'freelance', 'investment', 'other')),
  tags TEXT[] NOT NULL,
  line_items JSONB NOT NULL,
  notes TEXT,
  duplicate_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  month_key TEXT NOT NULL CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  category_name TEXT NOT NULL,
  is_overall BOOLEAN NOT NULL,
  limit_amount NUMERIC(14, 2) NOT NULL CHECK (limit_amount >= 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  alert_thresholds INTEGER[] NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, month_key, category_name)
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  category_name TEXT NOT NULL,
  account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  card_id TEXT REFERENCES cards(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  reminder_days_before INTEGER[] NOT NULL,
  auto_create_draft BOOLEAN NOT NULL,
  is_active BOOLEAN NOT NULL,
  last_confirmed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_card_statements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  statement_period_label TEXT NOT NULL,
  period_start_date DATE NOT NULL,
  closing_date DATE NOT NULL,
  payment_due_date DATE NOT NULL,
  statement_balance NUMERIC(14, 2) NOT NULL CHECK (statement_balance >= 0),
  minimum_payment NUMERIC(14, 2) NOT NULL CHECK (minimum_payment >= 0),
  amount_paid NUMERIC(14, 2) NOT NULL CHECK (amount_paid >= 0),
  outstanding_balance NUMERIC(14, 2) NOT NULL CHECK (outstanding_balance >= 0),
  status TEXT NOT NULL CHECK (status IN ('upcoming', 'due_soon', 'overdue', 'partially_paid', 'paid')),
  statement_receipt_id TEXT REFERENCES receipts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  is_manual_entry BOOLEAN NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_card_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  statement_id TEXT REFERENCES credit_card_statements(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  source_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  linked_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  payment_date DATE NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  loan_name TEXT NOT NULL,
  lender_name TEXT NOT NULL,
  loan_type TEXT NOT NULL
    CHECK (loan_type IN ('personal_loan', 'auto_loan', 'home_mortgage', 'bnpl_installment', 'card_installment_plan')),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  principal_amount NUMERIC(14, 2) NOT NULL CHECK (principal_amount >= 0),
  outstanding_principal NUMERIC(14, 2) NOT NULL CHECK (outstanding_principal >= 0),
  interest_rate_apr NUMERIC(5, 2) NOT NULL CHECK (interest_rate_apr >= 0),
  monthly_emi NUMERIC(14, 2) NOT NULL CHECK (monthly_emi >= 0),
  total_installments INTEGER NOT NULL CHECK (total_installments >= 1),
  paid_installments INTEGER NOT NULL CHECK (paid_installments >= 0),
  remaining_installments INTEGER NOT NULL CHECK (remaining_installments >= 0),
  start_date DATE NOT NULL,
  next_payment_due_date DATE NOT NULL,
  due_day_of_month INTEGER NOT NULL CHECK (due_day_of_month BETWEEN 1 AND 31),
  linked_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  linked_card_id TEXT REFERENCES cards(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  status TEXT NOT NULL CHECK (status IN ('active', 'overdue', 'paid_off')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  source_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  linked_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  principal_component NUMERIC(14, 2) NOT NULL CHECK (principal_component >= 0),
  interest_component NUMERIC(14, 2) NOT NULL CHECK (interest_component >= 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  payment_date DATE NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  cc_due_reminder_days INTEGER[] NOT NULL,
  recurring_reminder_days INTEGER[] NOT NULL,
  budget_warning_thresholds INTEGER[] NOT NULL,
  enable_in_app BOOLEAN NOT NULL,
  enable_browser_push BOOLEAN NOT NULL,
  notify_failed_extractions BOOLEAN NOT NULL,
  notify_overdue_bills BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('cc_upcoming', 'cc_overdue', 'budget_threshold', 'extraction_failed', 'recurring_due', 'security_info')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  is_read BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'confirm_extraction', 'export', 'repayment')),
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON financial_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipt_blobs_user ON receipt_blobs(user_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_user ON extraction_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_fp ON transactions(user_id, duplicate_fingerprint);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month_key);
CREATE INDEX IF NOT EXISTS idx_recurring_user_due ON recurring_transactions(user_id, next_due_date);
CREATE INDEX IF NOT EXISTS idx_statements_user_due ON credit_card_statements(user_id, payment_due_date);
CREATE INDEX IF NOT EXISTS idx_cc_payments_user ON credit_card_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_user_due ON loans(user_id, next_payment_due_date);
CREATE INDEX IF NOT EXISTS idx_loan_payments_user ON loan_payments(user_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
