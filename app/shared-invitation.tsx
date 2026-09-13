"use client";
import {useEffect,useRef,useState} from "react";
import {prepareDriveConnection,connectDrive,isDriveConnected,getSharedVault,pullInvitation,pickSharedFiles,disconnectDrive,type SharedDriveVault} from "@/lib/drive";
import {loadInvitedVault} from "@/lib/open-invitation";
import {sharedTripIds} from "@/lib/shared-link";
import type {Envelope} from "@/lib/vault";
export function SharedInvitation({id,onOpen}:{id:string;onOpen:(file:SharedDriveVault,envelope:Envelope)=>void}){
 const [signInReady,setSignInReady]=useState(false);
 useEffect(()=>{let active=true;void prepareDriveConnection().then(()=>{if(active)setSignInReady(true);}).catch(()=>{if(active){setSignInReady(true);setError("Google sign-in could not load. Check your connection and try again.");}});return()=>{active=false;};},[]);
 const [working,setWorking]=useState(false),[error,setError]=useState(""),[ready,setReady]=useState(false);
 const [progress,setProgress]=useState("");
 const running=useRef(false),autoStarted=useRef(false);
 async function open(signIn:boolean,chooseAccount=false){
  if(running.current)return;
  running.current=true;setWorking(true);setError("");
  try{
   if(signIn){setProgress("Sign in with the Google account that received the invitation…");await connectDrive(true,false,chooseAccount);}
   setProgress("Opening your invitation…");
   const result=await loadInvitedVault(id,{metadata:getSharedVault,download:(fileId)=>{setProgress("Loading your shared trips…");return pullInvitation(fileId,setProgress);},authorize:async(fileId)=>{
    // URL IDs only help group consent. The downloaded invitation determines what is imported.
    const ids=[...new Set([fileId,...sharedTripIds(window.location.hash)])];
    const selected=await pickSharedFiles(ids,setProgress,[fileId]);
    setProgress("Loading your shared trips…");
    return selected?.includes(fileId)?fileId:null;
   }});
   if(result){setReady(true);onOpen(result.file,result.envelope);}
   else setError("Opening was canceled. Try again and click Select after highlighting the listed files.");
  }catch(e){setError(e instanceof Error?(e.name==="TimeoutError"?"Google Drive took too long to respond. Check your connection and try again.":e.message):"Your shared trip could not be opened.");}
  finally{running.current=false;setWorking(false);setProgress("");}
 }
 useEffect(()=>{if(isDriveConnected()&&!autoStarted.current){autoStarted.current=true;void open(false);}},[]);
 return <section className="panel sharedInvitation"><p className="eyebrow">YOU’RE INVITED</p><h2>Your shared trip</h2><p>{ready?"Your trip is ready to unlock.":"Sign in with your invited Google account. We’ll open the shared trip for you."}</p>{working&&<p className="notice" role="status" aria-live="polite">{progress}</p>}{error&&<p className="notice error" role="alert">{error}</p>}<button className="primary" disabled={working||!signInReady} onClick={()=>void open(!isDriveConnected())}>{!signInReady?"Preparing sign-in…":working?"Opening your trip…":error?"Try again":ready?"Continue opening trip":"Open shared trip with Google"}</button>{error&&!working&&<button className="secondary" onClick={()=>{disconnectDrive();void open(true,true);}}>Use another Google account</button>}<small>Your itinerary stays encrypted. The owner provides the vault passphrase separately.</small></section>;
}
