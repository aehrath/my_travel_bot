import {findLiveVault,getSharedVault,pullBackup,createLiveVault,updateSharedVault,createSharedVault,type SharedDriveVault} from "./drive";
import {prepareDriveParts,readDriveParts,type VaultIndex} from "./drive-parts";
import {DriveFileAccessError} from "./open-invitation";
import {mergeSharedUpdates,mergeVaultImport} from "./merge-vault";
import {driveDraftMarker,type DriveSaveCheckpoint} from "./drive-save-state";
import {decryptWithKey,encrypt,readVault,readLocalSetting,writeLocalSetting,type Envelope,type Keyring} from "./vault";
import type {Vault} from "./travel";
function recordName(item:{id:string}){const record=item as {id:string;name?:string;title?:string;fileName?:string};return record.title||record.name||record.fileName||record.id;}
export type DriveConflict={kind:"trips"|"bookings"|"artifacts";id:string;name:string;local:Record<string,unknown>;remote:Record<string,unknown>};
export function reviewLiveDraft(local:Vault,remote:Vault,base:Vault|undefined){
 const conflicts:DriveConflict[]=[];
 const deleted=new Set([...(local.deletedTripIds??[]),...(remote.deletedTripIds??[])]);
 for(const kind of ["trips","bookings","artifacts"] as const){
  const old=new Map(base?.[kind].map(item=>[item.id,JSON.stringify(item)]));
  const incoming=new Map(remote[kind].map(item=>[item.id,item]));
  for(const item of local[kind]){
   if(deleted.has(kind==="trips"?item.id:(item as {tripId:string}).tripId))continue;
   const other=incoming.get(item.id),here=JSON.stringify(item),there=JSON.stringify(other),before=old.get(item.id);
   if(other&&here!==there&&(!base||(here!==before&&there!==before)))conflicts.push({kind,id:item.id,name:recordName(item),local:item,remote:other});
  }
 }
 return {vault:base?mergeSharedUpdates(local,remote,base):mergeVaultImport(local,remote),conflicts};
}
export function mergeLiveDraft(local:Vault,remote:Vault,base:Vault|undefined):Vault{
 const result=reviewLiveDraft(local,remote,base);
 if(result.conflicts.length)throw new Error((base?"This record was changed on another device too. Your local draft is kept.":"Local and Drive versions differ, and their common saved version is unknown. Both copies are kept.")+" Review the conflict before saving. Record: "+result.conflicts[0].name);
 return result.vault;
}
export function chooseDriveConflict(vault:Vault,conflict:DriveConflict,choice:"local"|"remote"):Vault{
 return {...vault,[conflict.kind]:vault[conflict.kind].map(item=>item.id===conflict.id?(choice==="local"?conflict.local:conflict.remote):item)} as Vault;
}
export async function acknowledgeDriveConflict(conflict:DriveConflict,ring:Keyring){
 const previous=await readLocalSetting<Envelope>("drive-live-base:"+ring.salt);
 const base:Vault=previous?(await decryptWithKey(previous,ring)).vault:{version:1,trips:[],bookings:[],artifacts:[]};
 const records=base[conflict.kind].filter(item=>item.id!==conflict.id);
 const next={...base,[conflict.kind]:[...records,conflict.remote]} as Vault;
 // Advance only the reviewed record; all other conflicts retain their old base.
 await writeLocalSetting("drive-live-base:"+ring.salt,await encrypt(next,ring));
 // The patched base is not an exact cached Drive snapshot.
 await writeLocalSetting("drive-live-file:"+ring.salt,null);
}
export async function readLatestDriveDraft(local:Vault,ring:Keyring,allowConflicts=false){
 const cached=await readLocalSetting<{id:string;etag:string;marker:string;document?:Envelope}>("drive-live-file:"+ring.salt);
 let file:SharedDriveVault|null=null;
 if(cached){
  try{const candidate=await getSharedVault(cached.id);if(candidate.userPermission?.role==="owner")file=candidate;}
  catch(error){if(!(error instanceof DriveFileAccessError))throw error;}
 }
 if(!file)file=await findLiveVault(ring.salt);
 if(!file)return {vault:local,conflicts:[] as DriveConflict[],file:null,envelope:null,index:null as VaultIndex|null,document:null};
 let previous=await readLocalSetting<Envelope>("drive-live-base:"+ring.salt);
 // A fresh ETag is required on every read. Reuse only the exact encrypted base
 // associated with that file revision, never an arbitrary local draft.
 const unchanged=previous&&cached?.document&&cached.id===file.id&&cached.etag===file.etag&&cached.marker===driveDraftMarker(previous);
 const document=unchanged?cached.document!:await pullBackup(file.id);
 const {vault:remote,index}=await readDriveParts(document,ring,pullBackup);
 const envelope=unchanged?previous!:await encrypt(remote,ring);
 const after=unchanged?file:await getSharedVault(file.id);
 if(file.etag!==after.etag)throw new Error("Drive changed while checking for updates. Please try again; your local draft is kept.");
 if(!previous){
  const saved=await readLocalSetting<DriveSaveCheckpoint>("drive-saved-checkpoint:"+ring.salt),current=await readVault();
  if(current?.salt===ring.salt&&saved?.marker===driveDraftMarker(current))previous=current;
 }
 const base=previous===envelope?remote:previous?(await decryptWithKey(previous,ring)).vault:undefined;
 const review=reviewLiveDraft(local,remote,base);
 return {vault:allowConflicts?review.vault:mergeLiveDraft(local,remote,base),conflicts:review.conflicts,file:after,envelope,index,document};
}
export async function rememberDriveBase(envelope:Envelope,file?:SharedDriveVault|null,document?:Envelope|null){
 const previous=await readLocalSetting<Envelope>("drive-live-base:"+envelope.salt);
 if(!previous||driveDraftMarker(previous)!==driveDraftMarker(envelope))await writeLocalSetting("drive-live-base:"+envelope.salt,envelope);
 if(file)await writeLocalSetting("drive-live-file:"+envelope.salt,{id:file.id,etag:file.etag,marker:driveDraftMarker(envelope),...(document?{document}:{})});
}
export async function publishLiveDraft(latest:Awaited<ReturnType<typeof readLatestDriveDraft>>,ring:Keyring,prepared?:Envelope){
 const envelope=prepared??await encrypt(latest.vault,ring);
 const {document}=await prepareDriveParts(latest.vault,ring,latest.index,part=>createSharedVault("part-"+crypto.randomUUID(),part,"sync-part"));
 const file=latest.file?await updateSharedVault(latest.file,document):await createLiveVault(ring.salt,document);
 await rememberDriveBase(envelope,file,document);
 return envelope;
}
