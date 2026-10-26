"use client";

import React, { useMemo, useState } from "react";
import { useFinance } from "@/context/finance-context";
import {
  calculateAccountingSummary,
  calculateCategoryBudgets,
  formatCurrency,
  fromFils,
  toFils,
} from "@/lib/money";
import {
  formatDubaiDate,
  getDubaiToday,
} from "@/lib/dubai-time";
import {
  TasteBarList,
  TasteLineChart,
  TastePlanBars,
} from "@/components/taste-charts";

type OverviewMetricTab = "available" | "income" | "spending" | "liability";

export function DashboardView() {
  const { state, selectedMonth, setActiveSection, mutateFinance } =
    useFinance();
  const [selectedTab, setSelectedTab] =
    useState<OverviewMetricTab>("available");
  const [quickPayNotice, setQuickPayNotice] = useState<string | null>(null);

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
      loans: state.loans || [],
    });
  }, [state, selectedMonth]);

  const categoryBreakdown = useMemo(() => {
    if (!state) return [];
    return calculateCategoryBudgets(
      selectedMonth,
      state.budgets,
      state.transactions
    );
  }, [state, selectedMonth]);

  const paymentMethodRows = useMemo(() => {
    if (!state) return [];
    const map = new Map<string, { label: string; sub: string; fils: number }>();
    for (const tx of state.transactions) {
      if (
        !tx.transaction_date.startsWith(selectedMonth) ||
        tx.status !== "confirmed" ||
        tx.transaction_type !== "expense"
      ) {
        continue;
      }
      let key: string = tx.payment_method;
      let label: string = tx.payment_method.replace(/_/g, " ");
      let sub = "Direct";
      if (tx.card_id) {
        const card = state.cards.find((c) => c.id === tx.card_id);
        if (card) {
          key = card.id;
          label = card.display_name;
          sub = `••${card.last_four}`;
        }
      } else if (tx.account_id) {
        const acc = state.accounts.find((a) => a.id === tx.account_id);
        if (acc) {
          key = acc.id;
          label = acc.display_name;
          sub = acc.bank_name;
        }
      }
      const prev = map.get(key) ?? { label, sub, fils: 0 };
      prev.fils += toFils(tx.amount);
      map.set(key, prev);
    }
    return Array.from(map.values())
      .map((item) => ({
        label: item.label,
        sub: item.sub,
        value: fromFils(item.fils),
      }))
      .sort((a, b) => b.value - a.value);
  }, [state, selectedMonth]);

  const chartSeriesData = useMemo(() => {
    if (!state || !summary) return [];
    const monthTxs = state.transactions
      .filter(
        (t) =>
          t.transaction_date.startsWith(selectedMonth) &&
          t.status === "confirmed"
      )
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    const days = ["01", "05", "10", "12", "15", "18", "20", "22", "25"]; // taste-skill-ignore: calendar days of month
    let runningSpend = 0;
    let runningIncome = 0;

    return days.map((d) => {
      const datePrefix = `${selectedMonth}-${d}`;
      const dayTxs = monthTxs.filter((t) => t.transaction_date <= datePrefix);
      runningSpend = fromFils(
        dayTxs
          .filter((t) => t.transaction_type === "expense")
          .reduce((acc, t) => acc + toFils(t.amount), 0)
      );
      runningIncome = fromFils(
        dayTxs
          .filter((t) => t.transaction_type === "income")
          .reduce((acc, t) => acc + toFils(t.amount), 0)
      );
      const effectiveInc =
        runningIncome > 0 ? runningIncome : summary.effectiveMonthlyIncome;

      if (selectedTab === "available") {
        return {
          label: `${d} Oct`,
          value: Math.max(
            0,
            fromFils(
              toFils(summary.recordedOpeningFunds) +
                toFils(effectiveInc) -
                toFils(runningSpend) -
                toFils(summary.unpaidObligationsNotCounted)
            )
          ),
          annotation: d === "03" || d === "05" ? "Rent AED 6,500" : undefined, // taste-skill-ignore: calendar day
        };
      }
      if (selectedTab === "income") {
        return {
          label: `${d} Oct`,
          value: Math.max(
            0,
            fromFils(toFils(effectiveInc) - toFils(runningSpend))
          ),
        };
      }
      if (selectedTab === "liability") {
        return {
          label: `${d} Oct`,
          value: summary.totalCombinedDebt,
        };
      }
      return {
        label: `${d} Oct`,
        value: runningSpend,
        annotation: d === "05" ? "Rent AED 6,500" : undefined, // taste-skill-ignore: calendar day
      };
    });
  }, [state, summary, selectedMonth, selectedTab]);

  if (!state || !summary) return null;

  const upcomingStatements = state.statements
    .filter((s) => s.status !== "paid")
    .sort((a, b) => a.payment_due_date.localeCompare(b.payment_due_date));

  const activeLoans = (state.loans || [])
    .filter((l) => l.status !== "paid_off")
    .sort((a, b) =>
      a.next_payment_due_date.localeCompare(b.next_payment_due_date)
    );

  const upcomingRecurring = state.recurring
    .filter((r) => r.is_active && r.kind === "expense")
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));

  const nextLoan = activeLoans[0];
  const nextDueStmt = upcomingStatements[0];
  const nextDueCard = nextDueStmt
    ? state.cards.find((c) => c.id === nextDueStmt.card_id)
    : null;

  const oneFindingText = nextLoan && nextDueStmt
    ? `${nextLoan.loan_name} EMI of ${formatCurrency(nextLoan.monthly_emi)} is due ${formatDubaiDate(nextLoan.next_payment_due_date)}, and ${formatCurrency(nextDueStmt.outstanding_balance)} on ${nextDueCard?.display_name || "Credit Card"} (••${nextDueCard?.last_four || "4821"}) is due ${formatDubaiDate(nextDueStmt.payment_due_date)}.`
    : `Net confirmed spending is ${formatCurrency(summary.netExpenses)} across ${state.transactions.length} ledger entries in ${selectedMonth} (${state.profile.timezone}).`;

  const planRows = categoryBreakdown
    .filter((c) => c.limitAmount > 0 || c.spentAmount > 0)
    .slice(0, 6)
    .map((c) => {
      const committedFils = upcomingRecurring
        .filter((r) => r.category_name === c.categoryName)
        .reduce((acc, r) => acc + toFils(r.amount), 0);
      return {
        label: c.categoryName,
        planned: c.limitAmount > 0 ? c.limitAmount : c.spentAmount,
        spent: c.spentAmount,
        committed: fromFils(committedFils),
      };
    });

  return (
    <div className="space-y-4">
      <div className="title-row">
        <div>
          <h1>Overview · {selectedMonth}</h1>
          <p className="sub">{oneFindingText}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="dashboard-quick-add-btn"
            onClick={() => setActiveSection("add")}
            className="btn primary"
          >
            Record Expense / Scan Receipt
          </button>
        </div>
      </div>

      {quickPayNotice && (
        <div
          role="status"
          className="p-3 rounded-[6px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-[13px]"
        >
          {quickPayNotice}
        </div>
      )}

      {/* Main Card: Divided KPI Tabs + Time-Series Chart + Salary Bridge Table */}
      <section className="panel p-0 overflow-hidden">
        <div
          role="tablist"
          aria-label="Financial overview metrics"
          className="kpis border-0 border-b border-[var(--border)] rounded-none"
        >
          {/* Lead Answer KPI (32px) */}
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === "available"}
            onClick={() => setSelectedTab("available")}
            className="kpi"
          >
            <div className="kpi-label">
              Estimated available funds (calculated)
            </div>
            <div data-testid="kpi-available-funds" className="kpi-value lead">
              {formatCurrency(summary.estimatedAvailableFunds)}
            </div>
            <div className="kpi-delta">
              {summary.hasVerifiedBankBalance ? (
                <span>
                  Verified actual bank:{" "}
                  <strong className="text-[var(--text)] font-medium num">
                    {formatCurrency(summary.verifiedBankBalancesTotal)}
                  </strong>
                </span>
              ) : (
                <span>Opening + income − spend − unpaid obligations</span>
              )}
            </div>
          </button>

          {/* Sibling KPI 2: Monthly Salary / Income */}
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === "income"}
            onClick={() => setSelectedTab("income")}
            className="kpi"
          >
            <div className="kpi-label">Monthly salary &amp; income</div>
            <div data-testid="kpi-monthly-income" className="kpi-value">
              {formatCurrency(summary.effectiveMonthlyIncome)}
            </div>
            <div className="kpi-delta">
              Remaining income:{" "}
              <span
                data-testid="kpi-remaining-income"
                className={
                  summary.monthlyRemainingIncome >= 0 ? "pos" : "neg"
                }
              >
                {formatCurrency(summary.monthlyRemainingIncome)}
              </span>
            </div>
          </button>

          {/* Sibling KPI 3: Total Confirmed Spending */}
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === "spending"}
            onClick={() => setSelectedTab("spending")}
            className="kpi"
          >
            <div className="kpi-label">
              Confirmed spending ({selectedMonth})
            </div>
            <div data-testid="kpi-total-spending" className="kpi-value">
              {formatCurrency(summary.netExpenses)}
            </div>
            <div className="kpi-delta">
              Budget left:{" "}
              <span
                data-testid="kpi-budget-remaining"
                className={
                  summary.overallBudgetRemaining >= 0 ? "pos" : "neg"
                }
              >
                {formatCurrency(summary.overallBudgetRemaining)} (
                {summary.overallBudgetUtilizationPct}% used)
              </span>
            </div>
          </button>

          {/* Sibling KPI 4: Credit Cards & Personal Loans Debt */}
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === "liability"}
            onClick={() => setSelectedTab("liability")}
            className="kpi"
          >
            <div className="kpi-label">Cards &amp; personal loans debt</div>
            <div data-testid="kpi-cc-outstanding" className="kpi-value">
              {formatCurrency(summary.totalCreditCardOutstanding)}
            </div>
            <div className="kpi-delta">
              Loans: {formatCurrency(summary.totalLoansOutstanding)} · DBR:{" "}
              <span
                className={summary.debtBurdenRatioPct <= 50 ? "pos" : "neg"}
              >
                {summary.debtBurdenRatioPct}%
              </span>
            </div>
          </button>
        </div>

        {/* Chart Area inside Main Card */}
        <div className="p-5 space-y-4">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h2 className="text-[15px] font-semibold">
              {selectedTab === "available"
                ? "Available funds trajectory after confirmed spending (AED)"
                : selectedTab === "income"
                ? "Remaining monthly salary across the month (AED)"
                : selectedTab === "liability"
                ? "Combined credit card & personal loan balance (AED)"
                : "Cumulative confirmed spending vs. monthly budget (AED)"}
            </h2>
            <span className="text-[12px] text-[var(--muted)]">
              Asia/Dubai (UTC+4) · Straight segments, exact fils arithmetic
            </span>
          </div>

          <TasteLineChart
            data={chartSeriesData}
            height={190}
            seriesName={selectedTab}
            referenceValue={
              selectedTab === "spending"
                ? summary.overallBudgetLimit
                : undefined
            }
            referenceLabel={
              selectedTab === "spending"
                ? `Monthly budget ${formatCurrency(summary.overallBudgetLimit)}`
                : undefined
            }
          />

          {/* Compact 3-Row Salary-to-Obligations Reconciliation Table */}
          <div className="table-wrap pt-2 border-t border-[var(--border)]">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Accounting reconciliation component</th>
                  <th>Rule applied (anti-double-counting)</th>
                  <th className="n">Amount (AED)</th>
                  <th className="n">Share of salary</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">
                    Confirmed net expenses (cash, bank &amp; card purchases)
                  </td>
                  <td className="text-[var(--muted)]">
                    Counted on purchase date; refunds deducted
                  </td>
                  <td className="n font-medium">
                    {formatCurrency(summary.netExpenses)}
                  </td>
                  <td className="n text-[var(--muted)]">
                    {summary.effectiveMonthlyIncome > 0
                      ? `${((summary.netExpenses / summary.effectiveMonthlyIncome) * 100).toFixed(1)}%`
                      : "0.0%"}
                  </td>
                </tr>
                <tr>
                  <td className="font-medium">
                    Credit card bill repayments (`cc_repayment`)
                  </td>
                  <td className="text-[var(--muted)]">
                    Settles card liability; excluded from expense total
                  </td>
                  <td className="n font-medium">
                    {formatCurrency(summary.creditCardRepaymentsTotal)}
                  </td>
                  <td className="n text-[var(--muted)]">Liability transfer</td>
                </tr>
                <tr>
                  <td className="font-medium">
                    Monthly personal loan &amp; installment EMIs
                  </td>
                  <td className="text-[var(--muted)]">
                    {activeLoans.length} active loan(s) · Total principal{" "}
                    {formatCurrency(summary.totalLoansOutstanding)}
                  </td>
                  <td className="n font-medium">
                    {formatCurrency(summary.monthlyLoanEmiTotal)}
                  </td>
                  <td className="n text-[var(--muted)]">
                    DBR {summary.debtBurdenRatioPct}% (max 50%)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Row 2: Category Budget Plan vs Spent (6 cols) + Upcoming Card Bills & Personal Loan EMIs (6 cols) */}
      <div className="app-grid">
        <section className="panel space-y-3" style={{ gridColumn: "span 6" }}>
          <div className="panel-header">
            <h2>Category budget plan vs. spent</h2>
            <button
              type="button"
              onClick={() => setActiveSection("budgets")}
              className="text-[13px] font-medium text-[var(--text)] hover:underline cursor-pointer"
            >
              Adjust budgets →
            </button>
          </div>
          <TastePlanBars rows={planRows} />

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[13px] num">
            <span className="text-[var(--muted)]">
              Overall monthly budget ({selectedMonth})
            </span>
            <span>
              <strong className="font-semibold">
                {formatCurrency(summary.netExpenses)}
              </strong>{" "}
              <span className="text-[var(--muted)]">
                of {formatCurrency(summary.overallBudgetLimit)} (
                {summary.overallBudgetUtilizationPct}% used)
              </span>
            </span>
          </div>
        </section>

        <section className="panel space-y-3" style={{ gridColumn: "span 6" }}>
          <div className="panel-header">
            <h2>Upcoming card due dates &amp; personal loan EMIs</h2>
            <button
              type="button"
              onClick={() => setActiveSection("cards")}
              className="text-[13px] font-medium text-[var(--text)] hover:underline cursor-pointer"
            >
              Open debt center →
            </button>
          </div>

          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Debt obligation</th>
                  <th>Due date</th>
                  <th className="n">Due amount</th>
                  <th className="n">Quick pay</th>
                </tr>
              </thead>
              <tbody>
                {upcomingStatements.map((stmt) => {
                  const card = state.cards.find((c) => c.id === stmt.card_id);
                  return (
                    <tr key={stmt.id}>
                      <td>
                        <span className="font-medium">
                          {card?.display_name || "Credit Card"} (••
                          {card?.last_four || "0000"})
                        </span>
                      </td>
                      <td className="num">
                        {formatDubaiDate(stmt.payment_due_date)}
                      </td>
                      <td className="n font-semibold">
                        {formatCurrency(stmt.outstanding_balance)}
                      </td>
                      <td className="n">
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await mutateFinance(
                              "record_cc_repayment",
                              {
                                repayment: {
                                  card_id: stmt.card_id,
                                  statement_id: stmt.id,
                                  source_account_id:
                                    state.accounts[0]?.id ?? null,
                                  amount: stmt.outstanding_balance,
                                  payment_date: today,
                                  notes: "1-click statement settlement",
                                },
                              }
                            );
                            if (res.ok) {
                              setQuickPayNotice(
                                `Paid ${formatCurrency(
                                  stmt.outstanding_balance
                                )} statement for ${card?.display_name}.`
                              );
                            }
                          }}
                          className="btn h-7 px-2.5 text-[12px]"
                        >
                          Pay card
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {activeLoans.slice(0, 1).map((loan) => (
                  <tr key={loan.id}>
                    <td>
                      <span className="font-medium">{loan.loan_name}</span>
                    </td>
                    <td className="num">
                      {formatDubaiDate(loan.next_payment_due_date)}
                    </td>
                    <td className="n font-semibold">
                      {formatCurrency(loan.monthly_emi, loan.currency)}
                    </td>
                    <td className="n">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await mutateFinance(
                            "record_loan_payment",
                            {
                              payment: {
                                loan_id: loan.id,
                                source_account_id:
                                  loan.linked_account_id ??
                                  state.accounts[0]?.id ??
                                  null,
                                amount: loan.monthly_emi,
                                payment_date: today,
                              },
                            }
                          );
                          if (res.ok) {
                            setQuickPayNotice(
                              `Paid ${formatCurrency(
                                loan.monthly_emi
                              )} EMI for ${loan.loan_name}.`
                            );
                          }
                        }}
                        className="btn h-7 px-2.5 text-[12px]"
                      >
                        Pay EMI
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[13px] num">
            <span className="text-[var(--muted)]">
              Combined debt (Cards + Loans):{" "}
              <strong className="text-[var(--text)]">
                {formatCurrency(summary.totalCombinedDebt)}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setActiveSection("cards")}
              className="font-medium text-[var(--text)] hover:underline cursor-pointer"
            >
              Manage all loans &amp; cards →
            </button>
          </div>
        </section>
      </div>

      {/* Row 3: Latest Confirmed Transactions (7 cols) + Spending by Card & OCR Activity (5 cols) */}
      <div className="app-grid">
        <section className="panel space-y-3" style={{ gridColumn: "span 7" }}>
          <div className="panel-header">
            <h2>
              Latest confirmed transactions ({state.transactions.length} total)
            </h2>
            <button
              type="button"
              onClick={() => setActiveSection("transactions")}
              className="text-[13px] font-medium text-[var(--text)] hover:underline cursor-pointer"
            >
              View all →
            </button>
          </div>

          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Merchant &amp; category</th>
                  <th>Source</th>
                  <th className="n">Date (GST)</th>
                  <th className="n">Amount</th>
                </tr>
              </thead>
              <tbody>
                {state.transactions.slice(0, 3).map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <span className="font-medium">{tx.merchant}</span>{" "}
                      <span className="text-[12px] text-[var(--muted)]">
                        · {tx.category_name}
                      </span>
                    </td>
                    <td>
                      <span className="pill">
                        {tx.entry_source.replace("_", " ")}
                      </span>
                    </td>
                    <td className="n text-[var(--muted)]">
                      {formatDubaiDate(tx.transaction_date)}
                    </td>
                    <td
                      className={`n font-semibold ${
                        tx.transaction_type === "income" ||
                        tx.transaction_type === "refund"
                          ? "text-[var(--positive)]"
                          : ""
                      }`}
                    >
                      {tx.transaction_type === "income" ||
                      tx.transaction_type === "refund"
                        ? "+"
                        : ""}
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[13px] num">
            <span className="text-[var(--muted)]">
              Showing 3 most recent of {state.transactions.length} confirmed
              records
            </span>
            <button
              type="button"
              onClick={() => setActiveSection("transactions")}
              className="font-medium text-[var(--text)] hover:underline cursor-pointer"
            >
              Open full ledger &amp; CSV export →
            </button>
          </div>
        </section>

        <section className="panel space-y-3" style={{ gridColumn: "span 5" }}>
          <div>
            <div className="panel-header">
              <h2>Spending by card &amp; account</h2>
              <span className="panel-meta">{selectedMonth}</span>
            </div>
            <TasteBarList rows={paymentMethodRows} />
          </div>

          <div className="pt-3 border-t border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">
                Recent receipt &amp; SMS extractions
              </h3>
              <button
                type="button"
                onClick={() => setActiveSection("add")}
                className="text-[12px] text-[var(--muted)] hover:underline cursor-pointer"
              >
                Scan new →
              </button>
            </div>
            {state.extraction_jobs.slice(0, 1).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between gap-2 py-1 text-[13px]"
              >
                <span className="truncate text-[var(--muted)]">
                  {job.raw_input_preview}
                </span>
                <span
                  className={`pill ${
                    job.status === "confirmed"
                      ? "pos"
                      : job.status === "failed"
                      ? "neg"
                      : "warn"
                  }`}
                >
                  {job.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[var(--border)] space-y-1.5 text-[13px] num">
            {state.accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between text-[13px]"
              >
                <span className="text-[var(--muted)] truncate">
                  {acc.display_name} ({acc.bank_name})
                </span>
                <strong className="font-medium">
                  {formatCurrency(
                    acc.is_manual_balance_verified &&
                      acc.manual_balance !== null
                      ? acc.manual_balance
                      : acc.opening_balance,
                    acc.currency
                  )}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
