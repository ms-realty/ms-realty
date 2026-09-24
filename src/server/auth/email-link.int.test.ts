import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { emailSignInTokens, outboxMessages, rateLimitBuckets } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { dispatchMessage } from "../jobs/outbox";
import { TestMessageProvider } from "../jobs/provider";
import type { JobQueue } from "../jobs/queue";
import { createClient, createStaff } from "../testing";
import {
  consumeEmailLink,
  type EmailLinkJob,
  emailLinkTtlMs,
  inspectEmailLink,
  issueEmailLink,
  requestEmailLink,
  safeReturnPath,
} from "./email-link";
import { createSession, readSession } from "./sessions";

// F13 / A33 / A34: enumeration-safe, rate-limited, single-use and scanner-safe sign-in links.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
beforeEach(async () => {
  await t.db.delete(rateLimitBuckets);
});

/** Stands in for pg-boss: records each job so a test can run the worker by hand. */
let jobs: EmailLinkJob[] = [];
const queue: Pick<JobQueue, "send"> = {
  send: async (_name, data) => {
    jobs.push(data as EmailLinkJob);
    return null;
  },
};
beforeEach(() => {
  jobs = [];
});
const runJobs = async () => {
  for (const job of jobs.splice(0)) await issueEmailLink(t.db, job);
};

let ipCounter = 0;
const ip = () => {
  ipCounter += 1;
  return `192.0.2.${ipCounter}`;
};

/** Requests a link and returns the token from the outbox, as the email would carry it. */
async function linkFor(email: string, kind: "staff" | "client", returnTo?: string) {
  await requestEmailLink(t.db, { email, accountKind: kind, clientIp: ip(), returnTo, queue });
  await runJobs();
  const provider = new TestMessageProvider();
  const rows = await t.db.select().from(outboxMessages).where(eq(outboxMessages.state, "queued"));
  for (const row of rows) await dispatchMessage(t.db, provider, row.id);
  const sent = provider.sent.find((m) => m.recipient === email.toLowerCase());
  const url = new URL(String(sent?.secretParams?.url));
  return { url, token: url.searchParams.get("token") ?? "" };
}

