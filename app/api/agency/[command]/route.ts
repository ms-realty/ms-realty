// B10 / AT10 / AT11 / AT40: HTTP and native forms share the same guarded commands.
import { executeAgencyCommand } from "@/server/agency-obligations/commands";
import { agencyCommandSchema } from "@/server/agency-obligations/transport-schema";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { route } from "@/server/http/next";
export const POST = route(
  async (request, ctx, { params }: { params: Promise<{ command: string }> }) => {
    const parsed = agencyCommandSchema.safeParse((await params).command);
    if (!parsed.success) throw new AppError("not_found");
    const command = parsed.data;
    const context = command === "clientConsent" ? "client" : "staff";
    await requireAuthHost(context);
    if (ctx.session?.account.kind !== context) throw new AppError("unauthenticated");
    if (
      request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
    )
      throw new AppError("validation_failed");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("validation_failed");
    }
    const result = await executeAgencyCommand(ctx.db, ctx.session, command, body);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  },
  { requireSession: true },
);
