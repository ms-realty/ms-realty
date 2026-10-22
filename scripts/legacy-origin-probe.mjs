import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";

export const sourceHosts = ["makler-realty.com", "makler-realty.ru"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const demand = (ok) => {
  if (!ok) throw new Error("Exact original source host required");
};

/** Independent Host/SNI probe; no public DNS, redirect following, cookies or insecure TLS. */
export async function probeLegacyOrigin(host, signal) {
  demand(sourceHosts.includes(host), "exact legacy probe host");
  return new Promise((resolveProbe, rejectProbe) => {
    const req = httpsRequest(
      {
        hostname: "185.80.2.102",
        port: 443,
        servername: host,
        path: "/",
        method: "GET",
        headers: { Host: host, "User-Agent": "MS-Realty-rollback-origin-probe" },
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        agent: false,
        timeout: 15_000,
        signal,
      },
      (response) => {
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) req.destroy();
          else chunks.push(chunk);
        });
        response.on("end", () => {
          const tlsVerified = req.socket.authorized === true,
            remoteAddress = req.socket.remoteAddress;
          if (
            !tlsVerified ||
            remoteAddress !== "185.80.2.102" ||
            response.statusCode !== 200 ||
            bytes === 0 ||
            bytes > 2 * 1024 * 1024
          )
            return rejectProbe(new Error("Legacy strict origin probe failed"));
          resolveProbe({
            host,
            serverName: host,
            address: remoteAddress,
            port: 443,
            httpStatus: 200,
            tlsVerified,
            publicDnsPathObserved: false,
            bodySha256: sha256(Buffer.concat(chunks)),
            bytes,
          });
        });
        response.on("error", () => rejectProbe(new Error("Legacy strict origin probe failed")));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => rejectProbe(new Error("Legacy strict origin probe failed")));
    req.end();
  });
}
