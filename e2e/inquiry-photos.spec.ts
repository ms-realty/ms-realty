// M067/F10/AT42: native and enhanced receipt photos use production upload/scan/download.
// Synthetic sessions and the interrupted reservation are fixtures, never launch evidence.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { inquiryPhotoCopy } from "../src/features/discovery/inquiry-photo-copy";
import { hostUrl, origins } from "./hosts";
import type { InquiryPhotosFixture } from "./support/inquiry-photos-fixture";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Inquiry photo browser tests require the generated disposable database");
const connection = postgres(databaseUrl, { max: 1 });
const db = drizzle(connection, { schema });
test.afterAll(async () => connection.end());
const labels = inquiryPhotoCopy("en");
const section = (page: Page) => page.getByRole("region", { name: labels.title, exact: true });
const photoForm = (page: Page) => section(page).locator('form[enctype="multipart/form-data"]');

function fixture(command: "seed" | "cap"): InquiryPhotosFixture;
function fixture(command: "scan", id: string): { id: string; state: "clean" };
function fixture(command: string, id?: string) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "e2e/support/inquiry-photos-fixture.ts",
        command,
        ...(id ? [id] : []),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          PUBLIC_ORIGIN: origins.public,
          CLIENT_ORIGIN: origins.client,
          STAFF_ORIGIN: origins.staff,
          FILE_STORAGE: "local",
          FILE_STORAGE_ROOT: process.env.E2E_FILE_STORAGE_ROOT,
          FILE_SCAN_MODE: "clamav",
          STAGING: "true",
        },
      },
    ).trim(),
  );
}

