"use client";

import React, { useMemo, useState } from "react";
import { Plus, Check, Trash2 } from "lucide-react";
import { useFinance } from "@/context/finance-context";
import {
  calculateAccountingSummary,
  calculateCardOutstanding,
  formatCurrency,
  fromFils,
  toFils,
} from "@/lib/money";
import {
  computeNextCardCycleDates,
  daysBetweenDubaiDates,
  formatDubaiDate,
  getDubaiToday,
} from "@/lib/dubai-time";
import { AccountType, CardNetwork, CardType, LoanType } from "@/lib/types";

export function CardsBillsView() {
  const { state, selectedMonth, mutateFinance } = useFinance();

  const [showAddLoan, setShowAddLoan] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddStatement, setShowAddStatement] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Add Personal Loan / Installment Plan Form
  const [loanName, setLoanName] = useState("");
  const [lenderName, setLenderName] = useState("Emirates NBD");
  const [loanType, setLoanType] = useState<LoanType>("personal_loan");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [outstandingPrincipal, setOutstandingPrincipal] = useState("");
  const [interestApr, setInterestApr] = useState("3.99");
  const [monthlyEmi, setMonthlyEmi] = useState("");
  const [totalInstallments, setTotalInstallments] = useState("36");
  const [paidInstallments, setPaidInstallments] = useState("0");
  const [nextLoanDueDate, setNextLoanDueDate] = useState("2026-11-01");

  // Custom Loan Payment Form
  const [payLoanId, setPayLoanId] = useState("");
  const [payLoanAmount, setPayLoanAmount] = useState("");
  const [payLoanDate, setPayLoanDate] = useState(() => getDubaiToday());

  // Add Card Form
  const [cardDisplayName, setCardDisplayName] = useState("");
  const [cardBankName, setCardBankName] = useState("Emirates NBD");
  const [cardType, setCardType] = useState<CardType>("credit");
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>("Visa");
  const [cardLastFour, setCardLastFour] = useState("");
  const [cardLimit, setCardLimit] = useState("25000");
  const [cardCloseDay, setCardCloseDay] = useState("15");
  const [cardDueDay, setCardDueDay] = useState("5");
  const [cardOpeningBalance, setCardOpeningBalance] = useState("0");
  const [cardIsManual, setCardIsManual] = useState(false);

  // Add Account Form
  const [accDisplayName, setAccDisplayName] = useState("");
  const [accBankName, setAccBankName] = useState("ADCB");
  const [accType, setAccType] = useState<AccountType>("checking");
  const [accLastFour, setAccLastFour] = useState("");
  const [accOpeningBalance, setAccOpeningBalance] = useState("10000");
  const [accManualBalance, setAccManualBalance] = useState("10000");
  const [accIsVerified, setAccIsVerified] = useState(true);

  // Add Statement Form
  const [stmtCardId, setStmtCardId] = useState("");
  const [stmtPeriod, setStmtPeriod] = useState("16 Oct 2026 – 15 Nov 2026");
  const [stmtStart, setStmtStart] = useState("2026-10-16");
  const [stmtClose, setStmtClose] = useState("2026-11-15");
  const [stmtDue, setStmtDue] = useState("2026-12-05");
  const [stmtBalance, setStmtBalance] = useState("");
  const stmtMinDue = "100";

  // Record Card Repayment Form
  const [payCardId, setPayCardId] = useState("");
  const [payStatementId, setPayStatementId] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => getDubaiToday());
  const [payRef, setPayRef] = useState("");

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

  if (!state || !summary) return null;

  const today = getDubaiToday();
  const creditCards = state.cards.filter((c) => c.card_type === "credit");
  const loans = state.loans || [];
  const activeLoans = loans.filter((l) => l.status !== "paid_off");

  // Unified Due-Date Calendar combining Credit Card Statements + Personal Loan EMIs
  const unifiedDueSchedule = [
    ...state.statements
      .filter((s) => s.status !== "paid")
      .map((s) => {
        const card = state.cards.find((c) => c.id === s.card_id);
        return {
          id: `due_stmt_${s.id}`,
          kind: "card_statement" as const,
          refId: s.id,
          cardId: s.card_id,
          title: `${card?.display_name || "Credit Card"} (••${card?.last_four || "0000"})`,
          subtitle: `Statement ${s.statement_period_label} · Min due ${formatCurrency(s.minimum_payment)}`,
          dueDate: s.payment_due_date,
          amountDue: s.outstanding_balance,
          statusLabel: s.status.replace("_", " "),
        };
      }),
    ...activeLoans.map((l) => ({
      id: `due_loan_${l.id}`,
      kind: "loan_emi" as const,
      refId: l.id,
      cardId: null,
      title: `${l.loan_name} (${l.lender_name})`,
      subtitle: `Installment ${l.paid_installments + 1} of ${l.total_installments} · Remaining principal ${formatCurrency(l.outstanding_principal)}`,
      dueDate: l.next_payment_due_date,
      amountDue: l.monthly_emi,
      statusLabel:
        l.loan_type === "personal_loan"
          ? "Personal loan EMI"
          : l.loan_type.replace(/_/g, " "),
    })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const dueDay = Number(nextLoanDueDate.slice(8, 10)) || 1;
    const res = await mutateFinance("create_loan", {
      loan: {
        loan_name: loanName,
        lender_name: lenderName,
        loan_type: loanType,
        currency: "AED",
        principal_amount: Number(principalAmount),
        outstanding_principal: Number(outstandingPrincipal || principalAmount),
        interest_rate_apr: Number(interestApr),
        monthly_emi: Number(monthlyEmi),
        total_installments: Number(totalInstallments),
        paid_installments: Number(paidInstallments),
        start_date: today,
        next_payment_due_date: nextLoanDueDate,
        due_day_of_month: dueDay,
        linked_account_id: state.accounts[0]?.id ?? null,
      },
    });
    if (!res.ok) {
      setFeedback({ type: "error", text: res.error || "Failed to add loan" });
      return;
    }
    setFeedback({
      type: "success",
      text: `Added ${loanName} (${lenderName}, monthly EMI ${formatCurrency(Number(monthlyEmi))}).`,
    });
    setLoanName("");
    setPrincipalAmount("");
    setOutstandingPrincipal("");
    setMonthlyEmi("");
    setShowAddLoan(false);
  };

  const handleRecordLoanPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const targetId = payLoanId || activeLoans[0]?.id || "";
    const targetLoan = loans.find((l) => l.id === targetId);
    const amountNum = Number(payLoanAmount || targetLoan?.monthly_emi || 0);

    const res = await mutateFinance("record_loan_payment", {
      payment: {
        loan_id: targetId,
        source_account_id: state.accounts[0]?.id ?? null,
        amount: amountNum,
        payment_date: payLoanDate,
      },
    });
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: res.error || "Failed to record loan payment",
      });
      return;
    }
    setFeedback({
      type: "success",
      text: `Recorded AED ${amountNum.toFixed(2)} loan payment towards ${targetLoan?.loan_name || "loan"}. Principal balance and remaining tenure updated.`,
    });
    setPayLoanAmount("");
  };

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await mutateFinance("create_card", {
      card: {
        display_name: cardDisplayName,
        bank_name: cardBankName,
        card_type: cardType,
        card_network: cardNetwork,
        currency: "AED",
        last_four: cardLastFour,
        credit_limit: cardType === "credit" ? Number(cardLimit) : null,
        billing_cycle_closing_day:
          cardType === "credit" ? Number(cardCloseDay) : null,
        payment_due_day: cardType === "credit" ? Number(cardDueDay) : null,
        opening_balance: Number(cardOpeningBalance),
        current_outstanding_balance: Number(cardOpeningBalance),
        statement_balance: Number(cardOpeningBalance),
        is_balance_manual: cardIsManual,
        is_active: true,
      },
    });
    if (!res.ok) {
      setFeedback({ type: "error", text: res.error || "Failed to add card" });
      return;
    }
    setFeedback({
      type: "success",
      text: `Added ${cardDisplayName} (••${cardLastFour}) safely.`,
    });
    setCardDisplayName("");
    setCardLastFour("");
    setShowAddCard(false);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await mutateFinance("create_account", {
      account: {
        display_name: accDisplayName,
        bank_name: accBankName,
        account_type: accType,
        currency: "AED",
        last_four: accLastFour,
        opening_balance: Number(accOpeningBalance),
        manual_balance: accIsVerified ? Number(accManualBalance) : null,
        is_manual_balance_verified: accIsVerified,
        is_active: true,
      },
    });
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: res.error || "Failed to add bank account",
      });
      return;
    }
    setFeedback({
      type: "success",
      text: `Added bank account ${accDisplayName}.`,
    });
    setAccDisplayName("");
    setAccLastFour("");
    setShowAddAccount(false);
  };

  const handleCreateStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const targetCardId = stmtCardId || creditCards[0]?.id || "";
    const res = await mutateFinance("create_statement", {
      statement: {
        card_id: targetCardId,
        statement_period_label: stmtPeriod,
        period_start_date: stmtStart,
        closing_date: stmtClose,
        payment_due_date: stmtDue,
        statement_balance: Number(stmtBalance),
        minimum_payment: Number(stmtMinDue),
        amount_paid: 0,
      },
    });
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: res.error || "Failed to record statement",
      });
      return;
    }
    setFeedback({
      type: "success",
      text: "Statement recorded and added to bill reminder schedule.",
    });
    setStmtBalance("");
    setShowAddStatement(false);
  };

  const handleRecordRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const targetCard = payCardId || creditCards[0]?.id || "";
    const targetStmt =
      payStatementId ||
      state.statements.find(
        (s) => s.card_id === targetCard && s.status !== "paid"
      )?.id ||
      null;

    const res = await mutateFinance("record_cc_repayment", {
      repayment: {
        card_id: targetCard,
        statement_id: targetStmt,
        source_account_id: payAccountId || state.accounts[0]?.id || null,
        amount: Number(payAmount),
        payment_date: payDate,
        reference_number: payRef || `CCPAY-${payDate.replace(/-/g, "")}`,
        notes: "Credit card bill payment (liability transfer)",
      },
    });

    if (!res.ok) {
      setFeedback({
        type: "error",
        text: res.error || "Failed to record credit card payment",
      });
      return;
    }

    setFeedback({
      type: "success",
      text: `Recorded AED ${Number(payAmount).toFixed(
        2
      )} credit card repayment. Statement balance & card liability updated without double-counting expenses.`,
    });
    setPayAmount("");
    setPayRef("");
  };

  return (
    <div className="space-y-4">
      <div className="title-row">
        <div>
          <h1>Cards, Personal Loans &amp; Debt Center</h1>
          <p className="sub">
            Manage all credit card statements on their due dates, personal
            loans, 0% installment plans, and bank accounts in one place.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="open-add-loan-btn"
            onClick={() => setShowAddLoan((v) => !v)}
            className="btn primary"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add personal loan / EMI</span>
          </button>
          <button
            type="button"
            data-testid="open-add-card-btn"
            onClick={() => setShowAddCard((v) => !v)}
            className="btn"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add card</span>
          </button>
          <button
            type="button"
            data-testid="open-add-account-btn"
            onClick={() => setShowAddAccount((v) => !v)}
            className="btn"
          >
            Add bank account
          </button>
        </div>
      </div>

      {/* Divided Debt & UAE DBR KPI Strip */}
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Total combined debt (cards + loans)</div>
          <div
            data-testid="kpi-total-combined-debt"
            className="kpi-value lead"
          >
            {formatCurrency(summary.totalCombinedDebt)}
          </div>
          <div className="kpi-delta">
            {creditCards.length} credit cards · {activeLoans.length} active
            loan(s)
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Credit card outstanding</div>
          <div className="kpi-value">
            {formatCurrency(summary.totalCreditCardOutstanding)}
          </div>
          <div className="kpi-delta">
            {summary.overallCardUtilizationPct}% of{" "}
            {formatCurrency(summary.totalCreditLimit)} limit
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Personal loans &amp; installments</div>
          <div data-testid="kpi-loans-outstanding" className="kpi-value">
            {formatCurrency(summary.totalLoansOutstanding)}
          </div>
          <div className="kpi-delta">
            Monthly EMIs: {formatCurrency(summary.monthlyLoanEmiTotal)}
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">UAE Debt Burden Ratio (DBR)</div>
          <div className="kpi-value">{summary.debtBurdenRatioPct}%</div>
          <div className="kpi-delta">
            <span className={summary.debtBurdenRatioPct <= 50 ? "pos" : "neg"}>
              {summary.debtBurdenRatioPct <= 50
                ? "Within UAE Central Bank 50% limit"
                : "Above 50% DBR cap"}
            </span>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          data-testid="cards-feedback-banner"
          className={`p-3.5 rounded-[6px] text-[13px] ${
            feedback.type === "success"
              ? "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]"
              : "bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Add Personal Loan / Installment Plan Form */}
      {showAddLoan && (
        <form
          onSubmit={handleCreateLoan}
          data-testid="add-loan-form"
          className="panel space-y-4"
        >
          <div className="panel-header">
            <h2>Add personal loan, auto loan, or 0% installment plan</h2>
            <span className="pill">Tracks EMI due dates &amp; principal</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Loan / plan name *
              </label>
              <input
                type="text"
                required
                data-testid="loan-name-input"
                value={loanName}
                onChange={(e) => setLoanName(e.target.value)}
                placeholder="ADCB Auto Loan / Personal Loan"
                className="input-control"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Bank / lender *
              </label>
              <input
                type="text"
                required
                data-testid="loan-lender-input"
                value={lenderName}
                onChange={(e) => setLenderName(e.target.value)}
                placeholder="Emirates NBD / ADCB / Tabby"
                className="input-control"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">Loan type</label>
              <select
                value={loanType}
                onChange={(e) => setLoanType(e.target.value as LoanType)}
                className="input-control"
              >
                <option value="personal_loan">Personal loan</option>
                <option value="auto_loan">Auto / car loan</option>
                <option value="home_mortgage">Home mortgage</option>
                <option value="card_installment_plan">
                  0% Credit card installment (EPP)
                </option>
                <option value="bnpl_installment">
                  Tabby / Tamara BNPL installment
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Monthly EMI / payment (AED) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="loan-emi-input"
                value={monthlyEmi}
                onChange={(e) => setMonthlyEmi(e.target.value)}
                placeholder="2450.00"
                className="input-control font-semibold num"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Original loan amount (AED) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="loan-principal-input"
                value={principalAmount}
                onChange={(e) => {
                  setPrincipalAmount(e.target.value);
                  if (!outstandingPrincipal) {
                    setOutstandingPrincipal(e.target.value);
                  }
                }}
                placeholder="90000.00"
                className="input-control num"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Remaining principal balance (AED) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={outstandingPrincipal}
                onChange={(e) => setOutstandingPrincipal(e.target.value)}
                placeholder="65000.00"
                className="input-control num"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Interest rate (% APR)
              </label>
              <input
                type="number"
                step="0.01"
                value={interestApr}
                onChange={(e) => setInterestApr(e.target.value)}
                className="input-control num"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Next EMI due date *
              </label>
              <input
                type="date"
                required
                data-testid="loan-due-date-input"
                value={nextLoanDueDate}
                onChange={(e) => setNextLoanDueDate(e.target.value)}
                className="input-control"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Total installments (months)
              </label>
              <input
                type="number"
                min={1}
                max={360}
                value={totalInstallments}
                onChange={(e) => setTotalInstallments(e.target.value)}
                className="input-control num"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Installments already paid
              </label>
              <input
                type="number"
                min={0}
                max={360}
                value={paidInstallments}
                onChange={(e) => setPaidInstallments(e.target.value)}
                className="input-control num"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddLoan(false)}
              className="btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="submit-new-loan-btn"
              className="btn primary"
            >
              Save personal loan / EMI
            </button>
          </div>
        </form>
      )}

      {/* Add Card Form */}
      {showAddCard && (
        <form
          onSubmit={handleCreateCard}
          data-testid="add-card-form"
          className="panel space-y-4"
        >
          <div className="panel-header">
            <h2>Register debit or credit card (safe identifiers only)</h2>
            <span className="pill">Last 4 digits only · Never full PAN/CVV</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Card display name *
              </label>
              <input
                type="text"
                required
                data-testid="card-display-name-input"
                value={cardDisplayName}
                onChange={(e) => setCardDisplayName(e.target.value)}
                placeholder="ADCB Traveller World"
                className="input-control"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Bank name *
              </label>
              <input
                type="text"
                required
                value={cardBankName}
                onChange={(e) => setCardBankName(e.target.value)}
                className="input-control"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">Card type</label>
              <select
                value={cardType}
                onChange={(e) => setCardType(e.target.value as CardType)}
                className="input-control"
              >
                <option value="credit">Credit card</option>
                <option value="debit">Debit card</option>
                <option value="prepaid">Prepaid card</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">Network</label>
              <select
                value={cardNetwork}
                onChange={(e) => setCardNetwork(e.target.value as CardNetwork)}
                className="input-control"
              >
                <option value="Visa">Visa</option>
                <option value="Mastercard">Mastercard</option>
                <option value="Amex">Amex</option>
                <option value="Jaywan">Jaywan (UAE)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Last 4 digits only *
              </label>
              <input
                type="text"
                required
                maxLength={4}
                data-testid="card-last-four-input"
                value={cardLastFour}
                onChange={(e) => setCardLastFour(e.target.value)}
                placeholder="5512"
                className="input-control num"
              />
            </div>
            {cardType === "credit" && (
              <>
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium">
                    Credit limit (AED)
                  </label>
                  <input
                    type="number"
                    value={cardLimit}
                    onChange={(e) => setCardLimit(e.target.value)}
                    className="input-control num"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium">
                    Statement closing day (1–28)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={cardCloseDay}
                    onChange={(e) => setCardCloseDay(e.target.value)}
                    className="input-control num"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium">
                    Payment due day (1–28)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={cardDueDay}
                    onChange={(e) => setCardDueDay(e.target.value)}
                    className="input-control num"
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Opening balance (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={cardOpeningBalance}
                onChange={(e) => setCardOpeningBalance(e.target.value)}
                className="input-control num"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-[13px] text-[var(--muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={cardIsManual}
                onChange={(e) => setCardIsManual(e.target.checked)}
              />
              <span>
                Use manual balance override instead of transaction-calculated
                balance
              </span>
            </label>
            <button
              type="submit"
              data-testid="submit-new-card-btn"
              className="btn primary"
            >
              Save card
            </button>
          </div>
        </form>
      )}

      {/* Add Bank Account Form */}
      {showAddAccount && (
        <form onSubmit={handleCreateAccount} className="panel space-y-4">
          <h2 className="text-[16px] font-semibold">
            Register UAE bank account
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Account display name *
              </label>
              <input
                type="text"
                required
                value={accDisplayName}
                onChange={(e) => setAccDisplayName(e.target.value)}
                placeholder="ADCB Active Saver"
                className="input-control"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Bank name *
              </label>
              <input
                type="text"
                required
                value={accBankName}
                onChange={(e) => setAccBankName(e.target.value)}
                className="input-control"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Account type
              </label>
              <select
                value={accType}
                onChange={(e) => setAccType(e.target.value as AccountType)}
                className="input-control"
              >
                <option value="salary">Salary account</option>
                <option value="checking">Current / Checking</option>
                <option value="savings">Savings</option>
                <option value="wallet">Digital wallet</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Last 4 digits (optional)
              </label>
              <input
                type="text"
                maxLength={4}
                value={accLastFour}
                onChange={(e) => setAccLastFour(e.target.value)}
                placeholder="1234"
                className="input-control num"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Opening balance (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={accOpeningBalance}
                onChange={(e) => setAccOpeningBalance(e.target.value)}
                className="input-control num"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Verified actual bank balance (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={accManualBalance}
                onChange={(e) => setAccManualBalance(e.target.value)}
                className="input-control num"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
              <input
                type="checkbox"
                checked={accIsVerified}
                onChange={(e) => setAccIsVerified(e.target.checked)}
              />
              <span>Mark as manually verified actual bank balance</span>
            </label>
            <button type="submit" className="btn primary">
              Save bank account
            </button>
          </div>
        </form>
      )}

      {/* UNIFIED DUE-DATE SCHEDULE: Credit Card Statements + Personal Loan EMIs */}
      <section className="panel p-0 overflow-hidden">
        <div className="p-5 pb-3 panel-header mb-0">
          <div>
            <h2>Upcoming payment due-date schedule (Credit Cards &amp; Loans)</h2>
            <p className="panel-meta">
              Sorted by due date in Asia/Dubai · Click Pay on due date to
              record payment in one tap
            </p>
          </div>
          <span className="pill">{unifiedDueSchedule.length} upcoming</span>
        </div>

        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Obligation &amp; details</th>
                <th>Type</th>
                <th>Due date (GST)</th>
                <th className="n">Amount due</th>
                <th className="n">One-click action</th>
              </tr>
            </thead>
            <tbody>
              {unifiedDueSchedule.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-6 text-center text-[var(--muted)]"
                  >
                    All credit card statements and loan installments are paid.
                  </td>
                </tr>
              ) : (
                unifiedDueSchedule.map((item) => {
                  const daysLeft = daysBetweenDubaiDates(today, item.dueDate);
                  const isOverdue = daysLeft < 0;

                  return (
                    <tr key={item.id} data-testid={`unified-due-${item.refId}`}>
                      <td>
                        <div className="font-medium">{item.title}</div>
                        <div className="text-[12px] text-[var(--muted)]">
                          {item.subtitle}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            isOverdue
                              ? "neg"
                              : item.kind === "loan_emi"
                              ? ""
                              : "warn"
                          }`}
                        >
                          {item.statusLabel}
                        </span>
                      </td>
                      <td className="num">
                        <div className="font-medium">
                          {formatDubaiDate(item.dueDate)}
                        </div>
                        <div className="text-[12px] text-[var(--muted)]">
                          {daysLeft === 0
                            ? "Due today"
                            : daysLeft > 0
                            ? `in ${daysLeft} days`
                            : `${Math.abs(daysLeft)}d overdue`}
                        </div>
                      </td>
                      <td className="n font-semibold">
                        {formatCurrency(item.amountDue)}
                      </td>
                      <td className="n">
                        <button
                          type="button"
                          data-testid={`quick-pay-${item.refId}`}
                          onClick={async () => {
                            if (item.kind === "card_statement" && item.cardId) {
                              const res = await mutateFinance(
                                "record_cc_repayment",
                                {
                                  repayment: {
                                    card_id: item.cardId,
                                    statement_id: item.refId,
                                    source_account_id:
                                      state.accounts[0]?.id ?? null,
                                    amount: item.amountDue,
                                    payment_date: today,
                                    notes: "Paid from due-date schedule",
                                  },
                                }
                              );
                              if (res.ok) {
                                setFeedback({
                                  type: "success",
                                  text: `Paid ${formatCurrency(item.amountDue)} for ${item.title} without double-counting expenses.`,
                                });
                              }
                            } else {
                              const res = await mutateFinance(
                                "record_loan_payment",
                                {
                                  payment: {
                                    loan_id: item.refId,
                                    source_account_id:
                                      state.accounts[0]?.id ?? null,
                                    amount: item.amountDue,
                                    payment_date: today,
                                  },
                                }
                              );
                              if (res.ok) {
                                setFeedback({
                                  type: "success",
                                  text: `Paid ${formatCurrency(item.amountDue)} monthly EMI for ${item.title}.`,
                                });
                              }
                            }
                          }}
                          className="btn primary h-8 px-3 text-[12px]"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Pay {formatCurrency(item.amountDue)}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* PERSONAL LOANS, AUTO LOANS & 0% INSTALLMENT PLANS (7 cols) + RECORD LOAN PAYMENT (5 cols) */}
      <div className="app-grid top">
        <section className="panel space-y-4" style={{ gridColumn: "span 7" }}>
          <div className="panel-header">
            <div>
              <h2>Personal loans, auto loans &amp; 0% installment plans</h2>
              <p className="panel-meta">
                Tracks remaining principal, interest APR, paid vs. remaining
                installments, and next EMI date
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddLoan((v) => !v)}
              className="btn h-8 px-3 text-[12px]"
            >
              + New loan
            </button>
          </div>

          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Loan &amp; lender</th>
                  <th>Progress</th>
                  <th>Next EMI date</th>
                  <th className="n">Monthly EMI</th>
                  <th className="n">Remaining principal</th>
                  <th className="n">Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-[var(--muted)]"
                    >
                      No personal loans or installment plans added yet.
                    </td>
                  </tr>
                ) : (
                  loans.map((loan) => {
                    const pctPaid =
                      loan.total_installments > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (loan.paid_installments /
                                loan.total_installments) *
                                100
                            )
                          )
                        : 0;
                    return (
                      <tr key={loan.id} data-testid={`loan-row-${loan.id}`}>
                        <td>
                          <div className="font-medium">{loan.loan_name}</div>
                          <div className="text-[12px] text-[var(--muted)]">
                            {loan.lender_name} · {loan.interest_rate_apr}% APR ·
                            Orig {formatCurrency(loan.principal_amount)}
                          </div>
                        </td>
                        <td className="num">
                          <div>
                            {loan.paid_installments} of{" "}
                            {loan.total_installments} paid ({pctPaid}%)
                          </div>
                          <div className="text-[12px] text-[var(--muted)]">
                            {loan.remaining_installments} months left
                          </div>
                        </td>
                        <td className="num">
                          {loan.status === "paid_off" ? (
                            <span className="pill pos">Paid off</span>
                          ) : (
                            formatDubaiDate(loan.next_payment_due_date)
                          )}
                        </td>
                        <td className="n font-medium">
                          {formatCurrency(loan.monthly_emi, loan.currency)}
                        </td>
                        <td
                          data-testid={`loan-outstanding-${loan.id}`}
                          className="n font-semibold"
                        >
                          {formatCurrency(
                            loan.outstanding_principal,
                            loan.currency
                          )}
                        </td>
                        <td className="n">
                          <div className="inline-flex items-center gap-1.5">
                            {loan.status !== "paid_off" && (
                              <button
                                type="button"
                                data-testid={`pay-loan-emi-btn-${loan.id}`}
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
                                    setFeedback({
                                      type: "success",
                                      text: `Paid ${formatCurrency(loan.monthly_emi)} EMI for ${loan.loan_name}.`,
                                    });
                                  }
                                }}
                                className="btn h-7 px-2.5 text-[12px]"
                              >
                                Pay EMI
                              </button>
                            )}
                            <button
                              type="button"
                              title="Remove loan"
                              onClick={() =>
                                mutateFinance("delete_loan", { id: loan.id })
                              }
                              className="btn danger h-7 px-2 text-[12px]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Custom Loan EMI / Early Settlement Form */}
        <form
          onSubmit={handleRecordLoanPayment}
          data-testid="loan-payment-form"
          className="panel space-y-3.5"
          style={{ gridColumn: "span 5" }}
        >
          <div>
            <h2 className="text-[16px] font-semibold">
              Record personal loan EMI or extra payoff
            </h2>
            <p className="panel-meta mt-1">
              Automatically splits principal vs. interest, reduces remaining
              loan balance, and advances the next due date by 1 month.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Select loan or installment plan
              </label>
              <select
                data-testid="loan-payment-select"
                value={payLoanId}
                onChange={(e) => {
                  setPayLoanId(e.target.value);
                  const found = loans.find((l) => l.id === e.target.value);
                  if (found) setPayLoanAmount(String(found.monthly_emi));
                }}
                className="input-control"
              >
                {activeLoans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.loan_name} (EMI: {formatCurrency(l.monthly_emi)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
                  Payment amount (AED)
                </label>
                <input
                  type="number"
                  step="0.01"
                  data-testid="loan-payment-amount-input"
                  value={payLoanAmount}
                  onChange={(e) => setPayLoanAmount(e.target.value)}
                  placeholder={
                    activeLoans[0] ? String(activeLoans[0].monthly_emi) : "3540.00"
                  }
                  className="input-control font-semibold num"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
                  Payment date
                </label>
                <input
                  type="date"
                  value={payLoanDate}
                  onChange={(e) => setPayLoanDate(e.target.value)}
                  className="input-control"
                />
              </div>
            </div>

            <button
              type="submit"
              data-testid="submit-loan-payment-btn"
              className="btn primary w-full"
            >
              Record loan EMI payment
            </button>
          </div>
        </form>
      </div>

      {/* Credit Card Statements (7 cols) & Record Card Repayment Form (5 cols) */}
      <div className="app-grid top">
        <section className="panel space-y-4" style={{ gridColumn: "span 7" }}>
          <div className="panel-header">
            <h2>Credit card statements &amp; due dates</h2>
            <button
              type="button"
              onClick={() => setShowAddStatement((v) => !v)}
              className="btn h-8 px-3 text-[12px]"
            >
              + Enter manual statement
            </button>
          </div>

          {showAddStatement && (
            <form
              onSubmit={handleCreateStatement}
              className="p-3.5 rounded-[6px] bg-[var(--raised)] border border-[var(--border)] space-y-3"
            >
              <div className="text-[13px] font-semibold">
                Add statement balance &amp; due date
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select
                  value={stmtCardId}
                  onChange={(e) => setStmtCardId(e.target.value)}
                  className="input-control"
                >
                  {creditCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name} (••{c.last_four})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={stmtPeriod}
                  onChange={(e) => setStmtPeriod(e.target.value)}
                  placeholder="Period label"
                  className="input-control"
                />
                <input
                  type="number"
                  step="0.01"
                  required
                  value={stmtBalance}
                  onChange={(e) => setStmtBalance(e.target.value)}
                  placeholder="Statement balance (AED)"
                  className="input-control num"
                />
                <div className="space-y-1">
                  <label className="block text-[12px] text-[var(--muted)]">
                    Period start
                  </label>
                  <input
                    type="date"
                    value={stmtStart}
                    onChange={(e) => setStmtStart(e.target.value)}
                    className="input-control"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[12px] text-[var(--muted)]">
                    Closing date
                  </label>
                  <input
                    type="date"
                    value={stmtClose}
                    onChange={(e) => setStmtClose(e.target.value)}
                    className="input-control"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[12px] text-[var(--muted)]">
                    Payment due date
                  </label>
                  <input
                    type="date"
                    value={stmtDue}
                    onChange={(e) => setStmtDue(e.target.value)}
                    className="input-control"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="btn primary h-8 px-3">
                  Save statement
                </button>
              </div>
            </form>
          )}

          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Card &amp; period</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th className="n">Statement</th>
                  <th className="n">Paid</th>
                  <th className="n">Remaining due</th>
                </tr>
              </thead>
              <tbody>
                {state.statements.map((stmt) => {
                  const card = state.cards.find((c) => c.id === stmt.card_id);
                  const daysLeft = daysBetweenDubaiDates(
                    today,
                    stmt.payment_due_date
                  );
                  const isOverdue =
                    stmt.status !== "paid" &&
                    (daysLeft < 0 || stmt.status === "overdue");

                  return (
                    <tr key={stmt.id} data-testid={`statement-row-${stmt.id}`}>
                      <td>
                        <div className="font-medium">
                          {card?.display_name} (••{card?.last_four})
                        </div>
                        <div className="text-[12px] text-[var(--muted)]">
                          {stmt.statement_period_label}
                        </div>
                      </td>
                      <td className="num">
                        <div>{formatDubaiDate(stmt.payment_due_date)}</div>
                        <div className="text-[12px] text-[var(--muted)]">
                          Min {formatCurrency(stmt.minimum_payment)}
                        </div>
                      </td>
                      <td>
                        <span
                          data-testid={`statement-status-${stmt.id}`}
                          className={`pill ${
                            stmt.status === "paid"
                              ? "pos"
                              : isOverdue
                              ? "neg"
                              : "warn"
                          }`}
                        >
                          {isOverdue
                            ? "Overdue"
                            : stmt.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="n">
                        {formatCurrency(stmt.statement_balance)}
                      </td>
                      <td className="n text-[var(--positive)]">
                        {formatCurrency(stmt.amount_paid)}
                      </td>
                      <td
                        data-testid={`statement-remaining-${stmt.id}`}
                        className="n font-semibold"
                      >
                        {formatCurrency(stmt.outstanding_balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Record Credit Card Repayment Form */}
        <form
          onSubmit={handleRecordRepayment}
          data-testid="cc-repayment-form"
          className="panel space-y-3.5"
          style={{ gridColumn: "span 5" }}
        >
          <div>
            <h2 className="text-[16px] font-semibold">
              Record custom credit card payment
            </h2>
            <p className="panel-meta mt-1">
              Supports partial or full statement payments without
              double-counting expenses.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Target credit card
              </label>
              <select
                data-testid="repayment-card-select"
                value={payCardId}
                onChange={(e) => setPayCardId(e.target.value)}
                className="input-control"
              >
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} (••{c.last_four})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Apply to statement
              </label>
              <select
                data-testid="repayment-statement-select"
                value={payStatementId}
                onChange={(e) => setPayStatementId(e.target.value)}
                className="input-control"
              >
                <option value="">Auto-select active statement</option>
                {state.statements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.statement_period_label} (Rem:{" "}
                    {formatCurrency(s.outstanding_balance)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Pay from bank account
              </label>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(e.target.value)}
                className="input-control"
              >
                {state.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name} ({a.bank_name})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
                  Payment amount (AED) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  data-testid="repayment-amount-input"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="2850.00"
                  className="input-control font-semibold num"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
                  Payment date
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="input-control"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Payment reference #
              </label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Optional bank transfer ref"
                className="input-control"
              />
            </div>

            <button
              type="submit"
              data-testid="submit-cc-repayment-btn"
              className="btn primary w-full"
            >
              Record card repayment
            </button>
          </div>
        </form>
      </div>

      {/* Registered Cards Ledger Table */}
      <section className="panel p-0 overflow-hidden">
        <div className="p-5 pb-3 panel-header mb-0">
          <h2>Registered debit &amp; credit cards</h2>
          <span className="panel-meta">
            Distinguishes calculated ledger balances from manual overrides
          </span>
        </div>
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Card &amp; bank</th>
                <th>Network &amp; type</th>
                <th>Balance source</th>
                <th>Next closing &amp; due date</th>
                <th className="n">Available credit</th>
                <th className="n">Utilization</th>
                <th className="n">Outstanding balance</th>
              </tr>
            </thead>
            <tbody>
              {state.cards.map((card) => {
                const outBal = calculateCardOutstanding(
                  card,
                  state.transactions
                );
                const limit = card.credit_limit ?? 0;
                const availCredit =
                  card.card_type === "credit"
                    ? Math.max(0, fromFils(toFils(limit) - toFils(outBal)))
                    : null;
                const utilPct =
                  card.card_type === "credit" && limit > 0
                    ? Number(((outBal / limit) * 100).toFixed(1))
                    : 0;
                const cycleDates = computeNextCardCycleDates(
                  today,
                  card.billing_cycle_closing_day,
                  card.payment_due_day,
                  card.due_date_rule_days_after_close
                );

                return (
                  <tr
                    key={card.id}
                    data-testid={`card-item-${card.last_four}`}
                  >
                    <td>
                      <div className="font-medium">{card.display_name}</div>
                      <div className="text-[12px] text-[var(--muted)]">
                        {card.bank_name} · Ending •••• {card.last_four}
                      </div>
                    </td>
                    <td>
                      {card.card_network} · {card.card_type}
                    </td>
                    <td>
                      <span className="pill">
                        {card.is_balance_manual
                          ? "Manual override"
                          : "Calculated from ledger"}
                      </span>
                    </td>
                    <td className="num">
                      {card.card_type === "credit" ? (
                        <div>
                          <div>
                            Closes {formatDubaiDate(cycleDates.nextClosingDate)}
                          </div>
                          <div className="text-[12px] text-[var(--muted)]">
                            Due {formatDubaiDate(cycleDates.nextDueDate)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted)]">
                          Direct debit settlement
                        </span>
                      )}
                    </td>
                    <td className="n">
                      {card.card_type === "credit" ? (
                        <div>
                          <div>{formatCurrency(availCredit, card.currency)}</div>
                          <div className="text-[12px] text-[var(--muted)]">
                            of {formatCurrency(limit, card.currency)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted)]">-</span>
                      )}
                    </td>
                    <td className="n">
                      {card.card_type === "credit" ? `${utilPct}%` : "-"}
                    </td>
                    <td
                      data-testid={`card-outstanding-${card.last_four}`}
                      className="n font-semibold"
                    >
                      {formatCurrency(outBal, card.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bank Accounts Table */}
      <section className="panel p-0 overflow-hidden">
        <div className="p-5 pb-3 panel-header mb-0">
          <h2>Registered UAE bank accounts</h2>
          <span className="panel-meta">
            Actual bank balances are shown only when manually verified
          </span>
        </div>
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Account &amp; bank</th>
                <th>Type</th>
                <th>Verification status</th>
                <th className="n">Opening balance</th>
                <th className="n">Verified actual balance</th>
              </tr>
            </thead>
            <tbody>
              {state.accounts.map((acc) => (
                <tr key={acc.id}>
                  <td>
                    <div className="font-medium">{acc.display_name}</div>
                    <div className="text-[12px] text-[var(--muted)]">
                      {acc.bank_name}{" "}
                      {acc.last_four ? `· •••• ${acc.last_four}` : ""}
                    </div>
                  </td>
                  <td>{acc.account_type}</td>
                  <td>
                    <span
                      className={`pill ${
                        acc.is_manual_balance_verified ? "pos" : "warn"
                      }`}
                    >
                      {acc.is_manual_balance_verified
                        ? "Verified actual balance"
                        : "Unverified opening balance"}
                    </span>
                  </td>
                  <td className="n">
                    {formatCurrency(acc.opening_balance, acc.currency)}
                  </td>
                  <td className="n font-semibold">
                    {acc.is_manual_balance_verified &&
                    acc.manual_balance !== null
                      ? formatCurrency(acc.manual_balance, acc.currency)
                      : "-"}
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
