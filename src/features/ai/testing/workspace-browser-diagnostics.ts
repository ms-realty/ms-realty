// Browser-test diagnostics only; never imported by the application.
export type WorkspacePrefetchFailure = {
  error: string | undefined;
  method: string;
  resourceType: string;
  url: string;
  referer: string | undefined;
  rsc: string | undefined;
  prefetch: string | undefined;
};

export type WorkspaceObservedRscRequest = Omit<WorkspacePrefetchFailure, "error"> & {
  status: number | null;
  finished: boolean;
  failure: string | null;
};
export type WorkspacePageError = { name: string; message: string; stack: string | undefined };
export type WorkspaceNavigationPrefetchPageError = {
  error: WorkspacePageError;
  departingPage: string;
  requests: WorkspaceObservedRscRequest[];
};

export function classifyWorkspaceNavigationPrefetchPageError(
  browserName: string,
  error: WorkspacePageError,
  requests: WorkspaceObservedRscRequest[],
  departingPage: string | null,
  staffOrigin: string,
): WorkspaceNavigationPrefetchPageError | null {
  if (browserName !== "webkit" || !departingPage || !error.stack) return null;
  const [summary, frame] = error.stack.split("\n");
  const prefix = "Fetch API cannot load ";
  const suffix = " due to access control checks.";
  if (!summary?.startsWith(prefix) || !summary.endsWith(suffix) || !frame?.startsWith("    at "))
    return null;
  const url = summary.slice(prefix.length, -suffix.length);
  try {
    const target = new URL(url);
    const frameTail = frame.split("(" + staffOrigin + "/_next/static/chunks/")[1];
    if (
      target.origin !== staffOrigin ||
      error.name !== prefix + target.protocol.slice(0, -1) ||
      error.message !== "/" + target.host + target.pathname + target.search + suffix ||
      !frameTail ||
      !/^[a-zA-Z0-9_-]+\.js:\d+:\d+\)$/.test(frameTail)
    )
      return null;
  } catch {
    return null;
  }
  const matching = requests.filter((request) => request.url === url);
  if (
    matching.length === 0 ||
    matching.some(
      (request) =>
        request.status !== 200 ||
        !request.finished ||
        request.failure !== null ||
        !matchesWorkspacePrefetch(request, departingPage, staffOrigin),
    )
  )
    return null;
  return {
    error: { ...error },
    departingPage,
    requests: matching.map((request) => ({ ...request })),
  };
}

export function isDepartingWorkspacePrefetch(
  request: WorkspacePrefetchFailure,
  departingPage: string | null,
  staffOrigin: string,
): boolean {
  return (
    (request.error === "Load request cancelled" || request.error === "cancelled") &&
    matchesWorkspacePrefetch(request, departingPage, staffOrigin)
  );
}

function matchesWorkspacePrefetch(
  request: Omit<WorkspacePrefetchFailure, "error">,
  departingPage: string | null,
  staffOrigin: string,
): boolean {
  if (
    !departingPage ||
    request.referer !== departingPage ||
    request.method !== "GET" ||
    request.resourceType !== "fetch" ||
    request.rsc !== "1" ||
    request.prefetch !== "1"
  )
    return false;
  try {
    const target = new URL(request.url);
    return (
      target.origin === staffOrigin &&
      new URL(departingPage).origin === staffOrigin &&
      target.searchParams.has("_rsc")
    );
  } catch {
    return false;
  }
}
