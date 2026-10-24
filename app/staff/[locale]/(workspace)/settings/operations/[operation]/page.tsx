import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { settingsCopy } from "@/features/identity/settings-copy";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { requireStaffPage } from "@/server/auth/pages";
import { readStaffProfileOperation } from "@/server/auth/profile";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";

export default async function ProfileStatusPage({
  params,
}: PageProps<"/staff/[locale]/settings/operations/[operation]">) {
  const { locale, operation: key } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  const operation = await readStaffProfileOperation(getDb(), session, key);
  const copy = settingsCopy(locale);
  const saved = operation?.status === "succeeded" && operation.saved && operation.completedAt;
  const message = !operation
    ? copy.missing
    : saved
      ? copy.saved
      : operation.status === "failed"
        ? copy.failed
        : operation.status === "outcome_unknown"
          ? copy.unknown
          : copy.pending;
  return (
    <div className="mx-auto w-full max-w-reading space-y-6 px-gutter py-10">
      <h1 className="text-page font-semibold">{copy.statusTitle}</h1>
      <Notice tone={saved ? "success" : "info"}>{message}</Notice>
      {saved && operation.saved && operation.completedAt ? (
        <dl className="space-y-4">
          <div>
            <dt className="text-dense text-text-muted">{copy.recordedName}</dt>
            <dd className="font-medium wrap-anywhere">
              <bdi>{operation.saved.displayName}</bdi>
            </dd>
          </div>
          <div>
            <dt className="text-dense text-text-muted">{copy.savedAt}</dt>
            <dd>
              <time dateTime={operation.completedAt.toISOString()}>
                {formatDateTime(locale, operation.completedAt)}
              </time>
            </dd>
          </div>
        </dl>
      ) : null}
      <a href={`/${locale}/settings`} className={buttonClass("secondary")}>
        {copy.currentProfile}
      </a>
    </div>
  );
}
