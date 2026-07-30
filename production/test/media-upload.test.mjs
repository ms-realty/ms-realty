import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { mediaMirrorState, sha256 } from "../lib/media-migration.mjs";
import { fromRoot } from "../lib/paths.mjs";

function runUpload(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fromRoot("production", "scripts", "upload-media-mirror.mjs")], {
      cwd: fromRoot(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("media upload records only Worker-acknowledged assets and resumes safely", async (t) => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-media-upload-`);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const mirrorDir = path.join(dir, "mirror");
  const manifestPath = path.join(dir, "media-mirror-manifest.json");
  const uploadManifestPath = path.join(dir, "media-upload-manifest.json");
  const key = "makler-realty.ru/wp-content/uploads/2019/08/схема.jpg";
  const body = Buffer.from("reviewed legacy media");
  const filePath = path.join(mirrorDir, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({
      kind: "media_mirror_manifest",
      assets: [{ key, bytes: body.byteLength, sha256: sha256(body), content_type: "image/jpeg" }],
    })}\n`,
  );

  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        pathname: decodeURIComponent(request.url),
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks),
      });
      if (request.headers.authorization === "Bearer rejected-secret") {
        response.statusCode = 401;
        response.end("Unauthorized");
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ key, size: body.byteLength }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const env = {
    ...process.env,
    MS_REALTY_MEDIA_INGEST_URL: `http://127.0.0.1:${address.port}`,
    MS_REALTY_ALLOW_INSECURE_LOCAL_MEDIA_INGEST: "1",
    MS_REALTY_MEDIA_INGEST_SECRET: "test-ingest-secret",
    MS_REALTY_MEDIA_MIRROR_DIR: mirrorDir,
    MS_REALTY_MEDIA_MIRROR_MANIFEST: manifestPath,
    MS_REALTY_MEDIA_UPLOAD_MANIFEST: uploadManifestPath,
  };
  const seed = { records: [{ media: [{ asset_url: `https://makler-realty.ru/${key.split("/").slice(1).join("/")}` }] }] };

  assert.equal(mediaMirrorState(seed, { mirrorDir, manifestPath, uploadManifestPath }).ready, false);
  assert.equal((await runUpload(env)).status, 0);
  assert.equal((await runUpload(env)).status, 0);
  assert.deepEqual(requests, [
    {
      method: "PUT",
      pathname: `/__media/${key}`,
      authorization: "Bearer test-ingest-secret",
      body,
    },
  ]);

  const state = mediaMirrorState(seed, { mirrorDir, manifestPath, uploadManifestPath });
  assert.equal(state.ready, true);
  assert.equal(state.upload.uploaded_assets, 1);
  assert.equal(JSON.parse(fs.readFileSync(uploadManifestPath, "utf8")).assets[0].status, "uploaded");

  const rejected = await runUpload({
    ...env,
    MS_REALTY_MEDIA_INGEST_SECRET: "rejected-secret",
    MS_REALTY_MEDIA_UPLOAD_MANIFEST: path.join(dir, "rejected-upload-manifest.json"),
  });
  assert.equal(rejected.status, 1);
  assert.equal(requests.filter((request) => request.authorization === "Bearer rejected-secret").length, 1);
});
