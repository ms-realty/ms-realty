import { renderAppAdminResponse } from "../../../_ms-realty/admin.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  return renderAppAdminResponse(request);
}
