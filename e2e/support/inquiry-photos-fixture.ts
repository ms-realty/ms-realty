// M067/F10: disposable receipt fixtures and an explicit invocation of the production scan
// handler. No clean scan, byte-access grant or publication decision is fabricated.
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";
import * as schema from "../../src/db/schema";
import { staffPasskeyMinimum } from "../../src/server/auth/passkeys";
import { createSession } from "../../src/server/auth/sessions";
import { fileServices } from "../../src/server/files/config";
import { digestOf } from "../../src/server/files/storage";
import { processInquiryPhoto, receiveInquiryPhoto } from "../../src/server/inquiries/attachments";
import {
  issueSubmissionKey,
  newReceiptSession,
  submitInquiry,
} from "../../src/server/inquiries/intake";
import { JobQueue } from "../../src/server/jobs/queue";
import { createClient, createStaff } from "../../src/server/testing";

export interface InquiryPhotosFixture {
  inquiryId: string;
  receiptId: string;
  receiptSession: string;
  staffId: string;
  staffToken: string;
  clientToken: string;
  bytes: string;
  pendingId?: string;
  pendingOperation?: string;
}

const url = process.env.E2E_DATABASE_URL;
if (
  !url ||
  !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname) ||
  process.env.DATABASE_URL !== url
)
  throw new Error("Inquiry photo fixtures require the generated disposable browser database");
const runId = new URL(url).pathname.slice("/msr_e2e_".length);
if (
  !process.env.E2E_FILE_STORAGE_ROOT ||
  resolve(process.env.E2E_FILE_STORAGE_ROOT) !==
    resolve(join(tmpdir(), `msr-e2e-files-${runId}`)) ||
  process.env.FILE_STORAGE_ROOT !== process.env.E2E_FILE_STORAGE_ROOT ||
  process.env.FILE_STORAGE !== "local" ||
  process.env.FILE_SCAN_MODE !== "clamav" ||
  process.env.E2E_REAL_SCAN !== "1"
)
  throw new Error("Inquiry photo fixtures require the run's local storage and real ClamAV");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
let queue: JobQueue | undefined;
try {
  const [command = "seed", id] = process.argv.slice(2);
  if (command === "scan") {
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("A synthetic photo UUID is required");
    const [before] = await db
      .select()
      .from(schema.inquiryAttachments)
      .where(eq(schema.inquiryAttachments.id, id));
    if (before?.state !== "sealed" || !["pending", "clean"].includes(before.scan))
      throw new Error("Photo is not sealed or its existing failed scan must be investigated");
    // The browser harness may already have dispatched this job. The same production
    // handler verifies the sealed bytes and is idempotent against that real scan evidence.
    const result = await processInquiryPhoto(
      db,
      fileServices(),
      { kind: "system", id: "file-scanner" },
      id,
    );
    if (result.state !== "clean") throw new Error("The real inquiry-photo scan did not pass");
    console.log(JSON.stringify(result));
  } else if (command === "seed" || command === "cap") {
    const receiptId = issueSubmissionKey(),
      receiptSession = newReceiptSession();
    await submitInquiry(
      db,
      {
        submissionKey: receiptId,
        purpose: "seller_consultation",
        locale: "en",
        contact: { kind: "email", value: `photo-${randomUUID()}@example.test` },
        ownerInput: { version: 1, provenance: "self_declared", transaction: "sale" },
        privacyNotice: true,
      },
      { ip: `synthetic-photo-${randomUUID()}`, receiptSession },
    );
    const [inquiry] = await db
      .select()
      .from(schema.inquiries)
      .where(eq(schema.inquiries.submissionKey, receiptId));
    if (!inquiry) throw new Error("Missing synthetic owner inquiry");
    const staff = await createStaff(db, {
      roles: [],
      grants: [{ capability: "inquiry.read", recordType: "inquiry", recordId: inquiry.id }],
    });
    await db.insert(schema.passkeys).values(
      Array.from({ length: staffPasskeyMinimum }, () => ({
        principalId: staff.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice" as const,
        backedUp: false,
      })),
    );
    const staffSession = await createSession(db, { kind: "staff", id: staff.id });
    const client = await createClient(db);
    const clientSession = await createSession(db, { kind: "client", id: client.id });
    const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: "blue" } })
      .png()
      .toBuffer();
    const fixture: InquiryPhotosFixture = {
      inquiryId: inquiry.id,
      receiptId,
      receiptSession,
      staffId: staff.id,
      staffToken: staffSession.token,
      clientToken: clientSession.token,
      bytes: bytes.toString("base64"),
    };
    if (command === "cap") {
      queue = new JobQueue(url, { producer: true });
      await queue.start();
      for (let index = 0; index < 2; index++)
        await receiveInquiryPhoto(db, fileServices(), queue, {
          submissionKey: receiptId,
          receiptSession,
          operationId: randomUUID(),
          bytes,
          sharedForInquiry: true,
        });
      // A third interrupted reservation consumes the last slot. It has no sealed bytes,
      // scan attestation or queued scan; the browser must resume this exact operation.
      const pendingId = randomUUID(),
        pendingOperation = randomUUID(),
        sha256 = digestOf(bytes);
      await db.insert(schema.inquiryAttachments).values({
        id: pendingId,
        inquiryId: inquiry.id,
        operationId: pendingOperation,
        stagingKey: `staging/inquiry-photos/${inquiry.id}/${pendingId}`,
        sealedKey: `sealed/inquiry-photos/${inquiry.id}/${pendingId}/${sha256}`,
        sha256,
        byteSize: bytes.length,
        contentType: "image/png",
        width: 12,
        height: 8,
      });
      Object.assign(fixture, { pendingId, pendingOperation });
    }
    console.log(JSON.stringify(fixture));
  } else throw new Error("Unknown inquiry-photo fixture command");
} finally {
  await queue?.stop();
  await connection.end();
}
