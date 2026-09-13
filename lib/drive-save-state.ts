import type {Envelope} from "./vault";
export type DriveSaveCheckpoint={marker:string;savedAt:string};
export const driveDraftMarker=(e:Envelope)=>e.salt+":"+e.iv+":"+e.ciphertext.slice(-44);
export const hasLocalDriveChanges=(e:Envelope,checkpoint:DriveSaveCheckpoint|null|undefined)=>checkpoint?.marker!==driveDraftMarker(e);
export async function saveDriveDraft(envelope:Envelope,services:{read:()=>Promise<Envelope|undefined>;upload?:(e:Envelope)=>Promise<unknown>;publish:()=>Promise<unknown>;checkpoint:(saved:DriveSaveCheckpoint)=>Promise<void>}){
 if((await services.read())?.ciphertext!==envelope.ciphertext)throw new Error("A newer local draft exists. Reload before saving to Google Drive.");
 await services.upload?.(envelope);
 await services.publish();
 const checkpoint={marker:driveDraftMarker(envelope),savedAt:new Date().toISOString()};
 // Record precisely what reached Drive. Edits made during upload remain unsaved.
 await services.checkpoint(checkpoint);
 return checkpoint;
}
