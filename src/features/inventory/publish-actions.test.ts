// The bulk publish action validates before it touches the database: what it returns keeps the
// ticked listings and puts each error where it belongs (ADR 0012 round 4, G).
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { formFields } from "@/ui/form/contract";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/auth/pages", () => ({ currentStaffAccess: vi.fn() }));
vi.mock("@/server/http/next", () => ({ action: vi.fn() }));

const { bulkPublishAction } = await import("./publish-actions");

const previous = {
  values: { attested: "", selected: "" },
  operationId: randomUUID(),
  expectedRevision: null,
  responseId: randomUUID(),
  outcome: { kind: "idle" as const },
};

function form(entries: [string, string][]) {
  const data = new FormData();
  data.set(formFields.operationId, randomUUID());
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("bulk publish validation", () => {
  it("keeps the ticked listings when the attestation is missing", async () => {
    const state = await bulkPublishAction(
      "en",
      previous,
      form([
        ["reference", "MS-00815"],
        ["reference", "MS-00101"],
        ["reference", "not a reference"],
      ]),
    );
    expect(state.values.selected).toBe("MS-00815,MS-00101");
    expect(state.outcome).toMatchObject({
      kind: "validation",
      fieldErrors: { attested: ["Tick the box to confirm that you checked the listing."] },
    });
    expect(state.outcome).not.toMatchObject({ fieldErrors: { selected: expect.anything() } });
  });

  it("puts 'select at least one listing' on the list, not on the attestation box", async () => {
    const state = await bulkPublishAction("en", previous, form([["attested", "yes"]]));
    expect(state.values.attested).toBe("yes");
    expect(state.outcome).toMatchObject({
      kind: "validation",
      fieldErrors: { selected: ["Select at least one listing."] },
    });
    expect(state.outcome).not.toMatchObject({ fieldErrors: { attested: expect.anything() } });
  });
});
