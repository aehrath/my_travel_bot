"use client";
import {useEffect,useRef,useState} from "react";
import {isDriveConnected,driveSessionVersion} from "./drive";
import {useDriveConnection} from "./use-drive-connection";
import {readLatestDriveDraft,rememberDriveBase,chooseDriveConflict,acknowledgeDriveConflict,type DriveConflict} from "./drive-live-sync";
import {type Envelope,type Keyring} from "./vault";
import {vaultDifferences} from "./vault-diff";
import type {Vault} from "./travel";
// Import is additive and is committed by the app with its usual atomic revision guard.
export function useAutomaticDriveImport(envelope:Envelope|undefined,ring:Keyring|null,vault:Vault,enabled:boolean,apply:(vault:Vault,expected:Envelope)=>Promise<Envelope|false>,reconciled:(envelope:Envelope)=>Promise<void>){
 const {connected,revision}=useDriveConnection();
 const [remoteVault,setRemoteVault]=useState<Vault|null>(null);
 const [conflicts,setConflicts]=useState<DriveConflict[]>([]);
 const [status,setStatus]=useState("");
 const [error,setError]=useState("");
 const [checking,setChecking]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const latest=useRef({envelope,ring,vault,enabled,apply,reconciled});latest.current={envelope,ring,vault,enabled,apply,reconciled};
 const running=useRef(false),retryPending=useRef(false);
 const checkCurrent=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  let active=true;
  if(!ring){setStatus("");setError("");setConflicts([]);setRemoteVault(null);return;}
  if(!connected)return;
  const valid=()=>active&&isDriveConnected()&&driveSessionVersion()===revision;
  async function check(){
   if(!valid()||!latest.current.enabled||document.visibilityState==="hidden")return;
   if(running.current){retryPending.current=true;return;}
   const start=latest.current;
   if(!start.envelope||!start.ring)return;
   running.current=true;setChecking(true);
   // Keep the last status visible during background checks to avoid layout shifts.
   try{
    const latestRemote=await readLatestDriveDraft(start.vault,start.ring,true);
    const result=latestRemote;
    if(!valid()||!latest.current.enabled||latest.current.envelope?.ciphertext!==start.envelope.ciphertext)return;
    setRemoteVault(result.remoteVault);
    let currentEnvelope=start.envelope;
    if(vaultDifferences(result.vault,start.vault).length){
     const applied=await latest.current.apply(result.vault,start.envelope);
     if(!applied)return;
     currentEnvelope=applied;
    }
    if(valid()&&!result.conflicts.length&&result.matchesDrive)await latest.current.reconciled(currentEnvelope);
    if(valid()){setConflicts(result.conflicts);if(!result.conflicts.length&&latestRemote.envelope)await rememberDriveBase(latestRemote.envelope,latestRemote.file,latestRemote.document);}
    if(valid()){setError("");setStatus(latestRemote.index?`Drive checked · Linked-file storage (${latestRemote.index.parts.length} files) · ${result.vault.trips.length} ${result.vault.trips.length===1?"trip":"trips"} on this device`:"No live Drive file · Save to Google Drive to create one");}
   }catch(error){if(valid()){setStatus("");setError("Could not load trips from Google Drive: "+(error instanceof Error?error.message:String(error)));}}
   finally{running.current=false;setChecking(false);if(retryPending.current){retryPending.current=false;checkCurrent.current?.();}}
  }
  const retry=()=>void check();
  checkCurrent.current=retry;
  void check();
  window.addEventListener("focus",retry);window.addEventListener("online",retry);document.addEventListener("visibilitychange",retry);
  return()=>{active=false;if(checkCurrent.current===retry)checkCurrent.current=null;window.removeEventListener("focus",retry);window.removeEventListener("online",retry);document.removeEventListener("visibilitychange",retry);};
 },[connected,revision,ring,attempt]);
 useEffect(()=>{if(enabled)checkCurrent.current?.();},[enabled]);
 async function resolve(conflict:DriveConflict,choice:"local"|"remote"){
  const start=latest.current;
  if(!start.ring||!start.envelope||running.current)throw new Error("Wait for the Drive check to finish, then try again.");
  running.current=true;setChecking(true);
  try{
   const fresh=await readLatestDriveDraft(start.vault,start.ring,true);
   const current=fresh.conflicts.find(item=>item.kind===conflict.kind&&item.id===conflict.id);
   if(!current||JSON.stringify(current)!==JSON.stringify(conflict))throw new Error("This record changed again. Check for updates and review its latest values.");
   if(latest.current.envelope?.ciphertext!==start.envelope.ciphertext)throw new Error("Your local draft changed. Check for updates before choosing a version.");
   if(!latest.current.enabled||!await latest.current.apply(chooseDriveConflict(fresh.vault,current,choice),start.envelope))throw new Error("Could not apply the choice. Close any editor and try again.");
   await acknowledgeDriveConflict(current,start.ring);
   setConflicts(items=>items.filter(item=>item.kind!==current.kind||item.id!==current.id));
  }finally{running.current=false;setChecking(false);setAttempt(value=>value+1);}
 }
 return {status,error,remoteVault,conflicts,resolve,checking,retry:()=>setAttempt(value=>value+1)};
}
