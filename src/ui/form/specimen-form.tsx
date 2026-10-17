"use client";

import type { FormAction, FormState } from "./contract";
import { ActionForm } from "./form";
import { FormField } from "./form-field";
import type { SpecimenCopy } from "./specimen-copy";

export type SpecimenValues = { subject: string; note: string };

export function SpecimenForm({
  action,
  initialState,
  permalink,
  copy,
  statusHref,
}: {
  action: FormAction<SpecimenValues>;
  initialState: FormState<SpecimenValues>;
  permalink: string;
  copy: SpecimenCopy;
  statusHref: string;
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={permalink}
      reconciliation={{ href: statusHref, label: copy.status }}
      copy={copy.form}
      labels={{ subject: copy.subject, note: copy.note }}
      submitLabel={copy.submit}
    >
      {(form) => (
        <>
          <FormField
            {...form.field("subject")}
            label={copy.subject}
            hint={copy.subjectHint}
            required
            autoComplete="off"
          />
          <FormField
            {...form.field("note")}
            label={copy.note}
            hint={copy.noteHint}
            optionalLabel={copy.optional}
            multiline
          />
        </>
      )}
    </ActionForm>
  );
}
