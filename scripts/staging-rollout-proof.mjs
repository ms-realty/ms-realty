const bindingsByRole = {
  web: "MS_REALTY",
  worker: "MS_REALTY_WORKER",
  migrator: "MS_REALTY_MIGRATOR",
};
const statesByRole = {
  web: ["running"],
  worker: ["prepared", "running"],
  migrator: ["prepared", "running", "completed"],
};
const roles = Object.keys(bindingsByRole),
  hex = (length) => new RegExp(`^[a-f0-9]{${length}}$`);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const demand = (condition, label) => {
  if (!condition) throw new Error(`Staging rollout observation failed: ${label}`);
};
const identifier = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const timestamp = (value, now) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) <= now &&
  new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);

export function validateRuntimeIdentity(input, runtime, { allowPreparedWeb = false } = {}) {
  demand(
    object(input) && hex(32).test(input.accountId ?? "") && identifier(input.workerName),
    "account and Worker identity",
  );
  demand(hex(40).test(input.sourceCommit ?? ""), "immutable source SHA");
  demand(
    typeof input.image === "string" &&
      new RegExp(
        `^registry\\.cloudflare\\.com/${input.accountId}/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$`,
      ).test(input.image),
    "full immutable image digest reference",
  );
  demand(runtime?.schemaVersion === 1 && object(runtime.roles), "runtime identity schema");
  let nonce;
  const actors = new Set();
  for (const role of roles) {
    const evidence = runtime.roles[role];
    demand(
      object(evidence) &&
        evidence.schemaVersion === 1 &&
        evidence.role === role &&
        (statesByRole[role].includes(evidence.state) ||
          (role === "web" && allowPreparedWeb && evidence.state === "prepared")) &&
        evidence.sourceCommit === input.sourceCommit &&
        hex(64).test(evidence.actorId ?? ""),
      `${role} immutable source and actor identity`,
    );
    demand(
      typeof evidence.buildNonce === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          evidence.buildNonce,
        ),
      `${role} immutable build nonce`,
    );
    nonce ??= evidence.buildNonce;
    demand(
      evidence.buildNonce === nonce && !actors.has(evidence.actorId),
      "shared build nonce and distinct actors",
    );
    actors.add(evidence.actorId);
  }
}

