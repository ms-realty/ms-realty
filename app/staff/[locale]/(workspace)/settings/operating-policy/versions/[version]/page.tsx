// O24: stable access to an exact approved edition, including history outside the recent list.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { operatingPolicySchema } from "@/domain/operating-policy";
import { operatingPolicyCopy } from "@/features/operating-policy/copy";
import { PolicyEffects, PolicyReview } from "@/features/operating-policy/review";
import { StaffPage, StaffPanel } from "@/features/shell/staff-ui";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
import { readOperatingPolicy, readOperatingPolicyVersion } from "@/server/operating-policy/service";

export default async function PolicyVersionPage({
  params,
}: {
  params: Promise<{ locale: string; version: string }>;
}) {
  const { locale, version } = await params;
  if (!isStaffLocale(locale) || !/^[1-9]\d{0,8}$/.test(version)) notFound();
  const session = await requireStaffPage(locale),
    db = getDb(),
    copy = operatingPolicyCopy(locale);
  try {
    const [edition, model] = await Promise.all([
      readOperatingPolicyVersion(db, session, Number(version)),
      readOperatingPolicy(db, session),
    ]);
    const document = operatingPolicySchema.safeParse(edition.document);
    if (!document.success) notFound();
    return (
      <StaffPage
        title={`${copy.version} ${edition.policyVersion}`}
        lead={formatDateTime(locale, edition.approvedAt)}
        actions={
          <a
            href={`/${locale}/settings/operating-policy`}
            className="text-dense text-action hover:underline"
          >
            {copy.reload}
          </a>
        }
      >
        <StaffPanel title={copy.active}>
          <PolicyReview document={document.data} copy={copy} owners={model.owners} />
          <p className="mt-5 whitespace-pre-wrap text-dense">{edition.approvalNote}</p>
        </StaffPanel>
        <StaffPanel title={copy.effects}>
          <PolicyEffects document={document.data} copy={copy} />
        </StaffPanel>
      </StaffPage>
    );
  } catch (error) {
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) notFound();
    throw error;
  }
}
