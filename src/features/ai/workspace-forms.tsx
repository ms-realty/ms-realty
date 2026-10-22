"use client";

import { useCallback, useEffect, useRef } from "react";
import { workCopy } from "@/features/work/copy";
import { controlClass, fieldClass, labelClass, textareaClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm, type FormController, type FormSnapshot } from "@/ui/form/form";
import { workspaceCopy } from "./workspace-copy";
import {
  type WorkspaceChoices,
  type WorkspaceMode,
  type WorkspaceParent,
  type WorkspaceValues,
  workspaceFields,
} from "./workspace-types";

type Props = {
  locale: string;
  mode: WorkspaceMode;
  initialState: FormState<WorkspaceValues>;
  action: FormAction<WorkspaceValues>;
  path: string;
  statusHref: string;
  retentionKey: string;
  choices?: WorkspaceChoices;
  parents?: WorkspaceParent[];
  buyer?: boolean;
  unknownProvider?: boolean;
  commandAvailable?: boolean;
  firstRun?: boolean;
};
const retainedFields = workspaceFields.filter(
  (key) => !["reviewed", "acknowledgeUnknown"].includes(key),
);
const draftKey = (key: string) => "msr-workspace-draft:" + key;

/** Retains entered text in this tab. Source text, credentials and consent checks are never stored. */
function readDraft(key: string): Partial<WorkspaceValues> | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(key));
    if (!raw || raw.length > 50_000) return null;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== "object") return null;
    const values: Partial<WorkspaceValues> = {};
    for (const field of retainedFields) {
      const value = (stored as Record<string, unknown>)[field];
      if (typeof value === "string" && value.length <= 12_000) values[field] = value;
    }
    return values;
  } catch {
    return null;
  }
}
function writeDraft(key: string, values: WorkspaceValues, initial: WorkspaceValues) {
  try {
    window.sessionStorage.setItem(
      draftKey(key),
      JSON.stringify(
        Object.fromEntries(
          retainedFields
            .filter((field) => values[field] !== initial[field])
            .map((field) => [field, values[field]]),
        ),
      ),
    );
  } catch {
    /* A native save remains available when browser storage is disabled. */
  }
}

