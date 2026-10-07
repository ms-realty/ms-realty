import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "../cases/testing";
import { complaintFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const manager = await complaintFixture(db),
    broker = await staffFixture(db);
  console.log(
    JSON.stringify({ staffToken: manager.token, staffId: manager.id, brokerToken: broker.token }),
  );
} finally {
  await connection.end();
}
