import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";
import {
  projectPayloadCmsSeed,
  readPayloadCmsSnapshot,
} from "./payload-cms-import.mjs";
import { loadCmsSeed } from "./runtime.mjs";

export const DEFAULT_LISTING_QUALITY_SOURCE_SNAPSHOT = fromRoot(
  "production",
  "data",
  "listing-quality-source-snapshot.json",
);

function assertCompletePayloadAuthority(seed, snapshot, projected) {
  const payloadIds = new Set(snapshot.listings.docs.map((document) => String(document.id)));
  const seedIds = (seed.records || []).filter((record) => record.collection === "listings").map((record) => String(record.id));
  if (seedIds.some((id) => !payloadIds.has(id)) || projected.records.length !== payloadIds.size) {
    throw new Error("Listing quality requires the complete Payload listing authority; seed fallback is forbidden");
  }
  for (const record of projected.records) {
    if (record.property && !snapshot.properties.byId.has(String(record.property))) {
      throw new Error(`Listing quality Payload authority is missing property ${record.property}`);
    }
    if (record.location && !snapshot.locations.byId.has(String(record.location))) {
      throw new Error(`Listing quality Payload authority is missing location ${record.location}`);
    }
  }
}

export async function buildListingQualitySourceSnapshot({
  capturedAt = new Date().toISOString(),
  payload,
  seed = loadCmsSeed(),
} = {}) {
  if (Number.isNaN(Date.parse(capturedAt))) throw new Error("Listing quality source snapshot requires valid capturedAt");
  const snapshot = await readPayloadCmsSnapshot({ payload });
  const projected = projectPayloadCmsSeed(seed, snapshot);
  assertCompletePayloadAuthority(seed, snapshot, projected);
  return {
    ...projected,
    source: {
      authority: "payload_postgres",
      captured_at: capturedAt,
      isolation: "repeatable_read",
      listings: snapshot.listings.docs.length,
    },
  };
}

export function writeListingQualitySourceSnapshot(
  snapshot,
  outPath = DEFAULT_LISTING_QUALITY_SOURCE_SNAPSHOT,
) {
  if (snapshot?.source?.authority !== "payload_postgres" || snapshot.source.listings !== snapshot.records?.length) {
    throw new Error("Listing quality source snapshot must contain the complete Payload authority");
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return outPath;
}
