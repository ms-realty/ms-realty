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

export function isDepartingWorkspacePrefetch(
  request: WorkspacePrefetchFailure,
  departingPage: string | null,
  staffOrigin: string,
): boolean {
  if (
    !departingPage ||
    request.referer !== departingPage ||
    (request.error !== "Load request cancelled" && request.error !== "cancelled") ||
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
