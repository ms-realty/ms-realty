import { renderAppRobotsResponse } from "../_ms-realty/render.js";

export const revalidate = 300;

export async function GET() {
  return renderAppRobotsResponse();
}
