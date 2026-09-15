"use client";
import { useEffect, useRef, useState } from "react";
import {DocumentViewport} from "./document-viewport";
import type { PDFDocumentProxy } from "pdfjs-dist";

function PdfPage({pdf,page,name}:{pdf:PDFDocumentProxy;page:number;name:string}){
 const holder=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [visible,setVisible]=useState(page===1),[ratio,setRatio]=useState(612/792),[ready,setReady]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  const element=holder.current!;
  // Render only pages near the viewport so long PDFs do not exhaust phone memory.
  const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{root:element.closest(".documentViewport"),rootMargin:"600px 0px"});
  observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!visible)return;
  let disposed=false,task:ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>|undefined;
  const surface=canvas.current!;
  setReady(false);setError("");
  void (async()=>{
   const sheet=await pdf.getPage(page);
   if(disposed)return;
   const viewport=sheet.getViewport({scale:1});
   setRatio(viewport.width/viewport.height);
   const scale=Math.min(2,1600/viewport.width,2200/viewport.height);
   const view=sheet.getViewport({scale});
   surface.width=Math.ceil(view.width);surface.height=Math.ceil(view.height);
   task=sheet.render({canvas:surface,viewport:view});
   await task.promise;
   if(!disposed)setReady(true);
  })().catch(()=>{if(!disposed)setError(`Page ${page} could not be displayed. Download the PDF to view it.`);});
  return()=>{disposed=true;task?.cancel();surface.width=0;surface.height=0;};
 },[pdf,page,visible]);
 return <div ref={holder} className="pdfPage" style={{aspectRatio:ratio}} aria-label={`Page ${page} of ${pdf.numPages}`}><canvas ref={canvas} role="img" aria-label={`${name}, page ${page}`} style={{visibility:visible&&ready?"visible":"hidden"}}/>{error?<p className="pdfPageStatus" role="alert">{error}</p>:(!visible||!ready)&&<span className="pdfPageStatus">Page {page}{visible?" · Loading…":""}</span>}</div>;
}

export function PdfPreview({url,name}:{url:string;name:string}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  let disposed=false,task:ReturnType<typeof import("pdfjs-dist")["getDocument"]>|undefined;
  setPdf(null);setError("");
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
 return <div className="pdfPreview">{error?<p role="alert">{error}</p>:pdf?<><p className="pdfPageCount">{pdf.numPages} page{pdf.numPages===1?"":"s"} · Scroll to read</p><DocumentViewport key={url} label={name}><div className="pdfPages">{Array.from({length:pdf.numPages},(_,index)=><PdfPage key={index+1} pdf={pdf} page={index+1} name={name}/>)}</div></DocumentViewport></>:<p role="status">Opening PDF…</p>}</div>;
}
