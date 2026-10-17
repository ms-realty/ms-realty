// Shared by the colocated *.stories.tsx files: copy for the toolbar locale and the play
// helpers that put a component into an interaction state for its story and screenshot.
import { userEvent } from "storybook/test";
import type { PublicLocale } from "@/i18n/config";
import { type SpecimenCopy, specimenCopy } from "./copy";

type WithGlobals = { globals: Record<string, unknown> };

export function localeOf(context: WithGlobals): PublicLocale {
  return (context.globals.locale as PublicLocale | undefined) ?? "en";
}

/** Specimen copy in the toolbar locale (bg, en and he are written out; others use en). */
export function copyOf(context: WithGlobals): SpecimenCopy {
  return specimenCopy(localeOf(context));
}

/** Long enough to wrap at 390 px in every locale (spec §18.8 content ranges). */
export const longText =
  "Request a viewing of the renovated three-bedroom apartment near the town centre, with parking";

export async function hover(element: Element): Promise<void> {
  await userEvent.hover(element);
}

/** Focus as a keyboard user would, so focus-visible styles apply. */
export async function focusVisible(element: HTMLElement): Promise<void> {
  await userEvent.keyboard("{Shift}");
  element.focus();
}

/** Holds the pointer down on the element without releasing it. */
export async function press(element: Element): Promise<void> {
  await userEvent.pointer({ keys: "[MouseLeft>]", target: element });
}
