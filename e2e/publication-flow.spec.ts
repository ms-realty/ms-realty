// Joined local S2 acceptance. Authenticated operator/contact are entry fixtures; uploads,
// sealing, actual ClamAV scans, reviews and publication/withdrawal all use the native UI.
// Seller authority/agreement inputs are explicitly synthetic, never legal or launch proof.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (
  !databaseUrl ||
  new URL(databaseUrl).pathname !== `/msr_e2e_${process.env.E2E_RUN_ID}` ||
  !process.env.E2E_FILE_STORAGE_ROOT ||
  !process.env.CLAMAV_PORT
)
  throw new Error(
    "Joined publication proof requires the isolated E2E database, storage and actual ClamAV port.",
  );
const connection = postgres(databaseUrl, { max: 2 });
test.afterAll(async () => {
  await connection.end();
});
test.use({ javaScriptEnabled: false });
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function preserveEvidence(info: TestInfo, name: string, contentType: string, bytes: Buffer) {
  const path = info.outputPath(name);
  await writeFile(path, bytes);
  await info.attach(name, { contentType, path });
}

async function storedObject(key: unknown) {
  if (typeof key !== "string" || !/^(sealed|derivatives)\/[a-zA-Z0-9/.-]+$/.test(key))
    throw new Error("Invalid test object key");
  const root = resolve(process.env.E2E_FILE_STORAGE_ROOT ?? "");
  const path = resolve(root, key);
  if (!path.startsWith(`${root}${sep}`)) throw new Error("Object escaped this run's storage");
  return readFile(path);
}

