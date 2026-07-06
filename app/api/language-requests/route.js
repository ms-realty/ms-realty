import { renderAppApiResponse } from "../../_ms-realty/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  return renderAppApiResponse(request);
}
