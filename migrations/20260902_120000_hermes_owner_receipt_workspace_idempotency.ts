import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

// The original owner-receipt migration predates workspace-scoped replay. This
// follow-up also upgrades databases where that migration has already run.
// Replay lookup is workspace + key; operator ownership is checked before a
// stored plan is returned. Existing unscoped receipt rows are adopted into
// the explicitly configured single workspace when available; otherwise they
// remain nullable and are not returned by scoped replay.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const workspaceId = String(process.env.MS_REALTY_WORKSPACE_ID || "").trim();
  if (workspaceId.length > 160) {
    throw new Error("MS_REALTY_WORKSPACE_ID must be at most 160 characters");
  }

  await db.execute(sql`
    ALTER TABLE "hermes_owner_receipts" ADD COLUMN IF NOT EXISTS "workspace_id" varchar;
  `);

  if (workspaceId) {
    await db.execute(sql`
      UPDATE "hermes_owner_receipts"
      SET "workspace_id" = ${workspaceId}
      WHERE "workspace_id" IS NULL OR btrim("workspace_id") = '';
    `);
  }

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "hermes_owner_receipts_workspace_id_idempotency_key_idx"
      ON "hermes_owner_receipts" USING btree ("workspace_id", "idempotency_key");
    DROP INDEX IF EXISTS "hermes_owner_receipts_idempotency_key_idx";
    CREATE INDEX IF NOT EXISTS "hermes_owner_receipts_workspace_id_idx"
      ON "hermes_owner_receipts" USING btree ("workspace_id");
  `);
}

// Owner-command receipts are accountability evidence; rollback never erases them.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db;
}