function Fields({
  form,
  props,
  restored,
}: {
  form: FormController<WorkspaceValues>;
  props: Props;
  restored: { current: boolean };
}) {
  const copy = workspaceCopy(props.locale);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (
      ["create", "message", "revise"].includes(props.mode) &&
      form.state.outcome.kind === "idle"
    ) {
      const stored = readDraft(props.retentionKey);
      if (
        stored &&
        retainedFields.every((field) => form.values[field] === props.initialState.values[field])
      ) {
        for (const field of retainedFields)
          if (typeof stored[field] === "string") form.setValue(field, stored[field]);
      }
    }
    restored.current = true;
  }, [form, props, restored]);
  const text = (
    name: keyof WorkspaceValues,
    label: string,
    help?: string,
    maxLength = 6000,
    rows = 4,
  ) => {
    const binding = form.field(name);
    return (
      <div className={fieldClass} key={name}>
        <label htmlFor={binding.id} className={labelClass}>
          {label}
        </label>
        {help ? (
          <p id={binding.id + "-help"} className="text-compact text-text-muted">
            {help}
          </p>
        ) : null}
        <textarea
          {...binding}
          required={name !== "constraints" && name !== "preferences"}
          rows={rows}
          maxLength={maxLength}
          aria-describedby={
            [help ? binding.id + "-help" : null, binding.error ? binding.id + "-error" : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={Boolean(binding.error) || undefined}
          className={textareaClass}
        />
        {binding.error ? (
          <p id={binding.id + "-error"} className="text-compact text-error">
            {binding.error}
          </p>
        ) : null}
      </div>
    );
  };
  const checkbox = (name: "reviewed" | "acknowledgeUnknown", label: string) => (
    <label className="flex min-h-control items-start gap-3">
      <input
        type="checkbox"
        name={name}
        value="yes"
        checked={form.values[name] === "yes"}
        onChange={(event) => form.setValue(name, event.target.checked ? "yes" : "")}
        disabled={form.pending}
        required
        className="mt-1 size-5 shrink-0 accent-action"
      />
      <span>{label}</span>
    </label>
  );
  if (props.mode === "cancel")
    return <p className="text-compact text-text-muted">{copy.stopHelp}</p>;
  if (props.mode === "research")
    return (
      <>
        {checkbox("reviewed", copy.reviewed)}
        {props.unknownProvider ? checkbox("acknowledgeUnknown", copy.unknownReview) : null}
      </>
    );
  if (props.mode === "message")
    return (
      <>
        {text("message", copy.message, copy.messageHelp)}
        <details
          open={
            form.values.goal !== props.initialState.values.goal ||
            form.values.constraints !== props.initialState.values.constraints ||
            undefined
          }
        >
          <summary className="min-h-control cursor-pointer py-2 font-semibold">
            {copy.editGoal}
          </summary>
          <div className="space-y-5 pt-3">
            {text("goal", copy.goal, undefined, 4000)}
            {text("constraints", copy.constraints, copy.constraintsHelp, 8000)}
          </div>
        </details>
      </>
    );
  if (props.mode === "revise")
    return (
      <>
        {text("title", copy.draftTitle, undefined, 180, 2)}
        {text("body", copy.body, copy.bodyHelp, 6000, 8)}
        {props.buyer ? (
          <>
            {text("requirements", copy.requirements, undefined, 4000)}
            {text("preferences", copy.preferences, undefined, 4000)}
            <input type="hidden" name="listingIds" value={form.values.listingIds} />
          </>
        ) : null}
      </>
    );
  if (props.mode === "materialize")
    return (
      <>
        <p>{props.buyer ? copy.buyerHelp : copy.taskHelp}</p>
        <label className={fieldClass}>
          <span className={labelClass}>{copy.parent}</span>
          <select
            name="parent"
            value={form.values.parent}
            onChange={(event) => form.setValue("parent", event.target.value)}
            disabled={form.pending}
            className={controlClass}
          >
            {!props.buyer ? <option value="none">{copy.standalone}</option> : null}
            {(props.parents ?? [])
              .filter((parent) => !props.buyer || parent.type === "case")
              .map((parent) => (
                <option key={parent.type} value={parent.type}>
                  {parent.label}
                </option>
              ))}
          </select>
        </label>
        {checkbox("reviewed", copy.personReview)}
      </>
    );
  return (
    <>
      {text("goal", copy.goal, copy.goalExample, 4000)}
      {text("constraints", copy.constraints, copy.constraintsHelp, 8000)}
      <fieldset className="min-w-0 space-y-5 border-t border-border pt-6">
        <legend className="pe-3 font-semibold">{copy.context}</legend>
        <p className="text-compact text-text-muted">{copy.contextHelp}</p>
        <a
          href="#workspace-context-search"
          className="inline-flex min-h-control items-center font-semibold text-accent underline underline-offset-4"
        >
          {copy.search}
        </a>
        {(["caseId", "inquiryId"] as const).map((name) => (
          <label key={name} className={fieldClass}>
            <span className={labelClass}>{name === "caseId" ? copy.case : copy.inquiry}</span>
            <select
              name={name}
              value={form.values[name]}
              onChange={(event) => form.setValue(name, event.target.value)}
              disabled={form.pending}
              className={controlClass}
            >
              <option value="">{copy.none}</option>
              {(name === "caseId" ? props.choices?.cases : props.choices?.inquiries)?.map(
                (choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.reference}
                    {choice.title ? " · " + choice.title : ""}
                  </option>
                ),
              )}
            </select>
          </label>
        ))}
        <fieldset className="min-w-0 space-y-2">
          <legend className={labelClass}>{copy.listings}</legend>
          {props.choices?.listings.length ? (
            props.choices.listings.map((choice) => (
              <label key={choice.id} className="flex min-h-control items-start gap-3 py-2">
                <input
                  name="listingIds"
                  type="checkbox"
                  value={choice.id}
                  checked={form.values.listingIds.split("\n").includes(choice.id)}
                  disabled={form.pending}
                  onChange={(event) =>
                    form.setValue(
                      "listingIds",
                      (event.target.checked
                        ? [...form.values.listingIds.split("\n").filter(Boolean), choice.id]
                        : form.values.listingIds.split("\n").filter((id) => id !== choice.id)
                      ).join("\n"),
                    )
                  }
                  className="mt-1 size-5 shrink-0 accent-action"
                />
                <span className="min-w-0 break-words">
                  <bdi>{choice.reference}</bdi>
                  {choice.title ? " · " + choice.title : ""}
                </span>
              </label>
            ))
          ) : (
            <p className="text-compact text-text-muted">{copy.noChoices}</p>
          )}
        </fieldset>
      </fieldset>
    </>
  );
}

