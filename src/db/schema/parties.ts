// Persons, organizations and their contact methods (spec §04, F30). Verification of a
// channel and consent per purpose are separate records; authority to act lives on the
// party relationship (see work.ts).
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable } from "./columns";
import {
  consentPurposeEnum,
  consentStateEnum,
  contactMethodKindEnum,
  contactVerificationEnum,
  publicLocaleEnum,
} from "./enums";

export const persons = pgTable("persons", {
  ...mutable(),
  displayName: text("display_name").notNull(),
  givenName: text("given_name"),
  familyName: text("family_name"),
  preferredLocale: publicLocaleEnum("preferred_locale"),
  /** Set when a merge folded this person into another; the alias keeps old references working. */
  mergedIntoPersonId: uuid("merged_into_person_id"),
});

export const organizations = pgTable("organizations", {
  ...mutable(),
  name: text("name").notNull(),
  registrationNumber: text("registration_number"),
  country: text("country"),
});

export const contactMethods = pgTable(
  "contact_methods",
  {
    ...mutable(),
    personId: uuid("person_id").references(() => persons.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    kind: contactMethodKindEnum("kind").notNull(),
    value: text("value").notNull(),
    /** Lower-cased email or E.164 phone, used for duplicate detection. */
    normalizedValue: text("normalized_value").notNull(),
    verification: contactVerificationEnum("verification").notNull().default("unverified"),
    verifiedAt: instant("verified_at"),
    lastFailureAt: instant("last_failure_at"),
  },
  (t) => [
    check("contact_methods_one_owner", sql`num_nonnulls(${t.personId}, ${t.organizationId}) = 1`),
    index("contact_methods_normalized_idx").on(t.kind, t.normalizedValue),
  ],
);

/** Consent per contact method and purpose; marketing is never implied by service contact. */
export const contactConsents = pgTable(
  "contact_consents",
  {
    id: id(),
    contactMethodId: uuid("contact_method_id")
      .notNull()
      .references(() => contactMethods.id),
    purpose: consentPurposeEnum("purpose").notNull(),
    state: consentStateEnum("state").notNull(),
    /** Where the consent was captured, e.g. an inquiry form version. */
    source: text("source").notNull(),
    recordedAt: instant("recorded_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("contact_consents_method_idx").on(t.contactMethodId, t.purpose, t.recordedAt)],
);

export const personAliases = pgTable(
  "person_aliases",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    formerPersonId: uuid("former_person_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("person_aliases_former_idx").on(t.formerPersonId)],
);
