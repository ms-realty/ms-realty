import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PublicListingDetail } from "@/server/listings/view-models";
import PropertyPage from "../../../app/public/[locale]/(site)/properties/[reference]/[slug]/page";
import { mapCopy } from "./map-copy";

const source = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/server/seo/public-metadata", () => ({
  normalizePublicListingRoute: (params: unknown) => params,
  readPublicSeoListing: source.read,
  publicListingUrl: async () => "https://public.example.test/en/properties/MS-10001/ms-10001",
  publicListingMetadata: vi.fn(),
}));
vi.mock("@/server/publication/map-config", () => ({ publicMapRelease: () => "a".repeat(64) }));
vi.mock("@/ui/structured-data", () => ({ StructuredData: () => null }));
// Keep the real map adapter, markers and popup labels. Only the WebGL engine is replaced.
vi.mock("maplibre-gl", () => ({
  addProtocol: vi.fn(),
  setWorkerUrl: vi.fn(),
  NavigationControl: class {},
  LngLatBounds: class {
    extend() {}
    isEmpty() {
      return false;
    }
  },
  Map: class {
    container: HTMLElement;
    canvas = document.createElement("canvas");
    constructor({ container }: { container: HTMLElement }) {
      this.container = container;
      container.append(this.canvas);
    }
    addControl() {}
    fitBounds() {}
    getCanvas() {
      return this.canvas;
    }
    on() {}
    once(_event: string, ready: () => void) {
      queueMicrotask(ready);
    }
    remove() {
      this.container.replaceChildren();
    }
  },
  Popup: class {
    content?: HTMLElement;
    setDOMContent(content: HTMLElement) {
      this.content = content;
      return this;
    }
  },
  Marker: class {
    element: HTMLElement;
    content?: HTMLElement;
    constructor({ element }: { element: HTMLElement }) {
      this.element = element;
    }
    setLngLat() {
      return this;
    }
    setPopup({ content }: { content: HTMLElement }) {
      this.content = content;
      return this;
    }
    addTo({ container }: { container: HTMLElement }) {
      container.append(this.element);
      if (this.content) container.append(this.content);
      return this;
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ["bg", "Синтетичен град", "bg"],
  ["en", "Synthetic town", "bg-Latn"],
] as const)(
  "P05/UI16 gives the %s detail marker and popup a readable recorded locality",
  async (locale, name, language) => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const listing: PublicListingDetail = {
      reference: "MS-10001",
      slug: "ms-10001",
      manifestId: "00000000-0000-4000-8000-000000000001",
      locale,
      title: "Synthetic map label review",
      purpose: "sale",
      propertyType: "apartment",
      price: { state: "not_supplied" },
      area: { state: "not_supplied" },
      bedrooms: { state: "not_supplied" },
      place: {
        country: "BG",
        district: null,
        municipality: null,
        settlement: {
          id: "00000000-0000-4000-8000-000000000002",
          level: "settlement",
          slug: "synthetic-town",
          name,
          nameNative: "Синтетичен град",
          nameLatin: "Synthetic town",
        },
        neighborhood: "Synthetic source neighborhood",
        precision: "settlement",
        mapPoint: {
          latitude: 41,
          longitude: 23,
          placeId: "00000000-0000-4000-8000-000000000002",
          level: "settlement",
        },
      },
      availability: {
        presented: "confirmation_required",
        freshness: "review_due",
        confirmedAt: null,
        primaryAction: "ask_question",
      },
      cover: null,
      description: null,
      facts: [],
      media: [],
      toConfirm: [],
      responsibleTeam: { label: "MS Realty" },
      indexable: false,
      publishedAt: new Date(0).toISOString(),
    };
    source.read.mockResolvedValue({ status: "listing", listing, alternatives: [] });
    const view = render(
      await PropertyPage({
        params: Promise.resolve({ locale, reference: listing.reference, slug: listing.slug }),
      }),
    );
    expect(
      within(view.container.querySelector("header") as HTMLElement).getByText(name),
    ).toHaveAttribute("lang", language);
    fireEvent.click(screen.getByRole("button", { name: mapCopy(locale, "listing").show }));
    const label = `${listing.reference} · Synthetic source neighborhood, ${name}`;
    expect(await screen.findByRole("button", { name: label })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const link = screen.getByRole("link", { name: `${mapCopy(locale, "listing").open}: ${label}` });
    expect(link).toHaveAttribute("href", `/${locale}/properties/MS-10001/ms-10001`);
    expect(view.container).not.toHaveTextContent("[object Object]");
  },
);
