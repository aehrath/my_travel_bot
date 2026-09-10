import {build} from "esbuild";
import {spawnSync} from "node:child_process";
await build({entryPoints:["tests/travel.test.ts"],bundle:true,platform:"node",format:"esm",outfile:".sites-runtime/travel.test.mjs"});
const result=spawnSync(process.execPath,["--test",".sites-runtime/travel.test.mjs"],{stdio:"inherit"});
process.exit(result.status??1);
