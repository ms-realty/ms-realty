// Minimal health check (architecture §19.3 "Operations"): host-neutral, public, no dependency
// or secret detail. Contract: src/server/transport/registry.ts.
import type { HealthResponse } from "@/server/transport/registry";

export function GET() {
  const body: HealthResponse = { status: "ok", build: process.env.BUILD_SHA ?? "dev" };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
