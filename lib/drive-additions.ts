import {isDownloadableDriveCopy} from "./drive-file-types";
import type {DriveBackup} from "./drive";
import {decryptWithKey,type Envelope,type Keyring,type RemovedVaultRecords} from "./vault";
import {applyTripDeletions,mergeVaultImport} from "./merge-vault";
import type {Vault} from "./travel";
// File IDs plus revisions make retries cheap without treating an updated file as already read.
export type SeenDriveCopies=Record<string,string>;
export async function collectDriveAdditions(local:Vault,ring:Keyring,copies:DriveBackup[],seen:SeenDriveCopies,download:(id:string)=>Promise<Envelope>,removed:RemovedVaultRecords={trips:[],bookings:[],artifacts:[]}){
 let merged=applyTripDeletions(local,removed.trips);
 const checked={...seen};
 const issues:{id:string;message:string}[]=[];
 for(const file of copies){
  if(!isDownloadableDriveCopy(file))continue;
  const revision=file.md5Checksum||file.modifiedTime;
  if(checked[file.id]===revision)continue;
  if(file.appProperties?.travelVaultSalt&&file.appProperties.travelVaultSalt!==ring.salt){checked[file.id]=revision;continue;}
  try{
  const envelope=await download(file.id);
  if(envelope.salt===ring.salt){
   const incoming=(await decryptWithKey(envelope,ring)).vault;
   const trips=incoming.trips.filter(t=>!removed.trips.includes(t.id));
   const tripIds=new Set(trips.map(t=>t.id));
   const bookings=incoming.bookings.filter(b=>tripIds.has(b.tripId)&&!removed.bookings.includes(b.id));
   const bookingIds=new Set(bookings.map(b=>b.id));
   const artifacts=incoming.artifacts.filter(a=>tripIds.has(a.tripId)&&(!a.bookingId||bookingIds.has(a.bookingId))&&!removed.artifacts.includes(a.id));
   merged=mergeVaultImport(merged,{version:1,trips,bookings,artifacts,...(incoming.deletedTripIds?.length?{deletedTripIds:incoming.deletedTripIds}:{})});
  }
  checked[file.id]=revision;
  }catch(error){issues.push({id:file.id,message:error instanceof Error?error.message:String(error)});}
 }
 return {vault:merged,seen:checked,issues};
}
