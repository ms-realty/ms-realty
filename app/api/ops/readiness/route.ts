// Operations readiness on the staff host (architecture §19.3; AT67): release identity and the
// R00–R12 gate summary for staff holding `report.read`. Contract: src/server/transport/registry.ts.
import { route } from "@/server/http/next";
import { loadReadinessSnapshot, readReadiness } from "@/server/ops/readiness";
import type { ReadinessResponse } from "@/server/transport/registry";

export const GET = route(
  async (_request, ctx) => {
    const body: ReadinessResponse = await readReadiness(ctx.db, ctx.actor, {
      buildSha: process.env.BUILD_SHA?.trim() || null,
      snapshot: await loadReadinessSnapshot(),
    });
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  },
  { requireSession: true },
);
