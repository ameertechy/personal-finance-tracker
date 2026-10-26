"use client";

import React, { useState } from "react";
import {
  Camera,
  MessageSquareText,
  Images,
  PenTool,
  FileSpreadsheet,
  RefreshCw,
  Check,
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
    label: "Debit card spend (Carrefour)",
    text: "Your debit card ending 1234 was used for AED 85.50 at Carrefour on 25 Oct 2026 at 18:32.",
  },
  {
    label: "Credit card spend (ADNOC)",
    text: "Emirates NBD Alert: Credit Card ending 4821 used for AED 165.00 at ADNOC Service Station Dubai on 26 Oct 2026 at 09:15. Ref: ENBD994012.",
  },
  {
    label: "Refund notification",
    text: "Refund of AED 95.00 from Amazon.ae has been credited to your card ending 4821 on 26 Oct 2026 at 11:05. Ref: AMZREF4421.",
  },
  {
    label: "Declined card alert",
    text: "Transaction of AED 450.00 at Noon.com on your card ending 7390 on 26 Oct 2026 at 14:10 was declined due to daily limit.",
  },
  {
    label: "Credit card bill payment",
    text: "Thank you for your payment of AED 1,500.00 towards your credit card ending 4821 on 26 Oct 2026. Ref: CCPAY8812.",
  },
];

