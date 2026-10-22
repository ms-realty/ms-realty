import { permanent, settle } from "./staging-settle.mjs";

/** Observe the started web process on every protected host; never start or retry a command. */
export async function waitForStagingWebHealth(
  input,
  headers,
  { fetcher = fetch, retry = {} } = {},
) {
  return settle(
    async () => {
      const reports = await Promise.all(
        Object.entries(input.origins).map(async ([role, origin]) => {
          const response = await fetcher(`${origin}/api/health`, {
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(20000),
          });
          if (response.status === 401 || response.status === 403)
            throw permanent(`Staging ${role} health access rejected (HTTP ${response.status})`);
          if (!response.ok)
            throw new Error(`Staging ${role} web health unavailable (HTTP ${response.status})`);
          if (!response.headers.get("x-robots-tag")?.includes("noindex"))
            throw permanent(`Staging ${role} health is missing noindex`);
          const health = await response.json();
          if (health.status !== "ok" || health.build !== input.sourceCommit)
            throw permanent(`Staging ${role} web build identity mismatch`);
          return { role, build: health.build, status: health.status };
        }),
      );
      return reports;
    },
    { ms: 180_000, ...retry },
  );
}
