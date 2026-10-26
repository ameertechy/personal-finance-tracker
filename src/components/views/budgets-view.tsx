"use client";

import React, { useMemo, useState } from "react";
import {
  Wallet,
  PiggyBank,
  PieChart,
  Repeat,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Check,
  Trash2,
} from "lucide-react";
import { useFinance } from "@/context/finance-context";
import {
  calculateAccountingSummary,
  calculateCategoryBudgets,
  formatCurrency,
} from "@/lib/money";
import { formatDubaiDate, getDubaiToday } from "@/lib/dubai-time";

export function BudgetsView() {
  const { state, selectedMonth, mutateFinance, theme } = useFinance();

  const [salaryAmount, setSalaryAmount] = useState(
    String(state?.profile.monthly_salary || 32000)
  );
  const [salaryDay, setSalaryDay] = useState(
    String(state?.profile.salary_payment_day || 28)
  );
  const [savingsTarget, setSavingsTarget] = useState(
    String(state?.profile.monthly_savings_target || 10000)
  );

  // Additional Income Entry
  const [incTitle, setIncTitle] = useState("");
  const [incAmount, setIncAmount] = useState("");
  const [incKind, setIncKind] = useState<
    "salary" | "bonus" | "reimbursement" | "freelance" | "other"
  >("bonus");

  // Budget Form
  const [bdgCategory, setBdgCategory] = useState("Groceries");
  const [bdgIsOverall, setBdgIsOverall] = useState(false);
  const [bdgLimit, setBdgLimit] = useState("2500");

  // Custom Category Form
  const [newCategoryName, setNewCategoryName] = useState("");

  // Recurring Form
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
        "Updated monthly salary configuration & savings target."
      );
    }
  };

  const handleRecordIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incTitle || !incAmount) return;
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
        transaction_date: `${selectedMonth}-${String(
          Math.min(28, state.profile.salary_payment_day)
        ).padStart(2, "0")}`,
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

  const cardClass =
    theme === "dark"
      ? "bg-slate-900/90 border-slate-800 text-slate-100"
      : "bg-white border-slate-200 text-slate-900 shadow-sm";

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          role="status"
          data-testid="budgets-status-banner"
          className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Top Row: Salary & Income Config + Additional Income Entry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleSaveSalaryProfile}
          className={`p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold">
                Monthly Salary &amp; Savings Target ({selectedMonth})
              </h3>
            </div>
            <span className="text-xs font-bold text-emerald-400">
              Effective Income: {formatCurrency(summary.effectiveMonthlyIncome)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                Monthly Salary (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                Salary Payment Day (1-31)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={salaryDay}
                onChange={(e) => setSalaryDay(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                Monthly Savings Target (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={savingsTarget}
                onChange={(e) => setSavingsTarget(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-bold text-teal-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <PiggyBank className="h-4 w-4 text-teal-400" />
              <span>
                Current Month Savings:{" "}
                <strong className="text-emerald-400">
                  {formatCurrency(summary.monthlySavings)} (
                  {summary.savingsRatePct}%)
                </strong>
              </span>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer"
            >
              Update Salary &amp; Target
            </button>
          </div>
        </form>

        {/* Record Salary, Bonus, Reimbursement, or Other Income */}
        <form
          onSubmit={handleRecordIncome}
          data-testid="record-income-form"
          className={`p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div>
            <h3 className="text-sm font-bold">
              Record Salary, Bonus, or Reimbursement
            </h3>
            <p className="text-xs text-slate-400">
              Add confirmed salary credits, performance bonuses, expense
              reimbursements, or freelance income.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                Income Description *
              </label>
              <input
                type="text"
                required
                data-testid="income-title-input"
                value={incTitle}
                onChange={(e) => setIncTitle(e.target.value)}
                placeholder="e.g. Q4 Performance Bonus"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Amount (AED) *</label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="income-amount-input"
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
                placeholder="5000.00"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Income Source</label>
              <select
                value={incKind}
                onChange={(e) =>
                  setIncKind(e.target.value as typeof incKind)
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="salary">Monthly Salary</option>
                <option value="bonus">Bonus</option>
                <option value="reimbursement">Reimbursement</option>
                <option value="freelance">Additional / Freelance</option>
                <option value="other">Other Income</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              data-testid="submit-income-btn"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              + Add Confirmed Income
            </button>
          </div>
        </form>
      </div>

      {/* Category Budgets & Alert Thresholds (50%, 75%, 90%, 100%) */}
      <div className={`p-5 rounded-2xl border ${cardClass} space-y-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <PieChart className="h-4 w-4 text-teal-400" />
              <span>
                Monthly &amp; Category Budgets ({selectedMonth}) — Configurable
                50% / 75% / 90% / 100% Warnings
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Overall Monthly Budget:{" "}
              <strong>{formatCurrency(summary.overallBudgetLimit)}</strong> •
              Spent: <strong>{formatCurrency(summary.netExpenses)}</strong> •
              Remaining:{" "}
              <strong className="text-teal-400">
                {formatCurrency(summary.overallBudgetRemaining)}
              </strong>
            </p>
          </div>
        </div>

        {/* Upsert Budget + Custom Category Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2 border-t border-slate-800/50">
          <form
            onSubmit={handleSaveBudget}
            data-testid="upsert-budget-form"
            className="lg:col-span-2 flex flex-wrap items-end gap-2.5 text-xs"
          >
            <div className="flex-1 min-w-[160px]">
              <label className="block text-slate-400 mb-1">
                Category or Overall
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
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
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
            <div className="w-40">
              <label className="block text-slate-400 mb-1">
                Monthly Limit (AED)
              </label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="budget-limit-input"
                value={bdgLimit}
                onChange={(e) => setBdgLimit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-bold"
              />
            </div>
            <button
              type="submit"
              data-testid="save-budget-btn"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer"
            >
              Set Budget Limit
            </button>
          </form>

          <form
            onSubmit={handleAddCustomCategory}
            className="flex items-end gap-2 text-xs"
          >
            <div className="flex-1">
              <label className="block text-slate-400 mb-1">
                New Custom Category
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Salik & Parking"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
            >
              + Category
            </button>
          </form>
        </div>

        {/* Category Budget Progress Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {categoryProgress.map((cp) => (
            <div
              key={cp.categoryName}
              data-testid={`budget-card-${cp.categoryName}`}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{cp.categoryName}</span>
                <div className="flex items-center gap-2">
                  {cp.activeThresholdWarning && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        cp.activeThresholdWarning >= 90
                          ? "bg-rose-500/25 text-rose-300"
                          : "bg-amber-500/25 text-amber-300"
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      <span>{cp.activeThresholdWarning}% Warning</span>
                    </span>
                  )}
                  <span className="font-semibold">
                    {formatCurrency(cp.spentAmount)} /{" "}
                    {cp.limitAmount > 0
                      ? formatCurrency(cp.limitAmount)
                      : "No cap"}
                  </span>
                </div>
              </div>

              {cp.limitAmount > 0 && (
                <>
                  <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        cp.utilizationPct >= 100
                          ? "bg-rose-500"
                          : cp.utilizationPct >= 90
                          ? "bg-orange-500"
                          : cp.utilizationPct >= 75
                          ? "bg-amber-400"
                          : "bg-teal-500"
                      }`}
                      style={{ width: `${Math.min(100, cp.utilizationPct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Utilization: {cp.utilizationPct}%</span>
                    <span>
                      Remaining: {formatCurrency(cp.remainingAmount)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recurring Expenses & Scheduled Commitments */}
      <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Repeat className="h-4 w-4 text-teal-400" />
              <span>
                Recurring Expenses, Salary Schedules &amp; Reminders
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Scheduled items are strictly separated from confirmed transactions
              until you click &ldquo;Confirm Paid&rdquo;.
            </p>
          </div>
        </div>

        {/* Add Recurring Item Form */}
        <form
          onSubmit={handleCreateRecurring}
          className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs pt-2"
        >
          <input
            type="text"
            required
            value={recName}
            onChange={(e) => setRecName(e.target.value)}
            placeholder="Name (e.g. Du Home Internet)"
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
          />
          <input
            type="number"
            step="0.01"
            required
            value={recAmount}
            onChange={(e) => setRecAmount(e.target.value)}
            placeholder="Amount (AED)"
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
          />
          <select
            value={recFrequency}
            onChange={(e) =>
              setRecFrequency(e.target.value as typeof recFrequency)
            }
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
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
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Recurring</span>
          </button>
        </form>

        <div className="space-y-2.5 pt-2">
          {state.recurring.map((rec) => (
            <div
              key={rec.id}
              data-testid={`recurring-row-${rec.id}`}
              className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-bold flex items-center gap-2">
                  <span>{rec.name}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 uppercase">
                    {rec.frequency} • {rec.kind}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Category: {rec.category_name} • Next Due:{" "}
                  <strong className="text-slate-200">
                    {formatDubaiDate(rec.next_due_date)}
                  </strong>{" "}
                  • Reminders: {rec.reminder_days_before.join("d, ")}d before
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="font-bold text-sm">
                  {formatCurrency(rec.amount, rec.currency)}
                </span>
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
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-600/20 border border-teal-500/40 text-teal-300 font-semibold hover:bg-teal-600/30 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Confirm Paid</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    mutateFinance("delete_recurring", { id: rec.id })
                  }
                  className="p-1.5 rounded-lg bg-rose-950/60 text-rose-400 hover:bg-rose-900/60 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
