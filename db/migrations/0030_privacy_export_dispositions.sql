ALTER TABLE "privacy_exports" ADD COLUMN "encrypted_review" text;
ALTER TABLE "privacy_exports" ADD COLUMN "review_sha256" text;
ALTER TABLE "privacy_exports" ADD COLUMN "completed_operation_id" uuid;
ALTER TABLE "privacy_exports" ADD CONSTRAINT "privacy_exports_review_binding" CHECK (
  ("encrypted_review" is null and "review_sha256" is null) or
  ("encrypted_review" is not null and "review_sha256" ~ '^[a-f0-9]{64}$')
);
ALTER TABLE "privacy_exports" ADD CONSTRAINT "privacy_exports_coverage_binding" CHECK (
  not "coverage_complete" or ("encrypted_review" is not null and "review_sha256" is not null and "issued_operation_id" is not null)
);
ALTER TABLE "privacy_exports" ADD CONSTRAINT "privacy_exports_completion_binding" CHECK (
  "completed_operation_id" is null or ("coverage_complete" and "review_sha256" is not null and "issued_operation_id" is not null)
);
