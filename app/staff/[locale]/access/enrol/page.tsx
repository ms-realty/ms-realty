import { notFound, redirect } from "next/navigation";
import { AccessFrame, SignOutForm } from "@/features/identity/access-frame";
import { ceremonyMessages, fill, identityCopy } from "@/features/identity/copy";
import { PasskeyCeremony } from "@/features/identity/passkey-ceremony";
import { settingsCopy } from "@/features/identity/settings-copy";
import { StaffSettingsFrame } from "@/features/identity/staff-settings-frame";
import { isStaffLocale } from "@/i18n/config";
import { currentStaffAccess, staffAccessPath } from "@/server/auth/pages";
import { enrolmentWindowMs } from "@/server/auth/passkeys";
import { isFresh } from "@/server/auth/sessions";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { beginStaffPasskeyRegistration, completeStaffPasskeyRegistration } from "../actions";
export default async function EnrolPage({ params }: PageProps<"/staff/[locale]/access/enrol">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const access = await currentStaffAccess();
  if (access.state !== "enrolling" && access.state !== "ready")
    redirect(staffAccessPath(locale, access.state));
  const c = identityCopy(locale);
  const ready = access.state === "ready";
  const now = new Date();
  const registration = (
    <PasskeyCeremony
      kind="register"
      begin={beginStaffPasskeyRegistration}
      complete={completeStaffPasskeyRegistration}
      variant={ready ? "secondary" : "primary"}
      messages={ceremonyMessages(c, ready ? c.registerBackupPasskey : c.registerPasskey, {
        label: true,
        stepUp: ready ? c.enrolBackupReauth : c.enrolWindowClosed,
        ...(ready ? { success: c.passkeyAdded } : {}),
      })}
    />
  );
  if (ready)
    return (
      <StaffSettingsFrame
        locale={locale}
        session={access.session}
        backHref={`/${locale}/settings?section=security`}
        title={settingsCopy(locale).security}
        lead={c.enrolBackupLead}
      >
        <Notice tone="success">{c.enrolDone}</Notice>
        <a className={buttonClass("secondary")} href={`/${locale}/today`}>
          {c.continueToWorkspace}
        </a>
        {isFresh(access.session, now) ? (
          registration
        ) : (
          <>
            <Notice tone="info">{c.enrolBackupReauth}</Notice>
            <a
              className={buttonClass("secondary")}
              href={`/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/access/enrol`)}`}
            >
              {c.confirmWithPasskey}
            </a>
          </>
        )}
      </StaffSettingsFrame>
    );
  return (
    <AccessFrame title={c.enrolTitle} lead={c.enrolLead} standalone>
      <Notice tone="info">{fill(c.enrolProgress, { count: access.passkeys })}</Notice>
      {isFresh(access.session, now, enrolmentWindowMs) ? (
        registration
      ) : (
        <Notice tone="warning">{c.enrolWindowClosed}</Notice>
      )}
      <SignOutForm action={`/${locale}/access/signout`} label={c.signOut} />
    </AccessFrame>
  );
}
