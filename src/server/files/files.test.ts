import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnv } from "../config/env";
import { fileServices } from "./config";
import { downloadResponse } from "./download";
import { derivative, inspectFile } from "./inspect";
import { ClamAvScanner } from "./scan";
import { digestOf, LocalFileStorage, MAX_DOCUMENT_BYTES } from "./storage";

const directories: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});
async function storage() {
  const root = await mkdtemp(join(tmpdir(), "msr-file-unit-"));
  directories.push(root);
  return new LocalFileStorage(root);
}

describe("AT42 immutable bytes and bounded inspection", () => {
  it("staging can change while immutable originals cannot be overwritten or traversed", async () => {
    const store = await storage();
    await store.writeStaging("staging/example", Buffer.from("first"));
    await store.writeImmutable("sealed/example", await store.read("staging/example"));
    await store.writeStaging("staging/example", Buffer.from("second"));
    expect((await store.read("sealed/example")).toString()).toBe("first");
    await store.writeImmutable("sealed/example", Buffer.from("first"));
    await expect(
      store.writeImmutable("sealed/example", Buffer.from("second")),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(store.writeStaging("sealed/example", Buffer.from("third"))).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(store.read("sealed/../../private")).rejects.toMatchObject({
      code: "validation_failed",
    });
  });
  it("rejects masquerading HTML/SVG, oversized documents and truncated images", async () => {
    for (const bytes of [
      Buffer.from("<svg></svg>"),
      Buffer.from("<html>not a PDF</html>"),
      Buffer.from([0xff, 0xd8, 0xff, 0]),
    ])
      await expect(inspectFile(bytes, "document")).rejects.toMatchObject({
        code: "validation_failed",
      });
    await expect(
      inspectFile(Buffer.alloc(MAX_DOCUMENT_BYTES + 1), "document"),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
  it("strips EXIF, orientation and other embedded metadata from a decoded derivative", async () => {
    const original = await sharp({
      create: { width: 4, height: 2, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    await expect(inspectFile(original, "media")).resolves.toMatchObject({
      contentType: "image/jpeg",
      width: 4,
      height: 2,
    });
    const safe = await derivative(original);
    const metadata = await sharp(safe.bytes).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 2, height: 4 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });
  it("enables local disk only with explicit configuration and loopback host origins", () => {
    expect(() =>
      fileServices(
        { FILE_STORAGE: "local", FILE_STORAGE_ROOT: "/tmp/msr-explicit" },
        parseEnv({
          PUBLIC_ORIGIN: "https://public.example.test",
          CLIENT_ORIGIN: "https://client.example.test",
          STAFF_ORIGIN: "https://staff.example.test",
        }),
      ),
    ).toThrow();
    expect(() => fileServices({}, parseEnv({}))).toThrow();
    expect(
      fileServices({ FILE_STORAGE: "local", FILE_STORAGE_ROOT: "/tmp/msr-explicit" }, parseEnv({}))
        .storage,
    ).toBeInstanceOf(LocalFileStorage);
  });
  it("keeps scanning required by default and permits unverified files only on explicit staging", () => {
    const local = { FILE_STORAGE: "local", FILE_STORAGE_ROOT: "/tmp/msr-explicit" };
    expect(fileServices(local, parseEnv({})).scanner).toBeInstanceOf(ClamAvScanner);
    for (const staging of [undefined, "false", "1"]) {
      expect(() =>
        fileServices(
          { ...local, FILE_SCAN_MODE: "staging-unverified", STAGING: staging },
          parseEnv({}),
        ),
      ).toThrow();
    }
    expect(
      fileServices(
        { ...local, FILE_SCAN_MODE: "staging-unverified", STAGING: "true" },
        parseEnv({}),
      ).scanner,
    ).toBeNull();
    expect(() =>
      fileServices({ ...local, FILE_SCAN_MODE: "skip", STAGING: "true" }, parseEnv({})),
    ).toThrow();
    expect(() => fileServices({ ...local, R2_JURISDICTION: "default" }, parseEnv({}))).toThrow();
    expect(() =>
      fileServices({ ...local, R2_JURISDICTION: "foreign", STAGING: "true" }, parseEnv({})),
    ).toThrow();
  });
  it("single ranges retain private no-store and attachment policy, malformed ranges fail", async () => {
    const file = {
      bytes: Buffer.from("0123456789"),
      contentType: "application/pdf",
      fileName: "signed.pdf",
      inline: false,
    };
    const response = downloadResponse(file, "bytes=2-5");
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("2345");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(downloadResponse(file, "bytes=0-1,4-5").status).toBe(416);
    expect(downloadResponse(file, "bytes=15-").status).toBe(416);
  });
});

/** A protocol simulator in tests only. Runtime has no scanner success switch. */
async function daemon(reply: string, date = new Date()) {
  let uploaded = Buffer.alloc(0);
  let scans = 0;
  const server = createServer((socket) => {
    let input = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      input = Buffer.concat([input, chunk]);
      if (input.subarray(0, 9).toString() === "zVERSION\0")
        socket.end(`ClamAV 1.4.3/28000/${date.toUTCString().replace(" GMT", "")}\0`);
      else if (input.subarray(0, 10).toString() === "zINSTREAM\0") {
        const chunks: Buffer[] = [];
        let position = 10;
        while (input.length >= position + 4) {
          const length = input.readUInt32BE(position);
          position += 4;
          if (length === 0) {
            uploaded = Buffer.concat(chunks);
            scans++;
            socket.end(`${reply}\0`);
            return;
          }
          if (input.length < position + length) return;
          chunks.push(input.subarray(position, position + length));
          position += length;
        }
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing daemon port");
  return {
    scanner: new ClamAvScanner({
      host: "127.0.0.1",
      port: address.port,
      maxSignatureAgeHours: 48,
      timeoutMs: 1000,
    }),
    uploaded: () => uploaded,
    scans: () => scans,
  };
}
describe("ClamAV wire adapter", () => {
  it("an incomplete disconnect cannot leave scanning pending or mark bytes clean", async () => {
    const server = createServer((socket) => {
      socket.on("data", () => socket.end("ClamAV incomplete"));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing daemon port");
    const scanner = new ClamAvScanner({
      host: "127.0.0.1",
      port: address.port,
      maxSignatureAgeHours: 48,
      timeoutMs: 1000,
    });
    expect(await scanner.scan(Buffer.from("test"))).toMatchObject({
      state: "failed",
      reason: "unavailable",
    });
  });
  it("streams exact bytes and records the daemon version only for an exact clean reply", async () => {
    const test = await daemon("stream: OK");
    const bytes = Buffer.alloc(140_000, 7);
    expect(await test.scanner.scan(bytes)).toMatchObject({
      state: "clean",
      sha256: digestOf(bytes),
      scannerVersion: expect.stringContaining("ClamAV"),
    });
    expect(test.uploaded()).toEqual(bytes);
  });
  it("blocks malware, unknown replies and stale signatures", async () => {
    const infected = await daemon("stream: Eicar-Signature FOUND");
    expect((await infected.scanner.scan(Buffer.from("test"))).state).toBe("infected");
    const failed = await daemon("stream: size limit ERROR");
    expect((await failed.scanner.scan(Buffer.from("test"))).state).toBe("failed");
    const stale = await daemon("stream: OK", new Date(Date.now() - 72 * 3_600_000));
    expect(await stale.scanner.scan(Buffer.from("test"))).toMatchObject({
      state: "failed",
      reason: "stale_signatures",
    });
    expect(stale.scans()).toBe(0);
  });
  it("connection refusal never reports a successful scan", async () => {
    const scanner = new ClamAvScanner({
      host: "127.0.0.1",
      port: 1,
      maxSignatureAgeHours: 48,
      timeoutMs: 200,
    });
    expect(await scanner.scan(Buffer.from("test"))).toMatchObject({
      state: "failed",
      reason: "unavailable",
    });
  });
});
