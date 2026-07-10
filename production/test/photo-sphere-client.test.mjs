import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ADMIN_APP_JS, PUBLIC_APP_JS } from "../lib/ui/client.mjs";

test("public client loads the pinned Photo Sphere Viewer only for approved HTTPS panorama markup", () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  assert.equal(packageJson.dependencies["@photo-sphere-viewer/core"], "5.14.3");
  assert.match(PUBLIC_APP_JS, /@photo-sphere-viewer\/core@" \+ PHOTO_SPHERE_VIEWER_VERSION \+ "\?bundle/);
  assert.match(PUBLIC_APP_JS, /\[data-photo-sphere-viewer="psv-listing-tour"\]/);
  assert.match(PUBLIC_APP_JS, /data-panorama-url/);
  assert.match(PUBLIC_APP_JS, /function isApprovedPanoramaUrl/);
  assert.match(PUBLIC_APP_JS, /keyboard: false/);
  assert.match(PUBLIC_APP_JS, /startKeyboardControl/);
  assert.match(PUBLIC_APP_JS, /data-photo-sphere-viewer-state", "fallback/);
  assert.match(PUBLIC_APP_JS, /addEventListener\("pagehide"/);
});

test("admin client enhances the reviewed 360 form without disabling lead queue filters", () => {
  assert.match(ADMIN_APP_JS, /initLeadQueueFilters\(\);\s*initTourEditor\(\);/);
  assert.match(ADMIN_APP_JS, /data-tour-editor-form/);
  assert.match(ADMIN_APP_JS, /function tourPayload/);
  assert.match(ADMIN_APP_JS, /credentials: "same-origin"/);
  assert.match(ADMIN_APP_JS, /payload\.is_public !== true/);
  assert.match(ADMIN_APP_JS, /data-tour-review-status", "available/);
});
