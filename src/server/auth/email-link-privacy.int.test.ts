// AT38/AT45: current credential authority before issuance, consumption and provider handoff.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  contactMethods,
  emailSignInTokens,
  externalActions,
  principals,
  sessions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { dispatchMessage } from "../jobs/outbox";
import { TestMessageProvider } from "../jobs/provider";
import { applyPrivacyErasure, readPrivacyErasureWorkbench } from "../privacy/erasure";
import {
  syntheticErasureDecisions,
  syntheticErasureFixture,
  syntheticErasurePolicy,
} from "../privacy/erasure-testing";
import { consumeEmailLink, inspectEmailLink, issueEmailLink, requestEmailLink } from "./email-link";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function queuedLink(email: string) {
  await issueEmailLink(t.db, { email, locale: "en", returnTo: "/en/privacy" });
  const [credential] = await t.db
    .select()
    .from(emailSignInTokens)
    .where(eq(emailSignInTokens.email, email));
  if (!credential) throw new Error("No actual synthetic credential");
  const [action] = await t.db
    .select()
    .from(externalActions)
    .where(eq(externalActions.effectKey, `email_link:${credential.id}`));
  const secret = action?.secretPayload as { url?: string } | null;
  if (!action || !secret?.url) throw new Error("No actual synthetic credential email");
  return { credential, action, token: new URL(secret.url).searchParams.get("token") ?? "" };
}
const actionOf = async (id: string) =>
  (await t.db.select().from(externalActions).where(eq(externalActions.id, id)))[0];

