"use client";

import React, { useMemo, useState } from "react";
import { Plus, Check, Trash2 } from "lucide-react";
import { useFinance } from "@/context/finance-context";
import {
  calculateAccountingSummary,
  calculateCategoryBudgets,
  formatCurrency,
} from "@/lib/money";
import { formatDubaiDate, getDubaiToday } from "@/lib/dubai-time";
import { TastePlanBars } from "@/components/taste-charts";

export function BudgetsView() {
  const { state, selectedMonth, mutateFinance } = useFinance();

  const [salaryAmount, setSalaryAmount] = useState(
    String(state?.profile.monthly_salary || 32000)
  );
  const [salaryDay, setSalaryDay] = useState(
    String(state?.profile.salary_payment_day || 28)
  );
  const [savingsTarget, setSavingsTarget] = useState(
    String(state?.profile.monthly_savings_target || 10000)
  );

  const [incTitle, setIncTitle] = useState("");
  const [incAmount, setIncAmount] = useState("");
  const [incKind, setIncKind] = useState<
    "salary" | "bonus" | "reimbursement" | "freelance" | "other"
  >("bonus");

  const [bdgCategory, setBdgCategory] = useState("Groceries");
  const [bdgIsOverall, setBdgIsOverall] = useState(false);
  const [bdgLimit, setBdgLimit] = useState("2500");

  const [newCategoryName, setNewCategoryName] = useState("");

  const [recName, setRecName] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recFrequency, setRecFrequency] = useState<
    "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly"
  >("monthly");
  const [recDueDate, setRecDueDate] = useState(() => getDubaiToday());
  const recCategory = "Subscriptions";

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!state) return null;
    return calculateAccountingSummary({
      monthKey: selectedMonth,
      monthlySalaryConfigured: state.profile.monthly_salary,
      transactions: state.transactions,
      accounts: state.accounts,
      cards: state.cards,
      statements: state.statements,
      budgets: state.budgets,
      recurring: state.recurring,
    });
  }, [state, selectedMonth]);

  const categoryProgress = useMemo(() => {
    if (!state) return [];
    return calculateCategoryBudgets(
      selectedMonth,
      state.budgets,
      state.transactions
    );
  }, [state, selectedMonth]);

  if (!state || !summary) return null;

  const handleSaveSalaryProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutateFinance("update_profile", {
      profile: {
        monthly_salary: Number(salaryAmount),
        salary_payment_day: Number(salaryDay),
        monthly_savings_target: Number(savingsTarget),
      },
    });
    if (res.ok) {
      setStatusMessage(
        "Updated monthly salary configuration and savings target."
      );
    }
  };

  const handleRecordIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incTitle || !incAmount) return;
    const payDayPadded = String(
      Math.min(28, state.profile.salary_payment_day)
    ).padStart(2, "0"); // taste-skill-ignore: ISO date day formatting
    const res = await mutateFinance("create_transaction", {
      transaction: {
        transaction_type: "income",
        status: "confirmed",
        verification_status: "verified",
        entry_source: "manual",
        amount: Number(incAmount),
        currency: "AED",
        merchant: incTitle,
        category_name: "Salary & Income",
        transaction_date: `${selectedMonth}-${payDayPadded}`,
        payment_method: "bank_transfer",
        account_id: state.accounts[0]?.id ?? null,
        income_kind: incKind,
        notes: `Recorded ${incKind} income`,
      },
      allowDuplicate: true,
    });
    if (res.ok) {
      setStatusMessage(
        `Recorded ${incTitle} (${formatCurrency(Number(incAmount))}) for ${selectedMonth}.`
      );
      setIncTitle("");
      setIncAmount("");
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutateFinance("upsert_budget", {
      budget: {
        month_key: selectedMonth,
        category_name: bdgIsOverall ? "Overall Monthly Budget" : bdgCategory,
        is_overall: bdgIsOverall,
        limit_amount: Number(bdgLimit),
        currency: "AED",
        alert_thresholds: [50, 75, 90, 100],
      },
    });
    if (res.ok) {
      setStatusMessage(
        `Saved ${
          bdgIsOverall ? "Overall Monthly" : bdgCategory
        } budget of AED ${Number(bdgLimit).toFixed(2)} for ${selectedMonth}.`
      );
    }
  };

  const handleAddCustomCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const res = await mutateFinance("create_category", {
      name: newCategoryName.trim(),
      kind: "expense",
    });
    if (res.ok) {
      setBdgCategory(newCategoryName.trim());
      setNewCategoryName("");
      setStatusMessage("Added custom spending category.");
    }
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recName || !recAmount) return;
    const res = await mutateFinance("create_recurring", {
      recurring: {
        name: recName,
        kind: "expense",
        amount: Number(recAmount),
        currency: "AED",
        frequency: recFrequency,
        start_date: recDueDate,
        next_due_date: recDueDate,
        category_name: recCategory,
        reminder_days_before: [7, 3, 1],
        is_active: true,
      },
    });
    if (res.ok) {
      setStatusMessage(`Added recurring commitment: ${recName}`);
      setRecName("");
      setRecAmount("");
    }
  };

  const planRows = categoryProgress
    .filter((c) => c.limitAmount > 0 || c.spentAmount > 0)
    .map((c) => ({
      label: c.categoryName,
      planned: c.limitAmount > 0 ? c.limitAmount : c.spentAmount,
      spent: c.spentAmount,
    }));

  return (
    <div className="space-y-4">
      <div className="title-row">
        <div>
          <h1>Salary, Budgets &amp; Recurring Commitments</h1>
          <p className="sub">
            {formatCurrency(summary.overallBudgetRemaining)} of{" "}
            {formatCurrency(summary.overallBudgetLimit)} monthly budget remains
            in {selectedMonth} ({summary.overallBudgetUtilizationPct}% used)
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          role="status"
          data-testid="budgets-status-banner"
          className="p-3.5 rounded-[6px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-[13px]"
        >
          {statusMessage}
        </div>
      )}

      {/* Top Row: Salary & Savings Target (6 cols) + Record Income (6 cols) */}
      <div className="app-grid top">
        <form
          onSubmit={handleSaveSalaryProfile}
          className="panel space-y-4"
          style={{ gridColumn: "span 6" }}
        >
          <div className="panel-header">
            <h2>Monthly salary &amp; savings target ({selectedMonth})</h2>
            <span className="font-semibold num">
              {formatCurrency(summary.effectiveMonthlyIncome)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Monthly salary (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
                className="input-control font-semibold num"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Payment day (1–31)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={salaryDay}
                onChange={(e) => setSalaryDay(e.target.value)}
                className="input-control num"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Savings target (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={savingsTarget}
                onChange={(e) => setSavingsTarget(e.target.value)}
                className="input-control font-semibold num"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
            <span className="text-[13px] text-[var(--muted)]">
              Current savings:{" "}
              <strong className="text-[var(--text)] num">
                {formatCurrency(summary.monthlySavings)} (
                {summary.savingsRatePct}%)
              </strong>
            </span>
            <button type="submit" className="btn primary">
              Update salary &amp; target
            </button>
          </div>
        </form>

        <form
          onSubmit={handleRecordIncome}
          data-testid="record-income-form"
          className="panel space-y-4"
          style={{ gridColumn: "span 6" }}
        >
          <div className="panel-header">
            <h2>Record salary, bonus, or reimbursement</h2>
            <span className="panel-meta">Confirmed income entry</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Description *
              </label>
              <input
                type="text"
                required
                data-testid="income-title-input"
                value={incTitle}
                onChange={(e) => setIncTitle(e.target.value)}
                placeholder="Q4 Performance Bonus"
                className="input-control"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Amount (AED) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="income-amount-input"
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
                placeholder="5000.00"
                className="input-control font-semibold num"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Income source
              </label>
              <select
                value={incKind}
                onChange={(e) => setIncKind(e.target.value as typeof incKind)}
                className="input-control"
              >
                <option value="salary">Monthly salary</option>
                <option value="bonus">Bonus</option>
                <option value="reimbursement">Reimbursement</option>
                <option value="freelance">Additional / Freelance</option>
                <option value="other">Other income</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-[var(--border)]">
            <button
              type="submit"
              data-testid="submit-income-btn"
              className="btn primary"
            >
              + Add confirmed income
            </button>
          </div>
        </form>
      </div>

      {/* Category Budgets & Threshold Warnings */}
      <section className="panel space-y-5">
        <div className="panel-header">
          <div>
            <h2>
              Monthly &amp; category budgets ({selectedMonth}) · 50% / 75% /
              90% / 100% alerts
            </h2>
            <p className="panel-meta">
              Overall budget {formatCurrency(summary.overallBudgetLimit)} ·
              Spent {formatCurrency(summary.netExpenses)} · Remaining{" "}
              {formatCurrency(summary.overallBudgetRemaining)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2 border-t border-[var(--border)]">
          <form
            onSubmit={handleSaveBudget}
            data-testid="upsert-budget-form"
            className="lg:col-span-2 flex flex-wrap items-end gap-2.5"
          >
            <div className="flex-1 min-w-[180px] space-y-1">
              <label className="block text-[13px] font-medium">
                Category or overall
              </label>
              <select
                data-testid="budget-category-select"
                value={bdgIsOverall ? "__overall__" : bdgCategory}
                onChange={(e) => {
                  if (e.target.value === "__overall__") {
                    setBdgIsOverall(true);
                  } else {
                    setBdgIsOverall(false);
                    setBdgCategory(e.target.value);
                  }
                }}
                className="input-control"
              >
                <option value="__overall__">Overall Monthly Budget</option>
                {state.categories
                  .filter((c) => c.kind === "expense")
                  .map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="w-44 space-y-1">
              <label className="block text-[13px] font-medium">
                Monthly limit (AED)
              </label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="budget-limit-input"
                value={bdgLimit}
                onChange={(e) => setBdgLimit(e.target.value)}
                className="input-control font-semibold num"
              />
            </div>
            <button
              type="submit"
              data-testid="save-budget-btn"
              className="btn primary"
            >
              Set budget limit
            </button>
          </form>

          <form
            onSubmit={handleAddCustomCategory}
            className="flex items-end gap-2"
          >
            <div className="flex-1 space-y-1">
              <label className="block text-[13px] font-medium">
                New custom category
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Salik & Parking"
                className="input-control"
              />
            </div>
            <button type="submit" className="btn">
              + Category
            </button>
          </form>
        </div>

        <TastePlanBars rows={planRows} />
      </section>

      {/* Recurring Commitments Table */}
      <section className="panel space-y-4">
        <div className="panel-header">
          <div>
            <h2>Recurring expenses, salary schedules &amp; reminders</h2>
            <p className="panel-meta">
              Scheduled items are kept separate from confirmed spending until
              you click Confirm paid
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreateRecurring}
          className="grid grid-cols-1 sm:grid-cols-5 gap-2.5"
        >
          <input
            type="text"
            required
            value={recName}
            onChange={(e) => setRecName(e.target.value)}
            placeholder="Name (e.g. Du Home Internet)"
            className="input-control"
          />
          <input
            type="number"
            step="0.01"
            required
            value={recAmount}
            onChange={(e) => setRecAmount(e.target.value)}
            placeholder="Amount (AED)"
            className="input-control num"
          />
          <select
            value={recFrequency}
            onChange={(e) =>
              setRecFrequency(e.target.value as typeof recFrequency)
            }
            className="input-control"
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input
            type="date"
            value={recDueDate}
            onChange={(e) => setRecDueDate(e.target.value)}
            className="input-control"
          />
          <button type="submit" className="btn primary">
            <Plus className="h-3.5 w-3.5" />
            <span>Add recurring</span>
          </button>
        </form>

        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Commitment</th>
                <th>Category &amp; frequency</th>
                <th>Next due date (GST)</th>
                <th>Reminders</th>
                <th className="n">Amount</th>
                <th className="n">Action</th>
              </tr>
            </thead>
            <tbody>
              {state.recurring.map((rec) => (
                <tr key={rec.id} data-testid={`recurring-row-${rec.id}`}>
                  <td className="font-medium">{rec.name}</td>
                  <td className="text-[var(--muted)]">
                    {rec.category_name} · {rec.frequency} ({rec.kind})
                  </td>
                  <td className="num">{formatDubaiDate(rec.next_due_date)}</td>
                  <td className="text-[var(--muted)]">
                    {rec.reminder_days_before.join("d, ")}d before
                  </td>
                  <td className="n font-semibold">
                    {formatCurrency(rec.amount, rec.currency)}
                  </td>
                  <td className="n">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid={`confirm-recurring-btn-${rec.id}`}
                        onClick={async () => {
                          const res = await mutateFinance("confirm_recurring", {
                            id: rec.id,
                          });
                          if (res.ok) {
                            setStatusMessage(
                              `Confirmed ${rec.name} (${formatCurrency(
                                rec.amount
                              )}) and advanced next due date.`
                            );
                          }
                        }}
                        className="btn h-7 px-2.5 text-[12px]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Confirm paid</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          mutateFinance("delete_recurring", { id: rec.id })
                        }
                        className="btn danger h-7 px-2 text-[12px]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
