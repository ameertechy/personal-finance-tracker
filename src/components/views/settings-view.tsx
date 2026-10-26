"use client";

import React, { useState } from "react";
import {
  User,
  Bell,
  Shield,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  History,
} from "lucide-react";
import { useFinance } from "@/context/finance-context";
import { formatDubaiDate } from "@/lib/dubai-time";
import { ReceiptRetentionPolicy } from "@/lib/types";

export function SettingsView() {
  const { state, mutateFinance, theme } = useFinance();

  const [fullName, setFullName] = useState(
    state?.profile.full_name || "UAE Resident"
  );
  const [currency, setCurrency] = useState(
    state?.profile.default_currency || "AED"
  );
  const [timezone, setTimezone] = useState(
    state?.profile.timezone || "Asia/Dubai"
  );
  const [retentionPolicy, setRetentionPolicy] =
    useState<ReceiptRetentionPolicy>(
      state?.profile.receipt_retention_policy || "delete_with_transaction"
    );

  const [ccReminderDays, setCcReminderDays] = useState(
    (state?.notification_preferences.cc_due_reminder_days || [7, 3, 1]).join(
      ", "
    )
  );
  const [budgetThresholds, setBudgetThresholds] = useState(
    (
      state?.notification_preferences.budget_warning_thresholds || [
        50, 75, 90, 100,
      ]
    ).join(", ")
  );
  const [notifyFailedOcr, setNotifyFailedOcr] = useState(
    state?.notification_preferences.notify_failed_extractions ?? true
  );
  const [notifyOverdue, setNotifyOverdue] = useState(
    state?.notification_preferences.notify_overdue_bills ?? true
  );

  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  if (!state) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await mutateFinance("update_profile", {
      profile: {
        full_name: fullName,
        default_currency: currency,
        timezone,
        receipt_retention_policy: retentionPolicy,
      },
    });
    if (res.ok) {
      setSavedBanner("Saved profile, currency, timezone & retention policy.");
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDays = ccReminderDays
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 60);
    const parsedThresholds = budgetThresholds
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 200);

    const res = await mutateFinance("update_notification_preferences", {
      preferences: {
        cc_due_reminder_days: parsedDays.length ? parsedDays : [7, 3, 1],
        budget_warning_thresholds: parsedThresholds.length
          ? parsedThresholds
          : [50, 75, 90, 100],
        notify_failed_extractions: notifyFailedOcr,
        notify_overdue_bills: notifyOverdue,
      },
    });
    if (res.ok) {
      setSavedBanner("Saved notification and reminder intervals.");
    }
  };

  const handleExportFullJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dirhampulse_full_backup_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardClass =
    theme === "dark"
      ? "bg-slate-900/90 border-slate-800 text-slate-100"
      : "bg-white border-slate-200 text-slate-900 shadow-sm";

  return (
    <div className="space-y-6">
      {savedBanner && (
        <div
          role="status"
          data-testid="settings-saved-banner"
          className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile, Currency, Timezone & Receipt Retention */}
        <form
          onSubmit={handleSaveProfile}
          className={`p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-teal-400" />
            <h3 className="text-sm font-bold">
              Profile, Regional Settings &amp; Receipt Retention Policy
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  Default Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                >
                  <option value="AED">AED (UAE Dirham)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                >
                  <option value="Asia/Dubai">Asia/Dubai (UTC+4 GST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Receipt Image Retention Policy on Transaction Deletion
              </label>
              <select
                data-testid="retention-policy-select"
                value={retentionPolicy}
                onChange={(e) =>
                  setRetentionPolicy(e.target.value as ReceiptRetentionPolicy)
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="delete_with_transaction">
                  Immediately delete stored receipt image when transaction is
                  deleted
                </option>
                <option value="retain_archive_90d">
                  Archive receipt for 90 days when transaction is deleted
                </option>
                <option value="retain_indefinitely">
                  Retain receipt in private vault until manually purged
                </option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Documents what happens to private Supabase Storage receipt
                objects when a linked ledger entry is removed.
              </p>
            </div>

            <button
              type="submit"
              data-testid="save-profile-settings-btn"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer"
            >
              Save Profile &amp; Retention Policy
            </button>
          </div>
        </form>

        {/* Notification & Reminder Intervals */}
        <form
          onSubmit={handleSaveNotifications}
          className={`p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-teal-400" />
            <h3 className="text-sm font-bold">
              Reminder Intervals &amp; Alert Thresholds
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                Credit Card &amp; Recurring Bill Reminder Days Before Due Date
              </label>
              <input
                type="text"
                value={ccReminderDays}
                onChange={(e) => setCcReminderDays(e.target.value)}
                placeholder="7, 3, 1"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Budget Utilization Warning Thresholds (%)
              </label>
              <input
                type="text"
                value={budgetThresholds}
                onChange={(e) => setBudgetThresholds(e.target.value)}
                placeholder="50, 75, 90, 100"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyFailedOcr}
                onChange={(e) => setNotifyFailedOcr(e.target.checked)}
              />
              <span>Alert in Notification Center when receipt OCR fails</span>
            </label>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOverdue}
                onChange={(e) => setNotifyOverdue(e.target.checked)}
              />
              <span>Highlight overdue credit card bills prominently</span>
            </label>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer"
            >
              Save Notification Preferences
            </button>
          </div>
        </form>
      </div>

      {/* Data Export, Demo Data Toggle & Account Deletion */}
      <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-teal-400" />
          <h3 className="text-sm font-bold">
            Data Portability, Demo Sandbox Control &amp; Account Deletion
          </h3>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <button
            type="button"
            data-testid="export-json-backup-btn"
            onClick={handleExportFullJson}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Export Full Financial Backup (JSON)</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await mutateFinance("reset_demo_data", { seedDemoData: false });
              setSavedBanner(
                "Switched to a clean, empty ledger (all demo sample records cleared)."
              );
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Start Clean Empty Ledger (Clear Sample Data)</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await mutateFinance("reset_demo_data", { seedDemoData: true });
              setSavedBanner("Restored UAE Demo Sample Data.");
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reset UAE Demo Sample Data</span>
          </button>

          <button
            type="button"
            data-testid="delete-account-trigger-btn"
            onClick={() => setConfirmDeleteAccount(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-300 font-semibold hover:bg-rose-900/60 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Account &amp; All Data</span>
          </button>
        </div>

        {confirmDeleteAccount && (
          <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-600 space-y-3 text-xs">
            <div className="font-bold text-rose-200">
              Permanent Account &amp; Financial Vault Deletion
            </div>
            <p className="text-rose-200/90">
              This will permanently purge your profile, transactions, cards,
              statements, budgets, and private receipt images.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAccount(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-delete-account-btn"
                onClick={() => mutateFinance("delete_account")}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
              >
                Permanently Delete Everything
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Financial Record Audit Trail */}
      <div className={`p-5 rounded-2xl border ${cardClass} space-y-3`}>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-teal-400" />
          <h3 className="text-sm font-bold">
            Financial Record Audit Log (Immutable Change History)
          </h3>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
          {state.audit_logs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between gap-2"
            >
              <div>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 font-mono text-[10px] uppercase mr-2">
                  {log.action}
                </span>
                <span>{log.summary}</span>
              </div>
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                {formatDubaiDate(log.created_at)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
