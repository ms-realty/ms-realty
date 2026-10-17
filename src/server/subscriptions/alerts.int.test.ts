// Synthetic approved inventory and explicit synthetic human consent only. Never live mail.
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approvals,
  contactMethods,
  externalActions,
  grants,
  listings,
  passkeys,
  subscriptions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Capability } from "@/domain/capabilities";
import { createSession } from "../auth/sessions";
import { createContent, decideContent, readContentWorkbench } from "../content/commands";
import { dispatchMessage, enqueueMessage, recordDeliveryReport } from "../jobs/outbox";
import { type MessageProvider, TestMessageProvider } from "../jobs/provider";
import { ResendMessageProvider } from "../jobs/resend";
import {
  changeSubscription,
  consentTerms,
  editSearchSubscription,
  optIn,
} from "../privacy/preferences";
import { restrictPublication, withdrawPublication } from "../publication/commands";
import {
  createListingFixture,
  listingVersion,
  newOperationId,
  publishForTest,
} from "../publication/testing";
import { createClient, createStaff } from "../testing";
import { dispatchSearchAlert, planSearchAlerts, sweepSearchAlerts } from "./alerts";
import { approvedAlertRule, decideAlertRule, readAlertRule } from "./approval";
import { type AlertRule, currentAlertRule } from "./rule";
import { alertPayload, renderSearchAlert } from "./template";

