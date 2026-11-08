import { observeRuntimeRollout } from "../../scripts/staging-rollout-proof.mjs";
import { accountId, sha256 } from "./execution-parity.mjs";
import { canonical } from "./execution-production.mjs";

const maximumBytes = 2 * 1024 * 1024;
const failure = () => new Error("Execution runtime observation failed");
const demand = (condition) => {
  if (!condition) throw failure();
};
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (value) =>
  typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const hexId = (value) => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
const sort = (values) => [...values].sort((a, b) => canonical(a).localeCompare(canonical(b), "en"));
const stateIdentity = (state) => ({
  accountId: state.accountId,
  zones: sort(
    state.zones.map((zone) => ({ ...zone, dns: sort(zone.dns), routes: sort(zone.routes) })),
  ),
});
const normalizedRoute = (value) => {
  demand(
    object(value) &&
      hexId(value.id) &&
      typeof value.pattern === "string" &&
      value.pattern.length > 0 &&
      value.pattern.length <= 2048 &&
      !/[\r\n]/.test(value.pattern) &&
      (value.script == null || /^[a-z0-9_-]{1,63}$/.test(value.script)),
  );
  return { id: value.id, pattern: value.pattern, script: value.script ?? null };
};
const dnsRecord = (value) =>
  Object.fromEntries(
    ["id", "name", "type", "content", "priority", "proxied", "ttl", "data", "settings"]
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );

// Cancellation is best-effort cleanup, never another unbounded provider await.
function cancel(body) {
  try {
    body?.cancel().catch(() => {});
  } catch {
    // The body may already be closed or locked by a cancelled read.
  }
}

