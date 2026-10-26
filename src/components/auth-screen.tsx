"use client";

import React, { useState } from "react";

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
    <div className="min-h-screen bg-[var(--ground)] text-[var(--text)] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md panel space-y-5">
        <div className="flex items-center gap-3">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
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
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">
              DirhamPulse UAE
            </h1>
            <p className="text-[12px] text-[var(--muted)]">
              Personal Finance &amp; Salary Ledger · Asia/Dubai (AED)
            </p>
          </div>
        </div>

        <div className="segmented w-full flex">
          <button
            type="button"
            aria-pressed={mode === "signin"}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className="flex-1"
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className="flex-1"
          >
            Register account
          </button>
          <button
            type="button"
            aria-pressed={mode === "reset"}
            onClick={() => {
              setMode("reset");
              setError(null);
            }}
            className="flex-1"
          >
            Reset password
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-[6px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] px-3 py-2 text-[13px]"
          >
            {error}
          </div>
        )}

        {infoMessage && (
          <div className="rounded-[6px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] px-3 py-2 text-[13px]">
            {infoMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <label className="block text-[14px] font-medium">Full name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-control"
                placeholder="Your full name"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-control"
              placeholder="you@dirhampulse.ae"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[14px] font-medium">
              {mode === "reset" ? "New password (min 8 characters)" : "Password"}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-control"
              placeholder="••••••••••••"
            />
          </div>

          {mode === "signup" && (
            <label className="flex items-center gap-2 text-[13px] text-[var(--muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={seedDemoData}
                onChange={(e) => setSeedDemoData(e.target.checked)}
              />
              <span>Include UAE sample data (labeled Demo Mode)</span>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn primary w-full"
          >
            {submitting
              ? "Processing..."
              : mode === "signin"
              ? "Sign in to ledger"
              : mode === "signup"
              ? "Create isolated account"
              : "Update password"}
          </button>
        </form>

        <div className="pt-3 border-t border-[var(--border)] space-y-3">
          <button
            type="button"
            onClick={handleQuickDemoSignIn}
            disabled={submitting}
            className="btn w-full"
          >
            Open UAE Demo Sandbox
          </button>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed">
            Row-level security isolates every account by{" "}
            <code>user_id</code>. Full card numbers, CVVs, PINs, and OTPs are
            rejected at validation.
          </p>
        </div>
      </div>
    </div>
  );
}
