import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InterpretPlace } from "@/domain/search/interpret";
import type { Executor } from "../db";
import {
  type InterpretSearchDeps,
  interpretSearchText,
  maxInterpretTextBytes,
  resetPlaceCache,
} from "./interpret-service";

const sandanski = "00000000-0000-4000-8000-000000000002";
const melnik = "00000000-0000-4000-8000-000000000003";
const places: InterpretPlace[] = [
  {
    id: sandanski,
    level: "settlement",
    parentId: null,
    countryCode: "BG",
    names: ["Сандански", "Sandanski"],
  },
  {
    id: melnik,
    level: "settlement",
    parentId: null,
    countryCode: "BG",
    names: ["Мелник", "Melnik"],
  },
];
const db = {} as Executor;
const assist = { provider: "anthropic" as const, apiKey: "test-key", model: "claude-sonnet-5" };
const text =
  "апартамент в Сандански с хубава тераса, пишете на ivan@example.com или +359 888 123 456";

function modelReply(chips: unknown[], init: { stop?: string; status?: number } = {}) {
  return new Response(
    JSON.stringify({
      stop_reason: init.stop ?? "end_turn",
      content: [{ type: "text", text: JSON.stringify({ chips }) }],
    }),
    { status: init.status ?? 200, headers: { "content-type": "application/json" } },
  );
}

function deps(overrides: Partial<InterpretSearchDeps> = {}): InterpretSearchDeps {
  return { env: { assist: undefined }, loadPlaces: async () => places, ...overrides };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetPlaceCache();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("interpretSearchText", () => {
  it("works fully without a provider", async () => {
    const fetch = vi.fn();
    const result = await interpretSearchText(db, { text, locale: "bg" }, deps({ fetch }));
    expect(result.assistStatus).toBe("off");
    expect(result.interpretation.places.map((c) => c.placeId)).toEqual([sandanski]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not call the provider when everything was understood", async () => {
    const fetch = vi.fn();
    const result = await interpretSearchText(
      db,
      { text: "апартамент в Сандански", locale: "bg" },
      deps({ env: { assist }, fetch }),
    );
    expect(result.assistStatus).toBe("off");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends only redacted unparsed fragments and merges validated assist chips", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      modelReply([
        { kind: "feature", key: "garden", evidence: "тераса" },
        { kind: "place", placeId: melnik, evidence: "хубава" },
        { kind: "place", placeId: "00000000-0000-4000-8000-00000000ffff", evidence: "пишете" },
        { kind: "property_type", value: "house", evidence: "апартамент" },
      ]),
    );
    const result = await interpretSearchText(
      db,
      { text, locale: "bg" },
      deps({ env: { assist }, fetch: fetch as unknown as typeof globalThis.fetch }),
    );

    expect(result.assistStatus).toBe("used");
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init?.headers).toMatchObject({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
    });
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.output_config.format.type).toBe("json_schema");
    const request = JSON.parse(body.messages[0].content);
    expect(request.fragments.join(" ")).not.toMatch(/ivan@example\.com|888 123 456/);
    expect(String(init?.body)).not.toContain("апартамент в Сандански");

    const { interpretation } = result;
    expect(interpretation.mustHave).toMatchObject([
      { key: "garden", source: "assist", confidence: "likely", evidence: "тераса" },
    ]);
    // Known place, found in the unparsed text: added. Unknown place and rules-covered text: dropped.
    expect(interpretation.places.map((c) => [c.placeId, c.source])).toEqual([
      [sandanski, "rules"],
      [melnik, "assist"],
    ]);
    expect(interpretation.propertyTypes.map((c) => [c.value, c.source])).toEqual([
      ["apartment", "rules"],
    ]);
  });

  it.each([
    ["an HTTP error", async () => modelReply([], { status: 529 }), "http_529"],
    ["a truncated reply", async () => modelReply([], { stop: "max_tokens" }), "stop_max_tokens"],
    [
      "an invalid chip",
      async () => modelReply([{ kind: "feature", key: "sea_view", evidence: "x" }]),
      "invalid_output",
    ],
    [
      "a timeout",
      async () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      "timeout",
    ],
    [
      "a network failure",
      async () => Promise.reject(new TypeError("fetch failed")),
      "request_failed",
    ],
  ])("falls back to the rules result on %s, logging no text", async (_name, reply, code) => {
    const result = await interpretSearchText(
      db,
      { text, locale: "bg" },
      deps({ env: { assist }, fetch: vi.fn(reply) as unknown as typeof fetch }),
    );
    expect(result.assistStatus).toBe("unavailable");
    expect(result.interpretation.mustHave).toEqual([]);
    expect(warn).toHaveBeenCalledWith(`[search.interpret] assist unavailable: ${code}`);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("тераса");
  });

  it("rejects empty and oversized text as validation errors", async () => {
    await expect(
      interpretSearchText(db, { text: "  ", locale: "bg" }, deps()),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { text: ["required"] },
    });
    const long = "я".repeat(maxInterpretTextBytes / 2 + 1);
    await expect(
      interpretSearchText(db, { text: long, locale: "bg" }, deps()),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { text: ["too_long"] },
    });
  });

  it("loads places once per cache period", async () => {
    const loadPlaces = vi.fn(async () => places);
    let now = 0;
    const d = deps({ loadPlaces, now: () => now });
    await interpretSearchText(db, { text: "Sandanski", locale: "en" }, d);
    await interpretSearchText(db, { text: "Melnik", locale: "en" }, d);
    expect(loadPlaces).toHaveBeenCalledTimes(1);
    now = 10 * 60_000;
    await interpretSearchText(db, { text: "Melnik", locale: "en" }, d);
    expect(loadPlaces).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed place load", async () => {
    const loadPlaces = vi
      .fn<() => Promise<InterpretPlace[]>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(places);
    const d = deps({ loadPlaces });
    await expect(interpretSearchText(db, { text: "Sandanski", locale: "en" }, d)).rejects.toThrow();
    const result = await interpretSearchText(db, { text: "Sandanski", locale: "en" }, d);
    expect(result.interpretation.places).toHaveLength(1);
  });
});
