import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { listingRevisions, propertyFacts } from "@/db/schema";
import { FrozenPreview } from "./frozen-preview";

afterEach(cleanup);
const revision = {
  revisionNumber: 7,
  sourceCopy: { text: { title: "Exact source title", description: "Keep_source_prose_exact." } },
  terms: {},
} as unknown as typeof listingRevisions.$inferSelect;
const facts = [
  {
    id: "first",
    fieldKey: "feature.step_free_access",
    state: "known",
    value: false,
    sourceReference: "00000000-0000-4000-8000-000000000001",
    sourceLanguage: "bg",
  },
  {
    id: "second",
    fieldKey: "feature.future_internal_key",
    state: "known",
    value: "Keep_arbitrary_property_value_exact.",
    sourceReference: "Exact_source_reference",
    sourceLanguage: "bg",
  },
] as unknown as (typeof propertyFacts.$inferSelect)[];

it.each(["bg", "en", "ru"])(
  "keeps exact fact values and source text while moving keys and revision metadata out of the %s preview",
  (locale) => {
    const { container } = render(
      <FrozenPreview locale={locale} reference="MS-00001" revision={revision} facts={facts} />,
    );
    const primary = container.cloneNode(true) as HTMLElement;
    for (const detail of primary.querySelectorAll("details")) detail.remove();
    expect(primary.textContent).toContain("Keep_source_prose_exact.");
    expect(primary.textContent).toContain("Keep_arbitrary_property_value_exact.");
    expect(primary.textContent).not.toContain("feature.");
    expect(primary.textContent).not.toContain("00000000-0000");
    expect(container.textContent).toContain("feature.future_internal_key");
    expect(container.textContent).toContain("00000000-0000-4000-8000-000000000001");
    expect(screen.getByRole("heading", { level: 3 })).not.toHaveTextContent("7");
  },
);
