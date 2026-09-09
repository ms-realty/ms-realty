import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appRouterConfigFromEnv, renderAppRouteResponse } from "../lib/app-router-adapter.mjs";

test("App Router reads the runtime slug ledger before loading Payload, including later appends", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msr-slug-route-"));
  const slugHistoryPath = path.join(dir, "slugs.jsonl");
  const oldPath = "/bg/imoti/MS-CRAWL-0002";
  const row = { old_path: oldPath, new_path: "/bg/imoti/MS-00907", status: 301 };
  const config = appRouterConfigFromEnv({ NODE_ENV: "production", MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload", MS_REALTY_SLUG_HISTORY_PATH: slugHistoryPath });
  try {
    fs.writeFileSync(slugHistoryPath, `${JSON.stringify(row)}\n`);
    for (const pathname of [oldPath, `${oldPath}/`]) {
      const response = await renderAppRouteResponse({ pathname, url: `${pathname}?ref=old`, host: "makler-realty.com", config });
      assert.equal(response.status, 301);
      assert.equal(response.headers.get("location"), row.new_path);
    }
    fs.appendFileSync(slugHistoryPath, `${JSON.stringify({ ...row, new_path: "/bg/imoti/MS-00815" })}\n`);
    const response = await renderAppRouteResponse({ pathname: oldPath, host: "makler-realty.com", config });
    assert.equal(response.headers.get("location"), "/bg/imoti/MS-00815");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
