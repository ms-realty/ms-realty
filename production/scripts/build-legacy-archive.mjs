import { buildLegacyArchiveFromFile, writeLegacyArchive } from "../lib/legacy-archive.mjs";

const { outPath, summary } = writeLegacyArchive(buildLegacyArchiveFromFile());

console.log("Wrote " + summary.archive_rows + " legacy archive rows to " + outPath);
console.log(
  "Source rows: " +
    summary.source_rows +
    "; eligible rows: " +
    summary.eligible_rows +
    "; excluded rows: " +
    summary.excluded_rows +
    "; duplicate URL rows: " +
    summary.duplicate_url_rows,
);
