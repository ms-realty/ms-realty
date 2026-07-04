import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function fromRoot(...parts) {
  return path.join(ROOT, ...parts);
}
