import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { IntakeDraftPanel, IntakeSourcePanel } from "./intake-screen";
import { LocaleSourcePanel } from "./locale-screen";
import { AssistanceScreen, JobsScreen } from "./screens";

const fixture = vi.hoisted(() => ({
  id: "00000000-0000-4000-8000-000000000001",
  source: {
    id: "synthetic-inquiry",
    version: 1,
    fields: {
      reference: "RQ-TEST-0001",
      purpose: "viewing_request",
      locale: "bg",
      message: "Keep_source_message_exact.",
    },
  },
  status: {
    checkedAt: new Date(0).toISOString(),
    worker: { state: "stale", reason: "other_build", completedAt: new Date(0).toISOString() },
    provider: { enabled: false, model: "configured_model_reference", dailyLimitMicros: 1000000 },
    spend: { known: "520", reserved: "14999" },
    jobs: [
      {
        name: "auth.email_link",
        state: "retry",
        count: "2",
        oldest: new Date(0),
        lastCompleted: null,
      },
    ],
    runs: [],
    inbox: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        provider: "resend",
        eventType: "email.delivery_delayed",
        state: "received",
        code: "provider_rate_limited",
        receivedAt: new Date(0),
      },
    ],
    external: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        kind: "email_send",
        state: "outcome_unknown",
        code: "provider_unreachable",
        at: new Date(0),
        attempts: 1,
      },
    ],
    externalNavigation: null,
  },
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/ai/operations", () => ({ readAssistanceOperations: async () => fixture.status }));
vi.mock("@/server/ai/config", () => ({ assistanceAvailability: () => ({ enabled: false }) }));
vi.mock("@/server/ai/assistance", () => ({
  readAssistanceSource: async () => fixture.source,
  listAssistanceRuns: async () => [],
  readAssistanceOperation: vi.fn(),
  readAssistanceRun: vi.fn(),
  listIntakeAssistanceRuns: vi.fn(),
  readIntakeAssistanceOperation: vi.fn(),
  listLocaleAssistanceRuns: vi.fn(),
  readLocaleAssistanceOperation: vi.fn(),
}));
afterEach(cleanup);
const session = {} as Session;
function primaryText(container: HTMLElement) {
  const primary = container.cloneNode(true) as HTMLElement;
  for (const detail of primary.querySelectorAll("details")) detail.remove();
  return primary.textContent ?? "";
}

it.each(["bg", "en", "ru"])(
  "keeps job names, provider codes, UUIDs and raw budgets in %s technical details",
  async (locale) => {
    const { container } = render(await JobsScreen({ locale, session }));
    const text = primaryText(container);
    for (const code of [
      fixture.id,
      "auth.email_link",
      "outcome_unknown",
      "other_build",
      "provider_rate_limited",
      "email.delivery_delayed",
      "configured_model_reference",
      "USD µ",
    ])
      expect(text).not.toContain(code);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(container.textContent).toContain(fixture.id);
    expect(container.textContent).toContain("auth.email_link");
    expect(container.textContent).toContain("other_build");
    expect(container.textContent).toContain("14999");
  },
);

it("labels included source metadata while retaining the exact message and original purpose", async () => {
  const { container } = render(
    await AssistanceScreen({ locale: "bg", sourceId: fixture.source.id, session }),
  );
  expect(primaryText(container)).toContain("Keep_source_message_exact.");
  expect(primaryText(container)).toContain("Заявка за оглед");
  expect(primaryText(container)).not.toContain("viewing_request");
  expect(container.textContent).toContain("viewing_request");
});

it("labels note-derived candidate metadata without rewriting quoted evidence or fact values", () => {
  const output = {
    candidates: [
      {
        field: "area",
        state: "known",
        sourceClass: "broker_note",
        warning: "",
        values: [
          {
            value: "52.50",
            unit: "m2",
            basis: "built_up",
            source: { field: "note", start: 0, end: 5, quote: "Exact_source_quote." },
          },
        ],
      },
    ],
    missing: ["bedrooms"],
    warnings: [],
  } as Parameters<typeof IntakeDraftPanel>[0]["output"];
  const { container } = render(<IntakeDraftPanel locale="bg" output={output} />);
  expect(primaryText(container)).toContain("52.50 m²");
  expect(primaryText(container)).toContain("Exact_source_quote.");
  expect(primaryText(container)).toContain("Застроена площ");
  expect(primaryText(container)).not.toContain("built_up");
  expect(primaryText(container)).not.toContain("bedrooms");
  expect(container.textContent).toContain("built_up");
});

it("keeps note hashes and protected-fact JSON in technical disclosures", () => {
  const note = {
    id: fixture.id,
    version: 7,
    listingId: fixture.id,
    reference: "MS-00001",
    noteDigest: "a".repeat(64),
    factDigest: "b".repeat(64),
    fields: { note: "Exact_broker_note." },
  };
  const source = {
    reference: "MS-00001",
    targetLocale: "he",
    sourceUrl: "https://example.test/bg/properties/MS-00001/property",
    fields: { title: "Exact source title", description: "Exact_source_description." },
    protectedFacts: { field_key: "exact_recorded_value" },
  } as unknown as Parameters<typeof LocaleSourcePanel>[0]["source"];
  const { container } = render(
    <>
      <IntakeSourcePanel locale="bg" source={note} />
      <LocaleSourcePanel locale="bg" source={source} />
    </>,
  );
  expect(primaryText(container)).toContain("Exact_broker_note.");
  expect(primaryText(container)).not.toContain(note.noteDigest);
  expect(primaryText(container)).not.toContain("field_key");
  expect(container.textContent).toContain(note.noteDigest);
  expect(container.textContent).toContain("exact_recorded_value");
});
