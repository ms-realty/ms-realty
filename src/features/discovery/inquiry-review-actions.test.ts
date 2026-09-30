import { beforeEach, expect, it, vi } from "vitest";
import { getEnv } from "@/server/config/env";
import { AppError } from "@/server/errors";
import { issueSubmissionKey } from "@/server/inquiries/intake";
import { formFields } from "@/ui/form/contract";
import { sendInquiry } from "../../../app/public/[locale]/(site)/inquire/actions";
import { emptyInquiry, type InquiryState } from "./inquiry-state";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  source: vi.fn(),
  content: vi.fn(),
  approved: vi.fn(),
  session: "a".repeat(43),
}));
vi.mock("@/db/client", () => ({ getDb: () => "no-database-used" }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ origin: getEnv().hosts.public, "x-forwarded-for": "127.0.0.1" }),
  cookies: async () => ({ get: () => ({ value: mocks.session }) }),
}));
vi.mock("@/server/inquiries/intake", async (load) => ({
  ...(await load<typeof import("@/server/inquiries/intake")>()),
  submitInquiry: mocks.submit,
}));
vi.mock("@/server/listings/detail", () => ({ getPublicListing: mocks.source }));
vi.mock("@/server/inquiries/content-context", () => ({ readInquiryContent: mocks.content }));
vi.mock("@/server/content/public", () => ({ readApprovedContent: mocks.approved }));

function initial(): InquiryState {
  return {
    operationId: issueSubmissionKey(),
    expectedRevision: null,
    responseId: "initial",
    outcome: { kind: "idle" },
    values: {
      ...emptyInquiry,
      message: "Synthetic question",
      contactValue: "visitor@example.test",
      privacyNotice: "true",
    },
  };
}
function post(state: InquiryState, stage = "review") {
  const data = new FormData();
  data.set(formFields.operationId, state.operationId);
  data.set("inquiryStage", stage);
  for (const [name, value] of Object.entries(state.values)) data.set(name, value);
  if (state.review) data.set("reviewToken", state.review.token);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = "a".repeat(43);
  mocks.submit.mockImplementation(async (_db, payload) => ({
    receipt: {
      receiptId: payload.submissionKey,
      status: "accepted",
      reference: "RQ-2026-000001",
      acceptedAt: new Date().toISOString(),
      purpose: payload.purpose,
      locale: payload.locale,
      listingReference: payload.listingReference ?? null,
      selectedListingReferences: [],
      comparisonReferences: [],
    },
  }));
});

it("reviews and edits with no intake call, then confirms the same operation and exact owner input", async () => {
  const state = initial();
  state.values = {
    ...state.values,
    purpose: "seller_consultation",
    ownerLocality: "Synthetic town",
    ownerDocumentArea: "78.50",
    ownerRelationship: "co_owner",
  };
  const reviewed = await sendInquiry("en", state, post(state));
  expect(reviewed.review?.token).toBeTruthy();
  expect(reviewed.operationId).toBe(state.operationId);
  expect(reviewed.review?.ownerInput).toMatchObject({
    locality: "Synthetic town",
    documentArea: "78.50",
    relationship: "co_owner",
    provenance: "self_declared",
  });
  expect(mocks.submit).not.toHaveBeenCalled();
  const edit = post(reviewed, "confirm");
  edit.set("editInquiry", "1");
  const edited = await sendInquiry("en", reviewed, edit);
  expect(edited.review).toBeUndefined();
  expect(edited.values).toEqual(state.values);
  expect(mocks.submit).not.toHaveBeenCalled();
  const reviewedAgain = await sendInquiry("en", edited, post(edited));
  const confirmed = await sendInquiry("en", reviewedAgain, post(reviewedAgain, "confirm"));
  expect(confirmed.outcome.kind).toBe("confirmed");
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  expect(mocks.submit.mock.calls[0]?.[1]).toMatchObject({
    submissionKey: state.operationId,
    ownerInput: reviewed.review?.ownerInput,
  });
});

