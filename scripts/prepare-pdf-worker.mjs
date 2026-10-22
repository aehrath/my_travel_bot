import {copyFile,mkdir,readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const {version}=JSON.parse(await readFile(new URL("node_modules/pdfjs-dist/package.json",root),"utf8"));
const destination=new URL("public/pdf-worker/",root);
await mkdir(destination,{recursive:true});
// Serve verbatim: dev-server transforms import browser globals into a worker.
await copyFile(new URL("node_modules/pdfjs-dist/build/pdf.worker.min.mjs",root),new URL(`pdf.worker-${version}.mjs`,destination));
