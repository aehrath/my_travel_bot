"use client";
import { useEffect, useRef, useState } from "react";
import {DocumentViewport} from "./document-viewport";
import type { PDFDocumentProxy } from "pdfjs-dist";

export function PdfPreview({url,name}:{url:string;name:string}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[error,setError]=useState(""),[rendering,setRendering]=useState(true);
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  let disposed=false,task:ReturnType<typeof import("pdfjs-dist")["getDocument"]>|undefined;
  void (async()=>{
   const pdfjs=await import("pdfjs-dist");
   const worker=await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
   if(disposed)return;
   pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
   task=pdfjs.getDocument({url});
   const doc=await task.promise;
   if(!disposed)setPdf(doc);
  })().catch(()=>{if(!disposed)setError("This PDF could not be opened. Download it to view in another app.");});
  return()=>{disposed=true;void task?.destroy();};
 },[url]);
 useEffect(()=>{
  if(!pdf)return;
  let disposed=false,task:ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>|undefined;
  setRendering(true);
  void (async()=>{
   const sheet=await pdf.getPage(page);
   if(disposed||!canvas.current)return;
   const viewport=sheet.getViewport({scale:1});
   // Bound canvas memory on phones, while retaining detail for tickets and barcodes.
   const scale=Math.min(2,1600/viewport.width,2200/viewport.height);
   const view=sheet.getViewport({scale});
   canvas.current.width=Math.ceil(view.width);canvas.current.height=Math.ceil(view.height);
   task=sheet.render({canvas:canvas.current,viewport:view});
   await task.promise;
   if(!disposed)setRendering(false);
  })().catch(()=>{if(!disposed){setError("This page could not be displayed. Try downloading the PDF.");setRendering(false);}});
  return()=>{disposed=true;task?.cancel();};
 },[pdf,page]);
 return <div className="pdfPreview">{error?<p role="alert">{error}</p>:<><div className="actions pdfNavigation"><button type="button" className="secondary" disabled={!pdf||page===1||rendering} onClick={()=>setPage(p=>p-1)}>Previous</button><span aria-live="polite">{pdf?`Page ${page} of ${pdf.numPages}`:"Opening PDF…"}</span><button type="button" className="secondary" disabled={!pdf||page===pdf.numPages||rendering} onClick={()=>setPage(p=>p+1)}>Next</button></div>{rendering&&<small role="status">Loading page…</small>}<DocumentViewport key={page} label={name}><canvas ref={canvas} role="img" aria-label={`${name}, page ${page}`} style={{visibility:rendering?"hidden":"visible"}}/></DocumentViewport></>}</div>;
}
