// R08 D04/D13-D23: synchronous native SQLite transactions; authenticated I/O is completed first.
import { canonicalJson } from "../src/domain/approval";
import {
  inspectRecoveryArchive,
  type RecoveryPacket,
  recoveryDigest,
  recoveryEntryDigest,
  recoverySegmentBytes,
} from "../src/domain/recovery-archive";
import { validateAuthorityPins } from "../src/server/recovery/archive/admission";
import {
  type Admission,
  admissionDigest,
  authorityResponse,
  bytes,
  type ChallengeRequest,
  type CoordinatorHead,
  type CopyEvidence,
  challengeRequest,
  coordinatorHead,
  copyEvidence,
  type Destination,
  demand,
  type Floor,
  maxMetadataBytes,
  offlineAdmission,
  type Prepared,
  prepared,
  request,
  retainedFloor,
  type Signer,
  type SourceObservation,
  same,
  scopeDigest,
  signEvidence,
  sourceObservation,
  type TrustRoot,
  verifyEvidence,
} from "./recovery-coordinator-contract";

export interface RecoverySqlStorage {
  sql: {
    exec(query: string, ...bindings: (string | number)[]): { toArray(): Record<string, unknown>[] };
  };
  transactionSync<T>(callback: () => T): T;
}
type Range = { id: string; observation: SourceObservation };
type Copy = { create: string; readback: string; evidence: CopyEvidence };
const destinations = ["euR2", "outsideAccount"] as const;
const components = [
  "databaseDump",
  "databaseManifest",
  "objectManifest",
  "configurationManifest",
] as const;
const key = (n: number) => String(n).padStart(16, "0");
export function headDigest(head: Omit<CoordinatorHead, "digest">) {
  return recoveryDigest("archive-coordinator-head-v1", head);
}
export class RecoveryCoordinatorCore {
  readonly admission: Admission;
  readonly contextDigest: string;
  constructor(
    private readonly storage: RecoverySqlStorage,
    admission: Admission,
    private readonly floor: Floor,
    private readonly roots: readonly TrustRoot[],
    private readonly authoritySigner: Signer,
    private readonly fault: (stage: string) => void = () => {},
  ) {
    this.admission = offlineAdmission.parse(admission);
    retainedFloor.parse(floor);
    validateAuthorityPins(this.admission, floor, roots);
    this.contextDigest = recoveryDigest("context-v1", this.admission.context);
    demand(same(floor.authority, admission.authority), "independently retained authority differs");
    if (admission.point)
      demand(
        admission.point.contextDigest === this.contextDigest &&
          same(admission.point.anchor, admission.anchor),
        "point/context/anchor differs",
      );
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS archive_records (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,key))",
    );
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS archive_head (key INTEGER PRIMARY KEY CHECK(key=1), value TEXT NOT NULL)",
    );
    storage.sql.exec(
      "CREATE TRIGGER IF NOT EXISTS immutable_archive_update BEFORE UPDATE ON archive_records BEGIN SELECT RAISE(ABORT,'immutable archive record'); END",
    );
    storage.sql.exec(
      "CREATE TRIGGER IF NOT EXISTS immutable_archive_delete BEFORE DELETE ON archive_records BEGIN SELECT RAISE(ABORT,'immutable archive record'); END",
    );
    // Deliberately never inserts an initial head. Recreated authority is unknown, not generation one.
  }
  private get<T>(kind: string, id: string): T | undefined {
    const row = this.storage.sql
      .exec("SELECT value FROM archive_records WHERE kind=? AND key=?", kind, id)
      .toArray()[0];
    return row ? (JSON.parse(String(row.value)) as T) : undefined;
  }
  private all<T>(kind: string): T[] {
    return this.storage.sql
      .exec("SELECT value FROM archive_records WHERE kind=? ORDER BY key", kind)
      .toArray()
      .map((r) => JSON.parse(String(r.value)) as T);
  }
  private put(kind: string, id: string, value: unknown) {
    const prior = this.get(kind, id);
    if (prior !== undefined) {
      demand(same(prior, value), `immutable ${kind} conflict`);
      return;
    }
    this.storage.sql.exec(
      "INSERT INTO archive_records(kind,key,value) VALUES(?,?,?)",
      kind,
      id,
      canonicalJson(value),
    );
  }
  readHead() {
    const row = this.storage.sql.exec("SELECT value FROM archive_head WHERE key=1").toArray()[0];
    demand(row, "authority missing; explicit continuity reconciliation required");
    const head = coordinatorHead.parse(JSON.parse(String(row.value)));
    const { digest, ...body } = head;
    demand(
      headDigest(body) === digest &&
        head.admissionDigest === admissionDigest(this.admission) &&
        same(head.authority, this.floor.authority),
      "authority/context identity differs",
    );
    demand(head.generation >= this.floor.generation, "authority below retained generation floor");
    if (head.generation === this.floor.generation)
      demand(head.digest === this.floor.digest, "authority floor digest differs");
    else
      demand(
        this.get<{ digest: string }>("head", key(this.floor.generation))?.digest ===
          this.floor.digest,
        "retained floor ancestry missing",
      );
    return head;
  }
  private ranges() {
    return this.all<Range>("range");
  }
  private selectedCursor() {
    return this.ranges().at(-1)?.observation.through ?? this.admission.anchor;
  }
  private validateSource(observation: SourceObservation) {
    demand(
      observation.contextDigest === this.contextDigest &&
        observation.entries.length > 0 &&
        observation.entries.length <= this.admission.limits.maxEntries,
      "source context/bound differs",
    );
    let head = observation.from;
    const required = new Map<string, { kind: string; subjectDigest: string }>();
    const transactions = new Set<string>();
    for (const { digest, ...fields } of observation.entries) {
      demand(
        fields.sequence === head.sequence + 1 &&
          fields.previousDigest === head.digest &&
          recoveryEntryDigest(this.contextDigest, fields) === digest &&
          !transactions.has(fields.transactionRef),
        "source chain differs",
      );
      transactions.add(fields.transactionRef);
      head = { sequence: fields.sequence, digest };
      for (const effect of fields.effects) {
        if (effect.kind === "accepted_operation" || effect.kind === "external_outcome") continue;
        const binding = { kind: effect.kind, subjectDigest: effect.subjectDigest };
        demand(
          !required.has(effect.payloadDigest) || same(required.get(effect.payloadDigest), binding),
          "payload scope fork",
        );
        required.set(effect.payloadDigest, binding);
      }
    }
    demand(
      same(head, observation.through) &&
        observation.committedThrough.sequence >= head.sequence &&
        (observation.committedThrough.sequence !== head.sequence ||
          same(head, observation.committedThrough)),
      "committed source head differs",
    );
    demand(
      observation.payloads.length === required.size &&
        new Set(observation.payloads.map((p) => p.plaintext.sha256)).size === required.size,
      "missing/duplicate replay payload",
    );
    for (const payload of observation.payloads)
      demand(
        same(required.get(payload.plaintext.sha256), {
          kind: payload.kind,
          subjectDigest: payload.subjectDigest,
        }) && payload.plaintext.size <= this.admission.limits.maxObjectBytes,
        "payload commitment/bound differs",
      );
    demand(
      recoverySegmentBytes(
        this.contextDigest,
        observation.from,
        observation.through,
        observation.entries,
      ).length <= this.admission.limits.maxObjectBytes,
      "oversized segment unsupported",
    );
  }
  private scopes() {
    const found = new Map<string, Prepared["scope"]>();
    const add = (
      purpose: Prepared["scope"]["purpose"],
      logicalId: string,
      plaintext: Prepared["scope"]["plaintext"],
    ) => {
      const value = {
        contextDigest: this.contextDigest,
        purpose,
        logicalId,
        plaintext,
        encryptionProfileDigest: this.admission.context.encryptionProfileDigest,
      };
      found.set(scopeDigest(value), value);
    };
    for (const range of this.ranges()) {
      const o = range.observation;
      add(
        "journal_segment",
        range.id,
        bytes(recoverySegmentBytes(this.contextDigest, o.from, o.through, o.entries)),
      );
      for (const p of o.payloads) add("restrictive_payload", p.plaintext.sha256, p.plaintext);
    }
    if (this.admission.point)
      for (const c of components) add("point_component", c, this.admission.point[c].plaintext);
    return found;
  }
  private descriptor(purpose: Prepared["scope"]["purpose"], logicalId: string) {
    const entry = [...this.scopes()].find(
      ([, s]) => s.purpose === purpose && s.logicalId === logicalId,
    );
    return entry ? this.get<Prepared>("prepared", entry[0]) : undefined;
  }
  private copy(descriptor: Prepared | undefined, target: Destination) {
    if (!descriptor) return null;
    const evidence = this.get<Copy>("copy", `${descriptor.scopeDigest}-${target}`);
    if (!evidence) return null;
    return {
      destination: target,
      destinationId: this.admission.context[target],
      objectKey: evidence.evidence.objectKey,
      createReceiptDigest: bytes(evidence.create).sha256,
      readbackReceiptDigest: bytes(evidence.readback).sha256,
      readback: descriptor.ciphertext,
    };
  }
  private object(d: Prepared) {
    return {
      plaintext: d.scope.plaintext,
      ciphertext: d.ciphertext,
      encryptionProfileDigest: d.scope.encryptionProfileDigest,
    };
  }
  private copies(d: Prepared | undefined) {
    return { euR2: this.copy(d, "euR2"), outsideAccount: this.copy(d, "outsideAccount") };
  }
  private projection(prior: CoordinatorHead): CoordinatorHead {
    const ranges = this.ranges(),
      last = ranges.at(-1);
    demand(last, "no committed source observation");
    const prefixes = { euR2: this.admission.anchor, outsideAccount: this.admission.anchor };
    const segments: RecoveryPacket["segments"] = ranges.map((range) => {
      const o = range.observation,
        descriptor = this.descriptor("journal_segment", range.id);
      const replay = o.payloads.flatMap((p) => {
        const d = this.descriptor("restrictive_payload", p.plaintext.sha256);
        return d
          ? [
              {
                kind: p.kind,
                subjectDigest: p.subjectDigest,
                object: this.object(d),
                copies: this.copies(d),
              },
            ]
          : [];
      });
      const copies = this.copies(descriptor);
      for (const target of destinations)
        if (
          copies[target] &&
          replay.length === o.payloads.length &&
          replay.every((p) => p.copies[target]) &&
          same(prefixes[target], o.from)
        )
          prefixes[target] = o.through;
      return {
        from: o.from,
        through: o.through,
        entries: o.entries,
        archive: descriptor
          ? { object: this.object(descriptor), copies, replayPayloads: replay }
          : null,
      };
    });
    let packet = prior.packet;
    const point = this.admission.point;
    if (point && same(last.observation.through, last.observation.committedThrough)) {
      const pointCopies = {
        databaseDump: this.copies(this.descriptor("point_component", "databaseDump")),
        databaseManifest: this.copies(this.descriptor("point_component", "databaseManifest")),
        objectManifest: this.copies(this.descriptor("point_component", "objectManifest")),
        configurationManifest: this.copies(
          this.descriptor("point_component", "configurationManifest"),
        ),
      };
      const pointPrefixes = {
        euR2: components.every((c) => pointCopies[c].euR2) ? prefixes.euR2 : null,
        outsideAccount: components.every((c) => pointCopies[c].outsideAccount)
          ? prefixes.outsideAccount
          : null,
      };
      const pointDigest = recoveryDigest("point-v1", point),
        previous = prior.packet?.watermark;
      const watermark: RecoveryPacket["watermark"] = {
        kind: "recovery_watermark_v2",
        contextDigest: this.contextDigest,
        pointDigest,
        generation: (previous?.generation ?? 0) + 1,
        predecessor: previous
          ? { generation: previous.generation, digest: recoveryDigest("watermark-v2", previous) }
          : null,
        epochState: last.observation.epochState,
        committed: last.observation.through,
        destinationPrefixes: pointPrefixes,
        copySetDigest: recoveryDigest("copies-v2", [pointCopies, segments.map((s) => s.archive)]),
        unresolvedWriters: [...new Set(ranges.flatMap((r) => r.observation.unresolvedWriters))],
        unresolvedObjects: [...new Set(ranges.flatMap((r) => r.observation.unresolvedObjects))],
      };
      packet = { point, pointCopies, segments, watermark, barrier: null };
      inspectRecoveryArchive(
        {
          context: this.admission.context,
          pointDigest,
          restoreId: "offline-inspection",
          destinationInstance: "offline-isolated-target",
          challenge: "offline-inspection",
          authorityRead: null,
        },
        packet,
      );
    }
    const body = {
      generation: prior.generation + 1,
      admissionDigest: prior.admissionDigest,
      authority: prior.authority,
      selectedThrough: last.observation.through,
      committedThrough: last.observation.committedThrough,
      destinationPrefixes: prefixes,
      packet,
      coverage: "incomplete" as const,
      currentness: "unknown" as const,
      archiveBarrier: null,
    };
    demand(
      bytes(canonicalJson(body)).size <= maxMetadataBytes,
      "head metadata bound exceeded; compaction unsupported",
    );
    for (const d of destinations)
      demand(
        !prior.destinationPrefixes[d] ||
          prefixes[d].sequence >= prior.destinationPrefixes[d].sequence,
        "prefix regression",
      );
    return coordinatorHead.parse({ ...body, digest: headDigest(body) });
  }
  async execute(raw: string) {
    const input = await verifyEvidence(
      raw,
      "recovery-command",
      this.admission.authority.id,
      this.roots,
      request,
    );
    demand(
      input.contextDigest === this.contextDigest && same(input.authority, this.admission.authority),
      "command scope differs",
    );
    const c = input.command;
    // Network/cryptographic observation verification is intentionally outside the synchronous transaction.
    const observed =
      c.operation === "reserve"
        ? await verifyEvidence(
            c.source,
            "recovery-source",
            this.admission.context.sourceInstance,
            this.roots,
            sourceObservation,
          )
        : undefined;
    let copies: { create: CopyEvidence; readback: CopyEvidence } | undefined;
    if (c.operation === "copy") {
      for (const target of destinations) {
        try {
          const create = await verifyEvidence(
            c.create,
            "recovery-copy",
            this.admission.context[target],
            this.roots,
            copyEvidence,
          );
          const readback = await verifyEvidence(
            c.readback,
            "recovery-copy",
            this.admission.context[target],
            this.roots,
            copyEvidence,
          );
          demand(
            create.destination === target &&
              readback.destination === target &&
              create.destinationId === this.admission.context[target] &&
              readback.destinationId === this.admission.context[target],
            "copy trust purpose/destination differs",
          );
          copies = { create, readback };
          break;
        } catch {
          /* Only independently pinned destination trust can validate this pair. */
        }
      }
      demand(copies, "copy evidence authentication failed");
    }
    const requestDigest = bytes(raw).sha256;
    return this.storage.transactionSync(() => {
      const prior = this.readHead();
      const old = this.get<{ requestDigest: string; result: unknown }>("request", input.requestId);
      if (old) {
        demand(old.requestDigest === requestDigest, "request ID changed");
        return old.result;
      }
      let result: unknown;
      if (c.operation === "reserve") {
        const o = sourceObservation.parse(observed);
        this.validateSource(o);
        const id = recoveryDigest("archive-selected-range-v1", {
          from: o.from,
          through: o.through,
          entries: o.entries,
          payloads: o.payloads,
        });
        const existing = this.get<Range>("range", key(o.from.sequence));
        if (existing) {
          demand(existing.id === id, "range already selected; resume winner");
          result = existing;
        } else {
          demand(
            bytes(canonicalJson([...this.ranges().map((r) => r.observation), o])).size <=
              maxMetadataBytes,
            "source history metadata bound exceeded; compaction unsupported",
          );
          demand(
            same(o.from, this.selectedCursor()) &&
              this.ranges().length < this.admission.limits.maxRanges,
            "range predecessor/bound differs",
          );
          const previous = this.ranges().at(-1)?.observation.committedThrough;
          demand(
            !previous || o.committedThrough.sequence >= previous.sequence,
            "committed head regression",
          );
          for (const entry of o.entries) {
            this.put("sequence", key(entry.sequence), entry.digest);
            this.put("transaction", entry.transactionRef, entry.sequence);
          }
          this.put("sequence", key(o.committedThrough.sequence), o.committedThrough.digest);
          result = { id, observation: o };
          this.put("range", key(o.from.sequence), result);
          this.put("source_evidence", id, c.source);
        }
      } else if (c.operation === "prepare") {
        const d = prepared.parse(c.descriptor);
        demand(
          d.scopeDigest === scopeDigest(d.scope) &&
            same(this.scopes().get(d.scopeDigest), d.scope) &&
            d.ciphertext.size <= this.admission.limits.maxObjectBytes &&
            d.ciphertext.sha256 !== d.scope.plaintext.sha256,
          "unreserved preparation/profile/bound differs",
        );
        if (d.scope.purpose === "point_component") {
          const component = components.find((name) => name === d.scope.logicalId);
          demand(
            component &&
              this.admission.point &&
              same(this.object(d), this.admission.point[component]),
            "point ciphertext selection differs",
          );
        }
        this.put("prepared", d.scopeDigest, d);
        result = d;
      } else if (c.operation === "copy") {
        demand(copies, "copy missing");
        const { create, readback } = copies;
        const { phase: _cp, outcome: _co, ...a } = create,
          { phase: _rp, outcome: _ro, ...b } = readback;
        const d = this.get<Prepared>("prepared", create.scopeDigest);
        demand(
          d &&
            create.phase === "create" &&
            create.outcome !== "present_identical" &&
            readback.phase === "readback" &&
            readback.outcome === "present_identical" &&
            same(a, b) &&
            create.contextDigest === this.contextDigest &&
            same(create.ciphertext, d.ciphertext) &&
            create.destinationId === this.admission.context[create.destination] &&
            create.objectKey ===
              `${this.admission.context.archiveNamespace}/sha256/${d.ciphertext.sha256}`,
          "copy/selected ciphertext binding differs",
        );
        const copyId = `${d.scopeDigest}-${create.destination}`;
        const previous = this.get<Copy>("copy", copyId);
        result = previous ?? { create: c.create, readback: c.readback, evidence: readback };
        if (!previous) this.put("copy", copyId, result);
      } else {
        demand(
          c.expected.generation === prior.generation && c.expected.digest === prior.digest,
          "CAS predecessor conflict",
        );
        const next = this.projection(prior);
        this.put("head", key(next.generation), next);
        this.fault("after_next_state");
        result = next;
        this.put("request", input.requestId, { requestDigest, result });
        this.fault("after_terminal_receipt");
        this.storage.sql.exec("UPDATE archive_head SET value=? WHERE key=1", canonicalJson(next));
        this.fault("after_head_update");
        return result;
      }
      this.put("request", input.requestId, { requestDigest, result });
      return result;
    });
  }
  async readCurrent(raw: string) {
    const input = await verifyEvidence(
      raw,
      "recovery-command",
      this.admission.authority.id,
      this.roots,
      challengeRequest,
    );
    demand(
      input.contextDigest === this.contextDigest &&
        same(input.authority, this.admission.authority) &&
        input.destinationInstance !== this.admission.context.sourceInstance,
      "challenge scope differs",
    );
    const result = this.storage.transactionSync(() => {
      const head = this.readHead();
      demand(!this.get("challenge", input.challenge), "challenge already used");
      this.put("challenge", input.challenge, input);
      return authorityResponse.parse({ ...input, head });
    });
    return signEvidence(
      "recovery-authority",
      this.admission.authority.id,
      result,
      this.authoritySigner,
    );
  }
  selectedPreparation(id: string) {
    this.readHead();
    return this.get<Prepared>("prepared", id) ?? null;
  }
  /** No public preparation lookup route; injected offline runner only. */
  expectedScopes() {
    this.readHead();
    return [...this.scopes().values()];
  }
}
export type CurrentRead = ChallengeRequest;
