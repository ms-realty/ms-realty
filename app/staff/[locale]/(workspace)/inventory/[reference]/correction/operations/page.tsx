import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { StaffPage } from "@/features/shell/staff-ui";
import { checkLocale, privateRead } from "@/features/work/screens";
import { staffWorkflowCopy } from "@/features/work/workflow-completion-copy";
import { requireStaffPage } from "@/server/auth/pages";
import { readCorrectionWorkspace } from "@/server/inventory/corrections";
import { findOperation } from "@/server/operations";
import { isIssuedFormOperation } from "@/ui/form/server";
export default async function CorrectionStatus({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, reference } = await params;
  checkLocale(locale);
  const session = await requireStaffPage(locale);
  const query = await searchParams;
  if (
    typeof query.key !== "string" ||
    (query.type !== "open" && query.type !== "reconcile") ||
    !isIssuedFormOperation(`inventory.correction.${query.type}.${reference}`, query.key)
  )
    notFound();
  await privateRead(() => readCorrectionWorkspace(getDb(), session, reference));
  const receipt = await findOperation(
    getDb(),
    session.actor,
    `inventory.correction.${query.type}`,
    query.key,
  );
  const copy = staffWorkflowCopy(locale).correction;
  return (
    <StaffPage title={copy.check} reference={reference}>
      <p>
        {receipt?.status === "succeeded"
          ? copy.saved
          : receipt?.status === "failed"
            ? copy.failed
            : receipt
              ? copy.unknown
              : copy.emptyReceipt}
      </p>
      <a
        data-print-hide
        className="inline-flex min-h-control items-center font-semibold text-link underline"
        href={`/${locale}/inventory/${reference}/correction`}
      >
        {copy.refresh}
      </a>
    </StaffPage>
  );
}
