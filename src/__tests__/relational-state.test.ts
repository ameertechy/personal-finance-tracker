import { describe, expect, it } from "vitest";
import { createInitialUserFinancialState } from "@/lib/default-data";
import { withTransaction } from "@/lib/db";
import { loadState, syncState } from "@/lib/relational-state";
import {
  deleteUserAccountAndData,
  getUserState,
  registerOrAuthenticateUser,
  saveUserState,
} from "@/lib/server-store";

describe("PostgreSQL relational storage", () => {
  it("round-trips a full seeded state through the tables without losing fields or order", async () => {
    await getUserState("usr_uae_owner_01"); // ensures schema exists
    const userId = "usr_roundtrip";
    const initial = createInitialUserFinancialState({
      userId,
      email: "roundtrip@example.test",
      fullName: "Round Trip",
      seedDemoData: true,
    });

    const loaded = await withTransaction(async (client) => {
      await client.query(
        "INSERT INTO app_users (user_id, email, full_name, password_hash) VALUES ($1, $2, $3, NULL)",
        [userId, "roundtrip@example.test", "Round Trip"]
      );
      await syncState(client, userId, null, initial);
      return loadState(client, userId);
    });

    expect(loaded).toEqual(initial);
  });

  it("persists updates, keeps prepend order, and cascades loan deletion to its payments", async () => {
    const signup = await registerOrAuthenticateUser({
      mode: "signup",
      email: "cascade@example.test",
      password: "test-password-1",
      seedDemoData: true,
    });
    if (!signup.ok) throw new Error(signup.error);
    const userId = signup.user.userId;
    const before = await getUserState(userId);
    const loanWithPayment = before.loans.find((l) =>
      before.loan_payments.some((p) => p.loan_id === l.id)
    )!;
    expect(loanWithPayment).toBeDefined();

    const after = await saveUserState(userId, (curr) => ({
      ...curr,
      audit_logs: [
        { id: "aud_test_1", user_id: userId, entity_type: "loan", entity_id: loanWithPayment.id,
          action: "delete", summary: "test", created_at: new Date().toISOString() },
        ...curr.audit_logs,
      ],
      loans: curr.loans.filter((l) => l.id !== loanWithPayment.id),
    }));

    expect(after.audit_logs[0].id).toBe("aud_test_1");
    expect(after.audit_logs.length).toBe(before.audit_logs.length + 1);
    expect(after.loans.some((l) => l.id === loanWithPayment.id)).toBe(false);
    expect(after.loan_payments.some((p) => p.loan_id === loanWithPayment.id)).toBe(false);

    const reloaded = await getUserState(userId);
    expect(reloaded).toEqual(after);
  });

  it("deleting a user removes all of their rows", async () => {
    await deleteUserAccountAndData("usr_roundtrip");
    const rows = await withTransaction(async (client) => {
      const r = await client.query("SELECT count(*)::int AS n FROM transactions WHERE user_id = $1", ["usr_roundtrip"]);
      return r.rows[0].n as number;
    });
    expect(rows).toBe(0);
  });
});
