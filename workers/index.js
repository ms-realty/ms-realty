import { Container, getContainer } from "@cloudflare/containers";

// The MS Realty runtime runs inside a container because the app is a real Node
// process that reads the filesystem — the CMS seed, the mirrored legacy media,
// and (for now) the JSONL ledgers. A plain Worker isolate has no filesystem, so
// the container is what makes the app deployable unchanged.
//
// Container disk is ephemeral: on every wake it resets to the image. Read-only
// data (seed, media) is baked in and therefore safe. Mutable state must not
// live here — that migration to Durable Object SQLite is tracked separately.
export class MsRealtyContainer extends Container {
  defaultPort = 8080;

  // Long enough that a visitor after a quiet spell usually hits a warm
  // instance; short enough that an idle night is not billed. Cloudflare bills
  // memory only while awake.
  sleepAfter = "20m";

  // Secrets reach the container through the Worker's env, never the image.
  envVars = {
    NODE_ENV: "production",
    MS_REALTY_TRUST_PROXY: "1",
    MS_REALTY_SESSION_SECRET: this.env.MS_REALTY_SESSION_SECRET ?? "",
    MS_REALTY_ADMIN_OPERATORS_JSON: this.env.MS_REALTY_ADMIN_OPERATORS_JSON ?? "",
    MS_REALTY_LEAD_CONTACT_KEY: this.env.MS_REALTY_LEAD_CONTACT_KEY ?? "",
    PAYLOAD_SECRET: this.env.PAYLOAD_SECRET ?? "",
    DATABASE_URL: this.env.DATABASE_URL ?? "",
  };

  onStart() {
    console.log(JSON.stringify({ kind: "container_started", port: this.defaultPort }));
  }

  onError(error) {
    console.error(JSON.stringify({ kind: "container_error", message: String(error) }));
    throw error;
  }
}

export default {
  async fetch(request, env) {
    // One shared instance: the app keeps in-process state (rate-limit buckets,
    // the stat-validated file cache) that must not be split across instances.
    // Fanning out would silently multiply rate limits and desync the caches.
    return getContainer(env.MS_REALTY, "ms-realty-singleton").fetch(request);
  },
};
