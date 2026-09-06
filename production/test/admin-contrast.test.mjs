import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Contrast is arithmetic, not taste. These pairs are the ones the workbench
// actually renders: a role that carries text, against each of the three
// surfaces it can land on. Three of them shipped below the floor until
// 2026-09-01 -- --text-subtle at 2.04:1 in a well, and the border that is the
// only thing identifying a text field at 1.66:1 -- so they are pinned here.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = fs.readFileSync(path.join(ROOT, "public/vendor/ms-realty-admin.css"), "utf8");

/** Every ramp step the sheet declares, so a ramp edit is caught here too. */
function ramp() {
  const out = new Map();
  for (const [, name, hex] of css.matchAll(/--((?:stone|ink|brick|sea|sun|success|warning|danger)-\d{2,3}):\s*(#[0-9A-Fa-f]{6})/g)) {
    if (!out.has(name)) out.set(name, hex.toUpperCase());
  }
  return out;
}
const RAMP = ramp();
const hex = (name) => {
  const v = RAMP.get(name);
  assert.ok(v, `ramp step --${name} is declared in the built stylesheet`);
  return v;
};

function luminance(h) {
  const channel = (i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The three surfaces workbench text lands on, light theme.
const SURFACE = "#FFFFFF";
const CANVAS = () => hex("ink-50");
const WELL = () => hex("stone-100");

/** What the light workbench block actually maps a role to, not what we hope.
 *  There are several `.crm-app{` rules in the bundle -- the kit's layout rule
 *  comes first -- so this finds the one that carries the token overrides. */
const workbench = (() => {
  for (const m of css.matchAll(/\.crm-app\{/g)) {
    const block = css.slice(m.index, css.indexOf("}", m.index) + 1);
    if (block.includes("--text-muted:")) return block;
  }
  assert.fail("the .crm-app block that overrides the text tokens was not found");
})();
function roleStep(role) {
  const m = workbench.match(new RegExp(`${role}:\\s*var\\(--([\\w-]+)\\)`));
  assert.ok(m, `${role} is mapped inside the .crm-app token block`);
  return m[1];
}

test("workbench text roles clear WCAG 2.2 AA on every surface they land on", () => {
  const roles = ["--text-muted", "--text-subtle", "--adm-label"].map((r) => [r, roleStep(r)]);
  // These two are not remapped by the workbench, so they come from the kit.
  roles.push(["--text-strong", "stone-900"], ["--text-body", "stone-800"]);
  for (const [role, step] of roles) {
    for (const [where, bg] of [["a panel", SURFACE], ["the canvas", CANVAS()], ["a well", WELL()]]) {
      const r = ratio(hex(step), bg);
      assert.ok(r >= 4.5, `${role} (${step} ${hex(step)}) on ${where} ${bg} is ${r.toFixed(2)}:1, below 4.5:1`);
    }
  }
});

test("--text-subtle is not a lighter step than --text-muted in the workbench", () => {
  // Kept as an alias so its seventeen call sites stay correct. If someone gives
  // it its own value again, it has to clear the floor above on its own.
  assert.match(css, /--text-subtle:\s*var\(--stone-600\)/,
    "the light workbench aliases --text-subtle to the muted value");
  assert.match(css, /--text-subtle:\s*var\(--stone-400\)/,
    "the dark workbench does the same, one rung the other way");
});

test("a text field's border clears the 3:1 that WCAG 1.4.11 asks of it", () => {
  assert.match(css, /\.crm-app \.mk-input__field,\.crm-app \.mk-select__field\{border-color:var\(--ink-400\)\}/,
    "controls carry the raised edge rather than the token used for separators");
  const r = ratio(hex("ink-400"), SURFACE);
  assert.ok(r >= 3, `the control edge (ink-400 ${hex("ink-400")}) is ${r.toFixed(2)}:1 on the field's surface, below 3:1`);
});

test("status pill foregrounds clear AA on their own tints", () => {
  for (const [fg, bg] of [["success-600", "success-50"], ["danger-600", "danger-50"], ["sea-600", "sea-50"]]) {
    const r = ratio(hex(fg), hex(bg));
    assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1, below 4.5:1`);
  }
});
