-- =============================================================================
-- UAE Personal Finance Tracker — Normalized PostgreSQL Schema & RLS Policies
-- Default Currency: AED (UAE Dirham) | Default Timezone: Asia/Dubai (UTC+4)
-- Money stored as exact NUMERIC(14, 2) (fils-level precision, no float drift)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function for auto-updating updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'UAE Resident',
  email TEXT,
  default_currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(default_currency) = 3),
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  monthly_salary NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (monthly_salary >= 0),
  salary_payment_day INTEGER NOT NULL DEFAULT 28 CHECK (salary_payment_day BETWEEN 1 AND 31),
  monthly_savings_target NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (monthly_savings_target >= 0),
  opening_balance_verified BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_retention_policy TEXT NOT NULL DEFAULT 'delete_with_transaction'
    CHECK (receipt_retention_policy IN ('delete_with_transaction', 'retain_archive_90d', 'retain_indefinitely')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. financial_accounts (Bank accounts, salary accounts, savings, wallets, cash)
CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('checking', 'savings', 'salary', 'wallet', 'cash')),
  currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  last_four TEXT CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$'),
  nickname TEXT,
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  manual_balance NUMERIC(14, 2),
  is_manual_balance_verified BOOLEAN NOT NULL DEFAULT FALSE,
  balance_updated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. cards (Debit cards & Credit cards — NEVER stores full PAN, CVV, PIN, or OTP)
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('debit', 'credit', 'prepaid')),
  card_network TEXT NOT NULL DEFAULT 'Visa' CHECK (card_network IN ('Visa', 'Mastercard', 'Amex', 'Jaywan', 'UnionPay', 'Other')),
  currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  last_four TEXT NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
  nickname TEXT,
  credit_limit NUMERIC(14, 2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  billing_cycle_closing_day INTEGER CHECK (billing_cycle_closing_day IS NULL OR billing_cycle_closing_day BETWEEN 1 AND 31),
  payment_due_day INTEGER CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31),
  due_date_rule_days_after_close INTEGER CHECK (due_date_rule_days_after_close IS NULL OR due_date_rule_days_after_close BETWEEN 1 AND 60),
  minimum_payment_percent NUMERIC(5, 2) DEFAULT 5.00 CHECK (minimum_payment_percent IS NULL OR (minimum_payment_percent >= 0 AND minimum_payment_percent <= 100)),
  minimum_payment_fixed NUMERIC(14, 2) DEFAULT 100.00 CHECK (minimum_payment_fixed IS NULL OR minimum_payment_fixed >= 0),
  statement_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  current_outstanding_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  is_balance_manual BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. categories (Standard UAE categories + custom categories & subcategories)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income', 'transfer', 'repayment')),
  color TEXT NOT NULL DEFAULT '#0f766e',
  icon TEXT NOT NULL DEFAULT 'Receipt',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- 5. receipts (Private storage objects metadata — never public URLs)
CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_bucket TEXT NOT NULL DEFAULT 'receipts',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  sha256_hash TEXT,
  source_kind TEXT NOT NULL DEFAULT 'receipt_photo' CHECK (source_kind IN ('receipt_photo', 'gallery_upload', 'screenshot', 'statement_attachment')),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. extraction_jobs (OCR, Vision, SMS/WhatsApp text parsing jobs & retry state)
