// Disposable synthetic browser fixture only; no real privacy decision or provider effect.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "../auth/sessions";
import { LocalFileStorage } from "../files/storage";
import { createClient, createStaff } from "../testing";
import { privacyExportCoverageFixture } from "./export-coverage-testing";
import { reviewPrivacyRequest, submitPrivacyRequest } from "./requests";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  if (process.env.E2E_PRIVACY_COVERAGE === "1") {
    const storageRoot = process.env.E2E_FILE_STORAGE_ROOT;
    if (!storageRoot) throw new Error("Disposable browser storage required");
    const fixture = await privacyExportCoverageFixture(db, new LocalFileStorage(storageRoot));
    console.log(
      JSON.stringify({
        staffToken: fixture.staff.token,
        clientToken: fixture.client.token,
        requestId: fixture.requestId,
        exportId: fixture.exportId,
        documentVersionId: fixture.file.id,
      }),
    );
  } else {
    const operator = await createStaff(db, { grants: [{ capability: "privacy.manage" }] });
    await db.insert(schema.passkeys).values({
      principalId: operator.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
    const staff = await createSession(db, { kind: "staff", id: operator.id });
    const client = await createClient(db),
      session = await createSession(db, { kind: "client", id: client.id });
    const submitted = await submitPrivacyRequest(db, session.session, {
      operationId: randomUUID(),
      kind: "export",
      description: "Synthetic request for my own records; pending categories remain open",
      confirmed: true,
    });
    for (const [expectedVersion, to] of [
      [1, "verifying"],
      [2, "in_progress"],
    ] as const)
      await reviewPrivacyRequest(db, staff.session, {
        operationId: randomUUID(),
        id: submitted.outcome.id,
        expectedVersion,
        to,
        responsibleId: operator.id,
        policyReference: "Synthetic browser policy only",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        identityReviewed: true,
        legalHoldReason: "",
        legalHoldDisposition: "Synthetic reviewed boundary only",
        holdResolved: false,
        completionEvidence: "",
        rejectionReason: "",
        confirmed: true,
      });
    const [message] = await db
      .insert(schema.messages)
      .values({
        kind: "case_message",
        direction: "inbound",
        channel: "in_app",
        audience: "case_participants",
        authorKind: "client",
        authorId: client.id,
        body: "Synthetic own message selected for redaction",
        payloadDigest: "synthetic-fixture",
        recipients: [{ private: "OTHER-PARTY-PRIVATE-CANARY" }],
      })
      .returning();
    console.log(
      JSON.stringify({
        staffToken: staff.token,
        clientToken: session.token,
        requestId: submitted.outcome.id,
        messageId: message?.id,
      }),
    );
  }
} finally {
  await connection.end();
}
