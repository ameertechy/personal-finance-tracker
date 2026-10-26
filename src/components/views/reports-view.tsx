"use client";

import React, { useMemo } from "react";
import { Download, Printer } from "lucide-react";
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
import { TasteBarChart, TasteBarList } from "@/components/taste-charts";

export function ReportsView() {
  const { state, selectedMonth } = useFinance();

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
    const map = new Map<
      string,
      { merchant: string; count: number; fils: number }
    >();
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

  const monthOverMonthBars = useMemo(() => {
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
        label: mKey,
        value: mSum.netExpenses,
        secondaryValue: mSum.effectiveMonthlyIncome,
      };
    });
  }, [state]);

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

  return (
    <div className="space-y-4">
      <div className="title-row">
        <div>
          <h1>Reports &amp; Financial Insights · {selectedMonth}</h1>
          <p className="sub">{dataDrivenInsights[0]}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print report</span>
          </button>
          <button
            type="button"
            data-testid="export-report-csv-btn"
            onClick={handleExportReportCsv}
            className="btn primary"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export report CSV</span>
          </button>
        </div>
      </div>

      {/* Month-over-Month Comparison (6 cols) & Budget vs Actual Table (6 cols) */}
      <div className="app-grid top">
        <section className="panel space-y-4" style={{ gridColumn: "span 6" }}>
          <div className="panel-header">
            <h2>Month-over-month expenses vs. income</h2>
            <span className="panel-meta">
              Grey bar: income · Blue/Ink bar: net expenses
            </span>
          </div>
          <TasteBarChart data={monthOverMonthBars} height={205} highlightIndex={2} />

          <div className="pt-3 border-t border-[var(--border)] space-y-1.5 text-[13px] text-[var(--muted)]">
            {dataDrivenInsights.slice(1).map((item, idx) => (
              <p key={idx}>{item}</p>
            ))}
          </div>
        </section>

        <section className="panel space-y-4" style={{ gridColumn: "span 6" }}>
          <div className="panel-header">
            <h2>Budget vs. actual spending ({selectedMonth})</h2>
            <span className="panel-meta">AED</span>
          </div>
          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="n">Budget</th>
                  <th className="n">Actual</th>
                  <th className="n">Variance</th>
                  <th className="n">Used %</th>
                </tr>
              </thead>
              <tbody>
                {categoryComparison.map((row) => (
                  <tr key={row.categoryName}>
                    <td className="font-medium">{row.categoryName}</td>
                    <td className="n">{formatCurrency(row.limitAmount)}</td>
                    <td className="n font-semibold">
                      {formatCurrency(row.spentAmount)}
                    </td>
                    <td
                      className={`n font-medium ${
                        row.remainingAmount >= 0
                          ? "text-[var(--positive)]"
                          : "text-[var(--negative)]"
                      }`}
                    >
                      {formatCurrency(row.remainingAmount)}
                    </td>
                    <td className="n">{row.utilizationPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Merchant-wise Spending (6 cols) & Card Utilization / Payment History (6 cols) */}
      <div className="app-grid top">
        <section className="panel space-y-4" style={{ gridColumn: "span 6" }}>
          <div className="panel-header">
            <h2>Merchant-wise spending ({selectedMonth})</h2>
            <span className="panel-meta">{merchantSpending.length} merchants</span>
          </div>
          <TasteBarList
            rows={merchantSpending.map((m) => ({
              label: m.merchant,
              sub: `${m.count} txn`,
              value: m.amount,
            }))}
          />
        </section>

        <section className="panel space-y-4" style={{ gridColumn: "span 6" }}>
          <div className="panel-header">
            <h2>Credit card utilization &amp; repayment history</h2>
            <span className="panel-meta">AED</span>
          </div>

          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th className="n">Limit</th>
                  <th className="n">Utilization</th>
                  <th className="n">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {state.cards
                  .filter((c) => c.card_type === "credit")
                  .map((c) => {
                    const out = calculateCardOutstanding(
                      c,
                      state.transactions
                    );
                    const limit = c.credit_limit ?? 0;
                    const pct =
                      limit > 0
                        ? Number(((out / limit) * 100).toFixed(1))
                        : 0;
                    return (
                      <tr key={c.id}>
                        <td className="font-medium">
                          {c.display_name} (••{c.last_four})
                        </td>
                        <td className="n">{formatCurrency(limit)}</td>
                        <td className="n">{pct}%</td>
                        <td className="n font-semibold">
                          {formatCurrency(out)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="pt-3 border-t border-[var(--border)]">
            <div className="text-[13px] font-semibold mb-2">
              Recorded credit card repayments
            </div>
            <div className="table-wrap">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Card &amp; reference</th>
                    <th className="n">Payment date</th>
                    <th className="n">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {state.cc_payments.map((p) => {
                    const card = state.cards.find((c) => c.id === p.card_id);
                    return (
                      <tr key={p.id}>
                        <td>
                          {card?.display_name || "Card"} (••{card?.last_four}) ·{" "}
                          <code>{p.reference_number || "-"}</code>
                        </td>
                        <td className="n">{formatDubaiDate(p.payment_date)}</td>
                        <td className="n font-semibold text-[var(--positive)]">
                          {formatCurrency(p.amount, p.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
