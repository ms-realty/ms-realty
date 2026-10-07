CREATE TABLE "recovery_control" (
	"key" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"restore_id" uuid,
	"snapshot_digest" text,
	"quarantined_at" timestamp with time zone,
	"invalidated" jsonb,
	CONSTRAINT "recovery_control_singleton" CHECK ("recovery_control"."key" = 'runtime'),
	CONSTRAINT "recovery_control_state" CHECK ("recovery_control"."state" in ('normal', 'quarantined')),
	CONSTRAINT "recovery_control_quarantine_evidence" CHECK ("recovery_control"."state" = 'normal' or ("recovery_control"."restore_id" is not null and "recovery_control"."snapshot_digest" is not null and "recovery_control"."snapshot_digest" ~ '^[a-f0-9]{64}$' and "recovery_control"."quarantined_at" is not null and "recovery_control"."invalidated" is not null))
);

--> statement-breakpoint
-- New deployments start normally. A restored destination is quarantined OFFLINE before startup.
INSERT INTO recovery_control (key, state) VALUES ('runtime', 'normal');
