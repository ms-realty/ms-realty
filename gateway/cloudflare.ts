// Staging only: never binds a production route, creates a database or rebuilds an image.

import { DurableObject } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { accessAuthorized } from "./access";
import { type RelayEnv, relayEmail } from "./email-relay";
import { type RuntimeEnv, type RuntimeRole, runtimeEnvironment } from "./runtime-env";
import {
  type MigrationReceipt,
  migrationCompletion,
  migrationStopped,
  runtimeProof,
} from "./runtime-proof";
import { stagingArtifacts } from "./staging-artifacts.generated";
import { stagingWorkAllowed } from "./staging-phase";
import { type GatewayEnv, gateway } from "./worker";

interface StagingEnv
  extends Omit<GatewayEnv, "LEGACY_ROUTES_JSON" | "PUBLIC_MEDIA_JSON">,
    Omit<RelayEnv, "EMAIL">,
    RuntimeEnv {
  EMAIL: SendEmail;
  BUILD_SHA: string;
  IMAGE_DIGEST: string;
  STAGING_CONTROL_SECRET: string;
  EMAIL_RELAY_SECRET: string;
  MS_REALTY: DurableObjectNamespace<MsRealtyContainer>;
  MS_REALTY_WORKER: DurableObjectNamespace<MsRealtyWorkerContainer>;
  MS_REALTY_MIGRATOR: DurableObjectNamespace<MsRealtyMigratorContainer>;
  EMAIL_RECEIPTS: DurableObjectNamespace<EmailReceipt>;
}
class StagingRoleContainer extends Container<StagingEnv> {
  protected role: RuntimeRole = "web";
  async identity() {
    await this.startAndWaitForPorts([3001]);
    return { ...(await this.readIdentity()), actorId: this.ctx.id.toString() };
  }
  async connectivity() {
    const identity = await this.identity();
    const response = await this.containerFetch(
      "http://runtime/connectivity",
      { method: "POST" },
      3001,
    );
    if (!response.ok) throw new Error("Actual private TLS connectivity is unavailable");
    return { identity, proof: await response.json() };
  }
  protected async readIdentity() {
    const response = await this.containerFetch("http://runtime/identity", { method: "GET" }, 3001);
    if (!response.ok) throw new Error("Private role identity unavailable");
    return runtimeProof(await response.json(), this.role, this.env.BUILD_SHA ?? "");
  }
  protected async startRole(operationId?: string) {
    const response = await this.containerFetch(
      "http://runtime/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operationId ? { operationId } : {}),
      },
      3001,
    );
    if (response.status !== 202) throw new Error("Private role start requires reconciliation");
  }
}

