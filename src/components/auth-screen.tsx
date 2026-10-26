"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  ArrowRight,
  KeyRound,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

interface AuthScreenProps {
  onAuthenticated: () => Promise<void>;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("owner@dirhampulse.ae");
  const [password, setPassword] = useState("DubaiFinance2026!");
  const [fullName, setFullName] = useState("UAE Resident");
  const [seedDemoData, setSeedDemoData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfoMessage(null);

    try {
      if (mode === "reset") {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reset_password",
            email,
            newPassword: password,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Password reset failed");
        } else {
          setInfoMessage(data.message);
          setMode("signin");
        }
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          email,
          password,
          fullName,
          seedDemoData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Authentication failed");
        setSubmitting(false);
        return;
      }

      await onAuthenticated();
    } catch {
      setError("Network error while signing in.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemoSignIn = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demo_login" }),
      });
      if (res.ok) {
        await onAuthenticated();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-teal-500/15 border border-teal-500/40 flex items-center justify-center text-teal-400 font-bold text-lg">
            AED
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              DirhamPulse UAE
            </h1>
            <p className="text-xs text-slate-400">
              Private Personal Finance &amp; Expense Management Portal
            </p>
          </div>
        </div>

        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition ${
              mode === "signin"
                ? "bg-teal-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition ${
              mode === "signup"
                ? "bg-teal-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Register Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("reset");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition ${
              mode === "reset"
                ? "bg-teal-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Reset Password
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-rose-950/60 border border-rose-700/60 px-3.5 py-2.5 text-xs text-rose-200"
          >
            {error}
          </div>
        )}

        {infoMessage && (
          <div className="rounded-xl bg-emerald-950/60 border border-emerald-700/60 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{infoMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
                  placeholder="Your Name"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
                placeholder="you@example.ae"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {mode === "reset" ? "New Password (min 8 chars)" : "Password"}
            </label>
            <div className="relative">
              {mode === "reset" ? (
                <KeyRound className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
              ) : (
                <Lock className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
              )}
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {mode === "signup" && (
            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={seedDemoData}
                onChange={(e) => setSeedDemoData(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-teal-500"
              />
              <span>
                Include optional UAE sample data (labeled Demo Mode)
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold py-2.5 text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <span>
              {submitting
                ? "Processing..."
                : mode === "signin"
                ? "Sign In to Vault"
                : mode === "signup"
                ? "Create Isolated Account"
                : "Update Password"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="pt-2 border-t border-slate-800 space-y-3">
          <button
            type="button"
            onClick={handleQuickDemoSignIn}
            disabled={submitting}
            className="w-full rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 py-2 text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Instant Sign-In to UAE Demo Sandbox</span>
          </button>

          <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <ShieldCheck className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200">Zero-Trust Privacy:</strong>{" "}
              Row-Level Security (RLS) isolates every account by{" "}
              <code className="text-teal-300">user_id</code>. Full card numbers,
              CVVs, PINs, and OTPs are strictly blocked.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
