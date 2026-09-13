import {vaultSchema,type Vault} from "./travel";
// Only explicit deletion records remove trips. Absence from an older copy never does.
export function applyTripDeletions(vault:Vault,ids:string[]=[]):Vault{
 const deletedTripIds=[...new Set([...(vault.deletedTripIds??[]),...ids])].sort();
 if(!deletedTripIds.length)return vaultSchema.parse(vault);
 const deleted=new Set(deletedTripIds);
 const trips=vault.trips.filter(t=>!deleted.has(t.id));
 const bookings=vault.bookings.filter(b=>!deleted.has(b.tripId));
 const artifacts=vault.artifacts.filter(a=>!deleted.has(a.tripId));
 return vaultSchema.parse({...vault,trips,bookings,artifacts,deletedTripIds});
}
export function recordTripDeletions(before:Vault,next:Vault,previous:string[]=[]):Vault{
 const remaining=new Set(next.trips.map(t=>t.id));
 return applyTripDeletions(next,[...(before.deletedTripIds??[]),...previous,...before.trips.filter(t=>!remaining.has(t.id)).map(t=>t.id)]);
}
// Existing local records win, except when a trip was explicitly deleted on either device.
export function mergeVaultImport(local:Vault,incoming:Vault):Vault{
 const merge=<T extends {id:string}>(current:T[],other:T[])=>{const ids=new Set(current.map(item=>item.id));return [...current,...other.filter(item=>!ids.has(item.id))];};
 const trips=merge(local.trips,incoming.trips),bookings=merge(local.bookings,incoming.bookings);
 const artifacts=merge(local.artifacts,incoming.artifacts).map(a=>{const b=bookings.find(b=>b.id===a.bookingId);return b?{...a,tripId:b.tripId}:a;});
 return applyTripDeletions({version:1,trips,bookings,artifacts},[...(local.deletedTripIds??[]),...(incoming.deletedTripIds??[])]);
}

// For a live shared file, apply remote edits only to records unchanged locally since
// the previous load. Conflicting local edits and locally added trips remain intact.
export function mergeSharedUpdates(local:Vault,incoming:Vault,base:Vault):Vault{
 function merge<T extends {id:string}>(current:T[],other:T[],previous:T[]){
  const old=new Map(previous.map(item=>[item.id,item])),remote=new Map(other.map(item=>[item.id,item]));
  const chosen=current.map(item=>JSON.stringify(item)===JSON.stringify(old.get(item.id))?(remote.get(item.id)??item):item);
  const ids=new Set(current.map(item=>item.id));return [...chosen,...other.filter(item=>!ids.has(item.id))];
 }
 const trips=merge(local.trips,incoming.trips,base.trips),bookings=merge(local.bookings,incoming.bookings,base.bookings);
 const artifacts=merge(local.artifacts,incoming.artifacts,base.artifacts).map(a=>{const b=bookings.find(b=>b.id===a.bookingId);return b?{...a,tripId:b.tripId}:a;});
 return applyTripDeletions({version:1,trips,bookings,artifacts},[...(local.deletedTripIds??[]),...(incoming.deletedTripIds??[])]);
}
