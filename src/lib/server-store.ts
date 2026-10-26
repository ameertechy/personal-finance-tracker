import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createInitialUserFinancialState } from "./default-data";
import { ReceiptRecord, UserFinancialState } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "finance-store.json");

export interface StoredUserAccount {
  userId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  createdAt: string;
}

interface PersistedDatabase {
  users: Record<string, StoredUserAccount>;
  states: Record<string, UserFinancialState>;
  receiptBlobs: Record<string, { userId: string; mimeType: string; dataUrl: string }>;
}

const DEFAULT_DEMO_USER_ID = "usr_uae_owner_01";
const DEFAULT_DEMO_EMAIL = "owner@dirhampulse.ae";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(`uae_fin_salt_${password}`).digest("hex");
}

function getSigningSecret(): string {
  return (
    process.env.RECEIPT_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dirham_pulse_private_receipt_signing_key_2026"
  );
}

let memoryDb: PersistedDatabase | null = null;

function ensureDbLoaded(): PersistedDatabase {
  if (memoryDb) return memoryDb;

  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf8");
      const parsed = JSON.parse(raw) as PersistedDatabase;
      if (parsed && parsed.users && parsed.states) {
        memoryDb = parsed;
        return memoryDb;
      }
    }
  } catch {
    // Fallback to fresh initialization if corrupted
  }

  const initialState = createInitialUserFinancialState({
    userId: DEFAULT_DEMO_USER_ID,
    email: DEFAULT_DEMO_EMAIL,
    fullName: "Rashid Al Maktoum (UAE Sandbox)",
    seedDemoData: true,
  });

  // Sample SVG receipt preview for the seeded Carrefour receipt
  const svgReceipt = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560" viewBox="0 0 420 560">
    <rect width="420" height="560" fill="#f8fafc"/>
    <rect x="24" y="20" width="372" height="520" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
    <text x="210" y="60" text-anchor="middle" font-family="monospace" font-size="16" font-weight="bold" fill="#0f172a">CARREFOUR HYPERMARKET</text>
    <text x="210" y="82" text-anchor="middle" font-family="monospace" font-size="12" fill="#475569">Mall of the Emirates, Dubai, UAE</text>
    <text x="210" y="100" text-anchor="middle" font-family="monospace" font-size="11" fill="#64748b">TRN: 100238491200003</text>
    <line x1="44" y1="118" x2="376" y2="118" stroke="#94a3b8" stroke-dasharray="4 4"/>
    <text x="48" y="145" font-family="monospace" font-size="12" fill="#1e293b">Date: 12 Oct 2026 18:45 GST</text>
    <text x="48" y="165" font-family="monospace" font-size="12" fill="#1e293b">Receipt #: MAF-884120</text>
    <line x1="44" y1="182" x2="376" y2="182" stroke="#94a3b8" stroke-dasharray="4 4"/>
    <text x="48" y="212" font-family="monospace" font-size="12" fill="#0f172a">1x Fresh Produce &amp; Dairy</text>
    <text x="370" y="212" text-anchor="end" font-family="monospace" font-size="12" fill="#0f172a">AED 182.30</text>
    <text x="48" y="240" font-family="monospace" font-size="12" fill="#0f172a">1x Household Supplies</text>
    <text x="370" y="240" text-anchor="end" font-family="monospace" font-size="12" fill="#0f172a">AED 160.00</text>
    <line x1="44" y1="270" x2="376" y2="270" stroke="#94a3b8" stroke-dasharray="4 4"/>
    <text x="48" y="300" font-family="monospace" font-size="12" fill="#475569">Subtotal (Excl. VAT)</text>
    <text x="370" y="300" text-anchor="end" font-family="monospace" font-size="12" fill="#475569">AED 326.00</text>
    <text x="48" y="324" font-family="monospace" font-size="12" fill="#475569">UAE VAT (5%)</text>
    <text x="370" y="324" text-anchor="end" font-family="monospace" font-size="12" fill="#475569">AED 16.30</text>
    <text x="48" y="360" font-family="monospace" font-size="15" font-weight="bold" fill="#0f766e">TOTAL PAID (AED)</text>
    <text x="370" y="360" text-anchor="end" font-family="monospace" font-size="15" font-weight="bold" fill="#0f766e">AED 342.30</text>
    <line x1="44" y1="382" x2="376" y2="382" stroke="#94a3b8" stroke-dasharray="4 4"/>
    <text x="48" y="410" font-family="monospace" font-size="11" fill="#475569">Card: Mastercard •••• 7390 (Contactless)</text>
    <text x="48" y="430" font-family="monospace" font-size="11" fill="#475569">Status: APPROVED</text>
    <text x="210" y="495" text-anchor="middle" font-family="monospace" font-size="11" fill="#64748b">Private Supabase Storage Object • Signed URL</text>
  </svg>`;

  const sampleDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgReceipt).toString("base64")}`;

  memoryDb = {
    users: {
      [DEFAULT_DEMO_USER_ID]: {
        userId: DEFAULT_DEMO_USER_ID,
        email: DEFAULT_DEMO_EMAIL,
        fullName: "Rashid Al Maktoum (UAE Sandbox)",
        passwordHash: hashPassword("DubaiFinance2026!"),
        createdAt: new Date().toISOString(),
      },
    },
    states: {
      [DEFAULT_DEMO_USER_ID]: initialState,
    },
    receiptBlobs: {
      [`rcpt_${DEFAULT_DEMO_USER_ID}_1`]: {
        userId: DEFAULT_DEMO_USER_ID,
        mimeType: "image/svg+xml",
        dataUrl: sampleDataUrl,
      },
    },
  };

  persistDb();
  return memoryDb;
}

