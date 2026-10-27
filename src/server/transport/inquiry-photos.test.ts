import { describe, expect, it } from "vitest";
import { publicLocales } from "@/domain/ids";
import { AppError } from "../errors";
import { downloadResponse } from "../files/download";
import { imageContentTypes } from "../files/inspect";
import { errorResponse } from "../http/request";
import { maxInquiryPhotoBytes } from "../inquiries/attachments";
import { issueSubmissionKey } from "../inquiries/intake";
import { buildOpenApiDocument } from "./openapi";
import { type EndpointDefinition, endpoints, inquiryPhotoFormSchema } from "./registry";

const registered = endpoints as readonly EndpointDefinition[];
const upload = registered.find((entry) => entry.id === "inquiries.attachPhoto");
const download = registered.find((entry) => entry.id === "inquiries.photoDownload");
const file = (size: number) =>
  new File([new Uint8Array(size)], "synthetic.bin", { type: "application/octet-stream" });

describe("F10/AT42 inquiry photo transport", () => {
  it("requires one bounded binary file, UUID and assessment permission without actor authority", () => {
    const values = {
      operationId: crypto.randomUUID(),
      file: file(maxInquiryPhotoBytes),
      sharedForInquiry: "1",
    };
    // Declared MIME is not byte evidence; inspection remains the service's responsibility.
    expect(inquiryPhotoFormSchema.safeParse(values).success).toBe(true);
    for (const changed of [
      { file: file(0) },
      { file: file(maxInquiryPhotoBytes + 1) },
      { file: "https://untrusted.example.test/photo.png" },
      { file: [file(1), file(1)] },
      { operationId: "replacement-id" },
      { sharedForInquiry: "on" },
      { sharedForInquiry: true },
      { actor: { kind: "staff", id: crypto.randomUUID() } },
      { publicationAllowed: true },
    ])
      expect(inquiryPhotoFormSchema.safeParse({ ...values, ...changed }).success).toBe(false);
    for (const key of ["operationId", "file", "sharedForInquiry"] as const) {
      const missing: Record<string, unknown> = { ...values };
      delete missing[key];
      expect(inquiryPhotoFormSchema.safeParse(missing).success).toBe(false);
    }
  });

  it("publishes the receipt capability, strict multipart shape and actual redirect error channel", () => {
    expect(upload?.params?.safeParse({ receiptId: issueSubmissionKey() }).success).toBe(true);
    expect(upload?.params?.safeParse({ receiptId: crypto.randomUUID() }).success).toBe(false);
    expect(upload?.query?.parse({})).toEqual({ locale: "bg" });
    expect(upload?.query?.safeParse({ locale: "unsupported" }).success).toBe(false);
    const operation = buildOpenApiDocument().paths["/api/inquiries/{receiptId}/photos"]?.post;
    expect(operation).toMatchObject({
      servers: [{ url: "https://makler-realty.com" }],
      security: [{ receiptSession: [] }],
      "x-authorization": { class: "receipt_session" },
      "x-idempotency": "operation_id",
      "x-redirect-error-codes": [
        "validation_failed",
        "rate_limited",
        "idempotency_key_reused",
        "transition_denied",
        "unavailable",
      ],
      parameters: [
        { name: "receiptId", in: "path", required: true },
        {
          name: "locale",
          in: "query",
          required: false,
          schema: { enum: [...publicLocales], default: "bg" },
        },
      ],
      requestBody: {
        required: true,
        "x-max-body-bytes": maxInquiryPhotoBytes + 64 * 1024,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["operationId", "file", "sharedForInquiry"],
              properties: {
                operationId: { type: "string", format: "uuid" },
                file: {
                  type: "string",
                  format: "binary",
                  minLength: 1,
                  maxLength: maxInquiryPhotoBytes,
                },
                sharedForInquiry: { type: "string", const: "1" },
              },
            },
          },
        },
      },
      responses: {
        "303": {
          headers: {
            location: { schema: { type: "string" } },
            "cache-control": { description: "no-store" },
          },
        },
        "403": { "x-error-codes": ["CROSS_ORIGIN_REQUEST", "NOT_AUTHORIZED"] },
        "404": { "x-error-codes": ["NOT_FOUND"] },
        "500": { "x-error-codes": ["INTERNAL_ERROR"] },
      },
    });
    for (const status of [200, 201, 400, 409, 422, 429, 503])
      expect(operation).not.toHaveProperty(`responses.${status}`);
    expect(operation).not.toHaveProperty("responses.303.content");
    expect(operation).not.toHaveProperty("requestBody.content.application/json");
  });

  it("describes staff-only verified image bytes and the real full/range/unsatisfiable headers", () => {
    const operation = buildOpenApiDocument().paths["/api/inquiry-attachments/{id}"]?.get;
    expect(operation).toMatchObject({
      servers: [{ url: "https://app.makler-realty.com" }],
      security: [{ staffSession: [] }],
      "x-authorization": { class: "staff_session", capability: "inquiry.read" },
      parameters: [
        { name: "id", in: "path", required: true, schema: { format: "uuid" } },
        { name: "range", in: "header", required: false },
      ],
    });
    for (const contentType of imageContentTypes) {
      for (const range of [null, "bytes=0-1", "bytes=9-10"]) {
        const response = downloadResponse(
          { bytes: Buffer.from([1, 2, 3]), contentType, fileName: "inquiry-photo", inline: true },
          range,
        );
        const declared = download?.responses.find((item) => item.status === response.status);
        expect(declared).toBeDefined();
        for (const [name, value] of Object.entries(declared?.headers ?? {})) {
          if (!["content-disposition", "content-length", "content-range"].includes(name))
            expect(response.headers.get(name)).toBe(value);
        }
        expect(response.headers.get("content-disposition")).toContain("inline;");
        expect(response.headers.get("content-disposition")).toContain("inquiry-photo");
        if (response.status !== 416)
          expect(operation).toHaveProperty(
            `responses.${response.status}.content.${contentType}.schema`,
            {
              type: "string",
              format: "binary",
              minLength: 1,
              maxLength: maxInquiryPhotoBytes,
            },
          );
        else expect(operation).not.toHaveProperty("responses.416.content");
      }
    }
  });

  it("uses the standard JSON error envelope and helper headers for both photo endpoints", () => {
    const document = buildOpenApiDocument();
    for (const endpoint of [upload, download]) {
      expect(endpoint).toBeDefined();
      if (!endpoint) throw new Error("Missing inquiry photo endpoint");
      const operation = document.paths[endpoint.path]?.[endpoint.method.toLowerCase()];
      for (const code of endpoint.errors) {
        const response = errorResponse(new AppError(code), "photo-contract-correlation");
        expect(operation).toHaveProperty(
          `responses.${response.status}.content.application/json.schema.$ref`,
          "#/components/schemas/ErrorEnvelope",
        );
        for (const [name, description] of Object.entries(endpoint.errorHeaders ?? {})) {
          expect(response.headers.has(name)).toBe(true);
          expect(operation).toHaveProperty(
            `responses.${response.status}.headers.${name}.description`,
            description,
          );
        }
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-correlation-id")).toBe("photo-contract-correlation");
      }
    }
  });
});
