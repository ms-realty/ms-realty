// Disposable browser fixture: a real commit followed by an uncertain acknowledgement.
// This changes only the operation ledger in the synthetic database, never production transport.
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "@/db/schema";
import { offsetInputValue } from "@/domain/time";
import { agencyTimeZone } from "@/i18n/config";
import { readSession } from "@/server/auth/sessions";
import { formInstant, readTimeFormValues } from "@/server/forms/time";
import { reviseProposal } from "@/server/proposals/service";
import { amountToMinor } from "@/server/proposals/terms";
import { readFormEnvelope } from "@/ui/form/server";
import { proposalFields, proposalScope } from "../contract";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Counteroffer recovery requires a disposable browser database.");
const input = z
  .object({
    token: z.string(),
    id: z.uuid(),
    entries: z.array(z.tuple([z.string(), z.string()])),
  })
  .parse(JSON.parse(readFileSync(0, "utf8")));
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const session = await readSession(db, input.token);
  if (!session) throw new Error("Missing synthetic client session");
  const data = new FormData();
  for (const [name, value] of input.entries) data.append(name, value);
  const envelope = readFormEnvelope(data, proposalScope("revise", input.id));
  if (!envelope?.expectedRevision) throw new Error("Missing signed counteroffer identity");
  const values = readTimeFormValues(data, proposalFields.revise);
  if (values.currency !== "EUR" || values.period !== "total")
    throw new Error("This recovery fixture requires the synthetic EUR total-price offer");
  const lines = (value = "") =>
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  const result = await reviseProposal(db, session, {
    id: input.id,
    operationId: envelope.operationId,
    expectedVersion: envelope.expectedRevision,
    revisionId: values.revisionId ?? "",
    clientPartyId: values.clientPartyId ?? "",
    additionalPartyIds: lines(values.additionalPartyIds),
    amountMinor: amountToMinor(values.amount ?? "", "en", "EUR"),
    currency: "EUR",
    period: "total",
    paymentBasis: values.paymentBasis ?? "",
    conditions: lines(values.conditions),
    inclusions: lines(values.inclusions),
    deadline: offsetInputValue(formInstant(values, "deadline"), agencyTimeZone),
    reason: values.reason ?? "",
  });
  // Preserve the real command outcome for later explicit reconciliation. A native request
  // for this same key now returns unknown while the page reads the newly committed revision.
  await db
    .update(schema.operations)
    .set({ status: "outcome_unknown" })
    .where(eq(schema.operations.id, result.operationId));
  console.log(JSON.stringify({ operationId: result.operationId }));
} finally {
  await connection.end();
}
