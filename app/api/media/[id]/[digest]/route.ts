import { z } from "zod";
import { getDb } from "@/db/client";
import { getEnv } from "@/server/config/env";
import { fileServices } from "@/server/files/config";
import { downloadResponse, publicMediaDownload } from "@/server/files/download";
import { hostContextOf } from "@/server/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; digest: string }> },
) {
  const { id, digest } = await params;
  if (
    hostContextOf(request.headers, getEnv()) !== "public" ||
    !z.uuid().safeParse(id).success ||
    !/^[a-f0-9]{64}$/.test(digest)
  )
    return new Response(null, { status: 404 });
  try {
    const file = await publicMediaDownload(getDb(), fileServices().storage, id, digest);
    return downloadResponse(file, request.headers.get("range"));
  } catch {
    // A missing object, retired manifest or failed dependency never exposes private identity.
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
}
