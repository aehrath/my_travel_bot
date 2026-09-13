"use client";
import {useEffect,useState} from "react";
import {useDriveConnection} from "@/lib/use-drive-connection";
import {TripPermissionForm} from "./trip-permission-form";
import {publishInvitedTrips} from "@/lib/trip-sharing";
import {readLocalSetting} from "@/lib/vault";
import type {TripSource} from "@/lib/trip-access";
import {SharedInvitation} from "./shared-invitation";
import {sharedVaultId} from "@/lib/shared-link";
import {toast} from "sonner";
import {pickSharedVault,isDrivePickerConfigured,listSharedVaults,createSharedVault,getSharedVault,pullInvitation,pullTripFiles,organizeSharedFile,sharedMembers,changeSharedMember,type SharedDriveVault,type DriveMember} from "@/lib/drive";
import {encrypt,type Envelope,type Keyring} from "@/lib/vault";
import type {Vault} from "@/lib/travel";
import {Choose,Field} from "./travel-forms";

export function DriveSharing({tripSources,onTripSources,vault,ring,run,onRestore}:{tripSources:TripSource[];onTripSources:(sources:TripSource[])=>void;restoredCiphertext:string;vault:Vault;ring:Keyring|null;run:(action:()=>Promise<void>)=>Promise<void>;onRestore:(e:Envelope,readOnly?:boolean)=>void}){
 const [invitedId,setInvitedId]=useState<string|null>(null),[appOrigin,setAppOrigin]=useState("");
 useEffect(()=>{setAppOrigin(window.location.origin);const update=()=>setInvitedId(sharedVaultId(window.location.hash));update();window.addEventListener("hashchange",update);return()=>window.removeEventListener("hashchange",update);},[]);
 const {connected}=useDriveConnection();
 const [files,setFiles]=useState<SharedDriveVault[]>([]),[file,setFile]=useState<SharedDriveVault|null>(null),[members,setMembers]=useState<DriveMember[]>([]),[name,setName]=useState("Travel vault"),[fileId,setFileId]=useState(""),[base,setBase]=useState<Envelope|null>(null);
 useEffect(()=>{let active=true;setFiles([]);setFile(null);setMembers([]);setBase(null);if(connected)void listSharedVaults().then(items=>{if(active)setFiles(items);}).catch(e=>{if(active)toast.error(e.message);});return()=>{active=false;};},[connected]);
 async function select(id:string){await organizeSharedFile(id);const next=await getSharedVault(id);setFile(next);setBase(null);setMembers(next.capabilities.canShare?await sharedMembers(id):[]);}
 async function refreshMembers(){if(!file)return;setMembers(await sharedMembers(file.id));/* Permission edits also change the file ETag. */const next=await getSharedVault(file.id);if(next.md5Checksum===file.md5Checksum)setFile(next);}
 if(!invitedId&&tripSources.length)return <section className="panel"><h3>Shared trips</h3><p>Each trip has its own permission. Load updates before editing, then publish your changes.</p>{tripSources.map(source=><p key={source.tripId}>{vault.trips.find(t=>t.id===source.tripId)?.name} · {source.file.capabilities.canEdit?"Can edit":"View only"}</p>)}<button className="secondary" disabled={!connected} onClick={()=>void run(async()=>onRestore(await pullTripFiles(tripSources.map(s=>s.file.id))))}>Load latest shared trips</button><button className="primary" disabled={!connected||!ring||!tripSources.some(s=>s.file.capabilities.canEdit)} onClick={()=>void run(async()=>{if(!ring)return;try{onTripSources(await publishInvitedTrips(vault,ring,tripSources));toast.success("Your editable trips were published.");}finally{onTripSources(await readLocalSetting<TripSource[]>("trip-sources")??tripSources);}})}>Publish my trip changes</button></section>;
 if(invitedId)return <SharedInvitation key={invitedId} id={invitedId} onOpen={(next,envelope)=>{setFile(next);setBase(envelope);onRestore(envelope,!next.capabilities.canEdit);}}/>;
 return <section className="panel" id="drive-sharing"><h3>{invitedId?"Open your shared travel vault":"Share a vault through Google Drive"}</h3>{invitedId&&<p className="notice">You have a vault invitation. Connect using the invited Google account, choose the shared vault, then load and unlock it with the passphrase from its owner.</p>}<p>Keep encrypted shared trips together in your My Travel Bot folder in Drive. Choose which trips each person can view or edit. Share the vault passphrase separately with your collaborators.</p>{!connected&&<small>Connect Google Drive above to manage shared vaults.</small>}{connected&&<div className="stack">
 {!invitedId&&<form className="stack" onSubmit={e=>{e.preventDefault();void run(async()=>{if(!ring)return;const encrypted=await encrypt(vault,ring);const created=await createSharedVault(name,encrypted);setFile(created);setBase(encrypted);setMembers(await sharedMembers(created.id));setFiles(await listSharedVaults());toast.success("Shared vault created. Add people below.");});}}><Field label="New shared vault name"><input value={name} onChange={e=>setName(e.target.value)} required/></Field><button className="secondary" disabled={!ring}>Create shared vault from this device</button></form>}
 <button className="secondary" disabled={!isDrivePickerConfigured()} onClick={()=>void run(async()=>{const id=await pickSharedVault();if(id){if(invitedId&&id!==invitedId)throw new Error("Choose the vault named in your invitation.");await select(id);}})}>Choose shared vault in Google Drive</button>{!isDrivePickerConfigured()&&<small>Recipients’ file picker needs one-time setup by the app owner: enable Google Picker API and configure its browser API key.</small>}
 {files.length>0&&<Choose label="Shared vault" value={file?.id??""} onChange={id=>void run(()=>select(id))} options={files.map(f=>({value:f.id,label:f.title}))}/>}
 <details><summary>Open an already authorized file by ID</summary><form className="stack" onSubmit={e=>{e.preventDefault();void run(()=>select(fileId.trim()));}}><Field label="Or enter a shared vault file ID"><input value={fileId} onChange={e=>setFileId(e.target.value)} required placeholder="File ID provided by the owner"/></Field><button className="secondary">Open shared vault</button></form><small>If Drive denies access, use the Google file picker to authorize this file first.</small></details>
 {file&&<><h3>{file.title}</h3>
 {file.userPermission?.role==="owner"?<TripPermissionForm key={file.id} file={file} vault={vault} ring={ring} origin={appOrigin} run={run} onDone={refreshMembers}/>:<button className="secondary" onClick={()=>void run(async()=>{const before=await getSharedVault(file.id);const envelope=await pullInvitation(file.id);const after=await getSharedVault(file.id);if(before.etag!==after.etag)throw new Error("The shared vault changed while loading. Try again.");setFile(after);setBase(envelope);onRestore(envelope,!after.capabilities.canEdit);})}>Open shared vault</button>}
 <details><summary>Drive file details</summary><a className="textButton" href={"https://drive.google.com/file/d/"+encodeURIComponent(file.id)+"/view"} target="_blank" rel="noreferrer">Manage encrypted file in Google Drive ↗</a>
 {members.filter(member=>["reader","writer"].includes(member.role)).map(member=><div className="attention" key={member.id}><span>{member.emailAddress||member.displayName||member.type}<small>Existing access to the original vault file. Sharing trip selections replaces this person’s direct access.</small></span><button className="danger" onClick={()=>void run(async()=>{await changeSharedMember(file.id,member.id,null);await refreshMembers();})}>Remove access</button></div>)}
 </details>
 <small>Drive permissions protect the shared file. Recipients can keep downloaded copies. They also need permission to sign in to this app through Cloudflare Access.</small></>}
 </div>}</section>;
}
