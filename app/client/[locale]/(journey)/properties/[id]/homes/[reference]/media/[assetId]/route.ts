// A cleared photo of a home on the client's own Deal (ADR 0015).
import { requireAuthHost } from "@/server/auth/pages";
import { dealHomeMedia } from "@/server/cases/deal-home";
import { AppError } from "@/server/errors";
import { fileServices } from "@/server/files/config";
import { downloadResponse } from "@/server/files/download";
import { route } from "@/server/http/next";
export const dynamic = "force-dynamic";
export const GET = route(
  async (
    request,
    ctx,
    info: { params: Promise<{ locale: string; id: string; reference: string; assetId: string }> },
  ) => {
    await requireAuthHost("client");
    if (!ctx.session) throw new AppError("unauthenticated");
    const { id, reference, assetId } = await info.params;
    const file = await dealHomeMedia(
      ctx.db,
      fileServices().storage,
      ctx.session,
      id,
      decodeURIComponent(reference),
      assetId,
    );
    return downloadResponse(file, request.headers.get("range"));
  },
  { requireSession: true },
);
