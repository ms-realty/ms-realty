import { renderMcpProtectedResourceMetadata } from "../../../../production/lib/mcp-server.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  return renderMcpProtectedResourceMetadata(request);
}
