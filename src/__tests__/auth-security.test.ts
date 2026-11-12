import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db";
import {
  changeUserPassword,
  demoSandboxEnabled,
  registerOrAuthenticateUser,
} from "@/lib/server-store";

async function storedHash(email: string): Promise<string> {
  const { rows } = await getPool().query("SELECT password_hash FROM app_users WHERE email = $1", [email]);
  return rows[0].password_hash;
}

describe("Password storage and demo sandbox", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores a salted scrypt hash, never the plain or SHA-256 password", async () => {
    const a = await registerOrAuthenticateUser({ mode: "signup", email: "hash-a@example.test", password: "same-password-1" });
    const b = await registerOrAuthenticateUser({ mode: "signup", email: "hash-b@example.test", password: "same-password-1" });
    expect(a.ok && b.ok).toBe(true);

    const hashA = await storedHash("hash-a@example.test");
    const hashB = await storedHash("hash-b@example.test");
    expect(hashA.startsWith("scrypt$")).toBe(true);
    expect(hashA).not.toContain("same-password-1");
    expect(hashA).not.toBe(hashB); // per-user salt

    expect((await registerOrAuthenticateUser({ mode: "signin", email: "hash-a@example.test", password: "same-password-1" })).ok).toBe(true);
    expect((await registerOrAuthenticateUser({ mode: "signin", email: "hash-a@example.test", password: "wrong-password" })).ok).toBe(false);
  });

  it("accepts an old SHA-256 hash once and upgrades it to scrypt", async () => {
    const legacy = crypto.createHash("sha256").update("uae_fin_salt_old-password-1").digest("hex");
    await getPool().query(
      "INSERT INTO app_users (user_id, email, full_name, password_hash) VALUES ($1, $2, $3, $4)",
      ["usr_legacy", "legacy@example.test", "Legacy", legacy]
    );

    const signin = await registerOrAuthenticateUser({ mode: "signin", email: "legacy@example.test", password: "old-password-1" });
    expect(signin.ok).toBe(true);
    expect((await storedHash("legacy@example.test")).startsWith("scrypt$")).toBe(true);
    expect((await registerOrAuthenticateUser({ mode: "signin", email: "legacy@example.test", password: "old-password-1" })).ok).toBe(true);
  });

  it("changing a password requires the current password", async () => {
    await registerOrAuthenticateUser({ mode: "signup", email: "change@example.test", password: "first-password-1" });

    const wrong = await changeUserPassword("change@example.test", "not-my-password", "second-password-2");
    expect(wrong.ok).toBe(false);
    expect((await registerOrAuthenticateUser({ mode: "signin", email: "change@example.test", password: "first-password-1" })).ok).toBe(true);

    const right = await changeUserPassword("change@example.test", "first-password-1", "second-password-2");
    expect(right.ok).toBe(true);
    expect((await registerOrAuthenticateUser({ mode: "signin", email: "change@example.test", password: "first-password-1" })).ok).toBe(false);
    expect((await registerOrAuthenticateUser({ mode: "signin", email: "change@example.test", password: "second-password-2" })).ok).toBe(true);
  });

  it("demo sandbox is disabled in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(demoSandboxEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(demoSandboxEnabled()).toBe(true);
  });
});