let t: TestDatabase;
let staff: Awaited<ReturnType<typeof operator>>;
const rule: AlertRule = {
  templateVersion: "search-alerts.v1",
  publicOrigin: "https://public.example.test",
  clientOrigin: "https://client.example.test",
};
const options = { rule };
const future = () => new Date(Date.now() + 365 * 86400000).toISOString();
async function operator() {
  const person = await createStaff(t.db, {
    roles: ["content_editor", "publishing_approver"],
    grants: [
      "settings.manage",
      "message.send_external",
      "content.edit",
      "listing.review_facts",
      "claim.approve",
      "publication.release",
    ].map((capability) => ({ capability: capability as Capability })),
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}
async function ruleDecision(decision: "approve" | "disable", who = staff) {
  const current = await readAlertRule(t.db, who.session, rule);
  return decideAlertRule(t.db, who.session, rule, {
    operationId: randomUUID(),
    decision,
    expectedRuleHash: current.hash,
    expectedDecisionId: current.latest?.id ?? null,
    expectedDecisionVersion: current.latest?.version ?? 0,
    reviewed: true,
    note: "Synthetic test-only human review of exact rule",
    expiresAt: decision === "approve" ? future() : null,
  });
}
beforeAll(async () => {
  t = await createTestDatabase();
  staff = await operator();
  const created = await createContent(t.db, staff.session, {
    operationId: randomUUID(),
    kind: "help",
    slug: "search-alert-consent",
    title: "Синтетично съгласие за тест",
    text: "Само интеграционен тест, не реална политика или абонамент.",
    jurisdiction: "Synthetic test",
    reviewScope: "Test fixture only",
  });
  for (const decision of ["claims", "editorial", "publish"] as const) {
    const { page } = await readContentWorkbench(t.db, staff.session, created.outcome.id);
    await decideContent(t.db, staff.session, {
      operationId: randomUUID(),
      id: page.id,
      expectedVersion: page.version,
      decision,
      note: "Synthetic human approval",
      reviewed: true,
      expiresAt: future(),
    });
  }
}, 30_000);
beforeEach(async () => {
  await ruleDecision("approve");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture(
  overrides: {
    title?: string;
    publish?: boolean;
    weekly?: boolean;
    empty?: boolean;
    search?: Record<string, unknown>;
  } = {},
) {
  const listing = await createListingFixture(t.db, {
    reviewerId: staff.id,
    title: overrides.title ?? "Синтетичен имот — само тест",
  });
  if (overrides.publish !== false) await publishForTest(t.db, staff.actor, listing, ["bg"]);
  const client = await createClient(t.db);
  const [contact] = await t.db
    .insert(contactMethods)
    .values({
      partyId: client.partyId,
      kind: "email",
      value: client.email,
      normalizedValue: client.email,
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  if (!contact) throw new Error("No test contact");
  const { session } = await createSession(t.db, { kind: "client", id: client.id });
  const terms = await consentTerms(t.db, "search_alerts", "bg");
  if (!terms) throw new Error("No synthetic approved terms");
  const choice = await optIn(t.db, session, {
    operationId: randomUUID(),
    contactMethodId: contact.id,
    purpose: "search_alerts",
    locale: "bg",
    termsVersionId: terms.version.id,
    confirmed: true,
    timezone: "Europe/Sofia",
    ...(overrides.weekly ? { frequency: "weekly" } : {}),
    search: overrides.search ?? {
      purpose: "sale",
      q: overrides.empty ? "NO-SYNTHETIC-MATCH" : listing.reference,
    },
  });
  return { ...listing, client, contact, session, id: choice.outcome.id, terms };
}
async function plan(id: string, extra: { now?: Date } = {}) {
  const result = await planSearchAlerts(t.db, id, { ...options, ...extra });
  expect(result.state).toBe("queued");
  if (result.state !== "queued") throw new Error(`Plan was ${result.state}`);
  return result.actionId;
}
async function action(id: string) {
  const [row] = await t.db.select().from(externalActions).where(eq(externalActions.id, id));
  if (!row) throw new Error("No action");
  return row;
}

describe("AT44 saved-search alert delivery", () => {
  it("requires environment enablement AND current exact human rule approval", async () => {
    const f = await fixture();
    expect(await planSearchAlerts(t.db, f.id, { rule: null })).toEqual({ state: "disabled" });
    await ruleDecision("disable");
    expect(await planSearchAlerts(t.db, f.id, options)).toEqual({ state: "rule_unapproved" });
    expect(
      await approvedAlertRule(t.db, { ...rule, publicOrigin: "https://changed.example.test" }),
    ).toBeNull();
  });
  it("plans exact criteria once under concurrent planners, dispatches once, and acceptance is not delivery", async () => {
    const f = await fixture();
    const plans = await Promise.all([
      planSearchAlerts(t.db, f.id, options),
      planSearchAlerts(t.db, f.id, options),
    ]);
    expect(plans.map((result) => result.state).sort()).toEqual(["existing", "queued"]);
    const result = plans[0];
    if (!result || !("actionId" in result)) throw new Error("No planned action");
    const stored = await action(result.actionId);
    const payload = alertPayload.parse(stored.payload);
    const [subscription] = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, f.id));
    expect(payload.params.digest.criteriaSnapshot).toEqual(subscription?.criteria);
    expect(payload.params.digest.items).toMatchObject([
      { listingId: f.listingId, listingRevisionId: f.revisionId, reference: f.reference },
    ]);
    expect(payload.params.digest.frequency).toBe("daily");
    const provider = new TestMessageProvider();
    await Promise.all([
      dispatchSearchAlert(t.db, provider, result.actionId, options),
      dispatchSearchAlert(t.db, provider, result.actionId, options),
    ]);
    expect(provider.sent).toHaveLength(1);
    expect(await action(result.actionId)).toMatchObject({
      state: "acknowledged",
      verifiedAt: null,
      attempts: 1,
    });
    expect(await planSearchAlerts(t.db, f.id, options)).toMatchObject({ state: "period_complete" });
    expect(
      await recordDeliveryReport(t.db, {
        provider: provider.name,
        providerMessageId: "test-1",
        status: "delivered",
      }),
    ).toBe(true);
    expect((await action(result.actionId)).state).toBe("verified");
  });
  it("deduplicates the same listing revision across later local periods", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    await dispatchSearchAlert(t.db, provider, id, options);
    expect(
      await planSearchAlerts(t.db, f.id, { ...options, now: new Date(Date.now() + 86400000) }),
    ).toMatchObject({ state: "no_matches" });
    expect(provider.sent).toHaveLength(1);
  });
  it("keeps weekly preference and skips unapproved or empty inventory without creating an effect", async () => {
    const f = await fixture({ weekly: true }),
      id = await plan(f.id);
    expect(alertPayload.parse((await action(id)).payload).params.digest.period).toMatch(/^week:/);
    for (const invalid of [await fixture({ publish: false }), await fixture({ empty: true })]) {
      expect(await planSearchAlerts(t.db, invalid.id, options)).toMatchObject({
        state: "no_matches",
      });
      expect(
        await t.db.select().from(externalActions).where(eq(externalActions.subjectId, invalid.id)),
      ).toEqual([]);
    }
  });
  it.each(["paused", "withdrawn"] as const)("%s cancels already queued work", async (state) => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    await changeSubscription(t.db, f.session, {
      operationId: randomUUID(),
      id: f.id,
      expectedVersion: 1,
      state,
    });
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
    expect(provider.sent).toEqual([]);
  });
  it("edits fence old criteria; a paused edit never resumes sends", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    await editSearchSubscription(t.db, f.session, {
      operationId: randomUUID(),
      id: f.id,
      expectedVersion: 1,
      locale: "bg",
      termsVersionId: f.terms.version.id,
      confirmed: true,
      timezone: "Europe/Sofia",
      frequency: "weekly",
      purpose: "sale",
      q: "NO-SYNTHETIC-MATCH",
      maxPrice: null,
    });
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
    expect(await planSearchAlerts(t.db, f.id, options)).toMatchObject({ state: "no_matches" });
    expect(provider.sent).toEqual([]);
  });
  it("edits a stored long-term rental search in the same stream without losing exact criteria", async () => {
    const f = await fixture({
      search: {
        purpose: "long_term_rent",
        q: "Original search",
        sort: "price_asc",
        propertyTypes: ["apartment", "house"],
        placeIds: [randomUUID()],
        price: { currency: "EUR", min: 95003, max: 150007 },
        bedrooms: { min: 2, max: 3 },
        rooms: { min: 3, max: 5 },
        area: { basis: "built", min: 74.51, max: 90.07 },
        mustHave: ["lift", "parking"],
        includeUnconfirmed: true,
      },
    });
    const [before] = await t.db.select().from(subscriptions).where(eq(subscriptions.id, f.id));
    if (!before) throw new Error("Missing original rental subscription");
    await changeSubscription(t.db, f.session, {
      operationId: randomUUID(),
      id: f.id,
      expectedVersion: 1,
      state: "paused",
    });
    const input = {
      operationId: randomUUID(),
      id: f.id,
      expectedVersion: 2,
      locale: "bg",
      termsVersionId: f.terms.version.id,
      confirmed: true,
      timezone: "Europe/Sofia",
      frequency: "weekly",
      purpose: "long_term_rent",
      q: "Updated search",
      maxPrice: 160009,
    };
    const result = await editSearchSubscription(t.db, f.session, input);
    expect(await editSearchSubscription(t.db, f.session, input)).toEqual({
      ...result,
      replayed: true,
    });
    const rows = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.partyId, f.client.partyId));
    expect(rows).toHaveLength(1);
    const prior = before.criteria as { criteria: Record<string, unknown> };
    expect(rows[0]).toMatchObject({
      id: f.id,
      contactMethodId: f.contact.id,
      state: "paused",
      version: 3,
      frequency: "weekly",
      criteria: {
        ...prior,
        q: "Updated search",
        criteria: { ...prior.criteria, price: { currency: "EUR", min: 95003, max: 160009 } },
      },
    });
    expect(
      await t.db.select().from(externalActions).where(eq(externalActions.subjectId, f.id)),
    ).toEqual([]);
  });
  it.each(["unverified", "different_recipient", "marketing"] as const)(
    "rechecks %s eligibility immediately at dispatch",
    async (change) => {
      const f = await fixture(),
        id = await plan(f.id),
        provider = new TestMessageProvider();
      if (change === "marketing")
        await t.db
          .update(subscriptions)
          .set({ purpose: "marketing", criteria: null, frequency: null })
          .where(eq(subscriptions.id, f.id));
      else
        await t.db
          .update(contactMethods)
          .set(
            change === "unverified"
              ? { verification: "unverified", verifiedAt: null }
              : { value: "other@example.test", normalizedValue: "other@example.test" },
          )
          .where(eq(contactMethods.id, f.contact.id));
      expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
      expect(provider.sent).toEqual([]);
    },
  );
  it.each(["restrict", "withdraw"] as const)(
    "%s removes queued published matches before provider handoff",
    async (kind) => {
      const f = await fixture(),
        id = await plan(f.id),
        provider = new TestMessageProvider();
      await (kind === "restrict" ? restrictPublication : withdrawPublication)(t.db, {
        actor: staff.actor,
        operationId: newOperationId(),
        expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
        reference: f.reference,
        reason: "Synthetic eligibility revocation",
      });
      expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
      expect(provider.sent).toEqual([]);
    },
  );
  it("rechecks live availability against the exact saved criteria", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    await t.db
      .update(listings)
      .set({ commercialState: "sold" })
      .where(eq(listings.id, f.listingId));
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
    expect(provider.sent).toEqual([]);
  });
  it("human disable and permission revocation stop queued work", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    await ruleDecision("disable");
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
    const delegate = await operator();
    await ruleDecision("approve", delegate);
    const next = await fixture(),
      otherId = await plan(next.id);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, delegate.id), eq(grants.capability, "settings.manage")));
    expect(await dispatchSearchAlert(t.db, provider, otherId, options)).toBe("cancelled");
    expect(provider.sent).toEqual([]);
  });
  it("unknown handoff is durable, deduped across days and never automatically replayed", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    provider.script("throw");
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("outcome_unknown");
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("outcome_unknown");
    expect(
      await planSearchAlerts(t.db, f.id, { ...options, now: new Date(Date.now() + 86400000) }),
    ).toMatchObject({ state: "no_matches" });
    expect(provider.sent).toHaveLength(1);
  });
  it("definite rejection retries the same immutable payload and provider key", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    provider.script({ status: "rejected", code: "rate_limited", retryable: true });
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("queued");
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("acknowledged");
    expect(provider.sent).toHaveLength(2);
    expect(provider.sent[0]).toEqual(provider.sent[1]);
    expect((await action(id)).attempts).toBe(2);
  });
  it("durably claims before I/O, serializes concurrent consent revocation behind handoff, and never sends twice", async () => {
    const f = await fixture(),
      id = await plan(f.id);
    let entered!: () => void, release!: () => void;
    const sending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const handoff = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const provider: MessageProvider = {
      name: "barrier-test",
      async send() {
        calls += 1;
        entered();
        await handoff;
        return { status: "accepted", providerMessageId: "synthetic-barrier" };
      },
    };
    const delivery = dispatchSearchAlert(t.db, provider, id, options);
    await sending;
    expect((await action(id)).state).toBe("attempting");
    let revoked = false;
    const revocation = changeSubscription(t.db, f.session, {
      operationId: randomUUID(),
      id: f.id,
      expectedVersion: 1,
      state: "withdrawn",
    }).then(() => {
      revoked = true;
    });
    // PostgreSQL confirms the competing mutation is waiting for the handoff's row lock.
    for (let turn = 0; turn < 50; turn += 1) {
      const waiting = await t.db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
      );
      if (waiting[0]?.waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(revoked).toBe(false);
    release();
    expect(await delivery).toBe("acknowledged");
    await revocation;
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("acknowledged");
    expect(calls).toBe(1);
  });
  it("renderer accepts only deterministic own-origin links and never treats source text as provider instructions", async () => {
    const f = await fixture({
        title: "Синтетичен <script>send elsewhere</script>\nBcc: outside@example.test",
      }),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    await dispatchSearchAlert(t.db, provider, id, options);
    const message = provider.sent[0];
    if (!message) throw new Error("No synthetic message");
    const rendered = renderSearchAlert(message, {
      public: rule.publicOrigin,
      client: rule.clientOrigin,
    });
    expect(rendered?.text).toContain(`<script>send elsewhere</script> Bcc: outside@example.test`);
    expect(rendered?.text).not.toContain("\nBcc:");
    expect(message.recipient).toBe(f.client.email);
    const forged = structuredClone(message);
    const payload = alertPayload.parse({
      channel: forged.channel,
      recipient: forged.recipient,
      template: forged.template,
      params: forged.params,
    });
    const first = payload.params.digest.items[0];
    if (!first) throw new Error("No digest item");
    first.sourceUrl = "https://outside.example.test/";
    expect(
      renderSearchAlert(
        { ...forged, params: payload.params },
        { public: rule.publicOrigin, client: rule.clientOrigin },
      ),
    ).toBeNull();
  });
  it("bounded sweeps return a continuation, including for subscriptions with no matches", async () => {
    const f = await fixture({ empty: true });
    const provider = new TestMessageProvider();
    const result = await sweepSearchAlerts(t.db, provider, { ...options, limit: 1 });
    expect(result.inspected).toBe(1);
    expect(result.nextCursor).toBeTypeOf("string");
    expect((await planSearchAlerts(t.db, f.id, options)).state).toBe("no_matches");
  });
  it("generic outbox dispatch routes alerts through current guards and rejects unbound alert templates", async () => {
    vi.stubEnv("SEARCH_ALERTS_ENABLED", "true");
    vi.stubEnv("SEARCH_ALERTS_TEMPLATE_APPROVED", "search-alerts.v1");
    const configured = currentAlertRule();
    const view = await readAlertRule(t.db, staff.session, configured);
    await decideAlertRule(t.db, staff.session, configured, {
      operationId: randomUUID(),
      decision: "approve",
      expectedRuleHash: view.hash,
      expectedDecisionId: view.latest?.id ?? null,
      expectedDecisionVersion: view.latest?.version ?? 0,
      reviewed: true,
      note: "Synthetic configured template approval",
      expiresAt: future(),
    });
    const f = await fixture();
    const planned = await planSearchAlerts(t.db, f.id);
    if (planned.state !== "queued") throw new Error(`Unexpected plan ${planned.state}`);
    const provider = new TestMessageProvider();
    const payload = alertPayload.parse((await action(planned.actionId)).payload);
    const forged = await enqueueMessage(t.db, { idempotencyKey: randomUUID(), ...payload });
    expect(await dispatchMessage(t.db, provider, forged.id)).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
    await changeSubscription(t.db, f.session, {
      operationId: randomUUID(),
      id: f.id,
      expectedVersion: 1,
      state: "withdrawn",
    });
    expect(await dispatchMessage(t.db, provider, planned.actionId)).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
    const active = await fixture();
    const allowed = await planSearchAlerts(t.db, active.id);
    if (allowed.state !== "queued") throw new Error("No eligible configured digest");
    expect(await dispatchMessage(t.db, provider, allowed.actionId)).toBe("acknowledged");
    expect(provider.sent).toHaveLength(1);
  });
  it("refuses an altered ledger payload before any provider I/O", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    const row = await action(id),
      payload = alertPayload.parse(row.payload);
    payload.recipient = "altered@example.test";
    await t.db.update(externalActions).set({ payload }).where(eq(externalActions.id, id));
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
    const generic = await enqueueMessage(t.db, {
      idempotencyKey: randomUUID(),
      channel: "email",
      recipient: "synthetic@example.test",
      template: "auth.email_link",
    });
    await t.db
      .update(externalActions)
      .set({
        payload: {
          channel: "email",
          recipient: "altered@example.test",
          template: "auth.email_link",
          params: {},
        },
      })
      .where(eq(externalActions.id, generic.id));
    expect(await dispatchMessage(t.db, provider, generic.id)).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
  });
  it("approval rejects changed previews, unreviewed input, stale decisions and non-operator clients", async () => {
    const current = await readAlertRule(t.db, staff.session, rule);
    const request = {
      operationId: randomUUID(),
      decision: "approve",
      expectedRuleHash: current.hash,
      expectedDecisionId: current.latest?.id ?? null,
      expectedDecisionVersion: current.latest?.version ?? 0,
      reviewed: true,
      note: "Synthetic approval boundary",
      expiresAt: future(),
    };
    await expect(
      decideAlertRule(t.db, staff.session, rule, { ...request, reviewed: false }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      decideAlertRule(
        t.db,
        staff.session,
        { ...rule, clientOrigin: "https://changed.example.test" },
        request,
      ),
    ).rejects.toMatchObject({ code: "approval_stale" });
    const one = await decideAlertRule(t.db, staff.session, rule, request);
    expect((await decideAlertRule(t.db, staff.session, rule, request)).operationId).toBe(
      one.operationId,
    );
    await expect(
      decideAlertRule(t.db, staff.session, rule, { ...request, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const f = await fixture();
    await expect(
      decideAlertRule(t.db, f.session, rule, { ...request, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("a definitely rejected payload cannot be retried after the provider key window", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    provider.script({ status: "rejected", code: "rate_limited", retryable: true });
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("queued");
    await t.db
      .update(externalActions)
      .set({ firstAttemptAt: new Date(Date.now() - 25 * 3600000) })
      .where(eq(externalActions.id, id));
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
    expect((await action(id)).lastErrorCode).toBe("alert_retry_window_expired");
    expect(provider.sent).toHaveLength(1);
  });
  it("serializes the guarded digest through the real Resend adapter with a fake HTTP boundary", async () => {
    const f = await fixture(),
      id = await plan(f.id);
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.to).toEqual([f.client.email]);
      expect(body.text).toContain(f.reference);
      expect(body.text).toContain(`${rule.clientOrigin}/bg/preferences`);
      expect(body.html).toBeUndefined();
      expect(body.tags).toEqual([{ name: "action_id", value: id }]);
      return Response.json({ id: randomUUID() });
    });
    const provider = new ResendMessageProvider(
      {
        apiKey: "synthetic-no-live-key",
        from: "Synthetic <noreply@example.test>",
        hosts: {
          public: rule.publicOrigin,
          client: rule.clientOrigin,
          staff: "https://staff.example.test",
        },
      },
      fetcher,
    );
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("acknowledged");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await action(id)).verifiedAt).toBeNull();
  });
  it("corrupt ambiguous ledger history stays conservatively reserved", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    provider.script("throw");
    await dispatchSearchAlert(t.db, provider, id, options);
    const payload = alertPayload.parse((await action(id)).payload);
    await t.db
      .update(externalActions)
      .set({ payload: { ...payload, recipient: "malformed" } })
      .where(eq(externalActions.id, id));
    expect(
      await planSearchAlerts(t.db, f.id, { ...options, now: new Date(Date.now() + 86400000) }),
    ).toMatchObject({ state: "no_matches" });
    expect(provider.sent).toHaveLength(1);
  });
  it("an expired rule approval or exact consent approval cannot authorize delivery", async () => {
    const f = await fixture(),
      id = await plan(f.id),
      provider = new TestMessageProvider();
    const ruleApproval = await approvedAlertRule(t.db, rule);
    if (!ruleApproval) throw new Error("No rule approval");
    await t.db
      .update(approvals)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(approvals.id, ruleApproval.id));
    expect(await dispatchSearchAlert(t.db, provider, id, options)).toBe("cancelled");
    await ruleDecision("approve");
    const next = await fixture(),
      nextId = await plan(next.id);
    await t.db
      .update(approvals)
      .set({
        state: "invalidated",
        invalidatedAt: new Date(),
        invalidationReason: "Synthetic consent withdrawal",
      })
      .where(
        and(eq(approvals.subjectId, next.terms.version.id), eq(approvals.kind, "publication")),
      );
    expect(await dispatchSearchAlert(t.db, provider, nextId, options)).toBe("cancelled");
    expect(provider.sent).toEqual([]);
  });
});
