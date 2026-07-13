export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notFound() {
  return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}

export { notFound as DELETE, notFound as GET, notFound as OPTIONS, notFound as PATCH, notFound as POST, notFound as PUT };
