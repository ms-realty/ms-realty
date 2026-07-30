import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

function routeFile(route) {
  return fromRoot("app", ...route.split("/").filter(Boolean), "route.js");
}

function hasRouteFile(route) {
  if (fs.existsSync(routeFile(route))) return true;
  const segments = route.split("/").filter(Boolean);
  for (let depth = segments.length; depth > 0; depth -= 1) {
    if (fs.existsSync(fromRoot("app", ...segments.slice(0, depth), "[[...path]]", "route.js"))) return true;
  }
  return false;
}

test("App Router has handoff files for every explicit HTTP route", () => {
  const httpSource = fs.readFileSync(fromRoot("production", "lib", "http.mjs"), "utf8");
  const routes = [...httpSource.matchAll(/url\.pathname === "([^"]+)"/g)].map((match) => match[1]);
  const missing = [...new Set(routes)].filter((route) => !hasRouteFile(route));

  assert.deepEqual(missing, []);
});
