// O29/F27/F28: actual coverage is a human business decision, never inferred from CMS prose.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { serviceIntakeTopics } from "@/domain/case";
import { contentRoute } from "@/domain/inquiry-content";
import { type WorkflowField, WorkflowForm } from "@/features/cases/form";
import { serviceCopy, serviceStaffCopy } from "@/features/service-intake/copy";
import {
  serviceScopeApprovalFields,
  serviceScopeFields,
} from "@/features/service-intake/policy-form";
import { StaffPage, StaffPanel } from "@/features/shell/staff-ui";
import { privateRead } from "@/features/work/screens";
import { isStaffLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { serviceScopeChoices } from "@/server/service-intake/queries";
import { readServiceScope } from "@/server/service-intake/scope";
import { initialFormState } from "@/ui/form/server";
import { submitServiceScope } from "./actions";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ topic?: string; region?: string }>;
}) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale),
    query = await searchParams;
  const [model, choices] = await privateRead(() =>
    Promise.all([readServiceScope(getDb(), session), serviceScopeChoices(getDb(), session)]),
  );
  const c = serviceStaffCopy(locale),
    p = serviceCopy(locale),
    path = `/${locale}/settings/service-scope`;
  const selected = model.draft.document.decisions.find(
    (row) => row.topic === query.topic && row.regionId === query.region,
  );
  const region = choices.regions.find((row) => row.id === selected?.regionId);
  const values = Object.fromEntries(serviceScopeFields.map((key) => [key, ""]));
  Object.assign(values, {
    topic: selected?.topic ?? "short_stay_consultation",
    region: region ? JSON.stringify({ id: region.id, version: region.version }) : "",
    state: selected?.state ?? "unknown",
    mode: "consultation",
    fallbackId: "manual",
  });
  if (selected?.state === "not_offered") values.reason = selected.reason;
  if (selected?.state === "offered")
    Object.assign(values, {
      region: JSON.stringify({ id: selected.regionId, version: selected.regionVersion }),
      mode: selected.mode,
      publicSource: JSON.stringify(selected.publicSource),
      termsSource: JSON.stringify(selected.termsSource),
      ownerId: selected.ownerId,
      fallbackId: selected.fallback.kind === "manual" ? "manual" : selected.fallback.principalId,
      fallbackSource:
        selected.fallback.kind === "manual" ? JSON.stringify(selected.fallback.source) : "",
      reviewExpiresAt: selected.reviewExpiresAt,
    });
  const choose = [{ value: "", label: "—" }],
    people = choices.people.map((row) => ({ value: row.id, label: row.name }));
  const fields: WorkflowField[] = [
    {
      name: "topic",
      label: c.topic,
      type: "select",
      options: serviceIntakeTopics.map((topic) => ({ value: topic, label: p[topic] })),
      required: true,
    },
    {
      name: "region",
      label: c.region,
      type: "select",
      options: [
        ...choose,
        ...choices.regions.map((row) => ({
          value: JSON.stringify({ id: row.id, version: row.version }),
          label: row.name,
        })),
      ],
      required: true,
    },
    {
      name: "state",
      label: c.state,
      type: "select",
      options: ["unknown", "not_offered", "offered"].map((state) => ({
        value: state,
        label: c[state as "unknown"],
      })),
    },
    { name: "reason", label: c.reason, type: "textarea" },
    {
      name: "mode",
      label: c.mode,
      type: "select",
      options: ["consultation", "referral"].map((mode) => ({
        value: mode,
        label: c[mode as "consultation"],
      })),
    },
    {
      name: "publicSource",
      label: c.publicSource,
      type: "select",
      options: [...choose, ...choices.sources.filter((row) => row.kind === "service")],
    },
    {
      name: "termsSource",
      label: c.terms,
      type: "select",
      options: [...choose, ...choices.sources],
    },
    { name: "ownerId", label: c.owner, type: "select", options: [...choose, ...people] },
    {
      name: "fallbackId",
      label: c.fallback,
      type: "select",
      options: [{ value: "manual", label: c.manual }, ...people],
    },
    {
      name: "fallbackSource",
      label: `${c.fallback} · ${c.source}`,
      type: "select",
      options: [...choose, ...choices.sources],
    },
    { name: "reviewExpiresAt", label: c.expiry, type: "datetime-local" },
  ];
  const draftState = initialFormState("service_scope.save", values, model.draft.version);
  const approveState = initialFormState(
    "service_scope.approve",
    Object.fromEntries(
      serviceScopeApprovalFields.map((key) => [
        key,
        key === "expectedHash" ? (model.draft.contentHash ?? "") : "",
      ]),
    ),
    model.draft.version,
  );
  return (
    <StaffPage
      title={c.policy}
      lead={c.lead}
      actions={<a href={`/${locale}/operations/consultations`}>{c.return}</a>}
    >
      <StaffPanel title={`${c.version} ${model.current?.scopeVersion ?? "—"}`}>
        <p>{model.current ? c.approve : c.unknown}</p>
        <p>{p.boundary}</p>
      </StaffPanel>
      <StaffPanel title={c.save}>
        <WorkflowForm
          locale={locale}
          initialState={draftState}
          fields={fields}
          action={submitServiceScope.bind(null, locale, "save")}
          path={path}
          nativeIdentity="service_scope.save"
          status={{
            href: `${path}/operations/save/${encodeURIComponent(draftState.operationId)}`,
            label: c.check,
          }}
          submit={c.save}
        />
      </StaffPanel>
      <StaffPanel title={c.approve}>
        <ul className="space-y-4">
          {model.draft.document.decisions.map((row) => (
            <li key={`${row.topic}:${row.regionId}`} className="min-w-0 space-y-2 break-words">
              <a
                className="inline-flex min-h-control items-center underline"
                href={`${path}?${new URLSearchParams({ topic: row.topic, region: row.regionId })}`}
              >
                {p[row.topic]} ·{" "}
                {choices.regions.find((region) => region.id === row.regionId)?.name ?? c.unknown} ·{" "}
                {c[row.state]}
              </a>
              {row.state === "offered" ? (
                <>
                  <p>
                    {c.owner}:{" "}
                    {choices.people.find((person) => person.id === row.ownerId)?.name ?? c.unknown}
                  </p>
                  <p>
                    {c.mode}: {c[row.mode]}
                  </p>
                  <a className="block underline" href={`/bg${contentRoute(row.publicSource)}`}>
                    {c.publicSource} · {row.publicSource.slug}
                  </a>
                  <a className="block underline" href={`/bg${contentRoute(row.termsSource)}`}>
                    {c.terms} · {row.termsSource.slug}
                  </a>
                  <p>
                    {c.expiry}: <time dateTime={row.reviewExpiresAt}>{row.reviewExpiresAt}</time>
                  </p>
                </>
              ) : row.state === "not_offered" ? (
                <p>{row.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
        {model.draft.contentHash ? (
          <WorkflowForm
            locale={locale}
            initialState={approveState}
            fields={[
              { name: "expectedHash", label: c.version, type: "hidden" },
              { name: "reviewed", label: c.review, type: "checkbox", required: true },
              { name: "note", label: c.note, type: "textarea", required: true },
            ]}
            action={submitServiceScope.bind(null, locale, "approve")}
            path={path}
            nativeIdentity="service_scope.approve"
            status={{
              href: `${path}/operations/approve/${encodeURIComponent(approveState.operationId)}`,
              label: c.check,
            }}
            submit={c.approve}
          />
        ) : (
          <p>{c.unknown}</p>
        )}
      </StaffPanel>
    </StaffPage>
  );
}
