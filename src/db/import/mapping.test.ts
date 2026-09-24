// F32 mapping over the real frozen extraction: unknown stays unknown, nothing is approved,
// published or made indexable by the import.
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildImportItems,
  type ContentItem,
  type ImportItem,
  type ListingItem,
  type MediaItem,
  type PlaceItem,
  type UrlDecisionItem,
} from "./mapping";
import { type LegacySources, loadLegacySources } from "./sources";

let sources: LegacySources;
let items: ImportItem[];
const ofType = <T extends ImportItem>(type: T["type"]) =>
  items.filter((i): i is T => i.type === type);
const listing = (reference: string) =>
  ofType<ListingItem>("listing").find((l) => l.reference === reference) as ListingItem;
const factOf = (l: ListingItem, key: string) => l.facts.find((f) => f.fieldKey === key);
/** Every fact the legacy record gave, including a merged duplicate's evidence-only ones. */
const recorded = (l: ListingItem) =>
  l.version.snapshot.facts as Record<string, { state: string; value: unknown }>;

beforeAll(async () => {
  sources = await loadLegacySources();
  items = buildImportItems(sources);
});

describe("legacy import mapping (F32)", () => {
  it("maps every legacy record to one item with a unique source key", () => {
    expect(ofType("listing")).toHaveLength(165);
    expect(ofType("media")).toHaveLength(1725);
    expect(ofType("content_page")).toHaveLength(8);
    expect(ofType("place")).toHaveLength(48);
    expect(new Set(items.map((i) => i.sourceKey)).size).toBe(items.length);
  });

  it("keeps all 457 URL decisions, folding spellings of one request key", () => {
    const urls = ofType<UrlDecisionItem>("url_decision");
    const spellings = urls.flatMap(
      (u) => u.decision.evidence.legacySpellings as { sourceUrl: string }[],
    );
    expect(urls).toHaveLength(454);
    expect(spellings).toHaveLength(457);
    const byStatus = (status: number) =>
      urls
        .filter((u) => u.decision.statusCode === status)
        .reduce((n, u) => n + (u.decision.evidence.legacySpellings as unknown[]).length, 0);
    expect([byStatus(301), byStatus(410), byStatus(200)]).toEqual([179, 268, 10]);
    expect(urls.filter((u) => u.listingRef)).toHaveLength(165);
    expect(urls.filter((u) => u.issues.some((i) => i.severity === "blocking"))).toEqual([]);
  });

  it("never turns an unrecorded value into zero or false", () => {
    for (const l of ofType<ListingItem>("listing")) {
      for (const f of l.facts) {
        if (f.state !== "known") expect(f.value, `${l.reference} ${f.fieldKey}`).toBeNull();
      }
      expect(recorded(l).rooms?.state).toBe("unknown");
    }
    const legacy = new Map(sources.listings.listings.map((l) => [l.reference.id, l]));
    for (const l of ofType<ListingItem>("listing").filter((i) => !i.mergedInto)) {
      const bedrooms = legacy.get(l.reference)?.bedrooms;
      const fact = factOf(l, "bedrooms");
      const propertyNotApplicable = bedrooms?.property_verification_state === "not_applicable";
      if (bedrooms?.recorded && !propertyNotApplicable) {
        expect(fact).toMatchObject({ state: "known", value: bedrooms.count });
      } else if (!bedrooms?.recorded && (bedrooms?.not_applicable || propertyNotApplicable)) {
        expect(fact?.state).toBe("not_applicable");
      } else expect(fact?.state).toBe("unknown");
    }
  });

  it("a legacy 0-bedroom placeholder is not a known count", () => {
    // MS-00101's source text describes a living room with kitchen, a bedroom and a WC.
    expect(factOf(listing("MS-00101"), "bedrooms")).toMatchObject({
      state: "unknown",
      value: null,
    });
    const zeros = ofType<ListingItem>("listing").filter(
      (l) => factOf(l, "bedrooms")?.state === "known" && factOf(l, "bedrooms")?.value === 0,
    );
    expect(zeros).toEqual([]);
  });

  it("the legacy property's not-applicable bedrooms state is kept; disagreement is not a fact", () => {
    expect(factOf(listing("MS-00815"), "bedrooms")?.state).toBe("not_applicable");
    const conflict = listing("MS-00873");
    expect(factOf(conflict, "bedrooms")?.state).toBe("unknown");
    expect(conflict.issues.map((i) => i.code)).toContain("bedrooms_conflict");
  });

  it("a sale record whose source headline advertises a rental gets no known sale price", () => {
    const contradicted = ofType<ListingItem>("listing").filter((l) =>
      l.issues.some((i) => i.code === "purpose_contradicts_source"),
    );
    expect(contradicted.map((l) => l.reference).sort()).toEqual([
      "MS-CRAWL-0148",
      "MS-CRAWL-0149",
      "MS-CRAWL-0162",
    ]);
    for (const l of contradicted) expect(factOf(l, "price")?.state).toBe("unknown");
  });

  it("a default-mapped 'Sandanski' area label is placed in the municipality, not the town", () => {
    const areaOnly = ofType<ListingItem>("listing").filter((l) =>
      l.issues.some((i) => i.code === "location_settlement_unreviewed"),
    );
    expect(areaOnly).toHaveLength(14);
    for (const l of areaOnly) {
      expect(l.placeKey).toBe("place:BG:sandanski-municipality");
      expect(l.property.publicPrecision).toBe("region");
      expect(recorded(l).location?.value).toMatchObject({ settlement: null });
    }
    expect(listing("MS-00816").placeKey).toBe("place:BG:sandanski-municipality");
  });

  it("a merged duplicate joins its survivor's property and brings no property facts", () => {
    const duplicates = ofType<ListingItem>("listing").filter((l) => l.mergedInto);
    expect(duplicates).toHaveLength(38);
    for (const d of duplicates) {
      expect(d.facts.every((f) => f.subject === "listing")).toBe(true);
    }
    const dup = listing("MS-CRAWL-0144");
    expect(dup.mergedInto).toBe("MS-00749");
    expect(dup.issues.find((i) => i.code === "merged_duplicate_facts_differ")?.message).toMatch(
      /location/,
    );
    // Survivors are applied before the duplicates that depend on them.
    const order = ofType<ListingItem>("listing").map((l) => Boolean(l.mergedInto));
    expect(order.indexOf(true)).toBe(order.lastIndexOf(false) + 1);
  });

  it("a locality label is never an alias of a whole municipality", () => {
    const municipalities = ofType<PlaceItem>("place").filter(
      (p) => p.place.level === "municipality",
    );
    const names = municipalities.flatMap((m) => m.aliases.map((a) => a.name));
    expect(names).not.toContain("Derbere, Sandanski");
    expect(names).not.toContain("Elani-Sani, Halkidiki");
  });

  it("imports no media dimensions: the legacy sizes are thumbnail requests", () => {
    for (const m of ofType<MediaItem>("media")) {
      expect(m.asset.width).toBeNull();
      expect(m.asset.height).toBeNull();
    }
  });

  it("keeps price on request explicit and a rent amount without a guessed period", () => {
    const prices = ofType<ListingItem>("listing").map((l) => factOf(l, "price"));
    expect(prices.filter((p) => p?.state === "withheld")).toHaveLength(31);
    const sale = ofType<ListingItem>("listing").find(
      (l) => l.listing.purpose === "sale" && factOf(l, "price")?.state === "known",
    ) as ListingItem;
    expect(factOf(sale, "price")?.value).toMatchObject({ currency: "EUR", period: "total" });
    const rents = ofType<ListingItem>("listing").filter(
      (l) => l.listing.purpose === "long_term_rent" && factOf(l, "price.amount_without_period"),
    );
    expect(rents).toHaveLength(15);
    for (const r of rents) expect(factOf(r, "price")?.state).toBe("unknown");
  });

  it("imports areas only from recorded human decisions, with their legacy basis", () => {
    const withArea = ofType<ListingItem>("listing").filter((l) =>
      Object.keys(recorded(l)).some((key) => key.startsWith("area.")),
    );
    expect(withArea).toHaveLength(111);
    expect(factOf(listing("MS-00815"), "area.usable")).toMatchObject({
      state: "known",
      value: { value: 1394, unit: "m2", basis: "usable" },
    });
  });

  it("records commercial availability at the freeze, never as available", () => {
    const states = ofType<ListingItem>("listing").map((l) => l.listing.commercialState);
    expect(states.filter((s) => s === "availability_unconfirmed")).toHaveLength(30);
    expect(states.filter((s) => s === "withdrawn")).toHaveLength(135);
    for (const l of ofType<ListingItem>("listing")) {
      expect(l.version.snapshot.commercial).toHaveProperty("reason");
      expect(l.listing.availabilityCheckedAt !== null).toBe(
        l.listing.commercialState === "availability_unconfirmed",
      );
    }
  });

  it("drafts every legacy translation and binds the owner approval to version 1", () => {
    const listings = ofType<ListingItem>("listing");
    const translations = listings.flatMap((l) => l.translations);
    expect(translations).toHaveLength(990);
    expect(translations.some((t) => t.locale === "bg")).toBe(false);
    for (const l of listings) {
      expect(l.approval).toMatchObject({
        kind: "legacy_owner_publication_approval",
        scope: { evidenceReference: "MSR-LISTING-PUBLICATION-1" },
      });
      expect(l.approval?.scope.doesNotCover).toEqual(
        expect.arrayContaining(["translation approval", "translation indexability"]),
      );
    }
    const ruSource = listings.filter((l) =>
      l.issues.some((i) => i.code === "bg_source_text_unreviewed"),
    );
    expect(ruSource).toHaveLength(52);
    for (const l of ruSource) {
      expect(l.version.snapshot.text).toMatchObject({ humanReviewed: false });
      expect(l.version.snapshot.legacySource).toMatchObject({ locale: "ru" });
    }
  });

  it("stages media without rights, and never guesses an owner for shared objects", () => {
    const media = ofType<MediaItem>("media");
    const blocked = media.filter((m) => m.issues.some((i) => i.severity === "blocking"));
    expect(blocked).toHaveLength(13);
    expect(blocked.every((m) => m.issues.some((i) => i.code === "no_listing"))).toBe(true);
    const shared = media.filter((m) => m.issues.some((i) => i.severity === "review"));
    expect(shared.every((m) => m.ownerListingRef === null)).toBe(true);
    // An archived duplicate's photos belong to the listing it was merged into.
    const merged = new Set(
      sources.listings.listings.filter((l) => l.legacy_ids.merged_into).map((l) => l.reference.id),
    );
    const viaDuplicate = media.filter(
      (m) => m.ownerListingRef && m.shownIn.some((r) => merged.has(r.reference)),
    );
    expect(viaDuplicate.length).toBeGreaterThan(0);
    for (const m of viaDuplicate) expect(merged.has(m.ownerListingRef as string)).toBe(false);
  });

  it("resolves every listing and area guide to a place; no area guide claims sea access", () => {
    for (const l of ofType<ListingItem>("listing")) expect(l.placeKey).not.toBeNull();
    const sandanski = ofType<PlaceItem>("place").find((p) => p.place.slug === "sandanski");
    expect(sandanski?.place).toMatchObject({
      level: "settlement",
      registryId: "BG:settlement:65334",
    });
    const areas = ofType<ContentItem>("content_page").filter((c) => c.kind === "area");
    // The Petrich guide is about the municipality, not the town.
    expect(areas.map((a) => a.placeKey)).toEqual([
      "place:BG:hotovo",
      "place:BG:petrich-municipality",
    ]);
    const petrichGuide = ofType<ContentItem>("content_page").find(
      (c) => c.slug === "petrich-municipality-official-context",
    );
    expect(petrichGuide?.placeKey).toBe("place:BG:petrich-municipality");
    for (const a of areas) expect(a.version.body.sea_access).toBe(false);
  });
});
