"use client";

import React, { useState } from "react";
import { Download, Trash2, RefreshCw } from "lucide-react";
import { useFinance } from "@/context/finance-context";
import { formatDubaiDate } from "@/lib/dubai-time";
import { ReceiptRetentionPolicy } from "@/lib/types";

export function SettingsView() {
  const { state, mutateFinance } = useFinance();

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

  return (
    <div className="space-y-6">
      <div className="title-row">
        <div>
          <h1>Settings, Retention Policies &amp; Data Portability</h1>
          <p className="sub">
            Configure regional preferences ({currency} · {timezone}), receipt
            retention behavior, notification intervals, and full JSON vault
            export.
          </p>
        </div>
      </div>

      {savedBanner && (
        <div
          role="status"
          data-testid="settings-saved-banner"
          className="p-3.5 rounded-[6px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-[13px]"
        >
          {savedBanner}
        </div>
      )}

      {/* Section 1: Two-Column Settings Row (Label Column + Panel) */}
      <div className="app-grid top pt-2 border-t border-[var(--border)]">
        <div className="space-y-2" style={{ gridColumn: "span 5" }}>
          <h2 className="text-[16px] font-medium">
            Profile, currency &amp; receipt retention
          </h2>
          <p className="text-[14px] text-[var(--muted)]">
            Controls how dates are formatted in {timezone} and what happens to
            private receipt storage objects when a linked transaction is
            deleted.
          </p>
          <div className="p-3 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] text-[12px] space-y-1">
            <div className="font-medium">Current active configuration</div>
            <div className="text-[var(--muted)]">
              Owner: {state.profile.full_name} · {state.profile.default_currency}{" "}
              · {state.profile.timezone}
            </div>
            <div className="text-[var(--muted)]">
              Retention policy:{" "}
              <code>{state.profile.receipt_retention_policy}</code> (
              {state.receipts.length} stored receipt object(s))
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSaveProfile}
          className="panel space-y-4"
          style={{ gridColumn: "span 7" }}
        >
          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-control"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[14px] font-medium">
                Default currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input-control"
              >
                <option value="AED">AED (UAE Dirham)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[14px] font-medium">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input-control"
              >
                <option value="Asia/Dubai">Asia/Dubai (UTC+4 GST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium">
              Receipt image retention policy on transaction deletion
            </label>
            <select
              data-testid="retention-policy-select"
              value={retentionPolicy}
              onChange={(e) =>
                setRetentionPolicy(e.target.value as ReceiptRetentionPolicy)
              }
              className="input-control"
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
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              data-testid="save-profile-settings-btn"
              className="btn primary"
            >
              Save profile &amp; retention policy
            </button>
          </div>
        </form>
      </div>

      {/* Section 2: Notification & Reminder Intervals */}
      <div className="app-grid top pt-6 border-t border-[var(--border)]">
        <div className="space-y-2" style={{ gridColumn: "span 5" }}>
          <h2 className="text-[16px] font-medium">
            Reminder intervals &amp; budget alerts
          </h2>
          <p className="text-[14px] text-[var(--muted)]">
            Set how many days before a credit card statement or recurring bill
            due date reminders trigger, and which budget utilization percentages
            raise warnings.
          </p>
          <div className="p-3 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] text-[12px] space-y-1">
            <div className="font-medium">Preview of active rule</div>
            <div className="text-[var(--muted)]">
              Card bill due alerts at {ccReminderDays} days prior · Budget
              thresholds at {budgetThresholds}%.
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSaveNotifications}
          className="panel space-y-4"
          style={{ gridColumn: "span 7" }}
        >
          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium">
              Credit card &amp; recurring bill reminder days before due date
            </label>
            <input
              type="text"
              value={ccReminderDays}
              onChange={(e) => setCcReminderDays(e.target.value)}
              placeholder="7, 3, 1"
              className="input-control num"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium">
              Budget utilization warning thresholds (%)
            </label>
            <input
              type="text"
              value={budgetThresholds}
              onChange={(e) => setBudgetThresholds(e.target.value)}
              placeholder="50, 75, 90, 100"
              className="input-control num"
            />
          </div>

          <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
            <div>
              <div className="text-[14px] font-medium">
                Failed receipt extraction alerts
              </div>
              <div className="text-[12px] text-[var(--muted)]">
                Post an alert in the notification center when OCR requires retry
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyFailedOcr}
              onChange={(e) => setNotifyFailedOcr(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
            <div>
              <div className="text-[14px] font-medium">
                Overdue statement alerts
              </div>
              <div className="text-[12px] text-[var(--muted)]">
                Highlight overdue credit card bills in the overview and cards
                table
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyOverdue}
              onChange={(e) => setNotifyOverdue(e.target.checked)}
            />
          </label>

          <div className="flex justify-end">
            <button type="submit" className="btn primary">
              Save notification preferences
            </button>
          </div>
        </form>
      </div>

      {/* Section 3: Audit Trail & Data Portability */}
      <div className="app-grid top pt-6 border-t border-[var(--border)]">
        <div className="space-y-2" style={{ gridColumn: "span 5" }}>
          <h2 className="text-[16px] font-medium">
            Data export, sandbox reset &amp; audit log
          </h2>
          <p className="text-[14px] text-[var(--muted)]">
            Download a complete JSON snapshot of your financial records or
            switch between the seeded UAE sample dataset and a clean empty
            ledger.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              data-testid="export-json-backup-btn"
              onClick={handleExportFullJson}
              className="btn primary"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export JSON backup</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await mutateFinance("reset_demo_data", { seedDemoData: false });
                setSavedBanner(
                  "Switched to a clean empty ledger (sample data cleared)."
                );
              }}
              className="btn"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Start clean empty ledger</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await mutateFinance("reset_demo_data", { seedDemoData: true });
                setSavedBanner("Restored UAE Demo Sample Data.");
              }}
              className="btn"
            >
              Restore UAE demo data
            </button>
          </div>
        </div>

        <div className="panel space-y-3" style={{ gridColumn: "span 7" }}>
          <div className="panel-header">
            <h2>Immutable financial audit log</h2>
            <span className="panel-meta">
              {state.audit_logs.length} recorded events
            </span>
          </div>
          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Summary</th>
                  <th className="n">Date (GST)</th>
                </tr>
              </thead>
              <tbody>
                {state.audit_logs.slice(0, 6).map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className="pill">{log.action}</span>
                    </td>
                    <td>{log.summary}</td>
                    <td className="n text-[var(--muted)]">
                      {formatDubaiDate(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 4: Destructive Actions (Last, in its own section per app-screens.md §8.2) */}
      <div className="app-grid top pt-6 border-t border-[var(--border)]">
        <div className="space-y-1" style={{ gridColumn: "span 5" }}>
          <h2 className="text-[16px] font-medium text-[var(--negative)]">
            Delete account &amp; financial vault
          </h2>
          <p className="text-[14px] text-[var(--muted)]">
            Permanently deletes your profile, bank accounts, cards, confirmed
            transactions, statements, budgets, and private receipt images.
          </p>
        </div>

        <div className="panel space-y-3" style={{ gridColumn: "span 7" }}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="text-[13px] text-[var(--muted)]">
              Account <code>{state.profile.email}</code> and all associated RLS
              records will be purged.
            </span>
            <button
              type="button"
              data-testid="delete-account-trigger-btn"
              onClick={() => setConfirmDeleteAccount(true)}
              className="btn danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete account &amp; all data</span>
            </button>
          </div>

          {confirmDeleteAccount && (
            <div className="p-3.5 rounded-[6px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] space-y-3 text-[13px]">
              <div className="font-semibold">
                Confirm permanent deletion of {state.profile.email}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAccount(false)}
                  className="btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-delete-account-btn"
                  onClick={() => mutateFinance("delete_account")}
                  className="btn danger"
                >
                  Permanently delete everything
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
