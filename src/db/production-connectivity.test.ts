import { describe, expect, it } from "vitest";
import { probeProductionDatabase, productionSession } from "./production-connectivity";

const env = { PRODUCTION_DATABASE_ROLE: "msr_web" };
const row = {
  database: "ms_realty_payload",
  role: "msr_web",
  server_version_num: 160014,
  ssl: true,
  tls_version: "TLSv1.3",
  cipher: "unit-session-cipher",
};
describe("production session evaluator (unit observations only)", () => {
  it("retains measured database/role/engine/TLS rather than accepting a status label", () => {
    expect(productionSession(row, env)).toEqual({
      database: "ms_realty_payload",
      role: "msr_web",
      engineVersion: "16.14",
      ssl: true,
      tlsVersion: "TLSv1.3",
      cipher: "unit-session-cipher",
    });
  });
  it.each([
    { database: "msr_stage" },
    { role: "postgres" },
    { server_version_num: 160013 },
    { ssl: false },
    { tls_version: "TLSv1.1" },
    { cipher: "" },
  ])("rejects a measured mismatch %#", (changed) =>
    expect(() => productionSession({ ...row, ...changed }, env)).toThrow(
      /session identity mismatch/,
    ),
  );
  it("rejects absence or an asserted PASS without session observations", () => {
    expect(() => productionSession(undefined, env)).toThrow();
    expect(() => productionSession({ status: "PASS" }, env)).toThrow();
  });
  it("rejects missing production identity before opening SQL connections", async () => {
    await expect(
      probeProductionDatabase({ STAGING: "true", DATABASE_URL: "private-invalid-value" }),
    ).rejects.toThrow(/PRODUCTION_DATABASE_HOST\/NAME\/ROLE/);
  });
});