function persistDb() {
  if (!memoryDb) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(memoryDb, null, 2), "utf8");
  } catch {
    // Non-fatal in read-only or ephemeral test environments
  }
}

export function getUserState(userId: string): UserFinancialState {
  const db = ensureDbLoaded();
  if (!db.states[userId]) {
    const userAcc = db.users[userId];
    db.states[userId] = createInitialUserFinancialState({
      userId,
      email: userAcc?.email ?? `${userId}@dirhampulse.ae`,
      fullName: userAcc?.fullName ?? "UAE Resident",
      seedDemoData: userId === DEFAULT_DEMO_USER_ID,
    });
    persistDb();
  }
  const st = db.states[userId];
  if (!Array.isArray(st.loans)) st.loans = [];
  if (!Array.isArray(st.loan_payments)) st.loan_payments = [];
  return st;
}

export function saveUserState(
  userId: string,
  updater: (current: UserFinancialState) => UserFinancialState
): UserFinancialState {
  const db = ensureDbLoaded();
  const current = getUserState(userId);
  const updated = updater(current);
  db.states[userId] = updated;
  persistDb();
  return updated;
}

export function deleteUserAccountAndData(userId: string): void {
  const db = ensureDbLoaded();
  delete db.states[userId];
  delete db.users[userId];
  for (const [rcptId, blob] of Object.entries(db.receiptBlobs)) {
    if (blob.userId === userId) {
      delete db.receiptBlobs[rcptId];
    }
  }
  persistDb();
}

export function registerOrAuthenticateUser(params: {
  mode: "signin" | "signup";
  email: string;
  password: string;
  fullName?: string;
  seedDemoData?: boolean;
}): { ok: true; user: StoredUserAccount } | { ok: false; error: string } {
  const db = ensureDbLoaded();
  const normEmail = params.email.trim().toLowerCase();

  const existing = Object.values(db.users).find(
    (u) => u.email.toLowerCase() === normEmail
  );

  if (params.mode === "signup") {
    if (existing) {
      return {
        ok: false,
        error: "An account with this email already exists. Please sign in.",
      };
    }
    const userId = `usr_${crypto.randomBytes(6).toString("hex")}`;
    const newUser: StoredUserAccount = {
      userId,
      email: normEmail,
      fullName: params.fullName?.trim() || "UAE Resident",
      passwordHash: hashPassword(params.password),
      createdAt: new Date().toISOString(),
    };
    db.users[userId] = newUser;
    db.states[userId] = createInitialUserFinancialState({
      userId,
      email: normEmail,
      fullName: newUser.fullName,
      seedDemoData: Boolean(params.seedDemoData),
    });
    persistDb();
    return { ok: true, user: newUser };
  }

  // Sign-in mode
  if (!existing) {
    return {
      ok: false,
      error: "Invalid email or password.",
    };
  }
  if (existing.passwordHash !== hashPassword(params.password)) {
    return {
      ok: false,
      error: "Invalid email or password.",
    };
  }
  return { ok: true, user: existing };
}

