import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { approvalKinds, approvalStates } from "@/domain/approval";
import { operationStatuses } from "@/domain/operation-receipt";
import { publicationStates } from "@/domain/publication";
import type { Session } from "@/server/auth/sessions";
import { contentLabel } from "./labels";
import { ContentListScreen, ContentWorkbenchScreen } from "./screens";

const fixture = vi.hoisted(() => ({
  placeId: "00000000-0000-4000-8000-000000000001",
  page: {
    id: "synthetic-content",
    kind: "area",
    slug: "source_slug",
    publicationState: "never_published",
    currentVersionNumber: 7,
    publishedVersionNumber: null,
  },
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ hosts: { public: "https://example.test" } }),
}));
vi.mock("@/server/content/commands", () => ({
  listContent: async () => ({ canCreate: false, rows: [fixture.page] }),
  readContentWorkbench: async () => ({
    page: fixture.page,
    current: {
      id: "synthetic-version",
      versionNumber: 7,
      contentHash: "exact_content_hash",
      reviewedAt: null,
      jurisdiction: "Exact jurisdiction",
      reviewScope: "Exact review scope",
      body: {
        title: "Exact source title",
        paragraphs: ["Keep_source_text_exact."],
        placeId: fixture.placeId,
      },
    },
    decisions: [
      {
        id: "synthetic-decision",
        kind: "legal_process_claim",
        state: "approved",
        subjectVersion: 7,
        subjectHash: "exact_content_hash",
        decidedAt: null,
        expiresAt: null,
        decisionNote: "Keep_decision_note_exact.",
      },
    ],
    access: {},
    places: [],
    placesAvailable: true,
    publishedPlaceId: null,
  }),
}));
vi.mock("./forms", () => ({ ContentForm: () => null, ContentReviewForm: () => null }));
afterEach(cleanup);

it.each(["bg", "en", "ru"])(
  "labels content states and retains evidence in %s details",
  async (locale) => {
    const session = {} as Session;
    const { container } = render(
      <>
        {await ContentListScreen({ locale, session })}
        {await ContentWorkbenchScreen({ locale, session, id: fixture.page.id })}
      </>,
    );
    const primary = container.cloneNode(true) as HTMLElement;
    for (const details of primary.querySelectorAll("details")) details.remove();
    for (const raw of [
      "never_published",
      "legal_process_claim",
      fixture.placeId,
      "exact_content_hash",
    ])
      expect(primary.textContent).not.toContain(raw);
    expect(primary.textContent).toContain("Keep_source_text_exact.");
    expect(primary.textContent).toContain("Keep_decision_note_exact.");
    for (const raw of [
      "never_published",
      "legal_process_claim",
      fixture.placeId,
      "exact_content_hash",
    ])
      expect(container.textContent).toContain(raw);
  },
);

it.each(["bg", "en", "ru"])(
  "covers the canonical review and publication states in %s",
  (locale) => {
    const groups = {
      review: approvalKinds,
      state: approvalStates,
      publication: publicationStates,
      operation: operationStatuses,
    };
    for (const [group, values] of Object.entries(groups))
      for (const value of values)
        expect(contentLabel(group as keyof typeof groups, value, locale)).not.toMatch(
          /Requires review|Нужен е преглед|Требуется проверка/,
        );
    expect(contentLabel("publication", "future_internal_state", locale)).not.toContain(
      "future_internal_state",
    );
  },
);
