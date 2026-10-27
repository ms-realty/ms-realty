// F27/F28/P23/C14/O29/O30: human-decided consultation coverage, never booking authority.
import { z } from "zod";
import { serviceIntakeTopics } from "./case";
import { publicLocales } from "./ids";
import { settingsResources } from "./settings-resources";

export const serviceScopeId = settingsResources.serviceScope;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const source = z
  .object({
    kind: z.enum(["service", "help"]),
    slug: z.string().regex(/^[a-z\d][a-z\d-]{0,100}$/),
    versionId: z.uuid(),
    contentHash: digest,
  })
  .strict();
const identity = { topic: z.enum(serviceIntakeTopics), regionId: z.uuid() };
export const offeredServiceSchema = z
  .object({
    ...identity,
    state: z.literal("offered"),
    mode: z.enum(["consultation", "referral"]),
    regionVersion: z.number().int().positive(),
    publicSource: source.extend({ kind: z.literal("service") }),
    termsSource: source,
    // The exact source/terms editions state the scope; a reference string alone grants nothing.
    ownerId: z.uuid(),
    fallback: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("staff"), principalId: z.uuid() }).strict(),
      z.object({ kind: z.literal("manual"), source }).strict(),
    ]),
    operatingPolicy: z
      .object({ id: z.uuid(), version: z.number().int().positive(), contentHash: digest })
      .strict(),
    reviewExpiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const unknownDecision = z.object({ ...identity, state: z.literal("unknown") }).strict();
const notOfferedDecision = z
  .object({
    ...identity,
    state: z.literal("not_offered"),
    reason: z.string().trim().min(3).max(1500),
  })
  .strict();
/** A form's stable decision intent excludes policy captured only when the save executes. */
export const serviceScopeDecisionIntentSchema = z.discriminatedUnion("state", [
  unknownDecision,
  notOfferedDecision,
  offeredServiceSchema.omit({ operatingPolicy: true }),
]);
export const serviceScopeSchema = z
  .object({
    kind: z.literal("bounded_service_scope_v1"),
    decisions: z
      .array(
        z.discriminatedUnion("state", [unknownDecision, notOfferedDecision, offeredServiceSchema]),
      )
      .max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [i, row] of value.decisions.entries()) {
      const key = `${row.topic}:${row.regionId}`;
      if (seen.has(key))
        ctx.addIssue({ code: "custom", path: ["decisions", i], message: "duplicate_scope" });
      seen.add(key);
    }
  });
export type ServiceScope = z.infer<typeof serviceScopeSchema>;
export type OfferedService = z.infer<typeof offeredServiceSchema>;
export const emptyServiceScope: ServiceScope = { kind: "bounded_service_scope_v1", decisions: [] };
const day = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
export const serviceRequestSchema = z
  .object({
    version: z.literal(1),
    topic: z.enum(serviceIntakeTopics),
    scopeVersionId: z.uuid(),
    regionId: z.uuid(),
    location: z.string().trim().min(2).max(200),
    needs: z.string().trim().min(3).max(2000),
    requestedFrom: day.optional(),
    requestedUntil: day.optional(),
    relationship: z.enum(["owner", "representative", "tenant", "other", "unknown"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (key: string) =>
      ctx.addIssue({ code: "custom", path: [key], message: "required" });
    if (value.topic === "short_stay_consultation") {
      if (!value.requestedFrom) issue("requestedFrom");
      if (!value.requestedUntil) issue("requestedUntil");
      if (
        value.requestedFrom &&
        value.requestedUntil &&
        value.requestedFrom >= value.requestedUntil
      )
        ctx.addIssue({ code: "custom", path: ["requestedUntil"], message: "invalid_date_order" });
    } else if (!value.relationship) issue("relationship");
  });
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;
export const serviceEntrySchema = z.object({ ...identity, scopeVersionId: z.uuid() }).strict();
export function parseServiceEntry(value: string) {
  try {
    const result = serviceEntrySchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export const serviceBindingSchema = z.object({
  kind: z.literal("bounded_service_binding_v1"),
  scopeVersionId: z.uuid(),
  scopeVersion: z.number().int().positive(),
  scopeHash: digest,
  offering: offeredServiceSchema,
  responsibleId: z.uuid(),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  // Legacy bindings remain readable but cannot authorize new service work without this proof.
  observedSource: source
    .extend({ kind: z.literal("service"), locale: z.enum(publicLocales) })
    .optional(),
});
export const serviceCaseContextSchema = z.object({
  binding: serviceBindingSchema,
  request: serviceRequestSchema,
});
export type ServiceBinding = z.infer<typeof serviceBindingSchema>;
