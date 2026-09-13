"use client";
import {useEffect,useRef,useState} from "react";
import {isDriveConnected,driveSessionVersion} from "./drive";
import {useDriveConnection} from "./use-drive-connection";
import {readLatestDriveDraft,rememberDriveBase} from "./drive-live-sync";
import {type Envelope,type Keyring} from "./vault";
import type {Vault} from "./travel";
// Import is additive and is committed by the app with its usual atomic revision guard.
export function useAutomaticDriveImport(envelope:Envelope|undefined,ring:Keyring|null,vault:Vault,enabled:boolean,apply:(vault:Vault,expected:Envelope)=>Promise<boolean>){
 const {connected,revision}=useDriveConnection();
 const [status,setStatus]=useState("");
 const latest=useRef({envelope,ring,vault,enabled,apply});latest.current={envelope,ring,vault,enabled,apply};
 const running=useRef(false),retryPending=useRef(false);
 const checkCurrent=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  let active=true;
  if(!connected||!ring||!enabled){setStatus("");return;}
  const valid=()=>active&&isDriveConnected()&&driveSessionVersion()===revision;
  async function check(){
   if(!valid()||!latest.current.enabled||document.visibilityState==="hidden")return;
   if(running.current){retryPending.current=true;return;}
   const start=latest.current;
   if(!start.envelope||!start.ring)return;
   running.current=true;
   setStatus("Checking Google Drive for trips from your other devices…");
   try{
    const latestRemote=await readLatestDriveDraft(start.vault,start.ring);
    const result=latestRemote;
    if(!valid()||!latest.current.enabled||latest.current.envelope?.ciphertext!==start.envelope.ciphertext)return;
    if(JSON.stringify(result.vault)!==JSON.stringify(start.vault)){
     if(!await latest.current.apply(result.vault,start.envelope))return;
    }
    if(valid()){if(latestRemote.envelope)await rememberDriveBase(latestRemote.envelope,latestRemote.file,latestRemote.document);}
    if(valid())setStatus(latestRemote.index?`Drive checked · Linked-file storage (${latestRemote.index.parts.length} files) · ${result.vault.trips.length} ${result.vault.trips.length===1?"trip":"trips"} on this device`:"No live Drive file · Save to Google Drive to create one");
   }catch(error){if(valid())setStatus("Your local trips are safe · Could not load trips from Google Drive: "+(error instanceof Error?error.message:String(error)));}
   finally{running.current=false;if(retryPending.current){retryPending.current=false;checkCurrent.current?.();}}
  }
  const retry=()=>void check();
  checkCurrent.current=retry;
  void check();
  const timer=setInterval(()=>void check(),30000);
  window.addEventListener("focus",retry);window.addEventListener("online",retry);document.addEventListener("visibilitychange",retry);
  return()=>{active=false;if(checkCurrent.current===retry)checkCurrent.current=null;clearInterval(timer);window.removeEventListener("focus",retry);window.removeEventListener("online",retry);document.removeEventListener("visibilitychange",retry);};
 },[connected,revision,ring,enabled]);
 return status;
}
