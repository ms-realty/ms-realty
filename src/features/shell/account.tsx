// The signed-in person in the workspace chrome: the foot of the wide-screen rail and of the X02
// agency tools on phones.
import { InquiryDraftSignOutForm } from "@/features/work/inquiry-draft";
import { cx } from "@/ui/cx";
import { ChevronUpIcon } from "@/ui/icons";

export function AccountIdentity({
  name,
  detail,
  className,
  as = "p",
  truncate = false,
}: {
  name: string;
  detail?: string;
  className?: string;
  as?: "p" | "span";
  truncate?: boolean;
}) {
  const Root = as;
  return (
    <Root className={cx("flex min-w-0 items-center gap-3", className)} data-workspace-account>
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-selected text-dense font-semibold text-brand"
      >
        {initials(name)}
      </span>
      <span className={cx("flex min-w-0 flex-1 flex-col", !truncate && "wrap-anywhere")}>
        <bdi className={cx("text-dense font-semibold text-text", truncate && "truncate")}>
          {name}
        </bdi>
        {detail ? (
          <bdi className={cx("text-caption text-text-muted", truncate && "truncate")}>{detail}</bdi>
        ) : null}
      </span>
    </Root>
  );
}

/** A native POST, so signing out works before and without JavaScript. */
export function SignOutForm({
  locale,
  label,
  className,
}: {
  locale: string;
  label: string;
  className?: string;
}) {
  return (
    <InquiryDraftSignOutForm action={`/${locale}/access/signout`}>
      <button
        type="submit"
        className={className ?? "min-h-control text-compact text-action underline"}
      >
        {label}
      </button>
    </InquiryDraftSignOutForm>
  );
}

/** Personal controls are one native disclosure; agency access remains a separate permitted link. */
export function AccountMenu({
  account,
  locale,
  label,
  settingsLabel,
  manageLabel,
  signOutLabel,
  id,
}: {
  account: { name: string; detail?: string };
  locale: string;
  label: string;
  settingsLabel: string;
  manageLabel?: string;
  signOutLabel: string;
  id: string;
}) {
  const row =
    "flex min-h-control w-full items-center rounded-control px-3 py-2 text-start text-dense text-text no-underline hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  return (
    <details
      data-dismissible=""
      className="group/account relative min-w-0 [&:not([open])>div]:hidden"
    >
      {/* biome-ignore lint/a11y/useSemanticElements: native summary remains the no-JavaScript account disclosure. */}
      <summary
        role="button"
        aria-controls={id}
        aria-label={`${label}: ${account.name}${account.detail ? `, ${account.detail}` : ""}`}
        className="flex min-h-control cursor-pointer list-none items-center gap-2 rounded-control p-2 hover:bg-divider focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus group-open/account:bg-divider [&::-webkit-details-marker]:hidden"
      >
        <span
          className={cx(
            "min-w-0 flex-1",
            "lg:group-data-[sidebar=compact]/shell:[&_[data-workspace-account]>span:last-child]:sr-only",
          )}
        >
          <AccountIdentity {...account} as="span" truncate />
        </span>
        <ChevronUpIcon className="size-4 text-text-muted lg:group-data-[sidebar=compact]/shell:hidden" />
      </summary>
      <div
        id={id}
        className="absolute bottom-full start-0 z-40 mb-2 max-h-[calc(100dvh-6rem)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-panel border border-divider bg-surface p-2 text-text shadow-raised"
      >
        <div className="border-b border-divider px-3 py-3">
          <AccountIdentity {...account} />
        </div>
        <ul className="py-1">
          <li>
            <a className={row} href={`/${locale}/settings`}>
              {settingsLabel}
            </a>
          </li>
          {manageLabel ? (
            <li>
              <a className={row} href={`/${locale}/access/manage`}>
                {manageLabel}
              </a>
            </li>
          ) : null}
        </ul>
        <div className="border-t border-divider pt-1">
          <SignOutForm locale={locale} label={signOutLabel} className={row} />
        </div>
      </div>
    </details>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0]?.toUpperCase() ?? "")
    .join("");
}
