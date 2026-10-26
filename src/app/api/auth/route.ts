import { NextRequest, NextResponse } from "next/server";
import {
  getServerSession,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from "@/lib/auth-session";
import {
  DEFAULT_DEMO_EMAIL,
  DEFAULT_DEMO_USER_ID,
  registerOrAuthenticateUser,
  resetUserPassword,
} from "@/lib/server-store";

export async function GET() {
  const session = await getServerSession();
  return NextResponse.json({ authenticated: Boolean(session), session });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "signout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.delete(SESSION_COOKIE_NAME);
      res.cookies.set("dp_signed_out", "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      return res;
    }

    if (action === "demo_login") {
      const session = {
        userId: DEFAULT_DEMO_USER_ID,
        email: DEFAULT_DEMO_EMAIL,
        fullName: "Rashid Al Maktoum (UAE Sandbox)",
      };
      const token = signSessionToken(session);
      const res = NextResponse.json({ ok: true, session });
      res.cookies.delete("dp_signed_out");
      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 14,
      });
      return res;
    }

    if (action === "reset_password") {
      const email = String(body.email || "");
      const newPassword = String(body.newPassword || "");
      if (!email || newPassword.length < 8) {
        return NextResponse.json(
          { error: "Valid email and password (min 8 chars) required." },
          { status: 400 }
        );
      }
      const result = resetUserPassword(email, newPassword);
      return NextResponse.json(result);
    }

    if (action === "signin" || action === "signup") {
      const email = String(body.email || "").trim();
      const password = String(body.password || "");
      const fullName = String(body.fullName || "UAE Resident").trim();
      const seedDemoData = Boolean(body.seedDemoData);

      if (!email.includes("@") || password.length < 6) {
        return NextResponse.json(
          { error: "Please enter a valid email and password (min 6 characters)." },
          { status: 400 }
        );
      }

      const result = registerOrAuthenticateUser({
        mode: action,
        email,
        password,
        fullName,
        seedDemoData,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 401 });
      }

      const session = {
        userId: result.user.userId,
        email: result.user.email,
        fullName: result.user.fullName,
      };
      const token = signSessionToken(session);
      const res = NextResponse.json({ ok: true, session });
      res.cookies.delete("dp_signed_out");
      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 14,
      });
      return res;
    }

    return NextResponse.json({ error: "Unsupported auth action" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Authentication request failed" },
      { status: 500 }
    );
  }
}
