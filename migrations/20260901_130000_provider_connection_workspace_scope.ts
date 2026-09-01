import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

// The provider collection predates workspace-scoped owner connections. Keep
// the column nullable so the migration is safe against old installations, and
// deterministically adopt every unscoped legacy row into the one configured
// workspace when that deployment setting is present. Provider remains
// globally unique: this is not a multi-workspace same-provider schema.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const workspaceId = String(process.env.MS_REALTY_WORKSPACE_ID || '').trim();
  if (workspaceId.length > 160) {
    throw new Error('MS_REALTY_WORKSPACE_ID must be at most 160 characters');
  }

  await db.execute(sql`
    ALTER TABLE "provider_connections" ADD COLUMN IF NOT EXISTS "workspace_id" varchar;
    CREATE INDEX IF NOT EXISTS "provider_connections_workspace_id_idx"
      ON "provider_connections" USING btree ("workspace_id");
  `);

  if (workspaceId) {
    await db.execute(sql`
      UPDATE "provider_connections"
      SET "workspace_id" = ${workspaceId}
      WHERE "workspace_id" IS NULL OR btrim("workspace_id") = '';
    `);
  }
}

// Existing credentials and connections are durable authority. Rollback must
// not erase them or remove the global provider uniqueness guarantee.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
