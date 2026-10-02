import { exportAppointmentCalendar } from "@/server/appointments/service";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { route } from "@/server/http/next";
export const dynamic = "force-dynamic";
export const GET = route(
  async (_request, ctx, info: { params: Promise<{ locale: string; id: string }> }) => {
    await requireAuthHost("staff");
    if (!ctx.session) throw new AppError("unauthenticated");
    const { id } = await info.params;
    const content = await exportAppointmentCalendar(ctx.db, ctx.session, id);
    return new Response(content, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": "attachment; filename=appointment.ics",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  },
  { requireSession: true },
);
