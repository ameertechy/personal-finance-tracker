"use client";

import React, { useMemo, useState } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Trash2,
  Edit3,
  Receipt,
  CheckSquare,
  Square,
  X,
  Lock,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { useFinance } from "@/context/finance-context";
import { formatCurrency } from "@/lib/money";
import { formatDubaiDate } from "@/lib/dubai-time";
import { TransactionRecord, TransactionType } from "@/lib/types";

export function TransactionsView() {
  const { state, mutateFinance, theme } = useFinance();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCardOrAccount, setFilterCardOrAccount] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<{
    receiptId: string;
    signedUrl: string;
    dataUrl: string | null;
    expiresAt: number;
    fileName: string;
  } | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const filteredTransactions = useMemo(() => {
    if (!state) return [];
    const q = searchQuery.trim().toLowerCase();

    return state.transactions
      .filter((tx) => {
        if (q) {
          const matchesMerchant = tx.merchant.toLowerCase().includes(q);
          const matchesNotes = (tx.notes || "").toLowerCase().includes(q);
          const matchesRef = (tx.reference_number || "").toLowerCase().includes(q);
          const matchesAmount = String(tx.amount).includes(q);
          if (!matchesMerchant && !matchesNotes && !matchesRef && !matchesAmount) {
            return false;
          }
        }
        if (filterCategory !== "all" && tx.category_name !== filterCategory) {
          return false;
        }
        if (filterType !== "all" && tx.transaction_type !== filterType) {
          return false;
        }
        if (
          filterCardOrAccount !== "all" &&
          tx.card_id !== filterCardOrAccount &&
          tx.account_id !== filterCardOrAccount
        ) {
          return false;
        }
        if (dateFrom && tx.transaction_date < dateFrom) return false;
        if (dateTo && tx.transaction_date > dateTo) return false;
        if (minAmount && tx.amount < Number(minAmount)) return false;
        if (maxAmount && tx.amount > Number(maxAmount)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_desc") {
          return b.transaction_date.localeCompare(a.transaction_date);
        }
        if (sortBy === "date_asc") {
          return a.transaction_date.localeCompare(b.transaction_date);
        }
        if (sortBy === "amount_desc") {
          return b.amount - a.amount;
        }
        return a.amount - b.amount;
      });
  }, [
    state,
    searchQuery,
    filterCategory,
    filterType,
    filterCardOrAccount,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    sortBy,
  ]);

  if (!state) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredTransactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTransactions.map((t) => t.id));
    }
  };

  const handleExportCsv = () => {
    const rowsToExport =
      selectedIds.length > 0
        ? filteredTransactions.filter((t) => selectedIds.includes(t.id))
        : filteredTransactions;

    const headers = [
      "Date (Asia/Dubai)",
      "Time",
      "Merchant",
      "Category",
      "Type",
      "Status",
      "Currency",
      "Amount",
      "VAT Amount",
      "Payment Method",
      "Reference",
      "Entry Source",
      "Verification Status",
      "Notes",
    ];

    const csvLines = [
      headers.join(","),
      ...rowsToExport.map((t) =>
        [
          t.transaction_date,
          t.transaction_time || "",
          `"${t.merchant.replace(/"/g, '""')}"`,
          `"${t.category_name.replace(/"/g, '""')}"`,
          t.transaction_type,
          t.status,
          t.currency,
          t.amount.toFixed(2),
          (t.vat_amount ?? 0).toFixed(2),
          t.payment_method,
          `"${(t.reference_number || "").replace(/"/g, '""')}"`,
          t.entry_source,
          t.verification_status,
          `"${(t.notes || "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dirhampulse_transactions_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenReceipt = async (receiptId: string) => {
    setReceiptError(null);
    try {
      const signedRes = await fetch(`/api/receipts/${receiptId}`);
      const signedData = await signedRes.json();
      if (!signedRes.ok) {
        setReceiptError(signedData.error || "Failed to generate signed URL");
        return;
      }

      const verifyRes = await fetch(signedData.signedUrl);
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setReceiptError(verifyData.error || "Receipt access denied");
        return;
      }

      setViewingReceipt({
        receiptId,
        signedUrl: signedData.signedUrl,
        dataUrl: verifyData.dataUrl,
        expiresAt: signedData.expiresAt,
        fileName: signedData.receipt?.file_name || "receipt.png",
      });
    } catch {
      setReceiptError("Error fetching signed receipt URL");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    await mutateFinance("update_transaction", {
      id: editingTx.id,
      transaction: {
        transaction_type: editingTx.transaction_type,
        status: editingTx.status,
        verification_status: editingTx.verification_status,
        entry_source: editingTx.entry_source,
        amount: editingTx.amount,
        currency: editingTx.currency,
        vat_amount: editingTx.vat_amount,
        merchant: editingTx.merchant,
        merchant_location: editingTx.merchant_location,
        category_name: editingTx.category_name,
        transaction_date: editingTx.transaction_date,
        transaction_time: editingTx.transaction_time,
        payment_method: editingTx.payment_method,
        account_id: editingTx.account_id,
        card_id: editingTx.card_id,
        reference_number: editingTx.reference_number,
        notes: editingTx.notes,
      },
    });
    setEditingTx(null);
  };

  const handleConfirmDelete = async (id: string) => {
    await mutateFinance("delete_transaction", { id });
    setDeletingTxId(null);
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    await mutateFinance("bulk_delete_transactions", { ids: selectedIds });
    setSelectedIds([]);
  };

  const cardClass =
    theme === "dark"
      ? "bg-slate-900/90 border-slate-800 text-slate-100"
      : "bg-white border-slate-200 text-slate-900 shadow-sm";

  return (
    <div className="space-y-5">
      {/* Header & Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Searchable Transaction Ledger</h2>
          <p className="text-xs text-slate-400">
            Showing {filteredTransactions.length} of {state.transactions.length}{" "}
            confirmed &amp; pending records
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-600/30 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          )}
          <button
            type="button"
            data-testid="export-csv-btn"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>
              Export CSV{" "}
              {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
            </span>
          </button>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className={`p-4 rounded-2xl border ${cardClass} space-y-3`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              data-testid="ledger-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search merchant, notes, ref, amount..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              aria-label="Filter by Category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:border-teal-500"
            >
              <option value="all">All Categories</option>
              {state.categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              aria-label="Filter by Transaction Type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:border-teal-500"
            >
              <option value="all">All Transaction Types</option>
              <option value="expense">Expense</option>
              <option value="income">Income / Salary</option>
              <option value="cc_repayment">Credit Card Repayment</option>
              <option value="refund">Refund / Reversal</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              aria-label="Sort Transactions"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as typeof sortBy)
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:border-teal-500"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="amount_desc">Highest Amount</option>
              <option value="amount_asc">Lowest Amount</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Row: Card/Account, Date Range, Amount Range */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-slate-800/50 text-xs">
          <select
            aria-label="Filter by Card or Account"
            value={filterCardOrAccount}
            onChange={(e) => setFilterCardOrAccount(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
          >
            <option value="all">All Cards &amp; Accounts</option>
            {state.cards.map((c) => (
              <option key={c.id} value={c.id}>
                Card: {c.display_name} (••{c.last_four})
              </option>
            ))}
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                Account: {a.display_name}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Date From"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
          />
          <input
            type="date"
            aria-label="Date To"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
          />
          <input
            type="number"
            placeholder="Min AED"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
          />
          <input
            type="number"
            placeholder="Max AED"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
          />
        </div>
      </div>

      {receiptError && (
        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-700 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{receiptError}</span>
        </div>
      )}

      {/* Transactions Table */}
      <div className={`rounded-2xl border overflow-hidden ${cardClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="p-3 w-8">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    aria-label="Select All Transactions"
                    className="cursor-pointer"
                  >
                    {selectedIds.length > 0 &&
                    selectedIds.length === filteredTransactions.length ? (
                      <CheckSquare className="h-4 w-4 text-teal-400" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="p-3">Date &amp; Time (GST)</th>
                <th className="p-3">Merchant &amp; Notes</th>
                <th className="p-3">Category</th>
                <th className="p-3">Card / Account</th>
                <th className="p-3">Source &amp; Status</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No transactions match your current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const card = state.cards.find((c) => c.id === tx.card_id);
                  const account = state.accounts.find(
                    (a) => a.id === tx.account_id
                  );
                  const isSelected = selectedIds.includes(tx.id);

                  return (
                    <tr
                      key={tx.id}
                      data-testid={`tx-row-${tx.id}`}
                      className={`hover:bg-slate-800/30 transition ${
                        isSelected ? "bg-teal-950/20" : ""
                      }`}
                    >
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => toggleSelect(tx.id)}
                          className="cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-teal-400" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-500" />
                          )}
                        </button>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-medium">
                          {formatDubaiDate(tx.transaction_date)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {tx.transaction_time || "—"} •{" "}
                          {tx.reference_number || "No ref"}
                        </div>
                      </td>
                      <td className="p-3 max-w-xs">
                        <div className="font-semibold truncate">
                          {tx.merchant}
                        </div>
                        {tx.notes && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {tx.notes}
                          </div>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-2 py-1 rounded-lg bg-slate-800/80 text-slate-200 text-[11px]">
                          {tx.category_name}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap text-[11px]">
                        {card ? (
                          <span>
                            {card.display_name} (••{card.last_four})
                          </span>
                        ) : account ? (
                          <span>{account.display_name}</span>
                        ) : (
                          <span className="text-slate-400">
                            {tx.payment_method.replace(/_/g, " ")}
                          </span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                            {tx.entry_source.replace("_", " ")}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              tx.verification_status === "verified"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {tx.verification_status}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`p-3 whitespace-nowrap text-right font-bold ${
                          tx.transaction_type === "income" ||
                          tx.transaction_type === "refund"
                            ? "text-emerald-400"
                            : tx.transaction_type === "cc_repayment"
                            ? "text-sky-400"
                            : ""
                        }`}
                      >
                        <div>
                          {tx.transaction_type === "income" ||
                          tx.transaction_type === "refund"
                            ? "+"
                            : ""}
                          {formatCurrency(tx.amount, tx.currency)}
                        </div>
                        {tx.vat_amount ? (
                          <div className="text-[10px] text-slate-400 font-normal">
                            Incl. VAT {formatCurrency(tx.vat_amount, tx.currency)}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {tx.receipt_id && (
                            <button
                              type="button"
                              title="View Private Receipt (Signed URL)"
                              data-testid={`view-receipt-btn-${tx.id}`}
                              onClick={() => handleOpenReceipt(tx.receipt_id!)}
                              className="p-1.5 rounded-lg bg-teal-500/15 text-teal-400 hover:bg-teal-500/25 cursor-pointer"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Edit Transaction"
                            data-testid={`edit-tx-btn-${tx.id}`}
                            onClick={() => setEditingTx(tx)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete Transaction"
                            data-testid={`delete-tx-btn-${tx.id}`}
                            onClick={() => setDeletingTxId(tx.id)}
                            className="p-1.5 rounded-lg bg-rose-950/60 text-rose-400 hover:bg-rose-900/60 cursor-pointer"
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
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingTxId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 text-slate-100">
            <h3 className="text-base font-bold">Confirm Transaction Deletion</h3>
            <p className="text-xs text-slate-300">
              Are you sure you want to permanently remove this transaction?
              Stored receipts will follow your configured retention policy (
              <code className="text-teal-300">
                {state.profile.receipt_retention_policy}
              </code>
              ).
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingTxId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-delete-tx-btn"
                onClick={() => handleConfirmDelete(deletingTxId)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 text-slate-100"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Edit Transaction</h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Merchant</label>
                <input
                  type="text"
                  required
                  value={editingTx.merchant}
                  onChange={(e) =>
                    setEditingTx({ ...editingTx, merchant: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Amount ({editingTx.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editingTx.amount}
                  onChange={(e) =>
                    setEditingTx({
                      ...editingTx,
                      amount: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Category</label>
                <select
                  value={editingTx.category_name}
                  onChange={(e) =>
                    setEditingTx({
                      ...editingTx,
                      category_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                >
                  {state.categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Transaction Type
                </label>
                <select
                  value={editingTx.transaction_type}
                  onChange={(e) =>
                    setEditingTx({
                      ...editingTx,
                      transaction_type: e.target.value as TransactionType,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="refund">Refund / Reversal</option>
                  <option value="cc_repayment">Credit Card Repayment</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Date</label>
                <input
                  type="date"
                  value={editingTx.transaction_date}
                  onChange={(e) =>
                    setEditingTx({
                      ...editingTx,
                      transaction_date: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Notes</label>
                <input
                  type="text"
                  value={editingTx.notes || ""}
                  onChange={(e) =>
                    setEditingTx({ ...editingTx, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="save-edit-tx-btn"
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Private Signed Receipt Viewer Modal */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-teal-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    Private Receipt Vault — {viewingReceipt.fileName}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Short-lived HMAC signed URL • Verified RLS Owner Access
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {viewingReceipt.dataUrl ? (
              <div className="bg-slate-950 rounded-xl p-3 flex justify-center max-h-[65vh] overflow-auto border border-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewingReceipt.dataUrl}
                  alt={viewingReceipt.fileName}
                  className="max-h-[58vh] object-contain rounded"
                />
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">
                Receipt metadata verified (No preview binary attached).
              </p>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate max-w-xs">
                Signed URL: <code>{viewingReceipt.signedUrl}</code>
              </span>
              <span className="inline-flex items-center gap-1 text-teal-400">
                <ExternalLink className="h-3 w-3" />
                <span>Expires in 5m</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
