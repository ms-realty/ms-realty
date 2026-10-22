// Synthetic offline unit fixtures only; never collected from a live service or imported into app data.
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { sha256 } from "../src/server/legacy/manifest.ts";
import {
  importOriginBatch,
  mergeCaptureHistory,
  reviewedOriginIp,
  verifyOriginReceipt,
} from "./legacy-import-origin-captures.mjs";

const now = 1_730_000_000_000;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "msr-origin-unit-fixture-")),
    workspace = join(root, "workspace");
  mkdirSync(join(root, "html"));
  mkdirSync(workspace);
  const url = "https://makler-realty.ru/listing/unit-fixture/";
  const bytes = Buffer.from(
    '<html lang="ru"><title>Synthetic unit fixture</title><div class="post_content"><div class="propslist"><span class="proptitle">Лот №:</span><span class="propval">791</span></div><p>Fixture body</p></div></html>',
  );
  const artifact = `html/${sha256(url)}.hop0.response.gz`;
  writeFileSync(join(root, artifact), gzipSync(bytes));
  const receipt = {
    requestedUrl: url,
    sourceSpellings: [url],
    method: "GET",
    transport: "curl_strict_https_explicit_resolve",
    originIp: reviewedOriginIp,
    publicDnsPathObserved: false,
    hostAndSniPreserved: true,
    startedAtUnix: now / 1000 - 1,
    hops: [
      {
        url,
        httpStatus: 200,
        curlExitCode: 0,
        remoteIp: reviewedOriginIp,
        sslVerifyResult: 0,
        contentType: "text/html; charset=UTF-8",
        bytes: bytes.length,
        responseSha256: sha256(bytes),
        artifact,
        redirectUrl: null,
        observedAtUnix: now / 1000 - 0.5,
        headersArtifact: "private.headers",
      },
    ],
    finalUrl: url,
    status: 200,
    error: null,
    finalArtifact: artifact,
    responseSha256: sha256(bytes),
  };
  const indexBytes = Buffer.from(
    JSON.stringify({ requestMethod: "GET", workers: 2, captures: [receipt] }),
  );
  return {
    root,
    workspace,
    bytes,
    receipt,
    indexBytes,
    options: {
      indexBytes,
      expectedIndexHash: sha256(indexBytes),
      sourceRoot: root,
      selectedUrls: [url],
      originIp: reviewedOriginIp,
      existing: { captures: [], completeSiteDelta: true, productionAllowed: true },
      workspace,
      now,
    },
  };
}

