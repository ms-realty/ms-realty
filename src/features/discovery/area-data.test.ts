import { beforeEach, expect, it, vi } from "vitest";
import type { ApprovedArea } from "@/server/content/public";
import type { Executor } from "@/server/db";
import { loadAreaData } from "./area-data";

const { guides, places, search } = vi.hoisted(() => ({
  guides: vi.fn(),
  places: vi.fn(),
  search: vi.fn(),
}));
vi.mock("@/server/content/public", () => ({
  readApprovedAreas: guides,
  readApprovedContent: async () => null,
}));
vi.mock("@/server/search/search", () => ({ listSearchPlaces: places, searchListings: search }));
const db = {} as Executor;
const place = {
  id: "00000000-0000-4000-8000-000000000001",
  level: "settlement",
  name: "Approved place",
  count: 1,
};
const guide = {
  title: "Approved guide",
  placeId: place.id,
  geography: [place],
} as unknown as ApprovedArea;
beforeEach(() => {
  vi.resetAllMocks();
  guides.mockResolvedValue([]);
  places.mockResolvedValue([place]);
  search.mockResolvedValue({ items: [] });
});

it("P15 cannot use global inventory as a guide photograph without an explicit approved binding", async () => {
  guides.mockResolvedValue([{ ...guide, placeId: null, geography: [] }]);
  const result = await loadAreaData(db, "bg");
  expect(result.featured).toBeNull();
  expect(search).not.toHaveBeenCalled();
  expect(result.locations).toHaveLength(1);
});

it("P15 binds every preview query to the featured guide's exact recorded place", async () => {
  guides.mockResolvedValue([guide]);
  const photo = { reference: "MS-99999", cover: { kind: "photo" } };
  search.mockResolvedValue({ items: [photo] });
  expect((await loadAreaData(db, "bg")).featured).toBe(photo);
  expect(search).toHaveBeenCalledExactlyOnceWith(db, {
    locale: "bg",
    purpose: "sale",
    placeIds: [place.id],
    pageSize: 4,
    sort: "newest",
  });
});

it("P15 presents partial inventory failures as unavailable and never exposes a partial count", async () => {
  places.mockImplementation((_db, input) =>
    input.purpose === "sale" ? Promise.resolve([place]) : Promise.reject(new Error("DB failure")),
  );
  const result = await loadAreaData(db, "bg");
  expect(result.inventoryFailed).toBe(true);
  expect(result.locations).toEqual([]);
  expect(result.featured).toBeNull();
});

it("P15 offers a deliberate BG switch without mixing source prose into an unapproved locale", async () => {
  guides.mockImplementation((_db, locale) => Promise.resolve(locale === "bg" ? [guide] : []));
  const result = await loadAreaData(db, "en");
  expect(result.guides).toEqual([]);
  expect(result.featured).toBeNull();
  expect(result.sourceAvailable).toBe(true);
  expect(search).not.toHaveBeenCalled();
});
