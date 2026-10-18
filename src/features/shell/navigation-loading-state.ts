import { isPublicLocale, isStaffLocale, type PublicLocale } from "@/i18n/config";
import type { HostContext } from "@/server/config/hosts";

export const navigationStartEvent = "msr:navigation-start";
export const navigationErrorEvent = "msr:navigation-error";
const lists = new Set([
  "today",
  "inventory",
  "inquiries",
  "cases",
  "contacts",
  "calendar",
  "tasks",
  "content",
  "proposals",
  "overview",
  "properties",
  "appointments",
  "messages",
  "documents",
  "preferences",
  "operations",
]);

export type LoadingKind = "list" | "record" | "listing";
/**
 * The destination's own frame and heading box (M-046): its content replaces the skeleton in
 * place, so nothing jumps. `queue` is the inquiry detail, whose list stays beside it on wide
 * screens. Keep these in step with the screens named below.
 */
export type LoadingShape = { frame: string; heading: string; queue?: boolean };
export type LoadingTarget = { locale: PublicLocale; kind: LoadingKind; shape: LoadingShape };

// Inventory, cases and most staff screens: text-heading, sm:text-title.
const staffHeading = "h-[1.875rem] sm:h-10";
const staffPage: LoadingShape = {
  frame: "flex flex-col gap-6 px-gutter py-6 sm:gap-8 sm:px-gutter-wide sm:py-8",
  heading: staffHeading,
};
const workflowPage: LoadingShape = {
  frame: "mx-auto flex max-w-6xl flex-col gap-8 px-gutter py-6 lg:px-gutter-wide",
  heading: "h-[1.875rem]",
};
const clientOverview: LoadingShape = {
  frame: "mx-auto flex min-w-0 max-w-page flex-col gap-8 p-5 lg:p-8",
  heading: "h-[2.125rem] lg:h-10",
};
const surfaceShapes: Record<HostContext, LoadingShape> = {
  // DiscoveryPage
  public: {
    frame: "mx-auto flex max-w-page flex-col gap-8 px-gutter py-8 lg:px-gutter-wide lg:py-12",
    heading: "h-10",
  },
  client: workflowPage,
  staff: staffPage,
};
const staffShapes: Record<string, Partial<Record<LoadingKind, LoadingShape>>> = {
  // TodayScreen
  today: {
    list: {
      frame: "mx-auto flex min-w-0 max-w-page flex-col gap-6 p-gutter sm:gap-8 sm:p-gutter-wide",
      heading: staffHeading,
    },
  },
  // InboxScreen, InquiryScreen
  inquiries: {
    list: {
      frame:
        "mx-auto flex min-w-0 max-w-page flex-col gap-6 px-gutter py-6 sm:gap-8 sm:px-gutter-wide sm:py-8",
      heading: staffHeading,
    },
    record: {
      frame: "mx-auto min-w-0 max-w-page px-gutter py-6 sm:px-gutter-wide sm:py-8",
      heading: "h-10",
      queue: true,
    },
  },
  // CaseDirectoryScreen, WorkflowPage
  cases: {
    list: {
      frame: "flex flex-col gap-6 px-gutter py-5 sm:gap-8 sm:px-gutter-wide sm:py-8",
      heading: staffHeading,
    },
    record: workflowPage,
  },
  proposals: { list: workflowPage, record: workflowPage },
  // Inventory detail
  inventory: {
    record: {
      frame: "flex flex-col gap-6 px-gutter py-5 sm:gap-8 sm:px-gutter-wide sm:py-8",
      heading: staffHeading,
    },
  },
};

/** A pending read gets a shape, never record values or an enabled action. */
export function navigationLoadingTarget(
  surface: HostContext,
  href: string,
  current: string,
): LoadingTarget | null {
  const source = new URL(current);
  let target: URL;
  try {
    target = new URL(href, source);
  } catch {
    return null;
  }
  if (
    target.origin !== source.origin ||
    target.pathname + target.search === source.pathname + source.search
  )
    return null;
  const [locale, section, record, subpage] = target.pathname.slice(1).split("/");
  if (!locale || !isPublicLocale(locale) || (surface === "staff" && !isStaffLocale(locale)))
    return null;
  let kind: LoadingKind;
  if (surface === "public") {
    if (section !== "properties" || record === "intent") return null;
    kind = record ? "listing" : "list";
  } else {
    if (!section || !lists.has(section)) return null;
    kind = record ? "record" : "list";
  }
  const shape =
    (surface === "client" && section === "overview" && record !== "operations" && !subpage
      ? clientOverview
      : undefined) ??
    (surface === "staff" ? staffShapes[section ?? ""]?.[kind] : undefined) ??
    surfaceShapes[surface];
  return { locale, kind, shape };
}
