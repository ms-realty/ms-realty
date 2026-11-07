import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { admissionDigest, type Signer } from "../../../../gateway/recovery-coordinator-contract";
import { RecoveryCoordinatorCore } from "../../../../gateway/recovery-coordinator-core";
import { validateArchivePlan } from "../../../../scripts/recovery-archive-worker";
import { loadProductionArchive, validateOfflineAdmission } from "./admission";
import { archiveFixture } from "./testing";

it("R08 D25 offline plan accepts only labeled fixture input and source/code identity", async () => {
  const path = "deploy/recovery-archive/offline-inputs.example.json";
  const input = JSON.parse(await readFile(path, "utf8"));
  expect(await validateArchivePlan(["--validate-offline", path])).toMatchObject({
    activationAuthorized: false,
    evidenceClass: "offline_fixture",
    archiveBarrier: null,
    r08: "blocked",
  });
  for (const args of [[], ["--run", path], ["--validate-offline", path, "--activate"]])
    await expect(validateArchivePlan(args)).rejects.toThrow("Only");
  for (const altered of [
    { ...input, sourceCodeSha: "b".repeat(40) },
    { ...input, activationAuthorized: true },
    { ...input, context: { ...input.context, outsideAccount: input.context.euR2 } },
  ])
    expect(() => validateOfflineAdmission(altered, admissionDigest(input))).toThrow();
  expect(() => loadProductionArchive()).toThrow("unsupported");
});
it("R08 D25 missing trust or retained incarnation rejects before native state effects", async () => {
  const f = await archiveFixture();
  let effects = 0;
  const storage = {
    sql: {
      exec() {
        effects++;
        return { toArray: () => [] };
      },
    },
    transactionSync<T>(fn: () => T): T {
      effects++;
      return fn();
    },
  };
  expect(
    () =>
      new RecoveryCoordinatorCore(storage, f.admission, f.floor, [], f.signers.authority as Signer),
  ).toThrow("trust missing");
  expect(
    () =>
      new RecoveryCoordinatorCore(
        storage,
        f.admission,
        { ...f.floor, authority: { ...f.floor.authority, namespace: "other-authority" } },
        f.roots,
        f.signers.authority as Signer,
      ),
  ).toThrow("incarnation");
  expect(
    () =>
      new RecoveryCoordinatorCore(
        storage,
        f.admission,
        f.floor,
        [...f.roots, f.roots[0] as (typeof f.roots)[number]],
        f.signers.authority as Signer,
      ),
  ).toThrow("ambiguous");
  expect(effects).toBe(0);
});
