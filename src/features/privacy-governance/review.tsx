import { type GovernanceDocument, governanceTimer } from "@/domain/privacy-governance";
import { StaffPanel, StaffToolbar } from "@/features/shell/staff-ui";
import type { StaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { GovernanceCopy } from "./copy";

export function GovernanceDocumentView({
  document,
  copy,
  people,
}: {
  document: GovernanceDocument;
  copy: GovernanceCopy;
  people: { id: string; displayName: string }[];
}) {
  const labels = copy.fields as Record<string, string>,
    options = copy.options as Record<string, string>;
  return (
    <dl className="grid min-w-0 gap-3 text-dense sm:grid-cols-2">
      {Object.entries(document)
        .filter(([key]) => key !== "kind")
        .map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="font-medium text-text-muted">{labels[key]}</dt>
            <dd className="whitespace-pre-wrap wrap-anywhere">
              {value === null ? (
                copy.unknown
              ) : key === "ownerId" || key === "determinationById" ? (
                (people.find((person) => person.id === value)?.displayName ?? copy.inactiveOwner)
              ) : options[value] &&
                ["lifecycle", "transferState", "notificationDecision", "responseState"].includes(
                  key,
                ) ? (
                options[value]
              ) : (
                <bdi>{value}</bdi>
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function GovernanceTimer({
  document,
  reviewed,
  locale,
  copy,
  now,
  href,
}: {
  document: GovernanceDocument;
  reviewed: boolean;
  locale: StaffLocale;
  copy: GovernanceCopy;
  now: Date;
  href: string;
}) {
  const timer = governanceTimer(document, reviewed, now);
  return (
    <StaffPanel title={copy.timer.title} lead={copy.timer[timer.state]}>
      {"at" in timer ? (
        <dl className="grid gap-2 text-dense">
          <dt className="font-medium">{copy.timer[timer.kind]}</dt>
          <dd>
            <time dateTime={timer.at}>
              {new Intl.DateTimeFormat(locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: timer.timezone,
                timeZoneName: "short",
              }).format(new Date(timer.at))}
            </time>
          </dd>
          <dt>{copy.timer.timezone}</dt>
          <dd>
            <bdi>{timer.timezone}</bdi>
          </dd>
          <dt>{timer.remainingMs <= 0 ? copy.timer.elapsed : copy.timer.remaining}</dt>
          <dd>
            {new Intl.NumberFormat(locale).format(Math.ceil(Math.abs(timer.remainingMs) / 60000))}
          </dd>
          <dt>{copy.timer.source}</dt>
          <dd className="wrap-anywhere">{timer.source ?? copy.unknown}</dd>
        </dl>
      ) : null}
      <StaffToolbar>
        <span>
          {copy.timer.checked}{" "}
          <time dateTime={now.toISOString()}>{formatDateTime(locale, now)}</time>
        </span>
        <a className="text-action hover:underline" href={href}>
          {copy.timer.refresh}
        </a>
      </StaffToolbar>
    </StaffPanel>
  );
}
