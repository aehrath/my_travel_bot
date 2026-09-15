"use client";
import {useMemo} from "react";
import type {Vault} from "@/lib/travel";
import {vaultDifferences} from "@/lib/vault-diff";
import {labels,display} from "./drive-conflict-review";
export function DriveDifferences({local,remote,checking}:{local:Vault;remote:Vault|null;checking:boolean}){
 const differences=useMemo(()=>remote?vaultDifferences(local,remote):null,[local,remote]);
 return <section className="panel driveDiff"><h3>Differences from Google Drive</h3><p role="status">{checking?"Refreshing the comparison from Google Drive…":!differences?"No Drive copy has been loaded. Connect Google Drive and check for updates to compare.":!differences.length?"No differences. This device matches the checked Drive version.":`${differences.length} record${differences.length===1?"":"s"} differ from the checked Drive version. Keeping a local version resolves its conflict, but still requires saving to upload that choice.`}</p>{differences?.map(item=><article className="driveConflict" key={item.kind+item.id}><h3>{item.name}</h3><small>{item.kind==="bookings"?"Reservation":item.kind==="artifacts"?"Document":item.kind==="trips"?"Trip":"Vault"} · {item.status}</small><div className="conflictComparison"><strong>Field</strong><strong>This device</strong><strong>Google Drive</strong>{item.fields.map(field=><div className="conflictRow" key={field.key}><strong>{labels[field.key]??field.key}</strong><span>{field.key==="data"&&field.local?"Local file contents":display(field.local)}</span><span>{field.key==="data"&&field.remote?"Drive file contents":display(field.remote)}</span></div>)}</div></article>)}</section>;
}
