import { z } from "zod";
import { getDb } from "@/db/client";
import { getEnv } from "@/server/config/env";
import { fileServices } from "@/server/files/config";
import { downloadResponse } from "@/server/files/download";
import {
  correlationIdFrom,
  errorResponse,
  hostContextOf,
  identify,
  requireSession,
} from "@/server/http/request";
import { readInquiryPhoto } from "@/server/inquiries/attachments";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  const { id } = await params;
  if (hostContextOf(request.headers, env) !== "staff" || !z.uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  try {
    const db = getDb();
    const file = await readInquiryPhoto(
      db,
      fileServices(),
      requireSession(await identify(db, request.headers, env)),
      id,
    );
    return downloadResponse(
      { ...file, fileName: "inquiry-photo", inline: true },
      request.headers.get("range"),
    );
  } catch (error) {
    return errorResponse(error, correlationIdFrom(request.headers));
  }
}
