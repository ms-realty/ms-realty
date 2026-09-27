// The three hosts of the one app (architecture §11.1) as the e2e server serves them. Browsers
// resolve `*.localhost` to loopback, so no DNS or hosts file is needed. A describe block
// targets a host with `test.use({ baseURL: origins.staff })`, or a test passes `hostUrl()`.

export const e2ePort = Number(process.env.E2E_PORT ?? 3100);

export const origins = {
  public: `http://localhost:${e2ePort}`,
  client: `http://my.localhost:${e2ePort}`,
  staff: `http://app.localhost:${e2ePort}`,
} as const;

export type HostContext = keyof typeof origins;

/** Absolute URL of `path` on one host. */
export function hostUrl(context: HostContext, path: string): string {
  return new URL(path, origins[context]).toString();
}
