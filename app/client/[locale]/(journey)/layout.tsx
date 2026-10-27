// Client journey shell on the client host (C01–C18). Pages arrive with slice S3.
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import { ClientAccessShell } from "@/features/identity/client-access-shell";
import { JourneyShell } from "@/features/shell/journey-shell";
import { isRoutableLocale } from "@/i18n/config";
import { currentClientSession } from "@/server/auth/pages";

export default async function JourneyLayout({ children, params }: LayoutProps<"/client/[locale]">) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const session = await currentClientSession();
  const [identity] = session
    ? await getDb()
        .select({ name: principals.displayName })
        .from(principals)
        .where(eq(principals.id, session.account.id))
    : [];
  return session ? (
    <JourneyShell locale={locale} accountName={identity?.name}>
      {children}
    </JourneyShell>
  ) : (
    <ClientAccessShell locale={locale}>{children}</ClientAccessShell>
  );
}