describe("requesting a link", () => {
  it("answers identically for existing and unknown addresses, and sends only to accounts", async () => {
    const client = await createClient(t.db);
    const before = await t.db.select().from(emailSignInTokens);
    const tokensBefore = before.length;
    const known = await requestEmailLink(t.db, {
      email: client.email,
      accountKind: "client",
      clientIp: ip(),
      queue,
    });
    const unknown = await requestEmailLink(t.db, {
      email: "nobody@example.test",
      accountKind: "client",
      clientIp: ip(),
      queue,
    });
    // A staff lookup for a client address is just as silent.
    const wrongKind = await requestEmailLink(t.db, {
      email: client.email,
      accountKind: "staff",
      clientIp: ip(),
      queue,
    });
    expect(known).toEqual({ status: "sent" });
    expect(unknown).toEqual(known);
    expect(wrongKind).toEqual(known);
    // No timing oracle: the request path looks at no account and writes nothing account-
    // specific; each request enqueues exactly one job, whatever the address.
    expect(jobs.map((j) => j.email)).toEqual([client.email, "nobody@example.test", client.email]);
    expect(await t.db.select().from(emailSignInTokens)).toHaveLength(tokensBefore);
    await runJobs();
    const after = await t.db.select().from(emailSignInTokens);
    expect(after.length - before.length).toBe(1);
    const outbox = await t.db.select().from(outboxMessages);
    expect(outbox.map((m) => m.recipient)).not.toContain("nobody@example.test");
  });

  it("stores only the token hash and puts the link in a secret that dispatch clears", async () => {
    const client = await createClient(t.db);
    const { token } = await linkFor(client.email, "client");
    const rows = await t.db.select().from(emailSignInTokens);
    expect(JSON.stringify(rows)).not.toContain(token);
    const outbox = await t.db.select().from(outboxMessages);
    expect(JSON.stringify(outbox)).not.toContain(token);
  });

  it("is rate-limited per address from one IP regardless of whether the account exists", async () => {
    for (const email of ["limited@example.test", (await createClient(t.db)).email]) {
      const clientIp = ip();
      for (let i = 0; i < 5; i += 1) {
        await requestEmailLink(t.db, { email, accountKind: "client", clientIp, queue });
      }
      await expect(
        requestEmailLink(t.db, { email, accountKind: "client", clientIp, queue }),
      ).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: expect.any(Number) });
    }
  });

  it("someone draining an address from their IP does not lock its owner out", async () => {
    const client = await createClient(t.db);
    const attacker = ip();
    for (let i = 0; i < 5; i += 1) {
      await requestEmailLink(t.db, {
        email: client.email,
        accountKind: "client",
        clientIp: attacker,
        queue,
      });
    }
    await expect(
      requestEmailLink(t.db, { email: client.email, accountKind: "client", clientIp: ip(), queue }),
    ).resolves.toEqual({ status: "sent" });
  });

  it("is rate-limited per client IP across addresses", async () => {
    const shared = "198.51.100.7";
    for (let i = 0; i < 20; i += 1) {
      await requestEmailLink(t.db, {
        email: `spray${i}@example.test`,
        accountKind: "client",
        clientIp: shared,
        queue,
      });
    }
    await expect(
      requestEmailLink(t.db, {
        email: "spray99@example.test",
        accountKind: "client",
        clientIp: shared,
        queue,
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("rejects malformed addresses without revealing anything", async () => {
    await expect(
      requestEmailLink(t.db, {
        email: "not-an-email",
        accountKind: "client",
        clientIp: ip(),
        queue,
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
});

describe("using a link", () => {
  it("GET inspection never consumes; only the explicit POST does, exactly once", async () => {
    const client = await createClient(t.db);
    const { token } = await linkFor(client.email, "client", "/en/journey/cases?tab=messages");
    // A mail scanner or link preview opening the URL, repeatedly.
    for (let i = 0; i < 3; i += 1) {
      expect(await inspectEmailLink(t.db, token)).toMatchObject({
        state: "valid",
        returnTo: "/en/journey/cases?tab=messages",
      });
    }
    const signedIn = await consumeEmailLink(t.db, token);
    expect(signedIn.returnTo).toBe("/en/journey/cases?tab=messages");
    expect((await readSession(t.db, signedIn.token))?.actor).toEqual(client.actor);
    await expect(consumeEmailLink(t.db, token)).rejects.toMatchObject({ code: "link_consumed" });
    expect((await inspectEmailLink(t.db, token)).state).toBe("consumed");
  });

  it("expires after 15 minutes with a distinct recovery code", async () => {
    const staff = await createStaff(t.db);
    const { token } = await linkFor(staff.email, "staff");
    const later = new Date(Date.now() + emailLinkTtlMs + 1000);
    expect((await inspectEmailLink(t.db, token, later)).state).toBe("expired");
    await expect(consumeEmailLink(t.db, token, { now: later })).rejects.toMatchObject({
      code: "link_expired",
    });
  });

  it("rejects unknown tokens", async () => {
    expect((await inspectEmailLink(t.db, "forged")).state).toBe("invalid");
    await expect(consumeEmailLink(t.db, "forged")).rejects.toMatchObject({ code: "link_invalid" });
  });

  it("consumes once under concurrent confirmation", async () => {
    const client = await createClient(t.db);
    const { token } = await linkFor(client.email, "client");
    const results = await Promise.allSettled([
      consumeEmailLink(t.db, token),
      consumeEmailLink(t.db, token),
      consumeEmailLink(t.db, token),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("replaces a session the browser already had (no fixation)", async () => {
    const client = await createClient(t.db);
    const planted = await createSession(t.db, { kind: "client", id: client.id });
    const { token } = await linkFor(client.email, "client");
    const signedIn = await consumeEmailLink(t.db, token, { currentSessionToken: planted.token });
    expect(await readSession(t.db, planted.token)).toBeNull();
    expect(await readSession(t.db, signedIn.token)).not.toBeNull();
  });

  it("drops a cross-origin return path and keeps the link usable", async () => {
    const client = await createClient(t.db);
    const { token } = await linkFor(client.email, "client", "//evil.example/steal");
    expect((await consumeEmailLink(t.db, token)).returnTo).toBeNull();
  });
});

describe("safeReturnPath", () => {
  const origin = "https://makler-realty.com";
  it.each([
    ["/en/listings/MS-00100", "/en/listings/MS-00100"],
    ["/bg/search?city=sandanski#results", "/bg/search?city=sandanski#results"],
    ["/a/../b", "/b"],
  ])("keeps %s", (input, expected) => {
    expect(safeReturnPath(input, origin)).toBe(expected);
  });
  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "relative/path",
    "/\u0000x",
    "",
    null,
  ])("rejects %s", (input) => {
    expect(safeReturnPath(input, origin)).toBeNull();
  });
});