describe("AT45 sign-in email privacy propagation", () => {
  it("cancels queued credential mail and clears its raw secret; restoring mutable status/token does not restore issuance, consumption, sessions or contacts", async () => {
    const f = await syntheticErasureFixture(t.db);
    await syntheticErasurePolicy(t.db, f);
    const link = await queuedLink(f.client.email);
    const other = await queuedLink(f.other.email);
    const work = await readPrivacyErasureWorkbench(t.db, f.staffSession.session, f.request.id);
    await applyPrivacyErasure(t.db, f.staffSession.session, {
      operationId: crypto.randomUUID(),
      requestId: f.request.id,
      expectedVersion: 1,
      inventoryDigest: work.inventoryDigest,
      purposes: ["search_alerts", "marketing"],
      decisions: syntheticErasureDecisions(work.inventory, ["optional_contacts"]),
      confirmed: true,
    });
    const provider = new TestMessageProvider();
    expect(await actionOf(link.action.id)).toMatchObject({
      state: "cancelled",
      secretPayload: null,
      lastErrorCode: "auth_email_link_ineligible",
      effectKey: link.action.effectKey,
      attempts: 0,
    });
    expect(await dispatchMessage(t.db, provider, link.action.id)).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
    await t.db.update(principals).set({ status: "active" }).where(eq(principals.id, f.client.id));
    await t.db
      .update(emailSignInTokens)
      .set({ revokedAt: null })
      .where(eq(emailSignInTokens.id, link.credential.id));
    const beforeTokens = await t.db.select().from(emailSignInTokens);
    const beforeSessions = await t.db.select().from(sessions);
    const beforeContacts = await t.db
      .select()
      .from(contactMethods)
      .where(eq(contactMethods.partyId, f.client.partyId));
    const beforeActions = await t.db.select().from(externalActions);
    const jobs: Parameters<typeof issueEmailLink>[1][] = [];
    for (const email of [f.client.email, "unknown-synthetic@example.test"]) {
      expect(
        await requestEmailLink(t.db, {
          email,
          clientIp: "192.0.2.231",
          queue: {
            send: async (_name, job) => {
              jobs.push(job as Parameters<typeof issueEmailLink>[1]);
              return null;
            },
          },
        }),
      ).toEqual({ status: "sent" });
    }
    for (const job of jobs) await issueEmailLink(t.db, job);
    await expect(consumeEmailLink(t.db, link.token)).rejects.toMatchObject({
      code: "link_invalid",
    });
    expect((await inspectEmailLink(t.db, link.token)).state).toBe("revoked");
    expect(await t.db.select().from(emailSignInTokens)).toEqual(beforeTokens);
    expect(await t.db.select().from(sessions)).toEqual(beforeSessions);
    expect(
      await t.db.select().from(contactMethods).where(eq(contactMethods.partyId, f.client.partyId)),
    ).toEqual(beforeContacts);
    expect(await t.db.select().from(externalActions)).toEqual(beforeActions);
    expect(await dispatchMessage(t.db, provider, other.action.id)).toBe("acknowledged");
    expect(provider.sent).toHaveLength(1);
    await expect(consumeEmailLink(t.db, other.token)).resolves.toMatchObject({
      session: { account: { id: f.other.id } },
    });
  });

  it.each(["revoked", "expired", "consumed", "suspended", "address_changed"])(
    "%s credential email never reaches the provider",
    async (mode) => {
      const f = await syntheticErasureFixture(t.db),
        link = await queuedLink(f.client.email);
      if (mode === "revoked")
        await t.db
          .update(emailSignInTokens)
          .set({ revokedAt: new Date() })
          .where(eq(emailSignInTokens.id, link.credential.id));
      if (mode === "expired")
        await t.db
          .update(emailSignInTokens)
          .set({ expiresAt: new Date(Date.now() - 1) })
          .where(eq(emailSignInTokens.id, link.credential.id));
      if (mode === "consumed")
        await t.db
          .update(emailSignInTokens)
          .set({ consumedAt: new Date() })
          .where(eq(emailSignInTokens.id, link.credential.id));
      if (mode === "suspended")
        await t.db
          .update(principals)
          .set({ status: "suspended" })
          .where(eq(principals.id, f.client.id));
      if (mode === "address_changed")
        await t.db
          .update(principals)
          .set({ email: `changed-${f.client.id}@example.test` })
          .where(eq(principals.id, f.client.id));
      const provider = new TestMessageProvider();
      expect(await dispatchMessage(t.db, provider, link.action.id)).toBe("cancelled");
      expect(provider.sent).toEqual([]);
      expect(await actionOf(link.action.id)).toMatchObject({
        state: "cancelled",
        attempts: 0,
        lastErrorCode: "auth_email_link_ineligible",
        secretPayload: null,
      });
    },
  );

  it("rechecks a revocation that commits after the claim and before provider handoff", async () => {
    const f = await syntheticErasureFixture(t.db),
      link = await queuedLink(f.client.email);
    const provider = new TestMessageProvider(),
      original = t.db.transaction.bind(t.db);
    let calls = 0;
    const intercepted = vi
      .spyOn(t.db, "transaction")
      .mockImplementation(async (callback, options) => {
        calls++;
        if (calls === 2)
          await t.db
            .update(emailSignInTokens)
            .set({ revokedAt: new Date() })
            .where(eq(emailSignInTokens.id, link.credential.id));
        return original(callback, options);
      });
    try {
      expect(await dispatchMessage(t.db, provider, link.action.id)).toBe("cancelled");
    } finally {
      intercepted.mockRestore();
    }
    expect(provider.sent).toEqual([]);
    expect(await actionOf(link.action.id)).toMatchObject({
      state: "cancelled",
      attempts: 1,
      secretPayload: null,
      lastErrorCode: "auth_email_link_ineligible",
    });
  });

  it("allows a valid legacy token-bound row once and retains unknown outcomes without replay", async () => {
    const f = await syntheticErasureFixture(t.db),
      link = await queuedLink(f.client.email);
    await t.db
      .update(externalActions)
      .set({ subjectType: null, subjectId: null })
      .where(eq(externalActions.id, link.action.id));
    const provider = new TestMessageProvider();
    provider.script("throw");
    expect(await dispatchMessage(t.db, provider, link.action.id)).toBe("outcome_unknown");
    await t.db
      .update(emailSignInTokens)
      .set({ revokedAt: new Date() })
      .where(eq(emailSignInTokens.id, link.credential.id));
    expect(await dispatchMessage(t.db, provider, link.action.id)).toBe("outcome_unknown");
    expect(provider.sent).toHaveLength(1);
    expect(await actionOf(link.action.id)).toMatchObject({
      secretPayload: null,
      attempts: 1,
      effectKey: link.action.effectKey,
    });
  });

  it("keeps a stable definite-rejection key but cancels its retry when the credential becomes ineligible", async () => {
    const f = await syntheticErasureFixture(t.db),
      link = await queuedLink(f.client.email),
      provider = new TestMessageProvider();
    provider.script({ status: "rejected", code: "throttled", retryable: true });
    expect(await dispatchMessage(t.db, provider, link.action.id)).toBe("queued");
    expect((await actionOf(link.action.id))?.secretPayload).not.toBeNull();
    await t.db
      .update(principals)
      .set({ status: "suspended" })
      .where(eq(principals.id, f.client.id));
    expect(await dispatchMessage(t.db, provider, link.action.id)).toBe("cancelled");
    expect(provider.sent).toHaveLength(1);
    expect(await actionOf(link.action.id)).toMatchObject({
      secretPayload: null,
      attempts: 1,
      effectKey: link.action.effectKey,
    });
  });
});
