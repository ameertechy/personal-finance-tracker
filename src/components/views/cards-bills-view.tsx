"use client";

import React, { useState } from "react";
import {
  CreditCard,
  Landmark,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  CalendarClock,
  ArrowRight,
  Receipt,
} from "lucide-react";
import { useFinance } from "@/context/finance-context";
import {
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
import { AccountType, CardNetwork, CardType } from "@/lib/types";

export function CardsBillsView() {
  const { state, mutateFinance, theme } = useFinance();

  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddStatement, setShowAddStatement] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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

  // Record Repayment Form
  const [payCardId, setPayCardId] = useState("");
  const [payStatementId, setPayStatementId] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => getDubaiToday());
  const [payRef, setPayRef] = useState("");

  if (!state) return null;

  const today = getDubaiToday();
  const creditCards = state.cards.filter((c) => c.card_type === "credit");

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

  const cardClass =
    theme === "dark"
      ? "bg-slate-900/90 border-slate-800 text-slate-100"
      : "bg-white border-slate-200 text-slate-900 shadow-sm";

  return (
    <div className="space-y-6">
      {/* Header & Security Guarantee */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            Banks, Debit/Credit Cards &amp; Statement Bills
          </h2>
          <p className="text-xs text-slate-400">
            Track card utilization, billing cycles, statement balances, and
            partial/full repayments.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="open-add-account-btn"
            onClick={() => setShowAddAccount((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
          >
            <Landmark className="h-3.5 w-3.5" />
            <span>Add Bank Account</span>
          </button>
          <button
            type="button"
            data-testid="open-add-card-btn"
            onClick={() => setShowAddCard((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Debit / Credit Card</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          data-testid="cards-feedback-banner"
          className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-950/60 border-emerald-700 text-emerald-200"
              : "bg-rose-950/60 border-rose-700 text-rose-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Add Card Form */}
      {showAddCard && (
        <form
          onSubmit={handleCreateCard}
          data-testid="add-card-form"
          className={`p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              Register Debit or Credit Card (Safe Identifiers Only)
            </h3>
            <span className="text-[11px] text-teal-400 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Only Last 4 Digits Stored — Never Full PAN/CVV</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                Card Display Name *
              </label>
              <input
                type="text"
                required
                data-testid="card-display-name-input"
                value={cardDisplayName}
                onChange={(e) => setCardDisplayName(e.target.value)}
                placeholder="e.g. ADCB Traveller World"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Bank Name *</label>
              <input
                type="text"
                required
                value={cardBankName}
                onChange={(e) => setCardBankName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Card Type</label>
              <select
                value={cardType}
                onChange={(e) => setCardType(e.target.value as CardType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="credit">Credit Card</option>
                <option value="debit">Debit Card</option>
                <option value="prepaid">Prepaid Card</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Network</label>
              <select
                value={cardNetwork}
                onChange={(e) => setCardNetwork(e.target.value as CardNetwork)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="Visa">Visa</option>
                <option value="Mastercard">Mastercard</option>
                <option value="Amex">Amex</option>
                <option value="Jaywan">Jaywan (UAE)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                Last 4 Digits Only *
              </label>
              <input
                type="text"
                required
                maxLength={4}
                data-testid="card-last-four-input"
                value={cardLastFour}
                onChange={(e) => setCardLastFour(e.target.value)}
                placeholder="e.g. 5512"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono"
              />
            </div>
            {cardType === "credit" && (
              <>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Credit Limit (AED)
                  </label>
                  <input
                    type="number"
                    value={cardLimit}
                    onChange={(e) => setCardLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Statement Closing Day (1-28)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={cardCloseDay}
                    onChange={(e) => setCardCloseDay(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Payment Due Day (1-28)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={cardDueDay}
                    onChange={(e) => setCardDueDay(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-slate-400 mb-1">
                Opening Balance (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={cardOpeningBalance}
                onChange={(e) => setCardOpeningBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
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
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer"
            >
              Save Card
            </button>
          </div>
        </form>
      )}

      {/* Add Bank Account Form */}
      {showAddAccount && (
        <form
          onSubmit={handleCreateAccount}
          className={`p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <h3 className="text-sm font-bold">Register UAE Bank Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                Account Display Name *
              </label>
              <input
                type="text"
                required
                value={accDisplayName}
                onChange={(e) => setAccDisplayName(e.target.value)}
                placeholder="e.g. ADCB Active Saver"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Bank Name *</label>
              <input
                type="text"
                required
                value={accBankName}
                onChange={(e) => setAccBankName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Account Type</label>
              <select
                value={accType}
                onChange={(e) => setAccType(e.target.value as AccountType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="salary">Salary Account</option>
                <option value="checking">Current / Checking</option>
                <option value="savings">Savings</option>
                <option value="wallet">Digital Wallet</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                Last 4 Digits (Optional)
              </label>
              <input
                type="text"
                maxLength={4}
                value={accLastFour}
                onChange={(e) => setAccLastFour(e.target.value)}
                placeholder="1234"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                Opening Balance (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={accOpeningBalance}
                onChange={(e) => setAccOpeningBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                Verified Actual Bank Balance (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={accManualBalance}
                onChange={(e) => setAccManualBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={accIsVerified}
                onChange={(e) => setAccIsVerified(e.target.checked)}
              />
              <span>Mark as manually verified actual bank balance</span>
            </label>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold cursor-pointer"
            >
              Save Bank Account
            </button>
          </div>
        </form>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {state.cards.map((card) => {
          const outBal = calculateCardOutstanding(card, state.transactions);
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
            <div
              key={card.id}
              data-testid={`card-item-${card.last_four}`}
              className={`p-5 rounded-2xl border ${cardClass} flex flex-col justify-between space-y-4`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-500/15 text-teal-400">
                    {card.card_network} • {card.card_type}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      card.is_balance_manual
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-sky-500/20 text-sky-300"
                    }`}
                  >
                    {card.is_balance_manual
                      ? "Manual Balance"
                      : "Calculated from Ledger"}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold">{card.display_name}</h3>
                  <p className="text-xs text-slate-400">
                    {card.bank_name} • Ending{" "}
                    <strong className="text-slate-200 font-mono">
                      •••• {card.last_four}
                    </strong>
                  </p>
                </div>
              </div>

              {card.card_type === "credit" ? (
                <div className="space-y-3 pt-2 border-t border-slate-800/60 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Current Outstanding:</span>
                    <strong
                      data-testid={`card-outstanding-${card.last_four}`}
                      className="text-base text-amber-400"
                    >
                      {formatCurrency(outBal, card.currency)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Available Credit:</span>
                    <strong className="text-emerald-400">
                      {formatCurrency(availCredit, card.currency)} /{" "}
                      {formatCurrency(limit, card.currency)}
                    </strong>
                  </div>

                  {/* Utilization bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Credit Utilization</span>
                      <span
                        className={
                          utilPct >= 30
                            ? "text-amber-400 font-bold"
                            : "text-teal-400 font-bold"
                        }
                      >
                        {utilPct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          utilPct >= 50
                            ? "bg-rose-500"
                            : utilPct >= 30
                            ? "bg-amber-500"
                            : "bg-teal-500"
                        }`}
                        style={{ width: `${Math.min(100, utilPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-400">
                    <div>
                      <div>Next Statement:</div>
                      <strong className="text-slate-200">
                        {formatDubaiDate(cycleDates.nextClosingDate)}
                      </strong>
                    </div>
                    <div>
                      <div>Next Payment Due:</div>
                      <strong className="text-slate-200">
                        {formatDubaiDate(cycleDates.nextDueDate)}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                  Linked Debit Card • Direct settlement from bank account
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Credit Card Statements & Repayment Module */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Statements List */}
        <div
          className={`lg:col-span-2 p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold">
                Credit Card Statements &amp; Due Date Tracker
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowAddStatement((v) => !v)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-teal-400 cursor-pointer"
            >
              + Enter Manual Statement
            </button>
          </div>

          {showAddStatement && (
            <form
              onSubmit={handleCreateStatement}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs"
            >
              <div className="font-semibold text-teal-400">
                Add Statement Balance &amp; Due Date
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select
                  value={stmtCardId}
                  onChange={(e) => setStmtCardId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
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
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                />
                <input
                  type="number"
                  step="0.01"
                  required
                  value={stmtBalance}
                  onChange={(e) => setStmtBalance(e.target.value)}
                  placeholder="Statement Balance (AED)"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                />
                <div>
                  <label className="block text-[10px] text-slate-400">
                    Period Start
                  </label>
                  <input
                    type="date"
                    value={stmtStart}
                    onChange={(e) => setStmtStart(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">
                    Closing Date
                  </label>
                  <input
                    type="date"
                    value={stmtClose}
                    onChange={(e) => setStmtClose(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">
                    Payment Due Date
                  </label>
                  <input
                    type="date"
                    value={stmtDue}
                    onChange={(e) => setStmtDue(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-teal-600 text-white font-semibold cursor-pointer"
                >
                  Save Statement
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
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
                <div
                  key={stmt.id}
                  data-testid={`statement-row-${stmt.id}`}
                  className={`p-4 rounded-xl border space-y-2 text-xs ${
                    isOverdue
                      ? "bg-rose-950/35 border-rose-600"
                      : stmt.status === "paid"
                      ? "bg-emerald-950/20 border-emerald-800/50"
                      : "bg-slate-950/60 border-slate-800"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-sm">
                      {card?.display_name} (••{card?.last_four}) —{" "}
                      {stmt.statement_period_label}
                    </div>
                    <span
                      data-testid={`statement-status-${stmt.id}`}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        stmt.status === "paid"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : isOverdue
                          ? "bg-rose-500/25 text-rose-200"
                          : stmt.status === "partially_paid"
                          ? "bg-teal-500/20 text-teal-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {isOverdue ? "OVERDUE" : stmt.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">
                        Statement Total:
                      </span>
                      <strong>{formatCurrency(stmt.statement_balance)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Amount Paid:</span>
                      <strong className="text-emerald-400">
                        {formatCurrency(stmt.amount_paid)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">
                        Remaining Due:
                      </span>
                      <strong
                        data-testid={`statement-remaining-${stmt.id}`}
                        className="text-amber-400"
                      >
                        {formatCurrency(stmt.outstanding_balance)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Due Date:</span>
                      <strong>{formatDubaiDate(stmt.payment_due_date)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Record Credit Card Payment Form */}
        <form
          onSubmit={handleRecordRepayment}
          data-testid="cc-repayment-form"
          className={`p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-teal-400" />
            <h3 className="text-sm font-bold">
              Record Credit Card Bill Payment
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Supports partial or full payments. Recorded as a{" "}
            <strong className="text-slate-200">liability transfer</strong> from
            your bank account so your card purchases and bill repayment are
            never double-counted as two expenses.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                Target Credit Card
              </label>
              <select
                data-testid="repayment-card-select"
                value={payCardId}
                onChange={(e) => setPayCardId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} (••{c.last_four})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Apply to Statement
              </label>
              <select
                data-testid="repayment-statement-select"
                value={payStatementId}
                onChange={(e) => setPayStatementId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
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

            <div>
              <label className="block text-slate-400 mb-1">
                Pay From Bank Account
              </label>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                {state.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name} ({a.bank_name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Payment Amount (AED) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="repayment-amount-input"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="e.g. 2850.00"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Payment Date</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Payment Reference #
              </label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Optional bank transfer ref"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <button
              type="submit"
              data-testid="submit-cc-repayment-btn"
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Record Card Repayment</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Registered Bank Accounts Table */}
      <div className={`p-5 rounded-2xl border ${cardClass} space-y-3`}>
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Receipt className="h-4 w-4 text-teal-400" />
          <span>
            Registered Bank Accounts (Distinguishing Verified Manual vs
            Opening/Estimated Balances)
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.accounts.map((acc) => (
            <div
              key={acc.id}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-bold text-sm">{acc.display_name}</div>
                <div className="text-slate-400">
                  {acc.bank_name} • {acc.account_type.toUpperCase()}{" "}
                  {acc.last_four ? `• •••• ${acc.last_four}` : ""}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Opening Balance: {formatCurrency(acc.opening_balance)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-emerald-400">
                  {formatCurrency(
                    acc.is_manual_balance_verified && acc.manual_balance !== null
                      ? acc.manual_balance
                      : acc.opening_balance,
                    acc.currency
                  )}
                </div>
                <span
                  className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    acc.is_manual_balance_verified
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {acc.is_manual_balance_verified
                    ? "Verified Actual Balance"
                    : "Unverified Opening Balance"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