it("keeps tampered or session-mismatched confirmation editable without submitting", async () => {
  const state = initial(),
    reviewed = await sendInquiry("en", state, post(state));
  const changed = post(reviewed, "confirm");
  changed.set("contactValue", "changed@example.test");
  const rejected = await sendInquiry("en", reviewed, changed);
  expect(rejected.outcome.kind).toBe("validation");
  expect(rejected.values.contactValue).toBe("changed@example.test");
  expect(rejected.operationId).toBe(state.operationId);
  expect(rejected.review).toBeUndefined();
  mocks.session = "b".repeat(43);
  expect((await sendInquiry("en", reviewed, post(reviewed, "confirm"))).outcome.kind).toBe(
    "validation",
  );
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("validates before source reads and preserves the same recovery key on uncertain confirmation", async () => {
  const state = initial(),
    invalid = post(state);
  invalid.set("contactValue", "invalid");
  expect((await sendInquiry("en", state, invalid)).outcome.kind).toBe("validation");
  expect(mocks.source).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
  const reviewed = await sendInquiry("en", state, post(state));
  mocks.submit.mockRejectedValueOnce(new Error("Lost acknowledgement"));
  const unknown = await sendInquiry("en", reviewed, post(reviewed, "confirm"));
  expect(unknown.outcome).toMatchObject({
    kind: "unknown",
    status: { href: `/en/requests/${state.operationId}` },
  });
  expect(unknown.values).toEqual(state.values);
  mocks.submit.mockRejectedValueOnce(new AppError("version_conflict"));
  expect((await sendInquiry("en", reviewed, post(reviewed, "confirm"))).outcome.kind).toBe(
    "validation",
  );
});

it("requires explicit refresh after a source conflict and preserves all ordered subjects and entered values", async () => {
  const state = initial();
  const original = ["MS-00303", "MS-00101"].map((reference, index) => ({
    reference,
    observedManifestId: `12345678-1234-4123-8123-12345678900${index}`,
  }));
  state.values.selectedListings = JSON.stringify(original);
  let current = original;
  mocks.source.mockImplementation(async (_db, { reference }) => ({
    status: "listing",
    listing: {
      reference,
      manifestId: current.find((item) => item.reference === reference)?.observedManifestId,
      availability: { primaryAction: "ask" },
    },
  }));
  const reviewed = await sendInquiry("en", state, post(state));
  current = original.map((item, index) => ({
    ...item,
    observedManifestId: `12345678-1234-4123-8123-12345678901${index}`,
  }));
  mocks.submit.mockRejectedValueOnce(new AppError("version_conflict"));
  const conflict = await sendInquiry("en", reviewed, post(reviewed, "confirm"));
  expect(conflict.sourcesChanged).toBe(true);
  expect(conflict.review).toBeUndefined();
  expect(conflict.values).toEqual(state.values);
  const refresh = post(conflict);
  refresh.set("refreshSources", "1");
  const refreshed = await sendInquiry("en", conflict, refresh);
  expect(refreshed.operationId).toBe(state.operationId);
  expect(refreshed.values).toEqual({ ...state.values, selectedListings: JSON.stringify(current) });
  expect(refreshed.review?.listings.map((item) => item.reference)).toEqual(
    original.map((item) => item.reference),
  );
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  await sendInquiry("en", refreshed, post(refreshed, "confirm"));
  expect(mocks.submit.mock.calls[1]?.[1].selectedListings).toEqual(current);
  mocks.source.mockResolvedValueOnce({ status: "unavailable" });
  const unavailable = await sendInquiry("en", conflict, refresh);
  expect(unavailable.review).toBeUndefined();
  expect(unavailable.values.selectedListings).toBe(JSON.stringify(original));
  expect(unavailable.sourcesChanged).toBe(true);
});

it("binds and explicitly refreshes approved content identity without replacing the page subject", async () => {
  const state = initial();
  const content = {
    kind: "service",
    slug: "synthetic-service",
    versionId: "12345678-1234-4123-8123-123456789001",
  };
  state.values = {
    ...state.values,
    purpose: "service_consultation",
    contentReference: JSON.stringify(content),
  };
  mocks.content.mockImplementation(async (_db, reference) => ({
    ...reference,
    title: "Approved synthetic service",
    locale: "en",
    sourceUrl: "https://example.test/en/services/synthetic-service",
  }));
  const reviewed = await sendInquiry("en", state, post(state));
  expect(reviewed.review?.content?.title).toBe("Approved synthetic service");
  mocks.submit.mockRejectedValueOnce(new AppError("version_conflict"));
  const conflict = await sendInquiry("en", reviewed, post(reviewed, "confirm"));
  const nextVersion = "12345678-1234-4123-8123-123456789002";
  mocks.approved.mockResolvedValue({ version: { id: nextVersion } });
  const refresh = post(conflict);
  refresh.set("refreshSources", "1");
  const updated = await sendInquiry("en", conflict, refresh);
  expect(updated.values.contentReference).toBe(
    JSON.stringify({ ...content, versionId: nextVersion }),
  );
  expect(updated.values.contactValue).toBe(state.values.contactValue);
  expect(updated.review?.content?.versionId).toBe(nextVersion);
  expect(mocks.submit).toHaveBeenCalledTimes(1);
});
