"use client";
import { useEffect, useRef, useState } from "react";
import { AirlineField } from "./airline-field";
import { airports, airportLabel } from "@/lib/airports";
import { dateInZone, type FlightOption } from "@/lib/flights";
import type { Booking } from "@/lib/travel";

export function FlightFields({booking:b,onChange}:{booking:Booking;onChange:(b:Booking)=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[flights,setFlights]=useState<FlightOption[]>([]);
 const from=airports.find(a=>airportLabel(a)===b.fromAirport||a.code===b.fromAirport.toUpperCase());
 const to=airports.find(a=>airportLabel(a)===b.toAirport||a.code===b.toAirport.toUpperCase());
 const eligible=!!from&&!!to&&from.code!==to.code&&b.start.slice(0,10)===dateInZone(from.zone);
 const key=[b.fromAirport,b.toAirport,b.start].join("|");
 const current=useRef(key);current.current=key;
 const requestRef=useRef<AbortController|null>(null);
 useEffect(()=>{setFlights([]);setMessage("");setBusy(false);requestRef.current?.abort();return()=>requestRef.current?.abort();},[key]);
 async function lookup(){
  if(!eligible||busy)return;
  const requested=key,controller=new AbortController();requestRef.current=controller;setBusy(true);setMessage("");setFlights([]);
  try{
   const response=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({from:from!.code,to:to!.code,date:b.start.slice(0,10)}),signal:controller.signal});
   const result=await response.json() as {error?:string;flights:FlightOption[];checkedAt:string;partial:boolean};
   if(current.current!==requested||controller.signal.aborted)return;
   if(!response.ok)throw new Error(result.error||"Flight lookup unavailable.");
   const rows:FlightOption[]=result.flights;
   rows.sort((a,c)=>Math.abs(Date.parse(a.start+"Z")-Date.parse(b.start+"Z"))-Math.abs(Date.parse(c.start+"Z")-Date.parse(b.start+"Z")));
   setFlights(rows);
   setMessage(rows.length?`Checked ${new Date(result.checkedAt).toLocaleTimeString()}. Scheduled times, local to each airport. Choose your flight.${result.partial?" Provider results are incomplete.":""}`:"No matching flights returned for this date. Coverage is incomplete; use your ticket to enter the schedule.");
  }catch(e){if(!controller.signal.aborted&&current.current===requested)setMessage(e instanceof Error?e.message:"Flight lookup unavailable.");}
  finally{if(!controller.signal.aborted&&current.current===requested)setBusy(false);}
 }
 return <div className="stack">
  <div className="formGrid"><AirlineField value={b.airline} onChange={airline=>onChange({...b,airline})}/><label className="field"><span>Flight number</span><input value={b.flightNumber} placeholder="e.g. FJ811" maxLength={30} onChange={e=>onChange({...b,flightNumber:e.target.value.toUpperCase()})}/></label></div>
  <div className="flightLookup"><button type="button" className="secondary" disabled={!eligible||busy} onClick={()=>void lookup()}>{busy?"Finding flights…":"Find current flights"}</button>
   <small>Free lookup covers today at the departure airport. Select airports and a departure date/time first. Future schedules: enter the times from your ticket. Lookup sends the route and date to the server; the route is shared with Aviationstack.</small>
   <p role="status">{message}</p>
   {flights.map(f=><button type="button" className="flightOption" key={f.id} disabled={f.status==="cancelled"||f.status==="diverted"||f.status==="incident"} onClick={()=>{onChange({...b,airline:f.airline,flightNumber:f.flightNumber,start:f.start,end:f.end,zone:f.zone,endZone:f.endZone,title:b.title||`${f.flightNumber} · ${from!.code} → ${to!.code}`});setFlights([]);}}><strong>{f.flightNumber} · {f.airline}</strong><span>{f.start.replace("T"," ")} → {f.end.replace("T"," ")}</span><small>{f.zone} → {f.endZone} · {f.status} · Use scheduled times</small></button>)}
  </div>
 </div>;
}
