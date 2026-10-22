import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { observeRuntimeRollout, prepareRuntimeRollout } from "./staging-rollout-proof.mjs";

// Injected provider responses are contract fixtures, never live launch evidence.
function fixture() {
  const accountId = "a".repeat(32),
    sourceCommit = "b".repeat(40),
    ephemeral = randomUUID();
  const image = `registry.cloudflare.com/${accountId}/ms-realty-staging@sha256:${"c".repeat(64)}`;
  const input = { accountId, workerName: "ms-realty-staging", sourceCommit, image };
  const runtime = { schemaVersion: 1, roles: {} },
    documents = new Map(),
    calls = [];
  const root = `/accounts/${accountId}`,
    base = `${root}/containers/applications`;
  const bindings = [],
    apps = [],
    // Live Cloudflare timestamps carry nanosecond fractions.
    completedAt = new Date(Date.now() - 1_000).toISOString().replace(/Z$/, "000064Z");
  const buildNonce = randomUUID();
  for (const [index, role] of ["web", "worker", "migrator"].entries()) {
    const actorId = String(index + 1).repeat(64),
      namespaceId = String(index + 1).repeat(32);
    runtime.roles[role] = {
      schemaVersion: 1,
      actorId,
      sourceCommit,
      role,
      buildNonce,
      state: { web: "running", worker: "prepared", migrator: "completed" }[role],
    };
    bindings.push({
      name: ["MS_REALTY", "MS_REALTY_WORKER", "MS_REALTY_MIGRATOR"][index],
      type: "durable_object_namespace",
      namespace_id: namespaceId,
    });
    const app = {
      id: `app-${role}`,
      account_id: accountId,
      durable_objects: { namespace_id: namespaceId },
      scheduling_policy: "default",
      configuration: { image },
      version: 2,
      // Cloudflare clears active_rollout_id once the rollout completes.
      active_rollout_id: null,
    };
    // The list and the application's own read share one object unless a test splits them.
    apps.push(app);
    documents.set(`${base}/app-${role}`, { result: app });
    // Shape of GET .../rollouts as observed live: no result_info, versions as current/target.
    documents.set(`${base}/app-${role}/rollouts`, {
      result: [
        {
          id: `rollout-${role}`,
          status: "completed",
          kind: "full_auto",
          current_version: 1,
          target_version: 2,
          target_configuration: { image },
          last_updated_at: completedAt,
        },
      ],
    });
    documents.set(`${base}/app-${role}/instances-v2`, {
      result: [
        {
          id: actorId,
          application_id: `app-${role}`,
          image,
          status: { state: "running", updated_at: completedAt },
          started_at: completedAt,
        },
      ],
      result_info: {},
    });
  }
  documents.set(`${root}/workers/scripts/${input.workerName}/settings`, { result: { bindings } });
  documents.set(base, { result: apps, result_info: {} });
  const transport = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.cloudflare.com");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, ["Bearer", ephemeral].join(" "));
    calls.push(parsed.pathname + parsed.search);
    const key = parsed.pathname.replace("/client/v4", ""),
      cursor = parsed.searchParams.get("page_token");
    const document = documents.get(cursor ? `${key}?page_token=${cursor}` : key);
    return {
      ok: Boolean(document),
      redirected: false,
      json: async () => ({ success: true, errors: [], ...structuredClone(document) }),
    };
  };
  return { input, runtime, documents, calls, transport, apps, base, bindings, ephemeral };
}
const observe = (f) => observeRuntimeRollout(f.input, f.runtime, f.ephemeral, f.transport);

test("prepares identities again when a provider rollout stops the prepared actors", async () => {
  const f = fixture();
  let preparations = 0,
    at = 0;
  f.runtime.roles.web.state = "prepared";
  const stopped = f.documents.get(`${f.base}/app-web/instances-v2`).result[0];
  const { runtime, observation } = await prepareRuntimeRollout(
    f.input,
    async () => {
      preparations++;
      stopped.status.state = "running";
      return structuredClone(f.runtime);
    },
    f.ephemeral,
    {
      allowPreparedWeb: true,
      transport: async (url, options) => {
        // The deployment can stop a prepared actor after its identity endpoint returns.
        if (preparations === 1) stopped.status.state = "inactive";
        return f.transport(url, options);
      },
      retry: {
        ms: 10_000,
        every: 5_000,
        now: () => at,
        wait: async (ms) => {
          at += ms;
        },
        log: () => {},
      },
    },
  );
  assert.equal(preparations, 2);
  assert.equal(at, 5_000);
  assert.deepEqual(runtime, f.runtime);
  assert.equal(observation.status, "observed");
  assert.equal(observation.roles[0].actorId, stopped.id);
});

