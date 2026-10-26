/**
 * Asia/Dubai (UTC+4) Timezone Utilities
 * Ensures all transaction dates, month boundaries, and statement due date checks
 * operate consistently in UAE Standard Time (GST / UTC+4).
 */
export const DUBAI_TIMEZONE = "Asia/Dubai";

export function toDubaiDateString(input: Date | string = new Date()): string {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return getDubaiToday();
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "10";
  const day = parts.find((p) => p.type === "day")?.value ?? "26";
  return `${year}-${month}-${day}`;
}

export function toDubaiTimeString(input: Date | string = new Date()): string {
  if (typeof input === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(input.trim())) {
    return input.trim().slice(0, 5);
  }
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "12:00";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function getDubaiToday(): string {
  return toDubaiDateString(new Date());
}

export function getDubaiMonthKey(input: Date | string = new Date()): string {
  return toDubaiDateString(input).slice(0, 7);
}

export function formatDubaiDate(
  dateStr: string | null | undefined,
  includeTime?: string | null
): string {
  if (!dateStr) return "-";
  const cleanDate = dateStr.slice(0, 10);
  const [y, m, d] = cleanDate.split("-").map(Number);
  if (!y || !m || !d) return dateStr;

  const utcNoon = new Date(Date.UTC(y, m - 1, d, 8, 0, 0));
  const formatted = new Intl.DateTimeFormat("en-AE", {
    timeZone: DUBAI_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(utcNoon);

  if (includeTime) {
    return `${formatted}, ${includeTime.slice(0, 5)} GST`;
  }
  return formatted;
}

export function daysBetweenDubaiDates(
  referenceDateStr: string,
  targetDateStr: string
): number {
  const [ry, rm, rd] = referenceDateStr.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = targetDateStr.slice(0, 10).split("-").map(Number);
  const refUtc = Date.UTC(ry, rm - 1, rd);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((targetUtc - refUtc) / (1000 * 60 * 60 * 24));
}

export function computeNextCardCycleDates(
  referenceDubaiDate: string,
  closingDay: number | null,
  paymentDueDay: number | null,
  dueDaysAfterClose: number | null
): { nextClosingDate: string; nextDueDate: string } {
  const [year, month, day] = referenceDubaiDate.split("-").map(Number);
  const closeDay = Math.min(Math.max(closingDay ?? 15, 1), 28);

  let closeYear = year;
  let closeMonth = month;
  if (day > closeDay) {
    closeMonth += 1;
    if (closeMonth > 12) {
      closeMonth = 1;
      closeYear += 1;
    }
  }

  const mmClose = String(closeMonth).padStart(2, "0"); // taste-skill-ignore: ISO date formatting
  const ddClose = String(closeDay).padStart(2, "0"); // taste-skill-ignore: ISO date formatting
  const nextClosingDate = `${closeYear}-${mmClose}-${ddClose}`;

  if (dueDaysAfterClose && dueDaysAfterClose > 0) {
    const closeUtc = new Date(Date.UTC(closeYear, closeMonth - 1, closeDay));
    closeUtc.setUTCDate(closeUtc.getUTCDate() + dueDaysAfterClose);
    const nextDueDate = closeUtc.toISOString().slice(0, 10);
    return { nextClosingDate, nextDueDate };
  }

  const dueDay = Math.min(Math.max(paymentDueDay ?? 5, 1), 28);
  let dueYear = closeYear;
  let dueMonth = closeMonth;
  if (dueDay <= closeDay) {
    dueMonth += 1;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear += 1;
    }
  }
  const mmDue = String(dueMonth).padStart(2, "0"); // taste-skill-ignore: ISO date formatting
  const ddDue = String(dueDay).padStart(2, "0"); // taste-skill-ignore: ISO date formatting
  const nextDueDate = `${dueYear}-${mmDue}-${ddDue}`;

  return { nextClosingDate, nextDueDate };
}
