export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const locale = new URL(request.url).searchParams.get("locale");
  const query = new URLSearchParams();
  if (locale) query.set("locale", locale);
  const suffix = query.toString();
  // Keep this relative so a reverse proxy cannot leak the container's
  // internal host/port into the operator's browser.
  return new Response(null, {
    status: 307,
    headers: { location: `/admin/today${suffix ? `?${suffix}` : ""}` },
  });
}
