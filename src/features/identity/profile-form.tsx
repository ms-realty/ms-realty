"use client";
import type { ProfileValues } from "@/server/auth/profile";
import type { FormAction, FormCopy, FormState } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { SettingsCopy } from "./settings-copy";

export function ProfileForm({
  action,
  initialState,
  locale,
  copy,
  formCopy,
}: {
  action: FormAction<ProfileValues>;
  initialState: FormState<ProfileValues>;
  locale: string;
  copy: SettingsCopy;
  formCopy: FormCopy;
}) {
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={`/${locale}/settings`}
      reconciliation={{
        href: `/${locale}/settings/operations/${encodeURIComponent(initialState.operationId)}`,
        label: copy.profileStatus,
      }}
      copy={formCopy}
      labels={{ displayName: copy.displayName }}
      submitLabel={copy.save}
    >
      {(form) => (
        <FormField
          {...form.field("displayName")}
          label={copy.displayName}
          required
          autoComplete="name"
          maxLength={120}
        />
      )}
    </ActionForm>
  );
}
