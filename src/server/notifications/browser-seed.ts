// Synthetic fixture only in the generated, disposable browser database: a Deal with a requested
// viewing and a client who chose service email.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { viewingFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} });
try {
  const f = await viewingFixture(drizzle(connection, { schema }), { locale: "en" });
  console.log(
    JSON.stringify({
      caseId: f.record.id,
      appointmentId: f.request.id,
      staffToken: f.staff.token,
      staffEmail: f.staff.email,
      clientToken: f.client.token,
      clientEmail: f.email?.address,
    }),
  );
} finally {
  await connection.end();
}
