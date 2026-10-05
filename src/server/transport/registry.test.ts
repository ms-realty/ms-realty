// Transport registry and its OpenAPI artifact (architecture §19.3, §5.1).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { z } from "zod";
import { config as proxyConfig } from "../../../proxy";
import { hostContexts, servesApi } from "../config/hosts";
import { AppError, toErrorBody } from "../errors";
import type { InquiryReceipt } from "../inquiries/intake";
import { buildOpenApiDocument } from "./openapi";
import {
  type EndpointDefinition,
  endpoints,
  errorEnvelopeSchema,
  type inquiryReceiptSchema,
  localTestOperations,
} from "./registry";

const registered = endpoints as readonly EndpointDefinition[];

/** `app/api/**\/route.ts` → `METHOD /api/...` with `[param]` written as `{param}`. */
function routeFileOperations(): string[] {
  const files = readdirSync("app/api", { recursive: true })
    .map(String)
    .filter((file) => file.endsWith("route.ts"));
  return files.flatMap((file) => {
    const path = `/${join("api", file)}`
      .replace(/\/route\.ts$/, "")
      .replaceAll(/\[([^\]]+)\]/g, "{$1}");
    const source = readFileSync(join("app/api", file), "utf8");
    const methods = [
      ...source.matchAll(/export (?:async function|function|const) (GET|POST|PUT|PATCH|DELETE)\b/g),
    ].map((match) => match[1]);
    return methods.map((method) => `${method} ${path}`);
  });
}

describe("transport registry", () => {
  it("inventories exactly the application endpoints and explicit local tools app/api implements", () => {
    const implemented = routeFileOperations().sort();
    const declared = [...registered, ...localTestOperations]
      .map((entry) => `${entry.method} ${entry.path}`)
      .sort();
    expect(declared).toEqual(implemented);
    for (const tool of localTestOperations)
      expect(buildOpenApiDocument().paths[tool.path]).toBeUndefined();
  });

  it("has unique operation ids and a capability on every staff endpoint", () => {
    expect(new Set(registered.map((entry) => entry.id)).size).toBe(registered.length);
    for (const entry of registered) {
      expect(entry.authorization === "staff_session", entry.id).toBe(Boolean(entry.capability));
      for (const id of entry.acceptance)
        expect(id, entry.id).toMatch(/^AT(0[1-9]|[1-5]\d|6[0-8])$/);
    }
  });

  it("mounts each endpoint on its registered host while protecting host-neutral health transport", () => {
    for (const entry of registered) {
      if (entry.host === "any") {
        expect(entry.path).toBe("/api/health");
        expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url: entry.path })).toBe(true);
        continue;
      }
      for (const context of hostContexts) {
        expect(servesApi(context, entry.path), `${entry.id} on ${context}`).toBe(
          entry.host === "private" ? context !== "public" : context === entry.host,
        );
      }
    }
  });

  it("serves health on all three authenticated hosts and denies direct-origin health access", async () => {
    const hosts = ["makler-realty.com", "my.makler-realty.com", "app.makler-realty.com"];
    const proof = crypto.randomUUID();
    try {
      vi.stubEnv("PUBLIC_ORIGIN", `https://${hosts[0]}`);
      vi.stubEnv("CLIENT_ORIGIN", `https://${hosts[1]}`);
      vi.stubEnv("STAFF_ORIGIN", `https://${hosts[2]}`);
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STAGING", "false");
      vi.stubEnv("ORIGIN_VERIFY_SECRET", proof);
      // Host configuration is cached on first use. Exercise a fresh production process.
      vi.resetModules();
      const { proxy } = await import("../../../proxy");
      for (const host of hosts) {
        expect(
          proxy(new NextRequest(`https://${host}/api/health`, { headers: { host } })).status,
        ).toBe(404);
        const response = proxy(
          new NextRequest("https://origin.invalid/api/health", {
            headers: {
              host: "origin.invalid",
              "x-msr-public-host": host,
              "x-msr-origin-token": proof,
            },
          }),
        );
        expect(response.status, host).toBe(200);
        expect(response.headers.get("x-middleware-next"), host).toBe("1");
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("gives examples that satisfy their own schemas", () => {
    for (const entry of registered) {
      for (const response of entry.responses) {
        if (response.schema && response.example !== undefined) {
          expect(response.schema.safeParse(response.example).success, entry.id).toBe(true);
        }
      }
      const json = entry.body?.schemas["application/json"];
      if (json && entry.body?.example !== undefined) {
        // Refinements that need the server's key (issued submission keys) are not checked here.
        const result = json.safeParse(entry.body.example);
        const issues = result.success ? [] : result.error.issues.map((i) => i.path.join("."));
        expect(
          issues.filter((path) => path !== "submissionKey"),
          entry.id,
        ).toEqual([]);
      }
    }
  });

  it("describes the error body errors.ts actually sends", () => {
    const body = toErrorBody(
      new AppError("version_conflict", { current: { revision: 3 } }),
      "corr-12345678",
    );
    expect(errorEnvelopeSchema.strict().safeParse({ error: body }).success).toBe(true);
    const validation = toErrorBody(
      new AppError("validation_failed", { fieldErrors: { name: ["too_long"] } }),
      "corr-12345678",
    );
    expect(errorEnvelopeSchema.safeParse({ error: validation }).success).toBe(true);
  });

  it("keeps the receipt schema in step with the intake receipt type", () => {
    expectTypeOf<InquiryReceipt>().toExtend<z.infer<typeof inquiryReceiptSchema>>();
  });

  it("describes the bounded native viewing preference field accepted by inquiry intake", () => {
    const inquiry = registered.find((entry) => entry.id === "inquiries.submit");
    const native = inquiry?.body?.schemas["application/x-www-form-urlencoded"];
    expect(native).toBeDefined();
    const values = {
      submissionKey: "issued-by-server",
      purpose: "viewing_request",
      locale: "bg",
      contactKind: "email",
      contactValue: "visitor@example.test",
      privacyNotice: "on",
      viewingPreferences: JSON.stringify({
        version: 1,
        provenance: "self_declared",
        timezone: "Europe/Sofia",
        windows: [],
      }),
    };
    expect(native?.safeParse(values).success).toBe(true);
    expect(native?.safeParse({ ...values, viewingPreferences: "x".repeat(4097) }).success).toBe(
      false,
    );
  });

  it("docs/api/openapi.json is current (regenerate: tsx --conditions=react-server scripts/openapi.mjs)", () => {
    const committed = JSON.parse(readFileSync("docs/api/openapi.json", "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
  });

  it("maps every registered operation into the OpenAPI document", () => {
    const document = buildOpenApiDocument();
    for (const entry of registered) {
      const operation = (document.paths[entry.path] as Record<string, { operationId: string }>)[
        entry.method.toLowerCase()
      ];
      expect(operation?.operationId, entry.id).toBe(entry.id);
    }
  });
});
