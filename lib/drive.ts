/// <reference types="google.picker" />
import {isDownloadableDriveCopy} from "./drive-file-types";
import { DriveFileAccessError } from "./open-invitation";
import { sharedVaultInvitation } from "./shared-link";
import { parseEnvelope, type Envelope } from "./vault";
type TokenResult={access_token?:string;error?:string;scope?:string;expires_in?:number};
declare global {interface Window {google?:{accounts:{oauth2:{initTokenClient:(config:{client_id:string;scope:string;callback:(r:TokenResult)=>void;error_callback:(r:unknown)=>void})=>{requestAccessToken:(options?:{prompt:string})=>void};revoke:(token:string,callback:()=>void)=>void}}}}}
let token="";let expires=0;let sharingGranted=false;let mailGranted=false;let folderPromise:Promise<string>|null=null;
let sessionVersion=0;let expiryTimer:ReturnType<typeof setTimeout>|undefined;
const connectionListeners=new Set<()=>void>();
export const subscribeDrive=(listener:()=>void)=>{connectionListeners.add(listener);return()=>{connectionListeners.delete(listener);};};
export const driveSessionVersion=()=>sessionVersion;
function connectionChanged(){sessionVersion++;connectionListeners.forEach(listener=>listener());}
function clearConnection(){try{sessionStorage.removeItem("travel-drive-session");}catch{}token="";expires=0;sharingGranted=false;mailGranted=false;folderPromise=null;clearTimeout(expiryTimer);connectionChanged();}
export const isDriveConnected=()=>!!token&&Date.now()<expires&&sharingGranted;
export function disconnectDrive(){clearConnection();}
export function restoreDriveSession(){
 if(token)return;
 try{
  const saved=JSON.parse(sessionStorage.getItem("travel-drive-session")||"null");
  if(saved?.clientId!==clientId||typeof saved.token!=="string"||!Number.isFinite(saved.expires)||saved.expires<=Date.now()||saved.sharingGranted!==true)return;
  token=saved.token;expires=saved.expires;sharingGranted=true;mailGranted=saved.mailGranted===true;
  clearTimeout(expiryTimer);expiryTimer=setTimeout(clearConnection,expires-Date.now());connectionChanged();
 }catch{/* A restricted browser can keep the connection in memory. */}
}
// Application registration, configured once by the app owner; never entered by travelers.
const clientId=(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID||"").trim();
export const isDriveConfigured=()=>clientId.endsWith(".apps.googleusercontent.com");
export async function prepareDriveConnection():Promise<void>{
 if(!window.google?.accounts?.oauth2){await new Promise<void>((resolve,reject)=>{const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.onload=()=>resolve();script.onerror=()=>reject(new Error("Google sign-in could not load. Check your connection."));document.head.appendChild(script);});}
}
export async function connectDrive(_sharing=true,sendMail=false,selectAccount=false):Promise<void>{
 restoreDriveSession();
 if(!selectAccount&&isDriveConnected()&&(!sendMail||mailGranted))return;
 if(!isDriveConfigured())throw new Error("Google Drive connection has not been enabled for this app yet.");
 await prepareDriveConnection();
 await new Promise<void>((resolve,reject)=>window.google!.accounts.oauth2.initTokenClient({client_id:clientId,scope:"https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file"+(sendMail?" https://www.googleapis.com/auth/gmail.send":""),callback:r=>{if(!r.access_token)return reject(new Error(r.error||"Google did not grant access."));if(r.scope&&!['https://www.googleapis.com/auth/drive.appdata','https://www.googleapis.com/auth/drive.file'].every(scope=>r.scope!.split(" ").includes(scope))){clearConnection();return reject(new Error("Allow both backup and shared-file access when connecting Google Drive."));}if(sendMail&&r.scope&&!r.scope.split(" ").includes("https://www.googleapis.com/auth/gmail.send"))return reject(new Error("Allow sending invitation emails from your Gmail account."));token=r.access_token;sharingGranted=true;mailGranted=sendMail||!!r.scope?.split(" ").includes("https://www.googleapis.com/auth/gmail.send");folderPromise=null;expires=Date.now()+(Number.isFinite(r.expires_in)&&r.expires_in!>0?r.expires_in!:3600)*1000;try{sessionStorage.setItem("travel-drive-session",JSON.stringify({clientId,token,expires,sharingGranted,mailGranted}));}catch{}clearTimeout(expiryTimer);expiryTimer=setTimeout(clearConnection,Math.max(0,expires-Date.now()));connectionChanged();resolve();},error_callback:()=>reject(new Error("Google sign-in was closed or blocked. Try again."))}).requestAccessToken({prompt:selectAccount?"select_account":""}));
}
async function request(path:string,init:RequestInit={}){
 if(!token||Date.now()>expires)throw new Error("Connect to Google Drive again; your session has expired.");
 const response=await fetch("https://www.googleapis.com/"+path,{...init,signal:init.signal??(!init.method||init.method==="GET"?AbortSignal.timeout(30000):undefined),headers:{...init.headers,Authorization:"Bearer "+token}});
 if(response.status===401){clearConnection();throw new Error("Your Google Drive session expired. Connect Google Drive again.");}
 if(response.status===403){
  const detail=await response.json().catch(()=>null) as {error?:{message?:string;errors?:{reason?:string}[]}}|null;
  const reason=detail?.error?.errors?.[0]?.reason;
  if(reason==="insufficientPermissions")throw new Error("Google Drive needs backup and shared-file access. Reconnect using Connect Google Drive.");
  throw new DriveFileAccessError(detail?.error?.message?"Google Drive: "+detail.error.message:"Google Drive denied this action. Check that your account can share this file.");
 }
 if(response.status===404)throw new DriveFileAccessError("This Drive file is unavailable. Ask the owner for access, then select it with the Google file picker.");
 if(response.status===412)throw new Error("Someone changed this shared vault. Load its latest version before publishing your changes.");
 if(!response.ok)throw new Error("Google Drive request failed ("+response.status+"). Reconnect or check your storage quota.");
 return response;
}
export type DriveBackup={id:string;name:string;modifiedTime:string;mimeType?:string;md5Checksum?:string;appProperties?:{travelVaultSalt?:string}};
export async function listBackups(ownedOnly=false):Promise<DriveBackup[]>{
 const q=encodeURIComponent("trashed = false and name contains 'my-travel-bot-' and not name contains 'my-travel-bot-shared-' and not name contains 'sharing-settings'"+(ownedOnly?" and 'me' in owners":""));
 const results=await Promise.all(["appDataFolder","drive"].map(async space=>{
  const files:DriveBackup[]=[];
  let pageToken:string|undefined;
  do{
   const params=new URLSearchParams({spaces:space,fields:"nextPageToken,files(id,name,modifiedTime,mimeType,md5Checksum,appProperties)",orderBy:"modifiedTime desc",pageSize:"100"});
   if(pageToken)params.set("pageToken",pageToken);
   const result=await (await request("drive/v3/files?q="+q+"&"+params)).json() as {files?:DriveBackup[];nextPageToken?:string};
   files.push(...(result.files??[]).filter(isDownloadableDriveCopy));pageToken=result.nextPageToken;
  }while(pageToken);
  return files;
 }));
 return [...new Map(results.flat().map(file=>[file.id,file])).values()].sort((a,b)=>b.modifiedTime.localeCompare(a.modifiedTime));
}

