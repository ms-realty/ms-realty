import { expect, it } from "vitest";
import { staffWorkspacePath } from "./staff-return-path";

it.each([
  "/bg/cases/synthetic",
  "/bg/inquiries/synthetic?view=mine",
  "/bg/inventory/MS-90000?tab=facts",
])("F13 preserves workspace destination %s", (path) =>
  expect(staffWorkspacePath("bg", path)).toBe(path),
);
it.each([
  "/en/cases/synthetic",
  "/bg/access",
  "/bg/access/reauth",
  "/bg/unknown",
  "/bg/inventory/MS-90000/media/submit",
  null,
])("F13 rejects non-workspace or executable destination %s", (path) =>
  expect(staffWorkspacePath("bg", path)).toBeNull(),
);
