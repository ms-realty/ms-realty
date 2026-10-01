import { publicLocales } from "@/i18n/config";
import { localizedPath, stagingEnabled } from "@/i18n/seo";
import { legacySnapshotPages } from "@/server/legacy/pages";
import { publicSeoOrigin } from "@/server/seo/public-metadata";
import { publicCataloguePages, publicContentPages } from "@/server/seo/public-pages";

// Public projections only. Neither this index nor a crawler can confer publication,
// translation, legal or source-equivalence approval.
export async function GET() {
  const origin = publicSeoOrigin();
  const url = (path: string) => new URL(path, origin).toString();
  const rows = [
    "# MS Realty",
    "",
    "> Property listings and agency information. Bulgarian is the source locale. Property facts and availability must be checked on the linked page; unknown facts are not assertions.",
    "",
    "## Public site",
    `- [Home](${url("/bg")})`,
    `- [Sitemap](${url("/sitemap.xml")})`,
    ...publicLocales.map(
      (locale) => `- [Properties (${locale})](${url(localizedPath(locale, "/properties"))})`,
    ),
    "",
    "## Published listings",
    ...(await publicCataloguePages()).map(
      (page) =>
        `- [${page.reference} (${page.locale})](${url(localizedPath(page.locale, page.path))})`,
    ),
    "",
    "## Approved agency content",
    ...(await publicContentPages()).map(
      (page) => `- [${page.path} (${page.locale})](${url(localizedPath(page.locale, page.path))})`,
    ),
    "",
    "## Preserved legacy sources",
    ...legacySnapshotPages().map(
      (page) =>
        `- [${page.id} (${page.locale})](${url(page.canonicalPath)}): Preserved source text; migration equivalence and current listing status require separate verification.`,
    ),
    "",
  ];
  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...(stagingEnabled() ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    },
  });
}
