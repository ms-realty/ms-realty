// AT36–AT39: real browser ceremonies and explicit POSTs against the run's isolated Postgres.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";
import * as schema from "../src/db/schema";
import { hostUrl, origins } from "./hosts";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname)) {
  throw new Error("Identity browser tests require the generated disposable E2E database.");
}
const sql = postgres(databaseUrl, { max: 2 });
const db = drizzle(sql, { schema });
test.afterAll(async () => {
  await sql.end();
});
const address = () => `browser-${randomUUID()}@example.test`;

async function principal(kind: "client" | "staff") {
  const email = address();
  const [party] = await db
    .insert(schema.parties)
    .values({ kind: "person", displayName: "Browser Test" })
    .returning();
  if (!party) throw new Error("No party");
  const [account] = await db
    .insert(schema.principals)
    .values({
      partyId: party.id,
      kind,
      issuer: `urn:ms-realty:${kind}`,
      subject: randomUUID(),
      email,
      displayName: "Browser Test",
    })
    .returning();
  if (!account) throw new Error("No principal");
  return account;
}
async function mail(
  request: APIRequestContext,
  context: "staff" | "client",
  recipient: string,
  template: string,
  previousUrl?: string,
) {
  let result: { params?: Record<string, string>; secretParams?: { url?: string } } | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${origins.public}/api/test-outbox`, {
          headers: { host: new URL(origins[context]).host },
        });
        expect(response.status()).toBe(200);
        const body = await response.json();
        result = body.messages.find(
          (item: {
            recipient: string;
            template: string;
            params?: { url?: string };
            secretParams?: { url?: string };
          }) =>
            item.recipient === recipient &&
            item.template === template &&
            (item.secretParams?.url ?? item.params?.url) !== previousUrl,
        );
        return Boolean(result);
      },
      { timeout: 25_000 },
    )
    .toBe(true);
  const url = result?.secretParams?.url ?? result?.params?.url;
  if (!url) throw new Error("No captured authentication URL");
  return url;
}
async function authenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const add = async () =>
    (
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "usb",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      })
    ).authenticatorId;
  return { cdp, add };
}

test("AT36/AT39: staff invitation, two passkeys, workspace navigation, sign-out and passkey sign-in", async ({
  page,
  context,
  browserName,
}, info) => {
  test.skip(
    browserName !== "chromium" || info.project.name !== "chromium-desktop",
    "Virtual authenticator proof runs on desktop Chromium.",
  );
  test.setTimeout(180_000);
  const account = await principal("staff");
  const token = randomBytes(32).toString("base64url");
  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      kind: "staff_enrolment",
      principalId: account.id,
      email: account.email,
      scope: { roles: ["manager", "assigned_broker", "content_editor"] },
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  if (!invitation) throw new Error("No invitation");
  const auth = await authenticator(context, page);
  const first = await auth.add();
  const url = hostUrl("staff", `/en/access/invitation?token=${token}`);
  await page.goto(hostUrl("staff", "/en/today"));
  await expect(page).toHaveURL(hostUrl("staff", "/en/access"));
  await page.goto(url);
  await page.reload();
  const untouched = await sql`select accepted_at from invitations where id = ${invitation.id}`;
  expect(untouched[0]?.accepted_at).toBeNull();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/access/enrol"));
  await page.getByRole("button", { name: "Register a passkey", exact: true }).click();
  await expect(page.getByText("1 of 2 passkeys registered.", { exact: true })).toBeVisible();
  await page.goto(hostUrl("staff", "/en/today"));
  await expect(page).toHaveURL(hostUrl("staff", "/en/access/enrol"));
  await auth.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
  await auth.add();
  await page.getByRole("button", { name: "Register a passkey", exact: true }).click();
  await expect(page.getByText("Both passkeys are registered.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Continue to the workspace" }).click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
  const today = page
    .getByRole("link", { name: "Today", exact: true })
    .filter({ visible: true })
    .first();
  await expect(today).toHaveAttribute("aria-current", "page");
  const navLinks = await page
    .locator("nav a[href]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(navLinks.length).toBeGreaterThan(0);
  for (const href of new Set(navLinks)) {
    expect((await page.goto(new URL(href ?? "", origins.staff).toString()))?.status()).toBe(200);
  }
  const staffCookies = await context.cookies(origins.staff);
  expect(
    staffCookies.some((cookie) => cookie.name.includes("staff_session") && cookie.httpOnly),
  ).toBe(true);
  expect(
    (await context.cookies(origins.client)).some((cookie) => cookie.name.includes("staff_session")),
  ).toBe(false);
  await page.goto(hostUrl("client", "/en/access"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your MS Realty client account");
  await page.goto(hostUrl("staff", "/en/access/enrol"));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/access"));
  await page.getByRole("button", { name: "Sign in with a passkey", exact: true }).click();
  await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
  await page.goto(hostUrl("staff", "/en/access/manage"));
  await expect(page.getByRole("heading", { name: "Manage access", exact: true })).toBeVisible();
  // An operator can assign an explicit review capability to themselves. The actual grant
  // ends the old session, and the existing passkey signs into the changed permissions.
  for (const capability of ["document.review", "compliance.review"]) {
    await page.goto(hostUrl("staff", "/en/access/manage"));
    const grantForm = page
      .locator("form")
      .filter({ has: page.locator('input[name="intent"][value="grant"]') });
    await grantForm.getByLabel("Staff member").selectOption(account.id);
    await grantForm.getByRole("combobox", { name: /^Capability/ }).selectOption(capability);
    await grantForm
      .getByLabel("Reason and authorized purpose")
      .fill("Synthetic browser operator reviews named evidence");
    await grantForm.getByRole("checkbox").check();
    await grantForm.getByRole("button", { name: "Record capability grant" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/en/access");
    await page.getByRole("button", { name: "Sign in with a passkey", exact: true }).click();
    await expect(page).toHaveURL(hostUrl("staff", "/en/today"));
  }
  const [property] = await db
    .insert(schema.properties)
    .values({
      reference: `PR-${randomUUID()}`,
      propertyType: "apartment",
      country: "BG",
      region: "Synthetic region",
      settlement: "Synthetic test settlement",
    })
    .returning();
  if (!property) throw new Error("Missing file workflow property");
  const reference = `MS-${randomUUID().toUpperCase()}`;
  await db.insert(schema.listings).values({ reference, propertyId: property.id, purpose: "sale" });
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
  await page.goto(hostUrl("staff", `/en/inventory/${reference}/media`));
  await page
    .getByLabel("Choose a file", { exact: true })
    .first()
    .setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: bytes });
  await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname.endsWith("/media") && Boolean(url.searchParams.get("saved")),
  );
  // This test flag only selects assertions. The server always uses real ClamAV. The
  // default run has no daemon; a separately requested run points at a disposable daemon.
  const realScan = process.env.E2E_REAL_SCAN === "1";
  const expectedScan = realScan ? "clean" : "failed";
  let assetId = "";
  await expect
    .poll(
      async () => {
        const [asset] =
          await sql`select id, scan, sealed_key, sha256, scanned_sha256, scanner_version from media_assets where property_id = ${property.id}`;
        assetId = String(asset?.id ?? "");
        if (asset?.scan === expectedScan) {
          expect(asset.sealed_key).toBeTruthy();
          expect(asset.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
          if (realScan) {
            expect(asset.scanned_sha256).toBe(asset.sha256);
            expect(asset.scanner_version).toMatch(/^ClamAV /);
          }
        }
        return asset?.scan;
      },
      { timeout: 25_000 },
    )
    .toBe(expectedScan);
  await page.reload();
  if (realScan) {
    await expect(page.getByText("Clean", { exact: true })).toBeVisible();
    await page.getByLabel("Rights holder", { exact: true }).fill("Synthetic image creator");
    await page
      .getByLabel("Rights evidence / permission reference", { exact: true })
      .fill("Synthetic test permission");
    await page.getByLabel("Image description", { exact: true }).fill("Synthetic blue rectangle");
    await page
      .getByLabel(
        "I reviewed private addresses, people, documents and location details in the visible image.",
      )
      .check();
    await page.getByLabel("I reviewed the stated usage rights and permission evidence.").check();
    await page.getByRole("button", { name: "Record review", exact: true }).click();
    await expect(page.getByText("Publication candidate", { exact: true })).toBeVisible();
    const original = await page.evaluate(
      async (id) =>
        Array.from(
          new Uint8Array(await (await fetch(`/api/files/private/media/${id}`)).arrayBuffer()),
        ),
      assetId,
    );
    expect(Buffer.from(original)).toEqual(bytes);
    const preview = await page.evaluate(
      async (id) =>
        Array.from(
          new Uint8Array(
            await (await fetch(`/api/files/private/media/${id}?preview=1`)).arrayBuffer(),
          ),
        ),
      assetId,
    );
    expect(await sharp(Buffer.from(preview)).metadata()).toMatchObject({
      format: "webp",
      width: 12,
      height: 8,
    });
    const [evidence] =
      await sql`select derivative_sha256, review, rights from media_assets where id = ${assetId}`;
    expect(evidence?.derivative_sha256).toBe(
      createHash("sha256").update(Buffer.from(preview)).digest("hex"),
    );
    expect(evidence?.review).toBe("approved");
  } else {
    await expect(
      page.getByText("Could not complete — quarantined", { exact: true }).first(),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      async (id) => (await fetch(`/api/files/private/media/${id}`)).status,
      assetId,
    ),
  ).toBe(realScan ? 200 : 404);
  expect(
    (
      await context.request.get(hostUrl("public", `/api/media/${assetId}/${"0".repeat(64)}`))
    ).status(),
  ).toBe(404);
  await page.goto(hostUrl("staff", `/en/inventory/${reference}/documents`));
  await page
    .getByLabel("Choose a file", { exact: true })
    .first()
    .setInputFiles({ name: "synthetic-instruction.png", mimeType: "image/png", buffer: bytes });
  await page.getByLabel("Purpose", { exact: false }).selectOption("seller_instruction");
  await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname.endsWith("/documents") && Boolean(url.searchParams.get("saved")),
  );
  let versionId = "";
  await expect
    .poll(
      async () => {
        const [file] =
          await sql`select v.id, v.scan, v.state from document_versions v join documents d on d.id = v.document_id where d.property_id = ${property.id}`;
        versionId = String(file?.id ?? "");
        if (file?.scan === "failed") expect(file.state).toBe("scanning");
        if (file?.scan === "clean") expect(file.state).toBe("ready_for_review");
        return file?.scan;
      },
      { timeout: 25_000 },
    )
    .toBe(expectedScan);
  await page.reload();
  if (realScan) {
    await page
      .getByLabel("Review note and scope")
      .fill("Synthetic instruction reviewed for the named purpose");
    await page
      .getByLabel(
        "I reviewed this exact version for the stated purpose. This records my review, not legal verification.",
      )
      .check();
    await page.getByRole("button", { name: "Record review", exact: true }).click();
    await expect(page.getByText("Human review recorded", { exact: true })).toBeVisible();
    const [reviewed] =
      await sql`select state, review_type, professional_validation, scanned_sha256, sha256 from document_versions where id = ${versionId}`;
    expect(reviewed).toMatchObject({
      state: "reviewed",
      review_type: "accepted_for_purpose",
      professional_validation: "not_requested",
    });
    expect(reviewed?.scanned_sha256).toBe(reviewed?.sha256);
    const original = await page.evaluate(
      async (id) =>
        Array.from(
          new Uint8Array(await (await fetch(`/api/files/private/document/${id}`)).arrayBuffer()),
        ),
      versionId,
    );
    expect(Buffer.from(original)).toEqual(bytes);
  } else {
    await expect(page.getByRole("button", { name: "Record review", exact: true })).toHaveCount(0);
  }
  const [caseRecord] = await db
    .insert(schema.cases)
    .values({
      reference: `CASE-${randomUUID()}`,
      title: "Synthetic agreement case",
      kind: "buyer",
      stage: "needs_agreed",
      ownerId: account.id,
      nextAction: "Review the agreement",
    })
    .returning();
  if (!caseRecord) throw new Error("Missing test case");
  await page.goto(hostUrl("staff", `/en/cases/${caseRecord.id}/documents`));
  await page
    .getByLabel("Choose a file", { exact: true })
    .first()
    .setInputFiles({ name: "synthetic-case-agreement.png", mimeType: "image/png", buffer: bytes });
  await page.getByLabel("Purpose", { exact: false }).selectOption("service_agreement");
  await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname.endsWith("/documents") && Boolean(url.searchParams.get("saved")),
  );
  await expect
    .poll(
      async () => {
        const [file] =
          await sql`select v.scan from document_versions v join documents d on d.id = v.document_id where d.case_id = ${caseRecord.id}`;
        return file?.scan;
      },
      { timeout: 25_000 },
    )
    .toBe(expectedScan);
  await page.reload();
  if (realScan) {
    await page
      .getByLabel("Review note and scope")
      .fill("Synthetic case agreement reviewed for its stated purpose");
    await page
      .getByLabel(
        "I reviewed this exact version for the stated purpose. This records my review, not legal verification.",
      )
      .check();
    await page.getByRole("button", { name: "Record review", exact: true }).click();
    await expect(page.getByText("Human review recorded", { exact: true })).toBeVisible();
    const [review] =
      await sql`select d.audience, d.purpose, v.review_type from documents d join document_versions v on v.document_id = d.id where d.case_id = ${caseRecord.id}`;
    expect(review).toMatchObject({
      audience: "internal",
      purpose: "service_agreement",
      review_type: "accepted_for_purpose",
    });
  }
  // A received fixture is the starting record; the reviewer uses the real enrolled session.
  const requester = await principal("client");
  const [privacy] = await db
    .insert(schema.privacyRequests)
    .values({
      reference: `PQ-BROWSER-${randomUUID()}`,
      kind: "correction",
      partyId: requester.partyId,
      responsibleId: account.id,
      verifiedAt: new Date(),
      scope: {
        description: "Synthetic correction request",
        dueCondition: "awaiting_human_assessment",
        policyReference: null,
      },
    })
    .returning();
  if (!privacy) throw new Error("Missing privacy fixture");
  await page.goto(hostUrl("staff", "/en/operations/privacy"));
  await page.getByLabel("Next state").selectOption("verifying");
  await page
    .getByLabel(
      "I reviewed the policy, scope, owner, due condition and evidence for this transition.",
    )
    .check();
  await page.getByRole("button", { name: "Record human review" }).click();
  await expect(page).toHaveURL((url) => Boolean(url.searchParams.get("receipt")));
  await page.getByLabel("Next state").selectOption("in_progress");
  await page
    .getByLabel("Approved policy reference")
    .fill("Synthetic reviewed test policy reference");
  await page
    .getByLabel("Reviewed response date")
    .fill(new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10));
  await page.getByLabel("I reviewed identity and the stated scope.").check();
  await page
    .getByLabel(
      "I reviewed the policy, scope, owner, due condition and evidence for this transition.",
    )
    .check();
  await page.getByRole("button", { name: "Record human review" }).click();
  await expect(page).toHaveURL((url) => Boolean(url.searchParams.get("receipt")));
  const [assessed] =
    await sql`select state, due_at, scope from privacy_requests where id = ${privacy.id}`;
  expect(assessed?.state).toBe("in_progress");
  expect(assessed?.due_at).not.toBeNull();
  await page.goto(hostUrl("staff", "/en/today"));
  let releaseRefresh = () => {};
  let refreshStarted = () => {};
  const reachedRefresh = new Promise<void>((resolve) => {
    refreshStarted = resolve;
  });
  const allowedRefresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route("**/en/today**", async (route) => {
    if (route.request().headers().rsc === "1") {
      refreshStarted();
      await allowedRefresh;
    }
    await route.continue();
  });
  await sql`update sessions set revoked_at = now() where principal_id = ${account.id}`;
  const immediatelyConcealed = await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    const hidden = document.querySelector<HTMLElement>("[data-private-content]")?.hidden;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    return hidden;
  });
  expect(immediatelyConcealed).toBe(true);
  await reachedRefresh;
  await expect(page.locator("[data-private-content]")).toBeHidden();
  releaseRefresh();
  await expect(page).toHaveURL(hostUrl("staff", "/en/access"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Staff sign-in");
});

test("AT37/AT38: client email link and invitation need confirm POST, including without JavaScript", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await principal("client");
  // A scoped invite fixture is the entry condition. No session or participation is pre-created.
  const staff = await principal("staff");
  await db.insert(schema.staffMemberships).values({ principalId: staff.id });
  // Available accountable operator fixture; client authentication below remains a real link POST.
  await db.insert(schema.grants).values({
    principalId: staff.id,
    capability: "privacy.manage",
    reason: "Synthetic available privacy operator",
  });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const [target] = await db
    .insert(schema.cases)
    .values({
      reference: `BROWSER-${randomUUID()}`,
      title: "Private browser case",
      kind: "buyer",
      stage: "needs_agreed",
      ownerId: staff.id,
      nextAction: "Agree the brief",
    })
    .returning();
  if (!target) throw new Error("No case");
  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      kind: "client_access",
      principalId: account.id,
      email: account.email,
      scope: { caseId: target.id, role: "buyer", capabilities: [] },
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  if (!invitation) throw new Error("No invitation");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    const inviteUrl = hostUrl("client", `/en/invitations/${invitation.id}`);
    await page.goto(inviteUrl);
    await expect(page.getByText("Private browser case")).toHaveCount(0);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email address").fill(account.email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
    const url = await mail(request, "client", account.email, "auth.email_link");
    await page.goto(url);
    await page.reload();
    expect(
      (await context.cookies(origins.client)).some((cookie) =>
        cookie.name.includes("client_session"),
      ),
    ).toBe(false);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(inviteUrl);
    await expect(page.getByText(/Private browser case/)).toBeVisible();
    await page.reload();
    const pending = await sql`select accepted_at from invitations where id = ${invitation.id}`;
    expect(pending[0]?.accepted_at).toBeNull();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByText("You accepted this invitation.", { exact: true })).toBeVisible();
    const accepted = await sql`select accepted_at from invitations where id = ${invitation.id}`;
    expect(accepted[0]?.accepted_at).not.toBeNull();
    await page.goto(hostUrl("client", "/en/access"));
    await expect(page.getByRole("link", { name: "Go to overview", exact: true })).toHaveAttribute(
      "href",
      "/en/overview",
    );
    await expect(page.locator(`a[href="/en/invitations/${invitation.id}"]`)).toHaveCount(0);
    await expect(
      page.getByText(
        "When your broker shares a case with you, you receive an invitation by email.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await sql`update sessions set reverified_at = now() - interval '16 minutes' where principal_id = ${account.id} and revoked_at is null`;
    await page.goto(hostUrl("client", "/en/access/reauth?returnTo=%2Fen%2Faccess"));
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
    const freshUrl = await mail(request, "client", account.email, "auth.email_link", url);
    await page.goto(freshUrl);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(hostUrl("client", "/en/access"));
    const [freshSession] =
      await sql`select coalesce(reverified_at, created_at) > now() - interval '1 minute' as fresh from sessions where principal_id = ${account.id} and revoked_at is null`;
    expect(freshSession?.fresh).toBe(true);
    await page.goto(hostUrl("client", "/en/preferences"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Contact and subscription preferences",
    );
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Opt in separately" })).toHaveCount(0);
    await page.getByLabel("Preferred contact times").fill("Synthetic weekdays preference");
    await page.getByRole("button", { name: "Save service preferences" }).click();
    await expect(page).toHaveURL(
      (next) => next.pathname === "/en/preferences" && Boolean(next.searchParams.get("receipt")),
    );
    const [implicit] =
      await sql`select count(*) as count from subscriptions where party_id = ${account.partyId}`;
    expect(Number(implicit?.count)).toBe(0);
    await page.goto(hostUrl("client", "/en/privacy"));
    await page
      .getByLabel("What you want reviewed")
      .fill("Synthetic personal information access request from browser");
    await page.getByLabel("This request concerns my own information.").check();
    await page.getByRole("button", { name: "Send privacy request" }).click();
    await expect(page).toHaveURL(
      (next) => next.pathname === "/en/privacy" && Boolean(next.searchParams.get("receipt")),
    );
    await expect(
      page.getByText("Awaiting human assessment under the approved policy", { exact: true }),
    ).toBeVisible();
    const [received] =
      await sql`select state, due_at, responsible_id from privacy_requests where party_id = ${account.partyId}`;
    expect(received).toMatchObject({ state: "received", due_at: null });
    expect(received?.responsible_id).toBeTruthy();
    await page.goto(inviteUrl);
    await page.getByRole("button", { name: "Sign out and use another account" }).click();
    await expect(page).toHaveURL(hostUrl("client", "/en/access"));
    await page.goto(url);
    await expect(
      page.getByText(
        "This sign-in link was already used. Request a new one if you are not signed in.",
      ),
    ).toBeVisible();
    expect((await request.get(`${origins.public}/api/test-outbox`)).status()).toBe(404);
  } finally {
    await context.close();
  }
});
