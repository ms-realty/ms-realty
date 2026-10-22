import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { calendarFixture } from "./calendar-testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable calendar browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} });
try {
  const f = await calendarFixture(drizzle(connection, { schema }));
  console.log(
    JSON.stringify({
      token: f.token,
      viewerId: f.viewer.id,
      caseId: f.caseId,
      replacement: { id: f.replacement.id, reference: f.replacement.reference },
      teammate: { id: f.teammate.id, reference: f.teammate.reference },
      proposal: { id: f.proposal.id, reference: f.proposal.reference },
      hidden: { id: f.hidden.id, reference: f.hidden.reference },
      readOnly: { id: f.readOnly.id, reference: f.readOnly.reference },
      request: { id: f.request.id, reference: f.request.reference },
    }),
  );
} finally {
  await connection.end();
}
