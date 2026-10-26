import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { createInitialUserFinancialState } from "@/lib/default-data";
import { getDubaiMonthKey, getDubaiToday } from "@/lib/dubai-time";
import {
  applyLoanPayment,
  applyStatementPayment,
  calculateCategoryBudgets,
  computeDuplicateFingerprint,
  fromFils,
  toFils,
} from "@/lib/money";
import {
  deleteUserAccountAndData,
  getUserState,
  saveUserState,
} from "@/lib/server-store";
import {
  BudgetRecord,
  CardRecord,
  CategoryRecord,
  CreditCardPaymentRecord,
  CreditCardStatementRecord,
  FinancialAccount,
  LoanPaymentRecord,
  LoanRecord,
  NotificationItem,
  RecurringTransactionRecord,
  TransactionRecord,
} from "@/lib/types";
import {
  budgetInputSchema,
  cardInputSchema,
  ccRepaymentInputSchema,
  financialAccountInputSchema,
  loanInputSchema,
  loanPaymentInputSchema,
  recurringInputSchema,
  statementInputSchema,
  transactionInputSchema,
} from "@/lib/validation";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const state = getUserState(session.userId);
  return NextResponse.json({ session, state });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action as string;
    const nowIso = new Date().toISOString();
    const userId = session.userId;

    // 1. Create single or batch transactions (from manual entry, receipt OCR, SMS, screenshot, CSV)
    if (action === "create_transaction" || action === "batch_create_transactions") {
      const rawItems =
        action === "batch_create_transactions"
          ? (body.transactions as unknown[])
          : [body.transaction];

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return NextResponse.json(
          { error: "No transaction data provided." },
          { status: 400 }
        );
      }

      const allowDuplicate = Boolean(body.allowDuplicate);
      const currentState = getUserState(userId);
      const createdTransactions: TransactionRecord[] = [];

      for (const item of rawItems) {
        const parsed = transactionInputSchema.safeParse(item);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((i) => i.message).join("; ");
          return NextResponse.json({ error: msg }, { status: 400 });
        }

        const data = parsed.data;
        const fp = computeDuplicateFingerprint({
          merchant: data.merchant,
          amount: data.amount,
          transaction_date: data.transaction_date,
          transaction_type: data.transaction_type,
          reference_number: data.reference_number,
        });

        const existingDup = [
          ...currentState.transactions,
          ...createdTransactions,
        ].find((t) => t.duplicate_fingerprint === fp);

        if (existingDup && !allowDuplicate) {
          return NextResponse.json(
            {
              error: `Duplicate transaction detected: ${data.merchant} for ${data.currency} ${data.amount} on ${data.transaction_date}. Confirm duplicate override to save anyway.`,
              duplicateTransactionId: existingDup.id,
              isDuplicateWarning: true,
            },
            { status: 409 }
          );
        }

        const matchedCat = currentState.categories.find(
          (c) => c.name.toLowerCase() === data.category_name.toLowerCase()
        );

        const newTx: TransactionRecord = {
          id: `tx_${crypto.randomBytes(6).toString("hex")}`,
          user_id: userId,
          transaction_type: data.transaction_type,
          status: data.status,
          verification_status: data.verification_status,
          entry_source: data.entry_source,
          amount: fromFils(toFils(data.amount)),
          currency: data.currency,
          vat_amount:
            data.vat_amount !== null && data.vat_amount !== undefined
              ? fromFils(toFils(data.vat_amount))
              : null,
          merchant: data.merchant.trim(),
          merchant_location: data.merchant_location?.trim() || null,
          category_id: matchedCat?.id ?? null,
          category_name: matchedCat?.name ?? data.category_name,
          subcategory_name: data.subcategory_name?.trim() || null,
          transaction_date: data.transaction_date,
          transaction_time: data.transaction_time || null,
          occurred_at: nowIso,
          payment_method: data.payment_method,
          account_id: data.account_id || null,
          card_id: data.card_id || null,
          target_card_id: data.target_card_id || null,
          target_account_id: data.target_account_id || null,
          reference_number: data.reference_number?.trim() || null,
          receipt_id: data.receipt_id || null,
          extraction_job_id: data.extraction_job_id || null,
          income_kind: data.income_kind || null,
          tags: data.tags || [],
          line_items: data.line_items || [],
          notes: data.notes?.trim() || null,
          duplicate_fingerprint: fp,
          created_at: nowIso,
          updated_at: nowIso,
        };

        createdTransactions.push(newTx);
      }

      const extractionJobId = body.extractionJobId as string | undefined;

      const updatedState = saveUserState(userId, (curr) => {
        const nextTransactions = [...createdTransactions, ...curr.transactions];
        const nextJobs = extractionJobId
          ? curr.extraction_jobs.map((j) =>
              j.id === extractionJobId
                ? { ...j, status: "confirmed" as const, updated_at: nowIso }
                : j
            )
          : curr.extraction_jobs;

        // Check if any budget threshold was crossed
        const monthKey = getDubaiMonthKey(createdTransactions[0].transaction_date);
        const budgetProgress = calculateCategoryBudgets(
          monthKey,
          curr.budgets,
          nextTransactions
        );

        const newNotifications: NotificationItem[] = [];
        for (const bp of budgetProgress) {
          if (
            bp.activeThresholdWarning &&
            createdTransactions.some((t) => t.category_name === bp.categoryName)
          ) {
            newNotifications.push({
              id: `notif_${crypto.randomBytes(5).toString("hex")}`,
              user_id: userId,
              kind: "budget_threshold",
              severity: bp.activeThresholdWarning >= 90 ? "critical" : "warning",
              title: `${bp.categoryName} Budget at ${bp.utilizationPct}%`,
              message: `Spent AED ${bp.spentAmount.toFixed(2)} of AED ${bp.limitAmount.toFixed(
                2
              )} (${bp.activeThresholdWarning}% threshold reached).`,
              action_url: "/budgets",
              is_read: false,
              created_at: nowIso,
            });
          }
        }

        return {
          ...curr,
          transactions: nextTransactions,
          extraction_jobs: nextJobs,
          notifications: [...newNotifications, ...curr.notifications].slice(0, 50),
          audit_logs: [
            {
              id: `aud_${crypto.randomBytes(5).toString("hex")}`,
              user_id: userId,
              entity_type: "transaction",
              entity_id: createdTransactions[0].id,
              action: extractionJobId
                ? ("confirm_extraction" as const)
                : ("create" as const),
              summary: `Recorded ${createdTransactions.length} transaction(s): ${createdTransactions
                .map((t) => `${t.merchant} (${t.currency} ${t.amount.toFixed(2)})`)
                .join(", ")}`,
              created_at: nowIso,
            },
            ...curr.audit_logs,
          ].slice(0, 100),
        };
      });

      return NextResponse.json({
        ok: true,
        created: createdTransactions,
        state: updatedState,
      });
    }

    // 2. Update Transaction
    if (action === "update_transaction") {
      const txId = String(body.id || "");
      const parsed = transactionInputSchema.safeParse(body.transaction);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const data = parsed.data;
      const updatedState = saveUserState(userId, (curr) => {
        const existing = curr.transactions.find(
          (t) => t.id === txId && t.user_id === userId
        );
        if (!existing) return curr;

        const updatedTx: TransactionRecord = {
          ...existing,
          ...data,
          amount: fromFils(toFils(data.amount)),
          vat_amount:
            data.vat_amount !== null && data.vat_amount !== undefined
              ? fromFils(toFils(data.vat_amount))
              : null,
          duplicate_fingerprint: computeDuplicateFingerprint({
            merchant: data.merchant,
            amount: data.amount,
            transaction_date: data.transaction_date,
            transaction_type: data.transaction_type,
            reference_number: data.reference_number,
          }),
          updated_at: nowIso,
        };

        return {
          ...curr,
          transactions: curr.transactions.map((t) =>
            t.id === txId ? updatedTx : t
          ),
          audit_logs: [
            {
              id: `aud_${crypto.randomBytes(5).toString("hex")}`,
              user_id: userId,
              entity_type: "transaction",
              entity_id: txId,
              action: "update",
              summary: `Updated transaction ${updatedTx.merchant} (${updatedTx.currency} ${updatedTx.amount.toFixed(
                2
              )})`,
              created_at: nowIso,
            },
            ...curr.audit_logs,
          ],
        };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 3. Delete Transaction(s) — enforces receipt retention policy
    if (action === "delete_transaction" || action === "bulk_delete_transactions") {
      const ids: string[] =
        action === "bulk_delete_transactions"
          ? (body.ids as string[])
          : [String(body.id || "")];

      const updatedState = saveUserState(userId, (curr) => {
        const toDelete = curr.transactions.filter(
          (t) => ids.includes(t.id) && t.user_id === userId
        );
        const receiptIdsToHandle = toDelete
          .map((t) => t.receipt_id)
          .filter((r): r is string => Boolean(r));

        const policy = curr.profile.receipt_retention_policy;
        let nextReceipts = curr.receipts;

        if (policy === "delete_with_transaction") {
          nextReceipts = curr.receipts.filter(
            (r) => !receiptIdsToHandle.includes(r.id)
          );
        } else if (policy === "retain_archive_90d") {
          nextReceipts = curr.receipts.map((r) =>
            receiptIdsToHandle.includes(r.id)
              ? { ...r, is_archived: true, updated_at: nowIso }
              : r
          );
        }

        return {
          ...curr,
          transactions: curr.transactions.filter((t) => !ids.includes(t.id)),
          receipts: nextReceipts,
          audit_logs: [
            {
              id: `aud_${crypto.randomBytes(5).toString("hex")}`,
              user_id: userId,
              entity_type: "transaction",
              entity_id: ids.join(","),
              action: "delete",
              summary: `Deleted ${toDelete.length} transaction(s) (Receipt policy: ${policy})`,
              created_at: nowIso,
            },
            ...curr.audit_logs,
          ],
        };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 4. Create or Update Card
    if (action === "create_card" || action === "update_card") {
      const parsed = cardInputSchema.safeParse(body.card);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const updatedState = saveUserState(userId, (curr) => {
        if (action === "update_card" && body.id) {
          return {
            ...curr,
            cards: curr.cards.map((c) =>
              c.id === body.id && c.user_id === userId
                ? {
                    ...c,
                    ...d,
                    linked_account_id: d.linked_account_id ?? null,
                    nickname: d.nickname ?? null,
                    credit_limit: d.credit_limit ?? null,
                    billing_cycle_closing_day: d.billing_cycle_closing_day ?? null,
                    payment_due_day: d.payment_due_day ?? null,
                    due_date_rule_days_after_close:
                      d.due_date_rule_days_after_close ?? null,
                    minimum_payment_percent: d.minimum_payment_percent ?? null,
                    minimum_payment_fixed: d.minimum_payment_fixed ?? null,
                    notes: d.notes ?? null,
                    updated_at: nowIso,
                  }
                : c
            ),
          };
        }

        const newCard: CardRecord = {
          id: `card_${crypto.randomBytes(6).toString("hex")}`,
          user_id: userId,
          linked_account_id: d.linked_account_id ?? null,
          display_name: d.display_name,
          bank_name: d.bank_name,
          card_type: d.card_type,
          card_network: d.card_network,
          currency: d.currency,
          last_four: d.last_four,
          nickname: d.nickname ?? null,
          credit_limit: d.credit_limit ?? null,
          billing_cycle_closing_day: d.billing_cycle_closing_day ?? null,
          payment_due_day: d.payment_due_day ?? null,
          due_date_rule_days_after_close:
            d.due_date_rule_days_after_close ?? null,
          minimum_payment_percent: d.minimum_payment_percent ?? null,
          minimum_payment_fixed: d.minimum_payment_fixed ?? null,
          statement_balance: fromFils(toFils(d.statement_balance)),
          current_outstanding_balance: fromFils(
            toFils(d.current_outstanding_balance)
          ),
          opening_balance: fromFils(toFils(d.opening_balance)),
          is_balance_manual: d.is_balance_manual,
          is_active: d.is_active,
          notes: d.notes ?? null,
          created_at: nowIso,
          updated_at: nowIso,
        };
        return {
          ...curr,
          cards: [...curr.cards, newCard],
        };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 5. Create or Update Financial Account
    if (action === "create_account" || action === "update_account") {
      const parsed = financialAccountInputSchema.safeParse(body.account);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const updatedState = saveUserState(userId, (curr) => {
        if (action === "update_account" && body.id) {
          return {
            ...curr,
            accounts: curr.accounts.map((a) =>
              a.id === body.id && a.user_id === userId
                ? {
                    ...a,
                    ...d,
                    last_four: d.last_four ?? null,
                    nickname: d.nickname ?? null,
                    manual_balance:
                      d.manual_balance !== undefined && d.manual_balance !== null
                        ? fromFils(toFils(d.manual_balance))
                        : null,
                    balance_updated_at: nowIso,
                    notes: d.notes ?? null,
                    updated_at: nowIso,
                  }
                : a
            ),
          };
        }

        const newAcc: FinancialAccount = {
          id: `acc_${crypto.randomBytes(6).toString("hex")}`,
          user_id: userId,
          display_name: d.display_name,
          bank_name: d.bank_name,
          account_type: d.account_type,
          currency: d.currency,
          last_four: d.last_four ?? null,
          nickname: d.nickname ?? null,
          opening_balance: fromFils(toFils(d.opening_balance)),
          manual_balance:
            d.manual_balance !== undefined && d.manual_balance !== null
              ? fromFils(toFils(d.manual_balance))
              : null,
          is_manual_balance_verified: d.is_manual_balance_verified,
          balance_updated_at: d.is_manual_balance_verified ? nowIso : null,
          is_active: d.is_active,
          notes: d.notes ?? null,
          created_at: nowIso,
          updated_at: nowIso,
        };
        return {
          ...curr,
          accounts: [...curr.accounts, newAcc],
        };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 6. Create or Update Credit Card Statement
    if (action === "create_statement") {
      const parsed = statementInputSchema.safeParse(body.statement);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const today = getDubaiToday();
      const stmtBal = fromFils(toFils(d.statement_balance));
      const paidBal = fromFils(toFils(d.amount_paid));
      const outBal = Math.max(0, fromFils(toFils(stmtBal) - toFils(paidBal)));

      let status: CreditCardStatementRecord["status"] = "upcoming";
      if (outBal === 0) status = "paid";
      else if (paidBal > 0)
        status = d.payment_due_date < today ? "overdue" : "partially_paid";
      else if (d.payment_due_date < today) status = "overdue";

      const newStmt: CreditCardStatementRecord = {
        id: `stmt_${crypto.randomBytes(6).toString("hex")}`,
        user_id: userId,
        card_id: d.card_id,
        statement_period_label: d.statement_period_label,
        period_start_date: d.period_start_date,
        closing_date: d.closing_date,
        payment_due_date: d.payment_due_date,
        statement_balance: stmtBal,
        minimum_payment: fromFils(toFils(d.minimum_payment)),
        amount_paid: paidBal,
        outstanding_balance: outBal,
        status,
        statement_receipt_id: null,
        is_manual_entry: true,
        notes: d.notes ?? null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const updatedState = saveUserState(userId, (curr) => ({
        ...curr,
        statements: [newStmt, ...curr.statements],
      }));

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 7. Record Credit Card Repayment (Liability Settlement — Never Double-Counted as Expense)
    if (action === "record_cc_repayment") {
      const parsed = ccRepaymentInputSchema.safeParse(body.repayment);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const today = getDubaiToday();

      const updatedState = saveUserState(userId, (curr) => {
        const targetCard = curr.cards.find((c) => c.id === d.card_id);
        const cardLabel = targetCard
          ? `${targetCard.display_name} (••${targetCard.last_four})`
          : "Credit Card";

        const txId = `tx_${crypto.randomBytes(6).toString("hex")}`;
        const repaymentTx: TransactionRecord = {
          id: txId,
          user_id: userId,
          transaction_type: "cc_repayment",
          status: "confirmed",
          verification_status: "verified",
          entry_source: "manual",
          amount: fromFils(toFils(d.amount)),
          currency: targetCard?.currency || "AED",
          vat_amount: 0,
          merchant: `Credit Card Repayment — ${cardLabel}`,
          merchant_location: "UAE",
          category_id:
            curr.categories.find((c) => c.name === "Credit Card Repayment")?.id ??
            null,
          category_name: "Credit Card Repayment",
          subcategory_name: null,
          transaction_date: d.payment_date,
          transaction_time: "12:00",
          occurred_at: nowIso,
          payment_method: "bank_transfer",
          account_id: d.source_account_id ?? null,
          card_id: null,
          target_card_id: d.card_id,
          target_account_id: null,
          reference_number: d.reference_number ?? null,
          receipt_id: null,
          extraction_job_id: null,
          income_kind: null,
          tags: ["cc-repayment", "liability-settlement"],
          line_items: [],
          notes:
            d.notes ||
            "Credit card liability repayment (not double-counted as new expense)",
          duplicate_fingerprint: computeDuplicateFingerprint({
            merchant: `Credit Card Repayment — ${cardLabel}`,
            amount: d.amount,
            transaction_date: d.payment_date,
            transaction_type: "cc_repayment",
            reference_number: d.reference_number,
          }),
          created_at: nowIso,
          updated_at: nowIso,
        };

        const paymentRecord: CreditCardPaymentRecord = {
          id: `ccpay_${crypto.randomBytes(6).toString("hex")}`,
          user_id: userId,
          card_id: d.card_id,
          statement_id: d.statement_id ?? null,
          source_account_id: d.source_account_id ?? null,
          linked_transaction_id: txId,
          amount: fromFils(toFils(d.amount)),
          currency: targetCard?.currency || "AED",
          payment_date: d.payment_date,
          reference_number: d.reference_number ?? null,
          notes: d.notes ?? null,
          created_at: nowIso,
          updated_at: nowIso,
        };

        const nextStatements = curr.statements.map((stmt) => {
          if (stmt.id !== d.statement_id) return stmt;
          const updated = applyStatementPayment(
            stmt,
            curr.cc_payments,
            d.amount,
            today
          );
          return {
            ...stmt,
            amount_paid: updated.amount_paid,
            outstanding_balance: updated.outstanding_balance,
            status: updated.status,
            updated_at: nowIso,
          };
        });

        // If the card uses manual balance mode, also reduce manual outstanding balance
        const nextCards = curr.cards.map((c) => {
          if (c.id !== d.card_id || !c.is_balance_manual) return c;
          return {
            ...c,
            current_outstanding_balance: Math.max(
              0,
              fromFils(toFils(c.current_outstanding_balance) - toFils(d.amount))
            ),
            updated_at: nowIso,
          };
        });

        return {
          ...curr,
          transactions: [repaymentTx, ...curr.transactions],
          cc_payments: [paymentRecord, ...curr.cc_payments],
          statements: nextStatements,
          cards: nextCards,
          audit_logs: [
            {
              id: `aud_${crypto.randomBytes(5).toString("hex")}`,
              user_id: userId,
              entity_type: "credit_card_payment",
              entity_id: paymentRecord.id,
              action: "repayment",
              summary: `Paid AED ${repaymentTx.amount.toFixed(
                2
              )} towards ${cardLabel}`,
              created_at: nowIso,
            },
            ...curr.audit_logs,
          ],
        };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 8. Upsert Budget
    if (action === "upsert_budget") {
      const parsed = budgetInputSchema.safeParse(body.budget);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const updatedState = saveUserState(userId, (curr) => {
        const existingIdx = curr.budgets.findIndex(
          (b) =>
            b.month_key === d.month_key &&
            (d.is_overall
              ? b.is_overall
              : b.category_name.toLowerCase() === d.category_name.toLowerCase())
        );

        const matchedCat = curr.categories.find(
          (c) => c.name.toLowerCase() === d.category_name.toLowerCase()
        );

        if (existingIdx >= 0) {
          const next = [...curr.budgets];
          next[existingIdx] = {
            ...next[existingIdx],
            limit_amount: fromFils(toFils(d.limit_amount)),
            alert_thresholds: d.alert_thresholds,
            notes: d.notes ?? null,
            updated_at: nowIso,
          };
          return { ...curr, budgets: next };
        }

        const newBdg: BudgetRecord = {
          id: `bdg_${crypto.randomBytes(6).toString("hex")}`,
          user_id: userId,
          month_key: d.month_key,
          category_id: matchedCat?.id ?? null,
          category_name: d.is_overall
            ? "Overall Monthly Budget"
            : d.category_name,
          is_overall: d.is_overall,
          limit_amount: fromFils(toFils(d.limit_amount)),
          currency: d.currency,
          alert_thresholds: d.alert_thresholds,
          notes: d.notes ?? null,
          created_at: nowIso,
          updated_at: nowIso,
        };
        return { ...curr, budgets: [...curr.budgets, newBdg] };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 9. Create Custom Category / Subcategory
    if (action === "create_category") {
      const name = String(body.name || "").trim();
      const kind = (body.kind || "expense") as CategoryRecord["kind"];
      const color = String(body.color || "#0f766e");
      if (name.length < 2) {
        return NextResponse.json(
          { error: "Category name must be at least 2 characters." },
          { status: 400 }
        );
      }

      const updatedState = saveUserState(userId, (curr) => {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        if (curr.categories.some((c) => c.slug === slug)) return curr;
        const newCat: CategoryRecord = {
          id: `cat_${crypto.randomBytes(5).toString("hex")}`,
          user_id: userId,
          name,
          slug,
          parent_id: body.parent_id || null,
          kind,
          color,
          icon: "Tag",
          is_system: false,
          created_at: nowIso,
          updated_at: nowIso,
        };
        return { ...curr, categories: [...curr.categories, newCat] };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 10. Create / Confirm / Delete Recurring Commitment
    if (action === "create_recurring") {
      const parsed = recurringInputSchema.safeParse(body.recurring);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const updatedState = saveUserState(userId, (curr) => {
        const newRec: RecurringTransactionRecord = {
          id: `rec_${crypto.randomBytes(6).toString("hex")}`,
          user_id: userId,
          name: d.name,
          kind: d.kind,
          amount: fromFils(toFils(d.amount)),
          currency: d.currency,
          frequency: d.frequency,
          start_date: d.start_date,
          end_date: d.end_date ?? null,
          next_due_date: d.next_due_date,
          category_id:
            curr.categories.find((c) => c.name === d.category_name)?.id ?? null,
          category_name: d.category_name,
          account_id: d.account_id ?? null,
          card_id: d.card_id ?? null,
          reminder_days_before: d.reminder_days_before,
          auto_create_draft: true,
          is_active: d.is_active,
          last_confirmed_date: null,
          notes: d.notes ?? null,
          created_at: nowIso,
          updated_at: nowIso,
        };
        return { ...curr, recurring: [...curr.recurring, newRec] };
      });
      return NextResponse.json({ ok: true, state: updatedState });
    }

    if (action === "confirm_recurring") {
      const recId = String(body.id || "");
      const updatedState = saveUserState(userId, (curr) => {
        const rec = curr.recurring.find(
          (r) => r.id === recId && r.user_id === userId
        );
        if (!rec) return curr;

        const txDate = rec.next_due_date || getDubaiToday();
        const confirmedTx: TransactionRecord = {
          id: `tx_${crypto.randomBytes(6).toString("hex")}`,
          user_id: userId,
          transaction_type: rec.kind === "income" ? "income" : "expense",
          status: "confirmed",
          verification_status: "verified",
          entry_source: "recurring_confirmed",
          amount: rec.amount,
          currency: rec.currency,
          vat_amount: 0,
          merchant: rec.name,
          merchant_location: "UAE",
          category_id: rec.category_id,
          category_name: rec.category_name,
          subcategory_name: null,
          transaction_date: txDate,
          transaction_time: "09:00",
          occurred_at: nowIso,
          payment_method: rec.card_id ? "credit_card" : "bank_transfer",
          account_id: rec.account_id,
          card_id: rec.card_id,
          target_card_id: null,
          target_account_id: null,
          reference_number: `REC-${rec.id.slice(-5).toUpperCase()}-${txDate}`,
          receipt_id: null,
          extraction_job_id: null,
          income_kind: rec.kind === "income" ? "salary" : null,
          tags: ["recurring-confirmed"],
          line_items: [],
          notes: `Confirmed scheduled ${rec.frequency} ${rec.kind}: ${rec.name}`,
          duplicate_fingerprint: computeDuplicateFingerprint({
            merchant: rec.name,
            amount: rec.amount,
            transaction_date: txDate,
            transaction_type: rec.kind === "income" ? "income" : "expense",
          }),
          created_at: nowIso,
          updated_at: nowIso,
        };

        // Advance next_due_date
        const [y, m, d] = txDate.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (rec.frequency === "weekly") dt.setUTCDate(dt.getUTCDate() + 7);
        else if (rec.frequency === "biweekly")
          dt.setUTCDate(dt.getUTCDate() + 14);
        else if (rec.frequency === "monthly")
          dt.setUTCMonth(dt.getUTCMonth() + 1);
        else if (rec.frequency === "quarterly")
          dt.setUTCMonth(dt.getUTCMonth() + 3);
        else if (rec.frequency === "yearly")
          dt.setUTCFullYear(dt.getUTCFullYear() + 1);

        const nextDue = dt.toISOString().slice(0, 10);

        return {
          ...curr,
          transactions: [confirmedTx, ...curr.transactions],
          recurring: curr.recurring.map((r) =>
            r.id === rec.id
              ? {
                  ...r,
                  last_confirmed_date: txDate,
                  next_due_date: nextDue,
                  updated_at: nowIso,
                }
              : r
          ),
        };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    if (action === "delete_recurring") {
      const recId = String(body.id || "");
      const updatedState = saveUserState(userId, (curr) => ({
        ...curr,
        recurring: curr.recurring.filter(
          (r) => !(r.id === recId && r.user_id === userId)
        ),
      }));
      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 11. Update Profile & Notification Preferences
    if (action === "update_profile") {
      const p = body.profile || {};
      const updatedState = saveUserState(userId, (curr) => ({
        ...curr,
        profile: {
          ...curr.profile,
          full_name:
            typeof p.full_name === "string"
              ? p.full_name.trim()
              : curr.profile.full_name,
          default_currency:
            typeof p.default_currency === "string"
              ? p.default_currency.toUpperCase().slice(0, 3)
              : curr.profile.default_currency,
          timezone:
            typeof p.timezone === "string" ? p.timezone : curr.profile.timezone,
          monthly_salary:
            p.monthly_salary !== undefined
              ? fromFils(toFils(p.monthly_salary))
              : curr.profile.monthly_salary,
          salary_payment_day:
            p.salary_payment_day !== undefined
              ? Math.min(31, Math.max(1, Number(p.salary_payment_day)))
              : curr.profile.salary_payment_day,
          monthly_savings_target:
            p.monthly_savings_target !== undefined
              ? fromFils(toFils(p.monthly_savings_target))
              : curr.profile.monthly_savings_target,
          receipt_retention_policy:
            p.receipt_retention_policy || curr.profile.receipt_retention_policy,
          updated_at: nowIso,
        },
      }));
      return NextResponse.json({ ok: true, state: updatedState });
    }

    if (action === "update_notification_preferences") {
      const prefs = body.preferences || {};
      const updatedState = saveUserState(userId, (curr) => ({
        ...curr,
        notification_preferences: {
          ...curr.notification_preferences,
          ...prefs,
          updated_at: nowIso,
        },
      }));
      return NextResponse.json({ ok: true, state: updatedState });
    }

    if (action === "mark_notifications_read") {
      const updatedState = saveUserState(userId, (curr) => ({
        ...curr,
        notifications: curr.notifications.map((n) => ({
          ...n,
          is_read: true,
        })),
      }));
      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 11b. Create Loan (Personal Loan, Auto Loan, Mortgage, BNPL, or 0% Card Installment Plan)
    if (action === "create_loan") {
      const parsed = loanInputSchema.safeParse(body.loan);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const remainingCount = Math.max(
        0,
        d.total_installments - d.paid_installments
      );

      const newLoan: LoanRecord = {
        id: `loan_${crypto.randomBytes(6).toString("hex")}`,
        user_id: userId,
        loan_name: d.loan_name.trim(),
        lender_name: d.lender_name.trim(),
        loan_type: d.loan_type,
        currency: d.currency,
        principal_amount: fromFils(toFils(d.principal_amount)),
        outstanding_principal: fromFils(toFils(d.outstanding_principal)),
        interest_rate_apr: d.interest_rate_apr,
        monthly_emi: fromFils(toFils(d.monthly_emi)),
        total_installments: d.total_installments,
        paid_installments: d.paid_installments,
        remaining_installments: remainingCount,
        start_date: d.start_date,
        next_payment_due_date: d.next_payment_due_date,
        due_day_of_month: d.due_day_of_month,
        linked_account_id: d.linked_account_id ?? null,
        linked_card_id: d.linked_card_id ?? null,
        status:
          fromFils(toFils(d.outstanding_principal)) === 0
            ? "paid_off"
            : "active",
        notes: d.notes ?? null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const updatedState = saveUserState(userId, (curr) => ({
        ...curr,
        loans: [newLoan, ...(curr.loans || [])],
        audit_logs: [
          {
            id: `aud_${crypto.randomBytes(5).toString("hex")}`,
            user_id: userId,
            entity_type: "loan",
            entity_id: newLoan.id,
            action: "create" as const,
            summary: `Registered ${newLoan.loan_name} (${newLoan.lender_name}, EMI ${newLoan.currency} ${newLoan.monthly_emi.toFixed(2)})`,
            created_at: nowIso,
          },
          ...curr.audit_logs,
        ],
      }));

      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 11c. Record Loan EMI / Installment Payment
    if (action === "record_loan_payment") {
      const parsed = loanPaymentInputSchema.safeParse(body.payment);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      const d = parsed.data;

      const updatedState = saveUserState(userId, (curr) => {
        const targetLoan = (curr.loans || []).find(
          (l) => l.id === d.loan_id && l.user_id === userId
        );
        if (!targetLoan) return curr;

        const applied = applyLoanPayment(targetLoan, d.amount);
        const txId = `tx_${crypto.randomBytes(6).toString("hex")}`;

        const loanTx: TransactionRecord = {
          id: txId,
          user_id: userId,
          transaction_type: "expense",
          status: "confirmed",
          verification_status: "verified",
          entry_source: "manual",
          amount: fromFils(toFils(d.amount)),
          currency: targetLoan.currency || "AED",
          vat_amount: 0,
          merchant: `Loan EMI · ${targetLoan.loan_name}`,
          merchant_location: "UAE",
          category_id:
            curr.categories.find((c) => c.name === "Loan & EMI Repayment")
              ?.id ?? null,
          category_name: "Loan & EMI Repayment",
          subcategory_name: targetLoan.loan_type,
          transaction_date: d.payment_date,
          transaction_time: "09:00",
          occurred_at: nowIso,
          payment_method: "bank_transfer",
          account_id: d.source_account_id ?? targetLoan.linked_account_id,
          card_id: targetLoan.linked_card_id,
          target_card_id: null,
          target_account_id: null,
          reference_number:
            d.reference_number ||
            `EMI-${targetLoan.id.slice(-4).toUpperCase()}-${d.payment_date.replace(/-/g, "")}`,
          receipt_id: null,
          extraction_job_id: null,
          income_kind: null,
          tags: ["loan-emi", targetLoan.loan_type],
          line_items: [],
          notes:
            d.notes ||
            `Installment ${applied.paid_installments} of ${targetLoan.total_installments} (Principal: AED ${applied.principal_component.toFixed(2)}, Interest: AED ${applied.interest_component.toFixed(2)})`,
          duplicate_fingerprint: computeDuplicateFingerprint({
            merchant: `Loan EMI · ${targetLoan.loan_name}`,
            amount: d.amount,
            transaction_date: d.payment_date,
            transaction_type: "expense",
            reference_number: d.reference_number,
          }),
          created_at: nowIso,
          updated_at: nowIso,
        };

        const paymentRecord: LoanPaymentRecord = {
          id: `lnpay_${crypto.randomBytes(6).toString("hex")}`,
          user_id: userId,
          loan_id: targetLoan.id,
          source_account_id:
            d.source_account_id ?? targetLoan.linked_account_id,
          linked_transaction_id: txId,
          amount: fromFils(toFils(d.amount)),
          principal_component: applied.principal_component,
          interest_component: applied.interest_component,
          currency: targetLoan.currency || "AED",
          payment_date: d.payment_date,
          reference_number: loanTx.reference_number,
          notes: loanTx.notes,
          created_at: nowIso,
          updated_at: nowIso,
        };

        return {
          ...curr,
          transactions: [loanTx, ...curr.transactions],
          loans: (curr.loans || []).map((l) =>
            l.id === targetLoan.id
              ? {
                  ...l,
                  outstanding_principal: applied.outstanding_principal,
                  paid_installments: applied.paid_installments,
                  remaining_installments: applied.remaining_installments,
                  next_payment_due_date: applied.next_payment_due_date,
                  status: applied.status,
                  updated_at: nowIso,
                }
              : l
          ),
          loan_payments: [paymentRecord, ...(curr.loan_payments || [])],
          audit_logs: [
            {
              id: `aud_${crypto.randomBytes(5).toString("hex")}`,
              user_id: userId,
              entity_type: "loan_payment",
              entity_id: paymentRecord.id,
              action: "repayment" as const,
              summary: `Paid AED ${paymentRecord.amount.toFixed(2)} EMI for ${targetLoan.loan_name} (${applied.remaining_installments} installments left)`,
              created_at: nowIso,
            },
            ...curr.audit_logs,
          ],
        };
      });

      return NextResponse.json({ ok: true, state: updatedState });
    }

    if (action === "delete_loan") {
      const loanId = String(body.id || "");
      const updatedState = saveUserState(userId, (curr) => ({
        ...curr,
        loans: (curr.loans || []).filter(
          (l) => !(l.id === loanId && l.user_id === userId)
        ),
      }));
      return NextResponse.json({ ok: true, state: updatedState });
    }

    // 12. Reset Demo Data or Clear All Data or Delete Account
    if (action === "reset_demo_data") {
      const seedDemo = Boolean(body.seedDemoData ?? true);
      const fresh = createInitialUserFinancialState({
        userId,
        email: session.email,
        fullName: session.fullName,
        seedDemoData: seedDemo,
      });
      const updatedState = saveUserState(userId, () => fresh);
      return NextResponse.json({ ok: true, state: updatedState });
    }

    if (action === "delete_account") {
      deleteUserAccountAndData(userId);
      const res = NextResponse.json({ ok: true, deleted: true });
      res.cookies.delete(SESSION_COOKIE_NAME);
      res.cookies.set("dp_signed_out", "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      return res;
    }

    return NextResponse.json(
      { error: `Unknown finance action: ${action}` },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: "Server failed to process financial operation." },
      { status: 500 }
    );
  }
}
