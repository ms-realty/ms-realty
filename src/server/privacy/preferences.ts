import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { consentEvents, contactMethods, parties, subscriptions } from "@/db/schema";
import { type PublicLocale, publicLocales } from "@/domain/ids";
import { alertFrequencies, checkSendEligibility, subscriptionMachine } from "@/domain/subscription";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { getEnv } from "../config/env";
import { readApprovedContent } from "../content/public";
import { hashRequest, keyedHash, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { recordOutboxEvent } from "../jobs/outbox";
import { runOperation } from "../operations";
import { type NormalizedSearch, normalizeSearch } from "../search/search";
import { parseInput } from "../work/shared";
import { privacyClient } from "./access";

export const optionalPurposes = ["search_alerts", "marketing"] as const;
type OptionalPurpose = (typeof optionalPurposes)[number];
const consentSlug = {
  search_alerts: "search-alert-consent",
  marketing: "marketing-consent",
} as const;
const timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
export const consentTerms = (
  db: Executor,
  purpose: OptionalPurpose,
  locale: PublicLocale,
  lock = false,
) => readApprovedContent(db, "help", consentSlug[purpose], locale, { lock });
const policyKey = (terms: NonNullable<Awaited<ReturnType<typeof consentTerms>>>) =>
  `${terms.version.id}:${terms.version.number}:${terms.version.contentHash}:${terms.locale}`;
const searchSummary = (search: NormalizedSearch) =>
  [
    search.criteria.purpose === "sale"
      ? search.locale === "bg"
        ? "Покупка"
        : "Buy"
      : search.locale === "bg"
        ? "Наем"
        : "Rent",
    search.q,
    search.criteria.price
      ? `${search.criteria.price.currency} ${search.criteria.price.min === undefined ? "0" : search.criteria.price.min / 100} – ${search.criteria.price.max === undefined ? "∞" : search.criteria.price.max / 100}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

export async function getPreferences(db: Executor, session: Session, locale: PublicLocale) {
  const { person } = await privacyClient(db, session);
  const [party] = await db.select().from(parties).where(eq(parties.id, person.partyId));
  if (!party) throw new AppError("not_found");
  const contacts = await db
    .select({
      id: contactMethods.id,
      kind: contactMethods.kind,
      value: contactMethods.value,
      verification: contactMethods.verification,
    })
    .from(contactMethods)
    .where(eq(contactMethods.partyId, person.partyId));
  const choices = await db
    .select({
      id: subscriptions.id,
      version: subscriptions.version,
      purpose: subscriptions.purpose,
      state: subscriptions.state,
      frequency: subscriptions.frequency,
      timezone: subscriptions.timezone,
      criteriaSummary: subscriptions.criteriaSummary,
      criteria: subscriptions.criteria,
    })
    .from(subscriptions)
    .where(eq(subscriptions.partyId, person.partyId))
    .orderBy(desc(subscriptions.createdAt));
  return {
    party: {
      id: party.id,
      version: party.version,
      preferredLocale: party.preferredLocale,
      contactPreferences: party.contactPreferences,
    },
    contacts,
    subscriptions: choices,
    terms: {
      search_alerts: await consentTerms(db, "search_alerts", locale),
      marketing: await consentTerms(db, "marketing", locale),
    },
  };
}

export async function saveContactPreferences(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({
      operationId: z.uuid(),
      expectedVersion: z.int().positive(),
      locale: z.enum(publicLocales),
      timezone,
      channel: z.enum(["email", "phone"]),
      contactWindow: z.string().trim().max(160),
    }),
    input,
  );
  const { person } = await privacyClient(db, session);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "preferences.contact",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      await privacyClient(tx, session);
      const [party] = await tx
        .select()
        .from(parties)
        .where(eq(parties.id, person.partyId))
        .for("update");
      if (!party || party.version !== value.expectedVersion) throw new AppError("version_conflict");
      await tx
        .update(parties)
        .set({
          preferredLocale: value.locale,
          contactPreferences: {
            timezone: value.timezone,
            channel: value.channel,
            contactWindow: value.contactWindow,
          },
          version: party.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(parties.id, party.id));
      await recordAudit(tx, {
        actor: session.actor,
        action: "preferences.contact.saved",
        recordType: "party",
        recordId: party.id,
        operationId,
      });
      return { partyId: party.id };
    },
  );
}

export async function optIn(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({
      operationId: z.uuid(),
      contactMethodId: z.uuid(),
      purpose: z.enum(optionalPurposes),
      locale: z.enum(publicLocales),
      termsVersionId: z.uuid(),
      confirmed: z.literal(true),
      timezone,
      frequency: z.enum(alertFrequencies).default("daily"),
      search: z.unknown().optional(),
    }),
    input,
  );
  const { person } = await privacyClient(db, session);
  const search =
    value.purpose === "search_alerts"
      ? normalizeSearch({ ...(value.search as object), locale: value.locale })
      : null;
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "preferences.opt_in",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      await privacyClient(tx, session);
      const terms = await consentTerms(tx, value.purpose, value.locale, true);
      if (!terms || terms.version.id !== value.termsVersionId) throw new AppError("approval_stale");
      const [contact] = await tx
        .select()
        .from(contactMethods)
        .where(
          and(
            eq(contactMethods.id, value.contactMethodId),
            eq(contactMethods.partyId, person.partyId),
          ),
        )
        .for("share");
      if (contact?.kind !== "email" || contact.verification !== "verified" || !contact.verifiedAt)
        throw new AppError("validation_failed");
      // Serialize this party's choices, so retries/concurrent requests cannot create two
      // active optional streams for the same contact and purpose.
      await tx
        .select({ id: parties.id })
        .from(parties)
        .where(eq(parties.id, person.partyId))
        .for("update");
      const existing = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.partyId, person.partyId),
            eq(subscriptions.contactMethodId, contact.id),
            eq(subscriptions.purpose, value.purpose),
          ),
        );
      if (existing.some((row) => row.state !== "withdrawn"))
        throw new AppError("transition_denied");
      const id = randomUUID();
      const key = policyKey(terms);
      const summary = search ? searchSummary(search) : null;
      await tx.insert(subscriptions).values({
        id,
        partyId: person.partyId,
        contactMethodId: contact.id,
        purpose: value.purpose,
        state: "active",
        verifiedAt: contact.verifiedAt,
        criteria: search ? { ...search, consentLocale: value.locale } : null,
        criteriaSummary: summary,
        frequency: search ? value.frequency : null,
        timezone: value.timezone,
        policyVersion: key,
        templateVersion: null,
        unsubscribeTokenHash: sha256Hex(keyedHash(getEnv().authSecret, `unsubscribe:${id}`)),
      });
      await tx.insert(consentEvents).values(
        ["opted_in", "channel_verified"].map((kind) => ({
          subscriptionId: id,
          kind: kind as "opted_in" | "channel_verified",
          policyVersion: key,
          source: `client_preferences:${terms.version.id}`,
          actorKind: session.actor.kind,
          actorId: session.actor.id,
        })),
      );
      await recordAudit(tx, {
        actor: session.actor,
        action: "subscription.opted_in",
        recordType: "subscription",
        recordId: id,
        operationId,
        payload: { purpose: value.purpose, policyVersion: key },
      });
      return { id, state: "active" };
    },
  );
}

export async function changeSubscription(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({
      operationId: z.uuid(),
      id: z.uuid(),
      expectedVersion: z.int().positive(),
      state: z.enum(["paused", "active", "withdrawn"]),
    }),
    input,
  );
  const { person } = await privacyClient(db, session);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "preferences.subscription",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      await privacyClient(tx, session);
      const [row] = await tx
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.id, value.id), eq(subscriptions.partyId, person.partyId)))
        .for("update");
      if (!row || !optionalPurposes.includes(row.purpose as OptionalPurpose))
        throw new AppError("not_found");
      if (row.version !== value.expectedVersion) throw new AppError("version_conflict");
      if (subscriptionMachine.check(row.state, value.state).outcome !== "allowed")
        throw new AppError("transition_denied");
      if (value.state === "active") {
        const locale = z.enum(publicLocales).safeParse(row.policyVersion.split(":").at(-1));
        const terms = locale.success
          ? await consentTerms(tx, row.purpose as OptionalPurpose, locale.data, true)
          : null;
        const [contact] = await tx
          .select()
          .from(contactMethods)
          .where(eq(contactMethods.id, row.contactMethodId));
        if (
          !terms ||
          policyKey(terms) !== row.policyVersion ||
          contact?.kind !== "email" ||
          contact.partyId !== row.partyId ||
          contact?.verification !== "verified" ||
          !contact.verifiedAt
        )
          throw new AppError("approval_stale");
      }
      await tx
        .update(subscriptions)
        .set({ state: value.state, version: row.version + 1, updatedAt: new Date() })
        .where(eq(subscriptions.id, row.id));
      await tx.insert(consentEvents).values({
        subscriptionId: row.id,
        kind: value.state === "active" ? "resumed" : value.state,
        policyVersion: row.policyVersion,
        source: "client_preferences",
        actorKind: session.actor.kind,
        actorId: session.actor.id,
      });
      await recordAudit(tx, {
        actor: session.actor,
        action: `subscription.${value.state}`,
        recordType: "subscription",
        recordId: row.id,
        operationId,
      });
      await recordOutboxEvent(tx, {
        eventType: `subscription.${value.state}`,
        subjectType: "subscription",
        subjectId: row.id,
        operationId,
      });
      return { id: row.id, state: value.state };
    },
  );
}

/** Editing a search preserves its existing filters and never resumes a paused stream. */
export async function editSearchSubscription(db: Executor, session: Session, input: unknown) {
  const value = parseInput(
    z.object({
      operationId: z.uuid(),
      id: z.uuid(),
      expectedVersion: z.int().positive(),
      locale: z.enum(publicLocales),
      termsVersionId: z.uuid(),
      confirmed: z.literal(true),
      timezone,
      frequency: z.enum(alertFrequencies),
      q: z.string().trim().max(100),
      purpose: z.enum(["sale", "rent"]),
      maxPrice: z.int().nonnegative().max(1_000_000_000_000).nullable(),
    }),
    input,
  );
  const { person } = await privacyClient(db, session);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: "preferences.search.edit",
      idempotencyKey: value.operationId,
      requestHash: hashRequest(value),
    },
    async ({ tx, operationId }) => {
      await privacyClient(tx, session);
      const [row] = await tx
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.id, value.id), eq(subscriptions.partyId, person.partyId)))
        .for("update");
      if (row?.purpose !== "search_alerts") throw new AppError("not_found");
      if (row.version !== value.expectedVersion) throw new AppError("version_conflict");
      if (!["active", "paused"].includes(row.state)) throw new AppError("transition_denied");
      const terms = await consentTerms(tx, "search_alerts", value.locale, true);
      if (!terms || terms.version.id !== value.termsVersionId) throw new AppError("approval_stale");
      const [contact] = await tx
        .select()
        .from(contactMethods)
        .where(eq(contactMethods.id, row.contactMethodId))
        .for("share");
      if (
        contact?.kind !== "email" ||
        contact.partyId !== person.partyId ||
        contact.verification !== "verified" ||
        !contact.verifiedAt
      )
        throw new AppError("validation_failed");
      const current = row.criteria as NormalizedSearch | null;
      if (
        !current?.criteria ||
        (current.criteria.price && current.criteria.price.currency !== "EUR")
      )
        throw new AppError("validation_failed");
      const { includeNeedsConfirmation, ...criteria } = current.criteria;
      const search = normalizeSearch({
        ...criteria,
        locale: value.locale,
        purpose: value.purpose,
        q: value.q,
        includeUnconfirmed: includeNeedsConfirmation,
        price:
          value.maxPrice === null && current.criteria.price?.min === undefined
            ? undefined
            : {
                currency: "EUR",
                min: current.criteria.price?.min,
                ...(value.maxPrice === null ? {} : { max: value.maxPrice }),
              },
      });
      const policyVersion = policyKey(terms);
      await tx
        .update(subscriptions)
        .set({
          criteria: { ...search, consentLocale: value.locale },
          criteriaSummary: searchSummary(search),
          timezone: value.timezone,
          frequency: value.frequency,
          policyVersion,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, row.id));
      await tx.insert(consentEvents).values({
        subscriptionId: row.id,
        kind: "criteria_changed",
        policyVersion,
        source: "client_preferences",
        actorKind: session.actor.kind,
        actorId: session.actor.id,
      });
      await recordAudit(tx, {
        actor: session.actor,
        action: "subscription.criteria_changed",
        recordType: "subscription",
        recordId: row.id,
        operationId,
        payload: {
          previousCriteria: row.criteria,
          criteria: search,
          frequency: value.frequency,
          timezone: value.timezone,
          policyVersion,
        },
      });
      return { id: row.id, state: row.state };
    },
  );
}

/** Optional-message workers call immediately before dispatch. A previous queue snapshot
 * never substitutes for current purpose, consent, verified channel and approved terms. */
export async function eligibleSubscriptionRecipient(
  db: Executor,
  id: string,
  purpose: OptionalPurpose,
) {
  const [row] = await db
    .select({ subscription: subscriptions, contact: contactMethods })
    .from(subscriptions)
    .innerJoin(contactMethods, eq(contactMethods.id, subscriptions.contactMethodId))
    .where(eq(subscriptions.id, id));
  if (
    !row ||
    checkSendEligibility(
      { ...row.subscription, verifiedAt: row.subscription.verifiedAt?.toISOString() ?? null },
      purpose,
    ).outcome !== "allowed" ||
    row.contact.verification !== "verified" ||
    row.contact.kind !== "email" ||
    !row.contact.verifiedAt ||
    row.contact.partyId !== row.subscription.partyId
  )
    return null;
  const locale = z.enum(publicLocales).safeParse(row.subscription.policyVersion.split(":").at(-1));
  const terms = locale.success ? await consentTerms(db, purpose, locale.data) : null;
  if (!terms || policyKey(terms) !== row.subscription.policyVersion) return null;
  return { recipient: row.contact.value, subscription: row.subscription };
}
