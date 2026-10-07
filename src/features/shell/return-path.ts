// Where the X02 page's Close («Go / BACK») returns: the workspace page the person came from.
import { homePaths } from "@/server/config/hosts";

/**
 * The page named by the Referer header when it is a staff workspace page in this locale on this
 * origin, with its query; otherwise the workspace home. Never the tools page itself or an
 * access page (sign-in, enrolment, recovery), so Close always leaves for real work.
 */
export function toolsReturnPath(
  referer: string | null,
  staffOrigin: string,
  locale: string,
  toolsPath: string,
): string {
  const home = `/${locale}${homePaths.staff}`;
  let url: URL;
  try {
    url = new URL(referer ?? "");
  } catch {
    return home;
  }
  const { pathname } = url;
  if (
    url.origin !== staffOrigin ||
    !pathname.startsWith(`/${locale}/`) ||
    pathname === toolsPath ||
    pathname === `/${locale}/access` ||
    pathname.startsWith(`/${locale}/access/`)
  )
    return home;
  return `${pathname}${url.search}`;
}
