import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function fromRoot(...parts) {
  return path.join(ROOT, ...parts);
}

export function repoRelativePath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) return value;
  const relative = path.relative(ROOT, value);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return value;
  return relative.split(path.sep).join("/");
}
