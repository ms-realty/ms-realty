// Postgres enums generated from the domain constants, so state names cannot drift between
// the domain layer and the database. Adding a state is a generated migration.
import { pgEnum } from "drizzle-orm/pg-core";
import {
  appointmentFormats,
  appointmentResourceKinds,
  appointmentStates,
  propertyAccessStates,
} from "../../domain/appointment";
import { approvalKinds, approvalStates } from "../../domain/approval";
import { actorKinds, capabilities, roles } from "../../domain/capabilities";
import { caseDispositions, caseKinds, serviceIntakeTopics } from "../../domain/case";
import {
  documentClassifications,
  documentReviewTypes,
  documentStates,
  professionalValidationStates,
} from "../../domain/document";
import {
  externalActionKinds,
  externalActionStates,
  inboxEventStates,
  outboxEventStates,
} from "../../domain/external-action";
import { materialChangeClasses } from "../../domain/fact-revision";
import {
  factStates,
  listingPurposes,
  locationPrecisions,
  priceBases,
  pricePeriods,
  propertyTypes,
  sourceClasses,
} from "../../domain/facts";
import { currencyCodes, publicLocales, staffLocales } from "../../domain/ids";
import { inquiryPurposes, inquiryStates } from "../../domain/inquiry";
import { interestStates } from "../../domain/interest";
import { commercialStates, editorialStates, freshnessStates } from "../../domain/listing";
import { localeStates } from "../../domain/localized-revision";
import {
  mediaAudiences,
  mediaKinds,
  mediaModifications,
  mediaPurposes,
  mediaReviewStates,
  mediaRightsStates,
  processingStates,
  scanStates,
} from "../../domain/media";
import {
  messageChannels,
  messageDirections,
  messageKinds,
  messageStates,
} from "../../domain/message";
import { operationStatuses } from "../../domain/operation-receipt";
import {
  audiences,
  authorityStates,
  contactMethodKinds,
  contactVerificationStates,
  participantRoles,
  partyKinds,
} from "../../domain/parties";
import { privacyRequestKinds, privacyRequestStates } from "../../domain/privacy";
import { proposalStates } from "../../domain/proposal";
import {
  deliveryKinds,
  deliveryStates,
  pointerStates,
  publicationDestinations,
  publicationStates,
} from "../../domain/publication";
import {
  contentPageKinds,
  importBatchModes,
  importBatchStates,
  importRowClassifications,
  importRowOutcomes,
  inquirySources,
  legacyDomains,
  legacyUrlDecisions,
  mergeSubjects,
  placeAliasKinds,
  placeLevels,
  principalKinds,
  principalStatuses,
  signInTokenPurposes,
  staffMembershipStates,
} from "../../domain/records";
import { evidenceEnvironments, redactionStatuses } from "../../domain/release-evidence";
import {
  exclusivityKinds,
  representationScopes,
  sellerInstructionStates,
} from "../../domain/seller-instruction";
import {
  alertFrequencies,
  consentEventKinds,
  subscriptionPurposes,
  subscriptionStates,
} from "../../domain/subscription";
import { taskStates, taskTypes } from "../../domain/task";

// Identity and access.
export const principalKindEnum = pgEnum("principal_kind", principalKinds);
export const principalStatusEnum = pgEnum("principal_status", principalStatuses);
export const staffMembershipStateEnum = pgEnum("staff_membership_state", staffMembershipStates);
export const actorKindEnum = pgEnum("actor_kind", actorKinds);
export const capabilityEnum = pgEnum("capability", capabilities);
export const roleEnum = pgEnum("role", roles);
export const signInTokenPurposeEnum = pgEnum("sign_in_token_purpose", signInTokenPurposes);
export const publicLocaleEnum = pgEnum("public_locale", publicLocales);
export const staffLocaleEnum = pgEnum("staff_locale", staffLocales);
export const currencyEnum = pgEnum("currency", currencyCodes);

// Parties and contact eligibility.
export const partyKindEnum = pgEnum("party_kind", partyKinds);
export const contactMethodKindEnum = pgEnum("contact_method_kind", contactMethodKinds);
export const contactVerificationEnum = pgEnum(
  "contact_verification_state",
  contactVerificationStates,
);
export const participantRoleEnum = pgEnum("participant_role", participantRoles);
export const authorityStateEnum = pgEnum("authority_state", authorityStates);
export const audienceEnum = pgEnum("audience", audiences);
export const subscriptionPurposeEnum = pgEnum("subscription_purpose", subscriptionPurposes);
export const subscriptionStateEnum = pgEnum("subscription_state", subscriptionStates);
export const consentEventKindEnum = pgEnum("consent_event_kind", consentEventKinds);
export const alertFrequencyEnum = pgEnum("alert_frequency", alertFrequencies);

// Inventory.
export const propertyTypeEnum = pgEnum("property_type", propertyTypes);
export const listingPurposeEnum = pgEnum("listing_purpose", listingPurposes);
export const locationPrecisionEnum = pgEnum("location_precision", locationPrecisions);
export const factStateEnum = pgEnum("fact_state", factStates);
export const sourceClassEnum = pgEnum("source_class", sourceClasses);
export const materialChangeEnum = pgEnum("material_change", materialChangeClasses);
export const pricePeriodEnum = pgEnum("price_period", pricePeriods);
export const priceBasisEnum = pgEnum("price_basis", priceBases);
export const commercialStateEnum = pgEnum("commercial_state", commercialStates);
export const editorialStateEnum = pgEnum("editorial_state", editorialStates);
export const freshnessStateEnum = pgEnum("freshness_state", freshnessStates);
export const localeStateEnum = pgEnum("locale_state", localeStates);
export const sellerInstructionStateEnum = pgEnum(
  "seller_instruction_state",
  sellerInstructionStates,
);
export const representationScopeEnum = pgEnum("representation_scope", representationScopes);
export const exclusivityEnum = pgEnum("exclusivity", exclusivityKinds);

