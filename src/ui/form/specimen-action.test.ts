import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPracticeForm } from "../../../app/public/[locale]/(dev)/design/forms/actions";
import { formFields } from "./contract";
import { initialFormState } from "./server";
import { specimenCookie, specimenScope } from "./specimen-server";

const jar = vi.hoisted(() => new Map<string, string>());
const cookieOptions = vi.hoisted(() => new Map<string, { secure: boolean }>());
const request = vi.hoisted(() => ({ origin: "http://localhost:3000" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: request.origin }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name: string, value: string, options: { secure: boolean }) => {
      jar.set(name, value);
      cookieOptions.set(name, options);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

beforeEach(() => {
  jar.clear();
  cookieOptions.clear();
  request.origin = "http://localhost:3000";
  vi.stubEnv("ENABLE_DESIGN_SPECIMEN", "1");
  vi.stubEnv("PUBLIC_ORIGIN", "http://localhost:3000");
});
afterEach(() => vi.unstubAllEnvs());

function submission() {
  const initial = initialFormState(specimenScope, { subject: "", note: "" }, 2);
  const data = new FormData();
  data.set(formFields.operationId, initial.operationId);
  data.set(formFields.expectedRevision, "2");
  data.set(formFields.intent, "submit");
  data.set("subject", "A fictional subject");
  data.set("note", "A fictional note");
  return { initial, data };
}

describe("real specimen Server Action", () => {
  it("rechecks its gate and rejects cross-origin POST independently of page visibility", async () => {
    const { initial, data } = submission();
    vi.stubEnv("ENABLE_DESIGN_SPECIMEN", "0");
    await expect(checkPracticeForm("en", initial, data)).rejects.toThrow("NOT_FOUND");
    vi.stubEnv("ENABLE_DESIGN_SPECIMEN", "1");
    request.origin = "https://other.example";
    await expect(checkPracticeForm("en", initial, data)).rejects.toThrow("cross_origin_request");
    expect(jar.size).toBe(0);
  });

  it("does not create a receipt on validation failure or trust forged previous-state authority", async () => {
    const { initial, data } = submission();
    data.set("subject", "ab");
    const invalid = await checkPracticeForm("en", initial, data);
    expect(invalid.outcome.kind).toBe("validation");
    expect(invalid.values.subject).toBe("ab");
    expect(invalid.operationId).toBe(initial.operationId);
    expect(jar.size).toBe(0);
    data.set(formFields.operationId, "forged-key");
    const forged = await checkPracticeForm("en", { ...initial, expectedRevision: 99 }, data);
    expect(forged.outcome.kind).toBe("rejected");
    expect(jar.size).toBe(0);
  });

  it("replays the same confirmed receipt for identical retries and refuses changed text under its key", async () => {
    const { initial, data } = submission();
    const first = await checkPracticeForm("en", initial, data);
    expect(first.outcome.kind).toBe("confirmed");
    expect(cookieOptions.get(specimenCookie)?.secure).toBe(false);
    const sealed = jar.get(specimenCookie);
    const repeated = await checkPracticeForm("en", initial, data);
    expect(repeated.outcome).toEqual(first.outcome);
    expect(repeated.responseId).not.toBe(first.responseId);
    expect(jar.get(specimenCookie)).toBe(sealed);
    data.set("subject", "Changed fictional subject");
    const changed = await checkPracticeForm("en", first, data);
    expect(changed.outcome).toMatchObject({ kind: "conflict", code: "IDEMPOTENCY_KEY_REUSED" });
    expect(changed.values.subject).toBe("Changed fictional subject");
    expect(jar.get(specimenCookie)).toBe(sealed);
  });
});
