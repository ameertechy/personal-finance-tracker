import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-session";
import {
  extractMultipleFromScreenshot,
  extractReceiptData,
  parseBankNotificationText,
  parseStatementCsv,
} from "@/lib/extraction";
import {
  checkExtractionRateLimit,
  getUserState,
  saveUserState,
  storePrivateReceiptBlob,
} from "@/lib/server-store";
import {
  ExtractionJob,
  ExtractionSourceType,
  ReceiptRecord,
} from "@/lib/types";
import { validateUploadedFileBytes } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkExtractionRateLimit(session.userId, 20, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded for OCR/extraction endpoint. Please retry in ${rateLimit.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  try {
    const body = await req.json();
    const sourceType = (body.sourceType || "sms_text") as ExtractionSourceType;
    const nowIso = new Date().toISOString();
    const state = getUserState(session.userId);

    // Handle retrying a previously failed extraction job
    if (body.action === "retry_job" && body.jobId) {
      const existingJob = state.extraction_jobs.find(
        (j) => j.id === body.jobId && j.user_id === session.userId
      );
      if (!existingJob) {
        return NextResponse.json(
          { error: "Extraction job not found." },
          { status: 404 }
        );
      }

      const candidate = extractReceiptData({
        fileName: existingJob.raw_input_preview || "retried_receipt.jpg",
        ocrTextHint: existingJob.raw_input_preview || "",
        existingTransactions: state.transactions,
      });

      const updatedJob: ExtractionJob = {
        ...existingJob,
        status: "needs_review",
        candidates: [candidate],
        flagged_fields: candidate.flagged_fields,
        error_message: null,
        retry_count: existingJob.retry_count + 1,
        updated_at: nowIso,
      };

      saveUserState(session.userId, (curr) => ({
        ...curr,
        extraction_jobs: curr.extraction_jobs.map((j) =>
          j.id === updatedJob.id ? updatedJob : j
        ),
      }));

      return NextResponse.json({ job: updatedJob, receipt: null });
    }

    let createdReceipt: ReceiptRecord | null = null;

    // Validate uploaded file if provided
    if (body.fileDataUrl && body.fileName && body.mimeType) {
      const base64Part = String(body.fileDataUrl).split(",")[1] || "";
      const buffer = Buffer.from(base64Part, "base64");
      const headerBytes = new Uint8Array(buffer.subarray(0, 16));

      const check = validateUploadedFileBytes({
        fileName: String(body.fileName),
        mimeType: String(body.mimeType),
        sizeBytes: buffer.byteLength,
        headerBytes,
      });

      if (!check.valid) {
        return NextResponse.json({ error: check.reason }, { status: 400 });
      }

      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const receiptId = `rcpt_${crypto.randomBytes(6).toString("hex")}`;
      createdReceipt = {
        id: receiptId,
        user_id: session.userId,
        storage_bucket: "receipts",
        storage_path: `${session.userId}/${receiptId}_${String(
          body.fileName
        ).replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        file_name: String(body.fileName),
        mime_type: body.mimeType as ReceiptRecord["mime_type"],
        file_size_bytes: buffer.byteLength,
        sha256_hash: sha256,
        source_kind:
          sourceType === "screenshot_ocr"
            ? "screenshot"
            : sourceType === "receipt_camera"
            ? "receipt_photo"
            : "gallery_upload",
        is_archived: false,
        created_at: nowIso,
        updated_at: nowIso,
      };

      storePrivateReceiptBlob({
        receipt: createdReceipt,
        dataUrl: String(body.fileDataUrl),
      });
    }

    // Check if client simulated an OCR failure to test retry & notification workflow
    if (body.simulateFailure === true) {
      const failedJob: ExtractionJob = {
        id: `job_${crypto.randomBytes(6).toString("hex")}`,
        user_id: session.userId,
        receipt_id: createdReceipt?.id ?? null,
        source_type: sourceType,
        status: "failed",
        raw_input_preview: String(
          body.fileName || body.rawText || "Unreadable image"
        ).slice(0, 120),
        candidates: [],
        flagged_fields: ["merchant", "amount", "transaction_date"],
        error_message:
          "OCR confidence below minimum threshold (blurry thermal print). Retry or edit manually.",
        retry_count: 0,
        created_at: nowIso,
        updated_at: nowIso,
      };

      saveUserState(session.userId, (curr) => ({
        ...curr,
        receipts: createdReceipt
          ? [createdReceipt, ...curr.receipts]
          : curr.receipts,
        extraction_jobs: [failedJob, ...curr.extraction_jobs],
        notifications: curr.notification_preferences.notify_failed_extractions
          ? [
              {
                id: `notif_${crypto.randomBytes(5).toString("hex")}`,
                user_id: session.userId,
                kind: "extraction_failed",
                severity: "warning",
                title: "Receipt Extraction Needs Attention",
                message: `Failed to automatically extract "${failedJob.raw_input_preview}". You can retry or enter details manually.`,
                action_url: "/add",
                is_read: false,
                created_at: nowIso,
              },
              ...curr.notifications,
            ]
          : curr.notifications,
      }));

      return NextResponse.json({ job: failedJob, receipt: createdReceipt });
    }

    let candidates = [];
    if (sourceType === "sms_text") {
      const rawText = String(body.rawText || "").trim();
      if (!rawText) {
        return NextResponse.json(
          { error: "Please paste a transaction SMS or notification message." },
          { status: 400 }
        );
      }
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 10);
      candidates =
        lines.length > 1
          ? lines.map((line) =>
              parseBankNotificationText(line, state.transactions)
            )
          : [parseBankNotificationText(rawText, state.transactions)];
    } else if (sourceType === "screenshot_ocr") {
      candidates = extractMultipleFromScreenshot({
        fileName: String(body.fileName || "screenshot.png"),
        ocrMultiLineText: String(body.ocrTextHint || ""),
        existingTransactions: state.transactions,
      });
    } else if (sourceType === "csv_statement") {
      candidates = parseStatementCsv(
        String(body.csvContent || ""),
        state.transactions
      );
      if (candidates.length === 0) {
        return NextResponse.json(
          {
            error:
              "No valid transaction rows found in CSV. Ensure headers include Date, Merchant/Description, and Amount.",
          },
          { status: 400 }
        );
      }
    } else {
      // receipt_camera or receipt_upload
      candidates = [
        extractReceiptData({
          fileName: String(body.fileName || "uae_receipt.jpg"),
          ocrTextHint: String(body.ocrTextHint || ""),
          existingTransactions: state.transactions,
        }),
      ];
    }

    const allFlagged = Array.from(
      new Set(candidates.flatMap((c) => c.flagged_fields))
    );

    const job: ExtractionJob = {
      id: `job_${crypto.randomBytes(6).toString("hex")}`,
      user_id: session.userId,
      receipt_id: createdReceipt?.id ?? null,
      source_type: sourceType,
      status: "needs_review",
      raw_input_preview: String(
        body.fileName || body.rawText || body.ocrTextHint || sourceType
      ).slice(0, 140),
      candidates,
      flagged_fields: allFlagged,
      error_message: null,
      retry_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
    };

    saveUserState(session.userId, (curr) => ({
      ...curr,
      receipts: createdReceipt
        ? [createdReceipt, ...curr.receipts]
        : curr.receipts,
      extraction_jobs: [job, ...curr.extraction_jobs],
    }));

    return NextResponse.json({
      job,
      receipt: createdReceipt,
      rateLimitRemaining: rateLimit.remaining,
    });
  } catch {
    return NextResponse.json(
      { error: "Extraction processing failed. Please try again." },
      { status: 500 }
    );
  }
}
