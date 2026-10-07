import { z } from "zod";
import { getDb } from "@/db/client";
import { getEnv } from "@/server/config/env";
import { fileServices } from "@/server/files/config";
import { downloadResponse, privateDownload } from "@/server/files/download";
import {
  correlationIdFrom,
  errorResponse,
  hostContextOf,
  identify,
  requireSession,
} from "@/server/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reviewPreviewScope = z.object({ listingId: z.uuid(), locale: z.literal("bg") });
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const values = await params;
  const env = getEnv();
  const context = hostContextOf(request.headers, env);
  if (
    !z.uuid().safeParse(values.id).success ||
    !["media", "document"].includes(values.kind) ||
    (context !== "staff" && context !== "client")
  )
    return new Response(null, { status: 404 });
  const query = new URL(request.url).searchParams;
  const preview = query.get("preview") === "1";
  const scoped = query.has("listing") || query.has("locale");
  const scope = scoped
    ? reviewPreviewScope.safeParse({ listingId: query.get("listing"), locale: query.get("locale") })
    : null;
  if (scoped && (values.kind !== "media" || !preview || !scope?.success))
    return new Response(null, { status: 404 });
  try {
    const db = getDb();
    const session = requireSession(await identify(db, request.headers, env));
    const file = await privateDownload(
      db,
      fileServices().storage,
      session,
      values.kind as "media" | "document",
      values.id,
      preview,
      scope?.success ? scope.data : undefined,
    );
    return downloadResponse(file, request.headers.get("range"));
  } catch (error) {
    return errorResponse(error, correlationIdFrom(request.headers));
  }
}
