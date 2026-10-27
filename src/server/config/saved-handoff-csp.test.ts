import { expect, it } from "vitest";
import { savedHandoffFormTargets } from "./saved-handoff-csp";

const origins = {
  public: "https://public.example.test",
  client: "https://client.example.test",
  staff: "https://staff.example.test",
};
it("C05 permits only the exact configured HTTPS handoff and necessary clean continuations on the public Saved entry", () => {
  expect(savedHandoffFormTargets("public", "/bg/saved", origins)).toEqual([
    "https://client.example.test/bg/saved/handoff",
    "https://client.example.test/bg/saved/import",
    "https://client.example.test/bg/access",
  ]);
  for (const path of ["/bg/inquire", "/bg/saved/other", "/bg/saved/", "/invalid/saved"])
    expect(savedHandoffFormTargets("public", path, origins)).toEqual([]);
  expect(savedHandoffFormTargets("client", "/bg/saved", origins)).toEqual([]);
  expect(savedHandoffFormTargets("staff", "/bg/saved", origins)).toEqual([]);
  expect(
    savedHandoffFormTargets("public", "/bg/saved", {
      ...origins,
      client: "http://client.example.test",
    }),
  ).toEqual([]);
});
