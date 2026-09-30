import "server-only";
import type { Capability, CapabilityGrant } from "@/domain/capabilities";
import { publicLocales } from "@/domain/ids";
import type { InquiryPurpose } from "@/domain/inquiry";
import { readAssistanceSource } from "@/server/ai/assistance";
import type { Session } from "@/server/auth/sessions";
import { resolveGrants } from "@/server/authz";
import type { Executor } from "@/server/db";
import { isAppError } from "@/server/errors";
import { type InboxView, listInbox } from "@/server/work/queries";
import { liveStaff } from "@/server/work/shared";

// This is starter visibility, never record authorization. A global-only can() probe
// would discard legitimate record/parent/locale scopes. Keep the same family scopes
// used by inquiry and listing reads; selected records still pass their actual services.
export function assistanceEntryAccess(grants: readonly CapabilityGrant[], now = new Date()) {
  const has = (capability: Capability, family: "inquiry" | "listing", locale?: string) =>
    grants.some((grant) => {
      if (grant.capability !== capability) return false;
      const scope = grant.scope;
      if (scope?.expiresAt && !(Date.parse(scope.expiresAt) > now.getTime())) return false;
      if (
        scope?.recordType &&
        ![family, family === "inquiry" ? "case" : "property"].includes(scope.recordType)
      )
        return false;
      // Inquiry starters may cover any allowed source locale. Intake/inventory reads
      // have no locale context; translation reads use the actual target language.
      if (scope?.locales)
        return locale === "any"
          ? scope.locales.length > 0
          : scope.locales.some((value) => value === locale);
      return true;
    });
  const inquiries = has("inquiry.read", "inquiry", "any");
  const inquiryDrafts = inquiries && has("ai.draft", "inquiry", "any");
  const inventory = has("listing.read", "listing");
  const intakeDrafts = inventory && has("ai.draft", "listing");
  const localeDrafts = publicLocales
    .filter((locale) => locale !== "bg")
    .some((locale) =>
      (["listing.read", "translation.draft", "ai.draft"] as const).every((capability) =>
        has(capability, "listing", locale),
      ),
    );
  return { inquiries, inquiryDrafts, inventory, intakeDrafts, localeDrafts };
}

// Reuse the queue's live session and inquiry.read scope before pagination. Each offered
// source must also pass the existing record-level ai.draft check. The selected GET
// re-reads the source; these choices never grant access or carry a request revision.
export async function readAssistanceEntry(
  db: Executor,
  session: Session,
  view: InboxView = "all",
  page = 1,
) {
  const live = await liveStaff(db, session);
  const access = assistanceEntryAccess(await resolveGrants(db, live.actor));
  if (!access.inquiryDrafts) return { choices: [], page, hasMore: false, view, access };
  const queue = await listInbox(db, session, view, page);
  const choices = await Promise.all(
    queue.rows.map(async ({ inquiry }) => {
      try {
        const source = await readAssistanceSource(db, session, inquiry.id);
        return {
          id: source.id,
          reference: source.fields.reference,
          purpose: source.fields.purpose as InquiryPurpose,
          locale: source.fields.locale,
        };
      } catch (error) {
        // Permission changes or removal between queue read and source read do not
        // leak a choice. Infrastructure and validation errors are not empty queues.
        if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) return null;
        throw error;
      }
    }),
  );
  return {
    choices: choices.filter((choice) => choice !== null),
    page: queue.page,
    hasMore: queue.hasMore,
    view,
    access,
  };
}

export function entryPage(value: string | string[] | undefined) {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1;
}
export function entryView(value: string | string[] | undefined): InboxView {
  return typeof value === "string" &&
    ["all", "unassigned", "mine", "awaiting", "review"].includes(value)
    ? (value as InboxView)
    : "all";
}
