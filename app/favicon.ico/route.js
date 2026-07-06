import { renderAppFaviconResponse } from "../_ms-realty/render.js";

export const revalidate = 86400;

export async function GET() {
  return renderAppFaviconResponse();
}

