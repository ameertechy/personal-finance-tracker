"use client";

import React from "react";
import { useFinance } from "@/context/finance-context";
import { AuthScreen } from "@/components/auth-screen";
import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/views/dashboard-view";
import { TransactionsView } from "@/components/views/transactions-view";
import { AddExpenseView } from "@/components/views/add-expense-view";
import { CardsBillsView } from "@/components/views/cards-bills-view";
import { BudgetsView } from "@/components/views/budgets-view";
import { ReportsView } from "@/components/views/reports-view";
import { SettingsView } from "@/components/views/settings-view";

export default function HomePage() {
  const { session, state, loading, activeSection, refreshState } = useFinance();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--ground)] text-[var(--text)] p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="h-6 w-48 rounded bg-[var(--raised)]" />
          <div className="h-24 w-full rounded bg-[var(--surface)] border border-[var(--border)]" />
        </div>
      </div>
    );
  }

  if (!session || !state) {
    return <AuthScreen onAuthenticated={refreshState} />;
  }

  return (
    <AppShell>
      {activeSection === "dashboard" && <DashboardView />}
      {activeSection === "transactions" && <TransactionsView />}
      {activeSection === "add" && <AddExpenseView />}
      {activeSection === "cards" && <CardsBillsView />}
      {activeSection === "budgets" && <BudgetsView />}
      {activeSection === "reports" && <ReportsView />}
      {activeSection === "settings" && <SettingsView />}
    </AppShell>
  );
}
