import {build} from "esbuild";
import {spawnSync} from "node:child_process";
await build({entryPoints:["tests/travel.test.ts"],bundle:true,platform:"node",format:"esm",outfile:".sites-runtime/travel.test.mjs"});
await build({entryPoints:["tests/drive.test.ts"],bundle:true,platform:"node",format:"esm",outfile:".sites-runtime/drive.test.mjs",define:{"process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY":JSON.stringify("test-picker-key"),"process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID":JSON.stringify("123-test.apps.googleusercontent.com")}});
const result=spawnSync(process.execPath,["--test",".sites-runtime/travel.test.mjs","tests/cloudflare-handler.test.mjs",".sites-runtime/drive.test.mjs"],{stdio:"inherit"});
process.exit(result.status??1);
