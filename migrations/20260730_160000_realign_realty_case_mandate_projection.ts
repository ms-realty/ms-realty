import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "realty_case_mandate_versions" ADD COLUMN "idempotency_key" varchar;
    UPDATE "realty_case_mandate_versions"
      SET "idempotency_key" = 'legacy:' || "workspace_id" || ':' || "case_id"::text || ':' || "version_number"::text
      WHERE "idempotency_key" IS NULL;
    ALTER TABLE "realty_case_mandate_versions" ALTER COLUMN "idempotency_key" SET NOT NULL;
    ALTER TABLE "realty_case_mandate_versions" DROP CONSTRAINT "realty_case_mandates_workspace_version_unique";
    ALTER TABLE "realty_case_mandate_versions" ADD CONSTRAINT "realty_case_mandates_workspace_case_version_unique" UNIQUE ("workspace_id", "case_id", "version_number");
    ALTER TABLE "realty_case_mandate_versions" ADD CONSTRAINT "realty_case_mandates_workspace_idempotency_unique" UNIQUE ("workspace_id", "idempotency_key");
    CREATE INDEX "realty_case_mandate_versions_idempotency_key_idx" ON "realty_case_mandate_versions" USING btree ("idempotency_key");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM "realty_case_mandate_versions"
        GROUP BY "workspace_id", "mandate_ref", "version_number"
        HAVING count(DISTINCT "case_id") > 1
      ) THEN
        RAISE EXCEPTION 'Cannot restore the legacy mandate uniqueness constraint after cross-case mandate reuse';
      END IF;
    END;
    $$;
    DROP INDEX "realty_case_mandate_versions_idempotency_key_idx";
    ALTER TABLE "realty_case_mandate_versions" DROP CONSTRAINT "realty_case_mandates_workspace_idempotency_unique";
    ALTER TABLE "realty_case_mandate_versions" DROP CONSTRAINT "realty_case_mandates_workspace_case_version_unique";
    ALTER TABLE "realty_case_mandate_versions" ADD CONSTRAINT "realty_case_mandates_workspace_version_unique" UNIQUE ("workspace_id", "mandate_ref", "version_number");
    ALTER TABLE "realty_case_mandate_versions" DROP COLUMN "idempotency_key";
  `)
}
