import "server-only";
import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import { readAlertRule } from "@/server/subscriptions/approval";
import { configuredAlertRule, currentAlertRule } from "@/server/subscriptions/rule";
import { alertTemplateCopy } from "@/server/subscriptions/template";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { issueFormOperation } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { subscriptionCopy } from "./copy";
import { alertFormScope, alertRuleReceipt, retainedAlertRuleDraft } from "./native";

export async function AlertRuleScreen({
  locale,
  session,
  query,
}: {
  locale: string;
  session: Session;
  query: { error?: string; receipt?: string };
}) {
  const copy = subscriptionCopy(locale),
    rule = currentAlertRule();
  const current = await readAlertRule(getDb(), session, rule);
  const receipt = await alertRuleReceipt(getDb(), session, query.receipt);
  const draft = await retainedAlertRuleDraft(session);
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-gutter py-8">
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <p>{copy.lead}</p>
      <p className="text-compact text-text-muted">{copy.disabledBoundary}</p>
      {receipt ? (
        <Notice tone="success">
          {copy.receipt}: <bdi data-rule-receipt>{receipt}</bdi>
        </Notice>
      ) : null}
      {query.error ? (
        <div role="alert" tabIndex={-1}>
          <Notice tone="error">
            {query.error === "VERSION_CONFLICT" || query.error === "APPROVAL_STALE"
              ? copy.conflict
              : copy.error}
          </Notice>
        </div>
      ) : null}
      <Notice
        tone={current.approval ? "success" : "info"}
        title={current.approval ? copy.active : copy.inactive}
      >
        <p>{configuredAlertRule() ? copy.gateOn : copy.gateOff}</p>
        {current.approval ? (
          <p>
            {copy.expires}:{" "}
            <time dateTime={current.approval.expiresAt.toISOString()}>
              {current.approval.expiresAt.toISOString()}
            </time>
          </p>
        ) : null}
      </Notice>
      <section className="space-y-3">
        <p>{copy.schedule}</p>
        <p>{copy.content}</p>
        <p>{copy.fences}</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-subheading font-semibold">{copy.destinations}</h2>
        <p className="break-all" dir="ltr">
          {rule.publicOrigin}/[locale]/properties/[reference]/[slug]
        </p>
        <p className="break-all" dir="ltr">
          {rule.clientOrigin}/[locale]/preferences
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{copy.template}</h2>
        <p>{copy.entry}</p>
        <pre className="whitespace-pre-wrap rounded-control border border-border p-4 font-sans">
          {copy.placeholder}
        </pre>
        {Object.entries(alertTemplateCopy).map(([language, lines]) => (
          <details key={language} className="rounded-control border border-border p-4">
            <summary className="cursor-pointer font-semibold">{language.toUpperCase()}</summary>
            <div lang={language} dir={language === "he" ? "rtl" : "ltr"} className="mt-3 space-y-2">
              {lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </details>
        ))}
      </section>
      <form
        action={`/${locale}/operations/subscriptions/submit`}
        method="post"
        className="grid gap-4"
      >
        <input type="hidden" name="operationId" value={issueFormOperation(alertFormScope)} />
        <input type="hidden" name="expectedRuleHash" value={current.hash} />
        <input type="hidden" name="expectedDecisionId" value={current.latest?.id ?? ""} />
        <input type="hidden" name="expectedDecisionVersion" value={current.latest?.version ?? 0} />
        <div className="grid gap-2">
          <label htmlFor="alert-rule-note">{copy.note}</label>
          <textarea
            className={controlClass}
            id="alert-rule-note"
            aria-describedby="alert-rule-note-hint"
            name="note"
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            defaultValue={draft?.note ?? ""}
          />
          <p id="alert-rule-note-hint" className="text-compact text-text-muted">
            {copy.hint}
          </p>
        </div>
        <label className="grid gap-2">
          {copy.expiry}
          <input
            className={controlClass}
            type="datetime-local"
            name="expiresAt"
            defaultValue={draft?.expiresAt ?? ""}
          />
        </label>
        <label className="flex items-start gap-3">
          <input className="mt-1 size-5" type="checkbox" name="reviewed" value="yes" required />
          <span>{copy.review}</span>
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" name="decision" value="approve" className={buttonClass()}>
            {copy.approve}
          </button>
          <button
            type="submit"
            name="decision"
            value="disable"
            className={buttonClass("destructive")}
          >
            {copy.disable}
          </button>
        </div>
      </form>
      <a className="underline" href={`/${locale}/operations/jobs`}>
        {copy.back}
      </a>
    </div>
  );
}
