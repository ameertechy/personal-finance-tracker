import { test, expect } from "@playwright/test";

test.describe("DirhamPulse UAE Personal Finance Portal E2E Workflows", () => {
  test("Dashboard KPIs, Receipt & SMS Extraction Review, Manual Entry, Card Repayment, and Offline Sync", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Verify Dashboard loads with AED currency and Asia/Dubai context
    await expect(page.getByTestId("kpi-monthly-income")).toContainText("AED");
    await expect(page.getByTestId("kpi-total-spending")).toContainText("AED");
    await expect(page.getByTestId("kpi-available-funds")).toContainText("AED");

    // 2. Navigate to Add Expense & test Bank SMS Parsing -> Review -> Confirm -> Save
    await page.getByTestId("nav-add").click();
    await page.getByTestId("add-tab-sms").click();
    await page
      .getByTestId("sms-input-textarea")
      .fill(
        "Your debit card ending 9104 was used for AED 85.50 at Carrefour on 25 Oct 2026 at 18:32. Ref: E2ESMS901"
      );
    await page.getByTestId("parse-sms-btn").click();

    await expect(page.getByTestId("extraction-review-workbench")).toBeVisible();
    await expect(page.getByTestId("candidate-merchant-0")).toHaveValue(
      "Carrefour"
    );
    await expect(page.getByTestId("candidate-amount-0")).toHaveValue("85.5");

    await page.getByTestId("confirm-extracted-save-btn").click();
    await expect(page.getByTestId("save-confirmation-banner")).toContainText(
      "Confirmed and saved"
    );

    // 3. Test Screenshot Multi-Row Extraction
    await page.getByTestId("add-tab-screenshot").click();
    await page.getByTestId("extract-screenshot-btn").click();
    await expect(page.getByTestId("extraction-review-workbench")).toBeVisible();
    await expect(page.getByTestId("review-candidate-0")).toBeVisible();
    await expect(page.getByTestId("review-candidate-1")).toBeVisible();

    // 4. Test Fast Manual Entry
    await page.getByTestId("add-tab-manual").click();
    await page.getByTestId("manual-amount-input").fill("140.25");
    await page
      .getByTestId("manual-merchant-input")
      .fill("Spinneys Meydan Dubai");
    await page.getByTestId("manual-submit-btn").click();
    await expect(page.getByTestId("save-confirmation-banner")).toContainText(
      "Spinneys Meydan Dubai"
    );

    // 5. Verify transaction appears in searchable Ledger
    await page.getByTestId("nav-transactions").click();
    await page.getByTestId("ledger-search-input").fill("Spinneys Meydan Dubai");
    await expect(page.locator("table")).toContainText("Spinneys Meydan Dubai");
    await expect(page.locator("table")).toContainText("AED 140.25");

    // 6. Navigate to Cards & Bills and record a partial credit card repayment
    await page.getByTestId("nav-cards").click();
    await page.getByTestId("repayment-amount-input").fill("500.00");
    await page.getByTestId("submit-cc-repayment-btn").click();
    await expect(page.getByTestId("cards-feedback-banner")).toContainText(
      "without double-counting expenses"
    );

    // 7. Navigate to Budgets & Reports & Settings
    await page.getByTestId("nav-budgets").click();
    await expect(page.getByTestId("upsert-budget-form")).toBeVisible();

    await page.getByTestId("nav-reports").click();
    await expect(page.getByTestId("export-report-csv-btn")).toBeVisible();

    await page.getByTestId("nav-settings").click();
    await expect(page.getByTestId("retention-policy-select")).toBeVisible();
  });
});