export async function pushBackup(e:Envelope){
 // Immutable snapshots avoid silently overwriting newer changes from another device.
 const metadata=await request("drive/v3/files?fields=id",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"my-travel-bot-"+new Date().toISOString()+".travel",parents:[await sharedFolder()],mimeType:"application/json",appProperties:{travelVaultSalt:e.salt}})});
 const {id}=await metadata.json() as {id:string};
 try{await request("upload/drive/v3/files/"+encodeURIComponent(id)+"?uploadType=media",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});}
 catch(error){await request("drive/v3/files/"+encodeURIComponent(id),{method:"DELETE"}).catch(()=>{});throw error;}
}
export async function pullBackup(id:string):Promise<Envelope>{
 return parseEnvelope(await (await request("drive/v3/files/"+encodeURIComponent(id)+"?alt=media")).json());
}

export type SharedDriveVault={id:string;title:string;etag:string;md5Checksum:string;capabilities:{canEdit?:boolean;canShare?:boolean};userPermission?:{role:string};properties?:{key:string;value:string}[]};
export type DriveMember={id:string;emailAddress?:string;displayName?:string;role:string;type:string};
const sharedFields="id,title,etag,md5Checksum,capabilities(canEdit,canShare),userPermission(role),properties(key,value)";
export async function getSharedVault(id:string):Promise<SharedDriveVault>{
 return (await request("drive/v2/files/"+encodeURIComponent(id)+"?fields="+sharedFields)).json();
}
export async function listSharedVaults():Promise<SharedDriveVault[]>{
 const q=encodeURIComponent("trashed = false and mimeType = 'application/json' and title contains 'my-travel-bot-shared-' and not title contains 'my-travel-bot-shared-part-' and not title contains 'my-travel-bot-shared-live-'");
 const result=await (await request("drive/v2/files?spaces=drive&q="+q+"&fields=items("+sharedFields+")&maxResults=100")).json() as {items?:SharedDriveVault[]};
 const files=result.items??[];
 for(const file of files)if(file.userPermission?.role==="owner")await organizeSharedFile(file.id);
 return files.filter(file=>!file.properties?.some(p=>p.key==="travelBotKind"&&p.value!=="vault"));
}
export async function createSharedVault(name:string,envelope:Envelope|TripManifest,kind="vault"){
 const boundary="travel_"+crypto.randomUUID();
 const folder=await sharedFolder();
 const metadata={properties:[{key:"travelBotKind",value:envelope.format==="travel-trip-collection"?"invitation":kind,visibility:"PRIVATE"}],parents:[{id:folder}],title:"my-travel-bot-shared-"+(name.trim()||"vault")+".travel",mimeType:"application/json",writersCanShare:false};
 const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(envelope)}\r\n--${boundary}--`;
 return (await request("upload/drive/v2/files?uploadType=multipart&fields="+sharedFields,{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body})).json() as Promise<SharedDriveVault>;
}
export async function updateSharedVault(file:SharedDriveVault,envelope:Envelope|TripManifest):Promise<SharedDriveVault>{
 if(!file.capabilities.canEdit)throw new Error("You have read-only access to this shared vault.");
 if(!file.etag)throw new Error("Reload this shared vault before publishing changes.");
 return (await request("upload/drive/v2/files/"+encodeURIComponent(file.id)+"?uploadType=media&fields="+sharedFields,{method:"PUT",headers:{"Content-Type":"application/json","If-Match":file.etag},body:JSON.stringify(envelope)})).json();
}
export async function sharedMembers(id:string):Promise<DriveMember[]>{
 return ((await (await request("drive/v3/files/"+encodeURIComponent(id)+"/permissions?fields=permissions(id,emailAddress,displayName,role,type)")).json()) as {permissions?:DriveMember[]}).permissions??[];
}
export async function shareVault(id:string,email:string,role:"reader"|"writer",appOrigin:string,notify=true){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid Google account email.");
 if(notify)await ensureInvitationMail();
 const existing=(await sharedMembers(id)).find(member=>member.type==="user"&&member.emailAddress?.toLowerCase()===email.toLowerCase());
  if(existing?.role==="owner"&&notify)throw new Error("This person already owns the vault. Invite a collaborator instead.");
 if(existing){if(existing.role!=="owner"&&existing.role!==role)await changeSharedMember(id,existing.id,role);}
 else await request("drive/v3/files/"+encodeURIComponent(id)+"/permissions?sendNotificationEmail=false",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"user",emailAddress:email,role})});
 if(notify)return sendInvitationEmail(id,email,appOrigin);
}
export async function changeSharedMember(fileId:string,memberId:string,role:"reader"|"writer"|null){
 await request("drive/v3/files/"+encodeURIComponent(fileId)+"/permissions/"+encodeURIComponent(memberId),role?{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({role})}:{method:"DELETE"});
}

export const isDrivePickerConfigured=()=>!!process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
export async function pickSharedVault(invitedId?:string):Promise<string|null>{
 const selected=await pickSharedFiles(invitedId?[invitedId]:[]);
 return selected?.[0]??null;
}
export async function pickSharedFiles(ids:string[],progress?:(message:string)=>void,requiredIds:string[]=ids):Promise<string[]|null>{
 if(!isDrivePickerConfigured())throw new Error("The app owner must configure the Google Picker browser API key before recipients can open shared files.");
 if(!token||Date.now()>expires)throw new Error("Connect Drive for sharing first.");
 progress?.("Preparing Google’s approval window…");
 if(!globalThis.google?.picker){
  await new Promise<void>((resolve,reject)=>{const script=document.createElement("script");const timer=setTimeout(()=>reject(new Error("Google’s approval window could not load. Check your connection and try again.")),15000);script.src="https://apis.google.com/js/api.js";script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(new Error("Google file picker could not load."));};document.head.appendChild(script);});
  const api=(window as unknown as {gapi:{load:(name:string,options:{callback:()=>void;onerror:()=>void;timeout:number;ontimeout:()=>void})=>void}}).gapi;
  await new Promise<void>((resolve,reject)=>api.load("picker",{callback:resolve,onerror:()=>reject(new Error("Google file picker is unavailable.")),timeout:15000,ontimeout:()=>reject(new Error("Google file picker timed out."))}));
 }
 const instruction=ids.length>1?"Select all listed files, then click Select to open your trips.":"Click the file once, then click Select to open your trip.";
 progress?.(instruction);
 return new Promise((resolve,reject)=>{
  const view=new google.picker.DocsView().setMode(google.picker.DocsViewMode.LIST).setMimeTypes("application/json").setIncludeFolders(false).setSelectFolderEnabled(false);
  if(ids.length)view.setFileIds(ids.join(","));
  const builder=new google.picker.PickerBuilder().setOAuthToken(token).setAppId(clientId.split("-")[0]).setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY!).setOrigin(window.location.origin).addView(view).setTitle(instruction);
  if(ids.length>1)builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
  let timer:ReturnType<typeof setTimeout>;
  const finish=(selected:string[]|null,error?:Error)=>{clearTimeout(timer);picker.dispose();if(error)reject(error);else resolve(selected);};
  const picker=builder.setCallback(data=>{
   if(data.action===google.picker.Action.PICKED){
    const selected=[...new Set(data.docs?.map(doc=>doc.id)??[])];
    if(!selected.length||ids.length&&(selected.some(id=>!ids.includes(id))||requiredIds.some(id=>!selected.includes(id))))finish(null,new Error("Select all the files listed for this invitation, then click Select. Try again to continue."));
    else finish(selected);
   }else if(data.action===google.picker.Action.CANCEL)finish(null);
   else if(data.action===google.picker.Action.ERROR)finish(null,new Error("Google could not approve the shared files. Try again, or sign in with the Google account that received the invitation."));
  }).build();
  timer=setTimeout(()=>finish(null,new Error("Google’s approval window did not finish. Try again and click Select after highlighting the listed files.")),180000);
  picker.setVisible(true);
 });
}

export type TripManifest={format:"travel-trip-collection";version:1;files:string[]};
export async function pullInvitation(id:string,progress?:(message:string)=>void):Promise<Envelope>{
 const raw=await (await request("drive/v3/files/"+encodeURIComponent(id)+"?alt=media")).json() as Partial<TripManifest>;
 if(raw?.format!=="travel-trip-collection")return {...parseEnvelope(raw),sharedRefresh:true};
 if(raw.version!==1||!Array.isArray(raw.files)||!raw.files.length||raw.files.length>100||raw.files.some(id=>typeof id!=="string"||! /^[A-Za-z0-9_-]{1,200}$/.test(id))||new Set(raw.files).size!==raw.files.length)throw new Error("Invalid shared trip collection.");
 return pullTripFiles(raw.files,progress);
}
export async function pullTripFiles(ids:string[],progress?:(message:string)=>void):Promise<Envelope>{
 if(!ids.length)throw new Error("No shared trips selected.");
 const parts:NonNullable<Envelope["tripBundle"]>=[];
 const metadata=new Map<string,SharedDriveVault>(),missing:string[]=[];
 progress?.("Checking access to your shared trips…");
 for(const id of ids){
  try{metadata.set(id,await getSharedVault(id));}catch(error){if(!(error instanceof DriveFileAccessError))throw error;missing.push(id);}
 }
 if(missing.length){
  const selected=await pickSharedFiles(missing,progress);
  if(!selected)throw new Error("Opening was canceled. Try again when you’re ready to approve your shared trips.");
  for(const id of missing)metadata.set(id,await getSharedVault(id));
 }
 for(const fileId of ids){
  progress?.(`Opening shared trip ${parts.length+1} of ${ids.length}…`);
  const before=metadata.get(fileId)!;
  const envelope=await pullBackup(fileId),after=await getSharedVault(fileId);
  if(before.etag!==after.etag)throw new Error("A shared trip changed while loading. Please try again.");
  parts.push({file:after,envelope});
 }
 return {...parts[0].envelope,tripBundle:parts,sharedRefresh:true};
}

export async function ensureInvitationMail(){if(!mailGranted||!isDriveConnected())await connectDrive(true,true);}
export function invitationMime(email:string,message:string,from?:string){
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new Error("Enter a valid email address.");
 if(from&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from))throw new Error("The sending account has an invalid email address.");
 const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(message)));
 const mime=`${from?"From: "+from+"\r\n":""}To: ${email}\r\nSubject: Your shared trip in My Travel Bot\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encoded.match(/.{1,76}/g)?.join("\r\n")}\r\n`;
 return btoa(mime).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export async function sendInvitationEmail(id:string,email:string,origin:string,files:string[]=[]){
 if(!isDriveConnected()||!mailGranted)throw new Error("Reconnect Google and allow invitation email sending.");
 const sender=await (await request("drive/v3/about?fields=user(emailAddress)")).json() as {user?:{emailAddress?:string}};
 if(!sender.user?.emailAddress)throw new Error("Could not identify the sending Google account. Reconnect and retry.");
 const response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({raw:invitationMime(email,sharedVaultInvitation(origin,id,files),sender.user.emailAddress)})});
 const result=await response.json().catch(()=>null) as {id?:string;error?:{message?:string}}|null;
 if(!response.ok||!result?.id)throw new Error("File access was saved, but the invitation email was not confirmed as sent. "+(result?.error?.message||"Enable Gmail API for this app and retry sending."));
 return result.id;
}
export async function sharedFolder():Promise<string>{
 if(!folderPromise)folderPromise=(async()=>{
  const q=encodeURIComponent("trashed=false and 'me' in owners and mimeType='application/vnd.google-apps.folder' and appProperties has { key='travelBotFolder' and value='1' }");
  const result=await (await request("drive/v3/files?q="+q+"&fields=files(id)&pageSize=100")).json() as {files?:{id:string}[]};
  if(result.files?.[0])return result.files[0].id;
  const folder=await (await request("drive/v3/files?fields=id",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"My Travel Bot",mimeType:"application/vnd.google-apps.folder",appProperties:{travelBotFolder:"1"}})})).json() as {id:string};
  return folder.id;
 })().catch(error=>{folderPromise=null;throw error;});
 return folderPromise;
}
export async function organizeSharedFile(id:string){
 const metadata=await (await request("drive/v3/files/"+encodeURIComponent(id)+"?fields=parents,ownedByMe")).json() as {parents?:string[];ownedByMe?:boolean};
 if(!metadata.ownedByMe)return;
 const folder=await sharedFolder();
 if(metadata.parents?.includes(folder))return;
 const query=new URLSearchParams({addParents:folder,fields:"id"});if(metadata.parents?.length)query.set("removeParents",metadata.parents.join(","));
 await request("drive/v3/files/"+encodeURIComponent(id)+"?"+query,{method:"PATCH",headers:{"Content-Type":"application/json"},body:"{}"});
}

// Private owner catalog: same folder, never granted to recipients. ETags serialize changes across devices.
export async function loadOwnerCatalog(rootId:string):Promise<{file:SharedDriveVault;data:unknown}|null>{
 const q=encodeURIComponent("trashed=false and 'me' in owners and appProperties has { key='travelBotCatalog' and value='"+rootId+"' }");
 const result=await (await request("drive/v3/files?q="+q+"&fields=files(id)")).json() as {files?:{id:string}[]};
 if(!result.files?.length)return null;
 if(result.files.length>1)throw new Error("More than one sharing catalog exists. Resolve duplicate catalogs before changing access.");
 const file=await getSharedVault(result.files[0].id);
 const data=await (await request("drive/v3/files/"+file.id+"?alt=media")).json();
 if((await getSharedVault(file.id)).etag!==file.etag)throw new Error("Sharing settings changed. Please try again.");
 return {file,data};
}
export async function saveOwnerCatalog(rootId:string,data:unknown,file:SharedDriveVault|null):Promise<SharedDriveVault>{
 if(file)return (await request("upload/drive/v2/files/"+encodeURIComponent(file.id)+"?uploadType=media&fields="+sharedFields,{method:"PUT",headers:{"Content-Type":"application/json","If-Match":file.etag},body:JSON.stringify(data)})).json();
 const folder=await sharedFolder(),boundary="travel_"+crypto.randomUUID();
 const metadata={name:"my-travel-bot-sharing-settings.json",parents:[folder],mimeType:"application/json",appProperties:{travelBotCatalog:rootId}};
 const body=`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
 const created=await (await request("upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body})).json() as {id:string};
 return getSharedVault(created.id);
}

// One private live file supplies an ETag for atomic cross-device saves.
export async function findLiveVault(salt:string):Promise<SharedDriveVault|null>{
 const title="my-travel-bot-shared-live-"+encodeURIComponent(salt)+".travel";
 const q=encodeURIComponent("trashed=false and 'me' in owners and mimeType='application/json' and title='"+title+"'");
 const result=await (await request("drive/v2/files?q="+q+"&fields=items("+sharedFields+")&maxResults=100")).json() as {items?:SharedDriveVault[]};
 if((result.items?.length??0)>1)throw new Error("Multiple live vault files were created at the same time. Your local changes are kept; resolve the duplicate live files before saving.");
 return result.items?.[0]??null;
}
export async function createLiveVault(salt:string,envelope:Envelope){
 await createSharedVault("live-"+encodeURIComponent(salt),envelope,"sync");
 const file=await findLiveVault(salt);
 if(!file)throw new Error("The live vault could not be confirmed. Your local changes are kept.");
 return file;
}
