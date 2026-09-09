import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { up as ensurePostgresSearchView } from './20260811_153000_postgres_public_search'

// Search filtered by price returned nothing on the live site: the public
// search view published a price only after a broker verified it, and no
// listing had a verified price, while the listing pages and the in-memory
// projection already publish the source-stated price with its verification
// state beside it. Rebuild the view on the same rule as the rest of the site.
export async function up(args: MigrateUpArgs): Promise<void> {
  await ensurePostgresSearchView(args, { localizedTranslations: true, sourceStatedPrice: true })
}

export async function down(args: MigrateDownArgs): Promise<void> {
  await ensurePostgresSearchView(args as unknown as MigrateUpArgs, { localizedTranslations: true })
}
