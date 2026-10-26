// O23/F30: personal preferences and permitted agency administration keep separate native views.

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { ProfileForm } from "@/features/identity/profile-form";
import { settingsCopy } from "@/features/identity/settings-copy";
import { operatingPolicyCopy } from "@/features/operating-policy/copy";
import { governanceCopy } from "@/features/privacy-governance/copy";
import { AccountIdentity } from "@/features/shell/account";
import { LocaleSwitcher } from "@/features/shell/language-switcher";
import { NavigationIcon } from "@/features/shell/navigation-icons";
import { StaffPage } from "@/features/shell/staff-ui";
import { SidebarToggle } from "@/features/shell/workspace-frame";
import { workCopy } from "@/features/work/copy";
import { isStaffLocale, staffLocales } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { profileOperation, readStaffProfile } from "@/server/auth/profile";
import { can, heldCapabilities } from "@/server/authz";
import { policyResource } from "@/server/operating-policy/service";
import { governanceResource } from "@/server/privacy-governance/service";
import { buttonClass } from "@/ui/button-class";
import { initialFormState } from "@/ui/form/server";
import { CheckIcon, ChevronDownIcon } from "@/ui/icons";
import { saveProfile } from "./actions";

export default async function SettingsPage({
  params,
  searchParams,
}: PageProps<"/staff/[locale]/settings">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  const db = getDb();
  const [
    profile,
    held,
    query,
    mayManageOperatingPolicy,
    mayManagePrivacySettings,
    mayReadPrivacySettings,
  ] = await Promise.all([
    readStaffProfile(db, session),
    heldCapabilities(db, session.actor, [
      "access.grant",
      "report.read",
      "settings.manage",
      "message.send_external",
    ]),
    searchParams,
    can(db, session.actor, "settings.manage", policyResource),
    can(db, session.actor, "settings.manage", governanceResource),
    can(db, session.actor, "privacy.manage", governanceResource),
  ]);
  const copy = settingsCopy(locale);
  const workspace = await getTranslations({ locale, namespace: "workspace" });
  const administration = [
    ...(mayManagePrivacySettings && mayReadPrivacySettings
      ? [
          {
            href: `/${locale}/operations/privacy-governance`,
            label: governanceCopy(locale).title,
            icon: "system",
          },
        ]
      : []),
    ...(mayManageOperatingPolicy
      ? [
          {
            href: `/${locale}/settings/operating-policy`,
            label: operatingPolicyCopy(locale).title,
            icon: "system",
          },
        ]
      : []),
    ...(held.has("access.grant")
      ? [{ href: `/${locale}/access/manage`, label: copy.team, icon: "team" }]
      : []),
    ...(held.has("report.read")
      ? [{ href: `/${locale}/operations/readiness`, label: copy.release, icon: "system" }]
      : []),
    ...(held.has("settings.manage") && held.has("message.send_external")
      ? [{ href: `/${locale}/operations/subscriptions`, label: copy.notifications, icon: "alerts" }]
      : []),
  ];
  const sections = [
    { id: "profile", label: copy.profile, href: `/${locale}/settings` },
    { id: "preferences", label: copy.preferences, href: `/${locale}/settings?section=preferences` },
    { id: "security", label: copy.securityNav, href: `/${locale}/settings?section=security` },
    ...(administration.length
      ? [{ id: "agency", label: copy.agency, href: `/${locale}/settings?section=agency` }]
      : []),
  ];
  const selected = sections.find((section) => section.id === query.section)?.id ?? "profile";
  return (
    <StaffPage title={copy.title} lead={copy.lead}>
      <nav aria-label={copy.title}>
        <div className="hidden gap-1 border-b border-divider sm:flex">
          {sections.map((section) => (
            <a
              key={section.id}
              href={section.href}
              aria-current={selected === section.id ? "page" : undefined}
              className="inline-flex min-h-control shrink-0 items-center border-b-2 border-transparent px-3 py-3 text-dense font-medium text-text-muted no-underline hover:bg-subtle focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:border-action aria-[current=page]:text-action"
            >
              {section.label}
            </a>
          ))}
        </div>
        <details
          data-dismissible=""
          className="group/settings-view sm:hidden [&:not([open])>ul]:hidden"
        >
          {/* biome-ignore lint/a11y/useSemanticElements: native summary is the no-JavaScript settings-view disclosure. */}
          <summary
            role="button"
            aria-label={`${copy.title}: ${sections.find((section) => section.id === selected)?.label}`}
            className="flex min-h-control cursor-pointer list-none items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-3 text-dense font-semibold text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden"
          >
            {sections.find((section) => section.id === selected)?.label}
            <ChevronDownIcon className="group-open/settings-view:-scale-y-100" />
          </summary>
          <ul className="mt-2 space-y-1 border-b border-divider pb-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={section.href}
                  aria-current={selected === section.id ? "page" : undefined}
                  className="flex min-h-control items-center justify-between gap-3 rounded-control px-3 py-3 text-dense text-text hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-action"
                >
                  {section.label}
                  {selected === section.id ? <CheckIcon /> : null}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </nav>
      <div className="max-w-reading">
        {selected === "profile" ? (
          <section aria-labelledby="profile-title" className="space-y-6">
            <div className="space-y-2">
              <h2 id="profile-title" className="sr-only text-heading font-semibold sm:not-sr-only">
                {copy.profile}
              </h2>
              <p className="text-text-muted">{copy.profileLead}</p>
            </div>
            <AccountIdentity name={profile.displayName} />
            <dl className="space-y-1">
              <dt className="text-dense font-medium">{copy.email}</dt>
              <dd className="wrap-anywhere">
                <bdi>{profile.email}</bdi>
              </dd>
              <dd className="text-dense text-text-muted">{copy.emailHelp}</dd>
            </dl>
            <ProfileForm
              action={saveProfile.bind(null, locale)}
              initialState={initialFormState(
                profileOperation,
                { displayName: profile.displayName },
                profile.version,
              )}
              locale={locale}
              copy={copy}
              formCopy={{
                ...workCopy(locale).form,
                reference: copy.recordedName,
                recordedAt: copy.savedAt,
              }}
            />
          </section>
        ) : selected === "preferences" ? (
          <section aria-labelledby="preferences-title" className="space-y-7">
            <h2
              id="preferences-title"
              className="sr-only text-heading font-semibold sm:not-sr-only"
            >
              {copy.preferences}
            </h2>
            <div className="space-y-3">
              <h3 className="text-subheading font-semibold">{copy.language}</h3>
              <p className="text-dense text-text-muted">{copy.languageHelp}</p>
              <LocaleSwitcher
                locale={locale}
                locales={staffLocales}
                label={copy.language}
                align="start"
                wide
              />
            </div>
            <div className="hidden space-y-3 border-t border-divider pt-7 lg:block">
              <h3 className="text-subheading font-semibold">{copy.sidebar}</h3>
              <p className="text-dense text-text-muted">{copy.sidebarHelp}</p>
              <SidebarToggle
                locale={locale}
                returnTo={`/${locale}/settings?section=preferences`}
                expand={workspace("expandNavigation")}
                collapse={workspace("collapseNavigation")}
                showLabel
              />
            </div>
          </section>
        ) : selected === "security" ? (
          <section aria-labelledby="security-title" className="space-y-5">
            <h2 id="security-title" className="sr-only text-heading font-semibold sm:not-sr-only">
              {copy.security}
            </h2>
            <p className="text-text-muted">{copy.securityLead}</p>
            <dl className="flex items-center gap-4">
              <dt className="font-medium">{copy.passkeys}</dt>
              <dd className="rounded-control bg-subtle px-3 py-1 font-semibold tabular-nums">
                {profile.passkeys}
              </dd>
            </dl>
            <a href={`/${locale}/access/enrol`} className={buttonClass("secondary")}>
              {copy.addPasskey}
            </a>
          </section>
        ) : (
          <section aria-labelledby="agency-settings-title" className="space-y-5">
            <div className="space-y-2">
              <h2
                id="agency-settings-title"
                className="sr-only text-heading font-semibold sm:not-sr-only"
              >
                {copy.agency}
              </h2>
              <p className="text-text-muted">{copy.agencyLead}</p>
            </div>
            <ul className="divide-y divide-divider">
              {administration.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="flex min-h-control items-center gap-3 rounded-control px-3 py-4 text-dense font-medium text-action hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <NavigationIcon name={item.icon} />
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </StaffPage>
  );
}
