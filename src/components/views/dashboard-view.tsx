"use client";

import React, { useMemo } from "react";
import {
  Wallet,
  TrendingDown,
  CreditCard,
  CalendarClock,
  ShieldCheck,
  ArrowUpRight,
  FileCheck2,
  AlertTriangle,
  Plus,
  Info,
  Receipt,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useFinance } from "@/context/finance-context";
import {
  calculateAccountingSummary,
  calculateCategoryBudgets,
  formatCurrency,
  fromFils,
  toFils,
} from "@/lib/money";
import {
  daysBetweenDubaiDates,
  formatDubaiDate,
  getDubaiToday,
} from "@/lib/dubai-time";

const CHART_COLORS = [
  "#0d9488",
  "#2563eb",
  "#ea580c",
  "#7c3aed",
  "#0284c7",
  "#db2777",
  "#d97706",
];

export function DashboardView() {
  const { state, selectedMonth, setActiveSection, theme } = useFinance();

  const today = getDubaiToday();

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

  const categoryBreakdown = useMemo(() => {
    if (!state) return [];
    return calculateCategoryBudgets(
      selectedMonth,
      state.budgets,
      state.transactions
    ).filter((c) => c.spentAmount > 0);
  }, [state, selectedMonth]);

  const paymentMethodBreakdown = useMemo(() => {
    if (!state) return [];
    const map = new Map<string, number>();
    for (const tx of state.transactions) {
      if (
        !tx.transaction_date.startsWith(selectedMonth) ||
        tx.status !== "confirmed" ||
        tx.transaction_type !== "expense"
      ) {
        continue;
      }
      let label: string = tx.payment_method.replace(/_/g, " ");
      if (tx.card_id) {
        const card = state.cards.find((c) => c.id === tx.card_id);
        if (card) label = `${card.display_name} (••${card.last_four})`;
      } else if (tx.account_id) {
        const acc = state.accounts.find((a) => a.id === tx.account_id);
        if (acc) label = acc.display_name;
      }
      map.set(label, (map.get(label) ?? 0) + toFils(tx.amount));
    }
    return Array.from(map.entries())
      .map(([name, fils]) => ({ name, amount: fromFils(fils) }))
      .sort((a, b) => b.amount - a.amount);
  }, [state, selectedMonth]);

  const dailyTrendData = useMemo(() => {
    if (!state) return [];
    const map = new Map<string, { day: string; expense: number; income: number }>();
    const monthTxs = state.transactions.filter(
      (t) =>
        t.transaction_date.startsWith(selectedMonth) && t.status === "confirmed"
    );

    for (const tx of monthTxs) {
      const dayLabel = tx.transaction_date.slice(8, 10);
      const entry = map.get(dayLabel) ?? { day: dayLabel, expense: 0, income: 0 };
      if (tx.transaction_type === "expense") {
        entry.expense = fromFils(toFils(entry.expense) + toFils(tx.amount));
      } else if (tx.transaction_type === "income") {
        entry.income = fromFils(toFils(entry.income) + toFils(tx.amount));
      }
      map.set(dayLabel, entry);
    }

    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [state, selectedMonth]);

  if (!state || !summary) return null;

  const upcomingStatements = state.statements
    .filter((s) => s.status !== "paid")
    .sort((a, b) => a.payment_due_date.localeCompare(b.payment_due_date));

  const upcomingRecurring = state.recurring
    .filter((r) => r.is_active && r.kind === "expense")
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));

  const latestTransactions = state.transactions.slice(0, 6);
  const recentJobs = state.extraction_jobs.slice(0, 4);

  const cardClass =
    theme === "dark"
      ? "bg-slate-900/90 border-slate-800 text-slate-100"
      : "bg-white border-slate-200 text-slate-900 shadow-sm";

  return (
    <div className="space-y-6">
      {/* Quick Action Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold">
            UAE Financial Overview ({selectedMonth})
          </h2>
          <p className="text-xs text-slate-400">
            All figures in {state.profile.default_currency} • Displayed in{" "}
            {state.profile.timezone} (GST / UTC+4)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="dashboard-quick-add-btn"
            onClick={() => setActiveSection("add")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Record Expense / Scan Receipt</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Monthly Income & Remaining Income */}
        <div className={`p-4 rounded-2xl border ${cardClass} space-y-2`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Monthly Salary / Income</span>
            <Wallet className="h-4 w-4 text-emerald-400" />
          </div>
          <div
            data-testid="kpi-monthly-income"
            className="text-2xl font-extrabold tracking-tight text-emerald-400"
          >
            {formatCurrency(summary.effectiveMonthlyIncome)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/40">
            <span>Remaining Income:</span>
            <strong
              data-testid="kpi-remaining-income"
              className={
                summary.monthlyRemainingIncome >= 0
                  ? "text-slate-200"
                  : "text-rose-400"
              }
            >
              {formatCurrency(summary.monthlyRemainingIncome)}
            </strong>
          </div>
        </div>

        {/* KPI 2: Total Spending This Month */}
        <div className={`p-4 rounded-2xl border ${cardClass} space-y-2`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Spending ({selectedMonth})</span>
            <TrendingDown className="h-4 w-4 text-rose-400" />
          </div>
          <div
            data-testid="kpi-total-spending"
            className="text-2xl font-extrabold tracking-tight"
          >
            {formatCurrency(summary.netExpenses)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/40">
            <span>Budget Remaining:</span>
            <strong
              data-testid="kpi-budget-remaining"
              className={
                summary.overallBudgetRemaining >= 0
                  ? "text-teal-400"
                  : "text-rose-400"
              }
            >
              {formatCurrency(summary.overallBudgetRemaining)} (
              {summary.overallBudgetUtilizationPct}% used)
            </strong>
          </div>
        </div>

        {/* KPI 3: Available Funds (Distinguishing Verified Bank Balances vs Calculated Estimate) */}
        <div className={`p-4 rounded-2xl border ${cardClass} space-y-2`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Funds</span>
            <ShieldCheck className="h-4 w-4 text-teal-400" />
          </div>
          <div
            data-testid="kpi-available-funds"
            className="text-2xl font-extrabold tracking-tight text-teal-400"
          >
            {formatCurrency(summary.estimatedAvailableFunds)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/40">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>Calculated Estimate</span>
            </span>
            {summary.hasVerifiedBankBalance ? (
              <span
                title="Sum of manually verified bank account balances"
                className="text-emerald-400 font-medium"
              >
                Verified Bank: {formatCurrency(summary.verifiedBankBalancesTotal)}
              </span>
            ) : (
              <span>No manual bank balance</span>
            )}
          </div>
        </div>

        {/* KPI 4: Credit Card Outstanding & Monthly Savings */}
        <div className={`p-4 rounded-2xl border ${cardClass} space-y-2`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Credit Card Outstanding</span>
            <CreditCard className="h-4 w-4 text-amber-400" />
          </div>
          <div
            data-testid="kpi-cc-outstanding"
            className="text-2xl font-extrabold tracking-tight text-amber-400"
          >
            {formatCurrency(summary.totalCreditCardOutstanding)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/40">
            <span>Utilization: {summary.overallCardUtilizationPct}%</span>
            <span className="text-emerald-400 font-semibold">
              Savings: {formatCurrency(summary.monthlySavings)} (
              {summary.savingsRatePct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Upcoming Credit Card Due Dates & Recurring Bills Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Credit Card Statements */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold">
                Upcoming Credit Card Payment Due Dates
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection("cards")}
              className="text-xs text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Cards &amp; Pay</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {upcomingStatements.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              All credit card statements are settled.
            </p>
          ) : (
            <div className="space-y-2.5">
              {upcomingStatements.map((stmt) => {
                const card = state.cards.find((c) => c.id === stmt.card_id);
                const daysLeft = daysBetweenDubaiDates(
                  today,
                  stmt.payment_due_date
                );
                const isOverdue = daysLeft < 0 || stmt.status === "overdue";
                const isDueSoon = !isOverdue && daysLeft <= 7;

                return (
                  <div
                    key={stmt.id}
                    className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                      isOverdue
                        ? "bg-rose-950/30 border-rose-700/60"
                        : isDueSoon
                        ? "bg-amber-950/25 border-amber-700/50"
                        : theme === "dark"
                        ? "bg-slate-950/60 border-slate-800"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">
                          {card?.display_name || "Credit Card"} (••
                          {card?.last_four || "0000"})
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            isOverdue
                              ? "bg-rose-500/20 text-rose-300"
                              : stmt.status === "partially_paid"
                              ? "bg-teal-500/20 text-teal-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {isOverdue
                            ? `Overdue (${Math.abs(daysLeft)}d)`
                            : stmt.status.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Period: {stmt.statement_period_label} • Due:{" "}
                        <strong className="text-slate-200">
                          {formatDubaiDate(stmt.payment_due_date)}
                        </strong>{" "}
                        ({daysLeft >= 0 ? `in ${daysLeft} days` : "past due"})
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-amber-400">
                        {formatCurrency(stmt.outstanding_balance)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Min due: {formatCurrency(stmt.minimum_payment)} • Paid:{" "}
                        {formatCurrency(stmt.amount_paid)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Scheduled Recurring Commitments */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-400" />
              <h3 className="text-sm font-bold">
                Upcoming Scheduled Bills &amp; Commitments
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection("budgets")}
              className="text-xs text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View Schedule</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400">
            Scheduled recurring items are tracked below and{" "}
            <strong className="text-slate-200">
              never counted as completed expenses
            </strong>{" "}
            until you confirm the transaction.
          </p>

          <div className="space-y-2.5">
            {upcomingRecurring.slice(0, 4).map((rec) => {
              const daysUntil = daysBetweenDubaiDates(today, rec.next_due_date);
              return (
                <div
                  key={rec.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    theme === "dark"
                      ? "bg-slate-950/60 border-slate-800"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold">{rec.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {rec.category_name} • Next Due:{" "}
                      {formatDubaiDate(rec.next_due_date)} (
                      {daysUntil >= 0
                        ? `in ${daysUntil}d`
                        : `${Math.abs(daysUntil)}d ago`}
                      )
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold">
                      {formatCurrency(rec.amount, rec.currency)}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {rec.frequency}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Charts Row: Spending by Category, Payment Method & Daily Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Spending by Category */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <h3 className="text-sm font-bold">Spending by Category</h3>
          {categoryBreakdown.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              No confirmed expenses for {selectedMonth}.
            </p>
          ) : (
            <>
              <div className="h-48 w-full min-w-[200px]">
                <ResponsiveContainer width="100%" height={185}>
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="spentAmount"
                      nameKey="categoryName"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={3}
                    >
                      {categoryBreakdown.map((entry, idx) => (
                        <Cell
                          key={entry.categoryName}
                          fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => formatCurrency(Number(val))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 text-xs">
                {categoryBreakdown.slice(0, 5).map((cat, idx) => (
                  <div
                    key={cat.categoryName}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            CHART_COLORS[idx % CHART_COLORS.length],
                        }}
                      />
                      <span className="truncate">{cat.categoryName}</span>
                    </div>
                    <span className="font-semibold">
                      {formatCurrency(cat.spentAmount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Chart 2: Spending by Payment Method / Card */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <h3 className="text-sm font-bold">Spending by Card &amp; Account</h3>
          {paymentMethodBreakdown.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              No card/account spend recorded this month.
            </p>
          ) : (
            <div className="space-y-3 pt-1">
              {paymentMethodBreakdown.map((item, idx) => {
                const pct =
                  summary.netExpenses > 0
                    ? Math.min(
                        100,
                        Math.round((item.amount / summary.netExpenses) * 100)
                      )
                    : 0;
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate">{item.name}</span>
                      <span className="font-bold">
                        {formatCurrency(item.amount)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            CHART_COLORS[idx % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="pt-3 border-t border-slate-800/50 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Card Repayments (Liability Transfer):</span>
                  <strong className="text-teal-400">
                    {formatCurrency(summary.creditCardRepaymentsTotal)}
                  </strong>
                </div>
                <p className="text-[10px]">
                  Repayments reduce card debt and are excluded from expense
                  totals above.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Chart 3: Daily Expense Trend */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <h3 className="text-sm font-bold">Daily Expense Trend ({selectedMonth})</h3>
          {dailyTrendData.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              No daily activity for {selectedMonth}.
            </p>
          ) : (
            <div className="h-56 w-full min-w-[200px]">
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={dailyTrendData}>
                  <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Bar
                    dataKey="expense"
                    name="Expenses"
                    fill="#0d9488"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Latest Transactions & Recent Receipt Processing Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Transactions */}
        <div
          className={`lg:col-span-2 p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Latest Confirmed Transactions</h3>
            <button
              type="button"
              onClick={() => setActiveSection("transactions")}
              className="text-xs text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Full Transaction Ledger</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-800/50">
            {latestTransactions.map((tx) => (
              <div
                key={tx.id}
                className="py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    <span>{tx.merchant}</span>
                    {tx.receipt_id && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-400 text-[10px]">
                        <Receipt className="h-2.5 w-2.5" />
                        <span>Receipt</span>
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                      {tx.entry_source.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatDubaiDate(tx.transaction_date, tx.transaction_time)} •{" "}
                    {tx.category_name}
                  </div>
                </div>
                <div
                  className={`font-bold shrink-0 ${
                    tx.transaction_type === "income" ||
                    tx.transaction_type === "refund"
                      ? "text-emerald-400"
                      : tx.transaction_type === "cc_repayment"
                      ? "text-sky-400"
                      : "text-slate-100"
                  }`}
                >
                  {tx.transaction_type === "income" ||
                  tx.transaction_type === "refund"
                    ? "+"
                    : ""}
                  {formatCurrency(tx.amount, tx.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Receipt / OCR Processing Activity */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-teal-400" />
              <h3 className="text-sm font-bold">Recent Extraction Activity</h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection("add")}
              className="text-xs text-teal-400 hover:underline cursor-pointer"
            >
              Scan New
            </button>
          </div>

          {recentJobs.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No receipt or SMS extractions recorded yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    job.status === "failed"
                      ? "bg-rose-950/30 border-rose-700/50"
                      : theme === "dark"
                      ? "bg-slate-950/60 border-slate-800"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase text-[10px] tracking-wider text-slate-400">
                      {job.source_type.replace("_", " ")}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        job.status === "confirmed"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : job.status === "failed"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {job.status === "confirmed" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      <span>{job.status.replace("_", " ")}</span>
                    </span>
                  </div>
                  <div className="truncate font-medium">
                    {job.raw_input_preview}
                  </div>
                  {job.error_message && (
                    <div className="text-[11px] text-rose-300">
                      {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transparent Accounting Rules Documentation Box */}
      <div
        className={`p-4 rounded-2xl border text-xs space-y-2 ${
          theme === "dark"
            ? "bg-slate-900/50 border-slate-800/80 text-slate-300"
            : "bg-slate-100 border-slate-200 text-slate-700"
        }`}
      >
        <div className="flex items-center gap-2 font-bold text-teal-400">
          <Info className="h-4 w-4" />
          <span>
            Accounting &amp; Anti-Double-Counting Rules (Exact Integer Fils Math)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-400">
          <div>
            <strong className="text-slate-200">
              1. Credit Card Spend vs. Repayment:
            </strong>{" "}
            Purchases made on a credit card are recorded as expenses on the
            transaction date and increase card liability. When you pay your
            credit card bill from a bank account (`cc_repayment`), it settles
            the liability and reduces bank cash without being counted a second
            time as an expense.
          </div>
          <div>
            <strong className="text-slate-200">
              2. Estimated vs. Actual Balances:
            </strong>{" "}
            Monthly Remaining Income = Recorded Income − Confirmed Net Expenses.
            Estimated Available Funds = Opening Bank Funds + Income − Net
            Expenses − Unpaid Prior Statement Obligations. Actual Bank Balances
            are shown only when manually verified.
          </div>
          <div>
            <strong className="text-slate-200">
              3. Scheduled vs. Confirmed Items:
            </strong>{" "}
            Upcoming recurring bills, declined card alerts, and unconfirmed OCR
            extractions never alter your confirmed spending totals until you
            explicitly confirm them.
          </div>
        </div>
      </div>
    </div>
  );
}
