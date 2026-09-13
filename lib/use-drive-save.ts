"use client";
import {useEffect,useRef,useState} from "react";
import {readLatestDriveDraft,publishLiveDraft} from "./drive-live-sync";
import {pushBackup,isDriveConnected,connectDrive} from "./drive";
import {publishOwnerTrips,publishInvitedTrips} from "./trip-sharing";
import {encrypt,writeVault,readVault,readLocalSetting,writeLocalSetting,type Envelope,type Keyring} from "./vault";
import {saveDriveDraft,hasLocalDriveChanges,type DriveSaveCheckpoint} from "./drive-save-state";
import type {Vault} from "./travel";
import type {TripSource} from "./trip-access";
export function useDriveSave(envelope:Envelope|undefined,ring:Keyring|null,vault:Vault,sources:TripSource[],onMerge:(vault:Vault,envelope:Envelope)=>void){
 const [checkpoint,setCheckpoint]=useState<DriveSaveCheckpoint|null|undefined>();
 const [saving,setSaving]=useState(false),[error,setError]=useState("");
 const running=useRef(false);
 const key=envelope?"drive-saved-checkpoint:"+envelope.salt:"";
 useEffect(()=>{let active=true;setCheckpoint(undefined);setError("");if(key)void readLocalSetting<DriveSaveCheckpoint>(key).then(saved=>{if(active)setCheckpoint(saved??null);}).catch(()=>{if(active){setCheckpoint(null);setError("Could not check the last Drive save. Your local draft is still available.");}});return()=>{active=false;};},[key]);
 const dirty=!!envelope&&hasLocalDriveChanges(envelope,checkpoint);
 async function save(){
  if(running.current)return;
  if(!envelope||!ring)throw new Error("Unlock the local vault before saving to Google Drive.");
  running.current=true;setSaving(true);setError("");
  try{
   if(!isDriveConnected())await connectDrive();
   const latest=sources.length?null:await readLatestDriveDraft(vault,ring);
   let upload=envelope;
   const current=latest?.vault??vault;
   if(JSON.stringify(current)!==JSON.stringify(vault)){
    upload=await encrypt(current,ring);
    await writeVault(upload,envelope.updated,undefined,undefined,envelope.ciphertext);
    onMerge(current,upload);
   }
   const saved=await saveDriveDraft(upload,{read:readVault,upload:sources.length?pushBackup:undefined,publish:async()=>{
    if(latest)await publishLiveDraft(latest,ring,upload);
    if(sources.length){await publishInvitedTrips(current,ring,await readLocalSetting<TripSource[]>("trip-sources")??sources);}
    else{const root=await readLocalSetting<{id:string;salt:string}>("active-share-root");if(root?.salt===ring.salt)await publishOwnerTrips(root.id,current,ring);}
   },checkpoint:next=>writeLocalSetting(key,next)});
   setCheckpoint(saved);
  }catch(e){setError("Not saved to Google Drive. Local changes are kept. "+(e instanceof Error?e.message:String(e)));throw e;}
  finally{running.current=false;setSaving(false);}
 }
 const status=!envelope?"":saving?"Saving to Google Drive…":error||(!ring?"Local vault is locked":checkpoint===undefined?"Checking last Google Drive save…":dirty?"Local changes · Not saved to Google Drive":"Saved to Google Drive");
 return {save,saving,dirty,status};
}
