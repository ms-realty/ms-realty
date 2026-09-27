// Recorded human publication steps for one listing (spec §07.4, F24). DATABASE_URL names the
// target database; --staff names the person taking every step, who needs listing.edit,
// listing.review_facts and publication.release (e.g. content_editor + publishing_approver).
//
//   npm run listings:publish -- --reference MS-00242 --staff <email> [--confirm price,bedrooms]
//                               [--note "..."]
//   npm run listings:publish -- --reference MS-00242 --staff <email> --withdraw --reason "..."
//
// Without --confirm nothing is confirmed on the operator's behalf: missing or unconfirmed
// facts are printed and the command stops. Each step is idempotent, so a rerun converges.
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import type { MissingFact } from "@/domain/listing-readiness";
import type { Executor } from "../db";
import { isAppError } from "../errors";
import { findActiveStaff } from "../staff/accounts";
import {
  approveListingVersion,
  confirmListingFacts,
  getListingReadiness,
  type ListingReadiness,
  publishListing,
  submitListingForReview,
  withdrawListingPublication,
} from "./publication";

const { values } = parseArgs({
  options: {
    reference: { type: "string" },
    staff: { type: "string" },
    confirm: { type: "string" },
    note: { type: "string" },
    withdraw: { type: "boolean", default: false },
    reason: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!values.reference || !values.staff) {
  fail("Usage: npm run listings:publish -- --reference MS-00000 --staff <email> [--confirm keys]");
}
if (values.withdraw && !values.reason) fail("--withdraw needs --reason.");
const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is required.");

const hints: Record<MissingFact["problem"], string> = {
  absent: "nothing recorded; record a sourced value in the listing editor (S4)",
  undecided: "not known; record a sourced value in the listing editor (S4)",
  unreviewed: "imported value not yet confirmed by staff; check it, then rerun with --confirm",
};

function describe(ready: ListingReadiness): void {
  console.log(
    `${ready.reference}: editorial ${ready.editorialState}, distribution ${ready.distributionState}, commercial ${ready.commercialState}, version ${ready.currentVersionNumber} (published ${ready.publishedVersionNumber ?? "none"})`,
  );
  for (const f of ready.facts.filter((f) => !f.key.startsWith("feature."))) {
    const value = f.state === "known" ? ` ${JSON.stringify(f.value)}` : "";
    console.log(
      `  ${f.key}: ${f.state}${value} [${f.sourceClass}${f.reviewed ? ", confirmed" : ""}]`,
    );
  }
}

function blockers(ready: ListingReadiness): string[] {
  return [
    ...ready.missingFacts.map(
      (m) => `fact ${m.key} (${m.state ?? "absent"}): ${m.problem} — ${hints[m.problem]}`,
    ),
    ...(ready.sourceTextReviewed
      ? []
      : ["text.bg: the Bulgarian text is an unreviewed draft; it needs editorial review (S4)"]),
  ];
}

async function run(db: Executor, actor: Actor, reference: string): Promise<void> {
  const note = values.note ? { note: values.note } : {};
  const key = (step: string, version: number) => `cli:${reference}:${step}:${version}`;
  let ready = await getListingReadiness(db, actor, reference);
  describe(ready);

  if (values.withdraw) {
    const { outcome } = await withdrawListingPublication(db, {
      actor,
      reference,
      operationId: key("withdraw", ready.version),
      expectedVersion: ready.version,
      reason: values.reason ?? "",
      ...note,
    });
    console.log(JSON.stringify(outcome, null, 2));
    return;
  }

  const confirm = values.confirm?.split(",").map((k) => k.trim()) ?? [];
  if (confirm.length) {
    const { outcome } = await confirmListingFacts(db, {
      actor,
      reference,
      operationId: key(`confirm:${confirm.sort().join("+")}`, ready.version),
      expectedVersion: ready.version,
      fieldKeys: confirm,
      ...note,
    });
    console.log(`Confirmed: ${outcome.confirmed.join(", ") || "nothing new"}`);
    ready = await getListingReadiness(db, actor, reference);
  }

  const published =
    ready.publishedVersionNumber === ready.currentVersionNumber &&
    ["published", "partially_published"].includes(ready.distributionState);
  if (published) {
    console.log(`${reference} version ${ready.currentVersionNumber} is already published.`);
    return;
  }
  if (["draft", "needs_facts", "changes_requested"].includes(ready.editorialState)) {
    const open = blockers(ready);
    if (open.length) {
      console.error(`Refused: ${reference} cannot enter review. Missing:`);
      for (const line of open) console.error(`  - ${line}`);
      process.exitCode = 3;
      return;
    }
    await submitListingForReview(db, {
      actor,
      reference,
      operationId: key("submit", ready.version),
      expectedVersion: ready.version,
      ...note,
    });
    console.log("Submitted for review.");
    ready = await getListingReadiness(db, actor, reference);
  }
  if (ready.editorialState === "in_review") {
    if (!ready.contentHash) fail(`${reference} has no current version to approve.`);
    const { outcome } = await approveListingVersion(db, {
      actor,
      reference,
      operationId: key("approve", ready.version),
      expectedVersion: ready.version,
      versionNumber: ready.currentVersionNumber,
      contentHash: ready.contentHash,
      ...note,
    });
    console.log(`Approved version ${outcome.versionNumber} (${outcome.contentHash}).`);
    ready = await getListingReadiness(db, actor, reference);
  }
  const { outcome } = await publishListing(db, {
    actor,
    reference,
    operationId: key("publish", ready.version),
    expectedVersion: ready.version,
    versionNumber: ready.currentVersionNumber,
    ...note,
  });
  console.log(JSON.stringify(outcome, null, 2));
}

const client = postgres(url, { max: 2, onnotice: () => {} });
try {
  const db = drizzle(client, { schema });
  const staff = await findActiveStaff(db, values.staff);
  if (!staff) fail(`No active staff account for ${values.staff}.`);
  await run(db, staff.actor, values.reference.trim().toUpperCase());
} catch (error) {
  process.exitCode = 1;
  if (!isAppError(error)) throw error;
  console.error(`Refused: ${error.code}`, JSON.stringify(error.fieldErrors ?? {}));
} finally {
  await client.end();
}
