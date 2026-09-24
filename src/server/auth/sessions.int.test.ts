import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sessions, staffAccounts } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { sha256Hex } from "../crypto";
import { createClient, createStaff } from "../testing";
import {
  createSession,
  readSession,
  requireFreshAuth,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  sessionPolicy,
} from "./sessions";

// Session lifecycle (AD7, F13).
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const at = (base: Date, ms: number) => new Date(base.getTime() + ms);

describe("sessions", () => {
  it("issues an opaque 32-byte token and stores only its SHA-256", async () => {
    const staff = await createStaff(t.db);
    const { token, session } = await createSession(t.db, { kind: "staff", id: staff.id });
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const [row] = await t.db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(row?.tokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect((await readSession(t.db, token))?.actor).toEqual(staff.actor);
    expect(await readSession(t.db, "not-a-token")).toBeNull();
  });

  it("ends after the idle window and at the absolute lifetime", async () => {
    const staff = await createStaff(t.db);
    const start = new Date();
    const { token } = await createSession(t.db, { kind: "staff", id: staff.id }, start);
    const { idleMs, absoluteMs } = sessionPolicy.staff;

    expect(await readSession(t.db, token, at(start, idleMs + 1))).toBeNull();

    // Kept alive by activity, it still ends at the absolute lifetime.
    const other = await createSession(t.db, { kind: "staff", id: staff.id }, start);
    let now = start;
    while (now.getTime() + idleMs / 2 < start.getTime() + absoluteMs) {
      now = at(now, idleMs / 2);
      expect(await readSession(t.db, other.token, now)).not.toBeNull();
    }
    expect(await readSession(t.db, other.token, at(start, absoluteMs))).toBeNull();
  });

  it("stops working for a suspended account", async () => {
    const staff = await createStaff(t.db);
    const { token } = await createSession(t.db, { kind: "staff", id: staff.id });
    await t.db
      .update(staffAccounts)
      .set({ status: "suspended" })
      .where(eq(staffAccounts.id, staff.id));
    expect(await readSession(t.db, token)).toBeNull();
  });

  it("rotates on privilege change: new token, old one dead, absolute expiry kept", async () => {
    const client = await createClient(t.db);
    const issued = await createSession(t.db, { kind: "client", id: client.id });
    const rotated = await rotateSession(t.db, issued.token);
    expect(rotated?.token).not.toBe(issued.token);
    expect(rotated?.session.expiresAt).toEqual(issued.session.expiresAt);
    expect(await readSession(t.db, issued.token)).toBeNull();
    expect((await readSession(t.db, rotated?.token ?? ""))?.actor).toEqual(client.actor);
    // The replaced token cannot be rotated again.
    expect(await rotateSession(t.db, issued.token)).toBeNull();
  });

  it("revokes one session on sign-out and every other session on revoke-all", async () => {
    const staff = await createStaff(t.db);
    const account = { kind: "staff" as const, id: staff.id };
    const a = await createSession(t.db, account);
    const b = await createSession(t.db, account);
    const c = await createSession(t.db, account);
    await revokeSession(t.db, a.token);
    expect(await readSession(t.db, a.token)).toBeNull();
    expect(await revokeAllSessions(t.db, account, { exceptSessionId: c.session.id })).toBe(1);
    expect(await readSession(t.db, b.token)).toBeNull();
    expect(await readSession(t.db, c.token)).not.toBeNull();
    expect(await revokeAllSessions(t.db, account)).toBe(1);
    expect(await readSession(t.db, c.token)).toBeNull();
  });

  it("requires a recent verification for high-risk actions; step-up refreshes it", async () => {
    const staff = await createStaff(t.db);
    const start = new Date();
    const issued = await createSession(t.db, { kind: "staff", id: staff.id }, start);
    expect(() => requireFreshAuth(issued.session, at(start, 60_000))).not.toThrow();
    const later = at(start, sessionPolicy.stepUpMaxAgeMs + 1);
    expect(() => requireFreshAuth(issued.session, later)).toThrow(
      expect.objectContaining({ code: "step_up_required" }),
    );
    const stepped = await rotateSession(t.db, issued.token, { now: later, reverified: true });
    expect(stepped?.session.reverifiedAt).toEqual(later);
    if (!stepped) throw new Error("rotation failed");
    expect(() => requireFreshAuth(stepped.session, later)).not.toThrow();
  });
});
