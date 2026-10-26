// O24 command reconciliation rechecks the current actor and scoped settings capability.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { operatingPolicyCopy } from "@/features/operating-policy/copy";
import { StaffPage, StaffPanel } from "@/features/shell/staff-ui";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { readOperatingPolicyOperation } from "@/server/operating-policy/service";

export default async function PolicyOperationPage({
  params,
}: {
  params: Promise<{ locale: string; command: string; operation: string }>;
}) {
  const { locale, command, operation } = await params;
  if (
    !isStaffLocale(locale) ||
    (command !== "save" && command !== "approve") ||
    operation.length > 200
  )
    notFound();
  const session = await requireStaffPage(locale),
    copy = operatingPolicyCopy(locale);
  const receipt =
    operation.length >= 16
      ? await readOperatingPolicyOperation(getDb(), session, command, operation)
      : null;
  const result = receipt?.outcome as { version?: number; policyVersion?: number } | undefined;
  return (
    <StaffPage
      title={copy.receipt}
      actions={
        <a
          className="text-dense text-action hover:underline"
          href={`/${locale}/settings/operating-policy`}
        >
          {copy.reload}
        </a>
      }
    >
      <StaffPanel
        title={
          receipt?.status === "succeeded"
            ? command === "save"
              ? copy.saved
              : copy.approved
            : copy.check
        }
      >
        <p>
          {!receipt
            ? copy.noReceipt
            : receipt.status === "succeeded"
              ? command === "save"
                ? copy.savedNext
                : copy.approvedNext
              : receipt.status === "failed"
                ? copy.failed
                : copy.pending}
        </p>
        {receipt?.status === "succeeded" ? (
          <dl className="mt-4 space-y-2 text-dense">
            <dt>{copy.revision}</dt>
            <dd>{result?.version}</dd>
            {result?.policyVersion ? (
              <>
                <dt>{copy.version}</dt>
                <dd>{result.policyVersion}</dd>
              </>
            ) : null}
            <dt>{copy.technical}</dt>
            <dd className="break-all">
              <bdi>{receipt.operationId}</bdi>
            </dd>
          </dl>
        ) : null}
      </StaffPanel>
    </StaffPage>
  );
}
