"use client";
import { useRef } from "react";

const allowed=new Set(["TABLE","THEAD","TBODY","TFOOT","TR","TD","TH","P","DIV","BR","STRONG","B","EM","I","UL","OL","LI","H1","H2","H3","H4","H5","H6","SECTION","ARTICLE","BLOCKQUOTE"]);
const discard=new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","SVG","MATH","IMG","LINK","META","NOSCRIPT","TEMPLATE"]);
function safeFragment(html:string):DocumentFragment {
 const parsed=new DOMParser().parseFromString(html,"text/html"),fragment=document.createDocumentFragment();
 function copy(node:Node,parent:Node){
  if(node.nodeType===Node.TEXT_NODE){parent.appendChild(document.createTextNode(node.textContent||""));return;}
  if(!(node instanceof Element)||discard.has(node.tagName))return;
  // Never copy attributes, links, styles, event handlers, or remote resources.
  const target=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):parent;
  if(target!==parent)parent.appendChild(target);
  for(const child of node.childNodes)copy(child,target);
 }
 for(const child of parsed.body.childNodes)copy(child,fragment);
 return fragment;
}
function textForImport(node:Node):string {
 if(node.nodeType===Node.TEXT_NODE)return node.textContent||"";
 if(!(node instanceof Element))return "";
 if(node.tagName==="BR")return "\n";
 if(node.tagName==="TABLE"){
  const rows=Array.from((node as HTMLTableElement).rows).map(row=>Array.from(row.cells).map(cell=>Array.from(cell.childNodes).map(textForImport).join("").trim().replace(/\|/g," ").replace(/\n+/g,"<br>")));
  return "\n"+rows.map((row,i)=>"| "+row.join(" | ")+" |"+(i===0?"\n| "+row.map(()=>"---").join(" | ")+" |":"")).join("\n")+"\n";
 }
 const text=Array.from(node.childNodes).map(textForImport).join("");
 return /^(P|DIV|LI|UL|OL|H[1-6]|SECTION|ARTICLE|BLOCKQUOTE)$/.test(node.tagName)?text+"\n":text;
}
export function ConfirmationEditor({onChange,disabled=false,initialText=""}:{onChange:(text:string)=>void;disabled?:boolean;initialText?:string}){
 const editor=useRef<HTMLDivElement>(null);
 const startingText=useRef(initialText).current;
 function insert(html:string,plain:string){
  const root=editor.current;if(!root||disabled)return;
  const fragment=html?safeFragment(html):document.createDocumentFragment();
  if(!html)plain.split(/\r?\n/).forEach((line,i)=>{if(i)fragment.appendChild(document.createElement("br"));fragment.appendChild(document.createTextNode(line));});
  const selection=window.getSelection();
  let range=selection?.rangeCount?selection.getRangeAt(0):null;
  if(!range||!root.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(root);range.collapse(false);}
  range.deleteContents();const last=fragment.lastChild;range.insertNode(fragment);
  if(last){range.setStartAfter(last);range.collapse(true);selection?.removeAllRanges();selection?.addRange(range);}
  onChange(textForImport(root).trim());
 }
 return <div className="stack"><div ref={editor} className="confirmationEditor" contentEditable={!disabled} aria-disabled={disabled} suppressContentEditableWarning role="textbox" aria-label="Paste confirmation" aria-multiline="true" data-placeholder="Paste your confirmation here. Tables keep their rows and columns."
  onInput={()=>{if(editor.current)onChange(textForImport(editor.current).trim());}}
  onPaste={event=>{event.preventDefault();insert(event.clipboardData.getData("text/html"),event.clipboardData.getData("text/plain"));}}
  onDrop={event=>{event.preventDefault();insert(event.dataTransfer.getData("text/html"),event.dataTransfer.getData("text/plain"));}}>{startingText}</div>
  <small>Paste directly from your email or webpage to retain tables. You can edit the text before preparing the import.</small>
 </div>;
}
