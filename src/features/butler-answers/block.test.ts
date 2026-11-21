import { afterEach, describe, expect, it, vi } from "vitest";

// ADR 0017: with the deployment kill switch off the block is absent and nothing is read.
vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("the database must not be touched while the block is off");
  },
}));

import { ButlerAnswers } from "./block";

afterEach(() => vi.unstubAllEnvs());

describe("ButlerAnswers", () => {
  it("renders nothing and reads nothing with BUTLER_PUBLIC_ANSWERS=0", async () => {
    vi.stubEnv("BUTLER_PUBLIC_ANSWERS", "0");
    expect(await ButlerAnswers({ reference: "MS-10234", locale: "en" })).toBeNull();
  });

  it("also honours the legacy HERMES_ name when the Butler name is absent", async () => {
    vi.stubEnv("HERMES_PUBLIC_ANSWERS", "0");
    expect(await ButlerAnswers({ reference: "MS-10234", locale: "en" })).toBeNull();
  });
});
