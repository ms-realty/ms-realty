// OpenAPI 3.1 document for the transport registry (architecture §19.3). Schemas come from the
// same zod definitions the route handlers use, converted with zod's JSON Schema (draft 2020-12,
// the OpenAPI 3.1 dialect). Written to docs/api/openapi.json by scripts/openapi.mjs.
import "server-only";
import { z } from "zod";
import { AppError, wireCode } from "../errors";
import {
  authorizationClasses,
  type EndpointDefinition,
  endpoints,
  errorEnvelopeSchema,
} from "./registry";

/** Bump on any change a client could observe. */
export const transportVersion = "0.1.0";

const servers = {
  public: { url: "https://makler-realty.com", description: "Public host" },
  client: { url: "https://my.makler-realty.com", description: "Client host" },
  staff: { url: "https://app.makler-realty.com", description: "Staff host" },
} as const;

/** Production cookie names (src/server/auth/cookies.ts, src/server/inquiries/intake.ts). */
const securitySchemes = {
  staffSession: { type: "apiKey", in: "cookie", name: "__Host-msr_staff_session" },
  clientSession: { type: "apiKey", in: "cookie", name: "__Host-msr_client_session" },
  receiptSession: { type: "apiKey", in: "cookie", name: "__Host-msr_receipt" },
} as const;

const securityFor: Record<EndpointDefinition["authorization"], object[]> = {
  public: [],
  receipt_session: [{ receiptSession: [] }],
  client_session: [{ clientSession: [] }],
  staff_session: [{ staffSession: [] }],
  provider_signature: [],
};

function jsonSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" });
  return rest;
}

function errorResponses(codes: readonly EndpointDefinition["errors"][number][]) {
  const byStatus = new Map<number, string[]>();
  for (const code of codes) {
    const status = new AppError(code).status;
    byStatus.set(status, [...new Set([...(byStatus.get(status) ?? []), wireCode(code)])]);
  }
  return Object.fromEntries(
    [...byStatus].map(([status, wire]) => [
      String(status),
      {
        description: wire.join(", "),
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } },
        },
        "x-error-codes": wire,
      },
    ]),
  );
}

function operation(entry: EndpointDefinition) {
  const parameters = entry.params
    ? Object.entries(entry.params.shape).map(([name, schema]) => ({
        name,
        in: "path",
        required: true,
        schema: jsonSchema(schema as z.ZodType, "input"),
      }))
    : undefined;
  const responses = Object.fromEntries(
    entry.responses.map((response) => [
      String(response.status),
      {
        description: response.description,
        ...(response.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(response.headers).map(([name, description]) => [
                  name,
                  { description, schema: { type: "string" } },
                ]),
              ),
            }
          : {}),
        ...(response.schema
          ? {
              content: {
                [response.contentType ?? "application/json"]: {
                  schema: jsonSchema(response.schema, "output"),
                  ...(response.example !== undefined ? { example: response.example } : {}),
                },
              },
            }
          : {}),
      },
    ]),
  );
  return {
    operationId: entry.id,
    summary: entry.summary,
    ...(entry.description ? { description: entry.description } : {}),
    tags: [entry.group],
    ...(entry.host === "any" ? {} : { servers: [servers[entry.host]] }),
    security: securityFor[entry.authorization],
    ...(parameters ? { parameters } : {}),
    ...(entry.body
      ? {
          requestBody: {
            required: true,
            content: Object.fromEntries(
              Object.entries(entry.body.schemas).map(([contentType, schema], index) => [
                contentType,
                {
                  schema: jsonSchema(schema, "input"),
                  ...(index === 0 && entry.body?.example !== undefined
                    ? { example: entry.body.example }
                    : {}),
                },
              ]),
            ),
          },
        }
      : {}),
    responses: { ...responses, ...errorResponses(entry.errors) },
    "x-host-context": entry.host,
    "x-authorization": {
      class: entry.authorization,
      ...(entry.capability ? { capability: entry.capability } : {}),
    },
    "x-idempotency": entry.idempotency,
    "x-revision": entry.revision,
    "x-pagination": entry.pagination,
    "x-acceptance": entry.acceptance,
  };
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const entry of endpoints as readonly EndpointDefinition[]) {
    paths[entry.path] ??= {};
    (paths[entry.path] as Record<string, unknown>)[entry.method.toLowerCase()] = operation(entry);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "MS Realty application transport",
      version: transportVersion,
      description:
        "Generated from src/server/transport/registry.ts by scripts/openapi.mjs; do not edit. " +
        "Application endpoints only (architecture §19.3), never raw collections. Mutations " +
        "follow the §5.1 envelope: server-derived Principal, logical operation identity, " +
        "expected revision where applicable, and one of the §5.1 results.",
    },
    servers: Object.values(servers),
    tags: [...new Set(endpoints.map((entry) => entry.group))].map((name) => ({ name })),
    paths,
    components: {
      schemas: { ErrorEnvelope: jsonSchema(errorEnvelopeSchema, "output") },
      securitySchemes,
    },
    "x-authorization-classes": authorizationClasses,
  };
}
