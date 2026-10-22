import { notFound, redirect } from "next/navigation";
import { AccessFrame, SignOutForm } from "@/features/identity/access-frame";
import { identityCopy } from "@/features/identity/copy";
import { isStaffLocale } from "@/i18n/config";
import { currentStaffAccess, staffAccessPath } from "@/server/auth/pages";
export default async function DeniedPage({ params }: PageProps<"/staff/[locale]/access/denied">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const access = await currentStaffAccess();
  if (access.state !== "denied") redirect(staffAccessPath(locale, access.state));
  const c = identityCopy(locale);
  return (
    <AccessFrame title={c.deniedTitle} lead={c.deniedBody} standalone>
      <a href="tel:+359879696870" className="text-action underline">
        +359 879 696 870
      </a>
      <SignOutForm action={`/${locale}/access/signout`} label={c.switchAccount} />
    </AccessFrame>
  );
}
