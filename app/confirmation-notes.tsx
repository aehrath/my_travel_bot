import { type ReactNode } from "react";
import { safeConfirmationLink } from "@/lib/confirmation-links";

function inline(text:string):ReactNode[] {
 if(/<br\s*\/?\s*>/i.test(text))return text.split(/<br\s*\/?\s*>/i).flatMap((part,i)=>i?[<br key={`br-${i}`}/>,...inline(part)]:inline(part));
 const parts:ReactNode[]=[];
 const tokens=/\[([^\]\n]+)\]\(([^\s)]+)\)|https?:\/\/[^\s<>]+|\*\*([^*]+)\*\*/g;
 let offset=0;
 for(const match of text.matchAll(tokens)){
  const index=match.index!;
  parts.push(text.slice(offset,index));
  if(match[3])parts.push(<strong key={index}>{inline(match[3])}</strong>);
  else {
   const destination=(match[2]||match[0]).replace(/\\&/g,"&");
   const href=safeConfirmationLink(destination);
   const label=match[1]||(href?new URL(href).hostname:match[0]);
   parts.push(href?<a key={index} href={href} target="_blank" rel="noopener noreferrer" title={href} style={{color:"#1559a0",fontWeight:700,textDecoration:"underline",textUnderlineOffset:"3px",overflowWrap:"anywhere"}}>{label}</a>:match[0]);
  }
  offset=index+match[0].length;
 }
 parts.push(text.slice(offset));
 return parts;
}

export function ConfirmationNotes({text}:{text:string}) {
 const emailLinks=new Map<string,string>();
 for(const match of text.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)|https?:\/\/[^\s<>]+/g)){
  const href=safeConfirmationLink((match[2]||match[0]).replace(/\\&/g,"&"));
  if(href&&!emailLinks.has(href))emailLinks.set(href,match[1]?.replace(/[*\n]/g," ").trim()||new URL(href).hostname);
 }
 const lines=text.replace(/&nbsp;|&#160;|&#x20;|&#32;/gi," ").split(/\r?\n/);
 const blocks:ReactNode[]=[];
 for(let i=0;i<lines.length;){
  const line=lines[i].trim();
  if(!line||/^[\s|:\-]+$/.test(line)){i++;continue;}
  if(line.startsWith("|")){
   const rows:string[][]=[];
   while(i<lines.length&&lines[i].trim().startsWith("|")){
    const cells=lines[i++].trim().replace(/^\||\|$/g,"").split("|").map(cell=>cell.trim());
    if(cells.some(cell=>cell&&!/^[-:\s]+$/.test(cell)))rows.push(cells);
   }
   if(rows.length){
    if(rows.every(row=>row.filter(Boolean).length<=1)){
     for(const row of rows)blocks.push(<p key={blocks.length}>{inline(row.filter(Boolean).join(" "))}</p>);
    }else blocks.push(<div key={blocks.length} style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><tbody>{rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c} style={{padding:"8px 12px",borderBottom:"1px solid var(--border, #ddd)",verticalAlign:"top"}}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
   }
   continue;
  }
  const heading=/^#{1,6}\s+(.+)$/.exec(line);
  blocks.push(heading?<h4 key={blocks.length}>{inline(heading[1])}</h4>:<p key={blocks.length}>{inline(line)}</p>);
  i++;
 }
 if(emailLinks.size)blocks.unshift(<section key="email-links" className="notice"><strong>Email links</strong><ul style={{listStyle:"none",padding:0,display:"grid",gap:"10px",marginTop:"10px"}}>{[...emailLinks].map(([href,label])=><li key={href}><a href={href} title={href} target="_blank" rel="noopener noreferrer" style={{color:"#1559a0",fontWeight:700,textDecoration:"underline",textUnderlineOffset:"3px",overflowWrap:"anywhere"}}>{label} ↗</a></li>)}</ul></section>);
 return <div className="stack" style={{overflowWrap:"anywhere",minWidth:0}}>{blocks}</div>;
}
