import type {Envelope} from "./vault";
import type {SharedDriveVault} from "./drive";
export class DriveFileAccessError extends Error {}
export async function loadInvitedVault(id:string,services:{metadata:(id:string)=>Promise<SharedDriveVault>;download:(id:string)=>Promise<Envelope>;authorize:(id:string)=>Promise<string|null>}){
 let before:SharedDriveVault;
 try{before=await services.metadata(id);}catch(error){
  if(!(error instanceof DriveFileAccessError))throw error;
  const selected=await services.authorize(id);
  if(!selected)return null;
  if(selected!==id)throw new Error("Please approve the trip from your invitation.");
  before=await services.metadata(id);
 }
 const envelope=await services.download(id),after=await services.metadata(id);
 if(before.etag!==after.etag)throw new Error("The shared trip changed while opening. Please try again.");
 return {file:after,envelope};
}