export function AddExpenseView() {
  const { state, mutateFinance, setActiveSection } = useFinance();

  const [activeTab, setActiveTab] = useState<AddTab>("receipt");

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ExtractionJob | null>(null);
  const [reviewCandidates, setReviewCandidates] = useState<
    ExtractedTransactionCandidate[]
  >([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(
    []
  );
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

  return (
    <div className="space-y-4">
      <div className="title-row">
        <div>
          <h1>Record Expense &amp; Extraction Workbench</h1>
          <p className="sub">
            Upload or paste → Extract → Validate → Review → Edit → Confirm →
            Save
          </p>
        </div>
        <span className="pill pos">Explicit confirmation required</span>
      </div>

      {/* Segmented Mode Selector */}
      <div className="segmented">
        {[
          { id: "receipt" as AddTab, label: "Receipt photo / OCR", icon: Camera },
          {
            id: "sms" as AddTab,
            label: "Bank SMS / WhatsApp",
            icon: MessageSquareText,
          },
          {
            id: "screenshot" as AddTab,
            label: "Screenshot (multi-row)",
            icon: Images,
          },
          { id: "manual" as AddTab, label: "Manual entry", icon: PenTool },
          {
            id: "csv" as AddTab,
            label: "CSV statement",
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
              aria-pressed={active}
              onClick={() => {
                setActiveTab(t.id);
                setExtractError(null);
                setSaveSuccessMessage(null);
              }}
              className="inline-flex items-center gap-1.5"
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {saveSuccessMessage && (
        <div
          data-testid="save-confirmation-banner"
          className="p-3.5 rounded-[6px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] flex flex-wrap items-center justify-between gap-3 text-[13px]"
        >
          <span>{saveSuccessMessage}</span>
          <button
            type="button"
            onClick={() => setActiveSection("transactions")}
            className="btn primary h-8 px-3 text-[12px]"
          >
            View in ledger
          </button>
        </div>
      )}

      {extractError && (
        <div
          role="alert"
          data-testid="extraction-error-banner"
          className="p-3.5 rounded-[6px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] flex items-center justify-between gap-3 text-[13px]"
        >
          <span>{extractError}</span>
          {allowDuplicateOverride && (
            <button
              type="button"
              data-testid="confirm-duplicate-override-btn"
              onClick={handleConfirmAndSaveExtracted}
              className="btn primary h-8 px-3 text-[12px]"
            >
              Confirm save duplicate anyway
            </button>
          )}
        </div>
      )}

      {/* TAB 1: RECEIPT SCANNING */}
      {activeTab === "receipt" && (
        <div className="panel space-y-4">
          <div className="panel-header">
            <div>
              <h2>UAE receipt camera capture &amp; gallery upload</h2>
              <p className="panel-meta">
                Extracts merchant, AED total, 5% UAE VAT, TRN/receipt number,
                card ending, and line items
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="btn primary cursor-pointer">
                <Camera className="h-3.5 w-3.5" />
                <span>Take camera photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => handleFileSelection(e, "receipt_camera")}
                  className="hidden"
                />
              </label>
              <label className="btn cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload image / PDF</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => handleFileSelection(e, "receipt_upload")}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium">
              Receipt OCR content (editable or populated from image)
            </label>
            <textarea
              rows={4}
              data-testid="receipt-ocr-textarea"
              value={receiptOcrHint}
              onChange={(e) => setReceiptOcrHint(e.target.value)}
              className="input-control"
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
              className="btn primary"
            >
              {extracting
                ? "Running receipt OCR..."
                : "Extract receipt fields for review"}
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
              className="btn"
            >
              Simulate blurry receipt failure (test retry)
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: BANK SMS / WHATSAPP */}
      {activeTab === "sms" && (
        <div className="panel space-y-4">
          <div>
            <h2 className="text-[16px] font-semibold">
              Bank SMS, WhatsApp &amp; card notification parser
            </h2>
            <p className="panel-meta">
              Paste alerts from Emirates NBD, ADCB, FAB, Wio, Mashreq, or Liv.
              Untrusted message text is sanitized.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_SMS_MESSAGES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setSmsText(sample.text)}
                className="btn h-7 px-2.5 text-[12px]"
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
            className="input-control"
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
            className="btn primary"
          >
            Parse notification &amp; review
          </button>
        </div>
      )}

      {/* TAB 3: SCREENSHOT MULTI-ROW */}
      {activeTab === "screenshot" && (
        <div className="panel space-y-4">
          <div className="panel-header">
            <div>
              <h2>Screenshot multi-transaction extractor</h2>
              <p className="panel-meta">
                Upload screenshots from banking apps, card statements, or SMS
                history to extract multiple rows and check for duplicates
              </p>
            </div>
            <label className="btn primary cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              <span>Upload screenshot image</span>
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
            className="input-control"
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
            className="btn primary"
          >
            Extract multiple transactions from screenshot
          </button>
        </div>
      )}

      {/* TAB 5: CSV STATEMENT */}
      {activeTab === "csv" && (
        <div className="panel space-y-4">
          <div>
            <h2 className="text-[16px] font-semibold">
              CSV bank or credit card statement import
            </h2>
            <p className="panel-meta">
              Paste or upload CSV statement rows to inspect duplicates and
              confirm before importing
            </p>
          </div>
          <textarea
            rows={5}
            data-testid="csv-input-textarea"
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            className="input-control"
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
            className="btn primary"
          >
            Parse CSV rows into review table
          </button>
        </div>
      )}

      {/* FAILED JOB RETRY CARD */}
      {activeJob && activeJob.status === "failed" && (
        <div
          data-testid="failed-extraction-job-card"
          className="panel space-y-3 bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              Extraction job failed (<code>{activeJob.id}</code>)
            </span>
            <button
              type="button"
              data-testid="retry-extraction-job-btn"
              onClick={() => handleRetryFailedJob(activeJob.id)}
              className="btn primary h-8 px-3 text-[12px]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry extraction</span>
            </button>
          </div>
          <p className="text-[13px]">{activeJob.error_message}</p>
        </div>
      )}

      {/* EXTRACTED REVIEW WORKBENCH */}
      {reviewCandidates.length > 0 && (
        <div
          data-testid="extraction-review-workbench"
          className="panel space-y-4"
        >
          <div className="panel-header border-b border-[var(--border)] pb-3">
            <div>
              <h2>
                Review &amp; edit {reviewCandidates.length} extracted
                candidate(s)
              </h2>
              <p className="panel-meta">
                Verify confidence indicators, resolve any flagged fields, and
                confirm to save to the database
              </p>
            </div>

            <button
              type="button"
              data-testid="confirm-extracted-save-btn"
              onClick={handleConfirmAndSaveExtracted}
              className="btn primary"
            >
              <Check className="h-4 w-4" />
              <span>
                Confirm &amp; Save ({selectedCandidateIds.length}) Verified
                Transaction(s)
              </span>
            </button>
          </div>

          <div className="space-y-4">
            {uploadedPreviewUrl && (
              <div className="p-3 rounded bg-[var(--raised)] border border-[var(--border)]">
                <div className="text-[12px] font-medium mb-2">
                  Original uploaded image
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedPreviewUrl}
                  alt="Uploaded receipt preview"
                  className="max-h-60 object-contain"
                />
              </div>
            )}

            {reviewCandidates.map((cand, idx) => {
              const isSelected = selectedCandidateIds.includes(cand.id);
              return (
                <div
                  key={cand.id}
                  data-testid={`review-candidate-${idx}`}
                  className="p-4 rounded-[6px] bg-[var(--raised)] border border-[var(--border)] space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer">
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

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`pill ${
                          cand.confidence.overall >= 0.85 ? "pos" : "warn"
                        }`}
                      >
                        Confidence {Math.round(cand.confidence.overall * 100)}%
                      </span>
                      {cand.duplicate_of_id && (
                        <span
                          data-testid="duplicate-warning-badge"
                          className="pill warn"
                        >
                          Potential duplicate detected
                        </span>
                      )}
                      {cand.flagged_fields.length > 0 && (
                        <span className="pill neg">
                          Flagged: {cand.flagged_fields.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
                        Merchant / payee
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
                        className="input-control"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
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
                        className="input-control font-semibold num"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
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
                        className="input-control num"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
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
                        className="input-control"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
                        Transaction type
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
                        className="input-control"
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

                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
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
                        className="input-control"
                      >
                        {state.categories.map((cat) => (
                          <option key={cat.id} value={cat.name}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
                        Card ending (last 4)
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
                        className="input-control num"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
                        Receipt / ref #
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
                        className="input-control"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[12px] text-[var(--muted)]">
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
                        className="input-control"
                      >
                        <option value="confirmed">Confirmed</option>
                        <option value="pending">Pending</option>
                        <option value="declined">
                          Declined (excluded from spend)
                        </option>
                        <option value="reversed">Reversed</option>
                      </select>
                    </div>
                  </div>

                  {cand.line_items.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border)] text-[12px] text-[var(--muted)]">
                      <strong className="text-[var(--text)]">
                        Extracted line items:
                      </strong>{" "}
                      {cand.line_items
                        .map(
                          (li) =>
                            `${li.quantity}x ${
                              li.description
                            } (${formatCurrency(li.total)})`
                        )
                        .join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: FAST MANUAL ENTRY */}
      {activeTab === "manual" && (
        <form
          onSubmit={handleManualSubmit}
          data-testid="manual-expense-form"
          className="panel space-y-4"
        >
          <div>
            <h2 className="text-[16px] font-semibold">
              Fast manual transaction entry
            </h2>
            <p className="panel-meta">
              Supports expenses, salary/income, transfers, refunds, and credit
              card repayments
            </p>
          </div>

          {manualError && (
            <div
              role="alert"
              className="p-3 rounded-[6px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] flex items-center justify-between text-[13px]"
            >
              <span>{manualError}</span>
              {allowDuplicateOverride && (
                <button
                  type="submit"
                  className="btn primary h-8 px-3 text-[12px]"
                >
                  Save duplicate anyway
                </button>
              )}
            </div>
          )}

          <div className="segmented">
            {(
              [
                { id: "expense", label: "Expense" },
                { id: "income", label: "Income / Salary" },
                { id: "cc_repayment", label: "Card repayment" },
                { id: "refund", label: "Refund / Reversal" },
                { id: "transfer", label: "Account transfer" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`manual-type-${t.id}`}
                aria-pressed={manualType === t.id}
                onClick={() => setManualType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block text-[13px] font-medium">Amount *</label>
              <input
                type="number"
                step="0.01"
                required
                data-testid="manual-amount-input"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="125.50"
                className="input-control font-semibold num"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">Currency</label>
              <select
                value={manualCurrency}
                onChange={(e) => setManualCurrency(e.target.value)}
                className="input-control"
              >
                <option value="AED">AED (UAE Dirham)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
                <option value="SAR">SAR (Saudi Riyal)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Merchant / payee *
              </label>
              <input
                type="text"
                required
                data-testid="manual-merchant-input"
                value={manualMerchant}
                onChange={(e) => setManualMerchant(e.target.value)}
                placeholder="Spinneys Dubai Marina"
                className="input-control"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">Category</label>
              <select
                data-testid="manual-category-select"
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
                className="input-control"
              >
                {state.categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Transaction date (Asia/Dubai)
              </label>
              <input
                type="date"
                required
                data-testid="manual-date-input"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="input-control"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Time (optional)
              </label>
              <input
                type="time"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="input-control"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Payment type
              </label>
              <select
                value={manualPaymentMethod}
                onChange={(e) =>
                  setManualPaymentMethod(e.target.value as PaymentMethod)
                }
                className="input-control"
              >
                <option value="credit_card">Credit card</option>
                <option value="debit_card">Debit card</option>
                <option value="apple_pay">Apple Pay</option>
                <option value="samsung_pay">Samsung Pay</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Selected card / account
              </label>
              <select
                value={manualCardId}
                onChange={(e) => setManualCardId(e.target.value)}
                className="input-control"
              >
                <option value="">Default account / none</option>
                {state.cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} (••{c.last_four})
                  </option>
                ))}
              </select>
            </div>

            {manualType === "cc_repayment" && (
              <div className="space-y-1">
                <label className="block text-[13px] font-medium">
                  Target credit card being repaid
                </label>
                <select
                  value={manualTargetCardId}
                  onChange={(e) => setManualTargetCardId(e.target.value)}
                  className="input-control"
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

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                UAE VAT amount (optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={manualVat}
                onChange={(e) => setManualVat(e.target.value)}
                placeholder="0.00"
                className="input-control num"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Reference / receipt #
              </label>
              <input
                type="text"
                value={manualRef}
                onChange={(e) => setManualRef(e.target.value)}
                placeholder="Optional ref"
                className="input-control"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">
                Tags (comma separated)
              </label>
              <input
                type="text"
                value={manualTags}
                onChange={(e) => setManualTags(e.target.value)}
                className="input-control"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-medium">Status</label>
              <select
                value={manualStatus}
                onChange={(e) =>
                  setManualStatus(e.target.value as TransactionStatus)
                }
                className="input-control"
              >
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium">Notes</label>
            <input
              type="text"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Optional transaction notes..."
              className="input-control"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              data-testid="manual-submit-btn"
              className="btn primary"
            >
              Save verified transaction
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
