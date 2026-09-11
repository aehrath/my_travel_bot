import { z } from "zod";
import { instant } from "./travel";

export type FlightOption={id:string;airline:string;flightNumber:string;start:string;end:string;zone:string;endZone:string;status:string};
const endpoint=z.object({iata:z.string(),scheduled:z.string().nullable(),timezone:z.string().nullable()});
const record=z.object({departure:endpoint,arrival:endpoint,flight_status:z.string(),airline:z.object({name:z.string().nullable(),iata:z.string().nullable()}),flight:z.object({iata:z.string().nullable(),number:z.string().nullable()})});
export function dateInZone(zone:string,now:Date=new Date()):string {
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function localFlightTime(value:string,zone:string):string {
 // Require an explicit offset: never interpret provider data in the server's local zone.
 if(!/(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error("Invalid flight timestamp");
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function parseFlights(raw:unknown,from:string,to:string,date:string):FlightOption[]{
 const envelope=z.object({data:z.array(z.unknown())}).parse(raw);
 const found=new Map<string,FlightOption>();
 for(const row of envelope.data){
  const parsed=record.safeParse(row);if(!parsed.success)continue;
  const r=parsed.data;
  if(r.departure.iata!==from||r.arrival.iata!==to||!r.departure.scheduled||!r.arrival.scheduled||!r.departure.timezone||!r.arrival.timezone)continue;
  try {
   const zone=r.departure.timezone,endZone=r.arrival.timezone;
   const start=localFlightTime(r.departure.scheduled,zone),end=localFlightTime(r.arrival.scheduled,endZone);
   const flightNumber=r.flight.iata||((r.airline.iata||"")+(r.flight.number||""));
   if(start.slice(0,10)!==date||!flightNumber||instant(end,endZone)<instant(start,zone))continue;
   const id=[flightNumber,start,end].join("|");
   found.set(id,{id,airline:r.airline.name?(r.airline.name+(r.airline.iata?` (${r.airline.iata})`:"")):(r.airline.iata||""),flightNumber,start,end,zone,endZone,status:r.flight_status});
  }catch{ /* Incomplete/invalid provider records must not populate a reservation. */ }
 }
 return [...found.values()].sort((a,b)=>a.start.localeCompare(b.start));
}
