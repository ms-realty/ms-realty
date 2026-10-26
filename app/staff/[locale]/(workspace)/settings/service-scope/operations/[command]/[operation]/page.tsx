import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { operatingPolicyCopy } from "@/features/operating-policy/copy";
import { serviceStaffCopy } from "@/features/service-intake/copy";
import { StaffPage, StaffPanel } from "@/features/shell/staff-ui";
import { privateRead } from "@/features/work/screens";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { readServiceScopeOperation } from "@/server/service-intake/scope";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; command: string; operation: string }>;
}) {
  const { locale, command, operation } = await params;
  if (
    !isStaffLocale(locale) ||
    (command !== "save" && command !== "approve") ||
    operation.length < 16 ||
    operation.length > 200
  )
    notFound();
  const session = await requireStaffPage(locale),
    c = serviceStaffCopy(locale),
    copy = operatingPolicyCopy(locale);
  const receipt = await privateRead(() =>
    readServiceScopeOperation(getDb(), session, command, operation),
  );
  const result = receipt?.outcome as { version?: number } | undefined;
  return (
    <StaffPage title={c.check} actions={<a href={`/${locale}/settings/service-scope`}>{c.edit}</a>}>
      <StaffPanel
        title={
          receipt?.status === "succeeded" ? (command === "save" ? c.save : c.approve) : c.check
        }
      >
        <p>
          {!receipt
            ? copy.noReceipt
            : receipt.status === "succeeded"
              ? c.lead
              : receipt.status === "failed"
                ? copy.failed
                : copy.pending}
        </p>
        {receipt?.status === "succeeded" ? (
          <p>
            {c.version}: {result?.version}
          </p>
        ) : null}
      </StaffPanel>
    </StaffPage>
  );
}