export function resetUserPassword(
  email: string,
  newPassword: string
): { ok: boolean; message: string } {
  const db = ensureDbLoaded();
  const normEmail = email.trim().toLowerCase();
  const existing = Object.values(db.users).find(
    (u) => u.email.toLowerCase() === normEmail
  );
  if (existing) {
    existing.passwordHash = hashPassword(newPassword);
    persistDb();
  }
  return {
    ok: true,
    message:
      "Password reset processed. You can now sign in with your updated credentials.",
  };
}

export function storePrivateReceiptBlob(params: {
  receipt: ReceiptRecord;
  dataUrl: string;
}) {
  const db = ensureDbLoaded();
  db.receiptBlobs[params.receipt.id] = {
    userId: params.receipt.user_id,
    mimeType: params.receipt.mime_type,
    dataUrl: params.dataUrl,
  };
  persistDb();
}

/**
 * Generates a short-lived signed token for viewing a private receipt.
 * Token binds: receiptId + owner userId + expiration timestamp + HMAC-SHA256 signature.
 */
export function createSignedReceiptToken(params: {
  receiptId: string;
  userId: string;
  ttlSeconds?: number;
}): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? 300);
  const payload = `${params.receiptId}:${params.userId}:${expiresAt}`;
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("hex");
  const token = Buffer.from(`${payload}:${sig}`).toString("base64url");
  return { token, expiresAt };
}

/**
 * Verifies a signed receipt token AND ensures the requesting user matches the owner.
 * Prevents unauthorized cross-user receipt access.
 */
export function verifySignedReceiptAccess(params: {
  token: string;
  requestingUserId: string;
  receiptId: string;
}): { authorized: boolean; reason?: string; dataUrl?: string } {
  try {
    const decoded = Buffer.from(params.token, "base64url").toString("utf8");
    const [tokenReceiptId, tokenUserId, expStr, providedSig] = decoded.split(":");
    if (!tokenReceiptId || !tokenUserId || !expStr || !providedSig) {
      return { authorized: false, reason: "Malformed signed URL token." };
    }

    if (tokenReceiptId !== params.receiptId) {
      return { authorized: false, reason: "Token receipt mismatch." };
    }

    if (tokenUserId !== params.requestingUserId) {
      return {
        authorized: false,
        reason: "Unauthorized: RLS policy denies access to another user's receipt.",
      };
    }

    const exp = Number(expStr);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(exp) || nowSec > exp) {
      return { authorized: false, reason: "Signed URL has expired." };
    }

    const expectedPayload = `${tokenReceiptId}:${tokenUserId}:${expStr}`;
    const expectedSig = crypto
      .createHmac("sha256", getSigningSecret())
      .update(expectedPayload)
      .digest("hex");

    if (expectedSig !== providedSig) {
      return { authorized: false, reason: "Invalid signature on receipt URL." };
    }

    const db = ensureDbLoaded();
    const state = getUserState(params.requestingUserId);
    const receiptMeta = state.receipts.find((r) => r.id === params.receiptId);
    if (!receiptMeta || receiptMeta.user_id !== params.requestingUserId) {
      return {
        authorized: false,
        reason: "Receipt not found or not owned by authenticated user.",
      };
    }

    const blob = db.receiptBlobs[params.receiptId];
    return {
      authorized: true,
      dataUrl: blob?.dataUrl,
    };
  } catch {
    return { authorized: false, reason: "Invalid signed receipt token." };
  }
}

/**
 * In-memory sliding window rate limiter for expensive OCR / AI extraction endpoints.
 */
const rateLimitBuckets = new Map<string, number[]>();

export function checkExtractionRateLimit(
  userId: string,
  maxRequests = 15,
  windowMs = 60_000
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const timestamps = (rateLimitBuckets.get(userId) ?? []).filter(
    (t) => now - t < windowMs
  );

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000)
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  timestamps.push(now);
  rateLimitBuckets.set(userId, timestamps);
  return {
    allowed: true,
    remaining: maxRequests - timestamps.length,
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitForTests(userId?: string) {
  if (userId) rateLimitBuckets.delete(userId);
  else rateLimitBuckets.clear();
}

export { DEFAULT_DEMO_USER_ID, DEFAULT_DEMO_EMAIL };