test("offline fixture verifies pinned response bytes, preserves provenance/history and cannot grant production permission", () => {
  const f = fixture();
  try {
    const old = {
      url: f.receipt.requestedUrl,
      captured_at_utc: new Date(now - 10_000).toISOString(),
      response_sha256: "a".repeat(64),
      status: 404,
      error: "source_http_404",
      transport: "earlier-fixture",
    };
    const first = importOriginBatch({ ...f.options, existing: { captures: [old] } });
    assert.equal(first.captures.length, 2);
    assert.deepEqual(first.captures[0], old);
    const capture = first.captures[1];
    assert.equal(capture.listing_reference, "791");
    assert.equal(capture.publicDnsPathObserved, false);
    assert.equal(capture.originObservation.originIp, reviewedOriginIp);
    assert.equal(capture.source_index_sha256, sha256(f.indexBytes));
    assert.deepEqual(capture.source_spellings, [f.receipt.requestedUrl]);
    assert.equal(capture.sold, null);
    assert.equal(first.completeSiteDelta, false);
    assert.equal(first.productionAllowed, false);
    assert.equal(first.independentCheckerBaseline, false);
    assert.equal(JSON.stringify(capture).includes("private.headers"), false);
    assert.equal(
      sha256(gunzipSync(readFileSync(join(f.workspace, capture.response_artifact)))),
      sha256(f.bytes),
    );
    assert.equal(importOriginBatch({ ...f.options, existing: first }).captures.length, 2);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("rejects changed bytes, unpinned indices, oversized batches and symlink responses before public archive writes", () => {
  const f = fixture();
  try {
    assert.throws(
      () => importOriginBatch({ ...f.options, expectedIndexHash: "b".repeat(64) }),
      /index hash/,
    );
    assert.throws(
      () =>
        importOriginBatch({
          ...f.options,
          selectedUrls: Array.from(
            { length: 41 },
            (_, i) => `https://makler-realty.ru/source-${i}/`,
          ),
        }),
      /1–40/,
    );
    writeFileSync(join(f.root, f.receipt.finalArtifact), gzipSync(Buffer.from("Changed fixture")));
    assert.throws(() => importOriginBatch(f.options), /immutable response bytes/);
    writeFileSync(join(f.root, "other.gz"), gzipSync(f.bytes));
    unlinkSync(join(f.root, f.receipt.finalArtifact));
    symlinkSync(join(f.root, "other.gz"), join(f.root, f.receipt.finalArtifact));
    assert.throws(() => importOriginBatch(f.options), /symlinks/);
    assert.equal(existsSync(join(f.workspace, "data")), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("rejects TLS/origin/method/synthetic/clock/path substitutions", () => {
  const f = fixture();
  try {
    const changes = [
      (r) => {
        r.hops[0].sslVerifyResult = null;
      },
      (r) => {
        r.hops[0].remoteIp = "127.0.0.1";
      },
      (r) => {
        r.method = "POST";
      },
      (r) => {
        r.synthetic = true;
      },
      (r) => {
        r.publicDnsPathObserved = true;
      },
      (r) => {
        r.startedAtUnix = now / 1000 + 10;
      },
      (r) => {
        r.hops[0].artifact = "../response.gz";
      },
      (r) => {
        r.status = 404;
      },
      (r) => {
        r.finalUrl = "https://outside.example/";
      },
      (r) => {
        r.sourceSpellings = ["https://makler-realty.ru/different-source/"];
      },
    ];
    for (const change of changes) {
      const receipt = structuredClone(f.receipt);
      change(receipt);
      assert.throws(() =>
        verifyOriginReceipt(receipt, f.root, reviewedOriginIp, sha256(f.indexBytes), now),
      );
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("retains a non-200 source observation without interpreting retirement or approval", () => {
  const f = fixture();
  try {
    const receipt = structuredClone(f.receipt);
    receipt.status = 404;
    receipt.hops[0].httpStatus = 404;
    const result = verifyOriginReceipt(
      receipt,
      f.root,
      reviewedOriginIp,
      sha256(f.indexBytes),
      now,
    ).capture;
    assert.equal(result.error, "source_http_404");
    assert.equal(result.status, 404);
    assert.equal(result.sold, null);
    assert.equal(result.removalApproved, undefined);
    assert.equal(result.equivalenceReview, undefined);
    assert.equal(mergeCaptureHistory([result], [result]).length, 1);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("preserves the observed redirect and final URL while rejecting a foreign redirect", () => {
  const f = fixture();
  try {
    const receipt = structuredClone(f.receipt),
      target = "https://makler-realty.ru/listing/replacement-fixture/";
    const final = {
      ...receipt.hops[0],
      url: target,
      artifact: `html/${sha256(receipt.requestedUrl)}.hop1.response.gz`,
    };
    writeFileSync(join(f.root, final.artifact), gzipSync(f.bytes));
    receipt.hops[0].httpStatus = 301;
    receipt.hops[0].redirectUrl = target;
    receipt.hops.push(final);
    receipt.finalUrl = target;
    receipt.finalArtifact = final.artifact;
    const result = verifyOriginReceipt(
      receipt,
      f.root,
      reviewedOriginIp,
      sha256(f.indexBytes),
      now,
    ).capture;
    assert.equal(result.url, f.receipt.requestedUrl);
    assert.equal(result.final_url, target);
    assert.deepEqual(result.redirects, [{ from: f.receipt.requestedUrl, status: 301, to: target }]);
    receipt.hops[0].redirectUrl = "https://outside.example/private";
    assert.throws(() =>
      verifyOriginReceipt(receipt, f.root, reviewedOriginIp, sha256(f.indexBytes), now),
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("does not follow a destination archive-directory symlink", () => {
  const f = fixture();
  try {
    const outside = join(f.root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(f.workspace, "data"));
    assert.throws(() => importOriginBatch(f.options), /directory symlinks/);
    assert.equal(existsSync(join(outside, "legacy")), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