test("preparation never substitutes for provider proof of a running actor", async () => {
  const f = fixture();
  let preparations = 0,
    at = 0;
  f.documents.get(`${f.base}/app-web/instances-v2`).result[0].status.state = "inactive";
  await assert.rejects(
    prepareRuntimeRollout(
      f.input,
      async () => {
        preparations++;
        return f.runtime;
      },
      f.ephemeral,
      {
        transport: f.transport,
        retry: {
          ms: 10_000,
          every: 5_000,
          now: () => at,
          wait: async (ms) => {
            at += ms;
          },
          log: () => {},
        },
      },
    ),
    /web running exact actor digest coverage/,
  );
  assert.equal(preparations, 3);
});

test("returns provider observation only after all three actors and completed rollouts match", async () => {
  const f = fixture(),
    result = await observe(f);
  assert.equal(result.status, "observed");
  assert.equal(result.sourceCommit, f.input.sourceCommit);
  assert.equal(result.observedDigest, `sha256:${"c".repeat(64)}`);
  assert.deepEqual(
    result.roles.map((role) => role.role),
    ["web", "worker", "migrator"],
  );
  assert.equal(result.roles[1].actorId, f.runtime.roles.worker.actorId);
  assert.equal(result.roles[1].namespaceId, "2".repeat(32));
  assert.equal(f.calls.length, 11);
  assert.equal("PASS" in result, false);
});
test("accepts a newly created application, which Cloudflare records without a rollout", async () => {
  const f = fixture();
  for (const app of f.apps) {
    app.version = 1;
    f.documents.set(`${f.base}/${app.id}/rollouts`, { result: [] });
  }
  const result = await observe(f);
  assert.deepEqual(
    result.roles.map((role) => [role.applicationVersion, role.rolloutId, role.rolloutVersion]),
    [
      [1, null, null],
      [1, null, null],
      [1, null, null],
    ],
  );
});
test("trusts the application's own read over a stale list snapshot", async () => {
  const f = fixture();
  f.apps[2] = {
    ...structuredClone(f.apps[2]),
    version: 1,
    configuration: { image: "registry.cloudflare.com/old@sha256:previous" },
    active_rollout_id: "rollout-migrator",
  };
  assert.equal((await observe(f)).roles[2].applicationVersion, 2);
});
test("accepts a completed rollout that is still reported as active", async () => {
  const f = fixture();
  f.apps[0].active_rollout_id = "rollout-web";
  assert.equal((await observe(f)).roles[0].rolloutId, "rollout-web");
});
test("fully follows application and instance cursor pages", async () => {
  const f = fixture(),
    app = f.documents.get(f.base);
  f.documents.set(`${f.base}?page_token=apps-next`, {
    result: app.result.splice(2),
    result_info: {},
  });
  app.result_info.next_page_token = "apps-next";
  const key = `${f.base}/app-web/instances-v2`,
    instances = f.documents.get(key);
  f.documents.set(`${key}?page_token=instances-next`, {
    result: instances.result.splice(0),
    result_info: {},
  });
  instances.result_info.next_page_token = "instances-next";
  assert.equal((await observe(f)).roles.length, 3);
  assert(f.calls.some((url) => url.includes("page_token=apps-next")));
  assert(f.calls.some((url) => url.includes("page_token=instances-next")));
});

