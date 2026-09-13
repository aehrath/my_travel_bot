import {tripSlice,type TripChoices,type TripSource} from "./trip-access";
import {decryptWithKey,encrypt,readLocalSetting,writeLocalSetting,type Keyring} from "./vault";
import type {Vault} from "./travel";
import {loadOwnerCatalog,saveOwnerCatalog,pullBackup,pullTripFiles,createSharedVault,updateSharedVault,getSharedVault,sharedMembers,changeSharedMember,shareVault,ensureInvitationMail,sendInvitationEmail,organizeSharedFile,type SharedDriveVault,type TripManifest} from "./drive";
export type TripCatalog={trips:Record<string,{file:SharedDriveVault;hash:string}>;invites:Record<string,{file:SharedDriveVault;choices:TripChoices}>};
const key=(id:string)=>"trip-catalog:"+id;
export const readTripCatalog=async(id:string):Promise<TripCatalog>=>(await readLocalSetting<TripCatalog>(key(id)))??{trips:{},invites:{}};
async function ownerCatalog(rootId:string){
 const remote=await loadOwnerCatalog(rootId);
 const catalog=remote?.data as TripCatalog|undefined??await readTripCatalog(rootId);
 if(!catalog||typeof catalog.trips!=="object"||typeof catalog.invites!=="object")throw new Error("Invalid sharing settings file.");
 let file=remote?.file??null;
 const save=async()=>{file=await saveOwnerCatalog(rootId,catalog,file);await writeLocalSetting(key(rootId),catalog);};
 // Ensure a private catalog exists before creating any shared trip files.
 if(!file)await save();else await writeLocalSetting(key(rootId),catalog);
 return {catalog,save};
}
export async function refreshTripCatalog(rootId:string){
 const remote=await loadOwnerCatalog(rootId);
 if(remote){const catalog=remote.data as TripCatalog;if(!catalog?.trips||!catalog?.invites)throw new Error("Invalid sharing settings.");await writeLocalSetting(key(rootId),catalog);return catalog;}
 return readTripCatalog(rootId);
}
const hash=async(vault:Vault)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(vault))))).map(n=>n.toString(16).padStart(2,"0")).join("");
async function revoke(fileId:string,email:string){
 const member=(await sharedMembers(fileId)).find(m=>m.emailAddress?.toLowerCase()===email.toLowerCase());
 if(member?.role==="owner")throw new Error("The owner cannot be restricted to selected trips.");
 if(member)await changeSharedMember(fileId,member.id,null);
}
export async function sendSelectedTrips(root:SharedDriveVault,vault:Vault,ring:Keyring,email:string,choices:TripChoices,origin:string){
 if(root.userPermission?.role!=="owner")throw new Error("Only the owner can configure selected-trip sharing.");
 if((await pullBackup(root.id)).salt!==ring.salt)throw new Error("This Drive file belongs to a different vault. Choose your current vault for sharing; your local trips are unchanged.");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid email address.");
 const selected=vault.trips.filter(t=>choices[t.id]==="reader"||choices[t.id]==="writer");

 if(Object.keys(choices).some(id=>choices[id]&&!vault.trips.some(t=>t.id===id)))throw new Error("A selected trip no longer exists.");
 if(selected.length)await ensureInvitationMail();
 await organizeSharedFile(root.id);
 const {catalog,save}=await ownerCatalog(root.id);
 const address=email.trim().toLowerCase();
 // Remove the broad grant first: per-trip restrictions cannot narrow access to a whole-vault file.
 const grants=await sharedMembers(root.id);
 if(grants.some(m=>m.type!=="user"))throw new Error("Remove group, domain, or public access from the whole-vault file before restricting individual trips.");
 await revoke(root.id,address);
 for(const [tripId,entry] of Object.entries(catalog.trips))if(!choices[tripId]){await revoke(entry.file.id,address);entry.file=await getSharedVault(entry.file.id);await save();}
 if(!selected.length){
  if(catalog.invites[address])await revoke(catalog.invites[address].file.id,address);
  delete catalog.invites[address];await save();return catalog;
 }
 const ids:string[]=[];
 for(const trip of selected){
  const slice=tripSlice(vault,[trip.id]),digest=await hash(slice);let entry=catalog.trips[trip.id];
  if(!entry){entry={file:await createSharedVault("trip-"+trip.name,await encrypt(slice,ring),"trip"),hash:digest};catalog.trips[trip.id]=entry;await save();}
  else if(entry.hash!==digest){
   const latest=(await pullTripFiles([entry.file.id])).tripBundle![0];
   const remote=(await decryptWithKey(latest.envelope,ring)).vault;
   if(await hash(remote)===digest){entry.file=latest.file;entry.hash=digest;await save();}
   else{entry.file=await updateSharedVault(entry.file,await encrypt(slice,ring));entry.hash=digest;await save();}
  }
  await shareVault(entry.file.id,address,choices[trip.id]!,origin,false);
  const after=await getSharedVault(entry.file.id);
  if(after.md5Checksum===entry.file.md5Checksum)entry.file=after;
  ids.push(entry.file.id);await save();
 }
 const manifest:TripManifest={format:"travel-trip-collection",version:1,files:ids};
 let invite=catalog.invites[address];
 if(invite){invite.file=await updateSharedVault(invite.file,manifest);invite.choices={...choices};}
 else{invite={file:await createSharedVault("invitation",manifest),choices:{...choices}};catalog.invites[address]=invite;}
 await save();
 await shareVault(invite.file.id,address,"reader",origin,false);invite.file=await getSharedVault(invite.file.id);await save();
 // Only one email, after all trip permissions and the private index are ready.
 await sendInvitationEmail(invite.file.id,address,origin,ids);
 return catalog;
}
export async function publishOwnerTrips(rootId:string,vault:Vault,ring:Keyring){
 const {catalog,save}=await ownerCatalog(rootId);let count=0;
 for(const [id,entry] of Object.entries(catalog.trips)){
  if(!vault.trips.some(t=>t.id===id))continue;
  const slice=tripSlice(vault,[id]),digest=await hash(slice);
  if(digest===entry.hash)continue;
  entry.file=await updateSharedVault(entry.file,await encrypt(slice,ring));entry.hash=digest;count++;
  await save();
 }
 return count;
}
export async function publishInvitedTrips(vault:Vault,ring:Keyring,sources:TripSource[]){
 const next=[...sources];
 for(let index=0;index<next.length;index++){
  const source=next[index];if(!source.file.capabilities.canEdit)continue;
  const slice=tripSlice(vault,[source.tripId]);if(slice.trips.length!==1)throw new Error("A shared trip cannot be removed while publishing.");
  next[index]={...source,file:await updateSharedVault(source.file,await encrypt(slice,ring))};
  await writeLocalSetting("trip-sources",next);
 }
 return next;
}

