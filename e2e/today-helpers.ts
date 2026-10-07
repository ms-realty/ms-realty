// O01 browser cases that seed straight into the run's disposable database (ported from
// Codex's codex/msr-o01-today-binding cases). Synthetic qualification, never launch evidence.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { origins } from "./hosts";

export function todayDatabase() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
    throw new Error("Today browser cases require the generated disposable database.");
  const connection = postgres(url, { max: 2, onnotice: () => {} });
  return { connection, db: drizzle(connection, { schema }) };
}
type Db = ReturnType<typeof todayDatabase>["db"];

/** A staff member with two passkeys and a live session cookie, and no grants at all. */
export async function staffSession(db: Db, context: BrowserContext) {
  const marker = randomUUID();
  const [party] = await db
    .insert(schema.parties)
    .values({ kind: "person", displayName: "Today broker" })
    .returning();
  if (!party) throw new Error("Missing test party");
  const [principal] = await db
    .insert(schema.principals)
    .values({
      partyId: party.id,
      kind: "staff",
      issuer: "urn:ms-realty:staff",
      subject: marker,
      email: `${marker}@example.test`,
      displayName: "Today broker",
    })
    .returning();
  if (!principal) throw new Error("Missing test staff");
  await db.insert(schema.staffMemberships).values({ principalId: principal.id });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: principal.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    principalKind: "staff",
    principalId: principal.id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 3600000),
    lastSeenAt: new Date(),
    reverifiedAt: new Date(),
  });
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  return principal;
}

export const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
