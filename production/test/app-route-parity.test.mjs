import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

function routeFile(route) {
  return fromRoot("app", ...route.split("/").filter(Boolean), "route.js");
}

test("App Router has handoff files for every explicit HTTP route", () => {
  const httpSource = fs.readFileSync(fromRoot("production", "lib", "http.mjs"), "utf8");
  const routes = [...httpSource.matchAll(/url\.pathname === "([^"]+)"/g)].map((match) => match[1]);
  const missing = [...new Set(routes)].filter((route) => !fs.existsSync(routeFile(route)));

  assert.deepEqual(missing, []);
});
