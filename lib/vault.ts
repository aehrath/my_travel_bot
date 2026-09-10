import { vaultSchema, type Vault } from "./travel";
export type Envelope={format:"travel-vault";version:1;salt:string;iv:string;ciphertext:string;updated:string};
export type Keyring={key:CryptoKey;salt:string};
const b64=(bytes:Uint8Array)=>{let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function derive(password:string,salt=b64(crypto.getRandomValues(new Uint8Array(16)))):Promise<Keyring>{
 if(password.length<12)throw new Error("Use at least 12 characters for your vault passphrase.");
 const raw=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
 const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:bytes(salt),iterations:600000,hash:"SHA-256"},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 return {key,salt};
}
export async function encrypt(vault:Vault,ring:Keyring):Promise<Envelope>{
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const result=await crypto.subtle.encrypt({name:"AES-GCM",iv},ring.key,new TextEncoder().encode(JSON.stringify(vault)));
 return {format:"travel-vault",version:1,salt:ring.salt,iv:b64(iv),ciphertext:b64(new Uint8Array(result)),updated:new Date().toISOString()};
}
export function parseEnvelope(raw:unknown):Envelope{
 const v=raw as Envelope;
 if(!v||v.format!=="travel-vault"||v.version!==1||typeof v.salt!=="string"||typeof v.iv!=="string"||typeof v.ciphertext!=="string"||v.ciphertext.length>100_000_000||bytes(v.salt).length!==16||bytes(v.iv).length!==12)throw new Error("Not a supported encrypted travel backup.");
 return v;
}
export async function decrypt(raw:unknown,password:string):Promise<{vault:Vault;ring:Keyring}>{
 const e=parseEnvelope(raw),ring=await derive(password,e.salt);
 let plain:ArrayBuffer;try{plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(e.iv)},ring.key,bytes(e.ciphertext));}catch{throw new Error("Incorrect passphrase or damaged backup.");}
 return {vault:vaultSchema.parse(JSON.parse(new TextDecoder().decode(plain))),ring};
}
async function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const req=indexedDB.open("my-travel-bot",1);req.onupgradeneeded=()=>req.result.createObjectStore("vault");req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export async function readVault():Promise<Envelope|undefined>{
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction("vault");const r=tx.objectStore("vault").get("current");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});
}
export async function writeVault(envelope:Envelope,expectedUpdated?:string|null):Promise<void>{
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction("vault","readwrite"),store=tx.objectStore("vault");
  let conflict=false;
  const current=store.get("current");
  current.onsuccess=()=>{
   if(expectedUpdated!==undefined&&(current.result?.updated??null)!==expectedUpdated){conflict=true;tx.abort();return;}
   store.put(envelope,"current");
  };
  tx.oncomplete=()=>{db.close();resolve();};
  tx.onerror=()=>{db.close();reject(tx.error);};
  tx.onabort=()=>{db.close();reject(conflict?new Error("This vault changed in another tab. Reload and unlock before saving. Your changes have not overwritten it."):tx.error);};
 });
}
export function download(content:BlobPart,name:string,type="application/json"){
 const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function fileData(file:File):Promise<string>{
 if(file.size>15*1024*1024)throw new Error("Each attachment must be 15 MB or smaller.");
 return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
}
export function downloadArtifact(data:string,name:string){
 const m=/^data:([^,]*?);base64,(.*)$/.exec(data);if(!m)throw new Error("Invalid attachment");
 // Always download: untrusted HTML/SVG is never embedded into the app origin.
 download(bytes(m[2]),name,"application/octet-stream");
}
