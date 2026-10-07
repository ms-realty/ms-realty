import "server-only";
import { notFound } from "next/navigation";
import type { z } from "zod";
import { getDb } from "@/db/client";
import { DiscoveryPage } from "@/features/discovery/page";
import { listIntakeAssistanceRuns, readIntakeAssistanceOperation } from "@/server/ai/assistance";
import { assistanceAvailability } from "@/server/ai/config";
import type { IntakeSource, intakeDraftSchema } from "@/server/ai/intake-draft";
import { readIntakeAssistanceSource } from "@/server/ai/intake-source";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { controlClass, labelClass } from "@/ui/field-class";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { type AiValues, intakeAssistanceAction } from "./actions";
import { aiCopy } from "./copy";
import { IntakeAssistanceForm } from "./forms";
import { intakeAiCopy } from "./intake-copy";
import { localeAiCopy } from "./locale-copy";
export function IntakeSourcePanel({ source, locale }: { source: IntakeSource; locale: string }) {
  const copy = intakeAiCopy(locale);
  return (
    <section className="space-y-4">
      <h2 className="text-subheading font-semibold">{copy.source}</h2>
      <p>{copy.excluded}</p>
      <p>
        {source.reference} · {source.version}
      </p>
      <p className="whitespace-pre-wrap break-words rounded-panel border border-border p-5">
        {source.fields.note}
      </p>
      <p className="break-all text-caption">SHA-256: {source.noteDigest}</p>
    </section>
  );
}
export function IntakeDraftPanel({
  output,
  locale,
}: {
  output: z.infer<typeof intakeDraftSchema>;
  locale: string;
}) {
  const copy = intakeAiCopy(locale);
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{copy.candidates}</h3>
      <p>{copy.provenance}</p>
      <ul className="space-y-5">
        {output.candidates.map((candidate) => (
          <li key={candidate.field} className="space-y-2 rounded-panel border border-border p-4">
            <p className="font-semibold">
              {candidate.field} · {candidate.state}
            </p>
            {candidate.values.map((value) => (
              <div key={`${value.source.start}:${value.source.end}:${value.value}`}>
                <p>
                  {value.value} {value.unit} · {value.basis}
                </p>
                <blockquote className="whitespace-pre-wrap border-s-2 border-border ps-3">
                  {value.source.quote}
                </blockquote>
                <p className="text-caption">
                  note [{value.source.start}, {value.source.end})
                </p>
              </div>
            ))}
            {candidate.warning ? <p>{candidate.warning}</p> : null}
          </li>
        ))}
      </ul>
      <p>
        {copy.missing}: {output.missing.join(", ") || "—"}
      </p>
    </div>
  );
}
export async function IntakeAssistanceScreen({
  locale,
  session,
  reference,
  operation,
}: {
  locale: string;
  session: Session;
  reference?: string;
  operation?: string;
}) {
  const copy = intakeAiCopy(locale),
    common = aiCopy(locale),
    db = getDb();
  if (!reference)
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">{copy.title}</h1>
        <p>{copy.boundary}</p>
        <form method="get" className="grid max-w-reading gap-4">
          <label className="grid gap-2">
            <span className={labelClass}>{localeAiCopy(locale).reference}</span>
            <input name="reference" required maxLength={100} className={controlClass} />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-control bg-action px-4 py-2 text-on-action"
          >
            {copy.inspect}
          </button>
        </form>
      </DiscoveryPage>
    );
  const source = await readIntakeAssistanceSource(db, session, reference).catch((error) => {
    if (error instanceof AppError && ["not_found", "validation_failed"].includes(error.code))
      return null;
    if (error instanceof AppError && error.code === "forbidden") notFound();
    throw error;
  });
  if (!source)
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">{copy.title}</h1>
        <Notice tone="info" title={copy.empty} />
        <a className="underline" href={`/${locale}/inventory/${encodeURIComponent(reference)}`}>
          {copy.manual}
        </a>
      </DiscoveryPage>
    );
  const runs = await listIntakeAssistanceRuns(db, session, source.id, source.listingId),
    result = operation
      ? await readIntakeAssistanceOperation(db, session, source.id, source.listingId, operation)
      : null;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <p>{copy.boundary}</p>
      <a className="underline" href={`/${locale}/inventory/${source.reference}`}>
        {copy.manual}
      </a>
      <IntakeSourcePanel source={source} locale={locale} />
      {operation ? (
        <Notice tone="info" title={result ? result.status : common.operationMissing}>
          {result?.id ? (
            <a className="underline" href={`/${locale}/operations/assistance/${result.id}`}>
              {common.open}
            </a>
          ) : null}
        </Notice>
      ) : null}
      {assistanceAvailability().enabled ? (
        <IntakeAssistanceForm
          locale={locale}
          reference={source.reference}
          initialState={initialFormState<AiValues>(
            `ai.intake.${source.id}.${source.listingId}`,
            { task: "intake.extract", decision: "accepted", reviewed: "" },
            source.version,
          )}
          action={intakeAssistanceAction.bind(
            null,
            locale,
            source.id,
            source.listingId,
            source.reference,
          )}
        />
      ) : (
        <Notice tone="info" title={common.disabled} />
      )}
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{common.runs}</h2>
        <ul className="space-y-3">
          {runs.map((run) => (
            <li key={run.id}>
              <a className="underline" href={`/${locale}/operations/assistance/${run.id}`}>
                {common.open}
              </a>{" "}
              · {run.state} · {run.createdAt.toISOString()}
            </li>
          ))}
        </ul>
        {runs.length === 0 ? <p>—</p> : null}
      </section>
    </DiscoveryPage>
  );
}
