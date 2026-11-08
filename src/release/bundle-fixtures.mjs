// Synthetic test-only transport bytes and signatures. Never used by an operator command.
import { bundleBaseManifest, bundleReferences, bundleWitness } from "./bundle.ts";
import { canonicalJson, evidenceDigest, releaseContextDigest, sha256Digest } from "./signature.ts";

export function syntheticBundle(input, sign, supporting = {}) {
  const { manifest, policy } = input;
  const approval = manifest.approvals[0];
  const owner = input.evidence.find((item) => item.id === approval?.evidenceId);
  if (
    !owner ||
    manifest.approvals.length !== 1 ||
    approval.role !== "owner_self_review" ||
    !policy.approvalModel?.amendments ||
    !policy.approvalModel.limitations ||
    !policy.approvalModel.phasePermissions
  )
    return undefined;
  const base = bundleBaseManifest(manifest);
  const evidence = input.evidence.filter((item) => item.id !== owner.id);
  const files = [
    { path: "manifest.json", role: "manifest", content: canonicalJson(base) },
    { path: "policy.json", role: "policy", content: canonicalJson(policy) },
    ...evidence.map((item) => ({
      path: `${item.id}.json`,
      role: "evidence",
      content: canonicalJson(item),
      evidenceId: item.id,
      artifactDigest: evidenceDigest(item),
    })),
    ...Array.from(bundleReferences(base, policy, evidence), ([ref], i) => ({
      path: `supporting/ref-${i}.txt`,
      role: "supporting",
      references: [ref],
      content: supporting[ref] ?? "synthetic fixture bytes",
    })),
  ];
  const index = canonicalJson({
    schemaVersion: 1,
    format: "ms-realty-evidence-bundle",
    releaseSha: base.releaseSha,
    environment: base.environment,
    policyDigest: sha256Digest(canonicalJson(policy)),
    trustedKeysDigest: sha256Digest(canonicalJson(policy.trustedKeys)),
    contextDigest: releaseContextDigest(base),
    baseManifestDigest: sha256Digest(canonicalJson(base)),
    evidenceSetDigest: sha256Digest(canonicalJson(base.evidenceDigests)),
    entries: files
      .map(({ content, ...file }) => ({
        ...file,
        bytes: Buffer.byteLength(content),
        digest: sha256Digest(content),
      }))
      .sort((a, b) => (a.path < b.path ? -1 : 1)),
  });
  const machine = policy.trustedKeys.find(
    (key) => key.actorKind === "machine" && key.evidenceTypes.includes("evidence_bundle_capture"),
  );
  if (!machine) return undefined;
  const witness = {
    index,
    manifest: base,
    policy,
    evidence,
    at: new Date(owner.observedAt),
    actor: { kind: "machine", name: machine.owner, version: "synthetic@1" },
  };
  const capture = canonicalJson(sign(bundleWitness(witness)));
  const verification = canonicalJson(sign(bundleWitness({ ...witness, capture })));
  const approved = sign({
    ...owner,
    digests: {
      ...owner.digests,
      bundleIndex: sha256Digest(index),
      bundleCapture: sha256Digest(capture),
      bundleVerification: sha256Digest(verification),
    },
  });
  input.evidence = input.evidence.map((item) => (item.id === approved.id ? approved : item));
  input.manifest.evidenceDigests[approved.id] = evidenceDigest(approved);
  return { index, capture, verification };
}
