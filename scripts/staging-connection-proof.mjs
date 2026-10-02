import { validateRuntimeIdentity } from "./staging-rollout-proof.mjs";

export function validateConnectionProof(input, runtime, packet, now = Date.now()) {
  validateRuntimeIdentity(input, runtime, { allowPreparedWeb: true });
  for (const role of ["web", "worker", "migrator"]) {
    const expected = runtime.roles[role],
      result = packet?.roles?.[role];
    const connection = result?.proof?.connection;
    if (
      expected.state !== "prepared" ||
      result?.identity?.actorId !== expected.actorId ||
      [result.identity, result.proof].some(
        (identity) =>
          identity?.role !== role ||
          identity?.sourceCommit !== expected.sourceCommit ||
          identity?.buildNonce !== expected.buildNonce ||
          identity?.state !== "prepared",
      ) ||
      connection?.schemaVersion !== 1 ||
      connection.status !== "PASS" ||
      connection.transport !== input.database.transport ||
      connection.tlsVerification !== "verify-full" ||
      !Number.isFinite(Date.parse(connection.measuredAt)) ||
      Date.parse(connection.measuredAt) > now ||
      now - Date.parse(connection.measuredAt) > 300_000
    )
      throw new Error("Actual prepared role TLS identity is unavailable or mismatched");
    for (const driver of ["postgres-js", "pg"]) {
      const proof = connection.drivers?.[driver];
      if (
        proof?.database !== input.database.stagingName ||
        proof.role !== input.database.roles[role] ||
        proof.engineVersion !== "16.14" ||
        proof.ssl !== true ||
        !["TLSv1.2", "TLSv1.3"].includes(proof.tlsVersion) ||
        typeof proof.cipher !== "string" ||
        !proof.cipher
      )
        throw new Error("Actual staging SQL session is unavailable or mismatched");
    }
  }
  return packet;
}
