import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ADMIN_APP_JS, PUBLIC_APP_JS } from "../lib/ui/client.mjs";

test("public client loads the pinned local Photo Sphere Viewer bundle only for approved HTTPS panorama markup", () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const bundle = new URL("../../public/vendor/photo-sphere-viewer.js", import.meta.url);
  const styles = new URL("../../public/vendor/photo-sphere-viewer.css", import.meta.url);
  const publicClient = new URL("../../public/vendor/ms-realty-public.js", import.meta.url);
  const adminClient = new URL("../../public/vendor/ms-realty-admin.js", import.meta.url);

  assert.equal(packageJson.dependencies["@photo-sphere-viewer/core"], "5.14.3");
  assert.equal(fs.existsSync(bundle), true);
  assert.equal(fs.existsSync(styles), true);
  assert.equal(fs.existsSync(publicClient), true);
  assert.equal(fs.existsSync(adminClient), true);
  assert.match(fs.readFileSync(bundle, "utf8"), /MSRealtyPhotoSphereViewer/);
  assert.equal(fs.readFileSync(publicClient, "utf8").endsWith(`${PUBLIC_APP_JS}\n`), true);
  assert.equal(fs.readFileSync(adminClient, "utf8").endsWith(`${ADMIN_APP_JS}\n`), true);
  assert.doesNotThrow(() => new Function(PUBLIC_APP_JS));
  assert.doesNotThrow(() => new Function(ADMIN_APP_JS));
  assert.match(PUBLIC_APP_JS, /PHOTO_SPHERE_VIEWER_SCRIPT_URL = "\/vendor\/photo-sphere-viewer\.js"/);
  assert.match(PUBLIC_APP_JS, /PHOTO_SPHERE_VIEWER_CSS_URL = "\/vendor\/photo-sphere-viewer\.css"/);
  assert.match(PUBLIC_APP_JS, /function loadPhotoSphereViewer/);
  assert.doesNotMatch(PUBLIC_APP_JS, /esm\.sh|jsdelivr/);
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

test("public client submits Hermes questions without exposing provider credentials", () => {
  assert.match(PUBLIC_APP_JS, /function submitHermesChat/);
  assert.match(PUBLIC_APP_JS, /data-hermes-chat-form/);
  assert.match(PUBLIC_APP_JS, /payload\.kind !== "hermes_public_chat"/);
  assert.match(PUBLIC_APP_JS, /data-hermes-sources-label/);
  assert.match(PUBLIC_APP_JS, /function isSafeInternalPath/);
  assert.match(PUBLIC_APP_JS, /if \(!isSafeInternalPath\(citation\.path\)\) continue;/);
  assert.doesNotMatch(PUBLIC_APP_JS, /HERMES_API_KEY|HERMES_CHAT_COMPLETIONS_URL/);
});
