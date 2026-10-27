// O24/F30/AT14: agency policy is separate from personal preferences and release attestation.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { operatingPolicySchema } from "@/domain/operating-policy";
import { policyToValues } from "@/domain/operating-policy-form";
import { operatingPolicyCopy } from "@/features/operating-policy/copy";
import { PolicyApprovalForm, PolicyDraftForm } from "@/features/operating-policy/forms";
import { PolicyEffects, PolicyReview } from "@/features/operating-policy/review";
import { StaffPage, StaffPanel, StaffToolbar, staffUi } from "@/features/shell/staff-ui";
import { workCopy } from "@/features/work/copy";
import { isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { isAppError } from "@/server/errors";
import { readOperatingPolicy } from "@/server/operating-policy/service";
import { alertRuleId, alertRuleSubject } from "@/server/subscriptions/approval";
import { initialFormState } from "@/ui/form/server";
import { submitPolicyApproval, submitPolicyDraft } from "./actions";

export default async function OperatingPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale),
    db = getDb();
  let model: Awaited<ReturnType<typeof readOperatingPolicy>>;
  try {
    model = await readOperatingPolicy(db, session);
  } catch (error) {
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) notFound();
    throw error;
  }
  const alertResource = { type: alertRuleSubject, id: alertRuleId, audience: "internal" as const };
  const [alertSettings, alertSending, privacy, inventory] = await Promise.all([
    can(db, session.actor, "settings.manage", alertResource),
    can(db, session.actor, "message.send_external", alertResource),
    can(db, session.actor, "privacy.manage"),
    can(db, session.actor, "listing.read", { type: "listing", audience: "internal" }),
  ]);
  const copy = operatingPolicyCopy(locale),
    formCopy = workCopy(locale).form;
  const active = model.history[0],
    parsed = operatingPolicySchema.safeParse(active?.document);
  const approvalState = initialFormState(
    "operating_policy.approve",
    { expectedHash: model.draft.contentHash ?? "", note: "", reviewed: "" },
    model.draft.version,
  );
  if (active && model.draft.contentHash === active.contentHash)
    approvalState.outcome = {
      kind: "confirmed",
      receipt: {
        title: copy.approved,
        reference: `${copy.version} ${active.policyVersion}`,
        recordedAt: {
          dateTime: active.approvedAt.toISOString(),
          label: formatDateTime(locale, active.approvedAt),
        },
        nextStep: copy.approvedNext,
        destination: {
          href: `/${locale}/settings/operating-policy/versions/${active.policyVersion}`,
          label: `${copy.version} ${active.policyVersion}`,
        },
      },
    };
  return (
    <StaffPage
      title={copy.title}
      lead={copy.lead}
      actions={
        <a
          className="text-dense text-action hover:underline"
          href={`/${locale}/settings?section=agency`}
        >
          {copy.back}
        </a>
      }
    >
      <StaffToolbar>
        <span className="text-dense">
          {copy.revision} <bdi>{model.draft.version}</bdi>
        </span>
        <span className="text-dense">
          {copy.version} <bdi>{active?.policyVersion ?? copy.unknown}</bdi>
        </span>
      </StaffToolbar>
      {(alertSettings && alertSending) || privacy || inventory ? (
        <StaffToolbar>
          {alertSettings && alertSending ? (
            <a
              href={`/${locale}/operations/subscriptions`}
              className="text-dense text-action hover:underline"
            >
              {copy.subscriptions}
            </a>
          ) : null}
          {privacy ? (
            <a
              href={`/${locale}/operations/privacy`}
              className="text-dense text-action hover:underline"
            >
              {copy.privacy}
            </a>
          ) : null}
          {inventory ? (
            <a href={`/${locale}/inventory`} className="text-dense text-action hover:underline">
              {copy.processControls}
            </a>
          ) : null}
        </StaffToolbar>
      ) : null}
      <StaffPanel title={copy.active}>
        {parsed.success ? (
          <details>
            <summary className="min-h-control cursor-pointer text-dense font-medium">
              {copy.version} {active?.policyVersion} ·{" "}
              {active ? formatDateTime(locale, active.approvedAt) : ""}
            </summary>
            <PolicyReview document={parsed.data} copy={copy} owners={model.owners} />
          </details>
        ) : (
          <p className={staffUi.reading}>{copy.none}</p>
        )}
      </StaffPanel>
      <StaffPanel title={copy.draft}>
        <PolicyDraftForm
          locale={locale}
          copy={copy}
          formCopy={formCopy}
          owners={model.owners}
          ownerDirectory={model.ownerDirectory}
          action={submitPolicyDraft.bind(null, locale)}
          initialState={initialFormState(
            "operating_policy.save",
            { ...policyToValues(model.draft.document), ownerSearch: "" },
            model.draft.version,
          )}
        />
      </StaffPanel>
      <StaffPanel title={copy.effects} lead={copy.effectsHelp}>
        <PolicyEffects document={model.draft.document} copy={copy} />
        <details className="my-5">
          <summary className="min-h-control cursor-pointer text-dense font-medium">
            {copy.draft} · {copy.revision} {model.draft.version}
          </summary>
          <PolicyReview document={model.draft.document} copy={copy} owners={model.owners} />
        </details>
        {model.draft.contentHash ? (
          <PolicyApprovalForm
            locale={locale}
            copy={copy}
            formCopy={formCopy}
            action={submitPolicyApproval.bind(null, locale)}
            initialState={approvalState}
          />
        ) : null}
      </StaffPanel>
      {model.history.length ? (
        <StaffPanel title={copy.history}>
          <ol className="divide-y divide-divider">
            {model.history.map((row) => (
              <li key={row.id} className="py-3">
                <details>
                  <summary className="min-h-control cursor-pointer text-dense font-medium">
                    {copy.version} {row.policyVersion} · {formatDateTime(locale, row.approvedAt)}
                  </summary>
                  <dl className="space-y-2 text-dense">
                    <dt className="font-medium">{copy.evidence}</dt>
                    <dd className="whitespace-pre-wrap">{row.approvalNote}</dd>
                    <dt className="font-medium">{copy.approvedBy}</dt>
                    <dd>
                      {model.owners.find((owner) => owner.id === row.approvedById)?.displayName ??
                        copy.unknown}
                    </dd>
                    <dt className="font-medium">{copy.technical}</dt>
                    <dd className="break-all">
                      <bdi>{row.contentHash}</bdi>
                    </dd>
                    <dd>
                      <a
                        href={`/${locale}/settings/operating-policy/versions/${row.policyVersion}`}
                        className="text-action hover:underline"
                      >
                        {copy.version} {row.policyVersion}
                      </a>
                    </dd>
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        </StaffPanel>
      ) : null}
    </StaffPage>
  );
}
