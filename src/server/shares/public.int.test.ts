import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listings, publicShares } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession, revokeSession } from "../auth/sessions";
import { parseEnv } from "../config/env";
import { sha256Hex } from "../crypto";
import { withdrawPublication } from "../publication/commands";
import { createListingFixture, newOperationId, publishForTest } from "../publication/testing";
import { createClient, createStaff } from "../testing";
import {
  createPublicShare,
  listCreatorShares,
  newShareCreatorSession,
  readCreatorShare,
  readPublicShare,
  revokePublicShare,
  revokePublicShareAsOperator,
  shareCreatorSetCookie,
} from "./public";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe("P09 public shortlist share", () => {
  it("issues a host-only creator cookie, separate from the recipient token", () => {
    const env = parseEnv({
      NODE_ENV: "test",
      APP_ORIGIN: "https://www.example.test",
      PUBLIC_ORIGIN: "https://www.example.test",
      CLIENT_ORIGIN: "https://my.example.test",
      STAFF_ORIGIN: "https://app.example.test",
    });
    const token = newShareCreatorSession();
    const cookie = shareCreatorSetCookie(env, token);
    expect(cookie).toContain(`__Host-msr_share_creator=${token}`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
  });

  it("binds anonymous management to its original cookie while recipients see only current public facts", async () => {
    const publisher = await createStaff(t.db, {
      roles: ["content_editor", "publishing_approver"],
    });
    const first = await createListingFixture(t.db, { reviewerId: publisher.id });
    const second = await createListingFixture(t.db, { reviewerId: publisher.id });
    await publishForTest(t.db, publisher.actor, first);
    await publishForTest(t.db, publisher.actor, second);
    const owner = { kind: "anonymous" as const, sessionToken: newShareCreatorSession() };
    const stranger = { kind: "anonymous" as const, sessionToken: newShareCreatorSession() };
    const source = { clientIp: randomUUID() };
    const input = {
      operationId: randomUUID(),
      locale: "bg" as const,
      references: [first.reference, second.reference],
      reviewed: true as const,
    };
    const created = await createPublicShare(t.db, owner, input, source);
    expect(created.replayed).toBe(false);
    expect(created.share.status).toBe("active");
    expect(created.share.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [stored] = await t.db
      .select()
      .from(publicShares)
      .where(eq(publicShares.id, created.share.id));
    if (!stored?.expiresAt) throw new Error("Share was not saved with its expiry");
    expect(stored.tokenHash).toBe(sha256Hex(created.share.token));
    expect(stored.creatorSessionHash).not.toBe(owner.sessionToken);
    expect(stored.creatorPrincipalId).toBeNull();
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(7 * 86_400_000);
    expect((await createPublicShare(t.db, owner, input, source)).share).toEqual(created.share);
    await expect(
      createPublicShare(t.db, owner, { ...input, operationId: randomUUID(), locale: "en" }, source),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      createPublicShare(t.db, owner, { ...input, references: [first.reference] }, source),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(readCreatorShare(t.db, stranger, created.share.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      revokePublicShare(t.db, stranger, { id: created.share.id, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect((await listCreatorShares(t.db, stranger)).items).toEqual([]);
    expect((await listCreatorShares(t.db, owner)).items[0]?.token).toBe(created.share.token);

    const viewed = await readPublicShare(t.db, created.share.token, "bg");
    expect(viewed.status).toBe("ready");
    if (viewed.status !== "ready") throw new Error("Expected an active public share");
    expect(viewed.items.map((item) => item.status)).toEqual(["public", "public"]);
    expect(JSON.stringify(viewed)).not.toContain("Fixture street 1 (private)");
    expect(JSON.stringify(viewed)).not.toContain("creatorSessionHash");
    expect(JSON.stringify(viewed)).not.toContain(created.share.token);
    const untranslated = await readPublicShare(t.db, created.share.token, "en");
    expect(untranslated.status).toBe("ready");
    if (untranslated.status !== "ready") throw new Error("Expected an active public share");
    expect(untranslated.items.map((item) => item.status)).toEqual(["unavailable", "unavailable"]);

    await withdrawPublication(t.db, {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: second.reference,
      reason: "The owner withdrew this listing",
    });
    const changed = await readPublicShare(t.db, created.share.token, "bg");
    expect(changed.status).toBe("ready");
    if (changed.status !== "ready") throw new Error("Expected a current public share");
    expect(changed.items.map((item) => item.status)).toEqual(["public", "unavailable"]);
    expect(changed.items[1]).toEqual({ status: "unavailable", reference: second.reference });
    await t.db
      .update(listings)
      .set({ commercialState: "sold" })
      .where(eq(listings.id, first.listingId));
    const closed = await readPublicShare(t.db, created.share.token, "bg");
    expect(closed.status).toBe("ready");
    if (closed.status !== "ready") throw new Error("Expected a current public share");
    expect(closed.items).toEqual([
      { status: "unavailable", reference: first.reference },
      { status: "unavailable", reference: second.reference },
    ]);
    await expect(
      createPublicShare(
        t.db,
        owner,
        { ...input, operationId: randomUUID(), references: [first.reference] },
        source,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(
      await readPublicShare(t.db, created.share.token, "bg", new Date(Date.now() + 8 * 86_400_000)),
    ).toEqual({ status: "expired" });

    const revoke = { id: created.share.id, operationId: randomUUID() };
    const revoked = await revokePublicShare(t.db, owner, revoke);
    expect((await revokePublicShare(t.db, owner, revoke)).outcome).toEqual(revoked.outcome);
    expect(await readPublicShare(t.db, created.share.token, "bg")).toEqual({ status: "revoked" });
    expect((await readCreatorShare(t.db, owner, created.share.id)).status).toBe("revoked");
  });

  it("binds account management to a live principal and allows an audited privacy-operator revoke", async () => {
    const publisher = await createStaff(t.db, {
      roles: ["content_editor", "publishing_approver"],
    });
    const listing = await createListingFixture(t.db, { reviewerId: publisher.id });
    await publishForTest(t.db, publisher.actor, listing);
    const client = await createClient(t.db);
    const ownerSession = await createSession(t.db, { kind: "client", id: client.id });
    const other = await createClient(t.db);
    const otherSession = await createSession(t.db, { kind: "client", id: other.id });
    const owner = { kind: "account" as const, session: ownerSession.session };
    const staffSession = await createSession(t.db, { kind: "staff", id: publisher.id });
    await expect(
      createPublicShare(
        t.db,
        { kind: "account", session: staffSession.session },
        {
          operationId: randomUUID(),
          locale: "bg",
          references: [listing.reference],
          reviewed: true,
        },
        { clientIp: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    const created = await createPublicShare(
      t.db,
      owner,
      {
        operationId: randomUUID(),
        locale: "bg",
        references: [listing.reference],
        reviewed: true,
      },
      { clientIp: randomUUID() },
    );
    expect((await listCreatorShares(t.db, owner)).items[0]?.id).toBe(created.share.id);
    await expect(
      readCreatorShare(t.db, { kind: "account", session: otherSession.session }, created.share.id),
    ).rejects.toMatchObject({ code: "not_found" });
    const operator = await createStaff(t.db, { grants: [{ capability: "privacy.manage" }] });
    const operatorSession = await createSession(t.db, { kind: "staff", id: operator.id });
    const revoked = await revokePublicShareAsOperator(t.db, operatorSession.session, {
      id: created.share.id,
      operationId: randomUUID(),
    });
    expect(revoked.outcome.id).toBe(created.share.id);
    expect(await readPublicShare(t.db, created.share.token, "bg")).toEqual({ status: "revoked" });
    await revokeSession(t.db, ownerSession.token);
    await expect(listCreatorShares(t.db, owner)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});
