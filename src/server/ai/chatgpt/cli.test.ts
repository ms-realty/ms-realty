import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArguments, runCli } from "../../../../scripts/butler-chatgpt-oauth";
import { boundedJson, saveRegistration } from "./oauth";
import { FileChatGptStore } from "./store";
import { chatGptIssuer, directScope } from "./types";

const directories: string[] = [];
const testBearer = randomUUID();
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function syntheticProfile() {
  const directory = await mkdtemp(join(tmpdir(), "msr-model-catalog-"));
  directories.push(directory);
  const store = new FileChatGptStore(directory);
  const accessToken = testBearer,
    refreshToken = randomUUID(),
    idToken = randomUUID();
  const id = await saveRegistration(store, {
    issuer: chatGptIssuer,
    subject: "synthetic-subject",
    clientId: "oaiapp_synthetic",
    label: "Synthetic catalog account",
    email: null,
    hostId: await store.hostId(),
    savedAt: Date.now(),
    tokens: {
      accessToken,
      refreshToken,
      idToken,
      expiresAt: Date.now() + 3_600_000,
      scopes: [directScope],
    },
  });
  return ["models", "--account", id, "--dir", directory];
}
const model = { slug: "synthetic-model", display_name: "Synthetic model", visibility: "list" };

describe("operator OAuth command boundary", () => {
  it("keeps a repeated local sign-out remotely unconfirmed without credentials", async () => {
    const args = await syntheticProfile();
    args[0] = "signout";
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", transport);
    const write = vi.fn();
    await runCli(args, write, {});
    expect(transport).toHaveBeenCalledOnce();
    await runCli(args, write, {});
    expect(transport).toHaveBeenCalledOnce();
    expect(write.mock.calls).toHaveLength(2);
    for (const [message] of write.mock.calls) {
      expect(message).toContain("remote revocation is unconfirmed");
      expect(message).not.toContain("renewable session revoked");
    }
  });
  it("shows help without starting a listener, opening credentials or making a request", async () => {
    const write = vi.fn(),
      transport = vi.spyOn(globalThis, "fetch");
    await runCli(["help"], write, {});
    expect(write.mock.calls[0]?.[0]).toContain("Confirm the selected ChatGPT account");
    expect(transport).not.toHaveBeenCalled();
    transport.mockRestore();
  });
  it("requires explicit account and database transfer arguments", () => {
    for (const args of [
      ["import"],
      ["import", "--account", "a".repeat(64)],
      ["models"],
      ["models", "--account", "a".repeat(64), "--database"],
      ["signout", "--account", "invalid"],
      ["login", "--token", "unsupported"],
    ])
      expect(() => parseArguments(args)).toThrow();
    expect(parseArguments(["import", "--account", "a".repeat(64), "--database"])).toMatchObject({
      command: "import",
      database: true,
    });
    expect(parseArguments(["login", "--account", "a".repeat(64)])).toMatchObject({
      command: "login",
      account: "a".repeat(64),
    });
    expect(parseArguments(["login", "--database"])).toMatchObject({
      command: "login",
      database: true,
    });
  });
  it("reads a catalog larger than 128 KiB while preserving visible model order at the official endpoint", async () => {
    const models = Array.from({ length: 512 }, (_, i) => ({
      slug: `synthetic-${i}`,
      display_name: `Model ${i} ${"a".repeat(300)}`,
      visibility: i % 2 ? "hidden" : "list",
    }));
    const body = JSON.stringify({ models });
    expect(Buffer.byteLength(body)).toBeGreaterThan(131_072);
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe("https://api.openai.com/v1/models");
      expect(init?.redirect).toBe("error");
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${testBearer}` });
      return new Response(body, { headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", transport);
    const write = vi.fn();
    await runCli(await syntheticProfile(), write, {});
    expect(JSON.parse(write.mock.calls[0]?.[0] ?? "null")).toEqual(
      models
        .filter((entry) => entry.visibility === "list")
        .map(({ slug, display_name }) => ({ slug, display_name })),
    );
    expect(transport).toHaveBeenCalledOnce();
  });
  it("rejects a catalog beyond its own bounded byte limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ models: [model], provider_metadata: "a".repeat(4 * 1024 * 1024) }),
      ),
    );
    await expect(runCli(await syntheticProfile(), vi.fn(), {})).rejects.toThrow(
      "chatgpt_response_oversize",
    );
  });
  it("rejects excessive model count even when the body is below the catalog byte limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ models: Array.from({ length: 4097 }, () => model) }),
      ),
    );
    await expect(runCli(await syntheticProfile(), vi.fn(), {})).rejects.toThrow(
      "chatgpt_models_invalid",
    );
  });
  it.each([
    { ...model, slug: "s".repeat(257) },
    { ...model, display_name: "d".repeat(513) },
    { ...model, visibility: "v".repeat(33) },
  ])("rejects oversized model fields without exposing provider payload", async (entry) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ models: [entry] })),
    );
    await expect(runCli(await syntheticProfile(), vi.fn(), {})).rejects.toThrow(
      "chatgpt_models_invalid",
    );
  });
  it("keeps the smaller default cap used by token responses", async () => {
    await expect(boundedJson(Response.json({ padding: "a".repeat(131_072) }))).rejects.toThrow(
      "chatgpt_response_oversize",
    );
  });
});
