import { renderAppWorkspaceSecurityResponse } from "../../../../../_ms-realty/workspace-security.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderAppWorkspaceSecurityResponse(request);
}
