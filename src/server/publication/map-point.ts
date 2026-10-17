import "server-only";
import { eq } from "drizzle-orm";
import { geographyPlaces } from "@/db/schema";
import type { LocationPrecision } from "@/domain/facts";
import { type PublicMapPoint, parsePublicMapPoint } from "@/domain/public-map";
import type { Executor } from "../db";
import { loadPlaceChains } from "./presentation";

/** Prepare-time only. Public readers never enrich an old manifest with current coordinates. */
export async function prepareMapPoint(
  db: Executor,
  placeId: string | null,
  country: string,
  precision: LocationPrecision,
): Promise<PublicMapPoint | null> {
  if (!placeId) return null;
  const chain = (await loadPlaceChains(db, [placeId])).get(placeId) ?? [];
  // Choose only an area already allowed by the disclosure. A missing settlement centre can
  // fall back to its district, never to a more precise neighbourhood or private property point.
  const candidates = precision === "region" ? ["district"] : ["settlement", "district"];
  for (const level of candidates) {
    const node = chain.find((p) => p.level === level && p.countryCode === country);
    if (!node) continue;
    const [row] = await db
      .select({ latitude: geographyPlaces.latitude, longitude: geographyPlaces.longitude })
      .from(geographyPlaces)
      .where(eq(geographyPlaces.id, node.id));
    if (row?.latitude == null || row.longitude == null) continue;
    const point = parsePublicMapPoint(
      { latitude: Number(row.latitude), longitude: Number(row.longitude), level, placeId: node.id },
      precision,
    );
    if (point) return point;
  }
  return null;
}
