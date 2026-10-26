"use client";

import React, { useState } from "react";
import {
  Camera,
  MessageSquareText,
  Images,
  PenTool,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Check,
  ArrowRight,
  Upload,
} from "lucide-react";
import { useFinance } from "@/context/finance-context";
import { getDubaiToday, toDubaiTimeString } from "@/lib/dubai-time";
import { formatCurrency } from "@/lib/money";
import {
  ExtractedTransactionCandidate,
  ExtractionJob,
  PaymentMethod,
  TransactionStatus,
  TransactionType,
} from "@/lib/types";

type AddTab = "receipt" | "sms" | "screenshot" | "manual" | "csv";

const SAMPLE_SMS_MESSAGES = [
  {
    label: "Debit Card Spend (Carrefour)",
    text: "Your debit card ending 1234 was used for AED 85.50 at Carrefour on 25 Oct 2026 at 18:32.",
  },
  {
    label: "Credit Card Spend (ADNOC Fuel)",
    text: "Emirates NBD Alert: Credit Card ending 4821 used for AED 165.00 at ADNOC Service Station Dubai on 26 Oct 2026 at 09:15. Ref: ENBD994012.",
  },
  {
    label: "Refund / Reversal Notification",
    text: "Refund of AED 95.00 from Amazon.ae has been credited to your card ending 4821 on 26 Oct 2026 at 11:05. Ref: AMZREF4421.",
  },
  {
    label: "Declined Card Alert",
    text: "Transaction of AED 450.00 at Noon.com on your card ending 7390 on 26 Oct 2026 at 14:10 was declined due to daily limit.",
  },
  {
    label: "Credit Card Bill Payment",
    text: "Thank you for your payment of AED 1,500.00 towards your credit card ending 4821 on 26 Oct 2026. Ref: CCPAY8812.",
  },
];

