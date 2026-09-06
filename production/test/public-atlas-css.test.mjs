import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("generated Atlas CSS preserves descendant pseudo-class selectors", () => {
  const css = readFileSync(new URL("../../public/vendor/ms-realty-public.css", import.meta.url), "utf8");
  assert.ok(css.includes('.site-ft :is(a,p,li,span,summary){color:var(--atlas-muted)}'));
  assert.ok(css.includes('[data-atlas-public] :is(button,select,summary,.mk-btn){min-height:44px}'));
  assert.ok(css.includes('.hp-discovery__panel::details-content{content-visibility:visible}'));
  assert.ok(css.includes('html[data-theme="dark"]:has(main[data-atlas-public])'));
});
