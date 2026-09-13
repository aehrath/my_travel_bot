import {findLiveVault,getSharedVault,pullBackup,createLiveVault,updateSharedVault,createSharedVault,type SharedDriveVault} from "./drive";
import {prepareDriveParts,readDriveParts,type VaultIndex} from "./drive-parts";
import {DriveFileAccessError} from "./open-invitation";
import {mergeSharedUpdates,mergeVaultImport} from "./merge-vault";
import {driveDraftMarker,type DriveSaveCheckpoint} from "./drive-save-state";
import {decryptWithKey,encrypt,readVault,readLocalSetting,writeLocalSetting,type Envelope,type Keyring} from "./vault";
import type {Vault} from "./travel";
export function mergeLiveDraft(local:Vault,remote:Vault,base:Vault|undefined):Vault{
 if(!base){
  for(const kind of ["trips","bookings","artifacts"] as const){
   const incoming=new Map(remote[kind].map(item=>[item.id,JSON.stringify(item)]));
   const deleted=new Set([...(local.deletedTripIds??[]),...(remote.deletedTripIds??[])]);
   for(const item of local[kind])if(!deleted.has(kind==="trips"?item.id:(item as {tripId:string}).tripId)&&incoming.has(item.id)&&incoming.get(item.id)!==JSON.stringify(item))throw new Error("Local and Drive versions differ, and their common saved version is unknown. Both copies are kept; review the differing record before saving.");
  }
  return mergeVaultImport(local,remote);
 }
 const deleted=new Set([...(local.deletedTripIds??[]),...(remote.deletedTripIds??[])]);
 for(const kind of ["trips","bookings","artifacts"] as const){
  const old=new Map(base[kind].map(item=>[item.id,JSON.stringify(item)]));
  const incoming=new Map(remote[kind].map(item=>[item.id,JSON.stringify(item)]));
  for(const item of local[kind]){
   if(deleted.has(kind==="trips"?item.id:(item as {tripId:string}).tripId))continue;
   const here=JSON.stringify(item),there=incoming.get(item.id),before=old.get(item.id);
   if(there!==undefined&&here!==there&&here!==before&&there!==before)throw new Error("This record was changed on another device too. Your local draft is kept. Review the latest Drive version before saving conflicting edits.");
  }
 }
 return mergeSharedUpdates(local,remote,base);
}
export async function readLatestDriveDraft(local:Vault,ring:Keyring){
 const cached=await readLocalSetting<{id:string;etag:string;marker:string;document?:Envelope}>("drive-live-file:"+ring.salt);
 let file:SharedDriveVault|null=null;
 if(cached){
  try{const candidate=await getSharedVault(cached.id);if(candidate.userPermission?.role==="owner")file=candidate;}
  catch(error){if(!(error instanceof DriveFileAccessError))throw error;}
 }
 if(!file)file=await findLiveVault(ring.salt);
 if(!file)return {vault:local,file:null,envelope:null,index:null as VaultIndex|null,document:null};
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
 return {vault:mergeLiveDraft(local,remote,base),file:after,envelope,index,document};
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
