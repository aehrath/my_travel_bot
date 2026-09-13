import {vaultSchema,type Vault} from "./travel";
import type {SharedDriveVault} from "./drive";
export type TripPermission="reader"|"writer";
export type TripChoices=Record<string,TripPermission|undefined>;
export type TripSource={tripId:string;file:SharedDriveVault};
export function tripSlice(vault:Vault,tripIds:string[]):Vault{
 const ids=new Set(tripIds);
 return vaultSchema.parse({version:1,trips:vault.trips.filter(t=>ids.has(t.id)),bookings:vault.bookings.filter(b=>ids.has(b.tripId)),artifacts:vault.artifacts.filter(a=>ids.has(a.tripId))});
}
export function assertTripEdits(before:Vault,after:Vault,sources:TripSource[]){
 if(!sources.length)return;
 const editable=new Set(sources.filter(s=>s.file.capabilities.canEdit).map(s=>s.tripId));
 const known=new Set(sources.map(s=>s.tripId));
 if(before.trips.every(t=>known.has(t.id))&&after.trips.some(t=>!known.has(t.id)))throw new Error("Add new trips in your own vault; this shared collection contains only the invited trips.");
 for(const trip of before.trips){
  if(known.has(trip.id)&&!editable.has(trip.id)&&JSON.stringify(tripSlice(before,[trip.id]))!==JSON.stringify(tripSlice(after,[trip.id])))throw new Error(`“${trip.name}” is view only.`);
 }
 // A trip file remains a valid single-trip document; delete its reservations if cancelling a trip.
 if(before.trips.some(t=>!after.trips.some(a=>a.id===t.id)))throw new Error("Only the owner can remove a trip from this shared collection.");
}
