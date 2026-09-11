import "./sites-env.mjs";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const args=["./node_modules/wrangler/bin/wrangler.js","dev","--config","dist/server/wrangler.json"];
if(existsSync(".dev.vars"))args.push("--env-file",".dev.vars");
args.push("--local","--persist-to",".wrangler/state","--ip","127.0.0.1","--port","7777","--inspector-port","0");
const child=spawn(process.execPath,args,{stdio:"inherit"});
child.on("error",error=>{console.error(error.message);process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
