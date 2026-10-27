// O30: ordinary Case grants and continuation; no service operator capability is invented.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { CaseScreen } from "@/features/cases/screens";
import { serviceStaffCopy } from "@/features/service-intake/copy";
import { privateRead } from "@/features/work/screens";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { caseFor } from "@/server/cases/shared";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  const { row } = await privateRead(() => caseFor(getDb(), session, id));
  if (row.kind !== "service_intake") notFound();
  return (
    <>
      <a
        className="inline-flex min-h-control items-center px-gutter underline"
        href={`/${locale}/operations/consultations`}
      >
        {serviceStaffCopy(locale).return}
      </a>
      {await privateRead(() => CaseScreen({ locale, session, id }))}
    </>
  );
}
