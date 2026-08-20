import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { up as ensurePostgresSearchView } from './20260811_153000_postgres_public_search'

// Re-run the idempotent search projection DDL for databases where a later
// development schema push removed the view after its migration was recorded.
export async function up(args: MigrateUpArgs): Promise<void> {
  await ensurePostgresSearchView(args)
}

// Search availability is safer than deleting a working projection on rollback.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
