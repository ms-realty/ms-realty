import fs from "node:fs";
import { fromRoot } from "./paths.mjs";

const BUILD_MARKER_PATH = fromRoot(".ms-realty-build-marker");
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

// This file is written during the container build. It intentionally does not
// consult runtime env so a Worker deployment cannot relabel an old image.
export function readBuildMarker(markerPath = BUILD_MARKER_PATH) {
  try {
    const marker = fs.readFileSync(markerPath, "utf8").trim();
    return COMMIT_SHA.test(marker) ? marker : "unversioned";
  } catch {
    return "unversioned";
  }
}
