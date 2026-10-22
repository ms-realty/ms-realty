// Read-only diagnostics for an already owned synthetic load database; never a live database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { eligiblePublications } from "../src/server/publication/presentation";
import { searchListings } from "../src/server/search/search";

const url = new URL(process.env.E2E_DATABASE_URL ?? "invalid:");
assert(
  ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    /^\/msr_e2e_[a-f0-9]{32}$/.test(url.pathname),
);
assert(process.env.LOAD_QUERY_REPORT);
const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
const captured: { query: string; params: unknown[] }[] = [];
const db = drizzle(client, {
  schema,
  logger: {
    logQuery(query, params) {
      captured.push({ query, params });
    },
  },
});
try {
  const metrics = [];
  for (const q of ["", "апартамент"]) {
    captured.length = 0;
    const at = performance.now();
    const result = await searchListings(db, { locale: "bg", purpose: "sale", q });
    const durationMs = performance.now() - at;
    const queries = [...captured];
    const plans = [];
    for (const statement of queries) {
      assert(statement.query.startsWith("select "));
      plans.push(
        await client.unsafe(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.query}`,
          statement.params as never[],
        ),
      );
    }
    metrics.push({
      q,
      durationMs,
      count: result.count,
      references: result.items.map((i) => i.reference),
      plans,
    });
  }
  const ids = await db.select().from(eligiblePublications(db, "bg"));
  const idsSha256 = createHash("sha256")
    .update(
      ids
        .map((r) => r.listingId)
        .sort()
        .join("\n"),
    )
    .digest("hex");
  await writeFile(
    process.env.LOAD_QUERY_REPORT,
    JSON.stringify({ metrics, idsSha256, eligibleCount: ids.length }, null, 2),
  );
  console.log(
    JSON.stringify({
      eligibleCount: ids.length,
      idsSha256,
      metrics: metrics.map(({ q, durationMs, count }) => ({ q, durationMs, count })),
    }),
  );
} finally {
  await client.end();
}
