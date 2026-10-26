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
  Menu,
  X,
} from "lucide-react";
import { NavSection, useFinance } from "@/context/finance-context";
import { formatDubaiDate } from "@/lib/dubai-time";

const NAV_GROUPS: Array<{
  group: string;
  items: Array<{
    id: NavSection;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}> = [
  {
    group: "Ledger & capture",
    items: [
      {
        id: "dashboard",
        label: "Overview",
        shortLabel: "Overview",
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
        shortLabel: "Record",
        icon: PlusCircle,
      },
    ],
  },
  {
    group: "Obligations & plans",
    items: [
      {
        id: "cards",
        label: "Cards, Loans & Debt",
        shortLabel: "Debt",
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
    ],
  },
  {
    group: "Workspace",
    items: [
      {
        id: "settings",
        label: "Settings",
        shortLabel: "Settings",
        icon: Settings,
      },
    ],
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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  const unreadNotifications =
    state?.notifications.filter((n) => !n.is_read) ?? [];

  const openStatementsCount =
    (state?.statements.filter((s) => s.status !== "paid").length ?? 0) +
    (state?.loans?.filter((l) => l.status !== "paid_off").length ?? 0);

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
          "Browser push notifications enabled while browser is open."
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

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const currentNavLabel =
    allItems.find((i) => i.id === activeSection)?.label || "Overview";

  return (
    <div className="app-shell">
      {/* Mobile 48px Top Bar (hidden on desktop) */}
      <div className="mobile-topbar">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={() => setMobileMenuOpen(true)}
            className="btn px-2.5 h-8"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="font-semibold text-[15px]">{currentNavLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Select month on mobile"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="btn h-8 px-2 text-[12px]"
          >
            {AVAILABLE_MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setActiveSection("add")}
            className="btn primary h-8 px-3 text-[12px]"
          >
            Record
          </button>
        </div>
      </div>

      {/* Open-Plane Sidebar (sticky on desktop, full-screen sheet on mobile when open) */}
      <aside
        aria-label="Primary Sidebar Navigation"
        className={`app-sidebar ${mobileMenuOpen ? "open" : ""}`}
      >
        {/* Product Mark & Workspace Scope Switcher */}
        <div className="px-2.5 pb-3 border-b border-[var(--border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <svg
              width="24"
              height="24"
              viewBox="0 0 28 28"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect
                x="2"
                y="2"
                width="24"
                height="24"
                rx="5"
                stroke="var(--text)"
                strokeWidth="1.75"
              />
              <path
                d="M8 9H15.5C18.5 9 20.5 11 20.5 14C20.5 17 18.5 19 15.5 19H8V9Z"
                stroke="var(--text)"
                strokeWidth="1.75"
              />
              <path
                d="M6 12.5H17M6 15.5H17"
                stroke="var(--data-hue)"
                strokeWidth="1.5"
              />
            </svg>
            <div className="min-w-0">
              <div className="font-semibold text-[15px] leading-tight truncate">
                DirhamPulse
              </div>
              <div className="text-[12px] text-[var(--muted)] truncate">
                UAE Personal Ledger · AED
              </div>
            </div>
          </div>

          {mobileMenuOpen && (
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileMenuOpen(false)}
              className="btn px-2 h-8"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Period & Scope Controls in Sidebar */}
        <div className="px-2 pt-3 pb-1 space-y-2">
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Select Accounting Month"
              data-testid="month-selector"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="btn flex-1 justify-between text-[13px] h-8 px-2.5"
            >
              {AVAILABLE_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  Period: {m.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-label="Toggle Light/Dark Theme"
              onClick={toggleTheme}
              className="btn h-8 px-2.5"
              title="Switch light or dark theme"
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.group}>
              <div className="sidebar-group-label">{group.group}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`nav-${item.id}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className="nav-item"
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.id === "cards" && openStatementsCount > 0 && (
                        <span className="text-[12px] text-[var(--muted)] num">
                          {openStatementsCount} due
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Utilities: Notifications, Offline Toggle, User Account */}
        <div className="pt-3 mt-4 border-t border-[var(--border)] space-y-2 px-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Open Notifications"
              data-testid="notification-bell-btn"
              onClick={() => setNotifOpen((o) => !o)}
              className="btn flex-1 justify-between h-8 px-2.5 text-[12px]"
            >
              <span className="flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" />
                <span>Alerts</span>
              </span>
              {unreadNotifications.length > 0 && (
                <span
                  data-testid="unread-notification-count"
                  className="pill warn"
                >
                  {unreadNotifications.length} open
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="toggle-offline-btn"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              className="btn h-8 px-2.5 text-[12px]"
              title="Toggle offline queue mode"
            >
              <WifiOff className="h-3.5 w-3.5" />
              <span>{isOffline ? "Offline" : "Online"}</span>
            </button>
          </div>

          {notifOpen && (
            <div className="panel p-3 space-y-2.5">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="text-[13px] font-semibold">
                  Notification center
                </span>
                {unreadNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => mutateFinance("mark_notifications_read")}
                    className="text-[12px] text-[var(--muted)] hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto space-y-2">
                {(state?.notifications ?? []).length === 0 ? (
                  <p className="text-[12px] text-[var(--muted)] py-2">
                    No active alerts.
                  </p>
                ) : (
                  state?.notifications.map((n) => (
                    <div
                      key={n.id}
                      className="p-2 rounded bg-[var(--raised)] space-y-1"
                    >
                      <div className="text-[12px] font-medium">{n.title}</div>
                      <p className="text-[12px] text-[var(--muted)] leading-snug">
                        {n.message}
                      </p>
                      <div className="text-[12px] text-[var(--faint)]">
                        {formatDubaiDate(n.created_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={handleRequestBrowserPush}
                className="btn w-full h-8 text-[12px]"
              >
                Enable browser push reminders
              </button>
              {pushStatus && (
                <p className="text-[12px] text-[var(--muted)]">{pushStatus}</p>
              )}
            </div>
          )}

          <div className="px-2 py-2 rounded-[6px] bg-[var(--raised)] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium truncate">
                {state?.profile.full_name || session?.fullName}
              </span>
              {state?.profile.is_demo_mode && (
                <span data-testid="demo-mode-badge" className="pill">
                  Demo data
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
              <span className="truncate">{session?.email}</span>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1 text-[var(--negative)] font-medium cursor-pointer shrink-0"
              >
                <LogOut className="h-3 w-3" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Canvas */}
      <main className="app-canvas">
        {/* Offline / Unsynchronized Queue Notice */}
        {(isOffline || offlineQueue.length > 0) && (
          <div
            role="status"
            data-testid="offline-sync-banner"
            className="mb-4 p-3 rounded-[6px] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-[13px]"
          >
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>
                {isOffline
                  ? "Offline mode active. Viewing cached shell; new manual transactions are queued locally without data loss."
                  : `Connection restored. ${offlineQueue.length} queued transaction(s) ready to synchronize.`}
              </span>
              {offlineQueue.length > 0 && (
                <span className="pill warn">
                  {offlineQueue.length} unsynchronized
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {simulatedOffline && (
                <button
                  type="button"
                  onClick={() => setSimulatedOffline(false)}
                  className="btn h-8 px-3 text-[12px]"
                >
                  Reconnect network
                </button>
              )}
              {!isOffline && offlineQueue.length > 0 && (
                <button
                  type="button"
                  onClick={syncOfflineQueueNow}
                  disabled={syncingQueue}
                  className="btn primary h-8 px-3 text-[12px]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{syncingQueue ? "Syncing..." : "Sync now"}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {children}
      </main>

      {/* Mobile Fixed Bottom Bar (5 core destinations) */}
      <nav aria-label="Mobile Bottom Navigation" className="mobile-bottom-nav">
        {[
          { id: "dashboard" as NavSection, label: "Overview", icon: LayoutDashboard },
          { id: "transactions" as NavSection, label: "Ledger", icon: ListOrdered },
          { id: "add" as NavSection, label: "Record", icon: PlusCircle },
          { id: "cards" as NavSection, label: "Cards", icon: CreditCard },
          { id: "budgets" as NavSection, label: "Budgets", icon: PieChart },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 rounded text-[12px] font-medium cursor-pointer ${
                active ? "text-[var(--text)] bg-[var(--active)]" : "text-[var(--muted)]"
              }`}
            >
              <Icon className="h-4 w-4 mb-0.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
