import { requireAuthHost } from "@/server/auth/pages";
import { ownerPreviewMedia } from "@/server/cases/owner-preview";
import { AppError } from "@/server/errors";
import { fileServices } from "@/server/files/config";
import { downloadResponse } from "@/server/files/download";
import { route } from "@/server/http/next";
export const dynamic = "force-dynamic";
export const GET = route(
  async (
    request,
    ctx,
    info: { params: Promise<{ locale: string; id: string; assetId: string }> },
  ) => {
    await requireAuthHost("client");
    if (!ctx.session) throw new AppError("unauthenticated");
    const { id, assetId } = await info.params,
      url = new URL(request.url);
    const file = await ownerPreviewMedia(
      ctx.db,
      fileServices().storage,
      ctx.session,
      id,
      url.searchParams.get("listing") ?? "",
      assetId,
      url.searchParams.get("digest") ?? "",
    );
    return downloadResponse(file, request.headers.get("range"));
  },
  { requireSession: true },
);
