import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { exportJWK } from "jose";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type ArchiveFixture, archiveFixture } from "../src/server/recovery/archive/testing";
import { type Signer, signEvidence } from "./recovery-coordinator-contract";

let directory: string, fixture: ArchiveFixture, runtime: Miniflare | undefined, script: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "msr-r08-native-"));
  fixture = await archiveFixture();
  // This bootstrap exists only in the bundled test harness; the shipped Worker has none.
  const result = await build({
    stdin: {
      contents: `
import { RecoveryCoordinatorCore } from "./gateway/recovery-coordinator-core.ts";
import publicWorker, { RecoveryCoordinator } from "./gateway/recovery-coordinator.ts";
import { importJWK } from "jose";
export class NativeFixture {
 constructor(ctx, env) { this.ctx=ctx; this.env=env; }
 async fetch(request) {
  const e=this.env;
  const signer=JSON.parse(e.SIGNER);
  const core=new RecoveryCoordinatorCore(this.ctx.storage,JSON.parse(e.ADMISSION),JSON.parse(e.FLOOR),JSON.parse(e.TRUST),{keyId:signer.keyId,privateKey:await importJWK(signer.privateKey,"EdDSA")},stage=>{if(stage===e.FAULT)throw new Error("injected failure")});
  if(e.SEED==="yes" && this.ctx.storage.sql.exec("SELECT * FROM archive_head").toArray().length===0) {
   this.ctx.storage.transactionSync(()=>{
    this.ctx.storage.sql.exec("INSERT INTO archive_head(key,value) VALUES(1,?)",e.HEAD);
    this.ctx.storage.sql.exec("INSERT INTO archive_records(kind,key,value) VALUES('head','0000000000000000',?)",e.HEAD);
   });
  }
  try {
   if(new URL(request.url).pathname==="/head")return Response.json(core.readHead());
   if(new URL(request.url).pathname==="/shell") return new RecoveryCoordinator(this.ctx,{RECOVERY_OFFLINE_FIXTURE:"disabled"}).fetch(request);
   if(new URL(request.url).pathname==="/public") return publicWorker.fetch(request);
   if(new URL(request.url).pathname.startsWith("/v1/")) return new RecoveryCoordinator(this.ctx,{
     RECOVERY_OFFLINE_FIXTURE:"enabled", RECOVERY_ADMISSION:e.ADMISSION, RECOVERY_FLOOR:e.FLOOR,
     RECOVERY_TRUST:e.TRUST, RECOVERY_FIXTURE_SIGNER:e.SIGNER
   }).fetch(request);
   return Response.json(await core.execute(await request.text()));
  }catch{return new Response("conflict",{status:409});}
 }
}
export default {fetch(request,env){return env.AUTHORITY.get(env.AUTHORITY.idFromName("offline-fixture")).fetch(request)}};
`,
      resolveDir: resolve("."),
      sourcefile: "r08-native-fixture.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
    external: ["node:crypto"],
  });
  script = result.outputFiles[0]?.text as string;
});
afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
  await rm(directory, { recursive: true, force: true });
});
async function start(seed: boolean, fault = "") {
  await runtime?.dispose();
  const signer = fixture.signers.authority as Signer;
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { AUTHORITY: { className: "NativeFixture", useSQLite: true } },
      resourcePersistencePath: join(directory, "persist"),
      bindings: {
        SEED: seed ? "yes" : "no",
        FAULT: fault,
        ADMISSION: JSON.stringify(fixture.admission),
        FLOOR: JSON.stringify(fixture.floor),
        TRUST: JSON.stringify(fixture.roots),
        HEAD: JSON.stringify(fixture.head),
        SIGNER: JSON.stringify({
          keyId: signer.keyId,
          privateKey: await exportJWK(signer.privateKey),
        }),
      },
    }),
  );
}
async function send(raw: string) {
  return (runtime as Miniflare).dispatchFetch("https://recovery.example.test/command", {
    method: "POST",
    body: raw,
  });
}
async function reserve() {
  const source = await signEvidence(
    "recovery-source",
    fixture.admission.context.sourceInstance,
    fixture.observation,
    fixture.signers.source as Signer,
  );
  expect((await send(await fixture.signed({ operation: "reserve", source }))).status).toBe(200);
}
it("R08 D16/D18 native DO SQLite keeps one CAS winner and its exact lost-ACK receipt across process restart", async () => {
  await start(true);
  await reserve();
  const request = {
    operation: "advance" as const,
    expected: { generation: 0, digest: fixture.head.digest },
  };
  const a = await fixture.signed(request),
    b = await fixture.signed(request);
  const results = await Promise.all([send(a), send(b)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const winner = results[0]?.status === 200 ? a : b;
  // Drop the winner's response. Reopen native workerd and the on-disk SQLite namespace.
  await start(false);
  const replay = await send(winner);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({
    generation: 1,
    currentness: "unknown",
    packet: null,
  });
  expect(
    (await (runtime as Miniflare).dispatchFetch("https://recovery.example.test/shell")).status,
  ).toBe(503);
}, 30000);
for (const fault of ["after_next_state", "after_terminal_receipt", "after_head_update"])
  it(`R08 D17 native SQLite rollback at ${fault} survives restart`, async () => {
    await start(true);
    await reserve();
    await start(false, fault);
    const raw = await fixture.signed({
      operation: "advance",
      expected: { generation: 0, digest: fixture.head.digest },
    });
    expect((await send(raw)).status).toBe(409);
    await start(false);
    const head = await (runtime as Miniflare).dispatchFetch("https://recovery.example.test/head");
    expect(await head.json()).toEqual(fixture.head);
    expect((await send(raw)).status).toBe(200);
  }, 30000);
it("R08 D21 native missing authority stays unknown without test bootstrap", async () => {
  await start(false);
  expect(
    (await (runtime as Miniflare).dispatchFetch("https://recovery.example.test/head")).status,
  ).toBe(409);
}, 30000);
it("R08 D20/D25/D26 native private shell validates origin, method, signature and bounds; public shell stays inactive", async () => {
  await start(true);
  const current = await signEvidence(
    "recovery-command",
    fixture.admission.authority.id,
    {
      contextDigest: fixture.contextDigest,
      authority: fixture.admission.authority,
      challenge: "synthetic-fresh-challenge-1234567890",
      restoreId: "synthetic-restore",
      destinationInstance: "synthetic-destination",
    },
    fixture.signers.command as Signer,
  );
  const good = await (runtime as Miniflare).dispatchFetch(
    `${fixture.admission.origin}/v1/current`,
    { method: "POST", body: current },
  );
  expect(good.status).toBe(200);
  expect(good.headers.get("cache-control")).toBe("no-store");
  const replay = await (runtime as Miniflare).dispatchFetch(
    `${fixture.admission.origin}/v1/current`,
    { method: "POST", body: current },
  );
  expect(replay.status).toBe(409);
  for (const [url, options, status] of [
    [`${fixture.admission.origin}/public`, { method: "POST", body: current }, 503],
    [`${fixture.admission.origin}/v1/bootstrap`, { method: "POST", body: current }, 404],
    [`${fixture.admission.origin}/v1/command`, { method: "GET" }, 404],
    ["https://foreign.example.test/v1/current", { method: "POST", body: current }, 404],
    [`${fixture.admission.origin}/v1/current`, { method: "POST", body: "bad.signature" }, 409],
    [
      `${fixture.admission.origin}/v1/current`,
      { method: "POST", body: "x".repeat(2 * 1024 * 1024 + 1) },
      413,
    ],
  ] as const) {
    expect((await (runtime as Miniflare).dispatchFetch(url, options)).status).toBe(status);
  }
}, 30000);
