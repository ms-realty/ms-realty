// Command/protocol regressions only. Synthetic replies do not qualify the real scanner.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const readiness = ["--conditions=react-server", "--import", "tsx", "scripts/wait-clamav.ts"];

async function run(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, CI_CLAMAV_READY_TIMEOUT_MS: "100", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (part) => {
      output += part;
    });
  const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
  try {
    const [code, signal] = await once(child, "close");
    return { code, signal, output };
  } finally {
    clearTimeout(timer);
  }
}

async function daemon(mode, fn) {
  const scans = [];
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let streaming = false;
    const chunks = [];
    socket.on("error", () => {});
    socket.on("data", (part) => {
      buffer = Buffer.concat([buffer, part]);
      if (!streaming) {
        const end = buffer.indexOf(0);
        if (end < 0) return;
        const command = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 1);
        if (command === "zVERSION") {
          const date = new Date(Date.now() - (mode === "stale" ? 72 * 3_600_000 : 0));
          socket.end(`ClamAV synthetic/28136/${date.toUTCString().replace(" GMT", "")}\0`);
          return;
        }
        assert.equal(command, "zINSTREAM");
        streaming = true;
      }
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < 4 + length) return;
        if (length === 0) {
          scans.push(Buffer.concat(chunks).toString());
          socket.end(
            mode === "clean"
              ? "stream: OK\0"
              : mode === "infected"
                ? "stream: Synthetic-Test FOUND\0"
                : "stream: ERROR\0",
          );
          return;
        }
        chunks.push(buffer.subarray(4, 4 + length));
        buffer = buffer.subarray(4 + length);
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = String(server.address().port);
  try {
    await fn(port, scans);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("readiness requires actual complete byte-scan reply after a fresh version", async () => {
  await daemon("clean", async (port, scans) => {
    const result = await run(readiness, { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: port });
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(scans, ["MS Realty CI scanner readiness probe"]);
    assert.match(result.output, /Scanner ready.+byte-scan sha256=[a-f0-9]{64}/);
  });
});

test("stale signatures fail closed and explain why without scanning bytes", async () => {
  await daemon("stale", async (port, scans) => {
    const result = await run(readiness, { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: port });
    assert.equal(result.code, 1, result.output);
    assert.deepEqual(scans, []);
    assert.match(result.output, /stale_signatures/);
    assert.match(result.output, /last result:.*ClamAV synthetic/);
  });
});

test("a reachable daemon with fresh version cannot pass after a scan error or infection", async () => {
  for (const mode of ["error", "infected"])
    await daemon(mode, async (port, scans) => {
      const result = await run(readiness, { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: port });
      assert.equal(result.code, 1, result.output);
      assert.equal(scans.length, 1);
      assert.match(result.output, mode === "infected" ? /malware/ : /unavailable/);
    });
});

test("cleanup is unconditional and cannot replace the failing consumer exit code", async () => {
  const directory = await mkdtemp(join(tmpdir(), "msr-ci-scanner-command-"));
  const log = join(directory, "commands.jsonl");
  const id = "a".repeat(64);
  try {
    await writeFile(
      join(directory, "docker"),
      `#!/usr/bin/env node
const {appendFileSync}=require('node:fs');
const args=process.argv.slice(2);
appendFileSync(process.env.FAKE_DOCKER_LOG, JSON.stringify(args)+'\\n');
if(args[0]==='create') console.log('${id}');
else if(args[0]==='logs') console.log('Synthetic scanner diagnostic');
if(args[0]==='rm') process.exit(11);
`,
      { mode: 0o700 },
    );
    await daemon("clean", async (port) => {
      const result = await run(
        ["scripts/ci-clamav.mjs", process.execPath, "-e", "process.exit(7)"],
        {
          PATH: `${directory}:${process.env.PATH}`,
          CI_CLAMAV_PORT: port,
          FAKE_DOCKER_LOG: log,
        },
      );
      assert.equal(result.code, 7, result.output);
      assert.match(result.output, /ClamAV failure diagnostics/);
      assert.match(result.output, /Synthetic scanner diagnostic/);
    });
    const commands = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const creation = commands.find((args) => args[0] === "create");
    assert.match(creation.at(-1), /freshclam --foreground --stdout;.*exec \/init$/);
    assert.doesNotMatch(creation.join(" "), /TestDatabases|MAX_SIGNATURE_AGE|--no-verify/);
    assert.deepEqual(commands.at(-1), ["rm", "--force", "--volumes", id]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed readiness prevents the consumer command and still removes its scanner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "msr-ci-scanner-startup-"));
  const log = join(directory, "commands.jsonl"),
    marker = join(directory, "must-not-run");
  const id = "b".repeat(64);
  try {
    await writeFile(
      join(directory, "docker"),
      `#!/usr/bin/env node
const {appendFileSync}=require('node:fs');
const args=process.argv.slice(2);
appendFileSync(process.env.FAKE_DOCKER_LOG,JSON.stringify(args)+'\\n');
if(args[0]==='create') console.log('${id}');
`,
      { mode: 0o700 },
    );
    await daemon("stale", async (port) => {
      const result = await run(
        [
          "scripts/ci-clamav.mjs",
          process.execPath,
          "-e",
          "require('node:fs').writeFileSync(process.argv[1],'unexpected')",
          marker,
        ],
        {
          PATH: `${directory}:${process.env.PATH}`,
          CI_CLAMAV_PORT: port,
          FAKE_DOCKER_LOG: log,
        },
      );
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /stale_signatures/);
      assert.match(result.output, /ClamAV failure diagnostics/);
    });
    await assert.rejects(access(marker), { code: "ENOENT" });
    const commands = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(commands.at(-1), ["rm", "--force", "--volumes", id]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
