import type { ButlerReceipt } from "@/domain/butler";
import { TechnicalDetails } from "@/ui/technical-details";
import { staffWorkflowCopy } from "../work/workflow-completion-copy";
import { aiLabel } from "./labels";

export function ButlerReceiptLine({
  locale,
  receipt,
  manualHref,
}: {
  locale: string;
  receipt: ButlerReceipt;
  manualHref: string;
}) {
  const copy = staffWorkflowCopy(locale);
  const verdict =
    receipt.outcome === "unknown"
      ? copy.outcomeUnknown
      : receipt.verdict === "blocked"
        ? copy.blocked
        : receipt.verdict === "awaiting_approval"
          ? copy.awaiting
          : copy.done;
  return (
    <section
      className="space-y-3 rounded-control border border-divider p-4"
      aria-label={copy.receipt}
    >
      <p className="font-semibold">
        {copy.receipt} · {verdict}
      </p>
      <p>{copy.draftOnly}</p>
      <p>
        {copy.reason}: {receipt.reason === "draft_only" ? copy.draftOnly : copy.unknownReason}
      </p>
      {receipt.manual.requiresReconciliation ? <p>{copy.manualReconcile}</p> : null}
      <a
        className="inline-flex min-h-control items-center font-semibold text-link underline"
        href={manualHref}
      >
        {copy.manual}
      </a>
      <TechnicalDetails locale={locale}>
        <p>{receipt.action}</p>
        <p>{receipt.reason}</p>
        <p>
          {receipt.verdict} · {receipt.outcome}
        </p>
        <bdi>{receipt.operationId}</bdi>
      </TechnicalDetails>
    </section>
  );
}

/** O32: actual persisted run/review status; this is not execution or publication evidence. */
export function DraftRunReceipt({
  locale,
  state,
  sourceCurrent,
  reviewedAt,
  manualHref,
}: {
  locale: string;
  state: string;
  sourceCurrent: boolean;
  reviewedAt: Date | null;
  manualHref: string;
}) {
  const copy = staffWorkflowCopy(locale);
  return (
    <section
      className="space-y-3 rounded-control border border-divider p-4"
      aria-label={copy.receipt}
    >
      <p className="font-semibold">
        {copy.receipt} · {aiLabel("run", state, locale)}
      </p>
      <p>{reviewedAt ? copy.reviewed : copy.notReviewed}</p>
      {!sourceCurrent ? <p>{copy.sourceChanged}</p> : null}
      <p>{copy.draftOnly}</p>
      <a
        href={manualHref}
        className="inline-flex min-h-control items-center font-semibold text-link underline"
      >
        {copy.manual}
      </a>
    </section>
  );
}
