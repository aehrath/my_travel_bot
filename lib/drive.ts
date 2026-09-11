import { parseEnvelope, type Envelope } from "./vault";
type TokenResult={access_token?:string;error?:string};
declare global {interface Window {google?:{accounts:{oauth2:{initTokenClient:(config:{client_id:string;scope:string;callback:(r:TokenResult)=>void;error_callback:(r:unknown)=>void})=>{requestAccessToken:()=>void};revoke:(token:string,callback:()=>void)=>void}}}}}
let token="";let expires=0;
export function disconnectDrive(){if(token)window.google?.accounts.oauth2.revoke(token,()=>{});token="";expires=0;}
// Application registration, configured once by the app owner; never entered by travelers.
const clientId=(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID||"").trim();
export const isDriveConfigured=()=>clientId.endsWith(".apps.googleusercontent.com");
export async function connectDrive():Promise<void>{
 if(!isDriveConfigured())throw new Error("Google Drive connection has not been enabled for this app yet.");
 if(!window.google){await new Promise<void>((resolve,reject)=>{const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.onload=()=>resolve();script.onerror=()=>reject(new Error("Google sign-in could not load. Check your connection."));document.head.appendChild(script);});}
 await new Promise<void>((resolve,reject)=>window.google!.accounts.oauth2.initTokenClient({client_id:clientId,scope:"https://www.googleapis.com/auth/drive.appdata",callback:r=>{if(!r.access_token)return reject(new Error(r.error||"Google did not grant access."));token=r.access_token;expires=Date.now()+50*60*1000;resolve();},error_callback:()=>reject(new Error("Google sign-in was closed or blocked. Try again."))}).requestAccessToken());
}
async function request(path:string,init:RequestInit={}){
 if(!token||Date.now()>expires)throw new Error("Connect to Google Drive again; your session has expired.");
 const response=await fetch("https://www.googleapis.com/"+path,{...init,headers:{...init.headers,Authorization:"Bearer "+token}});
 if(!response.ok)throw new Error("Google Drive request failed ("+response.status+"). Reconnect or check your storage quota.");
 return response;
}
export type DriveBackup={id:string;name:string;modifiedTime:string};
export async function listBackups():Promise<DriveBackup[]>{
 const q=encodeURIComponent("trashed = false and name contains 'my-travel-bot-'");
 const r=await request("drive/v3/files?spaces=appDataFolder&q="+q+"&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=50");
 return ((await r.json()) as {files:DriveBackup[]}).files;
}
export async function pushBackup(e:Envelope){
 // Immutable snapshots avoid silently overwriting newer changes from another device.
 const metadata=await request("drive/v3/files?fields=id",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"my-travel-bot-"+new Date().toISOString()+".travel",parents:["appDataFolder"],mimeType:"application/json"})});
 const {id}=await metadata.json() as {id:string};
 try{await request("upload/drive/v3/files/"+encodeURIComponent(id)+"?uploadType=media",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});}
 catch(error){await request("drive/v3/files/"+encodeURIComponent(id),{method:"DELETE"}).catch(()=>{});throw error;}
}
export async function pullBackup(id:string):Promise<Envelope>{
 return parseEnvelope(await (await request("drive/v3/files/"+encodeURIComponent(id)+"?alt=media")).json());
}
