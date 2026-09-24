// Places and their aliases (F02, §18.2): local names, transliterations and legacy spellings
// resolve to reviewed place identities; ambiguous names are confirmed, never guessed.

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, mutable } from "./columns";
import { placeAliasKindEnum, placeLevelEnum, publicLocaleEnum } from "./enums";

export const geographyPlaces = pgTable(
  "geography_places",
  {
    ...mutable(),
    level: placeLevelEnum("level").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => geographyPlaces.id),
    /** ISO 3166-1 alpha-2. */
    countryCode: text("country_code").notNull(),
    /** Official register identifier, e.g. BG EKATTE code. */
    registryId: text("registry_id").unique(),
    slug: text("slug").notNull(),
    nameNative: text("name_native").notNull(),
    nameLatin: text("name_latin").notNull(),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
  },
  (t) => [
    uniqueIndex("geography_places_slug_idx").on(t.countryCode, t.slug),
    index("geography_places_parent_idx").on(t.parentId),
  ],
);

export const geographyPlaceAliases = pgTable(
  "geography_place_aliases",
  {
    id: id(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => geographyPlaces.id),
    kind: placeAliasKindEnum("kind").notNull(),
    locale: publicLocaleEnum("locale"),
    name: text("name").notNull(),
    /** Lower-cased, accent-free form for trigram and exact lookup. */
    normalizedName: text("normalized_name")
      .notNull()
      .generatedAlwaysAs(sql`lower(immutable_unaccent(name))`),
    createdAt: createdAt(),
  },
  (t) => [
    index("geography_place_aliases_trgm_idx").using("gin", t.normalizedName.op("gin_trgm_ops")),
    uniqueIndex("geography_place_aliases_unique_idx").on(t.placeId, t.kind, t.name),
  ],
);
