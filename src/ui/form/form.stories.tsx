import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { localeOf } from "../specimen/story";
import type { FormOutcome, FormState } from "./contract";
import { formSpecimenCopy } from "./specimen-copy";
import { SpecimenForm, type SpecimenValues } from "./specimen-form";

const state: FormState<SpecimenValues> = {
  operationId: "story-operation",
  expectedRevision: 1,
  responseId: "story-initial",
  values: { subject: "Practice draft", note: "Example text with no personal information." },
  outcome: { kind: "idle" },
};

/** Synthetic UI states. The gated /{locale}/design/forms route exercises real Server Actions. */
const meta = {
  title: "Forms/Submission contract",
  component: SpecimenForm,
  args: {
    action: async (previous: FormState<SpecimenValues>) => previous,
    initialState: state,
    permalink: "#story",
    statusHref: "#story-status",
    copy: formSpecimenCopy("en"),
  },
  parameters: {
    docs: {
      description: {
        component:
          "Synthetic form states. Use the opt-in app specimen for server validation and no-JavaScript proof.",
      },
    },
  },
} satisfies Meta<typeof SpecimenForm>;
export default meta;
type Story = StoryObj<typeof meta>;

function scenario(
  outcome: (copy: ReturnType<typeof formSpecimenCopy>) => FormOutcome<SpecimenValues>,
): Story {
  return {
    render: (_args, context) => {
      const locale = localeOf(context);
      const copy = formSpecimenCopy(locale);
      return (
        <div lang={["bg", "he"].includes(locale) ? locale : "en"} className="max-w-reading">
          <SpecimenForm
            action={async (previous) => previous}
            initialState={{ ...state, outcome: outcome(copy) }}
            permalink="#story"
            statusHref="#story-status"
            copy={copy}
          />
        </div>
      );
    },
  };
}

export const Ready: Story = scenario(() => ({ kind: "idle" }));
export const Validation: Story = scenario((copy) => ({
  kind: "validation",
  code: "VALIDATION_FAILED",
  message: copy.form.errorSummary,
  fieldErrors: { subject: [copy.subjectError], note: [copy.noteError] },
}));
export const RevisionConflict: Story = scenario((copy) => ({
  kind: "conflict",
  code: "REVISION_CONFLICT",
  message: copy.conflict,
  latest: {
    revision: 2,
    values: { subject: "Current practice subject", note: "Current practice note" },
  },
  reapply: {
    operationId: "story-next-operation",
    expectedRevision: 2,
    status: { href: "#story-status", label: copy.status },
  },
}));
export const Rejected: Story = scenario((copy) => ({
  kind: "rejected",
  code: "NOT_AUTHORIZED",
  message: copy.invalid,
  retryable: false,
  recovery: { href: "#story", label: copy.start },
}));
export const Unknown: Story = scenario((copy) => ({
  kind: "unknown",
  code: "OUTCOME_UNKNOWN",
  message: copy.form.unknown,
  status: { href: "#story-status", label: copy.status },
}));
export const AcceptedWork: Story = scenario((copy) => ({
  kind: "accepted",
  message: "Practice work queued. No external delivery is confirmed.",
  status: { href: "#story-status", label: copy.status },
}));
export const ConfirmedReceipt: Story = scenario((copy) => ({
  kind: "confirmed",
  receipt: {
    title: copy.confirmed,
    reference: "DEMO-EXAMPLE",
    recordedAt: { dateTime: "2026-09-27T10:00:00Z", label: "27 Sep 2026, 13:00 Europe/Sofia" },
    nextStep: copy.next,
    destination: { href: "#story-receipt", label: copy.receipt },
  },
}));

export const Pending: Story = {
  render: (_args, context) => {
    const copy = formSpecimenCopy(localeOf(context));
    return (
      <SpecimenForm
        action={() => new Promise(() => undefined)}
        initialState={state}
        permalink="#story"
        statusHref="#story-status"
        copy={copy}
      />
    );
  },
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole("button");
    const width = button.getBoundingClientRect().width;
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(canvas.getAllByRole("textbox")[0]).toHaveAttribute("readonly");
    await expect(button.getBoundingClientRect().width).toBe(width);
  },
};
