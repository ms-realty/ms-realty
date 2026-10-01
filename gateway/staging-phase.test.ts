import { expect, it } from "vitest";
import { stagingWorkAllowed } from "./staging-phase";

it("diagnostic and unknown phases keep all application effects closed", () => {
  for (const phase of [undefined, null, true, false, "true", "", "0", "FALSE", "qualified"])
    expect(stagingWorkAllowed(phase)).toBe(false);
  expect(stagingWorkAllowed("false")).toBe(true);
});
