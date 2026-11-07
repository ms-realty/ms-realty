// Disposable synthetic tests only; no real CMS, service, human or locale approval evidence.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "@/db/schema";
import { createContent, decideContent, readContentWorkbench } from "@/server/content/commands";
import { readApprovedContent } from "@/server/content/public";
import type { Executor } from "@/server/db";
import { syntheticServiceFixture } from "@/server/service-intake/testing";

export async function createCmsIndexabilityFixture(db: Executor) {
  const service = await syntheticServiceFixture(db);
  const native = [];
  for (const route of [
    { kind: "help", slug: "contact", path: "/contact" },
    { kind: "service", slug: "sell", path: "/sell" },
    { kind: "service", slug: "let", path: "/let" },
  ] as const) {
    const input = {
      operationId: randomUUID(),
      kind: route.kind,
      slug: route.slug,
      title: `Синтетична страница ${route.slug}`,
      text: `Синтетичен текст ${route.slug}. Само тест, не реална услуга или съвет.`,
      jurisdiction: "Synthetic only",
      reviewScope: "Synthetic exact CMS edition test only",
    };
    const created = await createContent(db, service.session, input);
    for (const decision of ["claims", "editorial", "publish"] as const) {
      const { page } = await readContentWorkbench(db, service.session, created.outcome.id);
      await decideContent(db, service.session, {
        id: page.id,
        operationId: randomUUID(),
        expectedVersion: page.version,
        decision,
        reviewed: true,
        note: "Synthetic test decision, not actual review or indexing authority",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    }
    const content = await readApprovedContent(db, route.kind, route.slug, "bg");
    if (!content) throw new Error("Synthetic CMS edition was not approved");
    native.push({ ...route, content });
  }
  return { service, native };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
    throw new Error("CMS fixtures require the disposable E2E database");
  const sql = postgres(url, { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  try {
    if (process.argv[2] === "expire") {
      const ids = z.array(z.uuid()).min(1).parse(process.argv.slice(3));
      await db
        .update(schema.approvals)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(inArray(schema.approvals.subjectId, ids));
      console.log(JSON.stringify({ expiredSyntheticVersions: ids }));
    } else {
      const fixture = await createCmsIndexabilityFixture(db);
      console.log(
        JSON.stringify({
          native: fixture.native,
          generic: {
            path: `/services/${fixture.service.source.slug}`,
            content: fixture.service.content,
          },
        }),
      );
    }
  } finally {
    await sql.end();
  }
}
