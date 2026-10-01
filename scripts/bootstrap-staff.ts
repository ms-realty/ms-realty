// Offline operator entry point. Database credentials are required; no HTTP/bootstrap bypass
// is exposed. The invitation still requires confirm POST and two WebAuthn registrations.
import { closeSync, openSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { databaseTransport } from "../src/db/transport";
import { bootstrapManager } from "../src/server/auth/invitations";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    locale: { type: "string", default: "bg" },
    output: { type: "string" },
    "break-glass": { type: "boolean", default: false },
  },
});

if (!values.email || !values.name || !values.output || !isAbsolute(values.output)) {
  throw new Error(
    "Use --email <operator-email> --name <operator-name> --output <new-absolute-private-file> " +
      "[--locale bg|en|ru]. Existing staff requires deliberate --break-glass recovery.",
  );
}
if (values.locale !== "bg" && values.locale !== "en" && values.locale !== "ru") {
  throw new Error("Staff locale must be bg, en or ru.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const transport = databaseTransport(process.env.DATABASE_URL).postgresOptions;

// Reserve a new private file before touching the database; never print bearer links in logs.
const output = openSync(values.output, "wx", 0o600);
const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {}, ...transport });
try {
  const db = drizzle(client, { schema });
  const invitation = await db.transaction(async (tx) => {
    // Serialize bootstrap with every principal writer, including an ordinary invitation.
    await tx.execute(sql`lock table principals in share row exclusive mode`);
    const [existing] = await tx
      .select({ id: schema.principals.id })
      .from(schema.principals)
      .where(eq(schema.principals.kind, "staff"))
      .limit(1);
    if (existing && !values["break-glass"]) {
      throw new Error(
        "Staff already exists. Use staff invitation management or explicit --break-glass.",
      );
    }
    return bootstrapManager(tx, {
      email: values.email as string,
      displayName: values.name as string,
      locale: values.locale as "bg" | "en" | "ru",
      breakGlass: values["break-glass"],
    });
  });
  writeFileSync(output, `${JSON.stringify(invitation, null, 2)}\n`);
  console.log(`Private enrollment invitation written to ${values.output}.`);
  console.log("Open it on the configured staff host and register two passkeys. No email was sent.");
} finally {
  closeSync(output);
  await client.end();
}
