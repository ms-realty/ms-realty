import { notFound } from "next/navigation";
import { AccessFrame, SignOutForm } from "@/features/identity/access-frame";
import { ceremonyMessages, identityCopy } from "@/features/identity/copy";
import { PasskeyCeremony } from "@/features/identity/passkey-ceremony";
import { isStaffLocale } from "@/i18n/config";
import { localReturnPath, requireStaffPage } from "@/server/auth/pages";
import { beginStaffPasskey, completeStaffReauthentication } from "../actions";
export default async function ReauthPage({
  params,
  searchParams,
}: PageProps<"/staff/[locale]/access/reauth">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  await requireStaffPage(locale);
  const query = await searchParams;
  const returnTo = localReturnPath(
    typeof query.returnTo === "string" ? query.returnTo : null,
    "staff",
    locale,
  );
  const c = identityCopy(locale);
  return (
    <AccessFrame title={c.reauthTitle} lead={c.reauthLead} standalone>
      <PasskeyCeremony
        kind="authenticate"
        begin={beginStaffPasskey}
        complete={completeStaffReauthentication.bind(null, locale, returnTo)}
        messages={ceremonyMessages(c, c.confirmWithPasskey)}
      />
      <SignOutForm action={`/${locale}/access/signout`} label={c.signOut} />
    </AccessFrame>
  );
}
