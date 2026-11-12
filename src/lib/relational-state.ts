import type { PoolClient } from "pg";
import { UserFinancialState } from "./types";

/**
 * Maps UserFinancialState <-> relational tables (db/schema.sql).
 * Each state key is one table; list order is kept in sort_order.
 */
interface TableSpec {
  key: keyof UserFinancialState;
  table: string;
  single?: boolean; // profile / notification_preferences are one object, not a list
  cols: string[]; // excludes user_id and sort_order
  json?: string[]; // JSONB columns (serialized explicitly)
}

// Fields that exist on records but are intentionally not persisted.
const TRANSIENT_FIELDS = new Set(["preview_data_url"]);

const SPECS: TableSpec[] = [
  {
    key: "profile", table: "profiles", single: true,
    cols: ["id", "full_name", "email", "default_currency", "timezone", "monthly_salary", "salary_payment_day",
      "monthly_savings_target", "opening_balance_verified", "receipt_retention_policy", "is_demo_mode",
      "created_at", "updated_at"],
  },
  {
    key: "accounts", table: "financial_accounts",
    cols: ["id", "display_name", "bank_name", "account_type", "currency", "last_four", "nickname",
      "opening_balance", "manual_balance", "is_manual_balance_verified", "balance_updated_at", "is_active",
      "notes", "created_at", "updated_at"],
  },
  {
    key: "cards", table: "cards",
    cols: ["id", "linked_account_id", "display_name", "bank_name", "card_type", "card_network", "currency",
      "last_four", "nickname", "credit_limit", "billing_cycle_closing_day", "payment_due_day",
      "due_date_rule_days_after_close", "minimum_payment_percent", "minimum_payment_fixed", "statement_balance",
      "current_outstanding_balance", "opening_balance", "is_balance_manual", "is_active", "notes",
      "created_at", "updated_at"],
  },
  {
    key: "categories", table: "categories",
    cols: ["id", "name", "slug", "parent_id", "kind", "color", "icon", "is_system", "created_at", "updated_at"],
  },
  {
    key: "receipts", table: "receipts",
    cols: ["id", "storage_bucket", "storage_path", "file_name", "mime_type", "file_size_bytes", "sha256_hash",
      "source_kind", "is_archived", "created_at", "updated_at"],
  },
  {
    key: "extraction_jobs", table: "extraction_jobs",
    cols: ["id", "receipt_id", "source_type", "status", "raw_input_preview", "candidates", "flagged_fields",
      "error_message", "retry_count", "created_at", "updated_at"],
    json: ["candidates"],
  },
  {
    key: "transactions", table: "transactions",
    cols: ["id", "transaction_type", "status", "verification_status", "entry_source", "amount", "currency",
      "vat_amount", "merchant", "merchant_location", "category_id", "category_name", "subcategory_name",
      "transaction_date", "transaction_time", "occurred_at", "payment_method", "account_id", "card_id",
      "target_card_id", "target_account_id", "reference_number", "receipt_id", "extraction_job_id",
      "income_kind", "tags", "line_items", "notes", "duplicate_fingerprint", "created_at", "updated_at"],
    json: ["line_items"],
  },
  {
    key: "budgets", table: "budgets",
    cols: ["id", "month_key", "category_id", "category_name", "is_overall", "limit_amount", "currency",
      "alert_thresholds", "notes", "created_at", "updated_at"],
  },
  {
    key: "recurring", table: "recurring_transactions",
    cols: ["id", "name", "kind", "amount", "currency", "frequency", "start_date", "end_date", "next_due_date",
      "category_id", "category_name", "account_id", "card_id", "reminder_days_before", "auto_create_draft",
      "is_active", "last_confirmed_date", "notes", "created_at", "updated_at"],
  },
  {
    key: "statements", table: "credit_card_statements",
    cols: ["id", "card_id", "statement_period_label", "period_start_date", "closing_date", "payment_due_date",
      "statement_balance", "minimum_payment", "amount_paid", "outstanding_balance", "status",
      "statement_receipt_id", "is_manual_entry", "notes", "created_at", "updated_at"],
  },
  {
    key: "cc_payments", table: "credit_card_payments",
    cols: ["id", "card_id", "statement_id", "source_account_id", "linked_transaction_id", "amount", "currency",
      "payment_date", "reference_number", "notes", "created_at", "updated_at"],
  },
  {
    key: "loans", table: "loans",
    cols: ["id", "loan_name", "lender_name", "loan_type", "currency", "principal_amount", "outstanding_principal",
      "interest_rate_apr", "monthly_emi", "total_installments", "paid_installments", "remaining_installments",
      "start_date", "next_payment_due_date", "due_day_of_month", "linked_account_id", "linked_card_id",
      "status", "notes", "created_at", "updated_at"],
  },
  {
    key: "loan_payments", table: "loan_payments",
    cols: ["id", "loan_id", "source_account_id", "linked_transaction_id", "amount", "principal_component",
      "interest_component", "currency", "payment_date", "reference_number", "notes", "created_at", "updated_at"],
  },
  {
    key: "notification_preferences", table: "notification_preferences", single: true,
    cols: ["id", "cc_due_reminder_days", "recurring_reminder_days", "budget_warning_thresholds", "enable_in_app",
      "enable_browser_push", "notify_failed_extractions", "notify_overdue_bills", "created_at", "updated_at"],
  },
  {
    key: "notifications", table: "notifications",
    cols: ["id", "kind", "severity", "title", "message", "action_url", "is_read", "created_at"],
  },
  {
    key: "audit_logs", table: "audit_logs",
    cols: ["id", "entity_type", "entity_id", "action", "summary", "created_at"],
  },
];

