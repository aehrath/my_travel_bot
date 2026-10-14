import type {Vault} from "./travel";
// Archive only after every reservation's final local calendar day has passed.
// Empty trips remain active; no records are deleted or rewritten.
export function archivedTripIds(vault:Vault,now=new Date()):Set<string>{
 const archived=new Set<string>();
 for(const trip of vault.trips){
  const bookings=vault.bookings.filter(booking=>booking.tripId===trip.id);
  if(bookings.length&&bookings.every(booking=>{
   try{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:booking.endZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
    const value=(type:string)=>parts.find(part=>part.type===type)?.value;
    const date=`${value("year")}-${value("month")}-${value("day")}`;
    return /^\d{4}-\d{2}-\d{2}T/.test(booking.end)&&booking.end.slice(0,10)<date;
   }catch{return false;}
  }))archived.add(trip.id);
 }
 return archived;
}
