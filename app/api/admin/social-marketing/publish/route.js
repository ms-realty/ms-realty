import { renderAppAdminResponse } from "../../../../_ms-realty/admin.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  return renderAppAdminResponse(request);
}
