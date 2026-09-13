// Derive the preview type from file bytes, never from an untrusted filename or MIME label.
export function attachmentPreview(data:string):Blob|null {
 const match=/^data:[^,]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(data);
 if(!match)throw new Error("This attachment could not be read.");
 const decoded=atob(match[1]),bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 const starts=(signature:number[])=>signature.every((n,i)=>bytes[i]===n);
 let type="";
 if(decoded.startsWith("%PDF-"))type="application/pdf";
 else if(starts([137,80,78,71,13,10,26,10]))type="image/png";
 else if(starts([255,216,255]))type="image/jpeg";
 else if(/^GIF8[79]a/.test(decoded))type="image/gif";
 else if(decoded.slice(0,4)==="RIFF"&&decoded.slice(8,12)==="WEBP")type="image/webp";
 return type?new Blob([bytes],{type}):null;
}