export class MsRealtyContainer extends StagingRoleContainer {
  defaultPort = 3000;
  sleepAfter = "20m";
  envVars = runtimeEnvironment(this.env, "web");
  entrypoint = ["node", "runtime-entry.mjs", "web"];
  async startWeb() {
    const proof = await this.identity();
    if (proof.state !== "prepared" && proof.state !== "running")
      throw new Error("Web process requires reconciliation");
    await this.startRole();
  }
}
export class MsRealtyWorkerContainer extends StagingRoleContainer {
  protected role: RuntimeRole = "worker";
  envVars = runtimeEnvironment(this.env, "worker");
  entrypoint = ["node", "--conditions=react-server", "runtime-entry.mjs", "worker"];
  sleepAfter = "20m";
  async startQueue() {
    const proof = await this.identity();
    if (proof.state !== "prepared" && proof.state !== "running")
      throw new Error("Queue process requires reconciliation");
    await this.startRole();
    await this.renewActivityTimeout();
  }
  async onActivityExpired() {
    await this.renewActivityTimeout();
  }
}
export class MsRealtyMigratorContainer extends StagingRoleContainer {
  protected role: RuntimeRole = "migrator";
  envVars = runtimeEnvironment(this.env, "migrator");
  entrypoint = ["node", "--conditions=react-server", "runtime-entry.mjs", "migrator"];
  async result(): Promise<MigrationReceipt | undefined> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const receipt = await this.ctx.storage.get<MigrationReceipt>("migration");
      if (receipt?.status !== "running") return receipt;
      let next: MigrationReceipt;
      try {
        if (!this.ctx.container?.running) throw new Error("Migration process disappeared");
        next = migrationCompletion(receipt, await this.readIdentity());
      } catch {
        next = { ...receipt, status: "unknown" };
      }
      await this.ctx.storage.put("migration", next);
      return next;
    });
  }
  async runMigration(): Promise<MigrationReceipt> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.ctx.storage.get<MigrationReceipt>("migration");
      if (previous) return previous; // An uncertain operation requires operator reconciliation.
      const proof = await this.identity();
      if (proof.state !== "prepared") throw new Error("Migration process requires reconciliation");
      const receipt: MigrationReceipt = {
        status: "running",
        operationId: crypto.randomUUID(),
        configuredDigest: this.env.IMAGE_DIGEST,
        digestVerification: "unqualified",
        sourceCommit: proof.sourceCommit,
        buildNonce: proof.buildNonce,
      };
      await this.ctx.storage.put("migration", receipt);
      try {
        await this.startRole(receipt.operationId);
      } catch {
        await this.ctx.storage.put("migration", { ...receipt, status: "unknown" });
        throw new Error("Migration start acknowledgement requires reconciliation");
      }
      return receipt;
    });
  }
  async onStop({ exitCode, reason }: { exitCode: number; reason: string }) {
    const receipt = await this.ctx.storage.get<MigrationReceipt>("migration");
    if (receipt)
      await this.ctx.storage.put("migration", migrationStopped(receipt, { exitCode, reason }));
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
  // This gate proves explicit process completion for the immutable source. Exact image digest
  // and rollout qualification are checked separately by the staging controller, never env vars.
  return (
    receipt?.status === "completed" &&
    receipt.configuredDigest === env.IMAGE_DIGEST &&
    receipt.sourceCommit === env.BUILD_SHA
  );
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
  if (url.pathname === "/__staging/connectivity") {
    if (!(await authenticated(request, env.STAGING_CONTROL_SECRET)))
      return new Response(null, { status: 403 });
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (env.STAGING_CONNECTIVITY_ONLY !== "true") return new Response(null, { status: 409 });
    const [web, worker, migration] = await Promise.all([
      env.MS_REALTY.getByName("web").connectivity(),
      env.MS_REALTY_WORKER.getByName("queue").connectivity(),
      migrator(env).connectivity(),
    ]);
    return Response.json({ schemaVersion: 1, roles: { web, worker, migrator: migration } });
  }
  // During the first deploy only the authenticated, read-only diagnostic controls exist.
  if (!stagingWorkAllowed(env.STAGING_CONNECTIVITY_ONLY) && url.pathname !== "/__staging/runtime")
    return new Response(null, { status: 503 });
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
  if (url.pathname === "/__staging/runtime") {
    if (!(await authenticated(request, env.STAGING_CONTROL_SECRET)))
      return new Response(null, { status: 403 });
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const [web, worker, migration] = await Promise.all([
      env.MS_REALTY.getByName("web").identity(),
      env.MS_REALTY_WORKER.getByName("queue").identity(),
      migrator(env).identity(),
    ]);
    return Response.json({
      schemaVersion: 1,
      configuredDigest: env.IMAGE_DIGEST,
      digestVerification: "unqualified",
      roles: { web, worker, migrator: migration },
    });
  }
  if (!(await migrated(env))) return new Response(null, { status: 503 });
  await env.MS_REALTY_WORKER.getByName("queue").startQueue();
  await env.MS_REALTY.getByName("web").startWeb();
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
      stagingWorkAllowed(env.STAGING_CONNECTIVITY_ONLY) &&
      !stagingArtifacts.fixture &&
      stagingArtifacts.sourceCommit === env.BUILD_SHA &&
      (await migrated(env))
    )
      await env.MS_REALTY_WORKER.getByName("queue").startQueue();
  },
};
