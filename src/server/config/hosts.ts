// One application, three hosts (architecture §11.1, §8.1): public `makler-realty.com`, client
// `my.makler-realty.com`, staff `app.makler-realty.com`. proxy.ts rewrites every page request
// to the route tree of its host (app/public, app/client, app/staff), so a route of one host is
// never reachable from another. No "server-only" import: proxy.ts reads this module.

export const hostContexts = ["public", "client", "staff"] as const;
export type HostContext = (typeof hostContexts)[number];
/** The hosts that hold a private session; the public host never receives either cookie. */
export type PrivateHostContext = Exclude<HostContext, "public">;

export type HostOrigins = Readonly<Record<HostContext, string>>;

const variables: Record<HostContext, string> = {
  public: "PUBLIC_ORIGIN",
  client: "CLIENT_ORIGIN",
  staff: "STAFF_ORIGIN",
};

/** Browsers resolve `*.localhost` to loopback, so local runs need no DNS or hosts file. */
const localHostnames: Record<HostContext, string> = {
  public: "localhost",
  client: "my.localhost",
  staff: "app.localhost",
};

/**
 * Where a host context starts when a URL names only the locale (`/` or `/{locale}`).
 * ponytail: the client home is access until C03 `/cases` exists (slice S3).
 */
export const homePaths: Readonly<Record<HostContext, string>> = {
  public: "",
  client: "/access",
  staff: "/today",
};

/**
 * The three origins from the environment. Unset means the local default on the running port
 * (`next start` sets PORT). Throws, naming only the variable, on a value that is not a bare
 * http(s) origin or on two contexts sharing a host.
 */
export function parseHostOrigins(source: Record<string, string | undefined>): HostOrigins {
  const port = source.PORT?.trim() || "3000";
  const entries = hostContexts.map((context) => {
    const name = variables[context];
    const raw = source[name]?.trim();
    if (!raw) return [context, `http://${localHostnames[context]}:${port}`] as const;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`Invalid host configuration: ${name} is not a URL`);
    }
    const bare = url.pathname === "/" && !url.search && !url.hash && !url.username;
    if (!/^https?:$/.test(url.protocol) || !bare) {
      throw new Error(`Invalid host configuration: ${name} must be a bare http(s) origin`);
    }
    return [context, url.origin] as const;
  });
  const origins = Object.fromEntries(entries) as Record<HostContext, string>;
  const hosts = new Set(hostContexts.map((context) => new URL(origins[context]).host));
  if (hosts.size !== hostContexts.length) {
    throw new Error("Invalid host configuration: PUBLIC, CLIENT and STAFF origins must differ");
  }
  return origins;
}

let cached: HostOrigins | undefined;

/** The process's host origins, validated once on first use. */
export function hostOrigins(): HostOrigins {
  cached ??= parseHostOrigins(process.env);
  return cached;
}

/** The context a request Host header (`name[:port]`) belongs to, or null for any other host. */
export function hostContextFor(
  host: string | null | undefined,
  origins: HostOrigins = hostOrigins(),
): HostContext | null {
  if (!host) return null;
  const normalized = host.trim().toLowerCase();
  return hostContexts.find((context) => new URL(origins[context]).host === normalized) ?? null;
}

/** `www.` in front of the public host: answered by a permanent redirect to the apex. */
export function isPublicWwwHost(host: string | null | undefined, origins = hostOrigins()): boolean {
  return Boolean(host) && host?.trim().toLowerCase() === `www.${new URL(origins.public).host}`;
}
