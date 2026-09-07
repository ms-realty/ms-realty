// Payload email adapter that hands every message to the edge Worker's
// /__email/send boundary. The container never holds a mail credential beyond
// this endpoint secret, and every send is accepted or refused by the Worker.
export function cloudflareEmailConfigFromEnv(env = process.env) {
  const url = String(env.MS_REALTY_EMAIL_SEND_URL || "").trim();
  const secret = String(env.MS_REALTY_EMAIL_SEND_SECRET || "").trim();
  const from = String(env.MS_REALTY_EMAIL_FROM || "").trim();
  if (!url || !secret || !from) return null;
  if (!/^https:\/\//.test(url)) throw new Error("MS_REALTY_EMAIL_SEND_URL must be an https URL");
  return { url, secret, from, fromName: String(env.MS_REALTY_EMAIL_FROM_NAME || "MS Realty").trim() };
}

function recipients(value) {
  return (Array.isArray(value) ? value : [value]).map((row) => (row && typeof row === "object" ? row.address : row)).filter(Boolean);
}

export function cloudflareEmailAdapter(config, { fetchImpl = fetch } = {}) {
  return () => ({
    name: "cloudflare-email-worker",
    defaultFromAddress: config.from,
    defaultFromName: config.fromName,
    async sendEmail(message) {
      const to = recipients(message.to);
      if (!to.length) throw new Error("Email needs at least one recipient");
      const response = await fetchImpl(config.url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.secret}`, "content-type": "application/json" },
        body: JSON.stringify({ to, subject: message.subject, text: message.text || "", html: message.html || "" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Email send refused (${response.status}): ${result.kind || "unknown"}`);
      return result;
    },
  });
}
