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
import type { PublicLocale } from "@/i18n/config";
import type { MapCopy } from "./map-copy";
import type { MapListing } from "./search-map";
import "maplibre-gl/dist/maplibre-gl.css";

// Registered once per browser module, independent of map mount/unmount.
const protocol = new Protocol();
addProtocol("pmtiles", protocol.tile);
setWorkerUrl("/map-runtime/v6.11.2/maplibre-gl-worker.mjs");

export function renderMap(
  container: HTMLElement,
  items: readonly MapListing[],
  locale: PublicLocale,
  release: string,
  copy: MapCopy,
  ready: () => void,
  failed: () => void,
): () => void {
  const base = `${window.location.origin}/maps/${release}`;
  // PMTiles retains rejected header promises. A user retry must get a fresh archive cache.
  protocol.add(new PMTiles(`${base}/basemap.pmtiles`));
  const map = new MapLibreMap({
    container,
    locale: {
      "NavigationControl.ZoomIn": copy.zoomIn,
      "NavigationControl.ZoomOut": copy.zoomOut,
      "Popup.Close": copy.close,
    },
    center: [24, 40],
    zoom: 5,
    attributionControl: false,
    // No user location access; a scroll through results must not unexpectedly zoom the map.
    scrollZoom: false,
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
    button.textContent = String(group.length);
    button.setAttribute("aria-label", group.map((item) => item.label).join("; "));
    const content = document.createElement("div");
    content.className = "space-y-3 max-h-64 overflow-auto";
    for (const item of group) {
      const p = document.createElement("p");
      const link = document.createElement("a");
      link.href = item.href;
      link.className = "block underline";
      const label = document.createElement("bdi");
      label.textContent = item.label;
      link.append(document.createTextNode(`${copy.open}: `), label);
      p.append(link);
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
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 0 });
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
  return () => {
    map.remove();
    attribution.remove();
  };
}
