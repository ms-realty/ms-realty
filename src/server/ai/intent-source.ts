import "server-only";
import { eq } from "drizzle-orm";
import { geographyPlaceAliases, geographyPlaces } from "@/db/schema";
import type { Executor } from "../db";
import type { InterpretPlace } from "./intent";

/** Reviewed taxonomy only; coordinates and private property addresses never enter interpretation. */
export async function intentPlaces(db: Executor): Promise<InterpretPlace[]> {
  const rows = await db
    .select({
      id: geographyPlaces.id,
      level: geographyPlaces.level,
      parentId: geographyPlaces.parentId,
      countryCode: geographyPlaces.countryCode,
      native: geographyPlaces.nameNative,
      latin: geographyPlaces.nameLatin,
      alias: geographyPlaceAliases.name,
    })
    .from(geographyPlaces)
    .leftJoin(geographyPlaceAliases, eq(geographyPlaceAliases.placeId, geographyPlaces.id))
    .orderBy(geographyPlaces.id)
    .limit(20000);
  const places = new Map<string, InterpretPlace>();
  for (const row of rows) {
    const existing = places.get(row.id);
    places.set(row.id, {
      id: row.id,
      level: row.level,
      parentId: row.parentId,
      countryCode: row.countryCode,
      names: [
        ...new Set([
          ...(existing?.names ?? []),
          row.native,
          row.latin,
          ...(row.alias ? [row.alias] : []),
        ]),
      ],
    });
  }
  return [...places.values()];
}
