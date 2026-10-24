// Separate production entry. It never weakens the protected staging entry or attests a digest.
import { DurableObject } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { accessAuthorized } from "./access";
import { type RelayEnv, relayEmail } from "./email-relay";
import {
  type ProductionGrant,
  productionContext,
  productionGrant,
  productionOrigins,
  productionRuntimeEnvironment,
} from "./production-runtime-env";
import type { RuntimeEnv, RuntimeRole } from "./runtime-env";
import {
  type MigrationReceipt,
  migrationCompletion,
  migrationStopped,
  reconcileMigrationCompletion,
  runtimeProof,
} from "./runtime-proof";
// Same immutable logical route/media bytes qualified on staging; fixture modules cannot run.
import { stagingArtifacts as acceptedArtifacts } from "./staging-artifacts.generated";
import { type GatewayEnv, gateway } from "./worker";

interface ProductionEnv
  extends Omit<GatewayEnv, "LEGACY_ROUTES_JSON" | "PUBLIC_MEDIA_JSON">,
    Omit<RelayEnv, "EMAIL">,
    RuntimeEnv {
  EMAIL: SendEmail;
  BUILD_SHA: string;
  IMAGE_DIGEST: string;
  PRODUCTION_CONTROL_SECRET: string;
  EMAIL_RELAY_SECRET: string;
  MS_REALTY: DurableObjectNamespace<ProductionWeb>;
  MS_REALTY_WORKER: DurableObjectNamespace<ProductionWorker>;
  MS_REALTY_MIGRATOR: DurableObjectNamespace<ProductionMigrator>;
  RELEASE_CONTROL: DurableObjectNamespace<ProductionReleaseControl>;
  EMAIL_RECEIPTS: DurableObjectNamespace<ProductionEmailReceipt>;
}
const release = (env: ProductionEnv) =>
  env.RELEASE_CONTROL.getByName(`release-${env.IMAGE_DIGEST}`);
const migration = (env: ProductionEnv) =>
  env.MS_REALTY_MIGRATOR.getByName(`migration-${env.IMAGE_DIGEST}`);
const noStore = (status: number, body?: unknown) =>
  Response.json(body ?? { code: "release_unavailable" }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });

