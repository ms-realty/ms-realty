// O26/F30: reconcile the exact actor/record/command/key without executing anything.
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { governancePageSession } from "@/features/privacy-governance/access";
import { governanceCopy } from "@/features/privacy-governance/copy";
import { StaffPage, StaffPanel } from "@/features/shell/staff-ui";
import { isStaffLocale } from "@/i18n/config";
import { isAppError } from "@/server/errors";
import { readGovernanceOperation } from "@/server/privacy-governance/service";
export default async function GovernanceOperationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; command: string; operation: string }>;
}) {
  const { locale, id, command, operation } = await params;
  if (
    !isStaffLocale(locale) ||
    !z.uuid().safeParse(id).success ||
    (command !== "save" && command !== "review") ||
    operation.length > 200
  )
    notFound();
  const path = `/${locale}/operations/privacy-governance/${id}`,
    copy = governanceCopy(locale),
    session = await governancePageSession(
      locale,
      `${path}/operations/${command}/${encodeURIComponent(operation)}`,
    );
  if (!session)
    return (
      <StaffPage title={copy.title} lead={copy.denied}>
        <a href={`/${locale}/settings`}>{copy.settings}</a>
      </StaffPage>
    );
  let receipt: Awaited<ReturnType<typeof readGovernanceOperation>> = null;
  try {
    receipt =
      operation.length >= 16
        ? await readGovernanceOperation(getDb(), session, id, command, operation)
        : null;
  } catch (error) {
    if (isAppError(error) && error.code === "forbidden")
      return (
        <StaffPage title={copy.receipt} lead={copy.qualifiedRequired}>
          <a href={path}>{copy.reload}</a>
        </StaffPage>
      );
    throw error;
  }
  const result = receipt?.outcome as {
    version?: number;
    contentHash?: string;
    recordedAt?: string;
  } | null;
  return (
    <StaffPage
      title={copy.receipt}
      actions={
        <a className="text-action hover:underline" href={path}>
          {copy.reload}
        </a>
      }
    >
      <StaffPanel
        title={
          receipt?.status === "succeeded"
            ? command === "save"
              ? copy.saved
              : copy.reviewed
            : copy.check
        }
      >
        <p>
          {!receipt
            ? copy.absent
            : receipt.status === "succeeded"
              ? command === "save"
                ? copy.savedNext
                : copy.reviewedNext
              : receipt.status === "failed"
                ? copy.failed
                : copy.pending}
        </p>
        {receipt?.status === "succeeded" ? (
          <dl className="mt-4 grid gap-2 text-dense">
            <dt>{copy.version}</dt>
            <dd>{result?.version}</dd>
            <dt>{copy.hash}</dt>
            <dd className="break-all">
              <bdi>{result?.contentHash}</bdi>
            </dd>
            <dt>{copy.recordId}</dt>
            <dd className="break-all">
              <bdi>{id}</bdi>
            </dd>
          </dl>
        ) : null}
      </StaffPanel>
    </StaffPage>
  );
}
