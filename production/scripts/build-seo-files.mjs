import { loadLocalizedSitemap, writeSeoFiles } from "../lib/seo-files.mjs";

const { sitemapPath, robotsPath } = writeSeoFiles(loadLocalizedSitemap());
console.log(`Wrote ${sitemapPath}`);
console.log(`Wrote ${robotsPath}`);
