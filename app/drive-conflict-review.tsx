"use client";
import type {DriveConflict} from "@/lib/drive-live-sync";
const labels:Record<string,string>={title:"Reservation",name:"Name",tripId:"Trip",start:"Start",end:"End",zone:"Time zone",endZone:"End time zone",total:"Total price",currency:"Currency",travelers:"Travelers",payments:"Payments",due:"Balance due date",dueDaysBefore:"Days before check-in",location:"Location",address:"Address",notes:"Notes",confirmation:"Confirmation",priceBasis:"Price entered as",perTravelerPrice:"Price per traveler"};
function display(value:unknown):string{
 if(value===undefined||value===null||value==="")return "Not set";
 if(Array.isArray(value))return value.length?value.map(display).join("\n\n"):"None";
 if(typeof value==="object")return Object.entries(value).filter(([key])=>key!=="id").map(([key,val])=>`${labels[key]??key}: ${display(val)}`).join("\n");
 return String(value);
}
export function DriveConflictReview({conflicts,disabled,resolve}:{conflicts:DriveConflict[];disabled:boolean;resolve:(conflict:DriveConflict,choice:"local"|"remote")=>void}){
 if(!conflicts.length)return null;
 return <section className="syncError"><h3>Choose which changes to keep</h3><p>Other trips and documents can sync. These records have different changes on this device and Google Drive. Review the differences below, then choose a version. Your choice is kept locally until you save to Google Drive.</p>{conflicts.map(conflict=><article className="driveConflict" key={conflict.kind+conflict.id}><h3>{conflict.name}</h3><div className="conflictComparison"><div className="conflictHead">Field</div><strong>This device</strong><strong>Google Drive</strong>{[...new Set([...Object.keys(conflict.local),...Object.keys(conflict.remote)])].filter(key=>JSON.stringify(conflict.local[key])!==JSON.stringify(conflict.remote[key])).map(key=><div className="conflictRow" key={key}><strong>{labels[key]??key}</strong><span>{display(conflict.local[key])}</span><span>{display(conflict.remote[key])}</span></div>)}</div><div className="actions"><button className="secondary" disabled={disabled} onClick={()=>resolve(conflict,"local")}>Keep this device’s version</button><button className="primary" disabled={disabled} onClick={()=>resolve(conflict,"remote")}>Use Google Drive’s version</button></div></article>)}</section>;
}