export function WorkspaceForm(props: Props) {
  const { locale, mode, initialState, action, path, statusHref, retentionKey } = props;
  const copy = workspaceCopy(locale);
  const restored = useRef(false);
  const onSnapshot = useCallback(
    (snapshot: FormSnapshot<WorkspaceValues>) => {
      if (!["create", "message", "revise"].includes(mode)) return;
      if (snapshot.state.outcome.kind === "confirmed") {
        try {
          window.sessionStorage.removeItem(draftKey(retentionKey));
        } catch {
          /* Local storage is optional. */
        }
      } else if (restored.current)
        writeDraft(retentionKey, snapshot.values, props.initialState.values);
    },
    [mode, retentionKey, props.initialState.values],
  );
  const allLabels: Record<keyof WorkspaceValues, string> = {
    goal: copy.goal,
    constraints: copy.constraints,
    caseId: copy.case,
    inquiryId: copy.inquiry,
    listingIds: copy.listings,
    message: copy.message,
    reviewed: copy.personReview,
    acknowledgeUnknown: copy.unknownReview,
    title: copy.draftTitle,
    body: copy.body,
    requirements: copy.requirements,
    preferences: copy.preferences,
    parent: copy.parent,
  };
  const visibleFields: (keyof WorkspaceValues)[] =
    mode === "create"
      ? ["goal", "constraints", "caseId", "inquiryId", "listingIds"]
      : mode === "message"
        ? ["message", "goal", "constraints"]
        : mode === "revise"
          ? [
              "title",
              "body",
              ...(props.buyer ? (["requirements", "preferences", "listingIds"] as const) : []),
            ]
          : mode === "research"
            ? ["reviewed", ...(props.unknownProvider ? (["acknowledgeUnknown"] as const) : [])]
            : mode === "materialize"
              ? ["parent", "reviewed"]
              : [];
  const labels = Object.fromEntries(
    workspaceFields.map((field) => [field, visibleFields.includes(field) ? allLabels[field] : ""]),
  ) as Record<keyof WorkspaceValues, string>;
  const submit =
    mode === "create"
      ? copy.create
      : mode === "message"
        ? copy.saveMessage
        : mode === "research"
          ? props.firstRun
            ? copy.research
            : copy.resume
          : mode === "cancel"
            ? copy.stop
            : mode === "revise"
              ? copy.revise
              : props.buyer
                ? copy.saveBuyer
                : copy.createTask;
  const choices = [
    ...(props.choices?.cases ?? []),
    ...(props.choices?.inquiries ?? []),
    ...(props.choices?.listings ?? []),
  ];
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={path}
      nativeIdentity={mode + (props.buyer ? "-buyer" : "") + ":" + retentionKey}
      commandAvailable={props.commandAvailable}
      reconciliation={{ href: statusHref, label: copy.operation }}
      copy={workCopy(locale).form}
      labels={labels}
      submitLabel={submit}
      disclosure={mode === "revise" ? copy.edit : undefined}
      onSnapshot={onSnapshot}
      formatValue={(name, value) =>
        ["caseId", "inquiryId", "listingIds"].includes(name)
          ? value
              .split("\n")
              .filter(Boolean)
              .map((id) => choices.find((choice) => choice.id === id)?.reference ?? copy.none)
              .join(", ") || copy.none
          : name === "parent"
            ? (props.parents?.find((parent) => parent.type === value)?.label ?? copy.standalone)
            : value
      }
    >
      {(form) => <Fields form={form} props={props} restored={restored} />}
    </ActionForm>
  );
}
