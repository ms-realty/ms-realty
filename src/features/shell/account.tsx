// The signed-in person in the workspace chrome: the foot of the wide-screen rail and of the X02
// agency tools on phones.
import { InquiryDraftSignOutForm } from "@/features/work/inquiry-draft";
import { cx } from "@/ui/cx";

export function AccountIdentity({
  name,
  detail,
  className,
}: {
  name: string;
  detail?: string;
  className?: string;
}) {
  return (
    <p className={cx("flex min-w-0 items-start gap-2.5", className)} data-workspace-account>
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-selected text-dense font-semibold text-brand"
      >
        {initials(name)}
      </span>
      <span className="flex min-w-0 flex-col wrap-anywhere">
        <span className="text-operational font-medium text-text">{name}</span>
        {detail ? <span className="text-caption text-text-muted">{detail}</span> : null}
      </span>
    </p>
  );
}

/** A native POST, so signing out works before and without JavaScript. */
export function SignOutForm({ locale, label }: { locale: string; label: string }) {
  return (
    <InquiryDraftSignOutForm action={`/${locale}/access/signout`}>
      <button type="submit" className="min-h-control text-compact text-action underline">
        {label}
      </button>
    </InquiryDraftSignOutForm>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
