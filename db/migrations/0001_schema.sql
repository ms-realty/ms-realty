CREATE TYPE "public"."actor_kind" AS ENUM('staff', 'client', 'visitor', 'ai_service', 'system');--> statement-breakpoint
CREATE TYPE "public"."alert_frequency" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."appointment_format" AS ENUM('in_person', 'remote');--> statement-breakpoint
CREATE TYPE "public"."appointment_resource_kind" AS ENUM('broker', 'property_access');--> statement-breakpoint
CREATE TYPE "public"."appointment_state" AS ENUM('requested', 'proposed', 'confirmed', 'reschedule_requested', 'completed', 'declined', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."approval_kind" AS ENUM('factual', 'editorial', 'language', 'legal_process_claim', 'owner_acknowledgment', 'publication', 'message_send', 'proposal_terms', 'locale_indexability', 'import_apply', 'legacy_source_as_is', 'legacy_content_approval');--> statement-breakpoint
CREATE TYPE "public"."approval_state" AS ENUM('pending', 'approved', 'rejected', 'invalidated', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."audience" AS ENUM('internal', 'case_participants', 'specialist', 'public');--> statement-breakpoint
CREATE TYPE "public"."authority_state" AS ENUM('not_claimed', 'self_declared', 'under_review', 'reviewed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."capability" AS ENUM('inquiry.submit', 'portal.case.read', 'portal.interest.respond', 'portal.message.write', 'portal.document.upload', 'portal.appointment.request', 'portal.proposal.respond', 'portal.listing.acknowledge', 'inquiry.read', 'inquiry.assign', 'inquiry.respond', 'case.read', 'case.read_internal', 'case.transition', 'task.manage', 'interest.manage', 'listing.read', 'listing.edit', 'listing.review_facts', 'media.manage', 'translation.draft', 'translation.review', 'publication.release', 'content.edit', 'claim.approve', 'message.draft', 'message.send_external', 'appointment.manage', 'document.read_restricted', 'document.review', 'proposal.manage', 'access.grant', 'report.read', 'settings.manage', 'import.run', 'privacy.manage', 'audit.read', 'ai.draft');--> statement-breakpoint
CREATE TYPE "public"."case_disposition" AS ENUM('active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."case_kind" AS ENUM('buyer', 'tenant', 'seller', 'landlord', 'service_intake');--> statement-breakpoint
CREATE TYPE "public"."commercial_state" AS ENUM('available', 'confirmation_required', 'negotiating', 'reserved_with_recorded_basis', 'sold', 'let', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."consent_event_kind" AS ENUM('opted_in', 'channel_verified', 'criteria_changed', 'paused', 'resumed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."contact_method_kind" AS ENUM('email', 'phone', 'whatsapp', 'viber', 'postal');--> statement-breakpoint
CREATE TYPE "public"."contact_verification_state" AS ENUM('unverified', 'pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."content_page_kind" AS ENUM('area', 'guide', 'service', 'team_member', 'help');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('EUR', 'BGN', 'USD', 'GBP');--> statement-breakpoint
CREATE TYPE "public"."delivery_kind" AS ENUM('publish', 'withdraw');--> statement-breakpoint
CREATE TYPE "public"."delivery_state" AS ENUM('queued', 'attempting', 'acknowledged', 'verified', 'failed', 'outcome_unknown', 'withdrawing', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."document_classification" AS ENUM('identity', 'title', 'financial', 'contract', 'property', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_review_type" AS ENUM('accepted_for_purpose', 'needs_replacement', 'reviewed_with_open_questions');--> statement-breakpoint
CREATE TYPE "public"."document_state" AS ENUM('selected', 'uploading', 'uploaded', 'sealed', 'scanning', 'ready_for_review', 'reviewed', 'rejected', 'needs_replacement', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."editorial_state" AS ENUM('draft', 'needs_facts', 'in_review', 'approved_revision', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."evidence_environment" AS ENUM('local', 'ci', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."exclusivity" AS ENUM('exclusive', 'non_exclusive', 'not_recorded');--> statement-breakpoint
CREATE TYPE "public"."external_action_kind" AS ENUM('email_send', 'destination_publish', 'destination_withdraw', 'media_purge');--> statement-breakpoint
CREATE TYPE "public"."external_action_state" AS ENUM('queued', 'attempting', 'acknowledged', 'verified', 'failed', 'outcome_unknown', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."fact_state" AS ENUM('known', 'unknown', 'not_supplied', 'not_applicable', 'withheld', 'conflicting');--> statement-breakpoint
CREATE TYPE "public"."freshness_state" AS ENUM('current_under_policy', 'review_due', 'conflicting', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."import_batch_mode" AS ENUM('dry_run', 'apply');--> statement-breakpoint
CREATE TYPE "public"."import_batch_state" AS ENUM('staged', 'validated', 'applying', 'completed', 'partially_completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."import_row_classification" AS ENUM('create', 'update_proposal', 'no_change', 'blocked', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."import_row_outcome" AS ENUM('pending', 'applied', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."inbox_event_state" AS ENUM('received', 'processed', 'rejected', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."inquiry_purpose" AS ENUM('question', 'callback', 'viewing_request', 'seller_consultation', 'landlord_consultation', 'service_consultation');--> statement-breakpoint
CREATE TYPE "public"."inquiry_source" AS ENUM('website', 'phone', 'email', 'messenger', 'walk_in', 'import');--> statement-breakpoint
CREATE TYPE "public"."inquiry_state" AS ENUM('received', 'assigned', 'awaiting_client', 'linked_to_case', 'resolved_without_case', 'suspected_spam', 'duplicate_candidate', 'contact_unreachable');--> statement-breakpoint
CREATE TYPE "public"."interest_state" AS ENUM('suggested', 'shortlisted', 'viewing_requested', 'viewed', 'proposal', 'declined', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."legacy_domain" AS ENUM('makler-realty.com', 'makler-realty.ru');--> statement-breakpoint
CREATE TYPE "public"."legacy_url_decision" AS ENUM('retain_200', 'redirect_301', 'approved_410');--> statement-breakpoint
CREATE TYPE "public"."listing_purpose" AS ENUM('sale', 'long_term_rent');--> statement-breakpoint
CREATE TYPE "public"."locale_state" AS ENUM('missing', 'draft', 'reviewing', 'approved_for_source', 'stale', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."location_precision" AS ENUM('exact', 'street', 'neighborhood', 'settlement', 'region');--> statement-breakpoint
CREATE TYPE "public"."material_change" AS ENUM('initial', 'none', 'non_material', 'material');--> statement-breakpoint
CREATE TYPE "public"."media_audience" AS ENUM('private', 'public_candidate');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'floor_plan', 'video', 'render', 'virtual_tour');--> statement-breakpoint
CREATE TYPE "public"."media_modification" AS ENUM('none', 'retouched', 'virtually_staged', 'renovation_render', 'redrawn_plan');--> statement-breakpoint
CREATE TYPE "public"."media_purpose" AS ENUM('listing_gallery', 'floor_plan', 'tour', 'private_evidence');--> statement-breakpoint
CREATE TYPE "public"."media_review_state" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_rights_state" AS ENUM('unknown', 'pending', 'cleared', 'restricted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."merge_subject" AS ENUM('party', 'property');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('email', 'phone', 'whatsapp', 'viber', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('case_message', 'service_message', 'internal_note');--> statement-breakpoint
CREATE TYPE "public"."message_state" AS ENUM('draft', 'approved', 'queued', 'attempting', 'provider_accepted', 'delivered', 'bounced', 'failed', 'outcome_unknown');--> statement-breakpoint
CREATE TYPE "public"."operation_status" AS ENUM('accepted', 'in_progress', 'succeeded', 'failed', 'outcome_unknown');--> statement-breakpoint
CREATE TYPE "public"."outbox_event_state" AS ENUM('pending', 'dispatched', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('buyer', 'co_buyer', 'tenant', 'seller', 'landlord', 'authorized_representative', 'adviser', 'collaborator', 'specialist', 'guest');--> statement-breakpoint
CREATE TYPE "public"."party_kind" AS ENUM('person', 'organization');--> statement-breakpoint
CREATE TYPE "public"."place_alias_kind" AS ENUM('official', 'local', 'transliteration', 'legacy_spelling');--> statement-breakpoint
CREATE TYPE "public"."place_level" AS ENUM('country', 'district', 'municipality', 'settlement', 'neighborhood');--> statement-breakpoint
CREATE TYPE "public"."publication_pointer_state" AS ENUM('active', 'restricted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."price_basis" AS ENUM('asking', 'negotiable', 'fixed', 'indicative');--> statement-breakpoint
CREATE TYPE "public"."price_period" AS ENUM('total', 'month');--> statement-breakpoint
CREATE TYPE "public"."principal_kind" AS ENUM('staff', 'client');--> statement-breakpoint
CREATE TYPE "public"."principal_status" AS ENUM('active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_kind" AS ENUM('access', 'export', 'correction', 'deletion', 'restriction', 'objection');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_state" AS ENUM('received', 'verifying', 'in_progress', 'on_legal_hold', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."processing_state" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."professional_validation_state" AS ENUM('not_requested', 'requested', 'validated', 'declined');--> statement-breakpoint
CREATE TYPE "public"."property_access_state" AS ENUM('unknown', 'requested', 'confirmed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('apartment', 'house', 'plot', 'commercial', 'hotel', 'development', 'other');--> statement-breakpoint
CREATE TYPE "public"."proposal_state" AS ENUM('draft', 'reviewed', 'submitted', 'awaiting_response', 'countered', 'declined', 'withdrawn', 'expired', 'agreed_for_next_step');--> statement-breakpoint
CREATE TYPE "public"."public_locale" AS ENUM('bg', 'en', 'ru', 'de', 'nl', 'el', 'he');--> statement-breakpoint
CREATE TYPE "public"."publication_destination" AS ENUM('website', 'manual_portal');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('never_published', 'eligible', 'active', 'restricted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."redaction_status" AS ENUM('redacted', 'no_personal_data', 'unredacted_restricted');--> statement-breakpoint
CREATE TYPE "public"."representation_scope" AS ENUM('sale', 'letting', 'sale_and_letting');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('visitor', 'verified_client', 'invited_collaborator', 'assigned_broker', 'coordinator', 'content_editor', 'translation_reviewer', 'publishing_approver', 'manager', 'external_specialist', 'ai_service');--> statement-breakpoint
CREATE TYPE "public"."scan_state" AS ENUM('pending', 'clean', 'infected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."seller_instruction_state" AS ENUM('draft', 'agreed', 'superseded', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TYPE "public"."service_intake_topic" AS ENUM('short_stay_consultation', 'management_consultation');--> statement-breakpoint
CREATE TYPE "public"."sign_in_token_purpose" AS ENUM('sign_in', 'invitation');--> statement-breakpoint
CREATE TYPE "public"."source_class" AS ENUM('source_supplied', 'owner_confirmed', 'agency_observed', 'document_reviewed', 'professionally_reviewed', 'system_calculated', 'legacy_import');--> statement-breakpoint
CREATE TYPE "public"."staff_locale" AS ENUM('bg', 'ru', 'en');--> statement-breakpoint
CREATE TYPE "public"."staff_membership_state" AS ENUM('active', 'suspended', 'ended');--> statement-breakpoint
CREATE TYPE "public"."subscription_purpose" AS ENUM('service_updates', 'search_alerts', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."subscription_state" AS ENUM('pending_verification', 'active', 'paused', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('open', 'in_progress', 'waiting', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('general', 'follow_up', 'call', 'fact_verification', 'document_request', 'viewing_coordination', 'correction', 'publishing', 'communication', 'access_grant', 'approval');--> statement-breakpoint
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
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by_kind" "actor_kind" NOT NULL,
	"requested_by_id" text NOT NULL,
	"decided_by_kind" "actor_kind",
	"decided_by_id" text,
	"decided_with_capability" "capability",
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"expires_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	CONSTRAINT "approvals_human_decision" CHECK ("approvals"."state" not in ('approved', 'rejected') or (coalesce("approvals"."decided_by_kind" in ('staff', 'client'), false) and "approvals"."decided_by_id" is not null and "approvals"."decided_at" is not null)),
	CONSTRAINT "approvals_invalidation_reason" CHECK ("approvals"."state" <> 'invalidated' or ("approvals"."invalidated_at" is not null and "approvals"."invalidation_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "appointment_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"party_id" uuid,
	"principal_id" uuid,
	"role" text NOT NULL,
	"acknowledged_sequence" integer,
	"notified_sequence" integer,
	CONSTRAINT "appointment_participants_one" CHECK (num_nonnulls("appointment_participants"."party_id", "appointment_participants"."principal_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "appointment_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"kind" "appointment_resource_kind" NOT NULL,
	"resource_id" uuid NOT NULL,
	"during" "tstzrange" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "appointment_resources_released" CHECK ("appointment_resources"."active" or "appointment_resources"."released_at" is not null)
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
	"interest_id" uuid,
	"listing_id" uuid,
	"property_id" uuid,
	"host_id" uuid,
	"timezone" text NOT NULL,
	"requested_windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_starts_at" timestamp with time zone,
	"proposed_ends_at" timestamp with time zone,
	"confirmed_starts_at" timestamp with time zone,
	"confirmed_ends_at" timestamp with time zone,
	"replaces_appointment_id" uuid,
	"property_access" "property_access_state" DEFAULT 'unknown' NOT NULL,
	"access_notes" text,
	"external_busy_checked_at" timestamp with time zone,
	"external_busy_checked_by_id" uuid,
	"ics_uid" text NOT NULL,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"outcome_note" text,
	"cancel_reason" text,
	CONSTRAINT "appointments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "appointments_ics_uid_unique" UNIQUE("ics_uid"),
	CONSTRAINT "appointments_confirmed_slot" CHECK ("appointments"."state" not in ('confirmed', 'reschedule_requested', 'completed', 'no_show') or ("appointments"."confirmed_starts_at" is not null and "appointments"."confirmed_ends_at" is not null and "appointments"."confirmed_ends_at" > "appointments"."confirmed_starts_at")),
	CONSTRAINT "appointments_confirmed_checks" CHECK ("appointments"."state" <> 'confirmed' or ("appointments"."host_id" is not null and "appointments"."property_access" = 'confirmed' and "appointments"."external_busy_checked_at" is not null))
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
	"staging_key" text,
	"sealed_key" text,
	"sha256" text,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint,
	"uploaded_by_kind" "actor_kind" NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"scan" "scan_state" DEFAULT 'pending' NOT NULL,
	"scanned_at" timestamp with time zone,
	"review_type" "document_review_type",
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"professional_validation" "professional_validation_state" DEFAULT 'not_requested' NOT NULL,
	"professional_validator" text,
	"superseded_by_version_id" uuid,
	CONSTRAINT "document_versions_staging_key_unique" UNIQUE("staging_key"),
	CONSTRAINT "document_versions_sealed_key_unique" UNIQUE("sealed_key"),
	CONSTRAINT "document_versions_scan_sealed_bytes" CHECK ("document_versions"."scan" = 'pending' or ("document_versions"."sealed_key" is not null and "document_versions"."sha256" is not null)),
	CONSTRAINT "document_versions_review_after_clean_scan" CHECK ("document_versions"."state" not in ('ready_for_review', 'reviewed') or "document_versions"."scan" = 'clean'),
	CONSTRAINT "document_versions_reviewed_by_human" CHECK ("document_versions"."state" <> 'reviewed' or ("document_versions"."review_type" is not null and "document_versions"."reviewed_by_id" is not null))
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
	"retention_class" text,
	"expires_at" timestamp with time zone,
	CONSTRAINT "documents_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "message_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"recipient" text NOT NULL,
	"external_action_id" uuid,
	"provider" text NOT NULL,
	"provider_idempotency_key" text NOT NULL,
	"provider_reference" text,
	"state" "message_state" DEFAULT 'attempting' NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" text
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
	"audience" "audience" NOT NULL,
	"state" "message_state" DEFAULT 'draft' NOT NULL,
	"case_id" uuid,
	"inquiry_id" uuid,
	"author_kind" "actor_kind" NOT NULL,
	"author_id" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload_digest" text NOT NULL,
	"approval_id" uuid,
	"approved_digest" text,
	"logical_send_id" text,
	"drafted_by_ai" boolean DEFAULT false NOT NULL,
	CONSTRAINT "messages_logical_send_id_unique" UNIQUE("logical_send_id"),
	CONSTRAINT "messages_internal_never_sent" CHECK ("messages"."kind" <> 'internal_note' or ("messages"."state" = 'draft' and "messages"."audience" = 'internal')),
	CONSTRAINT "messages_sent_only_when_approved" CHECK ("messages"."direction" = 'inbound' or "messages"."state" = 'draft' or ("messages"."approved_digest" is not null and ("messages"."approval_id" is not null or "messages"."kind" = 'service_message'))),
	CONSTRAINT "messages_logical_send" CHECK ("messages"."direction" = 'inbound' or "messages"."state" in ('draft', 'approved') or "messages"."logical_send_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "proposal_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"state" "proposal_state" DEFAULT 'draft' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"period" "price_period" NOT NULL,
	"payment_basis" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parties" jsonb NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"deadline_timezone" text NOT NULL,
	"source_listing_revision_id" uuid,
	"responds_to_revision_id" uuid,
	"terms_hash" text NOT NULL,
	"approval_id" uuid,
	"submitted_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"response_note" text,
	CONSTRAINT "proposal_revisions_amount" CHECK ("proposal_revisions"."amount_minor" >= 0),
	CONSTRAINT "proposal_revisions_submitted_approved" CHECK ("proposal_revisions"."state" in ('draft', 'reviewed', 'withdrawn') or "proposal_revisions"."approval_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"case_id" uuid NOT NULL,
	"interest_id" uuid,
	"listing_id" uuid NOT NULL,
	"active_revision_number" integer DEFAULT 1 NOT NULL,
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
CREATE TABLE "email_sign_in_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "sign_in_token_purpose" NOT NULL,
	"principal_kind" "principal_kind" NOT NULL,
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
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"principal_id" uuid,
	"service_name" text,
	"role" "role",
	"capability" "capability",
	"record_type" text,
	"record_id" uuid,
	"locales" "public_locale"[],
	"granted_by_id" uuid,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	CONSTRAINT "grants_one_grantee" CHECK (num_nonnulls("grants"."principal_id", "grants"."service_name") = 1),
	CONSTRAINT "grants_role_or_capability" CHECK (num_nonnulls("grants"."role", "grants"."capability") = 1),
	CONSTRAINT "grants_service_drafts_only" CHECK ("grants"."service_name" is null or coalesce("grants"."role" = 'ai_service', false) or coalesce("grants"."capability" in ('ai.draft', 'translation.draft', 'message.draft'), false)),
	CONSTRAINT "grants_record_scope" CHECK (("grants"."record_id" is null) or ("grants"."record_type" is not null))
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_id" uuid NOT NULL,
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
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "principal_kind" NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"party_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"preferred_locale" "public_locale" DEFAULT 'bg' NOT NULL,
	"status" "principal_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"principal_kind" "principal_kind" NOT NULL,
	"principal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"principal_id" uuid NOT NULL,
	"state" "staff_membership_state" DEFAULT 'active' NOT NULL,
	"staff_locale" "staff_locale" DEFAULT 'bg' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "staff_memberships_principal_id_unique" UNIQUE("principal_id")
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge" text NOT NULL,
	"purpose" text NOT NULL,
	"principal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "webauthn_challenges_challenge_unique" UNIQUE("challenge"),
	CONSTRAINT "webauthn_challenges_purpose" CHECK ("webauthn_challenges"."purpose" in ('registration', 'authentication'))
);
--> statement-breakpoint
CREATE TABLE "listing_revision_media" (
	"listing_revision_id" uuid NOT NULL,
	"media_relation_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "listing_revision_media_listing_revision_id_media_relation_id_pk" PRIMARY KEY("listing_revision_id","media_relation_id")
);
--> statement-breakpoint
CREATE TABLE "listing_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"fact_revision_id" uuid NOT NULL,
	"terms" jsonb NOT NULL,
	"source_copy" jsonb NOT NULL,
	"disclosure" jsonb NOT NULL,
	"content_digest" text NOT NULL,
	"created_by_kind" "actor_kind" NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_revisions_number" CHECK ("listing_revisions"."revision_number" >= 1)
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
	"manifest_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"commercial_state" "commercial_state" DEFAULT 'confirmation_required' NOT NULL,
	"availability_basis" text,
	"availability_confirmed_at" timestamp with time zone,
	"availability_confirmed_by_id" uuid,
	"freshness_state" "freshness_state" DEFAULT 'unknown' NOT NULL,
	"review_due_at" timestamp with time zone,
	"editorial_state" "editorial_state" DEFAULT 'draft' NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latest_revision_number" integer DEFAULT 0 NOT NULL,
	"approved_revision_id" uuid,
	"publication_generation" integer DEFAULT 0 NOT NULL,
	"responsible_broker_id" uuid,
	"legacy_identity" jsonb,
	CONSTRAINT "listings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "listings_reserved_basis" CHECK ("listings"."commercial_state" <> 'reserved_with_recorded_basis' or "listings"."availability_basis" is not null),
	CONSTRAINT "listings_available_confirmed" CHECK ("listings"."commercial_state" <> 'available' or "listings"."availability_confirmed_at" is not null),
	CONSTRAINT "listings_generation" CHECK ("listings"."publication_generation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "localized_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"listing_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"locale" "public_locale" NOT NULL,
	"state" "locale_state" DEFAULT 'missing' NOT NULL,
	"title" text,
	"body" jsonb,
	"drafted_by_ai" boolean DEFAULT false NOT NULL,
	"reviewed_facts" jsonb,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"approval_id" uuid,
	"rejection_reason" text,
	CONSTRAINT "localized_revisions_not_source_locale" CHECK ("localized_revisions"."locale" <> 'bg'),
	CONSTRAINT "localized_revisions_approved_by_human" CHECK ("localized_revisions"."state" <> 'approved_for_source' or ("localized_revisions"."reviewed_by_id" is not null and "localized_revisions"."approval_id" is not null and "localized_revisions"."reviewed_facts" is not null))
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"property_id" uuid NOT NULL,
	"purpose" "media_purpose" NOT NULL,
	"kind" "media_kind" NOT NULL,
	"original_key" text NOT NULL,
	"sealed_key" text,
	"sha256" text,
	"content_type" text NOT NULL,
	"byte_size" bigint,
	"width" integer,
	"height" integer,
	"scan" "scan_state" DEFAULT 'pending' NOT NULL,
	"processing" "processing_state" DEFAULT 'pending' NOT NULL,
	"rights" "media_rights_state" DEFAULT 'unknown' NOT NULL,
	"rights_holder" text,
	"rights_reference" text,
	"audience" "media_audience" DEFAULT 'private' NOT NULL,
	"review" "media_review_state" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" uuid,
	"modification" "media_modification" DEFAULT 'none' NOT NULL,
	"modification_disclosure" text,
	"original_asset_id" uuid,
	"caption" text,
	"alt_text" text,
	"captured_at" timestamp with time zone,
	"legacy_reference" text,
	CONSTRAINT "media_assets_original_key_unique" UNIQUE("original_key"),
	CONSTRAINT "media_assets_sealed_key_unique" UNIQUE("sealed_key"),
	CONSTRAINT "media_assets_content_type" CHECK ("media_assets"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'application/pdf')),
	CONSTRAINT "media_assets_scan_sealed_bytes" CHECK ("media_assets"."scan" = 'pending' or ("media_assets"."sealed_key" is not null and "media_assets"."sha256" is not null)),
	CONSTRAINT "media_assets_review_after_clean_scan" CHECK ("media_assets"."review" <> 'approved' or ("media_assets"."scan" = 'clean' and "media_assets"."reviewed_by_id" is not null)),
	CONSTRAINT "media_assets_modification_disclosed" CHECK ("media_assets"."modification" = 'none' or "media_assets"."modification_disclosure" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"listing_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone
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
	"approved_fact_revision_id" uuid,
	"merged_into_property_id" uuid,
	CONSTRAINT "properties_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "property_fact_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"based_on_revision_id" uuid,
	"content_digest" text NOT NULL,
	"material_change" "material_change" NOT NULL,
	"material_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_kind" "actor_kind" NOT NULL,
	"created_by_id" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_fact_revisions_number" CHECK ("property_fact_revisions"."revision_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "property_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fact_revision_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"state" "fact_state" NOT NULL,
	"value" jsonb,
	"unit" text,
	"basis" text,
	"source_class" "source_class" NOT NULL,
	"source_reference" text,
	"source_language" text,
	"observed_at" timestamp with time zone,
	"review_scope" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"note" text,
	CONSTRAINT "property_facts_value_matches_state" CHECK (("property_facts"."state" in ('known', 'conflicting')) = ("property_facts"."value" is not null)),
	CONSTRAINT "property_facts_review_recorded" CHECK (("property_facts"."reviewed_by_id" is null) = ("property_facts"."reviewed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "property_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"party_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"role" "participant_role" NOT NULL,
	"authority" "authority_state" DEFAULT 'self_declared' NOT NULL,
	"authority_reviewed_by_id" uuid,
	"authority_reviewed_at" timestamp with time zone,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	CONSTRAINT "property_relationships_reviewed_authority" CHECK ("property_relationships"."authority" <> 'reviewed' or ("property_relationships"."authority_reviewed_by_id" is not null and "property_relationships"."authority_reviewed_at" is not null))
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
	"created_by_id" uuid,
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
CREATE TABLE "merge_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" "merge_subject" NOT NULL,
	"survivor_id" uuid NOT NULL,
	"merged_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"review" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by_id" uuid,
	CONSTRAINT "merge_records_distinct" CHECK ("merge_records"."survivor_id" <> "merge_records"."merged_id")
);
--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "consent_event_kind" NOT NULL,
	"policy_version" text NOT NULL,
	"template_version" text,
	"source" text NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"party_id" uuid NOT NULL,
	"kind" "contact_method_kind" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"verification" "contact_verification_state" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	CONSTRAINT "contact_methods_verified_at" CHECK ("contact_methods"."verification" <> 'verified' or "contact_methods"."verified_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "party_kind" NOT NULL,
	"display_name" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"legal_name" text,
	"registration_number" text,
	"country" text,
	"preferred_locale" "public_locale",
	"contact_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"matching_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"merged_into_party_id" uuid
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"party_id" uuid NOT NULL,
	"contact_method_id" uuid NOT NULL,
	"purpose" "subscription_purpose" NOT NULL,
	"state" "subscription_state" DEFAULT 'pending_verification' NOT NULL,
	"verified_at" timestamp with time zone,
	"criteria" jsonb,
	"criteria_summary" text,
	"frequency" "alert_frequency",
	"timezone" text NOT NULL,
	"policy_version" text NOT NULL,
	"template_version" text,
	"unsubscribe_token_hash" text NOT NULL,
	"last_sent_at" timestamp with time zone,
	CONSTRAINT "subscriptions_unsubscribe_token_hash_unique" UNIQUE("unsubscribe_token_hash"),
	CONSTRAINT "subscriptions_active_verified" CHECK ("subscriptions"."state" <> 'active' or "subscriptions"."verified_at" is not null),
	CONSTRAINT "subscriptions_alert_criteria" CHECK (("subscriptions"."purpose" = 'search_alerts') = ("subscriptions"."criteria" is not null and "subscriptions"."frequency" is not null))
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
	"created_by_id" uuid,
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
	"publication_state" "publication_state" DEFAULT 'never_published' NOT NULL,
	"current_version_number" integer DEFAULT 0 NOT NULL,
	"published_version_number" integer
);
--> statement-breakpoint
CREATE TABLE "current_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"listing_id" uuid NOT NULL,
	"locale" "public_locale" NOT NULL,
	"destination" "publication_destination" NOT NULL,
	"manifest_id" uuid NOT NULL,
	"state" "publication_pointer_state" NOT NULL,
	"generation" integer NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"activated_by_id" uuid NOT NULL,
	"restricted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "current_publications_reason" CHECK ("current_publications"."state" = 'active' or "current_publications"."reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "destination_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"manifest_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"locale" "public_locale" NOT NULL,
	"destination" "publication_destination" NOT NULL,
	"kind" "delivery_kind" NOT NULL,
	"generation" integer NOT NULL,
	"state" "delivery_state" DEFAULT 'queued' NOT NULL,
	"external_action_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" text,
	"evidence" jsonb,
	CONSTRAINT "destination_deliveries_verified_evidence" CHECK ("destination_deliveries"."state" not in ('verified', 'withdrawn') or "destination_deliveries"."verified_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "public_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"listing_references" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "public_shares_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "publication_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"locale" "public_locale" NOT NULL,
	"destination" "publication_destination" NOT NULL,
	"generation" integer NOT NULL,
	"listing_revision_id" uuid NOT NULL,
	"fact_revision_id" uuid NOT NULL,
	"localized_revision_id" uuid,
	"media" jsonb NOT NULL,
	"disclosure" jsonb NOT NULL,
	"availability_basis" jsonb NOT NULL,
	"policy_revision" text NOT NULL,
	"decisions" jsonb NOT NULL,
	"content_digest" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_manifests_locale_copy" CHECK (("publication_manifests"."locale" = 'bg') = ("publication_manifests"."localized_revision_id" is null))
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
CREATE TABLE "audit_events" (
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
CREATE TABLE "external_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "external_action_kind" NOT NULL,
	"effect_key" text NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"source_generation" integer,
	"outbox_event_id" uuid,
	"payload" jsonb NOT NULL,
	"payload_digest" text NOT NULL,
	"secret_payload" jsonb,
	"state" "external_action_state" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"provider_reference" text,
	"last_error_code" text,
	"first_attempt_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"reconciled_by_id" uuid,
	CONSTRAINT "external_actions_effect_key_unique" UNIQUE("effect_key"),
	CONSTRAINT "external_actions_attempted" CHECK ("external_actions"."state" in ('queued', 'cancelled') or "external_actions"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "inbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"signature_verified" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"state" "inbox_event_state" DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "inbox_events_processed_signed" CHECK ("inbox_events"."state" <> 'processed' or "inbox_events"."signature_verified")
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"expected_revision" integer,
	"status" "operation_status" DEFAULT 'accepted' NOT NULL,
	"outcome" jsonb,
	"result_type" text,
	"result_id" uuid,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_generation" integer,
	"operation_id" uuid,
	"state" "outbox_event_state" DEFAULT 'pending' NOT NULL,
	"dispatch_job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "outbox_events_dispatch_job_id_unique" UNIQUE("dispatch_job_id"),
	CONSTRAINT "outbox_events_dispatch_binding" CHECK ("outbox_events"."state" = 'pending' or "outbox_events"."state" = 'cancelled' or "outbox_events"."dispatch_job_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"kind" "privacy_request_kind" NOT NULL,
	"state" "privacy_request_state" DEFAULT 'received' NOT NULL,
	"party_id" uuid,
	"contact_method_id" uuid,
	"verified_at" timestamp with time zone,
	"verification_method" text,
	"responsible_id" uuid,
	"due_at" timestamp with time zone,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legal_hold_reason" text,
	"legal_hold_disposition" text,
	"completion_evidence" text,
	"completed_at" timestamp with time zone,
	"rejection_reason" text,
	CONSTRAINT "privacy_requests_reference_unique" UNIQUE("reference"),
	CONSTRAINT "privacy_requests_in_progress_verified" CHECK ("privacy_requests"."state" in ('received', 'verifying', 'rejected') or ("privacy_requests"."verified_at" is not null and "privacy_requests"."responsible_id" is not null)),
	CONSTRAINT "privacy_requests_completed_evidence" CHECK ("privacy_requests"."state" <> 'completed' or ("privacy_requests"."completion_evidence" is not null and "privacy_requests"."legal_hold_disposition" is not null and "privacy_requests"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "release_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_version" integer NOT NULL,
	"environment" "evidence_environment" NOT NULL,
	"release_sha" text NOT NULL,
	"digests" jsonb NOT NULL,
	"policy_revision" text NOT NULL,
	"data_digest" text,
	"gate" text,
	"observed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"reviewer" text,
	"assertions" jsonb NOT NULL,
	"redaction_status" "redaction_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locale_settings" (
	"locale" "public_locale" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"indexable" boolean DEFAULT false NOT NULL,
	"indexable_approval_id" uuid,
	"reviewer_id" uuid,
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
	"availability_review_days" jsonb DEFAULT '{"sale":14,"long_term_rent":7}'::jsonb NOT NULL,
	"approved_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "brief_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"items" jsonb NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author_kind" "actor_kind" NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_acknowledged_at" timestamp with time zone,
	"client_acknowledged_by_id" uuid,
	"broker_acknowledged_at" timestamp with time zone,
	"broker_acknowledged_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "case_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"role" "participant_role" NOT NULL,
	"authority" "authority_state" DEFAULT 'not_claimed' NOT NULL,
	"authority_reviewed_by_id" uuid,
	"authority_reviewed_at" timestamp with time zone,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	CONSTRAINT "case_participants_reviewed_authority" CHECK ("case_participants"."authority" <> 'reviewed' or ("case_participants"."authority_reviewed_by_id" is not null and "case_participants"."authority_reviewed_at" is not null))
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
	"disposition" "case_disposition" DEFAULT 'active' NOT NULL,
	"service_topic" "service_intake_topic",
	"title" text NOT NULL,
	"property_id" uuid,
	"owner_id" uuid,
	"pending_owner_id" uuid,
	"next_action" text,
	"next_action_due_at" timestamp with time zone,
	"waiting_on" text,
	"review_at" timestamp with time zone,
	"disposition_reason" text,
	"closure_outcome" text,
	"commitment_dispositions" jsonb,
	"client_summary" text,
	CONSTRAINT "cases_reference_unique" UNIQUE("reference"),
	CONSTRAINT "cases_stage_matches_kind" CHECK (("cases"."kind" in ('buyer', 'tenant') and "cases"."stage" in ('needs_agreed', 'evaluating', 'viewing', 'proposal_preparation', 'proposal_active', 'coordination', 'completed'))
        or ("cases"."kind" in ('seller', 'landlord') and "cases"."stage" in ('request_received', 'scope_authority_review', 'assessment', 'instructions_agreed', 'preparing', 'marketing', 'proposal_coordination', 'completion_handover'))
        or ("cases"."kind" = 'service_intake' and "cases"."stage" in ('request_received', 'consultation', 'concluded'))),
	CONSTRAINT "cases_service_topic" CHECK (("cases"."kind" = 'service_intake') = ("cases"."service_topic" is not null)),
	CONSTRAINT "cases_active_owned" CHECK ("cases"."disposition" <> 'active' or ("cases"."owner_id" is not null and ("cases"."next_action" is not null or ("cases"."waiting_on" is not null and "cases"."review_at" is not null)))),
	CONSTRAINT "cases_paused_dependency" CHECK ("cases"."disposition" <> 'paused' or ("cases"."disposition_reason" is not null and "cases"."waiting_on" is not null and "cases"."review_at" is not null)),
	CONSTRAINT "cases_closed_outcome" CHECK ("cases"."disposition" <> 'closed' or ("cases"."closure_outcome" is not null and "cases"."commitment_dispositions" is not null))
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
	"submission_key" text NOT NULL,
	"payload_digest" text NOT NULL,
	"receipt_session_hash" text,
	"listing_id" uuid,
	"listing_revision_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"preferred_name" text,
	"contact_method_id" uuid,
	"party_id" uuid,
	"preferred_locale" "public_locale",
	"preferred_channel" text,
	"callback_window" text,
	"message" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
	"coverage_queue" text,
	"acknowledged_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"case_id" uuid,
	"duplicate_of_inquiry_id" uuid,
	"disposition_reason" text,
	CONSTRAINT "inquiries_reference_unique" UNIQUE("reference"),
	CONSTRAINT "inquiries_submission_key_unique" UNIQUE("submission_key"),
	CONSTRAINT "inquiries_owned" CHECK (num_nonnulls("inquiries"."owner_id", "inquiries"."coverage_queue") >= 1),
	CONSTRAINT "inquiries_linked_case" CHECK ("inquiries"."state" <> 'linked_to_case' or "inquiries"."case_id" is not null),
	CONSTRAINT "inquiries_duplicate_of" CHECK ("inquiries"."state" <> 'duplicate_candidate' or "inquiries"."duplicate_of_inquiry_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "interest_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interest_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"feedback" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"listing_revision_id" uuid,
	"author_kind" "actor_kind" NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"case_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"state" "interest_state" DEFAULT 'suggested' NOT NULL,
	"fit_explanation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"listing_revision_id" uuid,
	"reason" text,
	CONSTRAINT "interests_declined_reason" CHECK ("interests"."state" not in ('declined', 'unavailable') or "interests"."reason" is not null)
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
CREATE TABLE "seller_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text NOT NULL,
	"property_id" uuid NOT NULL,
	"listing_id" uuid,
	"case_id" uuid,
	"revision_number" integer NOT NULL,
	"supersedes_id" uuid,
	"state" "seller_instruction_state" DEFAULT 'draft' NOT NULL,
	"commercial_terms" jsonb NOT NULL,
	"disclosure" jsonb NOT NULL,
	"media_usage_rights" jsonb NOT NULL,
	"representation_scope" "representation_scope" NOT NULL,
	"exclusivity" "exclusivity" DEFAULT 'not_recorded' NOT NULL,
	"commission_terms" text,
	"publication_permission" boolean DEFAULT false NOT NULL,
	"content_digest" text NOT NULL,
	"evidence_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agreed_at" timestamp with time zone,
	"recorded_by_id" uuid,
	"expires_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	CONSTRAINT "seller_instructions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "seller_instructions_agreed_evidence" CHECK ("seller_instructions"."state" <> 'agreed' or ("seller_instructions"."agreed_at" is not null and "seller_instructions"."recorded_by_id" is not null and "seller_instructions"."commission_terms" is not null and jsonb_array_length("seller_instructions"."evidence_document_ids") > 0))
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
	"state" "task_state" DEFAULT 'open' NOT NULL,
	"owner_id" uuid,
	"pending_owner_id" uuid,
	"due_at" timestamp with time zone,
	"due_timezone" text,
	"depends_on_task_id" uuid,
	"waiting_on" text,
	"follow_up_at" timestamp with time zone,
	"promised_to_client" boolean DEFAULT false NOT NULL,
	"evidence_required" boolean DEFAULT false NOT NULL,
	"outcome_note" text,
	"evidence_ids" jsonb,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid,
	"cancel_reason" text,
	"case_id" uuid,
	"inquiry_id" uuid,
	"property_id" uuid,
	"listing_id" uuid,
	CONSTRAINT "tasks_waiting_names_dependency" CHECK ("tasks"."state" <> 'waiting' or ("tasks"."waiting_on" is not null and "tasks"."follow_up_at" is not null)),
	CONSTRAINT "tasks_done_records_outcome" CHECK ("tasks"."state" <> 'done' or ("tasks"."outcome_note" is not null and "tasks"."completed_at" is not null)),
	CONSTRAINT "tasks_done_evidence" CHECK ("tasks"."state" <> 'done' or not "tasks"."evidence_required" or "tasks"."evidence_ids" is not null),
	CONSTRAINT "tasks_promise_has_client_context" CHECK (not "tasks"."promised_to_client" or num_nonnulls("tasks"."case_id", "tasks"."inquiry_id") >= 1)
);
--> statement-breakpoint
ALTER TABLE "appointment_participants" ADD CONSTRAINT "appointment_participants_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participants" ADD CONSTRAINT "appointment_participants_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_participants" ADD CONSTRAINT "appointment_participants_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_resources" ADD CONSTRAINT "appointment_resources_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_versions" ADD CONSTRAINT "appointment_versions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_host_id_principals_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_replaces_appointment_id_appointments_id_fk" FOREIGN KEY ("replaces_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_external_busy_checked_by_id_principals_id_fk" FOREIGN KEY ("external_busy_checked_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_reviewed_by_id_principals_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_superseded_by_version_id_document_versions_id_fk" FOREIGN KEY ("superseded_by_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attempts" ADD CONSTRAINT "message_attempts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attempts" ADD CONSTRAINT "message_attempts_external_action_id_external_actions_id_fk" FOREIGN KEY ("external_action_id") REFERENCES "public"."external_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_revisions" ADD CONSTRAINT "proposal_revisions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_revisions" ADD CONSTRAINT "proposal_revisions_source_listing_revision_id_listing_revisions_id_fk" FOREIGN KEY ("source_listing_revision_id") REFERENCES "public"."listing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_revisions" ADD CONSTRAINT "proposal_revisions_responds_to_revision_id_proposal_revisions_id_fk" FOREIGN KEY ("responds_to_revision_id") REFERENCES "public"."proposal_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_revisions" ADD CONSTRAINT "proposal_revisions_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography_place_aliases" ADD CONSTRAINT "geography_place_aliases_place_id_geography_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."geography_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography_places" ADD CONSTRAINT "geography_places_parent_id_geography_places_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."geography_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_granted_by_id_principals_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_revoked_by_id_principals_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "principals" ADD CONSTRAINT "principals_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_revision_media" ADD CONSTRAINT "listing_revision_media_listing_revision_id_listing_revisions_id_fk" FOREIGN KEY ("listing_revision_id") REFERENCES "public"."listing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_revision_media" ADD CONSTRAINT "listing_revision_media_media_relation_id_media_relations_id_fk" FOREIGN KEY ("media_relation_id") REFERENCES "public"."media_relations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_revision_media" ADD CONSTRAINT "listing_revision_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_revisions" ADD CONSTRAINT "listing_revisions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_revisions" ADD CONSTRAINT "listing_revisions_fact_revision_id_property_fact_revisions_id_fk" FOREIGN KEY ("fact_revision_id") REFERENCES "public"."property_fact_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_search_documents" ADD CONSTRAINT "listing_search_documents_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_availability_confirmed_by_id_principals_id_fk" FOREIGN KEY ("availability_confirmed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_approved_revision_id_listing_revisions_id_fk" FOREIGN KEY ("approved_revision_id") REFERENCES "public"."listing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_responsible_broker_id_principals_id_fk" FOREIGN KEY ("responsible_broker_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localized_revisions" ADD CONSTRAINT "localized_revisions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localized_revisions" ADD CONSTRAINT "localized_revisions_source_revision_id_listing_revisions_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."listing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localized_revisions" ADD CONSTRAINT "localized_revisions_reviewed_by_id_principals_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localized_revisions" ADD CONSTRAINT "localized_revisions_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_reviewed_by_id_principals_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_original_asset_id_media_assets_id_fk" FOREIGN KEY ("original_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_relations" ADD CONSTRAINT "media_relations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_relations" ADD CONSTRAINT "media_relations_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_place_id_geography_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."geography_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_approved_fact_revision_id_property_fact_revisions_id_fk" FOREIGN KEY ("approved_fact_revision_id") REFERENCES "public"."property_fact_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_merged_into_property_id_properties_id_fk" FOREIGN KEY ("merged_into_property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_fact_revisions" ADD CONSTRAINT "property_fact_revisions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_fact_revisions" ADD CONSTRAINT "property_fact_revisions_based_on_revision_id_property_fact_revisions_id_fk" FOREIGN KEY ("based_on_revision_id") REFERENCES "public"."property_fact_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_facts" ADD CONSTRAINT "property_facts_fact_revision_id_property_fact_revisions_id_fk" FOREIGN KEY ("fact_revision_id") REFERENCES "public"."property_fact_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_facts" ADD CONSTRAINT "property_facts_reviewed_by_id_principals_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_relationships" ADD CONSTRAINT "property_relationships_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_relationships" ADD CONSTRAINT "property_relationships_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_relationships" ADD CONSTRAINT "property_relationships_authority_reviewed_by_id_principals_id_fk" FOREIGN KEY ("authority_reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_relationships" ADD CONSTRAINT "property_relationships_revoked_by_id_principals_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_principals_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_url_decisions" ADD CONSTRAINT "legacy_url_decisions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_records" ADD CONSTRAINT "merge_records_decided_by_id_principals_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_records" ADD CONSTRAINT "merge_records_reversed_by_id_principals_id_fk" FOREIGN KEY ("reversed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_merged_into_party_id_parties_id_fk" FOREIGN KEY ("merged_into_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_contact_method_id_contact_methods_id_fk" FOREIGN KEY ("contact_method_id") REFERENCES "public"."contact_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page_versions" ADD CONSTRAINT "content_page_versions_content_page_id_content_pages_id_fk" FOREIGN KEY ("content_page_id") REFERENCES "public"."content_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page_versions" ADD CONSTRAINT "content_page_versions_created_by_id_principals_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_place_id_geography_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."geography_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_publications" ADD CONSTRAINT "current_publications_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_publications" ADD CONSTRAINT "current_publications_manifest_id_publication_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."publication_manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_publications" ADD CONSTRAINT "current_publications_activated_by_id_principals_id_fk" FOREIGN KEY ("activated_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_deliveries" ADD CONSTRAINT "destination_deliveries_manifest_id_publication_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."publication_manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_deliveries" ADD CONSTRAINT "destination_deliveries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_deliveries" ADD CONSTRAINT "destination_deliveries_external_action_id_external_actions_id_fk" FOREIGN KEY ("external_action_id") REFERENCES "public"."external_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_manifests" ADD CONSTRAINT "publication_manifests_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_manifests" ADD CONSTRAINT "publication_manifests_listing_revision_id_listing_revisions_id_fk" FOREIGN KEY ("listing_revision_id") REFERENCES "public"."listing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_manifests" ADD CONSTRAINT "publication_manifests_fact_revision_id_property_fact_revisions_id_fk" FOREIGN KEY ("fact_revision_id") REFERENCES "public"."property_fact_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_manifests" ADD CONSTRAINT "publication_manifests_localized_revision_id_localized_revisions_id_fk" FOREIGN KEY ("localized_revision_id") REFERENCES "public"."localized_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_manifests" ADD CONSTRAINT "publication_manifests_created_by_id_principals_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_actions" ADD CONSTRAINT "external_actions_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_actions" ADD CONSTRAINT "external_actions_reconciled_by_id_principals_id_fk" FOREIGN KEY ("reconciled_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_contact_method_id_contact_methods_id_fk" FOREIGN KEY ("contact_method_id") REFERENCES "public"."contact_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_responsible_id_principals_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locale_settings" ADD CONSTRAINT "locale_settings_indexable_approval_id_approvals_id_fk" FOREIGN KEY ("indexable_approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locale_settings" ADD CONSTRAINT "locale_settings_reviewer_id_principals_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_policies" ADD CONSTRAINT "service_policies_approved_by_id_principals_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_revisions" ADD CONSTRAINT "brief_revisions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_revisions" ADD CONSTRAINT "brief_revisions_client_acknowledged_by_id_principals_id_fk" FOREIGN KEY ("client_acknowledged_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_revisions" ADD CONSTRAINT "brief_revisions_broker_acknowledged_by_id_principals_id_fk" FOREIGN KEY ("broker_acknowledged_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_authority_reviewed_by_id_principals_id_fk" FOREIGN KEY ("authority_reviewed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_revoked_by_id_principals_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_pending_owner_id_principals_id_fk" FOREIGN KEY ("pending_owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_listing_revision_id_listing_revisions_id_fk" FOREIGN KEY ("listing_revision_id") REFERENCES "public"."listing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_contact_method_id_contact_methods_id_fk" FOREIGN KEY ("contact_method_id") REFERENCES "public"."contact_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_duplicate_of_inquiry_id_inquiries_id_fk" FOREIGN KEY ("duplicate_of_inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_feedback" ADD CONSTRAINT "interest_feedback_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_feedback" ADD CONSTRAINT "interest_feedback_listing_revision_id_listing_revisions_id_fk" FOREIGN KEY ("listing_revision_id") REFERENCES "public"."listing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_listing_revision_id_listing_revisions_id_fk" FOREIGN KEY ("listing_revision_id") REFERENCES "public"."listing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_instructions" ADD CONSTRAINT "seller_instructions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_instructions" ADD CONSTRAINT "seller_instructions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_instructions" ADD CONSTRAINT "seller_instructions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_instructions" ADD CONSTRAINT "seller_instructions_supersedes_id_seller_instructions_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."seller_instructions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_instructions" ADD CONSTRAINT "seller_instructions_recorded_by_id_principals_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pending_owner_id_principals_id_fk" FOREIGN KEY ("pending_owner_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_id_principals_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_subject_idx" ON "approvals" USING btree ("subject_type","subject_id","subject_version");--> statement-breakpoint
CREATE INDEX "appointment_resources_appointment_idx" ON "appointment_resources" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_versions_number_idx" ON "appointment_versions" USING btree ("appointment_id","version_number");--> statement-breakpoint
CREATE INDEX "appointments_case_idx" ON "appointments" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "appointments_host_idx" ON "appointments" USING btree ("host_id","confirmed_starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_number_idx" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "documents_case_idx" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_attempts_number_idx" ON "message_attempts" USING btree ("message_id","recipient","attempt_number");--> statement-breakpoint
CREATE INDEX "messages_case_idx" ON "messages" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_revisions_number_idx" ON "proposal_revisions" USING btree ("proposal_id","revision_number");--> statement-breakpoint
CREATE INDEX "geography_place_aliases_trgm_idx" ON "geography_place_aliases" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "geography_place_aliases_unique_idx" ON "geography_place_aliases" USING btree ("place_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "geography_places_slug_idx" ON "geography_places" USING btree ("country_code","slug");--> statement-breakpoint
CREATE INDEX "geography_places_parent_idx" ON "geography_places" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "email_sign_in_tokens_email_idx" ON "email_sign_in_tokens" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "grants_principal_idx" ON "grants" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "grants_record_idx" ON "grants" USING btree ("record_type","record_id");--> statement-breakpoint
CREATE INDEX "passkeys_principal_idx" ON "passkeys" USING btree ("principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "principals_identity_idx" ON "principals" USING btree ("issuer","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "principals_email_idx" ON "principals" USING btree ("kind",lower("email"));--> statement-breakpoint
CREATE INDEX "sessions_principal_idx" ON "sessions" USING btree ("principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_revision_media_position_idx" ON "listing_revision_media" USING btree ("listing_revision_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_revisions_number_idx" ON "listing_revisions" USING btree ("listing_id","revision_number");--> statement-breakpoint
CREATE INDEX "listing_search_vector_idx" ON "listing_search_documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "listing_search_reference_trgm_idx" ON "listing_search_documents" USING gin ("reference" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "listing_search_place_ids_idx" ON "listing_search_documents" USING gin ("place_ids");--> statement-breakpoint
CREATE INDEX "listing_search_filter_idx" ON "listing_search_documents" USING btree ("purpose","commercial_state","property_type");--> statement-breakpoint
CREATE INDEX "listings_property_idx" ON "listings" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "localized_revisions_source_locale_idx" ON "localized_revisions" USING btree ("source_revision_id","locale");--> statement-breakpoint
CREATE INDEX "localized_revisions_listing_idx" ON "localized_revisions" USING btree ("listing_id","locale");--> statement-breakpoint
CREATE INDEX "media_assets_property_idx" ON "media_assets" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "media_relations_listing_idx" ON "media_relations" USING btree ("listing_id","position");--> statement-breakpoint
CREATE INDEX "properties_place_idx" ON "properties" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_fact_revisions_number_idx" ON "property_fact_revisions" USING btree ("property_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "property_facts_field_idx" ON "property_facts" USING btree ("fact_revision_id","field_key");--> statement-breakpoint
CREATE INDEX "property_relationships_party_idx" ON "property_relationships" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "property_relationships_property_idx" ON "property_relationships" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_batch_row_idx" ON "import_rows" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "import_rows_classification_idx" ON "import_rows" USING btree ("batch_id","classification");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_url_decisions_source_idx" ON "legacy_url_decisions" USING btree ("domain","source_path","source_query");--> statement-breakpoint
CREATE INDEX "merge_records_merged_idx" ON "merge_records" USING btree ("subject","merged_id");--> statement-breakpoint
CREATE INDEX "consent_events_subscription_idx" ON "consent_events" USING btree ("subscription_id","recorded_at");--> statement-breakpoint
CREATE INDEX "contact_methods_normalized_idx" ON "contact_methods" USING btree ("kind","normalized_value");--> statement-breakpoint
CREATE INDEX "contact_methods_party_idx" ON "contact_methods" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "subscriptions_party_idx" ON "subscriptions" USING btree ("party_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "content_page_versions_number_idx" ON "content_page_versions" USING btree ("content_page_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "content_pages_slug_idx" ON "content_pages" USING btree ("kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "current_publications_pointer_idx" ON "current_publications" USING btree ("listing_id","locale","destination");--> statement-breakpoint
CREATE INDEX "destination_deliveries_listing_idx" ON "destination_deliveries" USING btree ("listing_id","state");--> statement-breakpoint
CREATE INDEX "publication_manifests_listing_idx" ON "publication_manifests" USING btree ("listing_id","locale","destination");--> statement-breakpoint
CREATE INDEX "activity_events_record_idx" ON "activity_events" USING btree ("record_type","record_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_record_idx" ON "audit_events" USING btree ("record_type","record_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_operation_idx" ON "audit_events" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "external_actions_state_idx" ON "external_actions" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "external_actions_provider_idx" ON "external_actions" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "external_actions_subject_idx" ON "external_actions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_events_provider_event_idx" ON "inbox_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_key_idx" ON "operations" USING btree ("actor_kind","actor_id","operation_type","idempotency_key");--> statement-breakpoint
CREATE INDEX "operations_status_idx" ON "operations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "outbox_events_state_idx" ON "outbox_events" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_state_idx" ON "privacy_requests" USING btree ("state","due_at");--> statement-breakpoint
CREATE INDEX "release_evidence_release_idx" ON "release_evidence" USING btree ("release_sha","environment","policy_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "brief_revisions_number_idx" ON "brief_revisions" USING btree ("case_id","revision_number");--> statement-breakpoint
CREATE INDEX "case_participants_case_idx" ON "case_participants" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_participants_party_idx" ON "case_participants" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "case_stage_history_case_idx" ON "case_stage_history" USING btree ("case_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cases_owner_idx" ON "cases" USING btree ("owner_id","disposition");--> statement-breakpoint
CREATE INDEX "inquiries_state_idx" ON "inquiries" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_owner_idx" ON "inquiries" USING btree ("owner_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "interest_feedback_number_idx" ON "interest_feedback" USING btree ("interest_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "interests_case_listing_idx" ON "interests" USING btree ("case_id","listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_instructions_revision_idx" ON "seller_instructions" USING btree ("property_id","revision_number");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_id","state","due_at");--> statement-breakpoint
CREATE INDEX "tasks_case_idx" ON "tasks" USING btree ("case_id");