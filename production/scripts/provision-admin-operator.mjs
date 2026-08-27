// Provisions an operator account in the Payload `admins` collection.
//
// Why this exists. Operator accounts are normally created from /admin/team by
// somebody who is already signed in, which is the right rule everywhere except
// at the very start: the first account has nobody to create it, and an agency
// that loses access to every account has no way back in. Both cases need a path
// that runs beside the database rather than through the signed-in UI.
//
// This is deliberately a local command, not an endpoint. It needs the
// production DSN and the Payload secret, which are already root-equivalent
// access to the same data - so it grants nothing that whoever runs it did not
// already hold - and it writes with overrideAccess because there is no session
// to check.
//
// The password is read from MS_REALTY_NEW_OPERATOR_PASSWORD and never from an
// argument, so it does not land in shell history, in `ps` output, or in this
// file. Nothing here prints it back.

import { PAYLOAD_ADMIN_ROLES } from "../lib/payload-admin-auth.mjs";
import { loadPayloadCmsImportRuntime } from "../lib/payload-cms-import.mjs";

const COLLECTION = "admins";
const MIN_PASSWORD_LENGTH = 12;
const PASSWORD_ENV = "MS_REALTY_NEW_OPERATOR_PASSWORD";

function parseArgs(argv = process.argv.slice(2)) {
  const options = { list: false, help: false, upsert: false, email: "", role: "admin", name: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") options.list = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--upsert") options.upsert = true;
    else if (arg === "--email") options.email = String(argv[++index] || "").trim().toLowerCase();
    else if (arg === "--role") options.role = String(argv[++index] || "").trim().toLowerCase();
    else if (arg === "--name") options.name = String(argv[++index] || "").trim();
    else if (arg.startsWith("--password")) {
      throw new Error(`Pass the password through the ${PASSWORD_ENV} environment variable, never as an argument`);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log("Usage:");
  console.log("  node production/scripts/provision-admin-operator.mjs --list");
  console.log("  node production/scripts/provision-admin-operator.mjs --email <address> [--role admin] [--name \"Full Name\"] [--upsert]");
  console.log("");
  console.log("Requires DATABASE_URL and PAYLOAD_SECRET in the environment.");
  console.log(`The password is read from ${PASSWORD_ENV}; it is never accepted as an argument and never printed.`);
  console.log(`Roles: ${PAYLOAD_ADMIN_ROLES.join(", ")}. Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  console.log("--upsert explicitly replaces an existing account password, role and workspace scope, then requires a password change.");
}

async function findByEmail(payload, email) {
  const result = await payload.find({
    collection: COLLECTION,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { email: { equals: email } },
  });
  return (result?.docs || [])[0] || null;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return 0;
  }

  // Everything that can be judged from the request alone is judged before a
  // connection to production is opened, so a typo answers with the typo rather
  // than with a database error - and never reaches the database at all.
  if (!options.list) {
    if (!options.email) {
      printHelp();
      console.error("An --email is required.");
      return 2;
    }
    if (!PAYLOAD_ADMIN_ROLES.includes(options.role)) {
      console.error(`Role must be one of: ${PAYLOAD_ADMIN_ROLES.join(", ")}`);
      return 2;
    }
    const candidate = process.env[PASSWORD_ENV] || "";
    if (!candidate.trim()) {
      console.error(`Set ${PASSWORD_ENV} to the password for this account, then run the command again.`);
      return 2;
    }
    if (candidate.length < MIN_PASSWORD_LENGTH) {
      console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return 2;
    }
  }

  const payload = await loadPayloadCmsImportRuntime();
  try {
    if (options.list) {
      const result = await payload.find({
        collection: COLLECTION,
        depth: 0,
        limit: 0,
        overrideAccess: true,
        pagination: false,
        select: { email: true, name: true, role: true, workspace_ids: true, password_change_required: true },
        sort: "email",
      });
      const operators = (result?.docs || []).map((row) => ({
        email: row.email,
        name: row.name || null,
        role: row.role,
        workspace_ids: row.workspace_ids || [],
        password_change_required: row.password_change_required === true,
      }));
      console.log(JSON.stringify({ kind: "admin_operators", total: operators.length, operators }, null, 2));
      // An empty collection is the bootstrap case and worth saying out loud,
      // because /admin/login cannot help anybody until one account exists.
      if (!operators.length) {
        console.error("No operator accounts exist yet, so nobody can sign in to /admin. Create the first one with --email.");
      }
      return 0;
    }

    const password = process.env[PASSWORD_ENV] || "";

    // Never silently reset a password on an account that already exists: that
    // would turn a typo in an email address into a takeover of somebody else's
    // account. The explicit flag is reserved for an authorized recovery/reset.
    const existing = await findByEmail(payload, options.email);
    if (existing && !options.upsert) {
      console.error(`${options.email} already has an operator account (role ${existing.role}); this command will not change it.`);
      console.error("Run again with --upsert only when an authorized password reset is intended.");
      return 1;
    }

    const data = {
      email: options.email,
      password,
      role: options.role,
      workspace_ids: [],
      password_change_required: true,
      sessions: [],
      loginAttempts: 0,
      lockUntil: null,
      ...(options.name || !existing ? { name: options.name } : {}),
    };
    const operator = existing
      ? await payload.update({
          collection: COLLECTION,
          id: existing.id,
          data,
          depth: 0,
          overrideAccess: true,
        })
      : await payload.create({
          collection: COLLECTION,
          data,
          depth: 0,
          overrideAccess: true,
        });

    console.log(
      JSON.stringify(
        {
          kind: existing ? "admin_operator_updated" : "admin_operator_created",
          email: operator.email,
          role: operator.role,
          name: operator.name || null,
          password_change_required: operator.password_change_required === true,
        },
        null,
        2,
      ),
    );
    return 0;
  } finally {
    await payload.destroy?.();
  }
}

let exitCode = 0;
try {
  exitCode = await main();
} catch (error) {
  console.error(`OPERATOR PROVISIONING FAILED: ${error.message}`);
  exitCode = 1;
}
process.exit(exitCode);
