import { renderAppAdminResponse } from "../../../../../_ms-realty/admin.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Byte preview for a reviewer. Unreviewed media is private, so the adapter
// answers with no-store headers and only for an authenticated operator.
export async function GET(request) {
  return renderAppAdminResponse(request);
}
