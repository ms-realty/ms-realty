/** F13 staff navigation after sign-in. Destinations still authorize every read and action. */
const workspaceRoots = new Set([
  "today",
  "inbox",
  "inquiries",
  "tasks",
  "contacts",
  "parties",
  "cases",
  "calendar",
  "appointments",
  "inventory",
  "reviews",
  "publications",
  "corrections",
  "content",
  "operations",
  "coverage",
  "reports",
  "assistance",
  "butler",
  "settings",
  "tools",
]);

/** Receives an already same-host normalized path; access and executable endpoints never qualify. */
export function staffWorkspacePath(locale: string, path: string | null | undefined) {
  if (!path?.startsWith(`/${locale}/`)) return null;
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const segments = pathname.slice(locale.length + 2).split("/");
  if (!workspaceRoots.has(segments[0] ?? "")) return null;
  if (segments.some((segment) => ["submit", "download", "calendar.ics"].includes(segment)))
    return null;
  return path;
}