class ProductionRole extends Container<ProductionEnv> {
  protected role: RuntimeRole = "web";
  async identity() {
    await this.startAndWaitForPorts([3001]);
    return { ...(await this.readIdentity()), actorId: this.ctx.id.toString() };
  }
  protected async readIdentity() {
    const result = await this.containerFetch("http://runtime/identity", { method: "GET" }, 3001);
    if (!result.ok) throw new Error("Production private role identity unavailable");
    return runtimeProof(await result.json(), this.role, this.env.BUILD_SHA);
  }
  async connectivity() {
    const identity = await this.identity();
    const result = await this.containerFetch(
      "http://runtime/connectivity",
      { method: "POST" },
      3001,
    );
    if (!result.ok) throw new Error("Actual production role TLS session unavailable");
    return { identity, proof: await result.json() };
  }
  protected async startRole(operationId?: string) {
    const result = await this.containerFetch(
      "http://runtime/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operationId ? { operationId } : {}),
      },
      3001,
    );
    if (result.status !== 202)
      throw new Error("Production role start acknowledgement requires reconciliation");
  }
}
export class ProductionWeb extends ProductionRole {
  defaultPort = 3000;
  sleepAfter = "20m";
  envVars = productionRuntimeEnvironment(this.env, "web");
  entrypoint = ["node", "runtime-entry.mjs", "web"];
  async startWeb() {
    const proof = await this.identity();
    if (!["prepared", "running"].includes(proof.state))
      throw new Error("Production web requires reconciliation");
    await this.startRole();
    // Control-port readiness does not establish that the web server accepts requests.
    await this.startAndWaitForPorts([3000]);
    return this.identity();
  }
}
export class ProductionWorker extends ProductionRole {
  protected role: RuntimeRole = "worker";
  envVars = productionRuntimeEnvironment(this.env, "worker");
  entrypoint = ["node", "--conditions=react-server", "runtime-entry.mjs", "worker"];
  sleepAfter = "20m";
  async startQueue() {
    const proof = await this.identity();
    if (!["prepared", "running"].includes(proof.state))
      throw new Error("Production queue requires reconciliation");
    await this.startRole();
    await this.renewActivityTimeout();
    return this.identity();
  }
  async stopQueue() {
    await this.stop(15);
    return { status: "stop_requested", drainVerification: "unqualified" };
  }
  async onActivityExpired() {
    if (await release(this.env).active()) await this.renewActivityTimeout();
    else await this.stop(15);
  }
}
export class ProductionMigrator extends ProductionRole {
  protected role: RuntimeRole = "migrator";
  envVars = productionRuntimeEnvironment(this.env, "migrator");
  entrypoint = ["node", "--conditions=react-server", "runtime-entry.mjs", "migrator"];
  async result(reconcileUnknown = false): Promise<MigrationReceipt | undefined> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.ctx.storage.get<MigrationReceipt>("migration");
      if (previous?.status !== "running" && !(reconcileUnknown && previous?.status === "unknown"))
        return previous;
      try {
        const proof = await this.readIdentity();
        const current = await this.ctx.storage.get<MigrationReceipt>("migration");
        if (!current) return current;
        const next =
          current.status === "unknown" && reconcileUnknown
            ? reconcileMigrationCompletion(current, proof)
            : migrationCompletion(current, proof);
        if (next !== current) await this.ctx.storage.put("migration", next);
        return next;
      } catch {
        return this.ctx.storage.get<MigrationReceipt>("migration");
      }
    });
  }
  async runMigration(operationId: string): Promise<MigrationReceipt> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.ctx.storage.get<MigrationReceipt>("migration");
      if (previous) {
        if (previous.operationId !== operationId)
          throw new Error("A prior production migration requires reconciliation");
        return previous;
      }
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(operationId))
        throw new Error("Production migration operation required");
      const proof = await this.identity();
      if (proof.state !== "prepared")
        throw new Error("Production migration requires reconciliation");
      const receipt: MigrationReceipt = {
        status: "running",
        operationId,
        configuredDigest: this.env.IMAGE_DIGEST,
        digestVerification: "unqualified",
        sourceCommit: proof.sourceCommit,
        buildNonce: proof.buildNonce,
      };
      await this.ctx.storage.put("migration", receipt);
      try {
        await this.startRole(operationId);
      } catch {
        await this.ctx.storage.put("migration", { ...receipt, status: "unknown" });
        throw new Error("Production migration start requires reconciliation");
      }
      return receipt;
    });
  }
  async onStop(stop: { exitCode: number; reason: string }) {
    const previous = await this.ctx.storage.get<MigrationReceipt>("migration");
    if (previous) await this.ctx.storage.put("migration", migrationStopped(previous, stop));
  }
}
type Activation = {
  status: "activating" | "active" | "unknown" | "stop_requested";
  grant: ProductionGrant;
};
export class ProductionReleaseControl extends DurableObject<ProductionEnv> {
  async active() {
    productionContext(this.env);
    const record = await this.ctx.storage.get<Activation>("activation");
    return (
      record?.status === "active" &&
      record.grant.sourceCommit === this.env.BUILD_SHA &&
      record.grant.digest === this.env.IMAGE_DIGEST &&
      record.grant.inputsSha256 === this.env.PRODUCTION_INPUTS_SHA256 &&
      record.grant.schemaSha256 === this.env.PRODUCTION_SCHEMA_SHA256 &&
      record.grant.ownershipSha256 === this.env.PRODUCTION_OWNERSHIP_SHA256
    );
  }
  async emailAllowed() {
    const record = await this.ctx.storage.get<Activation>("activation");
    return (
      (await this.active()) &&
      /^[a-f0-9]{64}$/.test(String(this.env.PRODUCTION_EMAIL_POLICY_SHA256 ?? "")) &&
      record?.grant.emailPolicySha256 === this.env.PRODUCTION_EMAIL_POLICY_SHA256
    );
  }
  async activate(envelope: unknown) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const grant = await productionGrant(envelope, "activate", this.env);
      const receipt = await migration(this.env).result();
      if (
        receipt?.status !== "completed" ||
        receipt.configuredDigest !== this.env.IMAGE_DIGEST ||
        receipt.sourceCommit !== this.env.BUILD_SHA
      )
        throw new Error("Actual production migration completion is required");
      const previous = await this.ctx.storage.get<Activation>("activation");
      if (previous && previous.grant.operationId !== grant.operationId)
        throw new Error("Prior activation requires reconciliation");
      if (previous?.status === "active")
        return { status: "active", operationId: grant.operationId };
      if (previous) throw new Error("Uncertain activation requires reconciliation");
      await this.ctx.storage.put("activation", { status: "activating", grant });
      try {
        const web = await this.env.MS_REALTY.getByName("web").startWeb();
        const worker = await this.env.MS_REALTY_WORKER.getByName("queue").startQueue();
        if (
          web.state !== "running" ||
          worker.state !== "running" ||
          web.buildNonce !== receipt.buildNonce ||
          worker.buildNonce !== receipt.buildNonce
        )
          throw new Error("Production role identity mismatch");
        await this.ctx.storage.put("activation", { status: "active", grant });
        return {
          status: "active",
          operationId: grant.operationId,
          digestVerification: "unqualified",
        };
      } catch {
        await this.ctx.storage.put("activation", { status: "unknown", grant });
        await this.env.MS_REALTY_WORKER.getByName("queue")
          .stopQueue()
          .catch(() => {});
        throw new Error("Production activation requires reconciliation");
      }
    });
  }
  async deactivate(envelope: unknown) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const grant = await productionGrant(envelope, "deactivate", this.env);
      await this.ctx.storage.put("activation", { status: "stop_requested", grant });
      return this.env.MS_REALTY_WORKER.getByName("queue").stopQueue();
    });
  }
}
export class ProductionEmailReceipt extends DurableObject<ProductionEnv> {
  async fetch(request: Request) {
    if (!(await release(this.env).emailAllowed())) return noStore(503);
    return this.ctx.blockConcurrencyWhile(() => relayEmail(request, this.env, this.ctx.storage));
  }
}
async function secret(request: Request, configured: string) {
  if (!configured || configured.length < 32) return false;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const [a, b] = await Promise.all(
    [token, configured].map((value) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
  let mismatch = 0;
  const first = new Uint8Array(a as ArrayBuffer),
    second = new Uint8Array(b as ArrayBuffer);
  for (let i = 0; i < first.length; i++) mismatch |= (first[i] ?? 0) ^ (second[i] ?? 0);
  return mismatch === 0;
}
async function envelope(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Operation grant required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 16384) {
      await reader.cancel();
      throw new Error("Bounded operation grant required");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
}
export async function productionRequest(request: Request, env: ProductionEnv): Promise<Response> {
  productionContext(env);
  if (acceptedArtifacts.fixture || acceptedArtifacts.sourceCommit !== env.BUILD_SHA)
    return noStore(503);
  const url = new URL(request.url);
  if (url.pathname.startsWith("/__staging/")) return noStore(404);
  if (url.pathname.startsWith("/__release/")) {
    if (url.origin !== productionOrigins.staff || !(await accessAuthorized(request, env)))
      return noStore(403);
    if (url.pathname === "/__release/email") {
      if (!(await secret(request, env.EMAIL_RELAY_SECRET)) || !(await release(env).emailAllowed()))
        return noStore(403);
      const key = request.headers.get("idempotency-key");
      if (!key || key.length > 256 || /[\r\n]/.test(key)) return noStore(400);
      return env.EMAIL_RECEIPTS.getByName(key).fetch(request);
    }
    if (!(await secret(request, env.PRODUCTION_CONTROL_SECRET))) return noStore(403);
    if (url.pathname === "/__release/runtime" && request.method === "POST") {
      const [web, worker, migrator] = await Promise.all([
        env.MS_REALTY.getByName("web").identity(),
        env.MS_REALTY_WORKER.getByName("queue").identity(),
        migration(env).identity(),
      ]);
      return noStore(200, {
        schemaVersion: 1,
        configuredDigest: env.IMAGE_DIGEST,
        digestVerification: "unqualified",
        roles: { web, worker, migrator },
      });
    }
    if (url.pathname === "/__release/connectivity" && request.method === "POST") {
      const [web, worker, migrator] = await Promise.all([
        env.MS_REALTY.getByName("web").connectivity(),
        env.MS_REALTY_WORKER.getByName("queue").connectivity(),
        migration(env).connectivity(),
      ]);
      return noStore(200, {
        schemaVersion: 1,
        environment: "production",
        roles: { web, worker, migrator },
      });
    }
    if (url.pathname === "/__release/migrate") {
      if (request.method === "GET")
        return noStore(
          200,
          (await migration(env).result(url.searchParams.get("reconcile") === "1")) ?? {
            status: "absent",
          },
        );
      if (request.method !== "POST") return noStore(405);
      const grant = await productionGrant(await envelope(request), "migrate", env);
      return noStore(202, await migration(env).runMigration(grant.operationId));
    }
    if (request.method === "POST" && url.pathname === "/__release/activate")
      return noStore(200, await release(env).activate(await envelope(request)));
    if (request.method === "POST" && url.pathname === "/__release/deactivate")
      return noStore(202, await release(env).deactivate(await envelope(request)));
    return noStore(404);
  }
  if (!(await release(env).active())) return noStore(503);
  // An approved web role may resume after idle sleep; uncertain/failed roles still reject.
  await env.MS_REALTY.getByName("web").startWeb();
  return gateway(
    request,
    {
      ...env,
      LEGACY_ROUTES_JSON: acceptedArtifacts.routes,
      PUBLIC_MEDIA_JSON: acceptedArtifacts.media,
    },
    async (input) => {
      if (!(input instanceof Request)) throw new Error("Fixed Container upstream required");
      return env.MS_REALTY.getByName("web").fetch(input);
    },
  );
}
export default {
  async fetch(request: Request, env: ProductionEnv) {
    try {
      return await productionRequest(request, env);
    } catch {
      return noStore(503);
    }
  },
  async scheduled(_event: ScheduledController, env: ProductionEnv) {
    productionContext(env);
    if (
      !acceptedArtifacts.fixture &&
      acceptedArtifacts.sourceCommit === env.BUILD_SHA &&
      (await release(env).active())
    )
      await env.MS_REALTY_WORKER.getByName("queue").startQueue();
  },
};
