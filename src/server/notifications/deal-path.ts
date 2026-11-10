// Deal path → deal notices. A client-visible step marked done tells the clients, with the
// step's own client-facing label from the dealPath catalog in each recipient's language; a
// completed Deal tells them once. Reopened, skipped or re-dated steps send nothing.
import "server-only";
import { type PublicLocale, sourceLocale } from "@/config/tenant";
import type { Actor } from "@/domain/capabilities";
import bg from "../../../messages/bg/dealPath.json" with { type: "json" };
import de from "../../../messages/de/dealPath.json" with { type: "json" };
import el from "../../../messages/el/dealPath.json" with { type: "json" };
import en from "../../../messages/en/dealPath.json" with { type: "json" };
import he from "../../../messages/he/dealPath.json" with { type: "json" };
import nl from "../../../messages/nl/dealPath.json" with { type: "json" };
import ru from "../../../messages/ru/dealPath.json" with { type: "json" };
import type { Executor } from "../db";
import { notifyDealStepDone, notifyDealUpdate } from "./notify";

const catalogs: Record<PublicLocale, { steps: Record<string, { label: string } | undefined> }> = {
  bg,
  en,
  ru,
  de,
  nl,
  el,
  he,
};

/** The step's client-facing label in every locale the catalog has it in. */
export function dealStepLabels(stepKey: string): Partial<Record<PublicLocale, string>> {
  return Object.fromEntries(
    Object.entries(catalogs).flatMap(([locale, catalog]) => {
      const label = catalog.steps[stepKey]?.label;
      return label ? [[locale, label]] : [];
    }),
  );
}

export async function notifyPathStepDone(
  db: Executor,
  step: { caseId: string; caseReference: string; stepKey: string; version: number },
  actor: Actor,
) {
  const label = dealStepLabels(step.stepKey);
  // A step without catalog wording has no client-facing label to send.
  if (!label[sourceLocale]) return [];
  return notifyDealStepDone(db, {
    caseId: step.caseId,
    // Each time the step is done counts once; reopening and doing it again is a new event.
    stepKey: `${step.caseId}:${step.stepKey}:v${step.version}`,
    caseReference: step.caseReference,
    label,
    actor,
  });
}

export function notifyDealCompleted(
  db: Executor,
  deal: { caseId: string; caseReference: string; completionId: string },
  actor: Actor,
) {
  return notifyDealUpdate(db, {
    caseId: deal.caseId,
    event: "deal.completed",
    eventKey: `deal-completed:${deal.completionId}`,
    subject: { type: "case", id: deal.caseId, reference: deal.caseReference },
    actor,
  });
}
