"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { UserFinancialState } from "@/lib/types";

export type NavSection =
  | "dashboard"
  | "transactions"
  | "add"
  | "cards"
  | "budgets"
  | "reports"
  | "settings";

export interface QueuedOfflineMutation {
  queueId: string;
  action: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

interface SessionUser {
  userId: string;
  email: string;
  fullName: string;
}

interface FinanceContextValue {
  session: SessionUser | null;
  state: UserFinancialState | null;
  loading: boolean;
  error: string | null;
  activeSection: NavSection;
  setActiveSection: (section: NavSection) => void;
  selectedMonth: string;
  setSelectedMonth: (monthKey: string) => void;
  customDateRange: { from: string; to: string } | null;
  setCustomDateRange: (range: { from: string; to: string } | null) => void;
  isOffline: boolean;
  simulatedOffline: boolean;
  setSimulatedOffline: (val: boolean) => void;
  offlineQueue: QueuedOfflineMutation[];
  syncingQueue: boolean;
  syncOfflineQueueNow: () => Promise<void>;
  theme: "dark" | "light";
  toggleTheme: () => void;
  refreshState: () => Promise<void>;
  mutateFinance: (
    action: string,
    payload?: Record<string, unknown>
  ) => Promise<{
    ok: boolean;
    error?: string;
    isDuplicateWarning?: boolean;
    duplicateTransactionId?: string;
  }>;
  signOut: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const OFFLINE_QUEUE_KEY = "dp_uae_offline_queue_v1";

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [state, setState] = useState<UserFinancialState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>("dashboard");
  const [selectedMonth, setSelectedMonth] = useState<string>("2026-10");
  const [customDateRange, setCustomDateRange] = useState<{
    from: string;
    to: string;
  } | null>(null);

  const [browserOffline, setBrowserOffline] = useState<boolean>(() =>
    typeof window !== "undefined" ? !navigator.onLine : false
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<QueuedOfflineMutation[]>(
    () => {
      if (typeof window === "undefined") return [];
      try {
        const savedQ = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
        return savedQ ? (JSON.parse(savedQ) as QueuedOfflineMutation[]) : [];
      } catch {
        return [];
      }
    }
  );
  const [syncingQueue, setSyncingQueue] = useState<boolean>(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "light";
    const saved = window.localStorage.getItem("dp_theme");
    return saved === "dark" ? "dark" : "light";
  });

  const isOffline = browserOffline || simulatedOffline;

  // Register Service Worker & sync DOM theme attribute
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    const handleOnline = () => setBrowserOffline(false);
    const handleOffline = () => setBrowserOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal in dev mode
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") {
        window.localStorage.setItem("dp_theme", next);
        if (next === "dark") {
          document.documentElement.setAttribute("data-theme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
        }
      }
      return next;
    });
  }, []);

  const refreshState = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/finance", { cache: "no-store" });
      if (res.status === 401) {
        setSession(null);
        setState(null);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load financial records");
      }
      const data = await res.json();
      setSession(data.session);
      setState(data.state);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error while loading data"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/finance", { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) {
          setSession(null);
          setState(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!active) return;
        setSession(data.session);
        setState(data.state);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persistOfflineQueue = useCallback((next: QueuedOfflineMutation[]) => {
    setOfflineQueue(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
    }
  }, []);

  const syncOfflineQueueNow = useCallback(async () => {
    if (isOffline || offlineQueue.length === 0 || syncingQueue) return;
    setSyncingQueue(true);
    const remaining: QueuedOfflineMutation[] = [];

    for (const item of offlineQueue) {
      try {
        const res = await fetch("/api/finance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: item.action,
            ...item.payload,
          }),
        });
        if (res.ok || res.status === 409) {
          // 409 duplicate means it was already synced idempotently
          const data = await res.json();
          if (data.state) setState(data.state);
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    persistOfflineQueue(remaining);
    setSyncingQueue(false);
  }, [isOffline, offlineQueue, persistOfflineQueue, syncingQueue]);

  useEffect(() => {
    if (!isOffline && offlineQueue.length > 0 && !syncingQueue) {
      const timer = window.setTimeout(() => {
        void syncOfflineQueueNow();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOffline, offlineQueue.length, syncingQueue, syncOfflineQueueNow]);

  const mutateFinance = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      // If offline and creating a transaction, enqueue safely without losing or duplicating
      if (isOffline && action === "create_transaction" && payload.transaction) {
        const queueItem: QueuedOfflineMutation = {
          queueId: `oq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          action,
          payload,
          queuedAt: new Date().toISOString(),
        };
        persistOfflineQueue([...offlineQueue, queueItem]);
        return { ok: true };
      }

      try {
        const res = await fetch("/api/finance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            ok: false,
            error: data.error || "Operation failed",
            isDuplicateWarning: Boolean(data.isDuplicateWarning),
            duplicateTransactionId: data.duplicateTransactionId,
          };
        }
        if (data.deleted) {
          setSession(null);
          setState(null);
          return { ok: true };
        }
        if (data.state) {
          setState(data.state);
        }
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            "Network interruption detected. Check connection or retry.",
        };
      }
    },
    [isOffline, offlineQueue, persistOfflineQueue]
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signout" }),
    });
    setSession(null);
    setState(null);
  }, []);

  const value = useMemo<FinanceContextValue>(
    () => ({
      session,
      state,
      loading,
      error,
      activeSection,
      setActiveSection,
      selectedMonth,
      setSelectedMonth,
      customDateRange,
      setCustomDateRange,
      isOffline,
      simulatedOffline,
      setSimulatedOffline,
      offlineQueue,
      syncingQueue,
      syncOfflineQueueNow,
      theme,
      toggleTheme,
      refreshState,
      mutateFinance,
      signOut,
    }),
    [
      session,
      state,
      loading,
      error,
      activeSection,
      selectedMonth,
      customDateRange,
      isOffline,
      simulatedOffline,
      offlineQueue,
      syncingQueue,
      syncOfflineQueueNow,
      theme,
      toggleTheme,
      refreshState,
      mutateFinance,
      signOut,
    ]
  );

  return (
    <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error("useFinance must be used inside FinanceProvider");
  }
  return ctx;
}
