"use client";
import { buttonClass } from "@/ui/button-class";
import type { FormAction, FormState, RecoveryLink } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { workCopy } from "../work/copy";
import type { InquiryLinkValues } from "./inquiry-link-contract";
import { inquiryLinkCopy } from "./inquiry-link-copy";

/** O03L: the reviewed Case and both versions travel as hidden fields; the submit is the decision. */
export function InquiryLinkForm({
  locale,
  action,
  initialState,
  path,
  nativeIdentity,
  status,
  back,
}: {
  locale: string;
  action: FormAction<InquiryLinkValues>;
  initialState: FormState<InquiryLinkValues>;
  /** The review page itself: the same permalink before and after a native POST. */
  path: string;
  nativeIdentity: string;
  status: RecoveryLink;
  back: string;
}) {
  const copy = inquiryLinkCopy(locale);
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={path}
      nativeIdentity={nativeIdentity}
      reconciliation={status}
      copy={workCopy(locale).form}
      labels={{ caseId: copy.caseIdLabel, expectedCaseVersion: copy.caseVersionLabel }}
      submitLabel={copy.submit}
      layout="full"
      secondaryActions={
        // Phones stack Back under the submit, as the 390 frame does.
        <span className="basis-full sm:basis-auto">
          <a href={back} className={buttonClass("secondary", "text-text")}>
            {copy.back}
          </a>
        </span>
      }
    >
      {(form) => (
        <>
          <input type="hidden" name="caseId" value={form.values.caseId} />
          <input type="hidden" name="expectedCaseVersion" value={form.values.expectedCaseVersion} />
        </>
      )}
    </ActionForm>
  );
}
