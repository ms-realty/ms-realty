// O26/F30: immutable saved or reviewed source; current authority is rechecked on every read.
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { governancePageSession } from "@/features/privacy-governance/access";
import { governanceCopy } from "@/features/privacy-governance/copy";
import { GovernanceDocumentView } from "@/features/privacy-governance/review";
import { StaffPage, StaffPanel } from "@/features/shell/staff-ui";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { isAppError } from "@/server/errors";
import { readGovernanceRevision } from "@/server/privacy-governance/service";
export default async function GovernanceRevisionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; version: string }>;
}) {
  const { locale, id, version } = await params;
  if (
    !isStaffLocale(locale) ||
    !z.uuid().safeParse(id).success ||
    !/^[1-9]\d*$/.test(version) ||
    !Number.isSafeInteger(Number(version))
  )
    notFound();
  const path = `/${locale}/operations/privacy-governance/${id}`,
    copy = governanceCopy(locale),
    session = await governancePageSession(locale, `${path}/versions/${version}`);
  if (!session)
    return (
      <StaffPage title={copy.title} lead={copy.denied}>
        <a href={`/${locale}/settings`}>{copy.settings}</a>
      </StaffPage>
    );
  const row = await readGovernanceRevision(getDb(), session, id, Number(version)).catch(
    (error: unknown) => {
      if (isAppError(error) && error.code === "not_found") notFound();
      throw error;
    },
  );
  return (
    <StaffPage
      title={`${copy.version} ${version}`}
      lead={row.action === "reviewed" ? copy.reviewed : copy.saved}
      actions={
        <a className="text-action hover:underline" href={path}>
          {copy.reload}
        </a>
      }
    >
      <StaffPanel title={row.document.title}>
        <GovernanceDocumentView document={row.document} copy={copy} people={row.people} />
        <dl className="mt-5 grid gap-2 text-dense">
          <dt>{copy.actor}</dt>
          <dd>
            <bdi>{row.actorName}</bdi>
          </dd>
          <dt>{copy.recordedAt}</dt>
          <dd>
            <time dateTime={row.recordedAt.toISOString()}>
              {formatDateTime(locale, row.recordedAt)}
            </time>
          </dd>
          <dt>{copy.hash}</dt>
          <dd className="break-all">
            <bdi>{row.contentHash}</bdi>
          </dd>
          {row.note ? (
            <>
              <dt>{copy.note}</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere">{row.note}</dd>
            </>
          ) : null}
        </dl>
      </StaffPanel>
    </StaffPage>
  );
}
