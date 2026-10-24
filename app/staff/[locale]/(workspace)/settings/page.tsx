// O23/F30: personal preferences and permitted agency administration keep separate native views.

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { ProfileForm } from "@/features/identity/profile-form";
import { settingsCopy } from "@/features/identity/settings-copy";
import { AccountIdentity } from "@/features/shell/account";
import { LocaleSwitcher } from "@/features/shell/language-switcher";
import { NavigationIcon } from "@/features/shell/navigation-icons";
import { SidebarToggle } from "@/features/shell/workspace-frame";
import { workCopy } from "@/features/work/copy";
import { isStaffLocale, staffLocales } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { profileOperation, readStaffProfile } from "@/server/auth/profile";
import { heldCapabilities } from "@/server/authz";
import { buttonClass } from "@/ui/button-class";
import { initialFormState } from "@/ui/form/server";
import { saveProfile } from "./actions";

export default async function SettingsPage({
  params,
  searchParams,
}: PageProps<"/staff/[locale]/settings">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  const db = getDb();
  const [profile, held, query] = await Promise.all([
    readStaffProfile(db, session),
    heldCapabilities(db, session.actor, [
      "access.grant",
      "report.read",
      "settings.manage",
      "message.send_external",
    ]),
    searchParams,
  ]);
  const copy = settingsCopy(locale);
  const workspace = await getTranslations({ locale, namespace: "workspace" });
  const administration = [
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
    <div className="mx-auto w-full max-w-5xl px-gutter py-8 lg:px-8 lg:py-10">
      <div className="mb-6 space-y-3">
        <h1 className="text-page font-semibold">{copy.title}</h1>
        <p className="max-w-reading text-text-muted">{copy.lead}</p>
      </div>
      <nav aria-label={copy.title} className="flex gap-1 overflow-x-auto border-b border-divider">
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
      </nav>
      <div className="max-w-reading pt-7">
        {selected === "profile" ? (
          <section aria-labelledby="profile-title" className="space-y-6">
            <div className="space-y-2">
              <h2 id="profile-title" className="text-heading font-semibold">
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
            <h2 id="preferences-title" className="text-heading font-semibold">
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
            <h2 id="security-title" className="text-heading font-semibold">
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
              <h2 id="agency-settings-title" className="text-heading font-semibold">
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
    </div>
  );
}
