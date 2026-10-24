import { cookies } from "next/headers";
import { sidebarPreferenceCookie } from "@/features/shell/navigation-preference";
import { nativeAuthRoute } from "@/server/auth/native";
import { currentStaffAccess, localReturnPath } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { AppError } from "@/server/errors";

export const POST = nativeAuthRoute(
  "staff",
  (locale) => `/${locale}/today`,
  async ({ form, locale }) => {
    if ((await currentStaffAccess()).state !== "ready") throw new AppError("unauthenticated");
    const mode = form.get("mode");
    if (mode !== "compact" && mode !== "expanded") throw new AppError("validation_failed");
    const destination = localReturnPath(String(form.get("returnTo") ?? ""), "staff", locale);
    (await cookies()).set(sidebarPreferenceCookie, mode, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
      secure: getEnv().hosts.staff.startsWith("https:"),
    });
    return destination ?? `/${locale}/today`;
  },
);
