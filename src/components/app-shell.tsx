"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  ListOrdered,
  PlusCircle,
  CreditCard,
  PieChart,
  BarChart3,
  Settings,
  Bell,
  Sun,
  Moon,
  WifiOff,
  RefreshCw,
  LogOut,
  ShieldAlert,
  Sparkles,
  Calendar,
  CheckCheck,
} from "lucide-react";
import { NavSection, useFinance } from "@/context/finance-context";
import { formatDubaiDate } from "@/lib/dubai-time";

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    shortLabel: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "transactions",
    label: "Transactions",
    shortLabel: "Ledger",
    icon: ListOrdered,
  },
  {
    id: "add",
    label: "Add Expense",
    shortLabel: "Add",
    icon: PlusCircle,
  },
  {
    id: "cards",
    label: "Cards & Bills",
    shortLabel: "Cards",
    icon: CreditCard,
  },
  {
    id: "budgets",
    label: "Budgets",
    shortLabel: "Budgets",
    icon: PieChart,
  },
  {
    id: "reports",
    label: "Reports",
    shortLabel: "Reports",
    icon: BarChart3,
  },
  {
    id: "settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: Settings,
  },
];

const AVAILABLE_MONTHS = [
  { value: "2026-11", label: "Nov 2026" },
  { value: "2026-10", label: "Oct 2026" },
  { value: "2026-09", label: "Sep 2026" },
  { value: "2026-08", label: "Aug 2026" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    session,
    state,
    activeSection,
    setActiveSection,
    selectedMonth,
    setSelectedMonth,
    isOffline,
    simulatedOffline,
    setSimulatedOffline,
    offlineQueue,
    syncingQueue,
    syncOfflineQueueNow,
    theme,
    toggleTheme,
    mutateFinance,
    signOut,
  } = useFinance();

  const [notifOpen, setNotifOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  const unreadNotifications =
    state?.notifications.filter((n) => !n.is_read) ?? [];

  const handleRequestBrowserPush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPushStatus(
        "Browser push API unavailable on this device. In-app notification center remains active."
      );
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        await mutateFinance("update_notification_preferences", {
          preferences: { enable_browser_push: true },
        });
        setPushStatus(
          "Browser push notifications enabled while app is open/active."
        );
      } else {
        setPushStatus(
          "Push permission not granted. Using in-app notification fallback."
        );
      }
    } catch {
      setPushStatus("Using in-app notification center fallback.");
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col md:flex-row ${
        theme === "dark"
          ? "bg-slate-950 text-slate-100"
          : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Desktop Left Sidebar */}
      <aside
        className={`hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r ${
          theme === "dark"
            ? "bg-slate-900/95 border-slate-800"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="p-5 flex items-center gap-3 border-b border-slate-800/40">
          <div className="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-extrabold text-sm shadow-sm">
            AED
          </div>
          <div>
            <div className="font-bold text-base tracking-tight">
              DirhamPulse
            </div>
            <div className="text-[11px] text-slate-400">
              UAE Personal Finance • GST
            </div>
          </div>
        </div>

        <nav
          aria-label="Primary Sidebar Navigation"
          className="flex-1 px-3 py-4 space-y-1"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                  active
                    ? "bg-teal-600 text-white shadow-sm"
                    : theme === "dark"
                    ? "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/40 space-y-3 text-xs">
          <div
            className={`p-3 rounded-xl border ${
              theme === "dark"
                ? "bg-slate-950/70 border-slate-800 text-slate-300"
                : "bg-slate-100 border-slate-200 text-slate-700"
            }`}
          >
            <div className="font-semibold truncate">
              {state?.profile.full_name || session?.fullName}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {session?.email}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-teal-400 font-medium">
                {state?.profile.default_currency || "AED"} • Asia/Dubai
              </span>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen pb-20 md:pb-8">
        {/* Offline / Unsynchronized Queue Banner */}
        {(isOffline || offlineQueue.length > 0) && (
          <div
            role="status"
            data-testid="offline-sync-banner"
            className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 text-amber-200"
          >
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                {isOffline
                  ? "Offline Mode Active — Viewing cached shell & local state. New manual transactions are queued safely without data loss."
                  : `Connection restored — ${offlineQueue.length} queued transaction(s) ready to synchronize.`}
              </span>
              {offlineQueue.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-100 font-semibold">
                  {offlineQueue.length} unsynchronized
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {simulatedOffline && (
                <button
                  type="button"
                  onClick={() => setSimulatedOffline(false)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 cursor-pointer"
                >
                  Reconnect Network
                </button>
              )}
              {!isOffline && offlineQueue.length > 0 && (
                <button
                  type="button"
                  onClick={syncOfflineQueueNow}
                  disabled={syncingQueue}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-500 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      syncingQueue ? "animate-spin" : ""
                    }`}
                  />
                  <span>{syncingQueue ? "Syncing..." : "Sync Now"}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Top Header */}
        <header
          className={`sticky top-0 z-30 border-b backdrop-blur-md px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 ${
            theme === "dark"
              ? "bg-slate-950/85 border-slate-800"
              : "bg-white/90 border-slate-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="md:hidden h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-xs">
              AED
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight">
                  {NAV_ITEMS.find((n) => n.id === activeSection)?.label ||
                    "Dashboard"}
                </h1>
                {state?.profile.is_demo_mode && (
                  <span
                    data-testid="demo-mode-badge"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Demo Seeded Data</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Asia/Dubai (UTC+4) • Exact Decimal AED Ledger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Month Selector */}
            <div className="relative flex items-center">
              <Calendar className="h-3.5 w-3.5 text-teal-400 absolute left-2.5 pointer-events-none" />
              <select
                aria-label="Select Accounting Month"
                data-testid="month-selector"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={`pl-8 pr-3 py-1.5 rounded-xl text-xs font-medium border focus:outline-none focus:border-teal-500 ${
                  theme === "dark"
                    ? "bg-slate-900 border-slate-800 text-slate-100"
                    : "bg-slate-100 border-slate-300 text-slate-900"
                }`}
              >
                {AVAILABLE_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Offline Simulation Toggle for testing PWA offline resilience */}
            <button
              type="button"
              data-testid="toggle-offline-btn"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              title="Toggle offline mode to test offline queueing & sync"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                isOffline
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                  : theme === "dark"
                  ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                  : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">
                {isOffline ? "Offline" : "Online"}
              </span>
            </button>

            {/* In-App Notification Center */}
            <div className="relative">
              <button
                type="button"
                aria-label="Open Notifications"
                data-testid="notification-bell-btn"
                onClick={() => setNotifOpen((o) => !o)}
                className={`relative p-2 rounded-xl border transition cursor-pointer ${
                  theme === "dark"
                    ? "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800"
                    : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications.length > 0 && (
                  <span
                    data-testid="unread-notification-count"
                    className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center"
                  >
                    {unreadNotifications.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className={`absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border shadow-2xl z-50 p-4 space-y-3 ${
                    theme === "dark"
                      ? "bg-slate-900 border-slate-800 text-slate-100"
                      : "bg-white border-slate-200 text-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-800/40 pb-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                        Notification Center
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Bills, Budget Thresholds &amp; OCR Alerts
                      </p>
                    </div>
                    {unreadNotifications.length > 0 && (
                      <button
                        type="button"
                        onClick={() => mutateFinance("mark_notifications_read")}
                        className="text-[11px] text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {(state?.notifications ?? []).length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        No notifications right now.
                      </p>
                    ) : (
                      state?.notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                            n.severity === "critical"
                              ? "bg-rose-950/40 border-rose-700/50"
                              : n.severity === "warning"
                              ? "bg-amber-950/30 border-amber-700/40"
                              : theme === "dark"
                              ? "bg-slate-950/60 border-slate-800"
                              : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{n.title}</span>
                            {!n.is_read && (
                              <span className="h-2 w-2 rounded-full bg-teal-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-slate-400 text-[11px] leading-relaxed">
                            {n.message}
                          </p>
                          <div className="text-[10px] text-slate-500">
                            {formatDubaiDate(n.created_at)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800/40 space-y-2">
                    <button
                      type="button"
                      onClick={handleRequestBrowserPush}
                      className="w-full py-1.5 px-3 rounded-xl bg-teal-600/20 border border-teal-500/40 text-teal-300 text-xs font-medium hover:bg-teal-600/30 transition cursor-pointer"
                    >
                      Enable Browser Push Reminders
                    </button>
                    {pushStatus && (
                      <p className="text-[11px] text-slate-400">{pushStatus}</p>
                    )}
                    <p className="text-[10px] text-slate-400 flex items-start gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Note: Browser push reminders require an active browser
                        or configured Web Push VAPID scheduler when closed. This
                        in-app Notification Center is always active as your
                        reliable fallback.
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              aria-label="Toggle Light/Dark Theme"
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                theme === "dark"
                  ? "bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800"
                  : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        {/* Main View Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 border-t px-1 py-1.5 grid grid-cols-7 gap-0.5 ${
          theme === "dark"
            ? "bg-slate-900/95 border-slate-800 backdrop-blur-md"
            : "bg-white/95 border-slate-200 backdrop-blur-md"
        }`}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-medium transition cursor-pointer ${
                active
                  ? "text-teal-400 bg-teal-500/10"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon
                className={`h-4 w-4 mb-0.5 ${
                  item.id === "add" ? "text-teal-400" : ""
                }`}
              />
              <span className="truncate max-w-full px-0.5">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
