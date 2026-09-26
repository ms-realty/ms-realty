// Staff bootstrap CLI (spec §03, §23.3). DATABASE_URL names the target database.
//
//   npm run staff:create -- --email <email> --name "<display name>" --role <preset> [--role ...]
//
// Roles: assigned_broker, coordinator, content_editor, translation_reviewer,
// publishing_approver, manager (comma-separated or repeated). Idempotent by email.
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { isAppError } from "../errors";
import { createStaffAccount, isStaffRole, staffRoles } from "./accounts";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", multiple: true },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const roles = (values.role ?? []).flatMap((r) => r.split(",")).map((r) => r.trim());
if (!values.email || !values.name || roles.length === 0) {
  fail(
    `Usage: npm run staff:create -- --email <email> --name <name> --role <${staffRoles.join("|")}>`,
  );
}
const unknown = roles.filter((r) => !isStaffRole(r));
if (unknown.length) fail(`Unknown staff role(s): ${unknown.join(", ")}`);
const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is required.");

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  const result = await createStaffAccount(drizzle(client, { schema }), {
    email: values.email,
    displayName: values.name,
    roles: roles.filter(isStaffRole),
    actor: { kind: "system", id: "cli.staff-create" },
    reason: "Bootstrap via npm run staff:create",
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  process.exitCode = 1;
  if (isAppError(error)) console.error(error.code, error.fieldErrors ?? "");
  else throw error;
} finally {
  await client.end();
}
