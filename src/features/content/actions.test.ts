import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, toErrorBody } from "@/server/errors";
import type { HandlerContext } from "@/server/http/next";
import { formFields } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import { type ContentValues, saveContentAction } from "./actions";
import { contentCopy } from "./copy";

const mocks = vi.hoisted(() => ({ save: vi.fn(), host: vi.fn() }));
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocks.host }));
vi.mock("@/server/content/commands", () => ({
  saveContent: mocks.save,
  createContent: vi.fn(),
  decideContent: vi.fn(),
  readContentWorkbench: vi.fn(),
}));
vi.mock("@/server/http/next", () => ({
  // Exercise the action's command/error adapter without a Next request or database.
  action: async <T>(fn: (context: HandlerContext) => Promise<T>) => {
    try {
      return {
        ok: true,
        data: await fn({
          db: "unused",
          session: { actor: { kind: "staff" } },
        } as unknown as HandlerContext),
      };
    } catch (error) {
      return { ok: false, error: toErrorBody(error, "synthetic-action-check") };
    }
  },
}));

const id = "10000000-0000-4000-8000-000000000001";
const placeId = "10000000-0000-4000-8000-000000000002";
function form(kind: string) {
  const initial = initialFormState<ContentValues>(
    `content.save.${id}`,
    {
      kind,
      slug: "synthetic-area",
      title: "Синтетичен материал",
      text: "Synthetic action test only.",
      jurisdiction: "Synthetic scope",
      reviewScope: "Synthetic review",
      placeId,
    },
    4,
  );
  const data = new FormData();
  for (const [name, value] of Object.entries(initial.values)) data.set(name, value);
  data.set(formFields.operationId, initial.operationId);
  data.set(formFields.expectedRevision, "4");
  data.set(formFields.intent, "submit");
  return { initial, data };
}

beforeEach(() => vi.clearAllMocks());

describe.each(["bg", "ru", "en"])("CMS location validation in %s", (locale) => {
  it("reports a disappeared recorded place on an area draft and retains the submitted identity", async () => {
    const { initial, data } = form("area");
    mocks.save.mockRejectedValueOnce(
      new AppError("validation_failed", { fieldErrors: { placeId: ["place_not_available"] } }),
    );
    const result = await saveContentAction(locale, id, initial, data);
    expect(mocks.host).toHaveBeenCalledWith("staff");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(result.outcome).toMatchObject({
      kind: "validation",
      fieldErrors: { placeId: [contentCopy(locale).placeUnavailable] },
    });
    expect(result.values.placeId).toBe(placeId);
  });

  it("keeps the distinct area-only message for a non-area binding", async () => {
    const { initial, data } = form("help");
    mocks.save.mockRejectedValueOnce(
      new AppError("validation_failed", { fieldErrors: { placeId: ["area_content_required"] } }),
    );
    const result = await saveContentAction(locale, id, initial, data);
    expect(result.outcome).toMatchObject({
      kind: "validation",
      fieldErrors: { placeId: [contentCopy(locale).areaPlaceOnly] },
    });
    expect(result.values.placeId).toBe(placeId);
  });
});