/** Only fixed-origin provider GETs create observations; caller labels never attest a deployment. */
export async function observeRuntimeRollout(
  input,
  runtime,
  token,
  transport = fetch,
  options = {},
) {
  validateRuntimeIdentity(input, runtime, options);
  demand(
    typeof token === "string" && token.length > 0 && !/[\r\n]/.test(token),
    "provider credential available",
  );
  const root = `/accounts/${input.accountId}`,
    base = `${root}/containers/applications`;
  const started = Date.now(),
    deadline = started + 120_000;
  async function read(path, cursor) {
    demand(Date.now() < deadline, "bounded provider observation time");
    const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
    if (cursor !== undefined) url.searchParams.set("page_token", cursor);
    let response, body;
    try {
      response = await transport(url.href, {
        method: "GET",
        redirect: "error",
        headers: { Authorization: ["Bearer", token].join(" ") },
        signal: AbortSignal.timeout(Math.min(15_000, deadline - Date.now())),
      });
      demand(response?.ok === true && response.redirected !== true, "provider HTTP response");
      body = await response.json();
    } catch {
      demand(false, "provider request could not be verified");
    }
    demand(
      object(body) &&
        body.success === true &&
        Array.isArray(body.errors) &&
        body.errors.length === 0 &&
        body.result !== undefined,
      "provider response envelope",
    );
    return body;
  }
  async function pages(path) {
    const values = [],
      seen = new Set();
    let cursor;
    for (let page = 0; page < 50; page++) {
      const body = await read(path, cursor);
      demand(
        Array.isArray(body.result) && body.result.every(object) && object(body.result_info),
        "complete cursor list shape",
      );
      values.push(...body.result);
      demand(values.length <= 10_000, "bounded provider inventory");
      const next = body.result_info.next_page_token;
      if (next === undefined) return values;
      demand(
        typeof next === "string" && next.length > 0 && next.length <= 2048 && !seen.has(next),
        "advancing pagination cursor",
      );
      seen.add(next);
      cursor = next;
    }
    demand(false, "provider cursor inventory incomplete");
  }
  const settings = (
    await read(`${root}/workers/scripts/${encodeURIComponent(input.workerName)}/settings`)
  ).result;
  demand(
    object(settings) && Array.isArray(settings.bindings) && settings.bindings.every(object),
    "Worker binding shape",
  );
  const namespaces = new Set(),
    namespaceByRole = {};
  for (const role of roles) {
    const matches = settings.bindings.filter((binding) => binding.name === bindingsByRole[role]);
    demand(
      matches.length === 1 &&
        matches[0].type === "durable_object_namespace" &&
        hex(32).test(matches[0].namespace_id ?? ""),
      `${role} exact actor binding`,
    );
    const namespace = matches[0].namespace_id;
    demand(!namespaces.has(namespace), "distinct role namespaces");
    namespaces.add(namespace);
    namespaceByRole[role] = namespace;
  }
  const applications = await pages(base),
    observations = [];
  for (const role of roles) {
    const matches = applications.filter(
      (app) => app.durable_objects?.namespace_id === namespaceByRole[role],
    );
    demand(matches.length === 1, `${role} unique namespace application`);
    const app = matches[0];
    demand(
      identifier(app.id) &&
        app.account_id === input.accountId &&
        app.scheduling_policy === "default" &&
        app.configuration?.image === input.image &&
        Number.isInteger(app.version) &&
        app.version > 0 &&
        identifier(app.active_rollout_id),
      `${role} digest-pinned scheduled application`,
    );
    const appPath = `${base}/${encodeURIComponent(app.id)}`;
    const rollout = (await read(`${appPath}/rollouts/${encodeURIComponent(app.active_rollout_id)}`))
      .result;
    demand(
      object(rollout) &&
        rollout.id === app.active_rollout_id &&
        rollout.status === "completed" &&
        rollout.version === app.version &&
        rollout.target_configuration?.image === input.image &&
        timestamp(rollout.completed_at, Date.now()),
      `${role} completed exact-version rollout`,
    );
    const instances = await pages(`${appPath}/instances-v2`),
      actorId = runtime.roles[role].actorId;
    const instanceIds = new Set();
    for (const instance of instances) {
      const state = instance.status?.state;
      demand(
        hex(64).test(instance.id ?? "") &&
          !instanceIds.has(instance.id) &&
          instance.application_id === app.id &&
          [
            "provisioning",
            "running",
            "failed",
            "stopping",
            "stopped",
            "unhealthy",
            "inactive",
          ].includes(state) &&
          timestamp(instance.status?.updated_at, Date.now()),
        `${role} known application instance state`,
      );
      instanceIds.add(instance.id);
      if (!["stopped", "inactive"].includes(state))
        demand(
          state === "running" && instance.image === input.image,
          `${role} all live instances run expected digest`,
        );
    }
    const actor = instances.filter((instance) => instance.id === actorId);
    demand(
      actor.length === 1 &&
        actor[0].status.state === "running" &&
        actor[0].image === input.image &&
        timestamp(actor[0].started_at, Date.now()),
      `${role} running exact actor digest coverage`,
    );
    observations.push({
      role,
      actorId,
      namespaceId: namespaceByRole[role],
      applicationId: app.id,
      rolloutId: rollout.id,
      applicationVersion: app.version,
      rolloutVersion: rollout.version,
      image: actor[0].image,
      state: actor[0].status.state,
      startedAt: actor[0].started_at,
      statusUpdatedAt: actor[0].status.updated_at,
      completedAt: rollout.completed_at,
      buildNonce: runtime.roles[role].buildNonce,
    });
  }
  return {
    schemaVersion: 1,
    status: "observed",
    observedAt: new Date().toISOString(),
    sourceCommit: input.sourceCommit,
    observedDigest: input.image.split("@")[1],
    roles: observations,
  };
}
