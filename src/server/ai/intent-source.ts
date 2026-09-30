import "server-only";
import { eq, sql } from "drizzle-orm";
import { geographyPlaceAliases, geographyPlaces } from "@/db/schema";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { InterpretPlace } from "./intent";

const maxPlaces = 20000;

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
      aliases: sql<string[]>`coalesce(
        array_agg(distinct ${geographyPlaceAliases.name} order by ${geographyPlaceAliases.name})
          filter (where ${geographyPlaceAliases.name} is not null),
        '{}'::text[]
      )`,
    })
    .from(geographyPlaces)
    .leftJoin(geographyPlaceAliases, eq(geographyPlaceAliases.placeId, geographyPlaces.id))
    .groupBy(geographyPlaces.id)
    .orderBy(geographyPlaces.id)
    .limit(maxPlaces + 1);
  // Bound identities after collecting complete aliases. A partial registry can turn an
  // ambiguous name into a misleading certain chip, so refuse it rather than truncate it.
  if (rows.length > maxPlaces) throw new AppError("unavailable");
  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    parentId: row.parentId,
    countryCode: row.countryCode,
    names: [...new Set([row.native, row.latin, ...row.aliases.filter(Boolean)])],
  }));
}
