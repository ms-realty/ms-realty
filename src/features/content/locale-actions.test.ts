import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, toErrorBody } from "@/server/errors";
import type { HandlerContext } from "@/server/http/next";
import { formFields } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import {
  type ContentLocaleBinding,
  type LocaleContentValues,
  saveContentLocaleAction,
} from "./locale-actions";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  view: vi.fn(),
  host: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocks.host }));
vi.mock("@/server/content/locale-commands", () => ({
  saveContentLocale: mocks.save,
  decideContentLocale: vi.fn(),
  readContentLocaleWorkbench: mocks.view,
}));
vi.mock("@/server/http/next", () => ({
  action: async <T>(fn: (ctx: HandlerContext) => Promise<T>) => {
    try {
      return {
        ok: true,
        data: await fn({
          db: "unused",
          session: { actor: { kind: "staff" } },
        } as unknown as HandlerContext),
      };
    } catch (error) {
      return { ok: false, error: toErrorBody(error, "synthetic-locale-action") };
    }
  },
}));

const id = "10000000-0000-4000-8000-000000000001";
const binding: ContentLocaleBinding = {
  sourceExpectedVersion: 4,
  sourceVersionId: "10000000-0000-4000-8000-000000000002",
  sourceVersionHash: "a".repeat(64),
};
function form() {
  const initial = initialFormState<LocaleContentValues>(
    `content.locale.save.${id}.he`,
    { title: "כותרת בדיקה", text: "טקסט MS-00001 https://example.test/" },
    2,
  );
  const data = new FormData();
  for (const [name, value] of Object.entries(initial.values)) data.set(name, value);
  data.set(formFields.operationId, initial.operationId);
  data.set(formFields.expectedRevision, "2");
  data.set(formFields.intent, "submit");
  return { initial, data };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("O21 target edition native action boundary", () => {
  it("uses the server-bound target/source and exact issued request rather than forged hidden fields", async () => {
    const { initial, data } = form();
    data.set("sourceVersionId", "attacker-source");
    data.set("sourceVersionHash", "forged");
    data.set("locale", "en");
    mocks.save.mockResolvedValue({ outcome: { id, locale: "he", recordedAt: "synthetic" } });
    await expect(saveContentLocaleAction("en", id, "he", binding, initial, data)).rejects.toThrow(
      "redirect:/en/content/",
    );
    expect(mocks.save).toHaveBeenCalledWith("unused", expect.anything(), {
      ...binding,
      ...initial.values,
      id,
      locale: "he",
      operationId: initial.operationId,
      expectedVersion: 2,
    });
    expect(mocks.host).toHaveBeenCalledWith("staff");
  });
  it("keeps the same issued operation and complete Hebrew text when the save outcome is unknown", async () => {
    const { initial, data } = form();
    mocks.save.mockRejectedValueOnce(new AppError("outcome_unknown"));
    const result = await saveContentLocaleAction("en", id, "he", binding, initial, data);
    expect(result.operationId).toBe(initial.operationId);
    expect(result.values).toEqual(initial.values);
    expect(result.outcome).toMatchObject({
      kind: "unknown",
      status: { href: expect.stringContaining(encodeURIComponent(initial.operationId)) },
    });
  });
  it("preserves a conflicting draft and requires reopening a changed BG source before any reapply", async () => {
    const { initial, data } = form();
    mocks.save.mockRejectedValueOnce(new AppError("version_conflict"));
    mocks.view.mockResolvedValueOnce({
      page: { version: 5 },
      edition: { version: 4 },
      sourceReady: true,
      source: { version: { id: "replacement", number: 3, contentHash: "b".repeat(64) } },
      current: { body: { title: "Latest synthetic draft", paragraphs: ["Latest text"] } },
    });
    const result = await saveContentLocaleAction("en", id, "he", binding, initial, data);
    expect(result.values).toEqual(initial.values);
    expect(result.outcome).toMatchObject({
      kind: "conflict",
      latest: { values: { title: "Latest synthetic draft", text: "Latest text" } },
      recovery: { href: `/en/content/${id}/editions/he` },
    });
    if (result.outcome.kind !== "conflict") throw new Error("Expected conflict");
    expect(result.outcome.reapply).toBeUndefined();
  });
  it("rejects an invalid native form envelope before calling a content command", async () => {
    const { initial, data } = form();
    data.append(formFields.operationId, "duplicate");
    const result = await saveContentLocaleAction("en", id, "he", binding, initial, data);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(result.values).toEqual(initial.values);
    expect(result.outcome.kind).toBe("validation");
  });
});