type Row = Record<string, unknown>;

function rowsOf(state: UserFinancialState | null, spec: TableSpec): Row[] {
  if (!state) return [];
  const value = state[spec.key] as unknown;
  if (spec.single) return value ? [value as Row] : [];
  return (value as Row[] | undefined) ?? [];
}

/** Stable JSON (sorted object keys) so JSONB key reordering doesn't count as a change. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Row;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Column values in spec.cols order, with sort_order counted from the end of the list. */
function project(spec: TableSpec, row: Row, index: number, length: number): unknown[] {
  for (const k of Object.keys(row)) {
    if (k !== "user_id" && row[k] !== undefined && !TRANSIENT_FIELDS.has(k) && !spec.cols.includes(k)) {
      throw new Error(`Field ${spec.table}.${k} has no column; add it to db/schema.sql and relational-state.ts`);
    }
  }
  return [length - 1 - index, ...spec.cols.map((c) => row[c] ?? null)];
}

export async function loadState(
  client: PoolClient,
  userId: string
): Promise<UserFinancialState | null> {
  const state: Record<string, unknown> = {};
  for (const spec of SPECS) {
    const { rows } = await client.query(
      `SELECT ${spec.cols.join(", ")} FROM ${spec.table} WHERE user_id = $1 ORDER BY sort_order DESC, id`,
      [userId]
    );
    const records = rows.map((r: Row) => {
      const rec: Row = { ...r, user_id: userId };
      if (spec.key === "profile" && rec.is_demo_mode === null) delete rec.is_demo_mode;
      return rec;
    });
    if (spec.single) {
      if (records.length === 0) return null;
      state[spec.key] = records[0];
    } else {
      state[spec.key] = records;
    }
  }
  return state as unknown as UserFinancialState;
}

const MAX_ROWS_PER_INSERT = 500;

/** Writes the difference between `before` (what the DB holds) and `after` for one user. */
export async function syncState(
  client: PoolClient,
  userId: string,
  before: UserFinancialState | null,
  after: UserFinancialState
): Promise<void> {
  for (const spec of SPECS) {
    const oldRows = rowsOf(before, spec);
    const newRows = rowsOf(after, spec);

    const oldById = new Map<string, string>();
    oldRows.forEach((r, i) =>
      oldById.set(String(r.id), stableStringify(project(spec, r, i, oldRows.length)))
    );
    const newIds = new Set(newRows.map((r) => String(r.id)));

    const toDelete = [...oldById.keys()].filter((id) => !newIds.has(id));
    if (toDelete.length > 0) {
      await client.query(`DELETE FROM ${spec.table} WHERE user_id = $1 AND id = ANY($2)`, [userId, toDelete]);
    }

    const changed: unknown[][] = [];
    newRows.forEach((r, i) => {
      const values = project(spec, r, i, newRows.length);
      if (oldById.get(String(r.id)) !== stableStringify(values)) changed.push(values);
    });

    for (let start = 0; start < changed.length; start += MAX_ROWS_PER_INSERT) {
      await upsertRows(client, spec, userId, changed.slice(start, start + MAX_ROWS_PER_INSERT));
    }
  }
}

async function upsertRows(client: PoolClient, spec: TableSpec, userId: string, rows: unknown[][]) {
  const columns = ["user_id", "sort_order", ...spec.cols];
  const params: unknown[] = [];
  const tuples = rows.map((values) => {
    const placeholders = [userId, ...values].map((v, idx) => {
      const col = columns[idx];
      params.push(spec.json?.includes(col) ? JSON.stringify(v) : v);
      return `$${params.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const updates = columns
    .filter((c) => c !== "id" && c !== "user_id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  const result = await client.query(
    `INSERT INTO ${spec.table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}
     ON CONFLICT (id) DO UPDATE SET ${updates}
     WHERE ${spec.table}.user_id = EXCLUDED.user_id`,
    params
  );
  // A skipped row means the id belongs to another user: refuse rather than silently drop it.
  if (result.rowCount !== rows.length) {
    throw new Error(`Refused to write ${spec.table} rows owned by another user`);
  }
}