async function openReceipt(page: Page, f: InquiryPhotosFixture) {
  await page.context().addCookies([
    {
      name: "msr_receipt",
      value: f.receiptSession,
      url: origins.public,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "msr_staff_session",
      value: f.staffToken,
      url: origins.staff,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "msr_client_session",
      value: f.clientToken,
      url: origins.client,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  // Distinct synthetic IP per journey retains the real per-IP and per-receipt limiters.
  const ip = `2001:db8:${randomUUID().replaceAll("-", "").slice(0, 24).match(/.{4}/g)?.join(":")}`;
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": ip });
  await page.goto(
    hostUrl(
      "public",
      `/en/requests/${encodeURIComponent(f.receiptId)}${f.pendingOperation ? `?photoOperation=${f.pendingOperation}` : ""}`,
    ),
  );
  await expect(section(page)).toBeVisible();
  await expect(section(page)).toContainText(labels.lead);
  return ip;
}

async function choosePhoto(page: Page, f: InquiryPhotosFixture) {
  const form = photoForm(page);
  await form.locator('input[type="file"]').setInputFiles({
    name: "synthetic-owner.png",
    mimeType: "image/png",
    buffer: Buffer.from(f.bytes, "base64"),
  });
  await form.getByRole("checkbox", { name: labels.permission, exact: true }).check();
  return form.locator('[name="operationId"]').inputValue();
}

const photos = (f: InquiryPhotosFixture) =>
  db
    .select()
    .from(schema.inquiryAttachments)
    .where(eq(schema.inquiryAttachments.inquiryId, f.inquiryId))
    .orderBy(asc(schema.inquiryAttachments.createdAt), asc(schema.inquiryAttachments.id));
const identity = (rows: Awaited<ReturnType<typeof photos>>) =>
  rows.map(({ id, operationId, sha256 }) => ({ id, operationId, sha256 }));

for (const javaScriptEnabled of [false, true])
  test.describe(`M067 receipt photos JavaScript ${javaScriptEnabled ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled });

    test("F10/AT42 uploads exact private bytes and requires real scan, current inquiry grant and passkey assurance", async ({
      page,
      context,
    }) => {
      const f = fixture("seed");
      await openReceipt(page, f);
      const operationId = await choosePhoto(page, f);
      const accepted = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith(`/inquiries/${f.receiptId}/photos`) &&
          response.request().method() === "POST",
      );
      await photoForm(page).getByRole("button", { name: labels.attach, exact: true }).click();
      expect((await accepted).status()).toBe(303);
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === `/en/requests/${f.receiptId}` &&
          url.searchParams.get("photoOperation") === operationId,
      );
      const rows = await photos(f),
        photo = rows[0];
      expect(rows).toHaveLength(1);
      if (!photo) throw new Error("Production upload did not create an attachment");
      const digest = createHash("sha256").update(Buffer.from(f.bytes, "base64")).digest("hex");
      expect(photo).toMatchObject({
        operationId,
        state: "sealed",
        sha256: digest,
        byteSize: Buffer.from(f.bytes, "base64").length,
      });
      const audit = await db
        .select({ action: schema.auditEvents.action, payload: schema.auditEvents.payload })
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.recordId, photo.id));
      expect(audit).toContainEqual({
        action: "inquiry_photo.reserved",
        payload: expect.objectContaining({
          sha256: digest,
          operationId,
          publicationAllowed: false,
        }),
      });
      expect(audit).toContainEqual({
        action: "inquiry_photo.sealed",
        payload: expect.objectContaining({ sha256: digest }),
      });
      await expect(section(page).locator('a[href*="/api/inquiry-attachments/"]')).toHaveCount(0);
      await expect(section(page).locator("img")).toHaveCount(0);

      // No success branch for an unavailable daemon or fabricated clean fixture.
      expect(fixture("scan", photo.id)).toEqual({ id: photo.id, state: "clean" });
      const [scanned] = await photos(f);
      expect(scanned).toMatchObject({
        scan: "clean",
        scannedSha256: digest,
        scannerVersion: expect.stringMatching(/^ClamAV /),
        scannedAt: expect.any(Date),
      });
      await page.reload();
      await expect(section(page)).toContainText(labels.available_for_review);
      const path = `/api/inquiry-attachments/${photo.id}`;
      for (const host of ["public", "client"] as const) {
        const denied = await context.request.get(hostUrl(host, path));
        expect(denied.status()).toBe(404);
      }
      const served = await page.goto(hostUrl("staff", path));
      expect(served?.status()).toBe(200);
      expect(await served?.body()).toEqual(Buffer.from(f.bytes, "base64"));
      expect(served?.headers()).toMatchObject({
        "cache-control": "private, no-store",
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-origin",
      });
      const range = await context.request.get(hostUrl("staff", path), {
        headers: { range: "bytes=0-7" },
      });
      expect(range.status()).toBe(206);
      expect(await range.body()).toEqual(Buffer.from(f.bytes, "base64").subarray(0, 8));
      await db
        .delete(schema.grants)
        .where(
          and(eq(schema.grants.principalId, f.staffId), eq(schema.grants.recordId, f.inquiryId)),
        );
      expect((await context.request.get(hostUrl("staff", path))).status()).toBe(404);
      await db
        .update(schema.passkeys)
        .set({ revokedAt: new Date() })
        .where(eq(schema.passkeys.principalId, f.staffId));
      expect((await context.request.get(hostUrl("staff", path))).status()).toBe(401);
    });

    test("F10/AT42 reconciles a lost upload response at the three-photo cap without a new reservation", async ({
      page,
      context,
    }) => {
      const f = fixture("cap");
      if (!f.pendingId || !f.pendingOperation)
        throw new Error("Missing interrupted reservation fixture");
      const ip = await openReceipt(page, f);
      const before = await photos(f),
        pending = before.find(({ id }) => id === f.pendingId);
      expect(before).toHaveLength(3);
      expect(pending).toMatchObject({
        state: "reserved",
        scan: "pending",
        scannedAt: null,
        scannedSha256: null,
        scannerVersion: null,
      });
      await expect(section(page)).toContainText(labels.upload_incomplete);
      expect(
        (
          await context.request.get(hostUrl("staff", `/api/inquiry-attachments/${f.pendingId}`))
        ).status(),
      ).toBe(404);
      expect(await choosePhoto(page, f)).toBe(f.pendingOperation);
      const path = `/api/inquiries/${f.receiptId}/photos`;
      let recordedLocation = "";
      await page.route(
        (url) => url.pathname === path,
        async (route) => {
          const result = await route.fetch({ maxRedirects: 0 });
          expect(result.status()).toBe(303);
          recordedLocation = result.headers().location ?? "";
          await route.abort("failed"); // Commit reached the server; the browser receives no acknowledgement.
        },
      );
      const lost = page.waitForEvent(
        "requestfailed",
        (request) => new URL(request.url()).pathname === path && request.method() === "POST",
      );
      await photoForm(page)
        .getByRole("button", { name: labels.retry, exact: true })
        .click({ noWaitAfter: true });
      await lost;
      await page.unrouteAll({ behavior: "wait" });
      const destination = new URL(recordedLocation);
      expect(destination.origin).toBe(origins.public);
      expect(destination.pathname).toBe(`/en/requests/${f.receiptId}`);
      expect(destination.searchParams.get("photoOperation")).toBe(f.pendingOperation);
      expect(destination.searchParams.get("photoError")).toBeNull();
      await page.goto(recordedLocation);
      await expect(section(page).getByRole("listitem")).toHaveCount(3);
      await expect(section(page)).toContainText(labels.limitReached);
      await expect(photoForm(page)).toHaveCount(0);
      const after = await photos(f);
      expect(identity(after)).toEqual(identity(before));
      expect(after.find(({ id }) => id === f.pendingId)?.state).toBe("sealed");
      const replay = await context.request.post(hostUrl("public", path), {
        headers: { origin: origins.public, "cf-connecting-ip": ip },
        maxRedirects: 0,
        multipart: {
          operationId: f.pendingOperation,
          sharedForInquiry: "1",
          file: {
            name: "synthetic-owner.png",
            mimeType: "image/png",
            buffer: Buffer.from(f.bytes, "base64"),
          },
        },
      });
      expect(replay.status()).toBe(303);
      expect(new URL(replay.headers().location ?? "").searchParams.get("photoError")).toBeNull();
      expect(new URL(replay.headers().location ?? "").searchParams.get("photoOperation")).toBe(
        f.pendingOperation,
      );
      expect(identity(await photos(f))).toEqual(identity(before));
      expect(fixture("scan", f.pendingId)).toEqual({ id: f.pendingId, state: "clean" });
    });
  });
