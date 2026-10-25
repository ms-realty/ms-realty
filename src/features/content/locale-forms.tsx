"use client";
import { isInstantInput } from "@/domain/time";
import { workCopy } from "@/features/work/copy";
import { isStaffLocale, localeDirection, type PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { ContentLocaleDecision } from "@/server/content/locale-commands";
import { DateTimeField } from "@/ui/date-time-field";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { DecisionValues } from "./actions";
import { contentCopy } from "./copy";
import type { LocaleContentValues } from "./locale-actions";
import { contentLocaleCopy } from "./locale-copy";

export function ContentLocaleForm({
  shell,
  id,
  target,
  initialState,
  action,
}: {
  shell: string;
  id: string;
  target: PublicLocale;
  initialState: FormState<LocaleContentValues>;
  action: FormAction<LocaleContentValues>;
}) {
  const copy = contentCopy(shell),
    localeCopy = contentLocaleCopy(shell);
  const path = `/${shell}/content/${id}/editions/${target}`;
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={path}
      nativeIdentity={`content.locale.save.${id}.${target}`}
      reconciliation={{
        href: `${path}/operations?${new URLSearchParams({ kind: "save", key: initialState.operationId })}`,
        label: copy.check,
      }}
      copy={workCopy(shell).form}
      labels={{ title: copy.pageTitle, text: copy.text }}
      submitLabel={copy.save}
    >
      {(form) => (
        <>
          <p>{localeCopy.manual}</p>
          <div className="space-y-4">
            <FormField
              {...form.field("title")}
              lang={target}
              dir={localeDirection(target)}
              label={copy.pageTitle}
              required
              maxLength={200}
            />
            <FormField
              {...form.field("text")}
              lang={target}
              dir={localeDirection(target)}
              label={copy.text}
              hint={copy.paragraphs}
              required
              multiline
              maxLength={50000}
            />
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function ContentLocaleReviewForm({
  shell,
  id,
  target,
  decision,
  initialState,
  action,
}: {
  shell: string;
  id: string;
  target: PublicLocale;
  decision: ContentLocaleDecision["decision"];
  initialState: FormState<DecisionValues>;
  action: FormAction<DecisionValues>;
}) {
  const copy = contentCopy(shell),
    localeCopy = contentLocaleCopy(shell);
  const path = `/${shell}/content/${id}/editions/${target}`;
  const expires = !["request_review", "reject", "withdraw"].includes(decision);
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={path}
      nativeIdentity={`content.locale.decide.${id}.${target}.${decision}`}
      reconciliation={{
        href: `${path}/operations?${new URLSearchParams({ kind: "decide", key: initialState.operationId })}`,
        label: copy.check,
      }}
      copy={workCopy(shell).form}
      labels={{ note: copy.note, expiresAt: copy.expiry, reviewed: copy.reviewed }}
      submitLabel={localeCopy[decision]}
      formatValue={(name, value) =>
        name === "expiresAt" && isInstantInput(value)
          ? formatDateTime(isStaffLocale(shell) ? shell : "bg", value, { zoneLabel: true })
          : value
      }
    >
      {(form) => (
        <>
          <FormField {...form.field("note")} label={copy.note} required maxLength={1500} />
          {expires ? (
            <DateTimeField
              {...form.field("expiresAt")}
              label={copy.expiry}
              locale={isStaffLocale(shell) ? shell : "bg"}
              onValueChange={(value) => form.setValue("expiresAt", value)}
              required
            />
          ) : null}
          <label className="flex min-h-11 items-start gap-3">
            <input
              name="reviewed"
              type="checkbox"
              value="yes"
              checked={form.values.reviewed === "yes"}
              onChange={(event) => form.setValue("reviewed", event.target.checked ? "yes" : "")}
              required
              disabled={form.pending}
              className="mt-1 size-5 shrink-0 accent-action"
            />
            <span>{copy.reviewed}</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}
