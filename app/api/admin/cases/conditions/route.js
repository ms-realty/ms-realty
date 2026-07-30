import { renderAppAdminResponse } from "../../../../_ms-realty/admin.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderAppAdminResponse(request);
}

export async function POST(request) {
  return renderAppAdminResponse(request);
}
