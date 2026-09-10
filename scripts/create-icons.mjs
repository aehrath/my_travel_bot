import sharp from "sharp";
import {writeFile} from "node:fs/promises";
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#173c34"/><g transform="translate(14 14) scale(1.5)" fill="none" stroke="#fffdfa" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 8.6 3 4.4l-1 1 11.2 7.1"/><path d="m7.4 6.2 4.2 14.8 1-1-7.1-11.2"/><path d="m21 3-5 5-5 5-5 5-3 1 2-4 5-5 5-5 3-2c3-2 5-2 3 0Z"/></g></svg>';
await writeFile("public/favicon.svg",svg);
for(const size of [192,512])await sharp(Buffer.from(svg)).resize(size,size).png().toFile("public/icon-"+size+".png");
