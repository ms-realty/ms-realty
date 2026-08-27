import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "admins"
      ADD COLUMN IF NOT EXISTS "password_change_required" boolean DEFAULT false NOT NULL;
  `);
}

// Older releases ignore the additive column. Keeping it preserves the
// first-login state if application code is rolled back temporarily.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
