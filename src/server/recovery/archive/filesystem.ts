import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { demand } from "../../../../gateway/recovery-coordinator-contract";

export async function syncDirectory(path: string) {
  const fd = await open(path, "r");
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
}

// Call in parent-to-child order. Never recurse through an unchecked existing component.
export async function privateChildDirectory(path: string) {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const stat = await lstat(path);
  demand(
    stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0,
    "outside namespace must be a private real directory",
  );
  await syncDirectory(dirname(path));
}

export async function readPrivateFile(path: string, limit: number) {
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await fd.stat();
    demand(
      stat.isFile() && (stat.mode & 0o077) === 0 && stat.size <= limit,
      "private file type/size differs",
    );
    const data = await fd.readFile();
    demand(data.length <= limit, "private file grew beyond bound");
    return data;
  } finally {
    await fd.close();
  }
}
