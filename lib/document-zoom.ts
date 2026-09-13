export type ZoomPoint={x:number;y:number};
export type ZoomTransform=ZoomPoint&{scale:number};
export type ZoomBounds={width:number;height:number;contentWidth:number;contentHeight:number};
export function clampDocumentView(view:ZoomTransform,bounds:ZoomBounds):ZoomTransform{
 const scale=Math.max(1,Math.min(5,view.scale));
 const axis=(value:number,frame:number,content:number)=>content<=frame?(frame-content)/2:Math.max(frame-content,Math.min(0,value));
 return {scale,x:axis(view.x,bounds.width,bounds.contentWidth*scale),y:axis(view.y,bounds.height,bounds.contentHeight*scale)};
}
export function zoomDocumentAt(view:ZoomTransform,scale:number,from:ZoomPoint,to:ZoomPoint,bounds:ZoomBounds){
 const next=Math.max(1,Math.min(5,scale)),ratio=next/view.scale;
 return clampDocumentView({scale:next,x:to.x-(from.x-view.x)*ratio,y:to.y-(from.y-view.y)*ratio},bounds);
}
