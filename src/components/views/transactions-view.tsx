"use client";

import React, { useMemo, useState } from "react";
import {
  Download,
  Trash2,
  Edit3,
  Receipt,
  CheckSquare,
  Square,
  X,
  Lock,
} from "lucide-react";
import { useFinance } from "@/context/finance-context";
import { formatCurrency } from "@/lib/money";
import { formatDubaiDate } from "@/lib/dubai-time";
import { TransactionRecord, TransactionType } from "@/lib/types";

export function TransactionsView() {
  const { state, mutateFinance } = useFinance();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCardOrAccount, setFilterCardOrAccount] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortBy, setSortBy] = useState<
    "date_desc" | "date_asc" | "amount_desc" | "amount_asc"
  >("date_desc");

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
          const matchesRef = (tx.reference_number || "")
            .toLowerCase()
            .includes(q);
          const matchesAmount = String(tx.amount).includes(q);
          if (
            !matchesMerchant &&
            !matchesNotes &&
            !matchesRef &&
            !matchesAmount
          ) {
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

  return (
    <div className="space-y-4">
      <div className="title-row">
        <div>
          <h1>Transactions</h1>
          <p className="sub">
            Showing 1–{filteredTransactions.length} of{" "}
            {state.transactions.length} ledger records in Asia/Dubai (GST)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              className="btn danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete selected ({selectedIds.length})</span>
            </button>
          )}
          <button
            type="button"
            data-testid="export-csv-btn"
            onClick={handleExportCsv}
            className="btn primary"
          >
            <Download className="h-3.5 w-3.5" />
            <span>
              Export CSV{" "}
              {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
            </span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="panel space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            data-testid="ledger-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search merchant, notes, ref, amount..."
            className="input-control"
          />

          <select
            aria-label="Filter by Category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="input-control"
          >
            <option value="all">All categories</option>
            {state.categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Transaction Type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-control"
          >
            <option value="all">All transaction types</option>
            <option value="expense">Expense</option>
            <option value="income">Income / Salary</option>
            <option value="cc_repayment">Credit card repayment</option>
            <option value="refund">Refund / Reversal</option>
            <option value="transfer">Transfer</option>
          </select>

          <select
            aria-label="Sort Transactions"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="input-control"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Highest amount</option>
            <option value="amount_asc">Lowest amount</option>
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-[var(--border)]">
          <select
            aria-label="Filter by Card or Account"
            value={filterCardOrAccount}
            onChange={(e) => setFilterCardOrAccount(e.target.value)}
            className="input-control"
          >
            <option value="all">All cards &amp; accounts</option>
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
            className="input-control"
          />
          <input
            type="date"
            aria-label="Date To"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input-control"
          />
          <input
            type="number"
            placeholder="Min AED"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="input-control"
          />
          <input
            type="number"
            placeholder="Max AED"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            className="input-control"
          />
        </div>
      </div>

      {receiptError && (
        <div className="p-3 rounded-[6px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-[13px]">
          {receiptError}
        </div>
      )}

      {/* Ledger Table */}
      <div className="panel p-0 overflow-hidden">
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th className="w-9">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    aria-label="Select All Transactions"
                    className="cursor-pointer"
                  >
                    {selectedIds.length > 0 &&
                    selectedIds.length === filteredTransactions.length ? (
                      <CheckSquare className="h-4 w-4 text-[var(--text)]" />
                    ) : (
                      <Square className="h-4 w-4 text-[var(--muted)]" />
                    )}
                  </button>
                </th>
                <th>Merchant &amp; notes</th>
                <th>Category</th>
                <th>Card / account</th>
                <th>Source &amp; status</th>
                <th className="n">Date (GST)</th>
                <th className="n">Amount</th>
                <th className="n">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-8 text-center text-[var(--muted)]"
                  >
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
                      aria-selected={isSelected}
                    >
                      <td>
                        <button
                          type="button"
                          onClick={() => toggleSelect(tx.id)}
                          className="cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[var(--text)]" />
                          ) : (
                            <Square className="h-4 w-4 text-[var(--muted)]" />
                          )}
                        </button>
                      </td>
                      <td>
                        <div className="font-medium">{tx.merchant}</div>
                        {tx.notes && (
                          <div className="text-[12px] text-[var(--muted)]">
                            {tx.notes}
                          </div>
                        )}
                      </td>
                      <td>{tx.category_name}</td>
                      <td className="text-[var(--muted)]">
                        {card ? (
                          <span>
                            {card.display_name} (••{card.last_four})
                          </span>
                        ) : account ? (
                          <span>{account.display_name}</span>
                        ) : (
                          <span>{tx.payment_method.replace(/_/g, " ")}</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            tx.verification_status === "verified"
                              ? "pos"
                              : "warn"
                          }`}
                        >
                          {tx.entry_source.replace("_", " ")} ·{" "}
                          {tx.verification_status}
                        </span>
                      </td>
                      <td className="n">
                        <div>{formatDubaiDate(tx.transaction_date)}</div>
                        <div className="text-[12px] text-[var(--muted)]">
                          {tx.transaction_time || "-"} ·{" "}
                          <code>{tx.reference_number || "-"}</code>
                        </div>
                      </td>
                      <td
                        className={`n font-semibold ${
                          tx.transaction_type === "income" ||
                          tx.transaction_type === "refund"
                            ? "text-[var(--positive)]"
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
                          <div className="text-[12px] text-[var(--muted)] font-normal">
                            VAT {formatCurrency(tx.vat_amount, tx.currency)}
                          </div>
                        ) : null}
                      </td>
                      <td className="n">
                        <div className="inline-flex items-center gap-1.5">
                          {tx.receipt_id && (
                            <button
                              type="button"
                              title="View Private Receipt (Signed URL)"
                              data-testid={`view-receipt-btn-${tx.id}`}
                              onClick={() => handleOpenReceipt(tx.receipt_id!)}
                              className="btn h-7 px-2 text-[12px]"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Edit Transaction"
                            data-testid={`edit-tx-btn-${tx.id}`}
                            onClick={() => setEditingTx(tx)}
                            className="btn h-7 px-2 text-[12px]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete Transaction"
                            data-testid={`delete-tx-btn-${tx.id}`}
                            onClick={() => setDeletingTxId(tx.id)}
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
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingTxId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md panel space-y-4">
            <h2 className="text-[16px] font-semibold">
              Confirm transaction deletion
            </h2>
            <p className="text-[13px] text-[var(--muted)]">
              Are you sure you want to permanently remove this transaction?
              Stored receipts follow your configured retention policy (
              <code>{state.profile.receipt_retention_policy}</code>).
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingTxId(null)}
                className="btn"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-delete-tx-btn"
                onClick={() => handleConfirmDelete(deletingTxId)}
                className="btn danger"
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-lg panel space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Edit transaction</h2>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="btn h-8 px-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
                  Merchant
                </label>
                <input
                  type="text"
                  required
                  value={editingTx.merchant}
                  onChange={(e) =>
                    setEditingTx({ ...editingTx, merchant: e.target.value })
                  }
                  className="input-control"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
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
                  className="input-control"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
                  Category
                </label>
                <select
                  value={editingTx.category_name}
                  onChange={(e) =>
                    setEditingTx({
                      ...editingTx,
                      category_name: e.target.value,
                    })
                  }
                  className="input-control"
                >
                  {state.categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
                  Transaction type
                </label>
                <select
                  value={editingTx.transaction_type}
                  onChange={(e) =>
                    setEditingTx({
                      ...editingTx,
                      transaction_type: e.target.value as TransactionType,
                    })
                  }
                  className="input-control"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="refund">Refund / Reversal</option>
                  <option value="cc_repayment">Credit Card Repayment</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">Date</label>
                <input
                  type="date"
                  value={editingTx.transaction_date}
                  onChange={(e) =>
                    setEditingTx({
                      ...editingTx,
                      transaction_date: e.target.value,
                    })
                  }
                  className="input-control"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">Notes</label>
                <input
                  type="text"
                  value={editingTx.notes || ""}
                  onChange={(e) =>
                    setEditingTx({ ...editingTx, notes: e.target.value })
                  }
                  className="input-control"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="btn"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="save-edit-tx-btn"
                className="btn primary"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Private Signed Receipt Viewer Modal */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg panel space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                <div>
                  <h2 className="text-[15px] font-semibold">
                    Private receipt vault · {viewingReceipt.fileName}
                  </h2>
                  <p className="text-[12px] text-[var(--muted)]">
                    Short-lived HMAC signed URL · Verified RLS owner access
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="btn h-8 px-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {viewingReceipt.dataUrl ? (
              <div className="bg-[var(--raised)] rounded p-3 flex justify-center max-h-[65vh] overflow-auto border border-[var(--border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewingReceipt.dataUrl}
                  alt={viewingReceipt.fileName}
                  className="max-h-[56vh] object-contain"
                />
              </div>
            ) : (
              <p className="text-[13px] text-[var(--muted)] py-6 text-center">
                Receipt metadata verified.
              </p>
            )}

            <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
              <span className="truncate max-w-xs">
                Signed URL: <code>{viewingReceipt.signedUrl}</code>
              </span>
              <span>Expires in 5m</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
