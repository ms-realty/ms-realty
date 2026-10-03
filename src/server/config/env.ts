// Validated server environment. Production fails fast on anything missing; development and
// tests get safe local defaults so nothing needs configuring to run the suite.
import "server-only";
import { z } from "zod";
import { type HostOrigins, parseHostOrigins } from "./hosts";

// An empty variable (as copied from .env.example) counts as unset.
const blankAsUnset = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const origin = z.preprocess(
  blankAsUnset,
  z
    .url()
    .transform((value) => new URL(value).origin)
    .refine((value) => /^https?:\/\//.test(value), "must be an http(s) origin")
    .optional(),
);

/** An http(s) base URL; a trailing slash is dropped so paths can be appended. */
const baseUrl = z.preprocess(
  blankAsUnset,
  z
    .url()
    .refine((value) => /^https?:\/\//.test(value), "must be an http(s) URL")
    .transform((value) => value.replace(/\/+$/, ""))
    .optional(),
);

const optional = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const schema = z
  .object({
    NODE_ENV: z.preprocess(
      blankAsUnset,
      z.enum(["development", "test", "production"]).default("development"),
    ),
    DATABASE_URL: optional,
    /** Origin this app is served from; cookies, WebAuthn and Origin checks bind to it. */
    APP_ORIGIN: origin,
    /** Public canonical origin for links in emails and metadata. */
    CANONICAL_ORIGIN: origin,
    /** The three hosts of the one app (§11.1): public, client (`my.`) and staff (`app.`). */
    PUBLIC_ORIGIN: origin,
    CLIENT_ORIGIN: origin,
    STAFF_ORIGIN: origin,
    /** Secret for keyed hashes of rate-limit identifiers (IP addresses, emails). */
    AUTH_SECRET: optional,
    /** WebAuthn relying-party id; defaults to the staff host name. */
    WEBAUTHN_RP_ID: optional,
    WEBAUTHN_RP_NAME: optional,
    /** "1" serves captured outgoing email at /api/test-outbox; loopback hosts only. */
    ENABLE_TEST_OUTBOX: optional,
    EMAIL_FROM: optional,
    EMAIL_PROVIDER: optional,
    R2_ACCOUNT_ID: optional,
    R2_ACCESS_KEY_ID: optional,
    R2_SECRET_ACCESS_KEY: optional,
    R2_BUCKET: optional,
    /** Base URL public media renditions are served from (the edge's media path). */
    MEDIA_PUBLIC_BASE_URL: baseUrl,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      for (const key of [
        "DATABASE_URL",
        "APP_ORIGIN",
        "CANONICAL_ORIGIN",
        "PUBLIC_ORIGIN",
        "CLIENT_ORIGIN",
        "STAFF_ORIGIN",
        "AUTH_SECRET",
        "MEDIA_PUBLIC_BASE_URL",
      ] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "is required" });
      }
      for (const key of ["APP_ORIGIN", "PUBLIC_ORIGIN", "CLIENT_ORIGIN", "STAFF_ORIGIN"] as const) {
        const value = env[key];
        // A production build served on loopback names (the e2e server) cannot hold https.
        if (value && !value.startsWith("https://") && !isLoopbackOrigin(value)) {
          ctx.addIssue({ code: "custom", path: [key], message: "must be https" });
        }
      }
    }
    if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) {
      ctx.addIssue({ code: "custom", path: ["AUTH_SECRET"], message: "needs 32+ characters" });
    }
    const r2 = [env.R2_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_BUCKET];
    if (r2.some(Boolean) && !r2.every(Boolean)) {
      ctx.addIssue({ code: "custom", path: ["R2_BUCKET"], message: "R2 settings are all-or-none" });
    }
  });

export interface ServerEnv {
  readonly nodeEnv: "development" | "test" | "production";
  readonly production: boolean;
  readonly databaseUrl: string | undefined;
  readonly appOrigin: string;
  readonly canonicalOrigin: string;
  /** Origin of each host context; private session cookies and Origin checks bind to them. */
  readonly hosts: HostOrigins;
  readonly authSecret: string;
  readonly webauthn: { readonly rpId: string; readonly rpName: string };
  /**
   * Captured outgoing email is readable at /api/test-outbox and delivered by an in-process
   * worker. Only when asked for and every host is a loopback name, so a deployment on real
   * hosts can never expose it.
   */
  readonly testOutbox: boolean;
  readonly email: { readonly from: string | undefined; readonly provider: string | undefined };
  readonly r2:
    | {
        readonly accountId: string;
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
        readonly bucket: string;
      }
    | undefined;
  /** Unset outside production: media then has no public URL and is not shown. */
  readonly mediaPublicBaseUrl: string | undefined;
}

/** `localhost` and `*.localhost` always resolve to this machine (RFC 6761). */
export function isLoopbackOrigin(value: string): boolean {
  const { hostname } = new URL(value);
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

const devOrigin = "http://localhost:3000";
// Only ever used outside production, where the superRefine above demands a real secret.
const devSecret = "development-only-secret-not-for-production-use";

/** Parses an environment record; throws listing the invalid variable names (never values). */
export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`);
    throw new Error(`Invalid server environment: ${problems.join("; ")}`);
  }
  const env = result.data;
  const appOrigin = env.APP_ORIGIN ?? devOrigin;
  const hosts = parseHostOrigins(source);
  return {
    nodeEnv: env.NODE_ENV,
    production: env.NODE_ENV === "production",
    databaseUrl: env.DATABASE_URL,
    appOrigin,
    canonicalOrigin: env.CANONICAL_ORIGIN ?? appOrigin,
    hosts,
    authSecret: env.AUTH_SECRET ?? devSecret,
    webauthn: {
      rpId: env.WEBAUTHN_RP_ID ?? new URL(hosts.staff).hostname,
      rpName: env.WEBAUTHN_RP_NAME ?? "MS Realty",
    },
    testOutbox:
      env.ENABLE_TEST_OUTBOX === "1" && Object.values(hosts).every((o) => isLoopbackOrigin(o)),
    email: { from: env.EMAIL_FROM, provider: env.EMAIL_PROVIDER },
    r2:
      env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
        ? {
            accountId: env.R2_ACCOUNT_ID,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            bucket: env.R2_BUCKET,
          }
        : undefined,
    mediaPublicBaseUrl: env.MEDIA_PUBLIC_BASE_URL,
  };
}

let cached: ServerEnv | undefined;

/** The process environment, validated once on first use. */
export function getEnv(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
