import { renderMcpResponse } from "../../production/lib/mcp-server.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  return renderMcpResponse(request);
}

export async function POST(request) {
  return renderMcpResponse(request);
}

export async function DELETE(request) {
  return renderMcpResponse(request);
}
