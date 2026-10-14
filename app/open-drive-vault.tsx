"use client";
import {useState} from "react";
import {connectDrive,isDriveConnected,listLiveVaults,pullBackup,getSharedVault,type SharedDriveVault} from "@/lib/drive";
import type {Envelope} from "@/lib/vault";
export function OpenDriveVault({onRestore,run,disabled=false}:{onRestore:(envelope:Envelope)=>void;run:(action:()=>Promise<void>)=>Promise<void>;disabled?:boolean}){
 const [files,setFiles]=useState<SharedDriveVault[]|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 async function open(file:SharedDriveVault){const before=await getSharedVault(file.id);const envelope=await pullBackup(file.id);onRestore({...envelope,liveFile:before});}
 function find(){void run(async()=>{setLoading(true);setError("");try{if(!isDriveConnected())await connectDrive();const found=await listLiveVaults();setFiles(found);if(found.length===1)await open(found[0]);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setLoading(false);}});}
 return <div className="stack"><button className="primary" disabled={disabled||loading} onClick={find}>{loading?"Finding your trips…":"Open my trips from Google Drive"}</button>{error&&<p role="alert">{error}</p>}{files?.length===0&&<p>No saved vault was found in this Google account. Check that you signed in with the account used to save your trips.</p>}{files&&files.length>1&&<><p>There is more than one saved vault. Choose the one to open.</p>{files.map((file,index)=><button className="secondary" key={file.id} onClick={()=>void run(()=>open(file))}>Saved vault {index+1}</button>)}</>}</div>;
}
