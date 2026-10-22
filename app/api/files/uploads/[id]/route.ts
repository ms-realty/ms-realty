import { z } from "zod";
import { getDb } from "@/db/client";
import { getEnv } from "@/server/config/env";
import { AppError } from "@/server/errors";
import { fileServices } from "@/server/files/config";
import { finalizeUpload, receiveUpload, verifyUploadRequest } from "@/server/files/uploads";
import {
  assertSameOrigin,
  correlationIdFrom,
  errorResponse,
  hostContextOf,
  identify,
  requireSession,
} from "@/server/http/request";
import { getJobQueue } from "@/server/jobs/web";

export const runtime = "nodejs";
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const env = getEnv();
  const context = hostContextOf(request.headers, env);
  if (!z.uuid().safeParse(id).success || (context !== "staff" && context !== "client"))
    return new Response(null, { status: 404 });
  try {
    assertSameOrigin(request.headers, env.hosts[context]);
    const db = getDb();
    const session = requireSession(await identify(db, request.headers, env));
    const token = request.headers.get("x-upload-token") ?? "";
    const { maxBytes } = await verifyUploadRequest(db, session, id, token);
    if (Number(request.headers.get("content-length")) > maxBytes)
      throw new AppError("validation_failed");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("validation_failed");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > maxBytes) throw new AppError("validation_failed");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    const services = fileServices();
    await receiveUpload(db, services, session, {
      uploadId: id,
      token,
      bytes: Buffer.concat(chunks),
    });
    const result = await finalizeUpload(db, services, session, id, await getJobQueue());
    return Response.json(
      { ...result, state: "sealed", next: "scanning" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, correlationIdFrom(request.headers));
  }
}
