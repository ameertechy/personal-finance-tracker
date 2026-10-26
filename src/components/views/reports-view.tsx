"use client";

import React, { useMemo } from "react";
import {
  BarChart3,
  Download,
  Printer,
  Sparkles,
  TrendingUp,
  CreditCard,
  Building2,
  Repeat,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { useFinance } from "@/context/finance-context";
import {
  calculateAccountingSummary,
  calculateCardOutstanding,
  calculateCategoryBudgets,
  formatCurrency,
  fromFils,
  toFils,
} from "@/lib/money";
import { formatDubaiDate } from "@/lib/dubai-time";

export function ReportsView() {
  const { state, selectedMonth, theme } = useFinance();

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

  const categoryComparison = useMemo(() => {
    if (!state) return [];
    return calculateCategoryBudgets(
      selectedMonth,
      state.budgets,
      state.transactions
    );
  }, [state, selectedMonth]);

  const merchantSpending = useMemo(() => {
    if (!state) return [];
    const map = new Map<string, { merchant: string; count: number; fils: number }>();
    for (const tx of state.transactions) {
      if (
        !tx.transaction_date.startsWith(selectedMonth) ||
        tx.status !== "confirmed" ||
        tx.transaction_type !== "expense"
      ) {
        continue;
      }
      const existing = map.get(tx.merchant) ?? {
        merchant: tx.merchant,
        count: 0,
        fils: 0,
      };
      existing.count += 1;
      existing.fils += toFils(tx.amount);
      map.set(tx.merchant, existing);
    }
    return Array.from(map.values())
      .map((m) => ({
        merchant: m.merchant,
        count: m.count,
        amount: fromFils(m.fils),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [state, selectedMonth]);

  const monthOverMonthData = useMemo(() => {
    if (!state) return [];
    const months = ["2026-08", "2026-09", "2026-10", "2026-11"];
    return months.map((mKey) => {
      const mSum = calculateAccountingSummary({
        monthKey: mKey,
        monthlySalaryConfigured: state.profile.monthly_salary,
        transactions: state.transactions,
        accounts: state.accounts,
        cards: state.cards,
        statements: state.statements,
        budgets: state.budgets,
        recurring: state.recurring,
      });
      return {
        month: mKey,
        Income: mSum.effectiveMonthlyIncome,
        Expenses: mSum.netExpenses,
        Savings: Math.max(0, mSum.monthlySavings),
      };
    });
  }, [state]);

  // Grounded, non-fabricated insights strictly derived from actual recorded transactions
  const dataDrivenInsights = useMemo(() => {
    if (!state || !summary) return [];
    const insights: string[] = [];

    const confirmedMonthExpenses = state.transactions.filter(
      (t) =>
        t.transaction_date.startsWith(selectedMonth) &&
        t.status === "confirmed" &&
        t.transaction_type === "expense"
    );

    if (confirmedMonthExpenses.length === 0) {
      insights.push(
        `Insufficient confirmed expense data for ${selectedMonth} to generate category anomaly insights.`
      );
      return insights;
    }

    const topCategory = categoryComparison[0];
    if (topCategory && topCategory.spentAmount > 0) {
      insights.push(
        `Highest spending category in ${selectedMonth} is ${
          topCategory.categoryName
        } at ${formatCurrency(topCategory.spentAmount)} (${
          topCategory.utilizationPct
        }% of its ${formatCurrency(topCategory.limitAmount)} budget).`
      );
    }

    const unpaidStatements = state.statements.filter(
      (s) => s.status !== "paid"
    );
    if (unpaidStatements.length > 0) {
      const totalUnpaid = unpaidStatements.reduce(
        (acc, s) => acc + s.outstanding_balance,
        0
      );
      insights.push(
        `You have ${
          unpaidStatements.length
        } open credit card statement(s) totaling ${formatCurrency(
          totalUnpaid
        )}. Next due date is ${formatDubaiDate(
          unpaidStatements[0].payment_due_date
        )}.`
      );
    }

    const activeRecurringFils = state.recurring
      .filter((r) => r.is_active && r.kind === "expense")
      .reduce((acc, r) => acc + toFils(r.amount), 0);

    if (activeRecurringFils > 0) {
      insights.push(
        `Scheduled recurring monthly commitments total ${formatCurrency(
          fromFils(activeRecurringFils)
        )}.`
      );
    }

    return insights;
  }, [state, summary, selectedMonth, categoryComparison]);

  if (!state || !summary) return null;

  const handleExportReportCsv = () => {
    const lines = [
      "Report Section,Item,Metric 1,Metric 2,Metric 3",
      `Summary,Monthly Income,${summary.effectiveMonthlyIncome.toFixed(2)},AED,`,
      `Summary,Net Expenses,${summary.netExpenses.toFixed(2)},AED,`,
      `Summary,Monthly Savings,${summary.monthlySavings.toFixed(2)},AED,${summary.savingsRatePct}%`,
      ...categoryComparison.map(
        (c) =>
          `Category Budget,"${c.categoryName}",Spent: ${c.spentAmount.toFixed(
            2
          )},Budget: ${c.limitAmount.toFixed(2)},${c.utilizationPct}%`
      ),
      ...merchantSpending.map(
        (m) =>
          `Merchant Spend,"${m.merchant}",${m.amount.toFixed(2)},${
            m.count
          } txns,AED`
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dirhampulse_report_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardClass =
    theme === "dark"
      ? "bg-slate-900/90 border-slate-800 text-slate-100"
      : "bg-white border-slate-200 text-slate-900 shadow-sm";

  return (
    <div className="space-y-6">
      {/* Header & Export / Print Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-teal-400" />
            <span>Financial Reports &amp; Analytics ({selectedMonth})</span>
          </h2>
          <p className="text-xs text-slate-400">
            Income vs. Expenses, Budget vs. Actual, Merchant &amp; Card
            Analytics, Bill History
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Report</span>
          </button>
          <button
            type="button"
            data-testid="export-report-csv-btn"
            onClick={handleExportReportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Report CSV</span>
          </button>
        </div>
      </div>

      {/* Data-Backed Financial Insights */}
      <div className={`p-5 rounded-2xl border ${cardClass} space-y-3`}>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-400">
          <Sparkles className="h-4 w-4" />
          <span>Verified Data-Backed Financial Insights</span>
        </div>
        <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
          {dataDrivenInsights.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>

      {/* Month-over-Month Income vs Expenses vs Savings Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-teal-400" />
            <span>Month-over-Month Income vs. Expenses vs. Savings</span>
          </h3>
          <div className="h-64 w-full min-w-[240px]">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthOverMonthData}>
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  formatter={(val) => formatCurrency(Number(val))}
                />
                <Legend />
                <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Savings" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Budget vs Actual Table */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <h3 className="text-sm font-bold">
            Budget vs. Actual Spending ({selectedMonth})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Budget</th>
                  <th className="py-2 text-right">Actual</th>
                  <th className="py-2 text-right">Variance</th>
                  <th className="py-2 text-right">Used %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {categoryComparison.map((row) => (
                  <tr key={row.categoryName}>
                    <td className="py-2 font-medium">{row.categoryName}</td>
                    <td className="py-2 text-right">
                      {formatCurrency(row.limitAmount)}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {formatCurrency(row.spentAmount)}
                    </td>
                    <td
                      className={`py-2 text-right font-semibold ${
                        row.remainingAmount >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {formatCurrency(row.remainingAmount)}
                    </td>
                    <td className="py-2 text-right">{row.utilizationPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Merchant-wise Spending & Credit Card Utilization / Bill Payment History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal-400" />
            <span>Merchant-wise Spending ({selectedMonth})</span>
          </h3>
          {merchantSpending.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No merchant expenses recorded for {selectedMonth}.
            </p>
          ) : (
            <div className="space-y-2.5 text-xs">
              {merchantSpending.map((m) => (
                <div
                  key={m.merchant}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">{m.merchant}</div>
                    <div className="text-[11px] text-slate-400">
                      {m.count} transaction(s)
                    </div>
                  </div>
                  <div className="font-bold">{formatCurrency(m.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Credit Card Utilization & Bill Payment History */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-amber-400" />
            <span>Credit Card Utilization &amp; Bill Payment History</span>
          </h3>

          <div className="space-y-2.5 text-xs">
            {state.cards
              .filter((c) => c.card_type === "credit")
              .map((c) => {
                const out = calculateCardOutstanding(c, state.transactions);
                const limit = c.credit_limit ?? 0;
                const pct =
                  limit > 0 ? Number(((out / limit) * 100).toFixed(1)) : 0;
                return (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold">
                        {c.display_name} (••{c.last_four})
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Limit: {formatCurrency(limit)} • Utilization: {pct}%
                      </div>
                    </div>
                    <div className="text-right font-bold text-amber-400">
                      {formatCurrency(out)}
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="pt-2 border-t border-slate-800/60 space-y-2">
            <div className="text-xs font-bold text-slate-300">
              Recorded Credit Card Repayments
            </div>
            {state.cc_payments.length === 0 ? (
              <p className="text-xs text-slate-400">
                No credit card repayments recorded yet.
              </p>
            ) : (
              state.cc_payments.map((p) => {
                const card = state.cards.find((c) => c.id === p.card_id);
                return (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold">
                        {card?.display_name || "Card"} (••{card?.last_four})
                      </span>
                      <div className="text-[10px] text-slate-400">
                        Paid on {formatDubaiDate(p.payment_date)} • Ref:{" "}
                        {p.reference_number || "—"}
                      </div>
                    </div>
                    <strong className="text-emerald-400">
                      {formatCurrency(p.amount, p.currency)}
                    </strong>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Repeat className="h-3.5 w-3.5 text-teal-400" />
              <span>Active Recurring Commitments:</span>
            </span>
            <strong>
              {
                state.recurring.filter(
                  (r) => r.is_active && r.kind === "expense"
                ).length
              }{" "}
              schedules
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
