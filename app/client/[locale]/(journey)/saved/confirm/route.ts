import { cookies } from "next/headers";
import type { PublicLocale } from "@/i18n/config";
import { confirmSavedTransfer, savedContinuationCookie } from "@/server/account-saves/service";
import { nativeAuthRoute } from "@/server/auth/native";
import { currentClientSession } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
export const POST = nativeAuthRoute(
  "client",
  (locale) => `/${locale}/saved/import`,
  async ({ db, form, locale }) => {
    const session = await currentClientSession();
    if (!session) throw new AppError("unauthenticated");
    const nonce = (await cookies()).get(savedContinuationCookie())?.value ?? "";
    await confirmSavedTransfer(
      db,
      session,
      nonce,
      String(form.get("operationId") ?? ""),
      locale as PublicLocale,
    );
    return `/${locale}/saved/import`;
  },
);
