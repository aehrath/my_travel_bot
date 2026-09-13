"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {clampDocumentView,zoomDocumentAt,type ZoomBounds,type ZoomPoint,type ZoomTransform} from "@/lib/document-zoom";
const initial={scale:1,x:0,y:0};
export function DocumentViewport({children,label}:{children:ReactNode;label:string}){
 const frame=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const current=useRef<ZoomTransform>(initial),bounds=useRef<ZoomBounds>({width:0,height:0,contentWidth:0,contentHeight:0});
 const [view,setView]=useState(initial);
 const controls=useRef<{zoom:(factor:number)=>void;reset:()=>void}>({zoom:()=>{},reset:()=>{}});
 useEffect(()=>{
  const box=frame.current!,paper=content.current!;
  const pointers=new Map<number,ZoomPoint>();
  let start:{view:ZoomTransform;center:ZoomPoint;distance:number}|null=null;
  const update=(next:ZoomTransform)=>{current.current=clampDocumentView(next,bounds.current);setView(current.current);};
  const point=(x:number,y:number)=>{const rect=box.getBoundingClientRect();return {x:x-rect.left,y:y-rect.top};};
  const sample=()=>{const [a,b]=[...pointers.values()];return !a?null:b?{center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:Math.hypot(b.x-a.x,b.y-a.y)}:{center:a,distance:0};};
  const rebase=()=>{const now=sample();start=now?{...now,view:{...current.current}}:null;};
  const resize=()=>{bounds.current={width:box.clientWidth,height:box.clientHeight,contentWidth:paper.offsetWidth,contentHeight:paper.offsetHeight};update(current.current);rebase();};
  const observer=new ResizeObserver(resize);observer.observe(box);observer.observe(paper);resize();
  controls.current={reset:()=>{update(initial);rebase();},zoom:factor=>{const center={x:box.clientWidth/2,y:box.clientHeight/2};update(zoomDocumentAt(current.current,current.current.scale*factor,center,center,bounds.current));rebase();}};
  const down=(e:PointerEvent)=>{if(e.pointerType==="mouse"&&e.button!==0)return;e.preventDefault();box.focus({preventScroll:true});box.setPointerCapture(e.pointerId);pointers.set(e.pointerId,point(e.clientX,e.clientY));rebase();};
  const move=(e:PointerEvent)=>{if(!pointers.has(e.pointerId)||!start)return;e.preventDefault();pointers.set(e.pointerId,point(e.clientX,e.clientY));const now=sample()!;const scale=start.distance>0&&now.distance>0?start.view.scale*now.distance/start.distance:start.view.scale;update(zoomDocumentAt(start.view,scale,start.center,now.center,bounds.current));};
  const up=(e:PointerEvent)=>{pointers.delete(e.pointerId);rebase();};
  const wheel=(e:WheelEvent)=>{e.preventDefault();const unit=e.deltaMode===1?16:e.deltaMode===2?box.clientHeight:1;if(e.ctrlKey||e.metaKey){const at=point(e.clientX,e.clientY);update(zoomDocumentAt(current.current,current.current.scale*Math.exp(-e.deltaY*unit*.01),at,at,bounds.current));}else update({...current.current,x:current.current.x-e.deltaX*unit,y:current.current.y-e.deltaY*unit});rebase();};
  // Safari may emit gesture events instead of a second pointer/ctrl-wheel event.
  let gesture:ZoomTransform|null=null;
  const gestureStart=(e:Event)=>{e.preventDefault();gesture={...current.current};};
  const gestureChange=(e:Event)=>{e.preventDefault();if(!gesture||pointers.size>=2)return;const event=e as Event&{scale:number;clientX:number;clientY:number};const at=Number.isFinite(event.clientX)?point(event.clientX,event.clientY):{x:box.clientWidth/2,y:box.clientHeight/2};if(Number.isFinite(event.scale))update(zoomDocumentAt(gesture,gesture.scale*event.scale,at,at,bounds.current));};
  const gestureEnd=(e:Event)=>{e.preventDefault();gesture=null;};
  const touchMove=(e:TouchEvent)=>e.preventDefault();
  box.addEventListener("pointerdown",down);box.addEventListener("pointermove",move);box.addEventListener("pointerup",up);box.addEventListener("pointercancel",up);box.addEventListener("lostpointercapture",up);
  box.addEventListener("wheel",wheel,{passive:false});box.addEventListener("touchmove",touchMove,{passive:false});
  box.addEventListener("gesturestart",gestureStart,{passive:false});box.addEventListener("gesturechange",gestureChange,{passive:false});box.addEventListener("gestureend",gestureEnd,{passive:false});
  return()=>{observer.disconnect();box.removeEventListener("pointerdown",down);box.removeEventListener("pointermove",move);box.removeEventListener("pointerup",up);box.removeEventListener("pointercancel",up);box.removeEventListener("lostpointercapture",up);box.removeEventListener("wheel",wheel);box.removeEventListener("touchmove",touchMove);box.removeEventListener("gesturestart",gestureStart);box.removeEventListener("gesturechange",gestureChange);box.removeEventListener("gestureend",gestureEnd);};
 },[]);
 return <div className="documentViewer"><div className="documentZoomControls"><button type="button" className="secondary" aria-label="Zoom out" disabled={view.scale<=1} onClick={()=>controls.current.zoom(1/1.25)}>−</button><output aria-label="Document zoom">{Math.round(view.scale*100)}%</output><button type="button" className="secondary" aria-label="Zoom in" disabled={view.scale>=5} onClick={()=>controls.current.zoom(1.25)}>+</button><button type="button" className="secondary" onClick={()=>controls.current.reset()}>Reset</button></div><div ref={frame} className="documentViewport" role="region" aria-label={label+". Pinch to zoom; drag to pan."} tabIndex={0} onKeyDown={e=>{if(e.key==="+"||e.key==="="){e.preventDefault();controls.current.zoom(1.25);}else if(e.key==="-"){e.preventDefault();controls.current.zoom(1/1.25);}else if(e.key==="0"){e.preventDefault();controls.current.reset();}else if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();current.current=clampDocumentView({...current.current,x:current.current.x+(e.key==="ArrowLeft"?40:e.key==="ArrowRight"?-40:0),y:current.current.y+(e.key==="ArrowUp"?40:e.key==="ArrowDown"?-40:0)},bounds.current);setView(current.current);}}}><div ref={content} className="documentZoomContent" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.scale})`}}>{children}</div></div><small>Pinch to zoom · Drag to move</small></div>;
}
