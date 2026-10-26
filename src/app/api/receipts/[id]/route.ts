import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-session";
import {
  createSignedReceiptToken,
  getUserState,
  verifySignedReceiptAccess,
} from "@/lib/server-store";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const token = req.nextUrl.searchParams.get("token");

  // If no token passed, generate a short-lived signed URL for the owner
  if (!token) {
    const state = getUserState(session.userId);
    const receipt = state.receipts.find((r) => r.id === id);
    if (!receipt || receipt.user_id !== session.userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this receipt." },
        { status: 403 }
      );
    }

    const signed = createSignedReceiptToken({
      receiptId: id,
      userId: session.userId,
      ttlSeconds: 300,
    });

    return NextResponse.json({
      receipt,
      signedUrl: `/api/receipts/${id}?token=${encodeURIComponent(signed.token)}`,
      expiresAt: signed.expiresAt,
    });
  }

  // Verify short-lived signed token + strict RLS ownership check
  const verification = verifySignedReceiptAccess({
    token,
    requestingUserId: session.userId,
    receiptId: id,
  });

  if (!verification.authorized) {
    return NextResponse.json(
      { error: verification.reason || "Access denied" },
      { status: 403 }
    );
  }

  const state = getUserState(session.userId);
  const receipt = state.receipts.find((r) => r.id === id);

  return NextResponse.json({
    authorized: true,
    receipt,
    dataUrl: verification.dataUrl ?? null,
  });
}