CREATE TABLE IF NOT EXISTS public.extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES public.receipts(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('receipt_camera', 'receipt_upload', 'sms_text', 'screenshot_ocr', 'csv_statement')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'needs_review', 'confirmed', 'failed')),
  raw_input_preview TEXT,
  extracted_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  flagged_fields TEXT[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. transactions (Unified ledger for expenses, income, transfers, refunds, and credit card repayments)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('expense', 'income', 'transfer', 'refund', 'cc_repayment')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'declined', 'reversed')),
  verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'needs_review', 'flagged')),
  entry_source TEXT NOT NULL DEFAULT 'manual' CHECK (entry_source IN ('manual', 'receipt_ocr', 'sms_parse', 'screenshot_ocr', 'csv_import', 'recurring_confirmed')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  vat_amount NUMERIC(14, 2) DEFAULT 0.00 CHECK (vat_amount IS NULL OR vat_amount >= 0),
  merchant TEXT NOT NULL,
  merchant_location TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL DEFAULT 'Other',
  subcategory_name TEXT,
  transaction_date DATE NOT NULL,
  transaction_time TIME,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_method TEXT NOT NULL DEFAULT 'credit_card' CHECK (payment_method IN ('credit_card', 'debit_card', 'bank_transfer', 'cash', 'apple_pay', 'samsung_pay', 'direct_debit')),
  account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  target_card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  target_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  reference_number TEXT,
  receipt_id UUID REFERENCES public.receipts(id) ON DELETE SET NULL,
  extraction_job_id UUID REFERENCES public.extraction_jobs(id) ON DELETE SET NULL,
  income_kind TEXT CHECK (income_kind IS NULL OR income_kind IN ('salary', 'bonus', 'reimbursement', 'freelance', 'investment', 'other')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  duplicate_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. budgets (Monthly overall + Category-specific budgets with configurable thresholds)
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  is_overall BOOLEAN NOT NULL DEFAULT FALSE,
  limit_amount NUMERIC(14, 2) NOT NULL CHECK (limit_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  alert_thresholds INTEGER[] NOT NULL DEFAULT ARRAY[50, 75, 90, 100],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month_key, category_name)
);

-- 9. recurring_transactions (Scheduled rent, DEWA, e&/du, Salik, subscriptions, salary schedules)
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  reminder_days_before INTEGER[] NOT NULL DEFAULT ARRAY[7, 3, 1],
  auto_create_draft BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_confirmed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. credit_card_statements
CREATE TABLE IF NOT EXISTS public.credit_card_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  statement_period_label TEXT NOT NULL,
  period_start_date DATE NOT NULL,
  closing_date DATE NOT NULL,
  payment_due_date DATE NOT NULL,
  statement_balance NUMERIC(14, 2) NOT NULL CHECK (statement_balance >= 0),
  minimum_payment NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (minimum_payment >= 0),
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
  outstanding_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (outstanding_balance >= 0),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due_soon', 'overdue', 'partially_paid', 'paid')),
  statement_receipt_id UUID REFERENCES public.receipts(id) ON DELETE SET NULL,
  is_manual_entry BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. credit_card_payments (Supports partial & multiple payments against a statement)
CREATE TABLE IF NOT EXISTS public.credit_card_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  statement_id UUID REFERENCES public.credit_card_statements(id) ON DELETE SET NULL,
  source_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  payment_date DATE NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cc_due_reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[7, 3, 1],
  recurring_reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[7, 3, 1],
  budget_warning_thresholds INTEGER[] NOT NULL DEFAULT ARRAY[50, 75, 90, 100],
  enable_in_app BOOLEAN NOT NULL DEFAULT TRUE,
  enable_browser_push BOOLEAN NOT NULL DEFAULT FALSE,
  notify_failed_extractions BOOLEAN NOT NULL DEFAULT TRUE,
  notify_overdue_bills BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. notifications (In-app notification center feed)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cc_upcoming', 'cc_overdue', 'budget_threshold', 'extraction_failed', 'recurring_due', 'security_info')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. audit_logs (Preserves history of financial record changes)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'confirm_extraction', 'export', 'repayment')),
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. loans (Personal loans, auto loans, mortgages, Tabby/Tamara BNPL, and 0% card installment plans)
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_name TEXT NOT NULL,
  lender_name TEXT NOT NULL,
  loan_type TEXT NOT NULL DEFAULT 'personal_loan'
    CHECK (loan_type IN ('personal_loan', 'auto_loan', 'home_mortgage', 'bnpl_installment', 'card_installment_plan')),
  currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  principal_amount NUMERIC(14, 2) NOT NULL CHECK (principal_amount >= 0),
  outstanding_principal NUMERIC(14, 2) NOT NULL CHECK (outstanding_principal >= 0),
  interest_rate_apr NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (interest_rate_apr >= 0),
  monthly_emi NUMERIC(14, 2) NOT NULL CHECK (monthly_emi >= 0),
  total_installments INTEGER NOT NULL DEFAULT 12 CHECK (total_installments >= 1),
  paid_installments INTEGER NOT NULL DEFAULT 0 CHECK (paid_installments >= 0),
  remaining_installments INTEGER NOT NULL DEFAULT 12 CHECK (remaining_installments >= 0),
  start_date DATE NOT NULL,
  next_payment_due_date DATE NOT NULL,
  due_day_of_month INTEGER NOT NULL DEFAULT 1 CHECK (due_day_of_month BETWEEN 1 AND 31),
  linked_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  linked_card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'overdue', 'paid_off')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. loan_payments (Tracks each monthly EMI or early settlement payment against a loan)
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  source_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  principal_component NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (principal_component >= 0),
  interest_component NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (interest_component >= 0),
  currency TEXT NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  payment_date DATE NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON public.transactions(user_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON public.transactions(user_id, category_name);
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_fp ON public.transactions(user_id, duplicate_fingerprint);
CREATE INDEX IF NOT EXISTS idx_cards_user ON public.cards(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON public.financial_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_statements_user_due ON public.credit_card_statements(user_id, payment_due_date ASC);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON public.budgets(user_id, month_key);
CREATE INDEX IF NOT EXISTS idx_recurring_user_due ON public.recurring_transactions(user_id, next_due_date ASC);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_user ON public.extraction_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loans_user_due ON public.loans(user_id, next_payment_due_date ASC);
CREATE INDEX IF NOT EXISTS idx_loan_payments_user ON public.loan_payments(user_id, payment_date DESC);

-- Triggers for updated_at
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_financial_accounts_updated_at BEFORE UPDATE ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cards_updated_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_receipts_updated_at BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_extraction_jobs_updated_at BEFORE UPDATE ON public.extraction_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_budgets_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_recurring_transactions_updated_at BEFORE UPDATE ON public.recurring_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cc_statements_updated_at BEFORE UPDATE ON public.credit_card_statements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cc_payments_updated_at BEFORE UPDATE ON public.credit_card_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_notification_prefs_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_loans_updated_at BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_loan_payments_updated_at BEFORE UPDATE ON public.loan_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row Level Security (RLS) Policies — Strict Per-User Data Isolation
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

-- Policy helper macro per table
CREATE POLICY "Users manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own financial_accounts" ON public.financial_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own cards" ON public.cards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own categories" ON public.categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own receipts" ON public.receipts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own extraction_jobs" ON public.extraction_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own transactions" ON public.transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own budgets" ON public.budgets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own recurring_transactions" ON public.recurring_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own credit_card_statements" ON public.credit_card_statements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own credit_card_payments" ON public.credit_card_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own notification_preferences" ON public.notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own audit_logs" ON public.audit_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own loans" ON public.loans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own loan_payments" ON public.loan_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- Private Supabase Storage Bucket for Receipts & Screenshots
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Storage RLS: Folder path must be `<user_id>/<receipt_filename>`
CREATE POLICY "Authenticated users can upload own receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can view own receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete own receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