/** Minimal readable PDF with genuine xref offsets; its text explicitly denies legal effect. */
function syntheticPdf(purpose: string, reference: string) {
  const text = `SYNTHETIC TEST ONLY: ${purpose} for ${reference}. No real authority or legal agreement.`;
  const stream = `BT /F1 10 Tf 36 750 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(
    `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`,
  );
}

async function decision(page: Page, label: string) {
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: label, exact: true }) });
  if (await form.locator('input[name="scope"]').count()) {
    await form
      .getByLabel("Review scope or reason", { exact: true })
      .fill(
        "Synthetic joined acceptance: checked exact local evidence; no real seller or legal approval.",
      );
    await form.getByRole("checkbox").check();
  }
  await form.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByText("The action was recorded.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open listing", exact: true }).click();
}

async function uploadDocument(
  page: Page,
  reference: string,
  propertyId: string,
  purpose: "seller_authority" | "seller_instruction",
) {
  const bytes = syntheticPdf(purpose, reference);
  await page.goto(hostUrl("staff", `/en/inventory/${reference}/documents`));
  const upload = page
    .locator("form")
    .filter({ has: page.locator('input[name="intent"][value="upload"]') })
    .first();
  await upload.getByLabel("Choose a file", { exact: true }).setInputFiles({
    name: `${purpose}-synthetic.pdf`,
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await upload.getByLabel("Purpose", { exact: false }).selectOption(purpose);
  await upload.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page).toHaveURL((url) => Boolean(url.searchParams.get("saved")));
  let versionId = "";
  await expect
    .poll(
      async () => {
        const [file] =
          await connection`select v.id, v.scan from document_versions v join documents d on d.id = v.document_id where d.property_id = ${propertyId} and d.purpose = ${purpose}`;
        versionId = String(file?.id ?? "");
        return file?.scan;
      },
      { timeout: 30_000, message: `Actual ClamAV clean scan for ${purpose}` },
    )
    .toBe("clean");
  const [sealed] = await connection`select * from document_versions where id = ${versionId}`;
  expect(sealed).toMatchObject({
    state: "ready_for_review",
    content_type: "application/pdf",
    sha256: digest(bytes),
    scanned_sha256: digest(bytes),
    scanner_version: expect.stringMatching(/^ClamAV /),
  });
  expect(await storedObject(sealed?.sealed_key)).toEqual(bytes);
  await page.reload();
  const review = page
    .locator("form")
    .filter({ has: page.locator(`input[name="id"][value="${versionId}"]`) })
    .filter({ has: page.getByRole("button", { name: "Record review", exact: true }) });
  await review
    .getByLabel("Review note and scope")
    .fill(
      `Synthetic ${purpose}: reviewed exact uploaded bytes for this test only, no legal conclusion.`,
    );
  await review.getByRole("checkbox").check();
  const uploadReceipt = new URL(page.url()).searchParams.get("saved");
  await review.getByRole("button", { name: "Record review", exact: true }).click();
  // Upload already left a saved receipt in this URL. Wait for the review's new receipt.
  await expect(page).toHaveURL((url) =>
    Boolean(url.searchParams.get("saved") && url.searchParams.get("saved") !== uploadReceipt),
  );
  const [reviewed] =
    await connection`select state, review_type, professional_validation from document_versions where id = ${versionId}`;
  expect(reviewed).toMatchObject({
    state: "reviewed",
    review_type: "accepted_for_purpose",
    professional_validation: "not_requested",
  });
  return {
    versionId,
    sha256: digest(bytes),
    scannerVersion: String(sealed?.scanner_version),
    bytes,
  };
}

test("native S2: uploaded and reviewed BG listing publishes its actual approved image, then withdrawal removes detail and image", async ({
  page,
  context,
  request,
}, info) => {
  test.setTimeout(180_000);
  const fixture = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "src/server/files/publication-browser-seed.ts",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: process.env.E2E_AUTH_SECRET,
          DATABASE_URL: process.env.E2E_DATABASE_URL,
        },
      },
    ).trim(),
  ) as { token: string; reviewerId: string; sellerId: string; sellerName: string };
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: fixture.token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const title = `Синтетична обява за проверка ${randomUUID().slice(0, 8)}`;
  const description = "Измислен имот само за автоматизиран тест. Не е предложение за продажба.";
  await page.goto(hostUrl("staff", "/en/inventory/new"));
  await page.getByLabel("Region", { exact: true }).fill("Благоевград");
  await page.getByLabel("Settlement", { exact: true }).fill("Сандански");
  await page
    .getByLabel("Private exact address", { exact: true })
    .fill("SYNTHETIC PRIVATE ADDRESS NEVER PUBLIC");
  await page.getByLabel("Bulgarian title", { exact: true }).fill(title);
  await page.getByLabel("Bulgarian description", { exact: true }).fill(description);
  await page
    .getByLabel("Source or evidence reference", { exact: true })
    .fill("synthetic joined publication acceptance only");
  await page.getByLabel("Price status", { exact: true }).selectOption("known");
  await page.getByLabel("Price in EUR", { exact: true }).fill("95000.03");
  await page.getByLabel("Area status", { exact: true }).selectOption("known");
  await page.getByLabel("Area in m²", { exact: true }).fill("74.5");
  await page.getByLabel("Bedroom status", { exact: true }).selectOption("known");
  await page.getByLabel("Bedrooms", { exact: true }).fill("2");
  await page.getByRole("button", { name: "New listing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Draft saved", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open listing", exact: true }).click();
  const reference = page.url().split("/").pop() ?? "";
  expect(reference).toMatch(/^MS-\d+$/);
  const [listing] =
    await connection`select id, property_id from listings where reference = ${reference}`;
  if (!listing) throw new Error("Missing browser-created listing");

  const source = await sharp({
    create: { width: 96, height: 60, channels: 3, background: "#1b6776" },
  })
    .png()
    .toBuffer();
  await page.goto(hostUrl("staff", `/en/inventory/${reference}/media`));
  await page
    .getByLabel("Choose a file", { exact: true })
    .setInputFiles({ name: "synthetic-photo.png", mimeType: "image/png", buffer: source });
  await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page).toHaveURL((url) => Boolean(url.searchParams.get("saved")));
  let assetId = "";
  await expect
    .poll(
      async () => {
        const [asset] =
          await connection`select id, scan from media_assets where property_id = ${listing.property_id}`;
        assetId = String(asset?.id ?? "");
        return asset?.scan;
      },
      { timeout: 30_000, message: "Actual ClamAV scans the native media upload" },
    )
    .toBe("clean");
  const [asset] = await connection`select * from media_assets where id = ${assetId}`;
  expect(asset).toMatchObject({
    processing: "ready",
    review: "pending",
    sha256: digest(source),
    scanned_sha256: digest(source),
    scanner_version: expect.stringMatching(/^ClamAV /),
  });
  expect(await storedObject(asset?.sealed_key)).toEqual(source);
  const derivative = await storedObject(asset?.derivative_key);
  expect(digest(derivative)).toBe(asset?.derivative_sha256);
  expect(await sharp(derivative).metadata()).toMatchObject({
    format: "webp",
    width: 96,
    height: 60,
  });
  expect((await sharp(derivative).metadata()).exif).toBeUndefined();
  const mediaPath = `/api/media/${assetId}/${asset?.derivative_sha256}`;
  expect((await request.get(hostUrl("public", mediaPath))).status()).toBe(404);
  await page.reload();
  await page.getByLabel("Rights holder", { exact: true }).fill("Synthetic image author");
  await page
    .getByLabel("Rights evidence / permission reference", { exact: true })
    .fill("Synthetic fixture rights only; no external photograph");
  await page
    .getByLabel("Image description", { exact: true })
    .fill("Синтетично изображение за тест");
  await page
    .getByLabel(
      "I reviewed private addresses, people, documents and location details in the visible image.",
    )
    .check();
  await page.getByLabel("I reviewed the stated usage rights and permission evidence.").check();
  const mediaUploadReceipt = new URL(page.url()).searchParams.get("saved");
  await page.getByRole("button", { name: "Record review", exact: true }).click();
  await expect(page).toHaveURL((url) =>
    Boolean(url.searchParams.get("saved") && url.searchParams.get("saved") !== mediaUploadReceipt),
  );
  await expect(page.getByText("Publication candidate", { exact: true })).toBeVisible();
  expect((await request.get(hostUrl("public", mediaPath))).status()).toBe(404);

  const authority = await uploadDocument(
    page,
    reference,
    String(listing.property_id),
    "seller_authority",
  );
  const instruction = await uploadDocument(
    page,
    reference,
    String(listing.property_id),
    "seller_instruction",
  );
  for (const document of [authority, instruction])
    expect(
      (
        await request.get(hostUrl("public", `/api/files/private/document/${document.versionId}`))
      ).status(),
    ).toBe(404);

  await page.goto(hostUrl("staff", `/en/inventory/${reference}`));
  await decision(page, "Confirm current availability");
  await decision(page, "Freeze review candidate");
  await decision(page, "Approve factual revision");
  await decision(page, "Submit editorial review");
  await decision(page, "Approve source revision");
  await page.goto(hostUrl("staff", `/en/inventory/${reference}/evidence`));
  const authorityForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Review seller authority", exact: true }) });
  await authorityForm.getByLabel("Contact", { exact: false }).selectOption(fixture.sellerId);
  await authorityForm
    .getByLabel("Reviewed authority document", { exact: false })
    .selectOption(authority.versionId);
  await authorityForm
    .getByLabel("Evidence checked and scope of review")
    .fill(
      "Synthetic seller authority fixture checked for this property only. No real title or legal claim.",
    );
  await authorityForm.getByRole("checkbox").check();
  await authorityForm.getByRole("button", { name: "Review seller authority", exact: true }).click();
  await expect(page.getByText("The action was recorded.", { exact: true })).toBeVisible();
  await page.goto(hostUrl("staff", `/en/inventory/${reference}/evidence`));
  const instructionForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Record agreed instructions", exact: true }) });
  await instructionForm.getByLabel("Contact", { exact: false }).selectOption(fixture.sellerId);
  await instructionForm
    .getByLabel("Reviewed brokerage agreement", { exact: false })
    .selectOption(instruction.versionId);
  await instructionForm
    .getByLabel("Agreed commission terms")
    .fill("Synthetic test agreement only; no real commission or financial obligation.");
  // A previous day avoids machine timezone/DST ambiguity; the UI interprets Europe/Sofia.
  await instructionForm
    .getByLabel("Agreed at (Europe/Sofia)", { exact: true })
    .fill(`${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T12:00`);
  await instructionForm.getByLabel("The agreement permits publication").check();
  await instructionForm.getByLabel("The agreement grants the stated media usage rights").check();
  await instructionForm
    .getByLabel(
      "I checked these exact instructions and permissions against the selected agreement.",
    )
    .check();
  await instructionForm
    .getByRole("button", { name: "Record agreed instructions", exact: true })
    .click();
  await expect(page.getByText("The action was recorded.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open listing", exact: true }).click();
  const prepared = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Prepare publication", exact: true }) });
  await prepared.getByLabel("Publication language", { exact: false }).selectOption("bg");
  await decision(page, "Prepare publication");
  expect((await request.get(hostUrl("public", mediaPath))).status()).toBe(404);
  await decision(page, "Activate reviewed manifest (BG)");

  const [published] =
    await connection`select p.state, p.generation, p.manifest_id, m.locale, m.listing_revision_id, m.media from current_publications p join publication_manifests m on m.id = p.manifest_id where p.listing_id = ${listing.id} and p.locale = 'bg'`;
  expect(published).toMatchObject({ state: "active", locale: "bg" });
  expect(JSON.stringify(published?.media)).toContain(String(asset?.derivative_sha256));
  expect(JSON.stringify(published?.media)).toContain(String(asset?.sha256));
  const publicPage = await context.newPage();
  await publicPage.goto(hostUrl("public", `/bg/properties?q=${reference}`));
  const detailLink = publicPage.locator(`a[href^="/bg/properties/${reference}/"]`).first();
  await expect(detailLink).toBeVisible();
  await detailLink.click();
  const publicUrl = publicPage.url();
  await expect(publicPage.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(publicPage.getByText(description, { exact: true })).toBeVisible();
  await expect(publicPage.locator("body")).toContainText(/95\s*000,03/);
  await expect(publicPage.locator("body")).toContainText("74,5");
  await expect(
    publicPage.getByText("SYNTHETIC PRIVATE ADDRESS NEVER PUBLIC", { exact: false }),
  ).toHaveCount(0);
  const publicImage = publicPage.locator(`img[src="${mediaPath}"]`);
  await expect(publicImage).toBeVisible();
  await expect
    .poll(() => publicImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(96);
  const imageResponse = await request.get(hostUrl("public", mediaPath));
  expect(imageResponse.status()).toBe(200);
  expect(imageResponse.headers()["content-type"]).toContain("image/webp");
  expect(await imageResponse.body()).toEqual(derivative);
  await publicPage.screenshot({
    path: info.outputPath("published-actual-image.png"),
    fullPage: true,
  });
  await decision(page, "Withdraw all destinations");
  await publicPage.goto(publicUrl);
  await expect(publicPage.getByRole("heading", { level: 1 })).toHaveText(reference);
  await expect(publicPage.getByText("Този имот не е достъпен тук.", { exact: true })).toBeVisible();
  await expect(publicPage.getByText(description, { exact: true })).toHaveCount(0);
  await expect(publicPage.locator(`img[src="${mediaPath}"]`)).toHaveCount(0);
  expect(
    (
      await request.get(hostUrl("public", mediaPath), {
        headers: {
          "if-none-match": imageResponse.headers().etag ?? `"${asset?.derivative_sha256}"`,
        },
      })
    ).status(),
  ).toBe(404);
  await publicPage.screenshot({
    path: info.outputPath("withdrawn-safe-identity.png"),
    fullPage: true,
  });
  await publicPage.goto(hostUrl("public", `/bg/properties?q=${reference}`));
  await expect(publicPage.locator(`a[href^="/bg/properties/${reference}/"]`)).toHaveCount(0);
  const [withdrawn] =
    await connection`select p.state, l.publication_generation as generation from current_publications p join listings l on l.id = p.listing_id where p.listing_id = ${listing.id} and p.locale = 'bg'`;
  expect(withdrawn?.state).toBe("withdrawn");
  expect(Number(withdrawn?.generation)).toBeGreaterThan(Number(published?.generation));
  await preserveEvidence(
    info,
    "local-s2-evidence.json",
    "application/json",
    Buffer.from(
      JSON.stringify(
        {
          scope:
            "Synthetic seller and legal evidence; actual local bytes and ClamAV scans; no live provider or launch proof",
          reference,
          manifestId: published?.manifest_id,
          sourceRevisionId: published?.listing_revision_id,
          assetId,
          sourceDigest: asset?.sha256,
          derivativeDigest: asset?.derivative_sha256,
          scannerVersion: asset?.scanner_version,
          authority: {
            versionId: authority.versionId,
            digest: authority.sha256,
            scannerVersion: authority.scannerVersion,
          },
          instruction: {
            versionId: instruction.versionId,
            digest: instruction.sha256,
            scannerVersion: instruction.scannerVersion,
          },
          withdrawn: true,
        },
        null,
        2,
      ),
    ),
  );
  await preserveEvidence(info, "synthetic-authority.pdf", "application/pdf", authority.bytes);
  await preserveEvidence(info, "synthetic-instruction.pdf", "application/pdf", instruction.bytes);
  await preserveEvidence(info, "synthetic-original.png", "image/png", source);
  await preserveEvidence(info, "approved-derivative.webp", "image/webp", derivative);
  await publicPage.close();
});
