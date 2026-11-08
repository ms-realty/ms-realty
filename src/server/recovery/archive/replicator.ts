// R08 D28: one injected bounded iteration; no scheduler, queue, startup or business-command retry.
import { recoveryDigest, recoverySegmentBytes } from "@/domain/recovery-archive";
import {
  type CommandRequest,
  type CoordinatorHead,
  coordinatorHead,
  demand,
  type Prepared,
  prepared,
  type Signer,
  type SourceObservation,
  same,
  scopeDigest,
  signEvidence,
} from "../../../../gateway/recovery-coordinator-contract";
import { validateOfflineAdmission } from "./admission";
import { type EncryptionProfile, type PreparationStore, profileDigest } from "./preparation";
import { type ImmutableTransport, putEncryptedIfAbsent, type ReceiptSink } from "./storage";

export interface ReplicationDependencies {
  selectedAdmissionDigest: string;
  source(): Promise<{ observation: SourceObservation; bodies: Map<string, Buffer> }>;
  sourceSigner: Signer;
  commandSigner: Signer;
  copySigners: { euR2: Signer; outsideAccount: Signer };
  profile: EncryptionProfile;
  preparations: PreparationStore;
  transports: { euR2: ImmutableTransport; outsideAccount: ImmutableTransport };
  retain: ReceiptSink;
  coordinator: {
    execute(raw: string): Promise<unknown>;
    head(): Promise<CoordinatorHead>;
    selected(scopeId: string): Promise<Prepared | null>;
  };
}
export async function replicateOnce(input: unknown, dependencies: ReplicationDependencies) {
  // All required selections are validated before source, storage, signer or coordinator effects.
  const admission = validateOfflineAdmission(input, dependencies.selectedAdmissionDigest);
  demand(
    profileDigest(dependencies.profile) === admission.context.encryptionProfileDigest,
    "selected encryption profile missing",
  );
  for (const d of ["euR2", "outsideAccount"] as const)
    demand(
      dependencies.transports[d]?.destinationId === admission.context[d] &&
        dependencies.copySigners[d],
      "explicit destination/signer missing",
    );
  demand(
    dependencies.preparations &&
      typeof dependencies.retain === "function" &&
      dependencies.coordinator &&
      dependencies.sourceSigner &&
      dependencies.commandSigner,
    "explicit durable dependencies missing",
  );
  demand(
    typeof dependencies.source === "function" &&
      typeof dependencies.coordinator.execute === "function" &&
      typeof dependencies.coordinator.head === "function" &&
      typeof dependencies.coordinator.selected === "function" &&
      ["euR2", "outsideAccount"].every((d) => {
        const transport = dependencies.transports[d as "euR2" | "outsideAccount"];
        return typeof transport.put === "function" && typeof transport.get === "function";
      }),
    "explicit source/coordinator/transport methods missing",
  );
  const contextDigest = recoveryDigest("context-v1", admission.context);
  const execute = async (command: CommandRequest["command"]) => {
    const requestId = recoveryDigest("archive-command-intent-v1", {
      contextDigest,
      authority: admission.authority,
      command,
    });
    const raw = await signEvidence(
      "recovery-command",
      admission.authority.id,
      { requestId, contextDigest, authority: admission.authority, command },
      dependencies.commandSigner,
    );
    await dependencies.retain({ attemptId: requestId, state: "coordinator_intent", raw });
    // Bounded reconciliation resends the exact signed request. The core reads its immutable
    // terminal result before trying a mutation. A second failure retains unresolved intent.
    try {
      return await dependencies.coordinator.execute(raw);
    } catch {
      return dependencies.coordinator.execute(raw);
    }
  };
  const source = await dependencies.source();
  if (source.observation.entries.length === 0)
    return { state: "idle" as const, currentness: "unknown" as const, archiveBarrier: null };
  const reservation = (await execute({
    operation: "reserve",
    source: await signEvidence(
      "recovery-source",
      admission.context.sourceInstance,
      source.observation,
      dependencies.sourceSigner,
    ),
  })) as { id: string; observation: SourceObservation };
  demand(
    same(reservation.observation, source.observation),
    "another range selected; resume exact winner",
  );
  const segment = recoverySegmentBytes(
    contextDigest,
    source.observation.from,
    source.observation.through,
    source.observation.entries,
  );
  const inputs = [
    { purpose: "journal_segment" as const, logicalId: reservation.id, content: segment },
    ...source.observation.payloads.map((p) => {
      const content = source.bodies.get(p.plaintext.sha256);
      demand(content, "exact payload bytes missing");
      return { purpose: "restrictive_payload" as const, logicalId: p.plaintext.sha256, content };
    }),
  ];
  const pending: string[] = [];
  for (const item of inputs) {
    const s = {
      contextDigest,
      purpose: item.purpose,
      logicalId: item.logicalId,
      plaintext: { sha256: recoveryByteHash(item.content), size: item.content.length },
      encryptionProfileDigest: admission.context.encryptionProfileDigest,
    };
    const selected = await dependencies.coordinator.selected(scopeDigest(s));
    // A selected descriptor requires exact bytes; missing spool never invokes prepareOnce.
    const descriptor =
      selected ??
      (await dependencies.preparations.prepareOnce(s, item.content, dependencies.profile));
    demand(same(descriptor.scope, s), "selected preparation scope differs");
    const committed = prepared.parse(await execute({ operation: "prepare", descriptor }));
    const ciphertext = await dependencies.preparations.openPreparedExact(committed);
    for (const target of ["euR2", "outsideAccount"] as const) {
      try {
        const result = await putEncryptedIfAbsent(
          admission,
          target,
          dependencies.transports[target],
          committed,
          ciphertext,
          dependencies.copySigners[target],
          dependencies.retain,
        );
        if (result.readback)
          await execute({ operation: "copy", create: result.create, readback: result.readback });
        else pending.push(`${committed.scopeDigest}-${target}`);
      } catch {
        pending.push(`${committed.scopeDigest}-${target}`);
      }
    }
  }
  const previous = coordinatorHead.parse(await dependencies.coordinator.head());
  const head = coordinatorHead.parse(
    await execute({
      operation: "advance",
      expected: { generation: previous.generation, digest: previous.digest },
    }),
  );
  return {
    state: pending.length ? ("pending" as const) : ("copied_prefix" as const),
    pending,
    head,
    currentness: "unknown" as const,
    archiveBarrier: null,
    quarantine: "required" as const,
  };
}

import { createHash } from "node:crypto";

function recoveryByteHash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
