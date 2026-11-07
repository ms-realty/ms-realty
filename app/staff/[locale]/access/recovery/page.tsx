import { notFound } from "next/navigation";
import { AccessFrame } from "@/features/identity/access-frame";
import { identityCopy } from "@/features/identity/copy";
import { brandPhone } from "@/features/shell/agency";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
export default async function RecoveryPage({
  params,
}: PageProps<"/staff/[locale]/access/recovery">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  await requireAuthHost("staff");
  const c = identityCopy(locale);
  return (
    <AccessFrame title={c.recoveryTitle} lead={c.recoveryBody} standalone>
      <p>{c.recoveryNoCodes}</p>
      <a href={`tel:${brandPhone.e164}`} className="text-action underline">
        {brandPhone.display}
      </a>
      <a href={`/${locale}/access`} className="text-action underline">
        {c.backToSignIn}
      </a>
    </AccessFrame>
  );
}
