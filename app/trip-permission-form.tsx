"use client";
import {useEffect,useState} from "react";
import {toast} from "sonner";
import {Field} from "./travel-forms";
import {sendSelectedTrips,refreshTripCatalog,type TripCatalog} from "@/lib/trip-sharing";
import {ensureInvitationMail,type SharedDriveVault} from "@/lib/drive";
import type {Vault} from "@/lib/travel";
import {decryptWithKey,readVault,encrypt,writeLocalSetting,type Keyring} from "@/lib/vault";
import type {TripChoices} from "@/lib/trip-access";
export function TripPermissionForm({file,vault,ring,origin,run,onDone}:{file:SharedDriveVault;vault:Vault;ring:Keyring|null;origin:string;run:(f:()=>Promise<void>)=>Promise<void>;onDone:()=>Promise<void>}){
 const [email,setEmail]=useState(""),[choices,setChoices]=useState<TripChoices>({}),[catalog,setCatalog]=useState<TripCatalog>({trips:{},invites:{}}),[working,setWorking]=useState(false);
 useEffect(()=>{let active=true;void refreshTripCatalog(file.id).then(c=>{if(active)setCatalog(c);}).catch(e=>{if(active)toast.error(e.message);});return()=>{active=false;};},[file.id]);
 const removing=!Object.values(choices).some(Boolean);
 async function action(task:()=>Promise<void>){await run(async()=>{setWorking(true);try{await task();}finally{setWorking(false);}});}
 return <div className="stack"><form className="stack" onSubmit={e=>{e.preventDefault();void action(async()=>{
  if(!ring)throw new Error("Unlock your vault before sharing.");
  const address=email.trim();
  if(removing){setCatalog(await sendSelectedTrips(file,vault,ring,address,choices,origin));toast.success("Sharing access removed.");await onDone();return;}
  const saved=await readVault();
  if(!saved||saved.salt!==ring.salt||JSON.stringify((await decryptWithKey(saved,ring)).vault)!==JSON.stringify(vault))throw new Error("Newer changes are saved in another tab. Reload before sharing; your work is safe.");
  await ensureInvitationMail();
  const selection={...choices},local=await encrypt(vault,ring);
  setCatalog(await sendSelectedTrips(file,vault,ring,address,selection,origin));
  await writeLocalSetting("last-share-base:"+file.id,local);
  await writeLocalSetting("active-share-root",{id:file.id,salt:ring.salt});
  toast.success("Selected trips shared. Invitation email sent.");
  await onDone().catch(()=>toast.warning("Invitation sent; refresh the sharing list to see updated access."));
 })}}><Field label="Person’s Google account email"><input type="email" required value={email} onChange={e=>{const address=e.target.value;setEmail(address);setChoices(catalog.invites[address.trim().toLowerCase()]?.choices??{});}}/></Field>
 <small>Choose View or Edit for each trip you want to share. Leave both off to keep a trip private.</small>
 {vault.trips.map(t=><div className="tripPermissionRow" key={t.id}><span><strong>{t.name}</strong><small>{choices[t.id]==="writer"?"Can edit":choices[t.id]==="reader"?"View only":"Not shared"}</small></span><div className="actions" role="group" aria-label={t.name+" sharing permission"}>{(["reader","writer"] as const).map(value=><button type="button" className={choices[t.id]===value?"primary":"secondary"} aria-pressed={choices[t.id]===value} key={value} onClick={()=>setChoices(previous=>({...previous,[t.id]:previous[t.id]===value?undefined:value}))}>{value==="reader"?"View":"Edit"}</button>)}</div></div>)}
 <button className="primary" disabled={working||!ring||(removing&&!catalog.invites[email.trim().toLowerCase()])||file.userPermission?.role!=="owner"}>{working?"Preparing sharing…":removing?"Remove all access":"Create and send invitation"}</button></form>
 {Object.entries(catalog.invites).map(([address,invite])=><div className="attention" key={address}><span><strong>{address}</strong><small>{Object.values(invite.choices).filter(Boolean).length} shared trips</small></span><button className="secondary" onClick={()=>{setEmail(address);setChoices(invite.choices);}}>Edit trip permissions</button></div>)}

 </div>;
}