/** Read-only runtime receipt. It neither installs trust nor proves any launch gate. */
export async function observeExecutionRuntime(
  plan,
  runtime,
  token,
  { transport = fetch, now = Date.now, maximumMs = 15_000, expectedBaseline } = {},
) {
  let timer;
  const controller = new AbortController();
  const readers = new Set();
  const stop = () => {
    controller.abort();
    for (const reader of readers) cancel(reader);
  };
  try {
    demand(typeof transport === "function" && typeof now === "function");
    demand(Number.isFinite(maximumMs) && maximumMs > 0);
    const budget = Math.min(15_000, maximumMs);
    const started = now();
    const wallStarted = Date.now();
    demand(Number.isFinite(started));
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        stop();
        reject(failure());
      }, budget);
    });
    function check() {
      const at = now();
      if (
        controller.signal.aborted ||
        !Number.isFinite(at) ||
        at < started ||
        at - started >= budget ||
        Date.now() - wallStarted >= budget
      ) {
        stop();
        throw failure();
      }
      return at;
    }
    async function within(read) {
      check();
      const value = await Promise.race([
        Promise.resolve().then(() => {
          check();
          return read();
        }),
        expired,
      ]);
      check();
      return value;
    }

    // Capture immutable pins before the first provider await. No input URL, header or key
    // selects an endpoint or installs trust; only the externally supplied token is used.
    const pins = {
      accountId: plan?.accountId,
      sourceCommit: plan?.sourceCommit,
      digest: plan?.digest,
      image: plan?.image,
      workerName: plan?.workerName,
      gatewayVersionId: plan?.gatewayVersionId,
      gatewayDeploymentId: plan?.gatewayDeploymentId,
    };
    demand(pins.accountId === accountId && /^[a-f0-9]{40}$/.test(pins.sourceCommit ?? ""));
    demand(pins.workerName === `ms-realty-production-${pins.sourceCommit.slice(0, 12)}`);
    demand(uuid(pins.gatewayVersionId) && uuid(pins.gatewayDeploymentId));
    demand(
      typeof pins.image === "string" &&
        /^sha256:[a-f0-9]{64}$/.test(pins.digest ?? "") &&
        new RegExp(`^registry\\.cloudflare\\.com/${accountId}/[a-z0-9._-]+@${pins.digest}$`).test(
          pins.image,
        ),
    );
    demand(typeof token === "string" && token.length > 0 && !/[\r\n]/.test(token));
    const identity = structuredClone(runtime);
    const baseline = expectedBaseline === undefined ? undefined : structuredClone(expectedBaseline);
    if (baseline !== undefined) {
      demand(
        object(baseline) &&
          baseline.accountId === accountId &&
          Array.isArray(baseline.zones) &&
          baseline.zones.length === 2 &&
          baseline.zones.every(
            (zone) =>
              object(zone) &&
              hexId(zone.id) &&
              zone.accountId === accountId &&
              zone.status === "active" &&
              zone.ssl === "strict" &&
              Array.isArray(zone.routes) &&
              Array.isArray(zone.dns),
          ) &&
          new Set(baseline.zones.map((zone) => zone.id)).size === 2 &&
          canonical(baseline.zones.map((zone) => zone.name).sort()) ===
            canonical(["makler-realty.com", "makler-realty.ru"]) &&
          baseline.zones.find((zone) => zone.name === "makler-realty.com").id ===
            "f0ac7af0721419e8129e5d10ff547372",
      );
    }
    const root = `/client/v4/accounts/${accountId}`;
    const worker = `${root}/workers/scripts/${pins.workerName}`;
    const applicationPath = new RegExp(
      `^${root}/containers/applications(?:/[A-Za-z0-9_-]{1,128}(?:/(?:rollouts|instances-v2))?)?$`,
    );
    const zonePaths = new Set(
      (baseline?.zones ?? []).flatMap((zone) =>
        ["", "/workers/routes", "/dns_records", "/settings/ssl"].map(
          (suffix) => `/client/v4/zones/${zone.id}${suffix}`,
        ),
      ),
    );

    async function readJson(response) {
      check();
      demand(
        response?.ok === true &&
          response.redirected !== true &&
          response.status >= 200 &&
          response.status < 300,
      );
      const contentLength = response.headers.get("content-length");
      demand(
        contentLength === null ||
          (/^\d+$/.test(contentLength) && Number(contentLength) <= maximumBytes),
      );
      const reader = response.body.getReader();
      readers.add(reader);
      let complete = false;
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        let text = "";
        for (;;) {
          const { done, value } = await within(() => reader.read());
          if (done) break;
          demand(value instanceof Uint8Array);
          bytes += value.byteLength;
          demand(bytes <= maximumBytes);
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        check();
        const body = JSON.parse(text);
        check();
        demand(
          object(body) &&
            body.success === true &&
            Array.isArray(body.errors) &&
            body.errors.length === 0 &&
            body.result !== undefined,
        );
        complete = true;
        return body;
      } finally {
        if (!complete) cancel(reader);
        readers.delete(reader);
        reader.releaseLock();
      }
    }

    async function boundedTransport(input, options) {
      check();
      const url = new URL(input);
      demand(
        url.origin === "https://api.cloudflare.com" &&
          !url.username &&
          !url.password &&
          !url.hash &&
          (url.pathname === `${worker}/settings` ||
            url.pathname === `${worker}/deployments` ||
            applicationPath.test(url.pathname) ||
            zonePaths.has(url.pathname)) &&
          options?.method === "GET" &&
          options.redirect === "error" &&
          options.body === undefined,
      );
      // Do not forward caller/provider headers or the delegated per-request timeout.
      // Every request and response shares this observation's single shorter deadline.
      const response = await within(() =>
        Promise.resolve(
          transport(url.href, {
            method: "GET",
            redirect: "error",
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
        ).then((value) => {
          try {
            check();
            return value;
          } catch {
            cancel(value?.body);
            throw failure();
          }
        }),
      );
      let body;
      try {
        demand(!response.url || response.url === url.href);
        body = await readJson(response);
      } catch {
        cancel(response?.body);
        throw failure();
      }
      check();
      return {
        ok: true,
        redirected: false,
        json: async () => {
          check();
          return body;
        },
      };
    }

    async function read(path) {
      const response = await boundedTransport(`https://api.cloudflare.com${path}`, {
        method: "GET",
        redirect: "error",
      });
      return within(() => response.json());
    }

    async function observeBaseline() {
      if (baseline === undefined) return {};
      const zones = [];
      for (const expected of baseline.zones) {
        const path = `/client/v4/zones/${expected.id}`;
        const zone = (await read(path)).result;
        demand(
          object(zone) &&
            zone.id === expected.id &&
            zone.name === expected.name &&
            zone.account?.id === accountId &&
            zone.status === "active",
        );
        const routePacket = await read(`${path}/workers/routes`);
        const routePages = routePacket.result_info?.total_pages ?? 1;
        demand(
          Array.isArray(routePacket.result) &&
            routePacket.result.length <= 1000 &&
            (routePacket.result_info === undefined || object(routePacket.result_info)) &&
            routePages === 1 &&
            (routePacket.result_info?.page === undefined || routePacket.result_info.page === 1) &&
            (routePacket.result_info?.total_count === undefined ||
              routePacket.result_info.total_count === routePacket.result.length),
        );
        const routes = routePacket.result.map(normalizedRoute);
        demand(
          new Set(routes.map((route) => route.id)).size === routes.length &&
            new Set(routes.map((route) => route.pattern)).size === routes.length,
        );
        const records = [];
        let totalRecords, totalPages;
        for (let page = 1; ; page++) {
          const packet = await read(`${path}/dns_records?per_page=1000&page=${page}`);
          demand(
            Array.isArray(packet.result) &&
              packet.result.length <= 1000 &&
              packet.result.every(object) &&
              object(packet.result_info) &&
              packet.result_info.page === page &&
              Number.isInteger(packet.result_info.total_pages) &&
              packet.result_info.total_pages >= 1 &&
              packet.result_info.total_pages <= 10 &&
              Number.isInteger(packet.result_info.total_count) &&
              packet.result_info.total_count >= 0 &&
              packet.result_info.total_count <= 10_000,
          );
          totalRecords ??= packet.result_info.total_count;
          totalPages ??= packet.result_info.total_pages;
          demand(
            totalRecords === packet.result_info.total_count &&
              totalPages === packet.result_info.total_pages,
          );
          records.push(...packet.result.map(dnsRecord));
          if (page === totalPages) break;
        }
        demand(
          records.length === totalRecords &&
            new Set(records.map((record) => record.id)).size === records.length &&
            records.every(
              (record) =>
                hexId(record.id) &&
                typeof record.name === "string" &&
                typeof record.type === "string" &&
                typeof record.content === "string" &&
                Number.isInteger(record.ttl),
            ),
        );
        const ssl = (await read(`${path}/settings/ssl`)).result;
        demand(object(ssl) && ssl.id === "ssl" && ssl.value === "strict");
        zones.push({
          id: zone.id,
          name: zone.name,
          accountId: zone.account.id,
          status: zone.status,
          ssl: ssl.value,
          dns: records,
          routes,
        });
      }
      const observed = canonical(stateIdentity({ accountId, zones }));
      demand(observed === canonical(stateIdentity(baseline)));
      check();
      return { observedStateSha256: sha256(observed) };
    }

    async function observe() {
      const observation = await within(() =>
        observeRuntimeRollout(pins, identity, token, boundedTransport),
      );
      const baselineObservation = await within(observeBaseline);
      const deployments = [];
      let totalPages;
      for (let page = 1; ; page++) {
        const body = await read(`${worker}/deployments?per_page=100&page=${page}`);
        const pages =
          body.result_info?.total_pages === undefined ? 1 : body.result_info.total_pages;
        demand(
          object(body.result) &&
            (body.result_info === undefined || object(body.result_info)) &&
            Array.isArray(body.result.deployments) &&
            body.result.deployments.length <= 100 &&
            Number.isInteger(pages) &&
            pages >= 1 &&
            pages <= 10 &&
            (totalPages === undefined || pages === totalPages),
        );
        totalPages = pages;
        deployments.push(...body.result.deployments);
        if (page === totalPages) break;
      }
      const at = check();
      demand(
        deployments.length > 0 &&
          deployments.every(
            (row) =>
              object(row) &&
              uuid(row.id) &&
              typeof row.created_on === "string" &&
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(row.created_on) &&
              Number.isFinite(Date.parse(row.created_on)) &&
              Date.parse(row.created_on) <= at,
          ),
      );
      const ordered = deployments.sort(
        (a, b) => Date.parse(b.created_on) - Date.parse(a.created_on),
      );
      const latest = ordered[0];
      demand(
        (ordered.length === 1 ||
          Date.parse(latest.created_on) > Date.parse(ordered[1].created_on)) &&
          latest.id === pins.gatewayDeploymentId &&
          Array.isArray(latest.versions) &&
          latest.versions.length === 1 &&
          object(latest.versions[0]) &&
          latest.versions[0].version_id === pins.gatewayVersionId &&
          latest.versions[0].percentage === 100,
      );
      return {
        ...observation,
        ...baselineObservation,
        observedAt: new Date(check()).toISOString(),
        image: pins.image,
        workerName: pins.workerName,
        gateway: {
          deploymentId: latest.id,
          versionId: latest.versions[0].version_id,
          createdOn: latest.created_on,
          percentage: latest.versions[0].percentage,
        },
      };
    }
    const observation = await within(observe);
    check();
    return observation;
  } catch {
    // Neither provider bodies nor transport/body exceptions can become a credential echo.
    throw failure();
  } finally {
    clearTimeout(timer);
    stop();
  }
}
