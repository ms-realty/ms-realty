CREATE TABLE "butler_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"locale" "public_locale" NOT NULL,
	"tier" text NOT NULL,
	"outcome" text NOT NULL,
	"question_kind" text NOT NULL,
	"question" text,
	"answer" text,
	"text_expires_at" timestamp with time zone NOT NULL,
	"cited_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text,
	"prompt_version" text,
	"routing" jsonb,
	"billing_mode" text,
	"reserved_cost_micros" integer,
	"actual_cost_micros" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "butler_answers_tier" CHECK ("butler_answers"."tier" in ('facts', 'text', 'none')),
	CONSTRAINT "butler_answers_outcome" CHECK ("butler_answers"."outcome" in ('answered', 'unknown', 'refused', 'rejected', 'limited')),
	CONSTRAINT "butler_answers_question_length" CHECK (char_length("butler_answers"."question") <= 300),
	CONSTRAINT "butler_answers_answer_length" CHECK (char_length("butler_answers"."answer") <= 1200),
	CONSTRAINT "butler_answers_model" CHECK (("butler_answers"."tier" = 'text') = ("butler_answers"."prompt_version" is not null) and ("butler_answers"."tier" = 'text' or ("butler_answers"."billing_mode" is null and "butler_answers"."reserved_cost_micros" is null and "butler_answers"."actual_cost_micros" is null))),
	CONSTRAINT "butler_answers_billing" CHECK ("butler_answers"."billing_mode" is null or ("butler_answers"."billing_mode" = 'metered_usd' and "butler_answers"."reserved_cost_micros" >= 0 and ("butler_answers"."actual_cost_micros" is null or "butler_answers"."actual_cost_micros" >= 0)) or ("butler_answers"."billing_mode" = 'chatgpt_subscription' and "butler_answers"."reserved_cost_micros" is null and "butler_answers"."actual_cost_micros" is null))
);
--> statement-breakpoint
ALTER TABLE "butler_answers" ADD CONSTRAINT "butler_answers_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "butler_answers_listing_idx" ON "butler_answers" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "butler_answers_text_expiry_idx" ON "butler_answers" USING btree ("text_expires_at") WHERE "butler_answers"."question" is not null or "butler_answers"."answer" is not null;--> statement-breakpoint
CREATE INDEX "butler_answers_metered_day_idx" ON "butler_answers" USING btree ("created_at") WHERE "butler_answers"."billing_mode" = 'metered_usd';