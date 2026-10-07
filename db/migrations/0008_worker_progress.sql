CREATE TABLE "worker_progress" (
	"key" text PRIMARY KEY NOT NULL,
	"build_sha" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL
);
