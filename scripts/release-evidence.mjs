// Fixed local adapter. Incoming inventory/policy/flags cannot install trust or select a clock.
import { createPrivateKey, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  BundleError,
  bundleLimits,
  parseBundleJson,
  requireBundle,
} from "../src/release/bundle.ts";
import { bundleRoot, readBundleAbsolute, writeBundleFile } from "../src/release/bundle-files.ts";
import {
  captureEvidenceBundle,
  requireExternalBundleFile,
  verifyEvidenceBundle,
} from "../src/release/bundle-operations.ts";
import { loadExecutionAdmission } from "../src/release/execution-admission.ts";
import { canonicalJson } from "../src/release/signature.ts";

export function runBundleCommand(operation) {
  let out;
  const attempt = randomUUID();
  try {
    const { values } = parseArgs({
      options: {
        out: { type: "string" },
        ...(operation === "capture"
          ? { root: { type: "string" }, inventory: { type: "string" } }
          : { bundle: { type: "string" }, approval: { type: "string" } }),
      },
    });
    requireBundle(values.out, "out_required");
    out = resolve(values.out);
    const installed = loadExecutionAdmission(process.env, "operator");
    const root = bundleRoot(operation === "capture" ? (values.root ?? "") : (values.bundle ?? ""));
    requireBundle(
      operation === "capture" ? values.root && values.inventory : values.bundle,
      "inputs_required",
    );
    const signerPath = process.env.MS_REALTY_BUNDLE_SIGNING_KEY_PATH;
    // Reject the credential path before traversing any payload, even if signing stays blocked.
    if (signerPath) requireExternalBundleFile(resolve(signerPath), [root, out]);
    const signing = () => {
      requireBundle(
        signerPath && process.env.MS_REALTY_BUNDLE_SIGNING_KEY_ID,
        "external_machine_signer_missing",
      );
      const bytes = readBundleAbsolute(signerPath, 16_384);
      try {
        return {
          keyId: process.env.MS_REALTY_BUNDLE_SIGNING_KEY_ID,
          privateKey: createPrivateKey(bytes),
        };
      } finally {
        bytes.fill(0);
      }
    };
    const common = { root, out, trust: installed?.admission.release, signing, now: new Date() };
    let result;
    if (operation === "capture") {
      requireExternalBundleFile(resolve(values.inventory), [root, out]);
      result = captureEvidenceBundle({
        ...common,
        source: parseBundleJson(readBundleAbsolute(values.inventory)),
      });
    } else {
      if (values.approval) requireExternalBundleFile(resolve(values.approval), [root, out]);
      const bytes = values.approval
        ? readBundleAbsolute(values.approval, bundleLimits.jsonBytes)
        : undefined;
      if (bytes) parseBundleJson(bytes);
      result = verifyEvidenceBundle({
        ...common,
        ...(bytes ? { approval: bytes.toString("utf8") } : {}),
      });
    }
    console.log(canonicalJson({ attempt, ...result }));
    process.exitCode = result.outcome === "verified" ? 0 : 2;
  } catch (error) {
    const failure = {
      schemaVersion: 1,
      attempt,
      operation,
      outcome: "failed",
      r00ToR10: "blocked",
      overallRelease: "blocked",
      execution: "unavailable",
      reason: error instanceof BundleError ? error.code : "invalid_input_or_io",
    };
    if (out) {
      try {
        writeBundleFile(
          bundleRoot(dirname(out)),
          `r10-failure-${attempt}.json`,
          canonicalJson(failure),
        );
      } catch {
        /* The same unambiguous failed receipt is always emitted to stderr. */
      }
    }
    console.error(canonicalJson(failure));
    process.exitCode = 1;
  }
}
