# DirhamPulse — UAE Mobile-First Personal Finance & Expense Management Portal

A production-minded, mobile-first personal finance tracking application engineered for personal expense management in the United Arab Emirates (**AED / UAE Dirham**, **Asia/Dubai UTC+4 timezone**).

---

## 1. Architecture & Key Capabilities

### Multi-Channel Expense Recording (`Upload/Paste → Extract → Validate → Review → Edit → Confirm → Save`)
1. **Receipt Camera & Photo Upload**: Capture receipts directly from a mobile camera (`capture="environment"`) or upload JPEG/PNG/WebP/PDF receipts. Extracts merchant, transaction date/time, total AED amount, 5% UAE VAT, TRN/receipt reference, card network & last 4 digits, location, line items, and suggested category.
2. **Bank SMS, WhatsApp & Notification Parsing**: Paste transaction alerts from UAE banks (Emirates NBD, ADCB, FAB, Wio, Mashreq, Liv, DIB, etc.). Supports approvals, declined alerts, refunds, reversals, and credit card repayments. Sanitizes untrusted message input and never executes instructions embedded in pasted text.
3. **Screenshot Multi-Transaction Extraction**: Upload screenshots from banking apps, credit card apps, SMS conversations, or WhatsApp histories to extract multiple rows into an interactive review table with duplicate detection before importing.
4. **Fast Manual Entry**: Mobile-optimized form supporting `expense`, `income`, `transfer`, `refund`, and `cc_repayment` transaction types.
5. **CSV Statement Import**: Parse bank or credit card CSV statements into the review workbench with duplicate detection.

### Transparent Accounting & Anti-Double-Counting Engine (`src/lib/money.ts`)
- **Exact Integer Fils Math**: All monetary values are stored as `NUMERIC(14, 2)` in PostgreSQL and computed in integer fils (`1 AED = 100 fils`) on the server and client to eliminate IEEE-754 floating-point drift.
- **No Double Counting of Credit Card Repayments**:
  1. Credit card purchases (`transaction_type = 'expense'`, `payment_method = 'credit_card'`) count toward monthly spending on the purchase date and increase the card's outstanding balance.
  2. Credit card bill repayments (`transaction_type = 'cc_repayment'`) transfer funds from a bank account to settle credit card liability and statement balances—they are **never** counted a second time as an expense.
  3. Refunds (`transaction_type = 'refund'`) and reversals reduce net expenses rather than inflating income.
  4. Scheduled recurring items and declined transactions are never counted in confirmed spending until explicitly confirmed.
- **Formulas**:
  - `Monthly Remaining Income = Recorded Income − Net Confirmed Expenses`
  - `Budget Remaining = Monthly/Category Budget − Net Applicable Expenses`
  - `Estimated Available Funds = Recorded Opening Bank Funds + Income − Net Expenses − Unpaid Prior-Period Statement Obligations`
  - Actual bank balances are clearly distinguished from calculated estimates.

### Security & Privacy Controls
- **Row-Level Security (RLS)**: All 14 PostgreSQL tables (`profiles`, `financial_accounts`, `cards`, `categories`, `receipts`, `extraction_jobs`, `transactions`, `budgets`, `recurring_transactions`, `credit_card_statements`, `credit_card_payments`, `notification_preferences`, `notifications`, `audit_logs`) enforce `auth.uid() = user_id`.
- **Card Credential Protection**: Zod schemas and database `CHECK (last_four ~ '^[0-9]{4}$')` constraints strictly forbid storing full 13–19 digit card numbers (PAN), CVV, PIN, banking passwords, or OTPs.
- **Private Receipt Storage & Signed URLs**: Receipts are stored in a private bucket (`receipts`) scoped to `<user_id>/<filename>`. Viewing a receipt generates a short-lived HMAC-signed URL (`/api/receipts/[id]?token=...`) that verifies both signature expiration and `user_id` ownership.
- **File Content Validation**: Uploads are restricted to `image/jpeg`, `image/png`, `image/webp`, and `application/pdf` up to 10 MB, with magic header byte verification (`validateUploadedFileBytes`) to reject spoofed executables.
- **Rate Limiting**: OCR and extraction endpoints (`/api/extract`) enforce per-user sliding-window rate limits.

---

## 2. Prerequisites & Local Development

### Prerequisites
- **Node.js**: v20.x or v22.x+
- **npm**: v10+
- **Supabase Project** (optional for local development: the app includes a built-in server-side persistent store fallback in `.data/finance-store.json` so all workflows work immediately out of the box, and connects to Supabase PostgreSQL + Auth + Storage when `.env.local` is configured).

### Installation & Running Locally
```bash
# 1. Install dependencies
npm install

# 2. Copy environment variable template
cp .env.example .env.local

# 3. Start the development server (runs on http://127.0.0.1:43120)
npm run dev
```

---

## 3. Supabase Setup & Database Migrations

1. Create a new project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Copy your Project URL, Anon Key, and Service Role Key into `.env.local`.
3. Apply the SQL schema and RLS migration located at `supabase/migrations/20261026000001_initial_schema.sql`:
   ```bash
   # Using Supabase CLI:
   npx supabase db push

   # Or paste the contents of supabase/migrations/20261026000001_initial_schema.sql
   # directly into the Supabase SQL Editor and click Run.
   ```
4. The migration automatically creates the private `receipts` storage bucket (`public = false`, 10 MB limit, allowed MIME types `image/jpeg`, `image/png`, `image/webp`, `application/pdf`) along with folder-level RLS policies restricting access to `auth.uid()`.

---

## 4. Receipt Retention Policies

In **Settings → Receipt Image Retention Policy**, you can configure what happens to stored receipt images when a transaction is deleted:
- `delete_with_transaction` *(Default)*: Immediately deletes the linked receipt object when its transaction is deleted.
- `retain_archive_90d`: Marks the receipt record as archived (`is_archived = true`) for 90-day retention before purge.
- `retain_indefinitely`: Keeps the receipt in the private vault until manually deleted or until the user deletes their account.

---

## 5. Testing, Linting & Production Build

```bash
# Run unit & integration tests (Vitest)
npm test

# Run TypeScript type checking
npm run typecheck

# Run ESLint
npm run lint

# Build for production
npm run build

# Run Playwright end-to-end tests (with dev server running on port 43120)
npm run test:e2e
```

---

## 6. Backup, Export & Restore Instructions

### In-App Export & Account Deletion
- **CSV Export**: Export filtered or bulk-selected transactions from **Transactions → Export CSV**, or export monthly analytical summaries from **Reports → Export Report CSV**.
- **Full JSON Vault Backup**: Go to **Settings → Export Full Financial Backup (JSON)** to download a complete snapshot of your profile, accounts, cards, transactions, statements, budgets, and recurring schedules.
- **Account & Data Deletion**: Go to **Settings → Delete Account & All Data** to permanently delete your profile, financial records, and stored receipt blobs.

### PostgreSQL Database Backup & Restore (Supabase)
```bash
# Backup PostgreSQL database
pg_dump --clean --if-exists --quote-all-identifiers \
  --dbname="$SUPABASE_DB_URL" \
  --file="dirhampulse_backup_$(date +%Y%m%d).sql"

# Restore PostgreSQL database
psql "$SUPABASE_DB_URL" --file="dirhampulse_backup_YYYYMMDD.sql"
```
