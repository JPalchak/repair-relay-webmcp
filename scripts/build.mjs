import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "assets",
  "src"
]) {
  await cp(resolve(root, entry), resolve(dist, entry), { recursive: true });
}

console.log("Built static Label Relay site in dist/.");
