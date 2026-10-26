import {
  BudgetRecord,
  CardRecord,
  CreditCardPaymentRecord,
  CreditCardStatementRecord,
  FinancialAccount,
  RecurringTransactionRecord,
  TransactionRecord,
} from "./types";

/**
 * Exact integer-fils decimal math to prevent IEEE-754 floating point drift.
 * 1 AED = 100 fils.
 */
export function toFils(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const str = String(amount).trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    const parsed = Number(str);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  const negative = str.startsWith("-");
  const clean = negative ? str.slice(1) : str;
  const [wholePart, fracPart = ""] = clean.split(".");
  const paddedFrac = (fracPart + "00").slice(0, 2);
  const thirdDigit = fracPart.length >= 3 ? Number(fracPart[2]) : 0;
  let totalFils = Number(wholePart) * 100 + Number(paddedFrac);
  if (thirdDigit >= 5) totalFils += 1;
  return negative ? -totalFils : totalFils;
}

export function fromFils(fils: number): number {
  const rounded = Math.round(fils);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, "0");
  return Number(`${sign}${whole}.${rem}`);
}

export function addMoney(...amounts: (number | string | null | undefined)[]): number {
  const sumFils = amounts.reduce<number>((acc, val) => acc + toFils(val), 0);
  return fromFils(sumFils);
}

export function subtractMoney(
  a: number | string | null | undefined,
  b: number | string | null | undefined
): number {
  return fromFils(toFils(a) - toFils(b));
}

