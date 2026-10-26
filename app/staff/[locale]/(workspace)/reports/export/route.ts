// O22: private totals only; the same server authorization runs freshly for every download.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { checkLocale } from "@/features/work/screens";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
import { readReports, reportFilter } from "@/server/reports/queries";

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const url = new URL(request.url);
  let filter: ReturnType<typeof reportFilter>;
  try {
    filter = reportFilter(Object.fromEntries(url.searchParams));
  } catch {
    notFound();
  }
  try {
    const report = await readReports(getDb(), session, filter);
    // No titles, recipients, contacts or arbitrary source values enter a spreadsheet cell.
    const rows = [
      ["definition", report.definition],
      ["scope", filter.scope],
      ["period_days", String(filter.days)],
      ["as_of", report.asOf.toISOString()],
      ["timezone", report.timezone],
      ["metric", "count_or_unknown"],
      ...report.metrics.map((m) => [m.id, m.count === null ? "unknown" : String(m.count)]),
      ["response_received", String(report.response?.received ?? "unknown")],
      ["response_recorded", String(report.response?.responded ?? "unknown")],
      ["response_missing", String(report.response?.missing ?? "unknown")],
      ["response_median_elapsed_minutes", String(report.response?.medianMinutes ?? "unknown")],
      ["staffed_response_minutes", "unknown"],
      [
        "correction_reported_minutes",
        String(report.correctionEffort.correctionMinutes ?? "unknown"),
      ],
      ["reentry_reported_minutes", String(report.correctionEffort.reentryMinutes ?? "unknown")],
      ["effort_observations", String(report.correctionEffort.observations ?? "unknown")],
    ];
    return new Response(`${rows.map((r) => r.join(",")).join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=business-report.csv",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isAppError(error) && ["forbidden", "not_found"].includes(error.code)) notFound();
    throw error;
  }
}
