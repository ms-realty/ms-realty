export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function payloadAdminLoginRedirect(request) {
  return Response.redirect(new URL("/payload-admin/login", request.url), 303);
}

export function GET(request) {
  return payloadAdminLoginRedirect(request);
}

export function POST(request) {
  // 303 deliberately discards a legacy operator-token form body instead of
  // replaying it to Payload. The canonical login accepts email/password only.
  return payloadAdminLoginRedirect(request);
}
