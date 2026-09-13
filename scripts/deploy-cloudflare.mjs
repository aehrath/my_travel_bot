import "./check-node.mjs";
import { spawnSync } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--dry-run")) {
  throw new Error("Supported option: --dry-run (build and validate without publishing).");
}
function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("scripts/build-travel.mjs");
const config = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
config.name = "my-travel-bot";
config.account_id = "afc99da9c11f2c3bc723b6edc8c01c48";
config.main = "cloudflare-entry.js";
config.assets = { ...config.assets, directory: "../client", binding: "ASSETS", run_worker_first: true };
config.workers_dev = true;
config.preview_urls = true;
await copyFile("cloudflare/entry.mjs", "dist/server/cloudflare-entry.js");
await copyFile("cloudflare/handler.mjs", "dist/server/asset-handler.js");
await copyFile("cloudflare/access-guard.mjs", "dist/server/access-guard.js");
await writeFile("dist/server/wrangler.cloudflare.json", JSON.stringify(config, null, 2) + "\n");
// Preserve Access audience, allowed email, team domain, and other dashboard variables.
// Wrangler also preserves existing secrets. The guard fails closed if its settings are missing.
run("node_modules/wrangler/bin/wrangler.js", [
  "deploy", "--config", "dist/server/wrangler.cloudflare.json", "--keep-vars", ...args,
]);
