import { expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { privateRead } from "./screens";

it.each(["not_found", "forbidden"] as const)(
  "keeps a private %s indistinguishable from a missing record",
  async (code) => {
    await expect(
      privateRead(async () => {
        throw new AppError(code);
      }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  },
);

it("does not turn an unexpected record-read failure into a false 404", async () => {
  const unavailable = new Error("database unavailable");
  await expect(
    privateRead(async () => {
      throw unavailable;
    }),
  ).rejects.toBe(unavailable);
});