export function formatCurrency(
  amount: number | string | null | undefined,
  currency = "AED",
  options?: { showSign?: boolean; compact?: boolean }
): string {
  const numeric = fromFils(toFils(amount));
  const absVal = Math.abs(numeric);
  const formattedNumber = new Intl.NumberFormat("en-AE", {
    minimumFractionDigits: options?.compact && absVal >= 10000 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(absVal);

  const prefix =
    numeric < 0
      ? "-"
      : options?.showSign && numeric > 0
      ? "+"
      : "";

  return `${prefix}${currency} ${formattedNumber}`;
}

/**
 * Generates a deterministic fingerprint to detect duplicate transactions
 * across receipt OCR, screenshot imports, SMS parsing, and manual entry.
 */
export function computeDuplicateFingerprint(input: {
  merchant: string;
  amount: number;
  transaction_date: string;
  transaction_type: string;
  reference_number?: string | null;
}): string {
  const normMerchant = input.merchant
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  const fils = toFils(input.amount);
  const ref = (input.reference_number || "").trim().toLowerCase();
  if (ref.length >= 5) {
    return `ref:${ref}:${fils}`;
  }
  return `tx:${input.transaction_date}:${normMerchant}:${fils}:${input.transaction_type}`;
}

export interface AccountingSummary {
  monthKey: string;
  recordedIncome: number;
  monthlySalaryConfigured: number;
  effectiveMonthlyIncome: number;
  grossExpenses: number;
  refundsAndReversals: number;
  netExpenses: number;
  creditCardRepaymentsTotal: number;
  transfersTotal: number;
  monthlyRemainingIncome: number;
  overallBudgetLimit: number;
  overallBudgetRemaining: number;
  overallBudgetUtilizationPct: number;
  recordedOpeningFunds: number;
  unpaidObligationsNotCounted: number;
  estimatedAvailableFunds: number;
  totalCreditCardOutstanding: number;
  totalCreditLimit: number;
  overallCardUtilizationPct: number;
  monthlySavings: number;
  savingsRatePct: number;
  hasVerifiedBankBalance: boolean;
  verifiedBankBalancesTotal: number;
}

/**
 * Core Accounting Engine:
 *
 * Prevention of Double Counting Rules:
 * 1. Credit card purchases (`transaction_type === 'expense'`, `payment_method === 'credit_card'`)
 *    ARE counted in monthly expenses at the time of purchase AND increase credit card outstanding balance.
 * 2. Credit card repayments (`transaction_type === 'cc_repayment'`) reduce the bank account balance
 *    and reduce credit card liability, but are NEVER counted as new monthly expenses.
 * 3. Refunds (`transaction_type === 'refund'`) and reversed transactions reduce net expenses
 *    for the period rather than inflating income.
 * 4. Declined transactions (`status === 'declined'`) and unconfirmed scheduled recurring items
 *    are NEVER counted in confirmed spending.
 * 5. Estimated Available Funds =
 *    Recorded Opening Bank Funds + Recorded Income - Net Cash/Bank/Card Expenses
 *    - Unpaid Prior-Period Statement Obligations (not already in current expenses).
 */
export function calculateAccountingSummary(params: {
  monthKey: string; // YYYY-MM
  monthlySalaryConfigured: number;
  transactions: TransactionRecord[];
  accounts: FinancialAccount[];
  cards: CardRecord[];
  statements: CreditCardStatementRecord[];
  budgets: BudgetRecord[];
  recurring: RecurringTransactionRecord[];
}): AccountingSummary {
  const {
    monthKey,
    monthlySalaryConfigured,
    transactions,
    accounts,
    cards,
    statements,
    budgets,
  } = params;

  const monthTx = transactions.filter(
    (t) =>
      t.transaction_date.startsWith(monthKey) &&
      t.status === "confirmed"
  );

  let incomeFils = 0;
  let grossExpenseFils = 0;
  let refundFils = 0;
  let ccRepaymentFils = 0;
  let transferFils = 0;

  for (const tx of monthTx) {
    const fils = toFils(tx.amount);
    if (tx.transaction_type === "income") {
      incomeFils += fils;
    } else if (tx.transaction_type === "expense") {
      grossExpenseFils += fils;
    } else if (tx.transaction_type === "refund") {
      refundFils += fils;
    } else if (tx.transaction_type === "cc_repayment") {
      // Explicitly tracked as liability settlement, NOT an expense
      ccRepaymentFils += fils;
    } else if (tx.transaction_type === "transfer") {
      transferFils += fils;
    }
  }

  const netExpenseFils = Math.max(0, grossExpenseFils - refundFils);
  const salaryConfiguredFils = toFils(monthlySalaryConfigured);
  const effectiveIncomeFils =
    incomeFils > 0 ? incomeFils : salaryConfiguredFils;

  const monthlyRemainingIncomeFils = effectiveIncomeFils - netExpenseFils;

  // Overall budget calculation
  const monthBudgets = budgets.filter((b) => b.month_key === monthKey);
  const explicitOverall = monthBudgets.find((b) => b.is_overall);
  const categoryBudgetsSumFils = monthBudgets
    .filter((b) => !b.is_overall)
    .reduce((acc, b) => acc + toFils(b.limit_amount), 0);

  const overallBudgetFils = explicitOverall
    ? toFils(explicitOverall.limit_amount)
    : categoryBudgetsSumFils;

  const overallBudgetRemainingFils = overallBudgetFils - netExpenseFils;
  const overallBudgetUtilizationPct =
    overallBudgetFils > 0
      ? Number(((netExpenseFils / overallBudgetFils) * 100).toFixed(1))
      : 0;

  // Opening funds & verified balances
  const activeAccounts = accounts.filter((a) => a.is_active);
  const openingFundsFils = activeAccounts.reduce(
    (acc, a) => acc + toFils(a.opening_balance),
    0
  );

  const hasVerifiedBankBalance = activeAccounts.some(
    (a) => a.is_manual_balance_verified && a.manual_balance !== null
  );
  const verifiedBankBalancesTotalFils = activeAccounts.reduce(
    (acc, a) =>
      acc +
      toFils(
        a.is_manual_balance_verified && a.manual_balance !== null
          ? a.manual_balance
          : a.opening_balance
      ),
    0
  );

  // Credit cards outstanding and credit limits
  const activeCreditCards = cards.filter(
    (c) => c.is_active && c.card_type === "credit"
  );
  const totalCreditCardOutstandingFils = activeCreditCards.reduce(
    (acc, c) => acc + toFils(calculateCardOutstanding(c, transactions)),
    0
  );
  const totalCreditLimitFils = activeCreditCards.reduce(
    (acc, c) => acc + toFils(c.credit_limit ?? 0),
    0
  );
  const overallCardUtilizationPct =
    totalCreditLimitFils > 0
      ? Number(
          ((totalCreditCardOutstandingFils / totalCreditLimitFils) * 100).toFixed(
            1
          )
        )
      : 0;

  // Unpaid statement obligations from prior periods not already counted in this month's expenses
  const unpaidPriorStatementFils = statements
    .filter(
      (s) =>
        s.status !== "paid" &&
        !s.closing_date.startsWith(monthKey)
    )
    .reduce((acc, s) => acc + toFils(s.outstanding_balance), 0);

  // Estimated available funds = opening funds + recorded income - net expenses - unpaid prior obligations
  const estimatedAvailableFundsFils =
    openingFundsFils +
    effectiveIncomeFils -
    netExpenseFils -
    unpaidPriorStatementFils;

  const savingsFils = effectiveIncomeFils - netExpenseFils;
  const savingsRatePct =
    effectiveIncomeFils > 0
      ? Number(((savingsFils / effectiveIncomeFils) * 100).toFixed(1))
      : 0;

  return {
    monthKey,
    recordedIncome: fromFils(incomeFils),
    monthlySalaryConfigured: fromFils(salaryConfiguredFils),
    effectiveMonthlyIncome: fromFils(effectiveIncomeFils),
    grossExpenses: fromFils(grossExpenseFils),
    refundsAndReversals: fromFils(refundFils),
    netExpenses: fromFils(netExpenseFils),
    creditCardRepaymentsTotal: fromFils(ccRepaymentFils),
    transfersTotal: fromFils(transferFils),
    monthlyRemainingIncome: fromFils(monthlyRemainingIncomeFils),
    overallBudgetLimit: fromFils(overallBudgetFils),
    overallBudgetRemaining: fromFils(overallBudgetRemainingFils),
    overallBudgetUtilizationPct,
    recordedOpeningFunds: fromFils(openingFundsFils),
    unpaidObligationsNotCounted: fromFils(unpaidPriorStatementFils),
    estimatedAvailableFunds: fromFils(estimatedAvailableFundsFils),
    totalCreditCardOutstanding: fromFils(totalCreditCardOutstandingFils),
    totalCreditLimit: fromFils(totalCreditLimitFils),
    overallCardUtilizationPct,
    monthlySavings: fromFils(savingsFils),
    savingsRatePct,
    hasVerifiedBankBalance,
    verifiedBankBalancesTotal: fromFils(verifiedBankBalancesTotalFils),
  };
}

/**
 * Calculates a credit card's current outstanding balance:
 * If `is_balance_manual` is true, returns `current_outstanding_balance`.
 * Otherwise calculates: opening_balance + confirmed card expenses - card refunds - card repayments.
 */
export function calculateCardOutstanding(
  card: CardRecord,
  transactions: TransactionRecord[]
): number {
  if (card.is_balance_manual) {
    return fromFils(toFils(card.current_outstanding_balance));
  }
  let balanceFils = toFils(card.opening_balance);
  for (const tx of transactions) {
    if (tx.status !== "confirmed") continue;
    const fils = toFils(tx.amount);
    if (tx.card_id === card.id) {
      if (tx.transaction_type === "expense") {
        balanceFils += fils;
      } else if (tx.transaction_type === "refund") {
        balanceFils -= fils;
      } else if (tx.transaction_type === "cc_repayment") {
        balanceFils -= fils;
      }
    } else if (
      tx.target_card_id === card.id &&
      tx.transaction_type === "cc_repayment"
    ) {
      balanceFils -= fils;
    }
  }
  return fromFils(Math.max(0, balanceFils));
}

/**
 * Applies a credit card payment against a statement and returns the updated statement values.
 */
export function applyStatementPayment(
  statement: CreditCardStatementRecord,
  existingPayments: CreditCardPaymentRecord[],
  newPaymentAmount: number,
  todayDubaiDate: string
): {
  amount_paid: number;
  outstanding_balance: number;
  status: CreditCardStatementRecord["status"];
} {
  const existingPaidFils = existingPayments
    .filter((p) => p.statement_id === statement.id)
    .reduce((acc, p) => acc + toFils(p.amount), 0);

  const totalPaidFils = existingPaidFils + toFils(newPaymentAmount);
  const statementBalFils = toFils(statement.statement_balance);
  const remainingFils = Math.max(0, statementBalFils - totalPaidFils);

  let status: CreditCardStatementRecord["status"] = "upcoming";
  if (remainingFils === 0) {
    status = "paid";
  } else if (totalPaidFils > 0) {
    status =
      statement.payment_due_date < todayDubaiDate
        ? "overdue"
        : "partially_paid";
  } else if (statement.payment_due_date < todayDubaiDate) {
    status = "overdue";
  } else {
    status = "upcoming";
  }

  return {
    amount_paid: fromFils(totalPaidFils),
    outstanding_balance: fromFils(remainingFils),
    status,
  };
}

export interface CategoryBudgetProgress {
  categoryName: string;
  budgetId: string | null;
  limitAmount: number;
  spentAmount: number;
  remainingAmount: number;
  utilizationPct: number;
  activeThresholdWarning: 100 | 90 | 75 | 50 | null;
}

export function calculateCategoryBudgets(
  monthKey: string,
  budgets: BudgetRecord[],
  transactions: TransactionRecord[]
): CategoryBudgetProgress[] {
  const monthBudgets = budgets.filter(
    (b) => b.month_key === monthKey && !b.is_overall
  );
  const monthTx = transactions.filter(
    (t) =>
      t.transaction_date.startsWith(monthKey) &&
      t.status === "confirmed" &&
      (t.transaction_type === "expense" || t.transaction_type === "refund")
  );

  const spentByCategoryFils = new Map<string, number>();
  for (const tx of monthTx) {
    const current = spentByCategoryFils.get(tx.category_name) ?? 0;
    const delta =
      tx.transaction_type === "expense"
        ? toFils(tx.amount)
        : -toFils(tx.amount);
    spentByCategoryFils.set(tx.category_name, current + delta);
  }

  const allCategoryNames = new Set<string>([
    ...monthBudgets.map((b) => b.category_name),
    ...Array.from(spentByCategoryFils.keys()),
  ]);

  const results: CategoryBudgetProgress[] = [];

  for (const categoryName of allCategoryNames) {
    const budget = monthBudgets.find((b) => b.category_name === categoryName);
    const limitFils = budget ? toFils(budget.limit_amount) : 0;
    const spentFils = Math.max(0, spentByCategoryFils.get(categoryName) ?? 0);
    const remainingFils = limitFils - spentFils;
    const utilizationPct =
      limitFils > 0
        ? Number(((spentFils / limitFils) * 100).toFixed(1))
        : 0;

    let activeThresholdWarning: 100 | 90 | 75 | 50 | null = null;
    if (limitFils > 0) {
      if (utilizationPct >= 100) activeThresholdWarning = 100;
      else if (utilizationPct >= 90) activeThresholdWarning = 90;
      else if (utilizationPct >= 75) activeThresholdWarning = 75;
      else if (utilizationPct >= 50) activeThresholdWarning = 50;
    }

    results.push({
      categoryName,
      budgetId: budget?.id ?? null,
      limitAmount: fromFils(limitFils),
      spentAmount: fromFils(spentFils),
      remainingAmount: fromFils(remainingFils),
      utilizationPct,
      activeThresholdWarning,
    });
  }

  return results.sort((a, b) => b.spentAmount - a.spentAmount);
}
