import "server-only";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { caseCopy } from "@/features/cases/copy";
import { privacyCopy } from "@/features/privacy/copy";
import { agencyTools, journeyNav } from "@/features/shell/navigation";
import type { PublicLocale } from "@/i18n/config";
import { workflowCopy } from "@/i18n/workflow-copy";

/** Uses route identity only: no extra private-data query and no token/query-string titles. */
export async function privatePageMetadata(input: {
  surface: "staff" | "client";
  locale: PublicLocale;
  path: string | null;
}): Promise<Pick<Metadata, "title">> {
  const { surface, locale } = input;
  const actions = workflowCopy(locale, "pageTitles");
  const external = input.path?.split(/[?#]/)[0]?.replace(/^\/(staff|client)(?=\/)/, "");
  const path =
    external === `/${locale}`
      ? "/"
      : external?.startsWith(`/${locale}/`)
        ? external.slice(locale.length + 1)
        : "/";
  const segments = path.split("/").filter(Boolean);
  const sensitive = ["access", "auth", "invitations", "enrol", "recovery"].includes(
    segments[0] ?? "",
  );
  let title: string;
  if (surface === "staff") {
    const [tools, workspace] = await Promise.all([
      getTranslations({ locale, namespace: "tools" }),
      getTranslations({ locale, namespace: "workspace" }),
    ]);
    const item = Object.values(agencyTools)
      .flat()
      .filter((entry) => entry.path)
      .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))
      .find((entry) => path === entry.path || path.startsWith(`${entry.path}/`));
    title =
      path === "/search"
        ? workspace("search")
        : item
          ? tools(`items.${item.label}.title`)
          : path.startsWith("/operations/assistance")
            ? workspace("butler")
            : path.startsWith("/operations")
              ? tools("title")
              : workspace("label");
  } else {
    const nav = await getTranslations({ locale, namespace: "nav" });
    const local = segments[0] === "cases" && segments[1] ? `/${segments.slice(2).join("/")}` : path;
    const c = caseCopy(locale);
    const extra: Record<string, string> = {
      "/": c.overview,
      "/cases": c.overview,
      "/brief": c.brief,
      "/proposals": c.proposals,
      "/listing-preview": workflowCopy(locale, "ownerPreview").title,
      "/participants": workflowCopy(locale, "caseAccess").title,
      "/lifecycle": workflowCopy(locale, "lifecycle").title,
      "/closeout": workflowCopy(locale, "lifecycle").title,
      "/preferences": privacyCopy(locale).preferences,
      "/privacy-requests": privacyCopy(locale).privacy,
      "/help": nav("journey.help"),
      "/saved": nav("saved"),
    };
    const item = journeyNav.find(
      (entry) => entry.path && (local === entry.path || local.startsWith(`${entry.path}/`)),
    );
    title = item
      ? nav(`journey.${item.label}`)
      : (extra[`/${local.split("/").filter(Boolean)[0] ?? ""}`] ?? nav("journey.label"));
  }
  const references = sensitive
    ? []
    : segments.filter(
        (segment) =>
          /^[A-Z]{1,8}-[A-Z\d-]{3,64}$/.test(segment) ||
          /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(segment),
      );
  const reference = references.at(-1);
  const hint =
    reference?.includes("-") && /^[a-f\d]{8}-/i.test(reference) ? reference.slice(0, 8) : reference;
  const last = segments.at(-1);
  const action =
    !sensitive && last && Object.hasOwn(actions, last)
      ? actions[last as keyof typeof actions]
      : null;
  return {
    title: {
      default: [title, hint, action, "MS Realty"].filter(Boolean).join(" · "),
      template: "%s · MS Realty",
    },
  };
}