const failures = {
  "old image tag": (f) => {
    f.documents.get(`${f.base}/app-web/instances-v2`).result[0].image =
      "registry.cloudflare.com/old:latest";
  },
  "old image in the application's own read": (f) => {
    f.documents.get(`${f.base}/app-worker`).result = {
      ...structuredClone(f.apps[1]),
      configuration: { image: "old:latest" },
    };
  },
  "application read for another namespace": (f) => {
    f.documents.get(`${f.base}/app-web`).result = {
      ...structuredClone(f.apps[0]),
      durable_objects: { namespace_id: "9".repeat(32) },
    };
  },
  "configured tag": (f) => {
    f.apps[0].configuration.image = "old:latest";
  },
  "incomplete cursor": (f) => {
    f.documents.get(f.base).result_info.next_page_token = "missing";
  },
  "repeated cursor": (f) => {
    const doc = f.documents.get(f.base);
    doc.result_info.next_page_token = "loop";
    f.documents.set(`${f.base}?page_token=loop`, doc);
  },
  "missing pagination shape": (f) => {
    delete f.documents.get(f.base).result_info;
  },
  "no completed rollout": (f) => {
    f.documents.get(`${f.base}/app-web/rollouts`).result[0].status = "progressing";
  },
  "later version without a rollout": (f) => {
    f.documents.set(`${f.base}/app-web/rollouts`, { result: [] });
  },
  "rollout still active for another version": (f) => {
    f.apps[0].active_rollout_id = "rollout-next";
  },
  "new application with a rollout in progress": (f) => {
    f.apps[0].version = 1;
    f.apps[0].active_rollout_id = "rollout-next";
    f.documents.set(`${f.base}/app-web/rollouts`, { result: [] });
  },
  "pending rollout to a later version without an active ID": (f) => {
    f.documents.get(`${f.base}/app-web/rollouts`).result.push({
      id: "rollout-next",
      status: "progressing",
      current_version: 2,
      target_version: 3,
      target_configuration: { image: "old:latest" },
      last_updated_at: new Date(Date.now() - 1_000).toISOString(),
    });
  },
  "new application with only a progressing rollout": (f) => {
    f.apps[1].version = 1;
    f.documents.set(`${f.base}/app-worker/rollouts`, {
      result: [
        {
          id: "rollout-worker-next",
          status: "progressing",
          current_version: 1,
          target_version: 2,
          target_configuration: { image: "old:latest" },
          last_updated_at: new Date(Date.now() - 1_000).toISOString(),
        },
      ],
    });
  },
  "reverted rollout to the current version": (f) => {
    f.documents.get(`${f.base}/app-migrator/rollouts`).result[0].status = "reverted";
  },
  "replaced rollout to the current version": (f) => {
    f.documents.get(`${f.base}/app-web/rollouts`).result[0].status = "replaced";
  },
  "wrong rollout version": (f) => {
    f.documents.get(`${f.base}/app-web/rollouts`).result[0].target_version = 1;
  },
  "two rollouts to the current version": (f) => {
    const list = f.documents.get(`${f.base}/app-web/rollouts`).result;
    list.push({ ...list[0], id: "rollout-again" });
  },
  "missing rollout list": (f) => {
    f.documents.set(`${f.base}/app-web/rollouts`, { result: null });
  },
  "wrong target digest": (f) => {
    f.documents.get(`${f.base}/app-web/rollouts`).result[0].target_configuration.image =
      "old:latest";
  },
  "invalid completion timestamp": (f) => {
    f.documents.get(`${f.base}/app-web/rollouts`).result[0].last_updated_at = "tomorrow";
  },
  "missing actor binding": (f) => {
    f.bindings.shift();
  },
  "wrong namespace": (f) => {
    f.apps[0].durable_objects.namespace_id = "9".repeat(32);
  },
  "duplicate namespace application": (f) => {
    f.apps.push({ ...f.apps[0], id: "duplicate" });
  },
  "wrong immutable source": (f) => {
    f.runtime.roles.worker.sourceCommit = "d".repeat(40);
  },
  "invalid source SHA": (f) => {
    f.input.sourceCommit = "main";
  },
  "invalid actor ID": (f) => {
    f.runtime.roles.web.actorId = "named-actor";
  },
  "missing role schema": (f) => {
    delete f.runtime.roles.worker.schemaVersion;
  },
  "unknown role schema": (f) => {
    f.runtime.roles.migrator.schemaVersion = 2;
  },
  "prepared web process": (f) => {
    f.runtime.roles.web.state = "prepared";
  },
  "failed queue process": (f) => {
    f.runtime.roles.worker.state = "failed";
  },
  "failed migrator process": (f) => {
    f.runtime.roles.migrator.state = "failed";
  },
  "unknown role state": (f) => {
    f.runtime.roles.web.state = "unknown";
  },
  "missing role state": (f) => {
    delete f.runtime.roles.worker.state;
  },
  "completed queue process": (f) => {
    f.runtime.roles.worker.state = "completed";
  },
  "missing build nonce": (f) => {
    delete f.runtime.roles.web.buildNonce;
  },
  "different build nonce": (f) => {
    f.runtime.roles.worker.buildNonce = randomUUID();
  },
  "unsupported scheduling policy": (f) => {
    f.apps[0].scheduling_policy = "durable_object";
  },
  "missing actor instance": (f) => {
    f.documents.get(`${f.base}/app-web/instances-v2`).result = [];
  },
  "wrong application instance": (f) => {
    f.documents.get(`${f.base}/app-web/instances-v2`).result[0].application_id = "other-app";
  },
  "unknown instance state": (f) => {
    f.documents.get(`${f.base}/app-web/instances-v2`).result[0].status.state = "unknown";
  },
  "non-running required actor": (f) => {
    f.documents.get(`${f.base}/app-web/instances-v2`).result[0].status.state = "stopped";
  },
  "old image on another live actor": (f) => {
    const instances = f.documents.get(`${f.base}/app-web/instances-v2`).result;
    instances.push({ ...instances[0], id: "9".repeat(64), image: "old:latest" });
  },
};
for (const [name, change] of Object.entries(failures))
  test(`rejects ${name}`, async () => {
    const f = fixture();
    change(f);
    await assert.rejects(observe(f), /Staging rollout observation failed/);
  });
test("provider transport failures do not expose credentials or provider error bodies", async () => {
  const f = fixture();
  await assert.rejects(
    observeRuntimeRollout(f.input, f.runtime, f.ephemeral, async () => {
      throw new Error(f.ephemeral);
    }),
    (error) => !error.message.includes(f.ephemeral),
  );
});
