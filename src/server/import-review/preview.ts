import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Session } from "@/server/auth/sessions";
import { assertCan } from "@/server/authz";
import { getEnv } from "@/server/config/env";
import { sha256Hex } from "@/server/crypto";
import type { Executor } from "@/server/db";
import { AppError } from "@/server/errors";
import { liveStaff } from "@/server/work/shared";
import {
  type CsvDelimiter,
  CsvError,
  csvLimits,
  parseCsv,
  previewRows,
  suggestedMapping,
} from "./csv";

const bindingSchema = z
  .object({
    version: z.literal(1),
    session: z.uuid(),
    actor: z.uuid(),
    expires: z.number().int(),
    filename: z.string().max(100),
    source: z.string().max(csvLimits.bytes),
    delimiter: z.enum([",", ";"]),
  })
  .strict();
const mac = (body: string) =>
  createHmac("sha256", getEnv().authSecret).update(`staff-csv-preview:${body}`).digest("base64url");
export async function importReviewer(db: Executor, session: Session) {
  const live = await liveStaff(db, session);
  await assertCan(db, live.actor, "import.run", { type: "import_preview", audience: "internal" });
  return live;
}

/** Authenticated preview only. No importer, file storage, domain write, or approval is invoked. */
export async function startImportPreview(
  db: Executor,
  session: Session,
  file: File,
  delimiter: CsvDelimiter,
) {
  const live = await importReviewer(db, session);
  const filename = file.name.split(/[\\/]/u).at(-1)?.slice(0, 100) ?? "";
  if (!/\.csv$/iu.test(filename)) throw new CsvError("format");
  if (file.size > csvLimits.bytes) throw new CsvError("size");
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new CsvError("format");
  }
  const document = parseCsv(source, delimiter);
  const body = Buffer.from(
    JSON.stringify({
      version: 1,
      session: live.id,
      actor: live.account.id,
      expires: Date.now() + 1800000,
      filename,
      source,
      delimiter,
    }),
  ).toString("base64url");
  return {
    filename,
    document,
    digest: sha256Hex(source),
    token: `${body}.${mac(body)}`,
    mapping: suggestedMapping(document),
  };
}

export async function checkImportPreview(
  db: Executor,
  session: Session,
  token: string,
  mapping: unknown,
) {
  const live = await importReviewer(db, session);
  if (token.length > csvLimits.bytes * 3 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(token))
    throw new AppError("validation_failed");
  const [body = "", signature = ""] = token.split(".");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(mac(body))))
    throw new AppError("validation_failed");
  let parsed: z.infer<typeof bindingSchema>;
  try {
    parsed = bindingSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    throw new AppError("validation_failed");
  }
  if (
    parsed.session !== live.id ||
    parsed.actor !== live.account.id ||
    parsed.expires <= Date.now()
  )
    throw new AppError("validation_failed");
  const document = parseCsv(parsed.source, parsed.delimiter);
  const rows = previewRows(document, mapping);
  return {
    filename: parsed.filename,
    document,
    digest: sha256Hex(parsed.source),
    token,
    mapping,
    rows,
    documentSource: parsed.source,
    delimiter: parsed.delimiter,
  };
}
