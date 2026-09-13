import type {SharedDriveVault} from "./drive";
import type {TripSource} from "./trip-access";
import { vaultSchema, type Vault } from "./travel";
export type Envelope={format:"travel-vault";version:1;salt:string;iv:string;ciphertext:string;updated:string;sharedRefresh?:boolean;onRestored?:()=>Promise<void>;tripBundle?:{file:SharedDriveVault;envelope:Envelope}[]};
export type Keyring={key:CryptoKey;salt:string};
const b64=(bytes:Uint8Array)=>{let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function derive(password:string,salt=b64(crypto.getRandomValues(new Uint8Array(16)))):Promise<Keyring>{
 if(password.length<12)throw new Error("Use at least 12 characters for your vault passphrase.");
 const raw=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
 const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:bytes(salt),iterations:600000,hash:"SHA-256"},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 return {key,salt};
}
export async function encrypt(vault:Vault,ring:Keyring):Promise<Envelope>{return encryptPayload(vault,ring);}
export async function encryptPayload(value:unknown,ring:Keyring):Promise<Envelope>{
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const result=await crypto.subtle.encrypt({name:"AES-GCM",iv},ring.key,new TextEncoder().encode(JSON.stringify(value)));
 return {format:"travel-vault",version:1,salt:ring.salt,iv:b64(iv),ciphertext:b64(new Uint8Array(result)),updated:new Date().toISOString()};
}
export function parseEnvelope(raw:unknown):Envelope{
 const v=raw as Envelope;
 if(!v||v.format!=="travel-vault"||v.version!==1||typeof v.salt!=="string"||typeof v.iv!=="string"||typeof v.ciphertext!=="string"||v.ciphertext.length>100_000_000||bytes(v.salt).length!==16||bytes(v.iv).length!==12)throw new Error("Not a supported encrypted travel backup.");
 return {format:v.format,version:v.version,salt:v.salt,iv:v.iv,ciphertext:v.ciphertext,updated:v.updated};
}
export async function decrypt(raw:unknown,password:string):Promise<{vault:Vault;ring:Keyring}>{
 const e=parseEnvelope(raw),ring=await derive(password,e.salt);
 return decryptWithKey(e,ring);
}
export async function decryptWithKey(e:Envelope,ring:Keyring):Promise<{vault:Vault;ring:Keyring}>{
 return {vault:vaultSchema.parse(await decryptPayload(e,ring)),ring};
}
export async function decryptPayload(e:Envelope,ring:Keyring):Promise<unknown>{
 if(e.salt!==ring.salt)throw new Error("This key belongs to a different vault.");
 let plain:ArrayBuffer;try{plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(e.iv)},ring.key,bytes(e.ciphertext));}catch{throw new Error("Incorrect passphrase or damaged backup.");}
 return JSON.parse(new TextDecoder().decode(plain));
}
async function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const req=indexedDB.open("my-travel-bot",1);req.onupgradeneeded=()=>req.result.createObjectStore("vault");req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export async function readVault():Promise<Envelope|undefined>{
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction("vault");const r=tx.objectStore("vault").get("current");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});
}
export type RemovedVaultRecords={trips:string[];bookings:string[];artifacts:string[]};
export async function writeVault(envelope:Envelope,expectedUpdated?:string|null,readOnly?:boolean,tripSources?:TripSource[],expectedCiphertext?:string,removed?:RemovedVaultRecords):Promise<void>{
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction("vault","readwrite"),store=tx.objectStore("vault");
  let conflict=false;
  const current=store.get("current");
  current.onsuccess=()=>{
   if((expectedUpdated!==undefined&&(current.result?.updated??null)!==expectedUpdated)||(expectedCiphertext!==undefined&&current.result?.ciphertext!==expectedCiphertext)){conflict=true;tx.abort();return;}
   // Retain previous encrypted revisions in the same atomic transaction as the new save.
   // This is automatic recovery history, never a prerequisite for editing or sharing.
   if(current.result){
    const history=store.get("saved-revisions");
    history.onsuccess=()=>store.put([current.result,...(history.result??[])].slice(0,10),"saved-revisions");
   }
   if(removed){
    const key="drive-local-removals:"+envelope.salt,previous=store.get(key);
    previous.onsuccess=()=>{
     const old=previous.result as RemovedVaultRecords|undefined;
     store.put({trips:[...new Set([...(old?.trips??[]),...removed.trips])],bookings:[...new Set([...(old?.bookings??[]),...removed.bookings])],artifacts:[...new Set([...(old?.artifacts??[]),...removed.artifacts])]},key);
    };
   }
   store.put(envelope,"current");
   if(readOnly!==undefined||expectedUpdated==null)store.put(readOnly??false,"read-only");
   if(tripSources!==undefined||expectedUpdated==null)store.put(tripSources??[],"trip-sources");
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

// Structured cloning preserves a non-extractable CryptoKey without storing the passphrase.
export async function rememberVault(ring:Keyring|null):Promise<void>{
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("vault","readwrite"),store=tx.objectStore("vault");
  if(ring)store.put(ring,"remembered-key");else store.delete("remembered-key");
  tx.oncomplete=()=>{db.close();resolve();};
  tx.onabort=()=>{db.close();reject(tx.error);};
  tx.onerror=()=>{db.close();reject(tx.error);};
 });
}
export async function openRememberedVault(e:Envelope){
 const db=await database();
 const ring=await new Promise<Keyring|undefined>((resolve,reject)=>{
  const tx=db.transaction("vault"),request=tx.objectStore("vault").get("remembered-key");
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  tx.oncomplete=()=>db.close();
 });
 if(!ring)return null;
 try{return await decryptWithKey(e,ring);}catch{await rememberVault(null);return null;}
}

export async function readVaultReadOnly():Promise<boolean>{
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction("vault"),r=tx.objectStore("vault").get("read-only");r.onsuccess=()=>resolve(r.result===true);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});
}

export async function readLocalSetting<T>(name:string):Promise<T|undefined>{
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction("vault"),r=tx.objectStore("vault").get(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});
}
export async function writeLocalSetting(name:string,value:unknown):Promise<void>{
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction("vault","readwrite");tx.objectStore("vault").put(value,name);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};});
}
export async function decryptImportedVault(envelope:Envelope,password:string,existing:Keyring|null){
 const key=existing?.salt===envelope.salt?existing:await derive(password,envelope.salt);
 if(!envelope.tripBundle)return {...await decryptWithKey(envelope,key),sources:[] as TripSource[],envelope:parseEnvelope(envelope)};
 const combined:Vault={version:1,trips:[],bookings:[],artifacts:[]};const sources:TripSource[]=[];
 for(const part of envelope.tripBundle){
  const result=await decryptWithKey(part.envelope,key);
  if(result.vault.trips.length!==1)throw new Error("A shared trip file must contain exactly one trip.");
  combined.trips.push(...result.vault.trips);combined.bookings.push(...result.vault.bookings);combined.artifacts.push(...result.vault.artifacts);
  sources.push({tripId:result.vault.trips[0].id,file:part.file});
 }
 const vault=vaultSchema.parse(combined);
 return {vault,ring:key,sources,envelope:await encrypt(vault,key)};
}
