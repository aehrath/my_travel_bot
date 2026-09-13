"use client";
import {useEffect,useRef,useState} from "react";
import {listBackups,pullBackup,isDriveConnected,driveSessionVersion} from "./drive";
import {useDriveConnection} from "./use-drive-connection";
import {readLatestDriveDraft,rememberDriveBase} from "./drive-live-sync";
import {collectDriveAdditions,type SeenDriveCopies} from "./drive-additions";
import {readLocalSetting,writeLocalSetting,type Envelope,type Keyring,type RemovedVaultRecords} from "./vault";
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
    const latestRemote=await readLatestDriveDraft(start.vault,start.ring,false);
    let result:{vault:Vault;seen:SeenDriveCopies;issues:{id:string;message:string}[]}={vault:latestRemote.vault,seen:{},issues:[]};
    const key="drive-imported-copies:"+start.ring.salt;
    if(!latestRemote.file){
    const seen=await readLocalSetting<SeenDriveCopies>(key)??{};
    const copies=await listBackups(true);
    const removed=await readLocalSetting<RemovedVaultRecords>("drive-local-removals:"+start.ring.salt)??undefined;
    result=await collectDriveAdditions(start.vault,start.ring,copies,seen,async id=>{
     if(!valid())throw new Error("Drive connection changed. Reconnect to continue.");
     return pullBackup(id);
    },removed);
    if(!valid()||!latest.current.enabled||latest.current.envelope?.ciphertext!==start.envelope.ciphertext)return;
    }
    if(!valid()||!latest.current.enabled||latest.current.envelope?.ciphertext!==start.envelope.ciphertext)return;
    if(JSON.stringify(result.vault)!==JSON.stringify(start.vault)){
     if(!await latest.current.apply(result.vault,start.envelope))return;
    }
    if(valid()){if(latestRemote.envelope)await rememberDriveBase(latestRemote.envelope,latestRemote.file,latestRemote.document);else await writeLocalSetting(key,result.seen);}
    if(valid())setStatus(result.issues.length?`Added available trips. ${result.issues.length} saved Drive ${result.issues.length===1?"copy could":"copies could"} not be read; retrying automatically. ${result.issues[0].message}`:`Drive checked · ${result.vault.trips.length} ${result.vault.trips.length===1?"trip":"trips"} on this device`);
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
