// O33/F31 material correction. Reads never restrict, notify, approve or publish.
import { getDb } from "@/db/client";
import { correctionAction } from "@/features/inventory/correction-actions";
import { CorrectionForm } from "@/features/inventory/correction-form";
import { StaffPage } from "@/features/shell/staff-ui";
import { workCopy } from "@/features/work/copy";
import { checkLocale, privateRead } from "@/features/work/screens";
import { staffWorkflowCopy } from "@/features/work/workflow-completion-copy";
import { requireStaffPage } from "@/server/auth/pages";
import { readCorrectionWorkspace } from "@/server/inventory/corrections";
import { initialFormState } from "@/ui/form/server";

export default async function CorrectionPage({
  params,
}: {
  params: Promise<{ locale: string; reference: string }>;
}) {
  const { locale, reference } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const view = await privateRead(() => readCorrectionWorkspace(getDb(), session, reference));
  const copy = staffWorkflowCopy(locale).correction;
  const active = Boolean(view.task && view.task.state !== "done");
  const mode = active ? "reconcile" : "open";
  const values: Record<string, string> = {
    impactHash: view.digest,
    sourceReference: "",
    disputedFact: "",
    urgency: "",
    reviewed: "",
    followUpAt: "",
    items: JSON.stringify(view.items.map((item) => item.key)),
  };
  for (const [index] of view.items.entries()) {
    values[`state_${index}`] = "";
    values[`evidence_${index}`] = "";
  }
  return (
    <StaffPage title={copy.title} reference={view.listing.reference} lead={copy.boundary}>
      <a
        data-print-hide
        className="inline-flex min-h-control items-center font-semibold text-link underline"
        href={`/${locale}/inventory/${reference}?tab=review`}
      >
        {copy.back}
      </a>
      <p>{copy.scope}</p>
      {view.task ? (
        <p>
          {copy.status}: {workCopy(locale).states[view.task.state]} · {copy.owner}:{" "}
          {view.ownerName ?? "—"}
        </p>
      ) : null}
      {active && view.opened ? (
        <>
          <p>
            {copy.fact}: {view.opened.disputedFact}
          </p>
          <p>
            {copy.source}: <bdi>{view.opened.sourceReference}</bdi>
          </p>
        </>
      ) : null}
      {view.reconciliation ? (
        <details className="space-y-3">
          <summary className="min-h-control cursor-pointer py-3 font-semibold">
            {copy.reconcile}
          </summary>
          <ul className="divide-y divide-border">
            {view.reconciliation.items.map((item) => (
              <li key={item.key} className="space-y-2 py-3">
                <p>
                  {view.items.find((source) => source.key === item.key)?.reference ?? reference} ·{" "}
                  {item.state === "verified" ? copy.verified : copy.unresolved}
                </p>
                <p className="whitespace-pre-wrap">{item.evidence}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <section className="space-y-4">
        <h2 className="text-subheading font-semibold">{copy.impact}</h2>
        {!active ? (
          <ul className="divide-y divide-border">
            {view.items.map((item) => (
              <li key={item.key} className="py-3">
                {copy.kinds[item.kind]} · <bdi>{item.reference}</bdi>
                {item.caseId ? (
                  <a
                    data-print-hide
                    className="ms-3 inline-flex min-h-control items-center text-link underline"
                    href={`/${locale}/cases/${item.caseId}`}
                  >
                    {staffWorkflowCopy(locale).openRecord}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <CorrectionForm
          locale={locale}
          reference={reference}
          mode={mode}
          items={view.items}
          initialState={initialFormState(
            `inventory.correction.${mode}.${reference}`,
            values,
            active ? view.task?.version : view.listing.version,
          )}
          action={correctionAction.bind(null, locale, reference, mode)}
        />
      </section>
    </StaffPage>
  );
}
