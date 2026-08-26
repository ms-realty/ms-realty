import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { up as ensurePostgresSearchView } from './20260811_153000_postgres_public_search'

// The source-stated publication policy changed after the original view
// migration ran. Reapply its idempotent DDL so upgraded databases receive the
// same projection as fresh installs.
export async function up(args: MigrateUpArgs): Promise<void> {
  await ensurePostgresSearchView(args)
}

// Search availability is safer than deleting a working projection on rollback.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
