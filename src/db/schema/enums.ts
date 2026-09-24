// Postgres enums generated from the domain constants, so state names cannot drift between
// the domain layer and the database. Adding a state is a generated migration.
import { pgEnum } from "drizzle-orm/pg-core";
import {
  appointmentFormats,
  appointmentStates,
  propertyAccessStates,
} from "../../domain/appointment";
import { approvalKinds, approvalStates } from "../../domain/approval";
import { actorKinds, capabilities, roles } from "../../domain/capabilities";
import { caseKinds } from "../../domain/case-disposition";
import {
  documentClassifications,
  documentReviewTypes,
  documentStates,
  professionalValidationStates,
  scanStates,
} from "../../domain/document";
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
import { commercialStates, editorialStates, freshnessStates } from "../../domain/listing";
import {
  mediaKinds,
  mediaModifications,
  mediaReviewStates,
  mediaRightsStates,
  mediaStorageAreas,
} from "../../domain/media";
import {
  messageChannels,
  messageDirections,
  messageKinds,
  messageStates,
} from "../../domain/message";
import { operationStatuses } from "../../domain/operation-receipt";
import {
  accountStatuses,
  audiences,
  authorityStates,
  consentPurposes,
  consentStates,
  contactMethodKinds,
  contactVerificationStates,
  partyRelationshipRoles,
} from "../../domain/parties";
import { proposalStates } from "../../domain/proposal";
import {
  destinationOutcomeStates,
  distributionStates,
  publicationDestinations,
  releaseKinds,
} from "../../domain/publication";
import {
  accountKinds,
  alertFrequencies,
  alertSubscriptionStates,
  contentPageKinds,
  importBatchModes,
  importBatchStates,
  importRowClassifications,
  importRowOutcomes,
  inquirySources,
  legacyDomains,
  legacyUrlDecisions,
  matchGroups,
  matchStates,
  placeAliasKinds,
  placeLevels,
  requirementItemKinds,
  requirementOrigins,
  shortlistOpinions,
  shortlistParticipantRoles,
  signInTokenPurposes,
} from "../../domain/records";
import { paymentStates, reservationStates } from "../../domain/reservation";
import {
  serviceAgreementStates,
  serviceRequestStates,
  serviceRequestUrgencies,
  statementLineStates,
} from "../../domain/service-request";
import { commitmentKinds, taskStates, taskTypes } from "../../domain/task";
import { translationStates } from "../../domain/translation";

// Identity and access.
export const accountKindEnum = pgEnum("account_kind", accountKinds);
export const accountStatusEnum = pgEnum("account_status", accountStatuses);
export const actorKindEnum = pgEnum("actor_kind", actorKinds);
export const capabilityEnum = pgEnum("capability", capabilities);
export const roleEnum = pgEnum("role", roles);
export const signInTokenPurposeEnum = pgEnum("sign_in_token_purpose", signInTokenPurposes);
export const publicLocaleEnum = pgEnum("public_locale", publicLocales);
export const staffLocaleEnum = pgEnum("staff_locale", staffLocales);
export const currencyEnum = pgEnum("currency", currencyCodes);

// Parties.
export const contactMethodKindEnum = pgEnum("contact_method_kind", contactMethodKinds);
export const contactVerificationEnum = pgEnum(
  "contact_verification_state",
  contactVerificationStates,
);
export const consentPurposeEnum = pgEnum("consent_purpose", consentPurposes);
export const consentStateEnum = pgEnum("consent_state", consentStates);
export const partyRoleEnum = pgEnum("party_relationship_role", partyRelationshipRoles);
export const authorityStateEnum = pgEnum("authority_state", authorityStates);
export const audienceEnum = pgEnum("audience", audiences);

