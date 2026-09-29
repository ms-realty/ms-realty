import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import type { Capability } from "@/domain/capabilities";
import { complaintCopy } from "@/features/complaints/copy";
import { DiscoveryPage } from "@/features/discovery/page";
import { inboundCopy } from "@/features/inbound/copy";
import { custodyCopy } from "@/features/key-custody/copy";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";

const copy = {
  bg: {
    title: "Операции",
    jobs: "Задачи, помощник и състояние на изпращането",
    privacy: "Искания за лични данни",
    subscriptions: "Правило за известия за имоти",
    access: "Екип и достъп",
    empty: "Няма разрешени операции за този профил.",
  },
  en: {
    title: "Operations",
    jobs: "Jobs, assistance and delivery status",
    privacy: "Privacy requests",
    subscriptions: "Property alert rule",
    access: "Team and access",
    empty: "No operations are available for this account.",
  },
  ru: {
    title: "Операции",
    jobs: "Задачи, помощник и состояние отправки",
    privacy: "Запросы о персональных данных",
    subscriptions: "Правило уведомлений об объектах",
    access: "Команда и доступ",
    empty: "Для этой учётной записи нет доступных операций.",
  },
} as const;

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  const db = getDb();
  const c = copy[locale];
  const inbound = inboundCopy(locale);
  const destinations: { path: string; label: string; capabilities: Capability[] }[] = [
    { path: "/operations/keys", label: custodyCopy(locale).title, capabilities: ["key.manage"] },
    {
      path: "/operations/complaints",
      label: complaintCopy(locale).title,
      capabilities: ["complaint.manage"],
    },
    {
      path: "/operations/inbound",
      label: inbound.title,
      capabilities: ["inquiry.assign", "case.read_internal", "message.draft"],
    },
    { path: "/operations/jobs", label: c.jobs, capabilities: ["report.read"] },
    { path: "/operations/privacy", label: c.privacy, capabilities: ["privacy.manage"] },
    {
      path: "/operations/subscriptions",
      label: c.subscriptions,
      capabilities: ["settings.manage", "message.send_external"],
    },
    { path: "/access/manage", label: c.access, capabilities: ["access.grant"] },
  ];
  const allowed = (
    await Promise.all(
      destinations.map(async (destination) =>
        (
          await Promise.all(destination.capabilities.map((cap) => can(db, session.actor, cap)))
        ).every(Boolean)
          ? destination
          : null,
      ),
    )
  ).filter((destination) => destination !== null);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{c.title}</h1>
      {allowed.length ? (
        <ul className="space-y-3">
          {allowed.map((destination) => (
            <li key={destination.path}>
              <a className="underline" href={`/${locale}${destination.path}`}>
                {destination.label}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>{c.empty}</p>
      )}
    </DiscoveryPage>
  );
}
