export const sidebarPreferenceCookie = "msr_sidebar_mode";
export type SidebarMode = "expanded" | "compact";
export function sidebarMode(value: string | undefined): SidebarMode {
  return value === "compact" ? "compact" : "expanded";
}