// Properties, listings, facts, media.
export const propertyTypeEnum = pgEnum("property_type", propertyTypes);
export const listingPurposeEnum = pgEnum("listing_purpose", listingPurposes);
export const locationPrecisionEnum = pgEnum("location_precision", locationPrecisions);
export const factStateEnum = pgEnum("fact_state", factStates);
export const sourceClassEnum = pgEnum("source_class", sourceClasses);
export const pricePeriodEnum = pgEnum("price_period", pricePeriods);
export const priceBasisEnum = pgEnum("price_basis", priceBases);
export const commercialStateEnum = pgEnum("commercial_state", commercialStates);
export const editorialStateEnum = pgEnum("editorial_state", editorialStates);
export const distributionStateEnum = pgEnum("distribution_state", distributionStates);
export const freshnessStateEnum = pgEnum("freshness_state", freshnessStates);
export const mediaKindEnum = pgEnum("media_kind", mediaKinds);
export const mediaRightsEnum = pgEnum("media_rights_state", mediaRightsStates);
export const mediaModificationEnum = pgEnum("media_modification", mediaModifications);
export const mediaStorageAreaEnum = pgEnum("media_storage_area", mediaStorageAreas);
export const mediaReviewEnum = pgEnum("media_review_state", mediaReviewStates);

// Demand and work.
export const inquiryStateEnum = pgEnum("inquiry_state", inquiryStates);
export const inquiryPurposeEnum = pgEnum("inquiry_purpose", inquiryPurposes);
export const inquirySourceEnum = pgEnum("inquiry_source", inquirySources);
export const caseKindEnum = pgEnum("case_kind", caseKinds);
export const requirementItemKindEnum = pgEnum("requirement_item_kind", requirementItemKinds);
export const requirementOriginEnum = pgEnum("requirement_origin", requirementOrigins);
export const matchGroupEnum = pgEnum("match_group", matchGroups);
export const matchStateEnum = pgEnum("match_state", matchStates);
export const taskStateEnum = pgEnum("task_state", taskStates);
export const taskTypeEnum = pgEnum("task_type", taskTypes);
export const commitmentKindEnum = pgEnum("commitment_kind", commitmentKinds);
export const shortlistOpinionEnum = pgEnum("shortlist_opinion", shortlistOpinions);
export const shortlistRoleEnum = pgEnum("shortlist_participant_role", shortlistParticipantRoles);
export const alertFrequencyEnum = pgEnum("alert_frequency", alertFrequencies);
export const alertSubscriptionStateEnum = pgEnum(
  "alert_subscription_state",
  alertSubscriptionStates,
);

// Coordination.
export const appointmentStateEnum = pgEnum("appointment_state", appointmentStates);
export const appointmentFormatEnum = pgEnum("appointment_format", appointmentFormats);
export const propertyAccessEnum = pgEnum("property_access_state", propertyAccessStates);
export const messageStateEnum = pgEnum("message_state", messageStates);
export const messageKindEnum = pgEnum("message_kind", messageKinds);
export const messageDirectionEnum = pgEnum("message_direction", messageDirections);
export const messageChannelEnum = pgEnum("message_channel", messageChannels);
export const documentStateEnum = pgEnum("document_state", documentStates);
export const scanStateEnum = pgEnum("scan_state", scanStates);
export const documentReviewTypeEnum = pgEnum("document_review_type", documentReviewTypes);
export const professionalValidationEnum = pgEnum(
  "professional_validation_state",
  professionalValidationStates,
);
export const documentClassificationEnum = pgEnum(
  "document_classification",
  documentClassifications,
);
export const proposalStateEnum = pgEnum("proposal_state", proposalStates);

// Approval, publication, translation, content.
export const approvalStateEnum = pgEnum("approval_state", approvalStates);
export const approvalKindEnum = pgEnum("approval_kind", approvalKinds);
export const releaseKindEnum = pgEnum("release_kind", releaseKinds);
export const publicationDestinationEnum = pgEnum(
  "publication_destination",
  publicationDestinations,
);
export const destinationOutcomeEnum = pgEnum("destination_outcome_state", destinationOutcomeStates);
export const translationStateEnum = pgEnum("translation_state", translationStates);
export const contentPageKindEnum = pgEnum("content_page_kind", contentPageKinds);

// Records.
export const operationStatusEnum = pgEnum("operation_status", operationStatuses);

// Adjacent services.
export const serviceAgreementStateEnum = pgEnum("service_agreement_state", serviceAgreementStates);
export const serviceRequestStateEnum = pgEnum("service_request_state", serviceRequestStates);
export const serviceRequestUrgencyEnum = pgEnum("service_request_urgency", serviceRequestUrgencies);
export const statementLineStateEnum = pgEnum("statement_line_state", statementLineStates);
export const reservationStateEnum = pgEnum("reservation_state", reservationStates);
export const paymentStateEnum = pgEnum("payment_state", paymentStates);

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
