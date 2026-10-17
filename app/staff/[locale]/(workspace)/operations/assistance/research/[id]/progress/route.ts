// O32 / F29: read-only live progress; retained source access is rechecked by readWorkspace.
import { z } from "zod";
import { projectWorkspaceProgress } from "@/features/ai/workspace-progress";
import { isStaffLocale } from "@/i18n/config";
import { readWorkspace } from "@/server/ai/workspace";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { route } from "@/server/http/next";

type ProgressParams = { params: Promise<{ locale: string; id: string }> };

const readProgress = route(
  async (_request, ctx, info: ProgressParams) => {
    await requireAuthHost("staff");
    if (!ctx.session) throw new AppError("unauthenticated");
    const { locale, id } = await info.params;
    if (!isStaffLocale(locale) || !z.uuid().safeParse(id).success) throw new AppError("not_found");
    const view = await readWorkspace(ctx.db, ctx.session, id);
    return Response.json(projectWorkspaceProgress(view));
  },
  { requireSession: true },
);

export async function GET(request: Request, info: ProgressParams) {
  const response = await readProgress(request, info);
  // The error path is private too; access loss and failures must never be cached.
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}
