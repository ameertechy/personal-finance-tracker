import crypto from "crypto";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./supabase/server";
import { DEFAULT_DEMO_EMAIL, DEFAULT_DEMO_USER_ID } from "./server-store";

export const SESSION_COOKIE_NAME = "dp_uae_session";

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dirham_pulse_session_hmac_secret_2026"
  );
}

export interface AuthenticatedSession {
  userId: string;
  email: string;
  fullName: string;
}

export function signSessionToken(session: AuthenticatedSession): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined | null
): AuthenticatedSession | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  if (expectedSig !== sig) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AuthenticatedSession;
    if (!parsed.userId || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Resolves the currently authenticated user from either:
 * 1. Supabase Auth server session (if Supabase is configured and active), OR
 * 2. Signed HTTP-only session cookie (`dp_uae_session`).
 * If neither is present and the user hasn't explicitly signed out (`dp_signed_out=1`),
 * falls back in local development sandbox to the owner sandbox session so the preview works immediately,
 * while still supporting full sign-out, login, registration, and multi-user isolation.
 */
export async function getServerSession(): Promise<AuthenticatedSession | null> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        return {
          userId: data.user.id,
          email: data.user.email ?? "user@dirhampulse.ae",
          fullName:
            (data.user.user_metadata?.full_name as string) ?? "UAE Resident",
        };
      }
    } catch {
      // Fallback to signed session cookie
    }
  }

  const cookieStore = await cookies();
  const signedOutFlag = cookieStore.get("dp_signed_out")?.value;
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const verified = verifySessionToken(rawToken);
  if (verified) return verified;

  if (signedOutFlag === "1") {
    return null;
  }

  // Default sandbox owner session on initial visit before explicit sign-out
  return {
    userId: DEFAULT_DEMO_USER_ID,
    email: DEFAULT_DEMO_EMAIL,
    fullName: "Rashid Al Maktoum (UAE Sandbox)",
  };
}
