import { z } from "zod";
import { getDb } from "@/db/client";
import { getEnv } from "@/server/config/env";
import { fileServices } from "@/server/files/config";
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
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.contentType,
        "cache-control": "private, no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error, correlationIdFrom(request.headers));
  }
}
