// B10 / AT10 / AT11 / AT40: HTTP and native forms share the same guarded commands.
import { type AgencyCommand, agencyCommands } from "@/features/agency-obligations/contract";
import { executeAgencyCommand } from "@/server/agency-obligations/commands";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { route } from "@/server/http/next";
export const POST = route(
  async (request, ctx, { params }: { params: Promise<{ command: string }> }) => {
    const { command } = await params;
    if (!Object.hasOwn(agencyCommands, command)) throw new AppError("not_found");
    const context = command === "clientConsent" ? "client" : "staff";
    await requireAuthHost(context);
    if (ctx.session?.account.kind !== context) throw new AppError("unauthenticated");
    const result = await executeAgencyCommand(
      ctx.db,
      ctx.session,
      command as AgencyCommand,
      await request.json(),
    );
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  },
  { requireSession: true },
);
