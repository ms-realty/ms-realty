export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const target = new URL("/admin/today", request.url);
  const locale = new URL(request.url).searchParams.get("locale");
  if (locale) target.searchParams.set("locale", locale);
  return Response.redirect(target, 307);
}