// Media and documents.
export const mediaKindEnum = pgEnum("media_kind", mediaKinds);
export const mediaPurposeEnum = pgEnum("media_purpose", mediaPurposes);
export const mediaRightsEnum = pgEnum("media_rights_state", mediaRightsStates);
export const mediaModificationEnum = pgEnum("media_modification", mediaModifications);
export const mediaReviewEnum = pgEnum("media_review_state", mediaReviewStates);
export const mediaAudienceEnum = pgEnum("media_audience", mediaAudiences);
export const scanStateEnum = pgEnum("scan_state", scanStates);
export const processingStateEnum = pgEnum("processing_state", processingStates);
export const documentStateEnum = pgEnum("document_state", documentStates);
export const documentReviewTypeEnum = pgEnum("document_review_type", documentReviewTypes);
export const professionalValidationEnum = pgEnum(
  "professional_validation_state",
  professionalValidationStates,
);
export const documentClassificationEnum = pgEnum(
  "document_classification",
  documentClassifications,
);

// Publication.
export const publicationStateEnum = pgEnum("publication_state", publicationStates);
export const pointerStateEnum = pgEnum("publication_pointer_state", pointerStates);
export const publicationDestinationEnum = pgEnum(
  "publication_destination",
  publicationDestinations,
);
export const deliveryKindEnum = pgEnum("delivery_kind", deliveryKinds);
export const deliveryStateEnum = pgEnum("delivery_state", deliveryStates);
export const contentPageKindEnum = pgEnum("content_page_kind", contentPageKinds);

// Agency work.
export const inquiryStateEnum = pgEnum("inquiry_state", inquiryStates);
export const inquiryPurposeEnum = pgEnum("inquiry_purpose", inquiryPurposes);
export const inquirySourceEnum = pgEnum("inquiry_source", inquirySources);
export const caseKindEnum = pgEnum("case_kind", caseKinds);
export const caseDispositionEnum = pgEnum("case_disposition", caseDispositions);
export const serviceIntakeTopicEnum = pgEnum("service_intake_topic", serviceIntakeTopics);
export const interestStateEnum = pgEnum("interest_state", interestStates);
export const taskStateEnum = pgEnum("task_state", taskStates);
export const taskTypeEnum = pgEnum("task_type", taskTypes);

// Scheduling, proposals and communication.
export const appointmentStateEnum = pgEnum("appointment_state", appointmentStates);
export const appointmentFormatEnum = pgEnum("appointment_format", appointmentFormats);
export const appointmentResourceKindEnum = pgEnum(
  "appointment_resource_kind",
  appointmentResourceKinds,
);
export const propertyAccessEnum = pgEnum("property_access_state", propertyAccessStates);
export const proposalStateEnum = pgEnum("proposal_state", proposalStates);
export const messageStateEnum = pgEnum("message_state", messageStates);
export const messageKindEnum = pgEnum("message_kind", messageKinds);
export const messageDirectionEnum = pgEnum("message_direction", messageDirections);
export const messageChannelEnum = pgEnum("message_channel", messageChannels);

// Approvals, operations and durable work.
export const approvalStateEnum = pgEnum("approval_state", approvalStates);
export const approvalKindEnum = pgEnum("approval_kind", approvalKinds);
export const operationStatusEnum = pgEnum("operation_status", operationStatuses);
export const outboxEventStateEnum = pgEnum("outbox_event_state", outboxEventStates);
export const externalActionKindEnum = pgEnum("external_action_kind", externalActionKinds);
export const externalActionStateEnum = pgEnum("external_action_state", externalActionStates);
export const inboxEventStateEnum = pgEnum("inbox_event_state", inboxEventStates);

// Privacy and release evidence.
export const privacyRequestKindEnum = pgEnum("privacy_request_kind", privacyRequestKinds);
export const privacyRequestStateEnum = pgEnum("privacy_request_state", privacyRequestStates);
export const evidenceEnvironmentEnum = pgEnum("evidence_environment", evidenceEnvironments);
export const redactionStatusEnum = pgEnum("redaction_status", redactionStatuses);

// Geography, legacy and import.
export const placeLevelEnum = pgEnum("place_level", placeLevels);
export const placeAliasKindEnum = pgEnum("place_alias_kind", placeAliasKinds);
export const legacyDomainEnum = pgEnum("legacy_domain", legacyDomains);
export const legacyUrlDecisionEnum = pgEnum("legacy_url_decision", legacyUrlDecisions);
export const importBatchModeEnum = pgEnum("import_batch_mode", importBatchModes);
export const importBatchStateEnum = pgEnum("import_batch_state", importBatchStates);
export const importRowClassificationEnum = pgEnum(
  "import_row_classification",
  importRowClassifications,
);
export const importRowOutcomeEnum = pgEnum("import_row_outcome", importRowOutcomes);
export const mergeSubjectEnum = pgEnum("merge_subject", mergeSubjects);
