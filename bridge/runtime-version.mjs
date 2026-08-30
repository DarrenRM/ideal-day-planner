import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

export const SOURCE_REFRESH_EXIT_CODE = 75;

export async function bridgeSourceFingerprint(directory = new URL("./", import.meta.url)) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".mjs")).sort();
  const hash = createHash("sha256");
  for (const name of names) {
    hash.update(name).update("\0").update(await readFile(new URL(name, directory))).update("\0");
  }
  return hash.digest("hex");
}
