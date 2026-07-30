import { renderAppAdminResponse } from "../../../../_ms-realty/admin.js";

export async function GET(request) {
  return renderAppAdminResponse(request);
}
