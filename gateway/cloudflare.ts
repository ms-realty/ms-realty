// Staging only: never binds a production route, creates a database or rebuilds an image.

import { DurableObject } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { accessAuthorized } from "./access";
import { type RelayEnv, relayEmail } from "./email-relay";
import { type RuntimeEnv, runtimeEnvironment } from "./runtime-env";
import { stagingArtifacts } from "./staging-artifacts.generated";
import { type GatewayEnv, gateway } from "./worker";

interface StagingEnv
  extends Omit<GatewayEnv, "LEGACY_ROUTES_JSON" | "PUBLIC_MEDIA_JSON">,
    Omit<RelayEnv, "EMAIL">,
    RuntimeEnv {
  EMAIL: SendEmail;
  IMAGE_DIGEST: string;
  STAGING_CONTROL_SECRET: string;
  EMAIL_RELAY_SECRET: string;
  MS_REALTY: DurableObjectNamespace<MsRealtyContainer>;
  MS_REALTY_WORKER: DurableObjectNamespace<MsRealtyWorkerContainer>;
  MS_REALTY_MIGRATOR: DurableObjectNamespace<MsRealtyMigratorContainer>;
  EMAIL_RECEIPTS: DurableObjectNamespace<EmailReceipt>;
}
type MigrationReceipt = {
  status: "running" | "passed" | "failed";
  digest: string;
  exitCode?: number;
};

export class MsRealtyContainer extends Container<StagingEnv> {
  defaultPort = 3000;
  sleepAfter = "20m";
  envVars = runtimeEnvironment(this.env, "web");
  entrypoint = ["node", "server.js"];
}
export class MsRealtyWorkerContainer extends Container<StagingEnv> {
  envVars = runtimeEnvironment(this.env, "worker");
  entrypoint = ["node", "--conditions=react-server", "dist-runtime/worker.mjs"];
  sleepAfter = "20m";
  async startQueue() {
    await this.start();
    await this.renewActivityTimeout();
  }
  async onActivityExpired() {
    await this.renewActivityTimeout();
  }
}
export class MsRealtyMigratorContainer extends Container<StagingEnv> {
  envVars = runtimeEnvironment(this.env, "migrator");
  entrypoint = ["node", "--conditions=react-server", "dist-runtime/migrate.mjs"];
  async result(): Promise<MigrationReceipt | undefined> {
    return this.ctx.storage.get("migration");
  }
  async runMigration(): Promise<MigrationReceipt> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.result();
      if (previous) return previous; // An uncertain operation requires operator reconciliation.
      const receipt: MigrationReceipt = { status: "running", digest: this.env.IMAGE_DIGEST };
      await this.ctx.storage.put("migration", receipt);
      await this.start();
      return receipt;
    });
  }
  async onStop({ exitCode, reason }: { exitCode: number; reason: string }) {
    await this.ctx.storage.put("migration", {
      status: reason === "exit" && exitCode === 0 ? "passed" : "failed",
      digest: this.env.IMAGE_DIGEST,
      exitCode,
    } satisfies MigrationReceipt);
  }
}
export class EmailReceipt extends DurableObject<StagingEnv> {
  async fetch(request: Request): Promise<Response> {
    // Serialise the whole send, not just storage operations; concurrent duplicate requests
    // must not both observe an empty receipt and send twice.
    return this.ctx.blockConcurrencyWhile(() => relayEmail(request, this.env, this.ctx.storage));
  }
}
const noindex = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, headers });
};
async function authenticated(request: Request, configured: string): Promise<boolean> {
  if (!configured || configured.length < 32) return false;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const hashes = await Promise.all(
    [token, configured].map((s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))),
  );
  let mismatch = 0;
  const a = new Uint8Array(hashes[0] as ArrayBuffer),
    b = new Uint8Array(hashes[1] as ArrayBuffer);
  for (let i = 0; i < a.length; i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return mismatch === 0;
}
const migrator = (env: StagingEnv) =>
  env.MS_REALTY_MIGRATOR.getByName(`migration-${env.IMAGE_DIGEST}`);
const migrated = async (env: StagingEnv) => {
  const receipt = await migrator(env).result();
  return receipt?.status === "passed" && receipt.digest === env.IMAGE_DIGEST;
};
async function handle(request: Request, env: StagingEnv): Promise<Response> {
  if (
    env.STAGING !== "true" ||
    stagingArtifacts.fixture ||
    stagingArtifacts.sourceCommit !== env.BUILD_SHA
  )
    return new Response(null, { status: 503 });
  if (!(await accessAuthorized(request, env))) return new Response(null, { status: 403 });
  const url = new URL(request.url);
  if (
    url.origin !== env.PUBLIC_ORIGIN &&
    url.origin !== env.CLIENT_ORIGIN &&
    url.origin !== env.STAFF_ORIGIN
  )
    return new Response(null, { status: 404 });
  if (url.pathname === "/__staging/email") {
    if (!(await authenticated(request, env.EMAIL_RELAY_SECRET)))
      return new Response(null, { status: 403 });
    const key = request.headers.get("idempotency-key");
    if (!key || key.length > 256) return new Response(null, { status: 400 });
    return env.EMAIL_RECEIPTS.getByName(key).fetch(request);
  }
  if (url.pathname === "/__staging/migrate") {
    if (!(await authenticated(request, env.STAGING_CONTROL_SECRET)))
      return new Response(null, { status: 403 });
    if (request.method === "GET")
      return Response.json((await migrator(env).result()) ?? { status: "absent" });
    if (request.method !== "POST") return new Response(null, { status: 405 });
    return Response.json(await migrator(env).runMigration(), { status: 202 });
  }
  if (!(await migrated(env))) return new Response(null, { status: 503 });
  await env.MS_REALTY_WORKER.getByName("queue").startQueue();
  return gateway(
    request,
    {
      ...env,
      LEGACY_ROUTES_JSON: stagingArtifacts.routes,
      PUBLIC_MEDIA_JSON: stagingArtifacts.media,
    },
    async (input) => {
      if (!(input instanceof Request)) throw new Error("Expected fixed upstream request");
      return env.MS_REALTY.getByName("web").fetch(input);
    },
    async () => true,
  );
}
export default {
  async fetch(request: Request, env: StagingEnv) {
    try {
      return noindex(await handle(request, env));
    } catch {
      return noindex(new Response(null, { status: 503 }));
    }
  },
  async scheduled(_event: ScheduledController, env: StagingEnv) {
    if (
      env.STAGING === "true" &&
      !stagingArtifacts.fixture &&
      stagingArtifacts.sourceCommit === env.BUILD_SHA &&
      (await migrated(env))
    )
      await env.MS_REALTY_WORKER.getByName("queue").startQueue();
  },
};
