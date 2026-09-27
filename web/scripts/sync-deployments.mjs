// Copies ../deployments/<chainId>.json (written by script/Deploy.s.sol) into lib/deployments.json.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../../deployments/", import.meta.url);
const out = {};
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".json")) continue;
  const d = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  out[d.chainId] = d;
}
writeFileSync(join(new URL("../lib/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), "deployments.json"), JSON.stringify(out, null, 2));
console.log("synced chains:", Object.keys(out).join(", ") || "(none)");