export function AddExpenseView() {
  const { state, mutateFinance, setActiveSection, theme } = useFinance();

  const [activeTab, setActiveTab] = useState<AddTab>("receipt");

  // Extraction & Review workflow state
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ExtractionJob | null>(null);
  const [reviewCandidates, setReviewCandidates] = useState<
    ExtractedTransactionCandidate[]
  >([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(
    null
  );
  const [uploadedReceiptId, setUploadedReceiptId] = useState<string | null>(
    null
  );
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(
    null
  );

  // Inputs for Receipt OCR, SMS text, Screenshot, and CSV
  const [receiptFileName, setReceiptFileName] = useState(
    "carrefour_uae_receipt.jpg"
  );
  const [receiptOcrHint, setReceiptOcrHint] = useState(
    "CARREFOUR HYPERMARKET DUBAI\nTRN: 100238491200003\nDate: 26 Oct 2026 14:25\n2x Fresh Milk 2L 23.00\n1x Arabic Bread & Olives 39.50\nVAT 5%: AED 2.98\nGrand Total: AED 62.50\nCard ending 4821"
  );

  const [smsText, setSmsText] = useState(SAMPLE_SMS_MESSAGES[0].text);

  const [screenshotHint, setScreenshotHint] = useState(
    "Your credit card ending 4821 was used for AED 164.50 at Spinneys Dubai Hills on 26 Oct 2026 at 19:15. Ref: ENBD882104\nYour credit card ending 4821 was used for AED 58.00 at Talabat UAE on 26 Oct 2026 at 13:40. Ref: ENBD882051\nYour debit card ending 9104 was used for AED 32.00 at RTA Salik Auto Topup on 26 Oct 2026 at 09:12. Ref: ADCB774190"
  );

  const [csvContent, setCsvContent] = useState(
    "Date,Merchant,Amount,Currency,Type,Reference\n2026-10-24,Waitrose Dubai Mall,194.25,AED,Expense,WTR-9012\n2026-10-25,CAFU Fuel Delivery,118.00,AED,Expense,CAFU-7741"
  );

  // Manual Entry Form State
  const [manualType, setManualType] = useState<TransactionType>("expense");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCurrency, setManualCurrency] = useState("AED");
  const [manualVat, setManualVat] = useState("");
  const [manualMerchant, setManualMerchant] = useState("");
  const manualLocation = "Dubai, UAE";
  const [manualCategory, setManualCategory] = useState("Groceries");
  const [manualDate, setManualDate] = useState(() => getDubaiToday());
  const [manualTime, setManualTime] = useState(() => toDubaiTimeString());
  const [manualPaymentMethod, setManualPaymentMethod] =
    useState<PaymentMethod>("credit_card");
  const [manualCardId, setManualCardId] = useState<string>("");
  const manualAccountId = "";
  const [manualTargetCardId, setManualTargetCardId] = useState<string>("");
  const [manualStatus, setManualStatus] =
    useState<TransactionStatus>("confirmed");
  const [manualRef, setManualRef] = useState("");
  const [manualTags, setManualTags] = useState("uae, personal");
  const [manualNotes, setManualNotes] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  if (!state) return null;

  const handleFileSelection = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: "receipt_upload" | "receipt_camera" | "screenshot_ocr"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFileName(file.name);
    setExtractError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      setUploadedPreviewUrl(dataUrl);
      await triggerExtraction({
        sourceType: mode,
        fileName: file.name,
        mimeType: file.type,
        fileDataUrl: dataUrl,
        ocrTextHint:
          mode === "screenshot_ocr" ? screenshotHint : receiptOcrHint,
      });
    };
    reader.readAsDataURL(file);
  };

  const triggerExtraction = async (payload: Record<string, unknown>) => {
    setExtracting(true);
    setExtractError(null);
    setSaveSuccessMessage(null);
    setAllowDuplicateOverride(false);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.error || "Extraction failed");
        setExtracting(false);
        return;
      }

      const job = data.job as ExtractionJob;
      setActiveJob(job);
      if (data.receipt?.id) {
        setUploadedReceiptId(data.receipt.id);
      }
      setReviewCandidates(job.candidates || []);
      setSelectedCandidateIds(
        (job.candidates || [])
          .filter((c) => !c.duplicate_of_id)
          .map((c) => c.id)
      );
    } catch {
      setExtractError("Network error while running extraction.");
    } finally {
      setExtracting(false);
    }
  };

  const handleRetryFailedJob = async (jobId: string) => {
    await triggerExtraction({ action: "retry_job", jobId });
  };

  const updateCandidateField = (
    id: string,
    field: keyof ExtractedTransactionCandidate,
    value: unknown
  ) => {
    setReviewCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          [field]: value,
          flagged_fields: c.flagged_fields.filter((f) => f !== field),
        };
      })
    );
  };

  const handleConfirmAndSaveExtracted = async () => {
    const toSave = reviewCandidates.filter((c) =>
      selectedCandidateIds.includes(c.id)
    );
    if (toSave.length === 0) {
      setExtractError("Select at least one extracted transaction to confirm.");
      return;
    }

    setExtractError(null);
    const entrySource =
      activeJob?.source_type === "sms_text"
        ? "sms_parse"
        : activeJob?.source_type === "screenshot_ocr"
        ? "screenshot_ocr"
        : activeJob?.source_type === "csv_statement"
        ? "csv_import"
        : "receipt_ocr";

    const transactionsPayload = toSave.map((c) => {
      // Match card by last 4 digits if available
      const matchedCard = c.card_last_four
        ? state.cards.find((card) => card.last_four === c.card_last_four)
        : state.cards[0];

      return {
        transaction_type: c.transaction_type,
        status: c.status,
        verification_status: "verified",
        entry_source: entrySource,
        amount: Number(c.amount),
        currency: c.currency || "AED",
        vat_amount: c.vat_amount ?? 0,
        merchant: c.merchant,
        merchant_location: c.merchant_location,
        category_name: c.category_name,
        transaction_date: c.transaction_date,
        transaction_time: c.transaction_time,
        payment_method: c.payment_method,
        card_id: matchedCard?.id ?? null,
        account_id: state.accounts[0]?.id ?? null,
        reference_number: c.reference_number,
        receipt_id: uploadedReceiptId,
        extraction_job_id: activeJob?.id ?? null,
        line_items: c.line_items || [],
        notes: c.notes,
      };
    });

    const result = await mutateFinance("batch_create_transactions", {
      transactions: transactionsPayload,
      extractionJobId: activeJob?.id,
      allowDuplicate: allowDuplicateOverride,
    });

    if (!result.ok) {
      setExtractError(result.error || "Could not save transactions");
      if (result.isDuplicateWarning) {
        setAllowDuplicateOverride(true);
      }
      return;
    }

    setSaveSuccessMessage(
      `Confirmed and saved ${toSave.length} verified transaction(s) to your ledger.`
    );
    setReviewCandidates([]);
    setActiveJob(null);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    setSaveSuccessMessage(null);

    const payload = {
      transaction_type: manualType,
      status: manualStatus,
      verification_status: "verified",
      entry_source: "manual",
      amount: Number(manualAmount),
      currency: manualCurrency,
      vat_amount: manualVat ? Number(manualVat) : 0,
      merchant: manualMerchant,
      merchant_location: manualLocation,
      category_name:
        manualType === "income"
          ? "Salary & Income"
          : manualType === "cc_repayment"
          ? "Credit Card Repayment"
          : manualCategory,
      transaction_date: manualDate,
      transaction_time: manualTime,
      payment_method: manualPaymentMethod,
      card_id: manualCardId || null,
      account_id: manualAccountId || state.accounts[0]?.id || null,
      target_card_id:
        manualType === "cc_repayment"
          ? manualTargetCardId || state.cards[0]?.id || null
          : null,
      reference_number: manualRef || null,
      tags: manualTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: manualNotes || null,
    };

    const res = await mutateFinance("create_transaction", {
      transaction: payload,
      allowDuplicate: allowDuplicateOverride,
    });

    if (!res.ok) {
      setManualError(res.error || "Validation error");
      if (res.isDuplicateWarning) {
        setAllowDuplicateOverride(true);
      }
      return;
    }

    setSaveSuccessMessage(
      `Saved ${manualMerchant} (${manualCurrency} ${Number(
        manualAmount
      ).toFixed(2)}) to ledger.`
    );
    setManualAmount("");
    setManualMerchant("");
    setManualRef("");
    setManualNotes("");
  };

  const cardClass =
    theme === "dark"
      ? "bg-slate-900/90 border-slate-800 text-slate-100"
      : "bg-white border-slate-200 text-slate-900 shadow-sm";

  return (
    <div className="space-y-6">
      {/* Workflow Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            Record Expense &amp; Intelligent Extraction Hub
          </h2>
          <p className="text-xs text-slate-400">
            Workflow: Upload/Paste → Extract → Validate → Review → Edit →
            Confirm → Save
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-teal-400 bg-teal-500/10 border border-teal-500/30 px-3 py-1.5 rounded-xl">
          <ShieldCheck className="h-4 w-4" />
          <span>Explicit Confirmation Required — Zero Silent Writes</span>
        </div>
      </div>

      {/* Mode Selection Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          {
            id: "receipt" as AddTab,
            label: "Receipt Camera / Photo",
            icon: Camera,
          },
          {
            id: "sms" as AddTab,
            label: "Bank SMS / WhatsApp",
            icon: MessageSquareText,
          },
          {
            id: "screenshot" as AddTab,
            label: "App Screenshot (Multi)",
            icon: Images,
          },
          {
            id: "manual" as AddTab,
            label: "Fast Manual Entry",
            icon: PenTool,
          },
          {
            id: "csv" as AddTab,
            label: "CSV Statement Import",
            icon: FileSpreadsheet,
          },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`add-tab-${t.id}`}
              onClick={() => {
                setActiveTab(t.id);
                setExtractError(null);
                setSaveSuccessMessage(null);
              }}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                active
                  ? "bg-teal-600 border-teal-500 text-white shadow"
                  : theme === "dark"
                  ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      {saveSuccessMessage && (
        <div
          data-testid="save-confirmation-banner"
          className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-600/60 text-emerald-200 text-xs flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{saveSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveSection("transactions")}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer"
          >
            View in Ledger
          </button>
        </div>
      )}

      {extractError && (
        <div
          role="alert"
          data-testid="extraction-error-banner"
          className="p-4 rounded-2xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{extractError}</span>
          </div>
          {allowDuplicateOverride && (
            <button
              type="button"
              data-testid="confirm-duplicate-override-btn"
              onClick={handleConfirmAndSaveExtracted}
              className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold cursor-pointer"
            >
              Confirm Save Duplicate Anyway
            </button>
          )}
        </div>
      )}

      {/* TAB 1: RECEIPT SCANNING (CAMERA & GALLERY UPLOAD) */}
      {activeTab === "receipt" && (
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">
                UAE Receipt Camera Capture &amp; Gallery Upload
              </h3>
              <p className="text-xs text-slate-400">
                Extracts merchant, AED total, 5% UAE VAT, TRN/receipt number,
                card ending, and line items.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer">
                <Camera className="h-3.5 w-3.5" />
                <span>Take Camera Photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => handleFileSelection(e, "receipt_camera")}
                  className="hidden"
                />
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Receipt Image / PDF</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => handleFileSelection(e, "receipt_upload")}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-400">
              Receipt OCR Text / UAE Thermal Receipt Content (Editable or
              auto-populated from photo)
            </label>
            <textarea
              rows={4}
              data-testid="receipt-ocr-textarea"
              value={receiptOcrHint}
              onChange={(e) => setReceiptOcrHint(e.target.value)}
              className="w-full rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs font-mono"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="extract-receipt-btn"
              disabled={extracting}
              onClick={() =>
                triggerExtraction({
                  sourceType: "receipt_camera",
                  fileName: receiptFileName,
                  ocrTextHint: receiptOcrHint,
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>
                {extracting
                  ? "Running Receipt OCR..."
                  : "Extract Receipt Fields for Review"}
              </span>
            </button>

            <button
              type="button"
              data-testid="simulate-failed-ocr-btn"
              onClick={() =>
                triggerExtraction({
                  sourceType: "receipt_upload",
                  fileName: "blurry_thermal_receipt.jpg",
                  simulateFailure: true,
                })
              }
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
            >
              Simulate Blurry Receipt Failure (Test Retry)
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: BANK SMS / WHATSAPP NOTIFICATION PARSER */}
      {activeTab === "sms" && (
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <div>
            <h3 className="text-sm font-bold">
              Bank SMS, WhatsApp &amp; Card Notification Parser
            </h3>
            <p className="text-xs text-slate-400">
              Paste alerts from Emirates NBD, ADCB, FAB, Wio, Mashreq, or Liv.
              Untrusted message text is sanitized; instructions inside messages
              are never executed.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_SMS_MESSAGES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setSmsText(sample.text)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
              >
                {sample.label}
              </button>
            ))}
          </div>

          <textarea
            rows={4}
            data-testid="sms-input-textarea"
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            placeholder="Paste bank SMS or WhatsApp transaction message here..."
            className="w-full rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs font-mono"
          />

          <button
            type="button"
            data-testid="parse-sms-btn"
            disabled={extracting}
            onClick={() =>
              triggerExtraction({
                sourceType: "sms_text",
                rawText: smsText,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Parse Notification &amp; Review</span>
          </button>
        </div>
      )}

      {/* TAB 3: SCREENSHOT MULTI-ROW IMPORT */}
      {activeTab === "screenshot" && (
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">
                Screenshot Multi-Transaction Extractor
              </h3>
              <p className="text-xs text-slate-400">
                Upload screenshots from banking apps, credit card statements, or
                SMS history to extract multiple rows and check for duplicates.
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Screenshot Image</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileSelection(e, "screenshot_ocr")}
                className="hidden"
              />
            </label>
          </div>

          <textarea
            rows={4}
            data-testid="screenshot-ocr-textarea"
            value={screenshotHint}
            onChange={(e) => setScreenshotHint(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs font-mono"
          />

          <button
            type="button"
            data-testid="extract-screenshot-btn"
            disabled={extracting}
            onClick={() =>
              triggerExtraction({
                sourceType: "screenshot_ocr",
                fileName: "bank_app_history_screenshot.png",
                ocrTextHint: screenshotHint,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Extract Multiple Transactions from Screenshot</span>
          </button>
        </div>
      )}

      {/* TAB 5: CSV STATEMENT IMPORT */}
      {activeTab === "csv" && (
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4`}>
          <div>
            <h3 className="text-sm font-bold">
              CSV Bank / Credit Card Statement Import
            </h3>
            <p className="text-xs text-slate-400">
              Paste or upload CSV statement rows to inspect duplicates and
              confirm before importing.
            </p>
          </div>
          <textarea
            rows={5}
            data-testid="csv-input-textarea"
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs font-mono"
          />
          <button
            type="button"
            data-testid="parse-csv-btn"
            disabled={extracting}
            onClick={() =>
              triggerExtraction({
                sourceType: "csv_statement",
                csvContent,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Parse CSV Rows into Review Table</span>
          </button>
        </div>
      )}

      {/* FAILED JOB RETRY BANNER */}
      {activeJob && activeJob.status === "failed" && (
        <div
          data-testid="failed-extraction-job-card"
          className="p-5 rounded-2xl bg-rose-950/40 border border-rose-700/60 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-rose-300">
              <AlertTriangle className="h-4 w-4" />
              <span>Extraction Job Failed ({activeJob.id})</span>
            </div>
            <button
              type="button"
              data-testid="retry-extraction-job-btn"
              onClick={() => handleRetryFailedJob(activeJob.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-500 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry Extraction</span>
            </button>
          </div>
          <p className="text-rose-200">{activeJob.error_message}</p>
        </div>
      )}

      {/* EXTRACTED REVIEW & CONFIRMATION WORKBENCH */}
      {reviewCandidates.length > 0 && (
        <div
          data-testid="extraction-review-workbench"
          className={`p-5 rounded-2xl border-2 border-teal-500/50 ${cardClass} space-y-5`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-500/20 text-teal-300">
                Review &amp; Edit Before Saving
              </span>
              <h3 className="text-base font-bold mt-1">
                {reviewCandidates.length} Extracted Transaction Candidate(s)
              </h3>
              <p className="text-xs text-slate-400">
                Inspect confidence indicators, resolve any flagged fields, and
                confirm to save to the database.
              </p>
            </div>

            <button
              type="button"
              data-testid="confirm-extracted-save-btn"
              onClick={handleConfirmAndSaveExtracted}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>
                Confirm &amp; Save ({selectedCandidateIds.length}) Verified
                Transaction(s)
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Side-by-side original uploaded receipt/screenshot preview when available */}
            {uploadedPreviewUrl && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  Original Uploaded Image
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedPreviewUrl}
                  alt="Uploaded receipt preview"
                  className="max-h-72 mx-auto object-contain rounded"
                />
              </div>
            )}

            <div
              className={
                uploadedPreviewUrl
                  ? "lg:col-span-2 space-y-4"
                  : "lg:col-span-3 space-y-4"
              }
            >
              {reviewCandidates.map((cand, idx) => {
                const isSelected = selectedCandidateIds.includes(cand.id);
                return (
                  <div
                    key={cand.id}
                    data-testid={`review-candidate-${idx}`}
                    className={`p-4 rounded-xl border space-y-3 ${
                      cand.duplicate_of_id
                        ? "border-amber-500/60 bg-amber-950/20"
                        : "border-slate-800 bg-slate-950/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            setSelectedCandidateIds((prev) =>
                              prev.includes(cand.id)
                                ? prev.filter((id) => id !== cand.id)
                                : [...prev, cand.id]
                            )
                          }
                        />
                        <span>
                          Row #{idx + 1}: {cand.merchant}
                        </span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            cand.confidence.overall >= 0.85
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          OCR Confidence:{" "}
                          {Math.round(cand.confidence.overall * 100)}%
                        </span>
                        {cand.duplicate_of_id && (
                          <span
                            data-testid="duplicate-warning-badge"
                            className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 font-bold"
                          >
                            Potential Duplicate Detected
                          </span>
                        )}
                        {cand.flagged_fields.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-200 font-semibold">
                            Flagged for manual review:{" "}
                            {cand.flagged_fields.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Merchant / Payee
                        </label>
                        <input
                          type="text"
                          data-testid={`candidate-merchant-${idx}`}
                          value={cand.merchant}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "merchant",
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Amount ({cand.currency})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          data-testid={`candidate-amount-${idx}`}
                          value={cand.amount}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "amount",
                              Number(e.target.value)
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          UAE VAT (5%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={cand.vat_amount ?? 0}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "vat_amount",
                              Number(e.target.value)
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Date (Asia/Dubai)
                        </label>
                        <input
                          type="date"
                          value={cand.transaction_date}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "transaction_date",
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Transaction Type
                        </label>
                        <select
                          value={cand.transaction_type}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "transaction_type",
                              e.target.value as TransactionType
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="refund">Refund / Reversal</option>
                          <option value="cc_repayment">
                            Credit Card Repayment
                          </option>
                          <option value="transfer">Transfer</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Category
                        </label>
                        <select
                          value={cand.category_name}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "category_name",
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        >
                          {state.categories.map((cat) => (
                            <option key={cat.id} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Card Ending (Last 4)
                        </label>
                        <input
                          type="text"
                          maxLength={4}
                          value={cand.card_last_four || ""}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "card_last_four",
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Receipt / Ref #
                        </label>
                        <input
                          type="text"
                          value={cand.reference_number || ""}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "reference_number",
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Status
                        </label>
                        <select
                          value={cand.status}
                          onChange={(e) =>
                            updateCandidateField(
                              cand.id,
                              "status",
                              e.target.value as TransactionStatus
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700"
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="pending">Pending</option>
                          <option value="declined">
                            Declined (Excluded from spend)
                          </option>
                          <option value="reversed">Reversed</option>
                        </select>
                      </div>
                    </div>

                    {cand.line_items.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                        <strong className="text-slate-300">
                          Extracted Line Items:
                        </strong>{" "}
                        {cand.line_items
                          .map(
                            (li) =>
                              `${li.quantity}x ${
                                li.description
                              } (${formatCurrency(li.total)})`
                          )
                          .join(" • ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FAST MANUAL ENTRY FORM */}
      {activeTab === "manual" && (
        <form
          onSubmit={handleManualSubmit}
          data-testid="manual-expense-form"
          className={`p-5 rounded-2xl border ${cardClass} space-y-4`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">Fast Manual Transaction Form</h3>
              <p className="text-xs text-slate-400">
                Supports expenses, salary/income, transfers, refunds, and credit
                card repayments. Works offline with automatic sync queueing.
              </p>
            </div>
          </div>

          {manualError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs flex items-center justify-between"
            >
              <span>{manualError}</span>
              {allowDuplicateOverride && (
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold cursor-pointer"
                >
                  Save Duplicate Anyway
                </button>
              )}
            </div>
          )}

          {/* Transaction Type Pill Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {(
              [
                { id: "expense", label: "Expense" },
                { id: "income", label: "Income / Salary" },
                { id: "cc_repayment", label: "Card Repayment" },
                { id: "refund", label: "Refund / Reversal" },
                { id: "transfer", label: "Account Transfer" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`manual-type-${t.id}`}
                onClick={() => setManualType(t.id)}
                className={`py-2 px-3 rounded-xl font-semibold border transition cursor-pointer ${
                  manualType === t.id
                    ? "bg-teal-600 border-teal-500 text-white"
                    : "bg-slate-950/50 border-slate-800 text-slate-400"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Amount *</label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="manual-amount-input"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="e.g. 125.50"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Currency</label>
              <select
                value={manualCurrency}
                onChange={(e) => setManualCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="AED">AED (UAE Dirham)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
                <option value="SAR">SAR (Saudi Riyal)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Merchant / Payee *
              </label>
              <input
                type="text"
                required
                data-testid="manual-merchant-input"
                value={manualMerchant}
                onChange={(e) => setManualMerchant(e.target.value)}
                placeholder="e.g. Spinneys Dubai Marina"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Category</label>
              <select
                data-testid="manual-category-select"
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                {state.categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Transaction Date (Asia/Dubai)
              </label>
              <input
                type="date"
                required
                data-testid="manual-date-input"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Time (Optional)
              </label>
              <input
                type="time"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Payment Type</label>
              <select
                value={manualPaymentMethod}
                onChange={(e) =>
                  setManualPaymentMethod(e.target.value as PaymentMethod)
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
                <option value="apple_pay">Apple Pay</option>
                <option value="samsung_pay">Samsung Pay</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Selected Card / Account
              </label>
              <select
                value={manualCardId}
                onChange={(e) => setManualCardId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="">Default Account / None</option>
                {state.cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} (••{c.last_four})
                  </option>
                ))}
              </select>
            </div>

            {manualType === "cc_repayment" && (
              <div>
                <label className="block text-teal-400 mb-1">
                  Target Credit Card Being Repaid
                </label>
                <select
                  value={manualTargetCardId}
                  onChange={(e) => setManualTargetCardId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-teal-500"
                >
                  {state.cards
                    .filter((c) => c.card_type === "credit")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name} (••{c.last_four})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-slate-400 mb-1">
                UAE VAT Amount (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={manualVat}
                onChange={(e) => setManualVat(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Reference / Receipt #
              </label>
              <input
                type="text"
                value={manualRef}
                onChange={(e) => setManualRef(e.target.value)}
                placeholder="Optional ref"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Tags (comma separated)
              </label>
              <input
                type="text"
                value={manualTags}
                onChange={(e) => setManualTags(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Status</label>
              <select
                value={manualStatus}
                onChange={(e) =>
                  setManualStatus(e.target.value as TransactionStatus)
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
              >
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="text-xs">
            <label className="block text-slate-400 mb-1">Notes</label>
            <input
              type="text"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Optional transaction notes..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              data-testid="manual-submit-btn"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow cursor-pointer"
            >
              <span>Save Verified Transaction</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
