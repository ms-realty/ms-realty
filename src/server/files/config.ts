import "server-only";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { getEnv, isLoopbackOrigin, type ServerEnv } from "../config/env";
import { AppError } from "../errors";
import { ClamAvScanner, type MalwareScanner } from "./scan";
import { type FileStorage, LocalFileStorage, R2FileStorage } from "./storage";

export interface FileServices {
  storage: FileStorage;
  /** Null is an explicitly unverified staging profile, never a successful scanner. */
  scanner: MalwareScanner | null;
}
const schema = z.object({
  FILE_STORAGE: z.enum(["local", "r2"]).optional(),
  FILE_STORAGE_ROOT: z.string().optional(),
  FILE_SCAN_MODE: z.enum(["clamav", "staging-unverified"]).default("clamav"),
  R2_JURISDICTION: z.enum(["eu", "default"]).default("eu"),
  CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_MAX_SIGNATURE_AGE_HOURS: z.coerce.number().int().min(1).max(168).default(48),
});

export function fileServices(
  source: Record<string, string | undefined> = process.env,
  env: ServerEnv = getEnv(),
): FileServices {
  const parsed = schema.safeParse(
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== "")),
  );
  if (!parsed.success)
    throw new AppError("unavailable", { detail: "Invalid file service configuration" });
  const config = parsed.data;
  if (config.FILE_SCAN_MODE === "staging-unverified" && source.STAGING !== "true")
    throw new AppError("unavailable", {
      detail: "Unverified file processing is restricted to explicit staging",
    });
  if (config.R2_JURISDICTION === "default" && source.STAGING !== "true")
    throw new AppError("unavailable", {
      detail: "Default-jurisdiction file storage is restricted to explicit staging",
    });
  let storage: FileStorage;
  if (
    config.FILE_STORAGE === "local" &&
    Object.values(env.hosts).every(isLoopbackOrigin) &&
    config.FILE_STORAGE_ROOT &&
    isAbsolute(config.FILE_STORAGE_ROOT)
  ) {
    storage = new LocalFileStorage(config.FILE_STORAGE_ROOT);
  } else if (config.FILE_STORAGE === "r2" && env.r2) {
    storage = new R2FileStorage({ ...env.r2, jurisdiction: config.R2_JURISDICTION });
  } else {
    throw new AppError("unavailable", { detail: "File storage has not been configured" });
  }
  return {
    storage,
    scanner:
      config.FILE_SCAN_MODE === "staging-unverified"
        ? null
        : new ClamAvScanner({
            host: config.CLAMAV_HOST,
            port: config.CLAMAV_PORT,
            maxSignatureAgeHours: config.CLAMAV_MAX_SIGNATURE_AGE_HOURS,
          }),
  };
}
