import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { formFields } from "@/ui/form/contract";
import { discoveryCopy } from "./copy";
import { emptyInquiry, type InquiryState } from "./inquiry-state";

const mocked = vi.hoisted(() => ({
  session: "a".repeat(43) as string | undefined,
  submit: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
  cookies: async () => ({ get: () => (mocked.session ? { value: mocked.session } : undefined) }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/inquiries/intake", async (original) => ({
  ...(await original<typeof import("@/server/inquiries/intake")>()),
  submitInquiry: mocked.submit,
}));

import { issueSubmissionKey, parseInquiry } from "@/server/inquiries/intake";
import { POST as submitNativeInquiry } from "../../../app/api/inquiries/route";
import { sendInquiry } from "../../../app/public/[locale]/(site)/inquire/actions";
import { GET as startInquiry } from "../../../app/public/[locale]/(site)/inquire/start/route";

const selection = ["MS-00303", "MS-00101", "MS-00202"].map((reference, index) => ({
  reference,
  observedManifestId: `12345678-1234-4123-8123-12345678900${index}`,
}));
const selectedListings = JSON.stringify(selection);
function submission() {
  const key = issueSubmissionKey();
  const state: InquiryState = {
    operationId: key,
    responseId: "initial",
    expectedRevision: null,
    outcome: { kind: "idle" },
    values: {
      ...emptyInquiry,
      selectedListings,
      name: "Private visitor",
      message: "Private question",
      contactValue: "private@example.test",
      privacyNotice: "true",
    },
  };
  const data = new FormData();
  data.set(formFields.operationId, key);
  for (const [name, value] of Object.entries(state.values)) data.set(name, value);
  return { state, data, key };
}
beforeEach(() => {
  mocked.session = "a".repeat(43);
  mocked.submit.mockReset();
});

describe("collective server action recovery", () => {
  it("preserves exact selection and private draft on field validation with a visible context error", async () => {
    const { state, data } = submission();
    mocked.submit.mockRejectedValue(
      new AppError("validation_failed", {
        fieldErrors: { "selectedListings.1.observedManifestId": ["invalid"] },
      }),
    );
    const result = await sendInquiry("en", state, data);
    expect(mocked.submit.mock.calls[0]?.[1]).toMatchObject({ selectedListings: selection });
    expect(result.values).toEqual(state.values);
    expect(result.outcome).toMatchObject({
      kind: "validation",
      fieldErrors: { selectedListings: [expect.any(String)] },
    });
  });
  it("keeps only allowlisted selection context in session recovery and keeps the draft in action state", async () => {
    mocked.session = undefined;
    const { state, data, key } = submission();
    const result = await sendInquiry("en", state, data);
    expect(result.values).toEqual(state.values);
    expect(result.outcome.kind).toBe("rejected");
    if (result.outcome.kind !== "rejected") throw new Error("Expected recovery");
    const href = new URL(result.outcome.recovery?.href ?? "", "https://example.test");
    expect(href.pathname).toBe("/en/inquire/start");
    expect(result.outcome.recovery?.label).toBe(discoveryCopy("en").ask);
    expect(href.searchParams.get("selection")).toBe(selectedListings);
    expect(href.searchParams.get("submission")).toBe(key);
    expect(href.href).not.toMatch(/private|visitor/i);
    expect(mocked.submit).not.toHaveBeenCalled();
  });
  it("does not copy arbitrary hidden field text into session recovery URLs", async () => {
    mocked.session = undefined;
    const { state, data } = submission();
    data.set("selectedListings", "Private text inserted into an invalid hidden field");
    const result = await sendInquiry("en", state, data);
    if (result.outcome.kind !== "rejected") throw new Error("Expected session recovery");
    expect(result.outcome.recovery?.href).toContain("selection=invalid");
    expect(result.outcome.recovery?.href).not.toContain("Private");
    expect(result.values.selectedListings).toBe(
      "Private text inserted into an invalid hidden field",
    );
  });
  it("returns a fixed comparison path after a stale selection without dropping refs or drafts", async () => {
    const { state, data } = submission();
    mocked.submit.mockRejectedValue(
      new AppError("version_conflict", { current: { reason: "selection_changed" } }),
    );
    const result = await sendInquiry("he", state, data);
    expect(result.values).toEqual(state.values);
    expect(result.outcome).toMatchObject({
      kind: "conflict",
      recovery: {
        href: "/he/compare?references=MS-00303%2CMS-00101%2CMS-00202",
        label: discoveryCopy("he").compare,
      },
    });
  });
  it("rejects malformed and repeated hidden fields before intake", async () => {
    const { state, data } = submission();
    data.set("selectedListings", "not json");
    expect((await sendInquiry("en", state, data)).outcome.kind).toBe("validation");
    data.append("selectedListings", selectedListings);
    expect((await sendInquiry("en", state, data)).outcome.kind).toBe("rejected");
    expect(mocked.submit).not.toHaveBeenCalled();
  });
});

describe("collective receipt-session bootstrap", () => {
  it("round-trips an ordered selection larger than the old 100-character limit", async () => {
    expect(selectedListings.length).toBeGreaterThan(100);
    const query = new URLSearchParams({ purpose: "question", selection: selectedListings });
    const response = await startInquiry(
      new NextRequest(`http://localhost:3000/en/inquire/start?${query}`),
      { params: Promise.resolve({ locale: "en" }) },
    );
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("selection")).toBe(selectedListings);
    expect(location.searchParams.get("ready")).toBe("1");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it.each([
    "selection=bad",
    `selection=${encodeURIComponent(selectedListings)}&reference=MS-00101`,
    `selection=${encodeURIComponent(selectedListings)}&selection=${encodeURIComponent(selectedListings)}`,
  ])("rejects ambiguous or malformed context rather than reducing it: %s", async (query) => {
    const response = await startInquiry(
      new NextRequest(`http://localhost:3000/en/inquire/start?${query}`),
      { params: Promise.resolve({ locale: "en" }) },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("native API correction preserves logical context", () => {
  function native(fields: URLSearchParams) {
    return submitNativeInquiry(
      new Request("http://localhost:3000/api/inquiries", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: fields,
      }),
    );
  }
  function fields(key: string) {
    return new URLSearchParams({
      submissionKey: key,
      locale: "en",
      purpose: "question",
      selectedListings,
      contactKind: "email",
      contactValue: "private@example.test",
      message: "Private question",
      privacyNotice: "on",
    });
  }
  it.each(["malformed", "duplicate", "mixed_listing", "mixed_manifest", "mixed_purpose"])(
    "blocks %s selection without changing key or locale or leaking private values",
    async (kind) => {
      const key = issueSubmissionKey();
      const data = fields(key);
      if (kind === "malformed") data.set("selectedListings", "Private invalid value");
      if (kind === "duplicate") data.append("selectedListings", selectedListings);
      if (kind === "mixed_listing") data.set("listingReference", "MS-00303");
      if (kind === "mixed_manifest")
        data.set("observedManifestId", selection[0]?.observedManifestId ?? "");
      if (kind === "mixed_purpose") data.set("purpose", "seller_consultation");
      mocked.submit.mockImplementation(async (_db, input) => parseInquiry(input));
      const response = await native(data);
      expect(response.status).toBe(303);
      const url = new URL(response.headers.get("location") ?? "");
      expect(url.pathname).toBe("/en/inquire");
      expect(url.searchParams.get("submission")).toBe(key);
      expect(url.searchParams.get("context")).toBe("invalid");
      expect(url.searchParams.get("error")).toBe("VALIDATION_FAILED");
      expect(url.href).not.toMatch(/Private|private|example.test/);
    },
  );
  it.each(["outcome_unknown", "operation_pending", "idempotency_key_reused"] as const)(
    "routes %s to the original operation instead of an idle form",
    async (code) => {
      const key = issueSubmissionKey();
      mocked.submit.mockRejectedValue(new AppError(code));
      const response = await native(fields(key));
      expect(response.headers.get("location")).toBe(`http://localhost:3000/en/requests/${key}`);
    },
  );
});

describe("individual inquiry comparison return context", () => {
  const comparisonReferences = "MS-00303,MS-00101,MS-00202";
  function individual() {
    const result = submission();
    result.state.values = {
      ...result.state.values,
      selectedListings: "",
      listingReference: "MS-00101",
      observedManifestId: selection[1]?.observedManifestId ?? "",
      comparisonReferences,
    };
    for (const [name, value] of Object.entries(result.state.values)) result.data.set(name, value);
    return result;
  }
  it("keeps navigation separate from its single subject through validation and conflict", async () => {
    const { state, data } = individual();
    mocked.submit.mockRejectedValue(
      new AppError("validation_failed", { fieldErrors: { message: ["required"] } }),
    );
    const validation = await sendInquiry("en", state, data);
    expect(mocked.submit.mock.calls[0]?.[1]).toMatchObject({
      listingReference: "MS-00101",
      selectedListings: undefined,
      comparisonReferences: comparisonReferences.split(","),
    });
    expect(validation.values).toEqual(state.values);
    mocked.submit.mockRejectedValue(new AppError("version_conflict"));
    const conflict = await sendInquiry("en", state, data);
    expect(conflict.outcome).toMatchObject({
      kind: "conflict",
      recovery: { href: "/en/compare?references=MS-00303%2CMS-00101%2CMS-00202", label: "Compare" },
    });
  });
  it("carries navigation and singular snapshot identity through native session bootstrap", async () => {
    const { state, data, key } = individual();
    mocked.session = undefined;
    const recovery = await sendInquiry("en", state, data);
    if (recovery.outcome.kind !== "rejected") throw new Error("Expected session recovery");
    const href = recovery.outcome.recovery?.href ?? "";
    const started = await startInquiry(new NextRequest(`http://localhost:3000${href}`), {
      params: Promise.resolve({ locale: "en" }),
    });
    expect(started.status).toBe(303);
    const returned = new URL(started.headers.get("location") ?? "");
    expect(returned.searchParams.get("submission")).toBe(key);
    expect(returned.searchParams.get("comparisonReferences")).toBe(comparisonReferences);
    expect(returned.searchParams.get("reference")).toBe("MS-00101");
    expect(returned.searchParams.get("manifest")).toBe(selection[1]?.observedManifestId);
    expect(returned.searchParams.has("selection")).toBe(false);
  });
});
