// OpenAPI 3.1 document for the transport registry (architecture §19.3). Schemas come from the
// same zod definitions the route handlers use, converted with zod's JSON Schema (draft 2020-12,
// the OpenAPI 3.1 dialect). Written to docs/api/openapi.json by scripts/openapi.mjs.
import "server-only";
import { z } from "zod";
import { AppError, toErrorBody, wireCode } from "../errors";
import {
  authorizationClasses,
  type EndpointDefinition,
  endpoints,
  errorEnvelopeSchema,
} from "./registry";

/** Bump on any change a client could observe. */
export const transportVersion = "0.5.0";

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
  anonymous_creator: [],
  receipt_session: [{ receiptSession: [] }],
  client_session: [{ clientSession: [] }],
  staff_session: [{ staffSession: [] }],
  private_session: [{ clientSession: [] }, { staffSession: [] }],
  provider_signature: [],
};

function jsonSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" });
  return rest;
}

function responseHeaders(headers: Readonly<Record<string, string>> | undefined) {
  return headers
    ? {
        headers: Object.fromEntries(
          Object.entries(headers).map(([name, description]) => [
            name,
            { description, schema: { type: "string" } },
          ]),
        ),
      }
    : {};
}

function errorResponses(
  codes: readonly EndpointDefinition["errors"][number][],
  headers: EndpointDefinition["errorHeaders"],
) {
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
        ...responseHeaders(headers),
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            examples: Object.fromEntries(
              codes
                .filter((code) => new AppError(code).status === status)
                .map((code) => [
                  wireCode(code),
                  {
                    value: { error: toErrorBody(new AppError(code), "example-correlation-id") },
                  },
                ]),
            ),
          },
        },
        "x-error-codes": wire,
      },
    ]),
  );
}

function operation(entry: EndpointDefinition) {
  const parameters = (
    [
      ["path", entry.params],
      ["query", entry.query],
      ["header", entry.requestHeaders],
    ] as const
  ).flatMap(([location, fields]) =>
    fields
      ? Object.entries(fields.shape).map(([name, schema]) => ({
          name,
          in: location,
          required: location === "path" || !(schema as z.ZodType).isOptional(),
          schema: jsonSchema(schema as z.ZodType, "input"),
        }))
      : [],
  );
  const responses = Object.fromEntries(
    entry.responses.map((response) => [
      String(response.status),
      {
        description: response.description,
        ...responseHeaders(response.headers),
        ...(response.schema
          ? {
              content: Object.fromEntries(
                (response.contentTypes ?? [response.contentType ?? "application/json"]).map(
                  (contentType) => [
                    contentType,
                    {
                      schema: jsonSchema(response.schema as z.ZodType, "output"),
                      ...(response.example !== undefined ? { example: response.example } : {}),
                    },
                  ],
                ),
              ),
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
    ...(entry.host === "any"
      ? {}
      : {
          servers:
            entry.host === "private" ? [servers.client, servers.staff] : [servers[entry.host]],
        }),
    security: securityFor[entry.authorization],
    ...(parameters.length ? { parameters } : {}),
    ...(entry.body
      ? {
          requestBody: {
            required: true,
            ...(entry.body.maxBytes === undefined
              ? {}
              : { "x-max-body-bytes": entry.body.maxBytes }),
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
    responses: { ...responses, ...errorResponses(entry.errors, entry.errorHeaders) },
    "x-host-context": entry.host,
    "x-authorization": {
      class: entry.authorization,
      ...(entry.capability ? { capability: entry.capability } : {}),
    },
    "x-idempotency": entry.idempotency,
    "x-revision": entry.revision,
    "x-pagination": entry.pagination,
    "x-acceptance": entry.acceptance,
    ...(entry.redirectErrors ? { "x-redirect-error-codes": entry.redirectErrors } : {}),
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
