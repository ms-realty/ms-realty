import { expect, it } from "vitest";
import { sha256 } from "./manifest";
import { type LegacyPage, legacySnapshotPages } from "./pages";
import { cleanArchiveText, presentLegacyPage } from "./presentation";

const pages = legacySnapshotPages();
const existing = (id: string) => {
  const page = pages.find((page) => page.id === id);
  if (!page) throw new Error(`Missing recorded source ${id}`);
  return page;
};

it("P21 / M-072 removes observed shortcode, share and form residue while preserving unknown markup and editorial brackets", () => {
  for (const tail of [
    "Tweet Name Email Phone Message Send",
    "Tweet Име Email Телефон Съобщение Изпрати",
    "Tweet Ваше имя Email Телефон Сообщение Оставить заявку",
  ])
    expect(cleanArchiveText(`Original facts. ${tail}`)).toBe("Original facts.");
  expect(
    cleanArchiveText("Original [si-contact-form form=’4′] text email: [email protected]"),
  ).toBe("Original text");
  expect(
    cleanArchiveText("[wp-ultimate-search-bar] [wp-ultimate-search-results] [wp_html_sitemap]"),
  ).toBe("");
  const editorial =
    "Text […] [1] [unknown-plugin field='retain'] Tweet is a word. Name Email are prose.";
  expect(cleanArchiveText(editorial)).toBe(editorial);
  // HTML remains escaped text at render; it never becomes executable source markup.
  expect(cleanArchiveText("<script>source()</script>")).toBe("<script>source()</script>");
});

it("P21 shows current capture fields literally and never borrows normalized frozen price/area/bedrooms", () => {
  const original = existing("0060c155d560ff91e51b4193");
  if (!original.listing) throw new Error("Missing recorded listing projection");
  const shown = presentLegacyPage(original);
  expect(shown.facts).toEqual(original.listing?.liveSourceFields);
  expect(shown.facts.length).toBeGreaterThan(5);
  expect(shown.bodyText).not.toContain(shown.facts[0]?.label);
  expect(shown.bodyText).not.toContain("Tweet");
  const conflictingFrozen = {
    ...original,
    listing: {
      ...original.listing,
      price: { amount: 1, currency: "USD", period: null, on_request: false },
      bedrooms: { count: 99, recorded: true },
      areas: { recorded: [{ value: 999 }] },
    },
  };
  expect(presentLegacyPage(conflictingFrozen)).toEqual(shown);
});

it("P21 can group an exact title-bounded archived prefix without changing any recorded values", () => {
  const original = existing("0442585901845f0312ec1ad0");
  expect(original.listing?.liveSourceFields).toBeUndefined();
  const shown = presentLegacyPage(original);
  expect(shown.facts.length).toBeGreaterThan(5);
  for (const field of shown.facts)
    expect(original.bodyText).toContain(`${field.label} ${field.value}`);
  expect(shown.bodyText).not.toContain(shown.facts[0]?.label);
  expect(shown.bodyText.length).toBeGreaterThan(100);
});

it("P21 leaves ambiguous leading price/status prose intact and does not fill missing facts", () => {
  const original = existing("227746f0c373db10c7931839");
  expect(original.listing?.liveSourceFields).toBeUndefined();
  const shown = presentLegacyPage(original);
  expect(shown.facts).toEqual([]);
  expect(shown.bodyText.startsWith(original.bodyText.slice(0, 150))).toBe(true);
  const unknown = { ...original, bodyText: "Unstructured source. No safe field boundaries." };
  expect(presentLegacyPage(unknown).facts).toEqual([]);
  expect(presentLegacyPage(unknown).bodyText).toBe(unknown.bodyText);
});

it("P21 removes unsafe/share links and duplicates while preserving the exact destination and best recorded label", () => {
  const original = existing("042922f874af5e9cf3f6092d");
  const shown = presentLegacyPage(original);
  expect(shown.contentLinks.length).toBeLessThan(original.contentLinks?.length ?? 0);
  expect(new Set(shown.contentLinks.map((link) => link.url)).size).toBe(shown.contentLinks.length);
  for (const link of shown.contentLinks) expect(original.contentLinks).toContainEqual(link);
  const synthetic = {
    ...original,
    contentLinks: [
      { url: "javascript:alert(1)", text: "Unsafe" },
      { url: "https://user:password@example.test/", text: "Credentials" },
      { url: "https://twitter.com/intent/tweet", text: "Share" },
      { url: "https://example.test/item", text: "Tweet" },
      { url: "tel:+10000000000", text: "Unsupported synthetic phone" },
      { url: "https://example.test/item", text: "https://example.test/item" },
      { url: "https://example.test/item", text: "Recorded title" },
    ],
  };
  expect(presentLegacyPage(synthetic).contentLinks).toEqual([
    { url: "https://example.test/item", text: "Recorded title" },
  ]);
});

it("P21 presentation leaves both legacy hosts, every raw body hash, provenance, media and exact URL identity unchanged", () => {
  const unchanged = JSON.stringify(pages);
  expect(new Set(pages.map((page) => page.sourceHost))).toEqual(
    new Set(["makler-realty.com", "makler-realty.ru"]),
  );
  for (const page of pages) {
    const shown = presentLegacyPage(page);
    expect(sha256(page.bodyText)).toBe(page.sourceHash);
    expect(page.canonicalPath).toBe(`/${page.locale}/legacy/${page.id}`);
    if (page.contentState === "verified_empty_archive") {
      expect(shown.bodyText).toBe("");
      expect(shown.facts).toEqual([]);
    }
    for (const field of shown.facts) {
      const structured = page.listing?.liveSourceFields as
        | { label: string; value: string }[]
        | undefined;
      if (structured?.length) expect(structured).toContainEqual(field);
      else expect(page.bodyText).toContain(`${field.label} ${field.value}`);
    }
  }
  expect(JSON.stringify(pages)).toBe(unchanged);
});

it("P21 does not substitute a literal zero, unreviewed proposal or unknown quantity for an absent source field", () => {
  const original = existing("0442585901845f0312ec1ad0");
  const page: LegacyPage = { ...original, bodyText: "No structured facts in this preserved text." };
  expect(presentLegacyPage(page).facts).toEqual([]);
});

it("P21 retains a title-shaped sentence subject and ambiguous unknown field labels", () => {
  const original = existing("0442585901845f0312ec1ad0");
  const sentence = {
    ...original,
    title: "Synthetic place",
    bodyText: "Synthetic place is an inland destination.",
  };
  expect(presentLegacyPage(sentence).bodyText).toBe(sentence.bodyText);
  const unknownField = {
    ...original,
    title: "Synthetic source",
    bodyText: "No: 12 Country: Recorded Unknown:unqualified Price: 1 EUR Synthetic source",
  };
  expect(presentLegacyPage(unknownField)).toMatchObject({
    facts: [],
    bodyText: unknownField.bodyText,
  });
});
