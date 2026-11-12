import crypto from "crypto";
import type { PoolClient } from "pg";
import { createInitialUserFinancialState } from "./default-data";
import { applySchema, getPool, withTransaction } from "./db";
import { loadState, syncState } from "./relational-state";
import { ReceiptRecord, UserFinancialState } from "./types";

export interface StoredUserAccount {
  userId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  createdAt: string;
}

const DEFAULT_DEMO_USER_ID = "usr_uae_owner_01";
const DEFAULT_DEMO_EMAIL = "owner@dirhampulse.ae";

/** The demo sandbox (auto sign-in, demo_login, seeded demo account) is for local development only. */
export function demoSandboxEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

const SCRYPT_KEY_LENGTH = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

/** Salted scrypt hash, stored as "scrypt$<salt hex>$<key hex>". */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Old hashes from before scrypt: unsalted SHA-256. Still accepted, then upgraded on sign-in. */
function legacySha256Hash(password: string): string {
  return crypto.createHash("sha256").update(`uae_fin_salt_${password}`).digest("hex");
}

function isLegacyHash(stored: string): boolean {
  return !stored.startsWith("scrypt$");
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  let expected: Buffer;
  let actual: Buffer;
  if (isLegacyHash(stored)) {
    expected = Buffer.from(stored, "hex");
    actual = Buffer.from(legacySha256Hash(password), "hex");
  } else {
    const [, saltHex, keyHex] = stored.split("$");
    expected = Buffer.from(keyHex ?? "", "hex");
    actual = await scryptAsync(password, Buffer.from(saltHex ?? "", "hex"));
  }
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function getSigningSecret(): string {
  return (
    process.env.RECEIPT_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dirham_pulse_private_receipt_signing_key_2026"
  );
}

function buildSampleReceiptDataUrl(): string {
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

  return `data:image/svg+xml;base64,${Buffer.from(svgReceipt).toString("base64")}`;
}

let readyPromise: Promise<void> | null = null;

/** Creates the schema and, outside production on an empty database, the demo user. */
function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = withTransaction(async (client) => {
      await applySchema(client);
      if (!demoSandboxEnabled()) return;
      const { rows } = await client.query("SELECT 1 FROM app_users LIMIT 1");
      if (rows.length > 0) return;

      await client.query(
        `INSERT INTO app_users (user_id, email, full_name, password_hash) VALUES ($1, $2, $3, $4)`,
        [
          DEFAULT_DEMO_USER_ID,
          DEFAULT_DEMO_EMAIL,
          "Rashid Al Maktoum (UAE Sandbox)",
          await hashPassword("DubaiFinance2026!"),
        ]
      );
      const initialState = createInitialUserFinancialState({
        userId: DEFAULT_DEMO_USER_ID,
        email: DEFAULT_DEMO_EMAIL,
        fullName: "Rashid Al Maktoum (UAE Sandbox)",
        seedDemoData: true,
      });
      await syncState(client, DEFAULT_DEMO_USER_ID, null, initialState);
      await client.query(
        `INSERT INTO receipt_blobs (receipt_id, user_id, mime_type, data_url) VALUES ($1, $2, $3, $4)`,
        [`rcpt_${DEFAULT_DEMO_USER_ID}_1`, DEFAULT_DEMO_USER_ID, "image/svg+xml", buildSampleReceiptDataUrl()]
      );
    }).catch((err) => {
      readyPromise = null; // allow a retry on the next request
      throw err;
    });
  }
  return readyPromise;
}

