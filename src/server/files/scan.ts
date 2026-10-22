// ClamD zVERSION + zINSTREAM, documented by https://docs.clamav.net/manual/Usage/ClamdProtocol.html.
// The trusted daemon must run with TZ=UTC and current freshclam signatures. Unknown replies,
// stale signatures, disconnects and timeouts never produce a clean result.
import "server-only";
import { connect } from "node:net";
import { digestOf } from "./storage";

export interface ScanResult {
  state: "clean" | "infected" | "failed";
  sha256: string;
  scannedAt: Date;
  scannerVersion: string | null;
  reason?: "unavailable" | "stale_signatures" | "malware";
}
export interface MalwareScanner {
  scan(bytes: Uint8Array): Promise<ScanResult>;
}

export class ClamAvScanner implements MalwareScanner {
  constructor(
    private readonly config: {
      host: string;
      port: number;
      maxSignatureAgeHours: number;
      timeoutMs?: number;
    },
  ) {}
  private command(command: string, bytes?: Uint8Array): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.config.host, port: this.config.port });
      const timer = setTimeout(
        () => socket.destroy(new Error("scan_timeout")),
        this.config.timeoutMs ?? 30_000,
      );
      let result = "";
      socket.on("error", reject);
      socket.on("close", () => {
        clearTimeout(timer);
        // A peer may reset/close without a complete reply. Rejection is harmless after
        // resolution and ensures no disconnect leaves the worker pending forever.
        reject(new Error("scan_disconnected"));
      });
      socket.on("data", (chunk: Buffer) => {
        result += chunk.toString("utf8");
        if (result.length > 8192) socket.destroy(new Error("invalid_scan_reply"));
      });
      socket.on("end", () => {
        if (!result.endsWith("\0")) reject(new Error("incomplete_scan_reply"));
        else resolve(result.slice(0, -1));
      });
      socket.on("connect", () => {
        socket.write(`z${command}\0`);
        if (bytes) {
          // The request is bounded to 25 MB and socket buffers are drained while receiving.
          for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
            const chunk = bytes.subarray(offset, offset + 64 * 1024);
            const length = Buffer.alloc(4);
            length.writeUInt32BE(chunk.length);
            socket.write(length);
            socket.write(chunk);
          }
          socket.write(Buffer.alloc(4));
        }
      });
    });
  }
  async scan(bytes: Uint8Array): Promise<ScanResult> {
    const base = { sha256: digestOf(bytes), scannedAt: new Date(), scannerVersion: null };
    try {
      const scannerVersion = await this.command("VERSION");
      const version = /^ClamAV [^/]+\/\d+\/(.+)$/.exec(scannerVersion);
      const signatureDate = version ? Date.parse(`${version[1]} UTC`) : Number.NaN;
      const age = Date.now() - signatureDate;
      if (
        !Number.isFinite(age) ||
        age < -5 * 60_000 ||
        age > this.config.maxSignatureAgeHours * 3_600_000
      )
        return { ...base, scannerVersion, state: "failed", reason: "stale_signatures" };
      const result = await this.command("INSTREAM", bytes);
      if (result === "stream: OK") return { ...base, scannerVersion, state: "clean" };
      if (/^stream: [^\r\n\0]+ FOUND$/.test(result))
        return { ...base, scannerVersion, state: "infected", reason: "malware" };
      return { ...base, scannerVersion, state: "failed", reason: "unavailable" };
    } catch {
      return { ...base, state: "failed", reason: "unavailable" };
    }
  }
}
