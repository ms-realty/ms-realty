CREATE TYPE "public"."account_kind" AS ENUM('staff', 'client');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."actor_kind" AS ENUM('staff', 'client', 'visitor', 'ai_service', 'system');--> statement-breakpoint
CREATE TYPE "public"."alert_frequency" AS ENUM('immediate', 'daily', 'weekly', 'paused');--> statement-breakpoint
CREATE TYPE "public"."alert_subscription_state" AS ENUM('pending_verification', 'active', 'paused', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."appointment_format" AS ENUM('in_person', 'remote');--> statement-breakpoint
CREATE TYPE "public"."appointment_state" AS ENUM('requested', 'proposed', 'confirmed', 'reschedule_requested', 'completed', 'declined', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."approval_kind" AS ENUM('factual', 'language', 'legal_process_claim', 'owner_instruction', 'publication', 'message_send', 'proposal_terms', 'spending', 'locale_indexability', 'import_apply');--> statement-breakpoint
CREATE TYPE "public"."approval_state" AS ENUM('pending', 'approved', 'rejected', 'invalidated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."audience" AS ENUM('internal', 'case_participants', 'specialist', 'public');--> statement-breakpoint
CREATE TYPE "public"."authority_state" AS ENUM('not_claimed', 'self_declared', 'under_review', 'reviewed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."capability" AS ENUM('inquiry.submit', 'portal.case.read', 'portal.shortlist.manage', 'portal.message.write', 'portal.document.upload', 'portal.appointment.request', 'portal.proposal.respond', 'portal.listing.approve', 'inquiry.read', 'inquiry.assign', 'inquiry.respond', 'case.read', 'case.read_internal', 'case.transition', 'task.manage', 'match.manage', 'listing.read', 'listing.edit', 'listing.review_facts', 'media.manage', 'translation.draft', 'translation.review', 'publication.release', 'content.edit', 'claim.approve', 'message.draft', 'message.send_external', 'appointment.manage', 'document.read_restricted', 'document.review', 'proposal.manage', 'service_request.manage', 'spending.approve', 'reservation.manage', 'access.grant', 'report.read', 'settings.manage', 'import.run', 'privacy.manage', 'audit.read', 'ai.draft');--> statement-breakpoint
CREATE TYPE "public"."case_kind" AS ENUM('buyer', 'seller', 'rental');--> statement-breakpoint
CREATE TYPE "public"."commercial_state" AS ENUM('available', 'availability_unconfirmed', 'under_negotiation', 'reserved', 'sold', 'let', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."commitment_kind" AS ENUM('internal', 'client_promise');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('service_updates', 'search_alerts', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."consent_state" AS ENUM('not_asked', 'granted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."contact_method_kind" AS ENUM('email', 'phone', 'whatsapp', 'viber', 'postal');--> statement-breakpoint
CREATE TYPE "public"."contact_verification_state" AS ENUM('unverified', 'pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."content_page_kind" AS ENUM('area', 'guide', 'service', 'team_member', 'help');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('EUR', 'BGN', 'USD', 'GBP');--> statement-breakpoint
CREATE TYPE "public"."destination_outcome_state" AS ENUM('pending', 'requested', 'acknowledged', 'verified', 'failed', 'outcome_unknown');--> statement-breakpoint
CREATE TYPE "public"."distribution_state" AS ENUM('never_published', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'withdrawing', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."document_classification" AS ENUM('identity', 'title', 'financial', 'contract', 'property', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_review_type" AS ENUM('accepted_for_purpose', 'needs_replacement', 'reviewed_with_open_questions');--> statement-breakpoint
CREATE TYPE "public"."document_state" AS ENUM('selected', 'uploading', 'uploaded', 'scanning', 'ready_for_review', 'reviewed', 'rejected', 'needs_replacement', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."editorial_state" AS ENUM('draft', 'needs_facts', 'in_review', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."fact_state" AS ENUM('known', 'unknown', 'not_applicable', 'not_provided', 'withheld');--> statement-breakpoint
CREATE TYPE "public"."freshness_state" AS ENUM('current', 'review_due', 'conflicting', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."import_batch_mode" AS ENUM('dry_run', 'apply');--> statement-breakpoint
CREATE TYPE "public"."import_batch_state" AS ENUM('staged', 'validated', 'applying', 'completed', 'partially_completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."import_row_classification" AS ENUM('create', 'update_proposal', 'no_change', 'blocked', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."import_row_outcome" AS ENUM('pending', 'applied', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."inquiry_purpose" AS ENUM('question', 'callback', 'viewing_help', 'selling_letting', 'other_service');--> statement-breakpoint
CREATE TYPE "public"."inquiry_source" AS ENUM('website', 'phone', 'email', 'messenger', 'walk_in', 'import');--> statement-breakpoint
CREATE TYPE "public"."inquiry_state" AS ENUM('received', 'assigned', 'awaiting_client', 'ready_for_case', 'case_linked', 'resolved_without_case', 'suspected_duplicate', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."legacy_domain" AS ENUM('makler-realty.com', 'makler-realty.ru');--> statement-breakpoint
CREATE TYPE "public"."legacy_url_decision" AS ENUM('retain_200', 'redirect_301', 'approved_410');--> statement-breakpoint
CREATE TYPE "public"."listing_purpose" AS ENUM('sale', 'long_term_rent', 'short_stay');--> statement-breakpoint
CREATE TYPE "public"."location_precision" AS ENUM('exact', 'street', 'neighborhood', 'settlement', 'region');--> statement-breakpoint
CREATE TYPE "public"."match_group" AS ENUM('exact', 'alternative');--> statement-breakpoint
CREATE TYPE "public"."match_state" AS ENUM('proposed', 'shared', 'dismissed', 'feedback_received');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'floor_plan', 'video', 'render', 'virtual_tour');--> statement-breakpoint
CREATE TYPE "public"."media_modification" AS ENUM('none', 'retouched', 'virtually_staged', 'renovation_render', 'redrawn_plan');--> statement-breakpoint
CREATE TYPE "public"."media_review_state" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_rights_state" AS ENUM('unknown', 'pending', 'cleared', 'restricted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_storage_area" AS ENUM('staging', 'public');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('email', 'sms', 'whatsapp', 'viber', 'portal');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('external', 'internal_note');--> statement-breakpoint
CREATE TYPE "public"."message_state" AS ENUM('draft', 'human_approved', 'queued', 'provider_accepted', 'delivered', 'read', 'failed', 'outcome_unknown');--> statement-breakpoint
CREATE TYPE "public"."operation_status" AS ENUM('accepted', 'in_progress', 'succeeded', 'failed', 'outcome_unknown');--> statement-breakpoint
CREATE TYPE "public"."party_relationship_role" AS ENUM('buyer', 'co_buyer', 'seller', 'authorized_representative', 'landlord', 'tenant', 'guest', 'adviser', 'collaborator', 'specialist');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('not_required', 'pending', 'confirmed_by_provider', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."place_alias_kind" AS ENUM('official', 'local', 'transliteration', 'legacy_spelling');--> statement-breakpoint
CREATE TYPE "public"."place_level" AS ENUM('country', 'district', 'municipality', 'settlement', 'neighborhood');--> statement-breakpoint
CREATE TYPE "public"."price_basis" AS ENUM('asking', 'negotiable', 'fixed', 'indicative');--> statement-breakpoint
CREATE TYPE "public"."price_period" AS ENUM('total', 'month', 'night', 'week', 'year');--> statement-breakpoint
CREATE TYPE "public"."professional_validation_state" AS ENUM('not_requested', 'requested', 'validated', 'declined');--> statement-breakpoint
CREATE TYPE "public"."property_access_state" AS ENUM('unknown', 'requested', 'confirmed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('apartment', 'house', 'plot', 'commercial', 'hotel', 'development', 'other');--> statement-breakpoint
CREATE TYPE "public"."proposal_state" AS ENUM('draft', 'reviewed', 'submitted', 'awaiting_response', 'countered', 'declined', 'withdrawn', 'expired', 'agreed_for_next_step');--> statement-breakpoint
CREATE TYPE "public"."public_locale" AS ENUM('bg', 'en', 'ru', 'de', 'nl', 'el', 'he');--> statement-breakpoint
CREATE TYPE "public"."publication_destination" AS ENUM('website', 'sitemap', 'partner_feed');--> statement-breakpoint
CREATE TYPE "public"."release_kind" AS ENUM('publish', 'withdraw', 'correction');--> statement-breakpoint
CREATE TYPE "public"."requirement_item_kind" AS ENUM('hard_constraint', 'preference', 'open_question');--> statement-breakpoint
CREATE TYPE "public"."requirement_origin" AS ENUM('client_stated', 'broker_interpretation');--> statement-breakpoint
CREATE TYPE "public"."reservation_state" AS ENUM('requested', 'awaiting_confirmation', 'payment_pending', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('visitor', 'verified_client', 'invited_collaborator', 'assigned_broker', 'coordinator', 'content_editor', 'translation_reviewer', 'publishing_approver', 'manager', 'external_specialist', 'ai_service');--> statement-breakpoint
CREATE TYPE "public"."scan_state" AS ENUM('pending', 'clean', 'infected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."service_agreement_state" AS ENUM('draft', 'active', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_request_state" AS ENUM('received', 'triaged', 'awaiting_access', 'awaiting_approval', 'awaiting_parts', 'scheduled', 'work_performed', 'awaiting_verification', 'resolved', 'reopened', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_request_urgency" AS ENUM('routine', 'soon', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."shortlist_opinion" AS ENUM('interested', 'question', 'maybe', 'no');--> statement-breakpoint
CREATE TYPE "public"."shortlist_participant_role" AS ENUM('owner', 'collaborator');--> statement-breakpoint
CREATE TYPE "public"."sign_in_token_purpose" AS ENUM('sign_in', 'invitation');--> statement-breakpoint
CREATE TYPE "public"."source_class" AS ENUM('source_supplied', 'owner_confirmed', 'agency_observed', 'document_reviewed', 'professional_reviewed', 'system_calculated', 'legacy_import');--> statement-breakpoint
CREATE TYPE "public"."staff_locale" AS ENUM('bg', 'ru', 'en');--> statement-breakpoint
CREATE TYPE "public"."statement_line_state" AS ENUM('expected', 'invoiced', 'paid', 'reconciled');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('open', 'in_progress', 'waiting', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('general', 'follow_up', 'call', 'fact_verification', 'document_request', 'viewing_coordination', 'correction', 'publishing', 'communication', 'access_grant', 'approval');--> statement-breakpoint
CREATE TYPE "public"."translation_state" AS ENUM('missing', 'draft', 'reviewing', 'approved', 'stale', 'rejected');--> statement-breakpoint
CREATE TABLE "capability_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"staff_account_id" uuid,
	"client_account_id" uuid,
	"service_name" text,
	"role" "role",
	"capability" "capability",
	"record_type" text,
	"record_id" uuid,
	"locales" "public_locale"[],
	"granted_by_staff_id" uuid,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_staff_id" uuid,
	CONSTRAINT "capability_grants_one_grantee" CHECK (num_nonnulls("capability_grants"."staff_account_id", "capability_grants"."client_account_id", "capability_grants"."service_name") = 1),
	CONSTRAINT "capability_grants_role_or_capability" CHECK (num_nonnulls("capability_grants"."role", "capability_grants"."capability") = 1),
	CONSTRAINT "capability_grants_service_drafts_only" CHECK ("capability_grants"."service_name" is null or coalesce("capability_grants"."role" = 'ai_service', false) or coalesce("capability_grants"."capability" in ('ai.draft', 'translation.draft', 'message.draft'), false)),
	CONSTRAINT "capability_grants_record_scope" CHECK (("capability_grants"."record_id" is null) or ("capability_grants"."record_type" is not null))
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"person_id" uuid NOT NULL,
	"email" text NOT NULL,
	"preferred_locale" "public_locale" DEFAULT 'bg' NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sign_in_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "sign_in_token_purpose" NOT NULL,
	"account_kind" "account_kind" NOT NULL,
	"email" text NOT NULL,
	"return_to" text,
	"invitation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "email_sign_in_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_account_id" uuid,
	"client_account_id" uuid,
	"credential_id" text NOT NULL,
	"public_key" "bytea" NOT NULL,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id"),
	CONSTRAINT "passkeys_one_account" CHECK (num_nonnulls("passkeys"."staff_account_id", "passkeys"."client_account_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"account_kind" "account_kind" NOT NULL,
	"staff_account_id" uuid,
	"client_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_one_account" CHECK (("sessions"."account_kind" = 'staff' and "sessions"."staff_account_id" is not null and "sessions"."client_account_id" is null)
        or ("sessions"."account_kind" = 'client' and "sessions"."client_account_id" is not null and "sessions"."staff_account_id" is null))
);
--> statement-breakpoint
CREATE TABLE "staff_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"person_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"staff_locale" "staff_locale" DEFAULT 'bg' NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"state" "approval_state" DEFAULT 'pending' NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version" integer NOT NULL,
	"subject_hash" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by_kind" "actor_kind" NOT NULL,
	"requested_by_id" text NOT NULL,
	"decided_by_kind" "actor_kind",
	"decided_by_id" text,
	"decided_with_capability" "capability",
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	CONSTRAINT "approvals_human_decision" CHECK ("approvals"."state" not in ('approved', 'rejected') or (coalesce("approvals"."decided_by_kind" in ('staff', 'client'), false) and "approvals"."decided_by_id" is not null and "approvals"."decided_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "alert_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_search_id" uuid NOT NULL,
	"contact_method_id" uuid NOT NULL,
	"state" "alert_subscription_state" DEFAULT 'pending_verification' NOT NULL,
	"verified_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"quiet_hours" jsonb,
	"unsubscribe_token_hash" text NOT NULL,
	"last_sent_at" timestamp with time zone,
	CONSTRAINT "alert_subscriptions_unsubscribe_token_hash_unique" UNIQUE("unsubscribe_token_hash"),
	CONSTRAINT "alert_subscriptions_active_verified" CHECK ("alert_subscriptions"."state" <> 'active' or "alert_subscriptions"."verified_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"criteria_summary" text NOT NULL,
	"frequency" "alert_frequency" DEFAULT 'daily' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shortlist_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shortlist_opinions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"opinion" "shortlist_opinion" NOT NULL,
	"reason" text,
	"private_note" text
);
--> statement-breakpoint
CREATE TABLE "shortlist_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shortlist_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"role" "shortlist_participant_role" NOT NULL,
	"shares_private_notes" boolean DEFAULT false NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shortlist_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shortlist_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_client_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "shortlist_share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shortlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_client_id" uuid NOT NULL,
	"case_id" uuid,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"person_id" uuid,
	"staff_account_id" uuid,
	"role" text NOT NULL,
	"acknowledged_version" integer,
	"notified_at" timestamp with time zone,
	CONSTRAINT "appointment_participants_one" CHECK (num_nonnulls("appointment_participants"."person_id", "appointment_participants"."staff_account_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "appointment_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"state" "appointment_state" DEFAULT 'requested' NOT NULL,
	"format" "appointment_format" NOT NULL,
	"case_id" uuid,
	"listing_id" uuid,
	"timezone" text NOT NULL,
	"requested_windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_starts_at" timestamp with time zone,
	"proposed_ends_at" timestamp with time zone,
	"confirmed_starts_at" timestamp with time zone,
	"confirmed_ends_at" timestamp with time zone,
	"host_staff_id" uuid,
	"property_access" "property_access_state" DEFAULT 'unknown' NOT NULL,
	"meeting_point" text,
	"outcome_note" text,
	"cancel_reason" text,
	CONSTRAINT "appointments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "appointments_confirmed_slot" CHECK ("appointments"."state" not in ('confirmed', 'reschedule_requested', 'completed', 'no_show') or ("appointments"."confirmed_starts_at" is not null and "appointments"."confirmed_ends_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"state" "document_state" DEFAULT 'selected' NOT NULL,
	"r2_key" text,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint,
	"sha256" text,
	"uploaded_by_kind" "actor_kind" NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"scan" "scan_state" DEFAULT 'pending' NOT NULL,
	"scanned_at" timestamp with time zone,
	"review_type" "document_review_type",
	"reviewed_by_staff_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"professional_validation" "professional_validation_state" DEFAULT 'not_requested' NOT NULL,
	"professional_validator" text,
	"superseded_by_version_id" uuid,
	CONSTRAINT "document_versions_r2_key_unique" UNIQUE("r2_key"),
	CONSTRAINT "document_versions_review_after_clean_scan" CHECK ("document_versions"."state" not in ('ready_for_review', 'reviewed') or "document_versions"."scan" = 'clean'),
	CONSTRAINT "document_versions_reviewed_by_human" CHECK ("document_versions"."state" <> 'reviewed' or ("document_versions"."review_type" is not null and "document_versions"."reviewed_by_staff_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"case_id" uuid,
	"property_id" uuid,
	"purpose" text NOT NULL,
	"classification" "document_classification" NOT NULL,
	"audience" "audience" DEFAULT 'internal' NOT NULL,
	"current_version_number" integer DEFAULT 0 NOT NULL,
	"retention_policy" text,
	"expires_at" timestamp with time zone,
	CONSTRAINT "documents_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "message_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"recipient" text NOT NULL,
	"provider" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_message_id" text,
	"state" "message_state" DEFAULT 'queued' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "message_deliveries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "message_kind" NOT NULL,
	"direction" "message_direction" NOT NULL,
	"channel" "message_channel" NOT NULL,
	"state" "message_state" DEFAULT 'draft' NOT NULL,
	"case_id" uuid,
	"inquiry_id" uuid,
	"author_kind" "actor_kind" NOT NULL,
	"author_id" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"approval_id" uuid,
	"approved_content_hash" text,
	"drafted_by_ai" boolean DEFAULT false NOT NULL,
	CONSTRAINT "messages_internal_never_sent" CHECK ("messages"."kind" <> 'internal_note' or "messages"."state" = 'draft'),
	CONSTRAINT "messages_sent_only_when_approved" CHECK ("messages"."direction" = 'inbound' or "messages"."state" in ('draft') or ("messages"."approval_id" is not null and "messages"."approved_content_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "proposal_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"state" "proposal_state" DEFAULT 'draft' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"payment_basis" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parties" jsonb NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"deadline_timezone" text NOT NULL,
	"terms_hash" text NOT NULL,
	"approval_id" uuid,
	"submitted_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"response_note" text,
	CONSTRAINT "proposal_versions_amount" CHECK ("proposal_versions"."amount_minor" >= 0),
	CONSTRAINT "proposal_versions_submitted_approved" CHECK ("proposal_versions"."state" in ('draft', 'reviewed', 'withdrawn') or "proposal_versions"."approval_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"case_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"active_version_number" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "proposals_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "geography_place_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"kind" "place_alias_kind" NOT NULL,
	"locale" "public_locale",
	"name" text NOT NULL,
	"normalized_name" text GENERATED ALWAYS AS (lower(immutable_unaccent(name))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geography_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"level" "place_level" NOT NULL,
	"parent_id" uuid,
	"country_code" text NOT NULL,
	"registry_id" text,
	"slug" text NOT NULL,
	"name_native" text NOT NULL,
	"name_latin" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	CONSTRAINT "geography_places_registry_id_unique" UNIQUE("registry_id")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"source" text NOT NULL,
	"scope" text NOT NULL,
	"mode" "import_batch_mode" NOT NULL,
	"state" "import_batch_state" DEFAULT 'staged' NOT NULL,
	"source_sha256" text,
	"field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_by_staff_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "import_batches_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"source_key" text NOT NULL,
	"classification" "import_row_classification" NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" "import_row_outcome" DEFAULT 'pending' NOT NULL,
	"applied_at" timestamp with time zone,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "legacy_url_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"domain" "legacy_domain" NOT NULL,
	"source_path" text NOT NULL,
	"source_query" text DEFAULT '' NOT NULL,
	"decision" "legacy_url_decision" NOT NULL,
	"status_code" smallint NOT NULL,
	"target_path" text,
	"listing_id" uuid,
	"listing_reference" text,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_method_id" uuid NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"state" "consent_state" NOT NULL,
	"source" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"person_id" uuid,
	"organization_id" uuid,
	"kind" "contact_method_kind" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"verification" "contact_verification_state" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	CONSTRAINT "contact_methods_one_owner" CHECK (num_nonnulls("contact_methods"."person_id", "contact_methods"."organization_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"registration_number" text,
	"country" text
);
--> statement-breakpoint
CREATE TABLE "person_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"former_person_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"preferred_locale" "public_locale",
	"merged_into_person_id" uuid
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"property_id" uuid,
	"listing_id" uuid,
	"field_key" text NOT NULL,
	"state" "fact_state" NOT NULL,
	"value" jsonb,
	"unit" text,
	"basis" text,
	"source_class" "source_class" NOT NULL,
	"source_reference" text,
	"reviewed_by_staff_id" uuid,
	"reviewed_at" timestamp with time zone,
	"observed_at" timestamp with time zone,
	"note" text,
	CONSTRAINT "facts_one_subject" CHECK (num_nonnulls("facts"."property_id", "facts"."listing_id") = 1),
	CONSTRAINT "facts_value_matches_state" CHECK (("facts"."state" = 'known') = ("facts"."value" is not null))
);
--> statement-breakpoint
CREATE TABLE "listing_search_documents" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"purpose" "listing_purpose" NOT NULL,
	"property_type" "property_type" NOT NULL,
	"commercial_state" "commercial_state" NOT NULL,
	"place_ids" uuid[] NOT NULL,
	"price_state" "fact_state" NOT NULL,
	"price_amount_minor" bigint,
	"price_currency" "currency",
	"price_period" "price_period",
	"price_basis" "price_basis",
	"bedrooms_state" "fact_state" NOT NULL,
	"bedrooms" integer,
	"rooms_state" "fact_state" NOT NULL,
	"rooms" integer,
	"living_area_state" "fact_state" NOT NULL,
	"living_area" numeric(10, 2),
	"built_area_state" "fact_state" NOT NULL,
	"built_area" numeric(10, 2),
	"total_area_state" "fact_state" NOT NULL,
	"total_area" numeric(10, 2),
	"land_area_state" "fact_state" NOT NULL,
	"land_area" numeric(12, 2),
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent(search_text))) STORED,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_version_media" (
	"listing_version_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "listing_version_media_listing_version_id_media_asset_id_pk" PRIMARY KEY("listing_version_id","media_asset_id")
);
--> statement-breakpoint
CREATE TABLE "listing_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content_hash" text NOT NULL,
	"source_locale" "public_locale" DEFAULT 'bg' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"property_id" uuid NOT NULL,
	"purpose" "listing_purpose" NOT NULL,
	"commercial_state" "commercial_state" DEFAULT 'availability_unconfirmed' NOT NULL,
	"reservation_basis" text,
	"editorial_state" "editorial_state" DEFAULT 'draft' NOT NULL,
	"distribution_state" "distribution_state" DEFAULT 'never_published' NOT NULL,
	"freshness_state" "freshness_state" DEFAULT 'unknown' NOT NULL,
	"availability_checked_at" timestamp with time zone,
	"current_version_number" integer DEFAULT 0 NOT NULL,
	"published_version_number" integer,
	"responsible_staff_id" uuid,
	CONSTRAINT "listings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "listings_reserved_basis" CHECK ("listings"."commercial_state" <> 'reserved' or "listings"."reservation_basis" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"property_id" uuid NOT NULL,
	"listing_id" uuid,
	"r2_key" text NOT NULL,
	"storage_area" "media_storage_area" DEFAULT 'staging' NOT NULL,
	"kind" "media_kind" NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"rights" "media_rights_state" DEFAULT 'unknown' NOT NULL,
	"rights_holder" text,
	"consent_reference" text,
	"review" "media_review_state" DEFAULT 'pending' NOT NULL,
	"modification" "media_modification" DEFAULT 'none' NOT NULL,
	"modification_disclosure" text,
	"original_asset_id" uuid,
	"caption" text,
	"alt_text" text,
	"captured_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"legacy_reference" text,
	CONSTRAINT "media_assets_r2_key_unique" UNIQUE("r2_key"),
	CONSTRAINT "media_assets_content_type" CHECK ("media_assets"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'application/pdf')),
	CONSTRAINT "media_assets_public_requires_clearance" CHECK ("media_assets"."storage_area" <> 'public' or ("media_assets"."rights" = 'cleared' and "media_assets"."review" = 'approved')),
	CONSTRAINT "media_assets_modification_disclosed" CHECK ("media_assets"."modification" = 'none' or "media_assets"."modification_disclosure" is not null)
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"property_type" "property_type" NOT NULL,
	"place_id" uuid,
	"country" text NOT NULL,
	"region" text NOT NULL,
	"settlement" text NOT NULL,
	"neighborhood" text,
	"exact_address" text,
	"unit" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"public_precision" "location_precision" DEFAULT 'settlement' NOT NULL,
	CONSTRAINT "properties_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "content_page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_page_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content_hash" text NOT NULL,
	"source_locale" "public_locale" DEFAULT 'bg' NOT NULL,
	"body" jsonb NOT NULL,
	"jurisdiction" text,
	"review_scope" text,
	"reviewed_at" timestamp with time zone,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "content_page_kind" NOT NULL,
	"slug" text NOT NULL,
	"place_id" uuid,
	"editorial_state" "editorial_state" DEFAULT 'draft' NOT NULL,
	"distribution_state" "distribution_state" DEFAULT 'never_published' NOT NULL,
	"current_version_number" integer DEFAULT 0 NOT NULL,
	"published_version_number" integer
);
--> statement-breakpoint
CREATE TABLE "publication_destination_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"release_id" uuid NOT NULL,
	"destination" "publication_destination" NOT NULL,
	"locale" "public_locale" NOT NULL,
	"state" "destination_outcome_state" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "publication_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"kind" "release_kind" NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version_number" integer NOT NULL,
	"locales" "public_locale"[] NOT NULL,
	"state" "distribution_state" DEFAULT 'scheduled' NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"scheduled_at" timestamp with time zone,
	"confirmed_by_staff_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"translation_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "publication_releases_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"locale" "public_locale" NOT NULL,
	"source_version" integer NOT NULL,
	"state" "translation_state" DEFAULT 'missing' NOT NULL,
	"title" text,
	"body" jsonb,
	"drafted_by_ai" boolean DEFAULT false NOT NULL,
	"unresolved_terminology" jsonb,
	"reviewed_by_staff_id" uuid,
	"reviewed_at" timestamp with time zone,
	"approval_id" uuid,
	"rejection_reason" text,
	CONSTRAINT "translations_not_source_locale" CHECK ("translations"."locale" <> 'bg'),
	CONSTRAINT "translations_approved_by_human" CHECK ("translations"."state" <> 'approved' or ("translations"."reviewed_by_staff_id" is not null and "translations"."approval_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"reference" text,
	"message_key" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"audience" "audience" DEFAULT 'internal' NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"operation_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"operation_id" text,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"capability" text,
	"record_type" text,
	"record_id" uuid,
	"payload" jsonb NOT NULL,
	"correlation_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "operation_status" DEFAULT 'accepted' NOT NULL,
	"outcome" jsonb,
	"result_type" text,
	"result_id" uuid,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reservation_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"guests" integer NOT NULL,
	"currency" "currency" NOT NULL,
	"total_minor" bigint NOT NULL,
	"items" jsonb NOT NULL,
	"cancellation_terms" text NOT NULL,
	"availability_checked_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"case_id" uuid,
	"state" "reservation_state" DEFAULT 'requested' NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"guests" integer NOT NULL,
	"quote_id" uuid,
	"accepted_terms_version" text,
	"payment" "payment_state" DEFAULT 'not_required' NOT NULL,
	"payment_provider_reference" text,
	"cancel_reason" text,
	CONSTRAINT "reservations_reference_unique" UNIQUE("reference"),
	CONSTRAINT "reservations_dates" CHECK ("reservations"."check_out" > "reservations"."check_in"),
	CONSTRAINT "reservations_confirmed_paid" CHECK ("reservations"."state" <> 'confirmed' or "reservations"."payment" in ('not_required', 'confirmed_by_provider'))
);
--> statement-breakpoint
CREATE TABLE "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"case_id" uuid,
	"property_id" uuid NOT NULL,
	"state" "service_agreement_state" DEFAULT 'draft' NOT NULL,
	"scope" jsonb NOT NULL,
	"authority" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"publication_permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document_id" uuid,
	"effective_from" date,
	"effective_to" date,
	CONSTRAINT "service_agreements_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"service_agreement_id" uuid NOT NULL,
	"state" "service_request_state" DEFAULT 'received' NOT NULL,
	"urgency" "service_request_urgency" NOT NULL,
	"description" text NOT NULL,
	"location_detail" text,
	"responsible_staff_id" uuid,
	"waiting_on" text,
	"follow_up_at" timestamp with time zone,
	"estimated_cost_minor" bigint,
	"currency" "currency",
	"spending_approval_id" uuid,
	"provider_organization_id" uuid,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"confirmed_by" text,
	CONSTRAINT "service_requests_reference_unique" UNIQUE("reference"),
	CONSTRAINT "service_requests_waiting_dependency" CHECK ("service_requests"."state" not in ('awaiting_access', 'awaiting_approval', 'awaiting_parts') or ("service_requests"."waiting_on" is not null and "service_requests"."follow_up_at" is not null)),
	CONSTRAINT "service_requests_spending_approved" CHECK ("service_requests"."state" not in ('scheduled', 'work_performed', 'awaiting_verification', 'resolved') or coalesce("service_requests"."estimated_cost_minor", 0) = 0 or "service_requests"."spending_approval_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"statement_id" uuid NOT NULL,
	"description" text NOT NULL,
	"state" "statement_line_state" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"is_adjustment" boolean DEFAULT false NOT NULL,
	"service_request_id" uuid,
	"evidence_document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"service_agreement_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"currency" "currency" NOT NULL,
	"issued_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "locale_settings" (
	"locale" "public_locale" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"indexable" boolean DEFAULT false NOT NULL,
	"indexable_approval_id" uuid,
	"reviewer_staff_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locale_settings_indexable_approved" CHECK (not "locale_settings"."indexable" or ("locale_settings"."enabled" and "locale_settings"."indexable_approval_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"tokens" real NOT NULL,
	"refilled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"service_hours" jsonb NOT NULL,
	"coverage" jsonb NOT NULL,
	"response_policy" jsonb NOT NULL,
	"approved_by_staff_id" uuid
);
--> statement-breakpoint
CREATE TABLE "case_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"kind" "case_kind" NOT NULL,
	"stage" text NOT NULL,
	"title" text NOT NULL,
	"property_id" uuid,
	"owner_staff_id" uuid,
	"disposition_reason" text,
	"outstanding_obligations" jsonb,
	"resume_stage" text,
	"next_action_summary" text,
	"next_action_due_at" timestamp with time zone,
	CONSTRAINT "cases_reference_unique" UNIQUE("reference"),
	CONSTRAINT "cases_stage_matches_kind" CHECK (("cases"."kind" = 'buyer' and "cases"."stage" in ('needs_agreed', 'evaluating', 'viewing', 'proposal_preparation', 'proposal_active', 'coordination', 'completed', 'failed', 'on_hold', 'paused', 'closed'))
        or ("cases"."kind" = 'seller' and "cases"."stage" in ('request_received', 'scope_authority_confirmed', 'assessment', 'instructions_agreed', 'preparing', 'marketing', 'proposal_coordination', 'completion_handover', 'paused', 'closed'))
        or ("cases"."kind" = 'rental' and "cases"."stage" in ('requirements_agreed', 'viewing_arranged', 'application_review', 'terms_agreed', 'tenancy_agreement', 'handover', 'tenancy_started', 'application_declined', 'paused', 'closed'))),
	CONSTRAINT "cases_disposition_reason" CHECK ("cases"."stage" not in ('paused', 'closed') or ("cases"."disposition_reason" is not null and "cases"."outstanding_obligations" is not null))
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"state" "inquiry_state" DEFAULT 'received' NOT NULL,
	"purpose" "inquiry_purpose" NOT NULL,
	"source" "inquiry_source" NOT NULL,
	"submission_id" text NOT NULL,
	"listing_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"preferred_name" text,
	"contact_method_id" uuid,
	"person_id" uuid,
	"preferred_locale" "public_locale",
	"callback_window" text,
	"message" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"owner_staff_id" uuid,
	"coverage_queue" text,
	"acknowledged_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"case_id" uuid,
	"duplicate_of_inquiry_id" uuid,
	"disposition_reason" text,
	CONSTRAINT "inquiries_reference_unique" UNIQUE("reference"),
	CONSTRAINT "inquiries_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "inquiries_owned_after_received" CHECK ("inquiries"."state" in ('received', 'suspected_duplicate', 'discarded') or "inquiries"."owner_staff_id" is not null or "inquiries"."coverage_queue" is not null),
	CONSTRAINT "inquiries_case_linked" CHECK ("inquiries"."state" <> 'case_linked' or "inquiries"."case_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"listing_version_id" uuid,
	"group" "match_group" NOT NULL,
	"state" "match_state" DEFAULT 'proposed' NOT NULL,
	"fit_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"broker_rationale" text,
	"feedback" jsonb
);
--> statement-breakpoint
CREATE TABLE "party_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"person_id" uuid,
	"organization_id" uuid,
	"role" "party_relationship_role" NOT NULL,
	"case_id" uuid,
	"property_id" uuid,
	"authority" "authority_state" DEFAULT 'not_claimed' NOT NULL,
	"authority_reviewed_by_staff_id" uuid,
	"authority_reviewed_at" timestamp with time zone,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_staff_id" uuid,
	CONSTRAINT "party_relationships_one_party" CHECK (num_nonnulls("party_relationships"."person_id", "party_relationships"."organization_id") = 1),
	CONSTRAINT "party_relationships_target" CHECK (num_nonnulls("party_relationships"."case_id", "party_relationships"."property_id") >= 1),
	CONSTRAINT "party_relationships_reviewed_authority" CHECK ("party_relationships"."authority" <> 'reviewed' or ("party_relationships"."authority_reviewed_by_staff_id" is not null and "party_relationships"."authority_reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "reference_sequences" (
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_sequences_kind_year_pk" PRIMARY KEY("kind","year")
);
--> statement-breakpoint
CREATE TABLE "requirement_brief_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"brief_id" uuid NOT NULL,
	"kind" "requirement_item_kind" NOT NULL,
	"origin" "requirement_origin" NOT NULL,
	"text" text NOT NULL,
	"criterion" jsonb,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acknowledged_by_staff_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"pending_client_change_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"purpose" text,
	"type" "task_type" DEFAULT 'general' NOT NULL,
	"commitment" "commitment_kind" DEFAULT 'internal' NOT NULL,
	"state" "task_state" DEFAULT 'open' NOT NULL,
	"owner_staff_id" uuid,
	"pending_owner_staff_id" uuid,
	"due_at" timestamp with time zone,
	"due_timezone" text,
	"waiting_on" text,
	"follow_up_at" timestamp with time zone,
	"evidence_required" boolean DEFAULT false NOT NULL,
	"outcome_note" text,
	"evidence_ids" jsonb,
	"completed_at" timestamp with time zone,
	"completed_by_staff_id" uuid,
	"cancel_reason" text,
	"case_id" uuid,
	"inquiry_id" uuid,
	"listing_id" uuid,
	"promised_to_client_id" uuid,
	CONSTRAINT "tasks_waiting_names_dependency" CHECK ("tasks"."state" <> 'waiting' or ("tasks"."waiting_on" is not null and "tasks"."follow_up_at" is not null)),
	CONSTRAINT "tasks_done_records_outcome" CHECK ("tasks"."state" <> 'done' or ("tasks"."outcome_note" is not null and "tasks"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_granted_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("granted_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_revoked_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("revoked_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_subscriptions" ADD CONSTRAINT "alert_subscriptions_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_subscriptions" ADD CONSTRAINT "alert_subscriptions_contact_method_id_contact_methods_id_fk" FOREIGN KEY ("contact_method_id") REFERENCES "public"."contact_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_shortlist_id_shortlists_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."shortlists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_opinions" ADD CONSTRAINT "shortlist_opinions_item_id_shortlist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shortlist_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_opinions" ADD CONSTRAINT "shortlist_opinions_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_participants" ADD CONSTRAINT "shortlist_participants_shortlist_id_shortlists_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."shortlists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_participants" ADD CONSTRAINT "shortlist_participants_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_share_links" ADD CONSTRAINT "shortlist_share_links_shortlist_id_shortlists_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."shortlists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_share_links" ADD CONSTRAINT "shortlist_share_links_created_by_client_id_client_accounts_id_fk" FOREIGN KEY ("created_by_client_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_owner_client_id_client_accounts_id_fk" FOREIGN KEY ("owner_client_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participants" ADD CONSTRAINT "appointment_participants_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participants" ADD CONSTRAINT "appointment_participants_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participants" ADD CONSTRAINT "appointment_participants_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_versions" ADD CONSTRAINT "appointment_versions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_host_staff_id_staff_accounts_id_fk" FOREIGN KEY ("host_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_reviewed_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography_place_aliases" ADD CONSTRAINT "geography_place_aliases_place_id_geography_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."geography_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography_places" ADD CONSTRAINT "geography_places_parent_id_geography_places_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."geography_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_url_decisions" ADD CONSTRAINT "legacy_url_decisions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_consents" ADD CONSTRAINT "contact_consents_contact_method_id_contact_methods_id_fk" FOREIGN KEY ("contact_method_id") REFERENCES "public"."contact_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_reviewed_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_search_documents" ADD CONSTRAINT "listing_search_documents_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_version_media" ADD CONSTRAINT "listing_version_media_listing_version_id_listing_versions_id_fk" FOREIGN KEY ("listing_version_id") REFERENCES "public"."listing_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_version_media" ADD CONSTRAINT "listing_version_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_versions" ADD CONSTRAINT "listing_versions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_versions" ADD CONSTRAINT "listing_versions_created_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_responsible_staff_id_staff_accounts_id_fk" FOREIGN KEY ("responsible_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_place_id_geography_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."geography_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page_versions" ADD CONSTRAINT "content_page_versions_content_page_id_content_pages_id_fk" FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page_versions" ADD CONSTRAINT "content_page_versions_created_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_place_id_geography_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."geography_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_destination_outcomes" ADD CONSTRAINT "publication_destination_outcomes_release_id_publication_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_releases" ADD CONSTRAINT "publication_releases_confirmed_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("confirmed_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_releases" ADD CONSTRAINT "publication_releases_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_reviewed_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_quotes" ADD CONSTRAINT "reservation_quotes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_quote_id_reservation_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."reservation_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_agreement_id_service_agreements_id_fk" FOREIGN KEY ("service_agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_responsible_staff_id_staff_accounts_id_fk" FOREIGN KEY ("responsible_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_spending_approval_id_approvals_id_fk" FOREIGN KEY ("spending_approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_provider_organization_id_organizations_id_fk" FOREIGN KEY ("provider_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_service_agreement_id_service_agreements_id_fk" FOREIGN KEY ("service_agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locale_settings" ADD CONSTRAINT "locale_settings_indexable_approval_id_approvals_id_fk" FOREIGN KEY ("indexable_approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locale_settings" ADD CONSTRAINT "locale_settings_reviewer_staff_id_staff_accounts_id_fk" FOREIGN KEY ("reviewer_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_policies" ADD CONSTRAINT "service_policies_approved_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_staff_id_staff_accounts_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_contact_method_id_contact_methods_id_fk" FOREIGN KEY ("contact_method_id") REFERENCES "public"."contact_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_owner_staff_id_staff_accounts_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_listing_version_id_listing_versions_id_fk" FOREIGN KEY ("listing_version_id") REFERENCES "public"."listing_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_relationships" ADD CONSTRAINT "party_relationships_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_relationships" ADD CONSTRAINT "party_relationships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_relationships" ADD CONSTRAINT "party_relationships_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_relationships" ADD CONSTRAINT "party_relationships_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_relationships" ADD CONSTRAINT "party_relationships_authority_reviewed_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("authority_reviewed_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_relationships" ADD CONSTRAINT "party_relationships_revoked_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("revoked_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_brief_items" ADD CONSTRAINT "requirement_brief_items_brief_id_requirement_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."requirement_briefs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_briefs" ADD CONSTRAINT "requirement_briefs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_briefs" ADD CONSTRAINT "requirement_briefs_acknowledged_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("acknowledged_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_staff_id_staff_accounts_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pending_owner_staff_id_staff_accounts_id_fk" FOREIGN KEY ("pending_owner_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("completed_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_promised_to_client_id_client_accounts_id_fk" FOREIGN KEY ("promised_to_client_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capability_grants_staff_idx" ON "capability_grants" USING btree ("staff_account_id");--> statement-breakpoint
CREATE INDEX "capability_grants_client_idx" ON "capability_grants" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "capability_grants_record_idx" ON "capability_grants" USING btree ("record_type","record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_accounts_email_idx" ON "client_accounts" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "email_sign_in_tokens_email_idx" ON "email_sign_in_tokens" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "sessions_staff_idx" ON "sessions" USING btree ("staff_account_id");--> statement-breakpoint
CREATE INDEX "sessions_client_idx" ON "sessions" USING btree ("client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_accounts_email_idx" ON "staff_accounts" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "approvals_subject_idx" ON "approvals" USING btree ("subject_type","subject_id","subject_version");--> statement-breakpoint
CREATE INDEX "alert_subscriptions_search_idx" ON "alert_subscriptions" USING btree ("saved_search_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_items_listing_idx" ON "shortlist_items" USING btree ("shortlist_id","listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_opinions_idx" ON "shortlist_opinions" USING btree ("item_id","client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_participants_idx" ON "shortlist_participants" USING btree ("shortlist_id","client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_versions_number_idx" ON "appointment_versions" USING btree ("appointment_id","version_number");--> statement-breakpoint
CREATE INDEX "appointments_case_idx" ON "appointments" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "appointments_host_idx" ON "appointments" USING btree ("host_staff_id","confirmed_starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_number_idx" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "documents_case_idx" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_deliveries_attempt_idx" ON "message_deliveries" USING btree ("message_id","recipient","attempt");--> statement-breakpoint
CREATE INDEX "messages_case_idx" ON "messages" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_versions_number_idx" ON "proposal_versions" USING btree ("proposal_id","version_number");--> statement-breakpoint
CREATE INDEX "geography_place_aliases_trgm_idx" ON "geography_place_aliases" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "geography_place_aliases_unique_idx" ON "geography_place_aliases" USING btree ("place_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "geography_places_slug_idx" ON "geography_places" USING btree ("country_code","slug");--> statement-breakpoint
CREATE INDEX "geography_places_parent_idx" ON "geography_places" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_batch_row_idx" ON "import_rows" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "import_rows_classification_idx" ON "import_rows" USING btree ("batch_id","classification");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_url_decisions_source_idx" ON "legacy_url_decisions" USING btree ("domain","source_path","source_query");--> statement-breakpoint
CREATE INDEX "contact_consents_method_idx" ON "contact_consents" USING btree ("contact_method_id","purpose","recorded_at");--> statement-breakpoint
CREATE INDEX "contact_methods_normalized_idx" ON "contact_methods" USING btree ("kind","normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "person_aliases_former_idx" ON "person_aliases" USING btree ("former_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facts_property_field_idx" ON "facts" USING btree ("property_id","field_key") WHERE "facts"."property_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "facts_listing_field_idx" ON "facts" USING btree ("listing_id","field_key") WHERE "facts"."listing_id" is not null;--> statement-breakpoint
CREATE INDEX "listing_search_vector_idx" ON "listing_search_documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "listing_search_reference_trgm_idx" ON "listing_search_documents" USING gin ("reference" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "listing_search_place_ids_idx" ON "listing_search_documents" USING gin ("place_ids");--> statement-breakpoint
CREATE INDEX "listing_search_filter_idx" ON "listing_search_documents" USING btree ("purpose","commercial_state","property_type");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_versions_number_idx" ON "listing_versions" USING btree ("listing_id","version_number");--> statement-breakpoint
CREATE INDEX "listings_property_idx" ON "listings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "media_assets_listing_idx" ON "media_assets" USING btree ("listing_id","sort_order");--> statement-breakpoint
CREATE INDEX "media_assets_property_idx" ON "media_assets" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "properties_place_idx" ON "properties" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_page_versions_number_idx" ON "content_page_versions" USING btree ("content_page_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "content_pages_slug_idx" ON "content_pages" USING btree ("kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_outcomes_idx" ON "publication_destination_outcomes" USING btree ("release_id","destination","locale");--> statement-breakpoint
CREATE INDEX "publication_releases_subject_idx" ON "publication_releases" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translations_subject_locale_version_idx" ON "translations" USING btree ("subject_type","subject_id","locale","source_version");--> statement-breakpoint
CREATE INDEX "activity_events_record_idx" ON "activity_events" USING btree ("record_type","record_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_record_idx" ON "audit_log" USING btree ("record_type","record_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_operation_idx" ON "audit_log" USING btree ("operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_receipts_key_idx" ON "operation_receipts" USING btree ("actor_kind","actor_id","operation_type","idempotency_key");--> statement-breakpoint
CREATE INDEX "operation_receipts_status_idx" ON "operation_receipts" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_quotes_version_idx" ON "reservation_quotes" USING btree ("listing_id","check_in","check_out","version_number");--> statement-breakpoint
CREATE INDEX "reservations_listing_idx" ON "reservations" USING btree ("listing_id","check_in");--> statement-breakpoint
CREATE INDEX "service_requests_agreement_idx" ON "service_requests" USING btree ("service_agreement_id","state");--> statement-breakpoint
CREATE INDEX "statement_lines_statement_idx" ON "statement_lines" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "case_stage_history_case_idx" ON "case_stage_history" USING btree ("case_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cases_owner_idx" ON "cases" USING btree ("owner_staff_id","stage");--> statement-breakpoint
CREATE INDEX "inquiries_state_idx" ON "inquiries" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_owner_idx" ON "inquiries" USING btree ("owner_staff_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_case_listing_idx" ON "matches" USING btree ("case_id","listing_id");--> statement-breakpoint
CREATE INDEX "party_relationships_case_idx" ON "party_relationships" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "party_relationships_person_idx" ON "party_relationships" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "requirement_brief_items_brief_idx" ON "requirement_brief_items" USING btree ("brief_id","position");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_staff_id","state","due_at");--> statement-breakpoint
CREATE INDEX "tasks_case_idx" ON "tasks" USING btree ("case_id");