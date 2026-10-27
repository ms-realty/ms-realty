import { layers, namedFlavor } from "@protomaps/basemaps";
import {
  addProtocol,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import type { MapBounds } from "@/domain/search/map-bounds";
import type { PublicLocale } from "@/i18n/config";
import type { MapCopy } from "./map-copy";
import type { MapListing } from "./search-map";
import "maplibre-gl/dist/maplibre-gl.css";

// Registered once per browser module, independent of map mount/unmount.
const protocol = new Protocol();
addProtocol("pmtiles", protocol.tile);
setWorkerUrl("/map-runtime/v6.15.0/maplibre-gl-worker.mjs");
export interface MapController {
  destroy(): void;
  select(reference: string | null): void;
}

export function renderMap(
  container: HTMLElement,
  items: readonly MapListing[],
  locale: PublicLocale,
  release: string,
  copy: MapCopy,
  ready: () => void,
  failed: () => void,
  interactions?: {
    select(reference: string): void;
    moved(bounds: MapBounds): void;
    bounds?: MapBounds | null;
  },
): MapController {
  const base = `${window.location.origin}/maps/${release}`;
  // PMTiles retains rejected header promises. A user retry must get a fresh archive cache.
  protocol.add(new PMTiles(`${base}/basemap.pmtiles`));
  const map = new MapLibreMap({
    container,
    locale: {
      "NavigationControl.ZoomIn": copy.zoomIn,
      "NavigationControl.ZoomOut": copy.zoomOut,
      "Popup.Close": copy.close,
      "CooperativeGesturesHandler.WindowsHelpText": copy.cooperativeWindows,
      "CooperativeGesturesHandler.MacHelpText": copy.cooperativeMac,
      "CooperativeGesturesHandler.MobileHelpText": copy.cooperativeTouch,
    },
    center: [24, 40],
    zoom: 5,
    attributionControl: false,
    // No user location access; a scroll through results must not unexpectedly zoom the map.
    scrollZoom: false,
    cooperativeGestures: true,
    renderWorldCopies: false,
    maxBounds: [
      [-180, -85.05112878],
      [180, 85.05112878],
    ],
    style: {
      version: 8,
      glyphs: `${base}/fonts/{fontstack}/{range}.pbf`,
      sprite: `${base}/sprites/light`,
      sources: { protomaps: { type: "vector", url: `pmtiles://${base}/basemap.pmtiles` } },
      layers: layers("protomaps", namedFlavor("light"), { lang: locale }),
    },
    transformRequest: (url) => {
      const parsed = new URL(url.replace(/^pmtiles:\/\//, ""), window.location.origin);
      if (parsed.origin !== window.location.origin)
        throw new Error("Map resources must be same-origin");
      return { url };
    },
  });
  map.addControl(new NavigationControl({ showCompass: false }));
  const bounds = new LngLatBounds();
  // Shared area centres use one marker containing every listing, never stacked inaccessible pins.
  const groups = new globalThis.Map<string, MapListing[]>();
  const controls: { element: HTMLButtonElement; references: string[] }[] = [];
  const select = (reference: string | null) => {
    for (const control of controls) {
      const selected = reference !== null && control.references.includes(reference);
      control.element.setAttribute("aria-pressed", String(selected));
      control.element.style.boxShadow = selected ? "0 0 0 3px var(--color-focus)" : "";
    }
  };
  for (const item of items) {
    const key = `${item.point.latitude}/${item.point.longitude}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const coordinates: [number, number] = [first.point.longitude, first.point.latitude];
    bounds.extend(coordinates);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "msr-map-marker";
    button.textContent =
      group.length === 1 ? (first.price ?? String(group.length)) : String(group.length);
    button.style.borderRadius = "999px";
    button.style.paddingInline = "0.75rem";
    button.style.whiteSpace = "nowrap";
    button.setAttribute("aria-label", group.map((item) => item.label).join("; "));
    controls.push({ element: button, references: group.map((item) => item.reference) });
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      select(first.reference);
      interactions?.select(first.reference);
    });
    const content = document.createElement("div");
    content.className = "space-y-3 max-h-64 overflow-auto";
    for (const item of group) {
      const p = document.createElement("p");
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "block min-h-control text-start font-semibold underline";
      choose.textContent = `${copy.select}: ${item.reference}${item.price ? ` · ${item.price}` : ""}`;
      choose.setAttribute("aria-pressed", "false");
      choose.addEventListener("click", () => {
        select(item.reference);
        interactions?.select(item.reference);
      });
      controls.push({ element: choose, references: [item.reference] });
      const link = document.createElement("a");
      link.href = item.href;
      link.className = "block underline";
      const label = document.createElement("bdi");
      label.textContent = item.label;
      link.append(document.createTextNode(`${copy.open}: `), label);
      p.append(choose, link);
      content.append(p);
    }
    const popup = new Popup({
      offset: 28,
      closeButton: true,
      focusAfterOpen: true,
      maxWidth: "300px",
    }).setDOMContent(content);
    new Marker({ element: button }).setLngLat(coordinates).setPopup(popup).addTo(map);
  }
  const committed = interactions?.bounds;
  if (committed)
    map.fitBounds(
      [
        [committed.west, committed.south],
        [committed.east, committed.north],
      ],
      { padding: 20, maxZoom: 12, duration: 0 },
    );
  else if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 0 });
  let userMoved = false;
  map.on("movestart", (event) => {
    if (event.originalEvent) userMoved = true;
  });
  map.on("moveend", () => {
    if (!userMoved) return;
    userMoved = false;
    const view = map.getBounds();
    interactions?.moved({
      west: Math.max(-180, view.getWest()),
      south: Math.max(-85.05112878, view.getSouth()),
      east: Math.min(180, view.getEast()),
      north: Math.min(85.05112878, view.getNorth()),
    });
  });
  map.getCanvas().setAttribute("aria-label", copy.title);
  const attribution = document.createElement("p");
  attribution.className = "msr-map-attribution";
  for (const [label, href] of [
    ["Protomaps", "https://protomaps.com"],
    ["© OpenStreetMap", "https://www.openstreetmap.org/copyright"],
  ] as const) {
    const a = document.createElement("a");
    a.textContent = label;
    a.href = href;
    a.rel = "noreferrer";
    attribution.append(a, document.createTextNode(" "));
  }
  container.append(attribution);
  map.once("idle", ready);
  map.on("error", failed);
  return {
    select,
    destroy: () => {
      map.remove();
      attribution.remove();
    },
  };
}
