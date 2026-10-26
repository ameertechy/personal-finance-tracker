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
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold animate-pulse">
            AED
          </div>
          <p className="text-xs text-slate-400">
            Loading UAE Financial Vault (Asia/Dubai)...
          </p>
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
