import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { Button } from "./button";
import { copyOf, focusVisible, hover, longText, press } from "./specimen/story";

const meta = {
  title: "Actions/Button",
  component: Button,
  args: { children: "" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (_args, context) => {
    const copy = copyOf(context).button;
    return (
      <div className="flex flex-wrap gap-3">
        <Button>{copy.primary}</Button>
        <Button variant="secondary">{copy.secondary}</Button>
        <Button variant="tertiary">{copy.tertiary}</Button>
        <Button variant="destructive">{copy.destructive}</Button>
      </div>
    );
  },
};

const single: Story["render"] = (_args, context) => (
  <div className="flex">
    <Button>{copyOf(context).button.primary}</Button>
  </div>
);

export const Hover: Story = {
  render: single,
  play: async ({ canvas }) => hover(canvas.getByRole("button")),
};

export const FocusVisible: Story = {
  render: single,
  play: async ({ canvas }) => focusVisible(canvas.getByRole("button")),
};

export const Pressed: Story = {
  render: single,
  play: async ({ canvas }) => press(canvas.getByRole("button")),
};

export const Pending: Story = {
  render: (_args, context) => {
    const copy = copyOf(context).button;
    return (
      <div className="flex flex-col items-start gap-3">
        <Button isPending pendingLabel={copy.pending}>
          {copy.primary}
        </Button>
        <Button variant="secondary" isPending>
          {copy.secondary}
        </Button>
      </div>
    );
  },
};

/** UI05: switching to pending never changes the button's width. */
export const PendingKeepsWidth: Story = {
  render: (_args, context) => {
    const copy = copyOf(context).button;
    return (
      <div className="flex flex-col items-start gap-3">
        <Button>{copy.primary}</Button>
        <Button isPending pendingLabel={copy.pending}>
          {copy.primary}
        </Button>
        <Button variant="secondary">{copy.secondary}</Button>
        <Button variant="secondary" isPending>
          {copy.secondary}
        </Button>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const [idle, pending, idleSecondary, pendingSecondary] = [
      ...canvasElement.querySelectorAll("button"),
    ].map((button) => button.getBoundingClientRect().width);
    await expect(pending).toBe(idle);
    await expect(pendingSecondary).toBe(idleSecondary);
  },
};

/** UI05: focusable, announces why, and activating it does nothing. */
export const DisabledWithReason: Story = {
  render: (_args, context) => {
    const copy = copyOf(context).button;
    return (
      <form onSubmit={(event) => event.preventDefault()}>
        <Button type="submit" disabledReason={copy.disabledReason}>
          {copy.primary}
        </Button>
      </form>
    );
  },
  play: async ({ canvasElement, userEvent }) => {
    const button = within(canvasElement).getByRole("button");
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAccessibleDescription(copyOf({ globals: {} }).button.disabledReason);
  },
};

export const LongText: Story = {
  render: () => (
    <div className="max-w-80">
      <Button>{longText}</Button>
    </div>
  ),
};