/** Loads a user's state, creating the initial state if the user has none yet. */
async function loadOrCreateState(client: PoolClient, userId: string): Promise<UserFinancialState> {
  const existing = await loadState(client, userId);
  if (existing) return existing;

  const { rows } = await client.query(
    "SELECT email, full_name FROM app_users WHERE user_id = $1",
    [userId]
  );
  const email: string = rows[0]?.email ?? `${userId}@dirhampulse.ae`;
  const fullName: string = rows[0]?.full_name ?? "UAE Resident";
  if (rows.length === 0) {
    // e.g. a Supabase-authenticated user with no local account row
    await client.query(
      `INSERT INTO app_users (user_id, email, full_name, password_hash) VALUES ($1, $2, $3, NULL)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, email, fullName]
    );
  }
  const initial = createInitialUserFinancialState({
    userId,
    email,
    fullName,
    seedDemoData: userId === DEFAULT_DEMO_USER_ID,
  });
  await syncState(client, userId, null, initial);
  return (await loadState(client, userId))!;
}

export async function getUserState(userId: string): Promise<UserFinancialState> {
  await ensureReady();
  return withTransaction((client) => loadOrCreateState(client, userId));
}

export async function saveUserState(
  userId: string,
  updater: (current: UserFinancialState) => UserFinancialState
): Promise<UserFinancialState> {
  await ensureReady();
  return withTransaction(async (client) => {
    // Serialize concurrent saves for the same user.
    await client.query("SELECT 1 FROM app_users WHERE user_id = $1 FOR UPDATE", [userId]);
    const current = await loadOrCreateState(client, userId);
    const before = structuredClone(current);
    const updated = updater(current);
    await syncState(client, userId, before, updated);
    return (await loadState(client, userId))!;
  });
}

export async function deleteUserAccountAndData(userId: string): Promise<void> {
  await ensureReady();
  // Every user table references app_users with ON DELETE CASCADE.
  await getPool().query("DELETE FROM app_users WHERE user_id = $1", [userId]);
}

function toStoredUser(row: {
  user_id: string;
  email: string;
  full_name: string;
  password_hash: string | null;
  created_at: string;
}): StoredUserAccount {
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    passwordHash: row.password_hash ?? "",
    createdAt: row.created_at,
  };
}

export async function registerOrAuthenticateUser(params: {
  mode: "signin" | "signup";
  email: string;
  password: string;
  fullName?: string;
  seedDemoData?: boolean;
}): Promise<{ ok: true; user: StoredUserAccount } | { ok: false; error: string }> {
  await ensureReady();
  const normEmail = params.email.trim().toLowerCase();

  const { rows } = await getPool().query(
    "SELECT user_id, email, full_name, password_hash, created_at FROM app_users WHERE lower(email) = $1",
    [normEmail]
  );
  const existing = rows[0] ? toStoredUser(rows[0]) : null;

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
      passwordHash: await hashPassword(params.password),
      createdAt: new Date().toISOString(),
    };
    try {
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO app_users (user_id, email, full_name, password_hash, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [newUser.userId, newUser.email, newUser.fullName, newUser.passwordHash, newUser.createdAt]
        );
        const initial = createInitialUserFinancialState({
          userId,
          email: normEmail,
          fullName: newUser.fullName,
          seedDemoData: Boolean(params.seedDemoData),
        });
        await syncState(client, userId, null, initial);
      });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return {
          ok: false,
          error: "An account with this email already exists. Please sign in.",
        };
      }
      throw err;
    }
    return { ok: true, user: newUser };
  }

  // Sign-in mode
  if (!existing) {
    await hashPassword(params.password); // same cost as a real check, so timing doesn't reveal which emails exist
    return {
      ok: false,
      error: "Invalid email or password.",
    };
  }
  if (!(await verifyPassword(params.password, existing.passwordHash))) {
    return {
      ok: false,
      error: "Invalid email or password.",
    };
  }
  if (isLegacyHash(existing.passwordHash)) {
    await getPool().query("UPDATE app_users SET password_hash = $1 WHERE user_id = $2", [
      await hashPassword(params.password),
      existing.userId,
    ]);
  }
  return { ok: true, user: existing };
}

/** Changes a password. Requires the current password (there is no email-based reset). */
export async function changeUserPassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const auth = await registerOrAuthenticateUser({ mode: "signin", email, password: currentPassword });
  if (!auth.ok) {
    return { ok: false, error: "Email or current password is incorrect." };
  }
  await getPool().query("UPDATE app_users SET password_hash = $1 WHERE user_id = $2", [
    await hashPassword(newPassword),
    auth.user.userId,
  ]);
  return {
    ok: true,
    message: "Password changed. You can now sign in with your new password.",
  };
}

export async function storePrivateReceiptBlob(params: {
  receipt: ReceiptRecord;
  dataUrl: string;
}): Promise<void> {
  await ensureReady();
  await getPool().query(
    `INSERT INTO receipt_blobs (receipt_id, user_id, mime_type, data_url) VALUES ($1, $2, $3, $4)
     ON CONFLICT (receipt_id) DO UPDATE SET mime_type = EXCLUDED.mime_type, data_url = EXCLUDED.data_url
     WHERE receipt_blobs.user_id = EXCLUDED.user_id`,
    [params.receipt.id, params.receipt.user_id, params.receipt.mime_type, params.dataUrl]
  );
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
export async function verifySignedReceiptAccess(params: {
  token: string;
  requestingUserId: string;
  receiptId: string;
}): Promise<{ authorized: boolean; reason?: string; dataUrl?: string }> {
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

    await ensureReady();
    const receiptMeta = await getPool().query(
      "SELECT 1 FROM receipts WHERE id = $1 AND user_id = $2",
      [params.receiptId, params.requestingUserId]
    );
    if (receiptMeta.rows.length === 0) {
      return {
        authorized: false,
        reason: "Receipt not found or not owned by authenticated user.",
      };
    }

    const blob = await getPool().query(
      "SELECT data_url FROM receipt_blobs WHERE receipt_id = $1",
      [params.receiptId]
    );
    return {
      authorized: true,
      dataUrl: blob.rows[0]?.data_url,
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
