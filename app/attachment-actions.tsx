"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { downloadArtifact } from "@/lib/vault";
import { attachmentPreview } from "@/lib/attachment-preview";
import {DocumentViewport} from "./document-viewport";
import { PdfPreview } from "./pdf-preview";
import type { Artifact } from "@/lib/travel";

function AttachmentPreview({attachment}:{attachment:Artifact}){
 const [preview,setPreview]=useState<{url:string;type:string}|null>(null);
 const [message,setMessage]=useState("Opening attachment…");
 useEffect(()=>{
  let url="";
  try{
   const blob=attachmentPreview(attachment.data);
   if(blob){url=URL.createObjectURL(blob);setPreview({url,type:blob.type});}
   else setMessage("Preview is available for PDFs, JPEG, PNG, GIF, and WebP images. Download this file to open it.");
  }catch{setMessage("This attachment could not be previewed. Try downloading it.");}
  return ()=>{if(url)URL.revokeObjectURL(url);};
 },[attachment.data]);
 if(!preview)return <p role="status">{message}</p>;
 return preview.type==="application/pdf"?<PdfPreview url={preview.url} name={attachment.name}/>:<DocumentViewport label={attachment.name}><img draggable={false} className="attachmentImage" src={preview.url} alt={attachment.name} onError={()=>{setPreview(null);setMessage("This image could not be displayed. Try downloading it.");}}/></DocumentViewport>;
}
export function AttachmentActions({attachment}:{attachment:Artifact}){
 const [open,setOpen]=useState(false);
 return <><button type="button" className="secondary" onClick={()=>setOpen(true)}>View</button><button type="button" className="secondary" onClick={()=>downloadArtifact(attachment.data,attachment.name)}>Download</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="attachmentDialog"><DialogTitle>{attachment.name}</DialogTitle><DialogDescription>Attachment preview</DialogDescription>{open&&<AttachmentPreview key={attachment.id} attachment={attachment}/>}<div className="actions"><button type="button" className="secondary" onClick={()=>downloadArtifact(attachment.data,attachment.name)}>Download</button><button type="button" className="secondary" onClick={()=>setOpen(false)}>Close preview</button></div></DialogContent></Dialog></>;
}
