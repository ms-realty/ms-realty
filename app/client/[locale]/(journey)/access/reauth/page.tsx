import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { principals } from "@/db/schema";
import { AccessFrame } from "@/features/identity/access-frame";
import { identityCopy } from "@/features/identity/copy";
import { isRoutableLocale } from "@/i18n/config";
import { currentClientSession, localReturnPath } from "@/server/auth/pages";
import { buttonClass } from "@/ui/button-class";

export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function ClientReauthPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string; sent?: string }>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const query = await searchParams;
  const returnTo = localReturnPath(query.returnTo, "client", locale) ?? `/${locale}/overview`;
  const session = await currentClientSession();
  if (!session) redirect(`/${locale}/access?returnTo=${encodeURIComponent(returnTo)}`);
  const [account] = await getDb()
    .select({ email: principals.email })
    .from(principals)
    .where(eq(principals.id, session.account.id));
  const copy = identityCopy(locale);
  return (
    <AccessFrame
      title={query.sent === "1" ? copy.linkSentTitle : copy.reauthTitle}
      lead={query.sent === "1" ? copy.linkSent : copy.clientReauthLead}
    >
      <form action={`/${locale}/access/reauth/request`} method="post" className="grid gap-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <p>
          {copy.emailLabel}: <bdi>{account?.email ?? ""}</bdi>
        </p>
        <button type="submit" className={buttonClass()}>
          {copy.sendLink}
        </button>
      </form>
      <a href={`/${locale}/access`} className="underline">
        {copy.clientAccessTitle}
      </a>
    </AccessFrame>
  );
}
