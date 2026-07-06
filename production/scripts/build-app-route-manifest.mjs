import {
  buildAppRouteManifest,
  DEFAULT_APP_ROUTE_MANIFEST,
  writeAppRouteManifest,
} from "../lib/app-route-manifest.mjs";

const manifest = buildAppRouteManifest({ generatedAt: "2026-07-06T00:00:00Z" });
writeAppRouteManifest(manifest);
console.log(`Wrote App Router manifest to ${DEFAULT_APP_ROUTE_MANIFEST}`);
