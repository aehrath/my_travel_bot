"use client";
import {useState} from "react";
import type {HotelMatch} from "@/lib/hotels";
export function HotelAddressLookup({name,onSelect}:{name:string;onSelect:(address:string)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(name),[busy,setBusy]=useState(false),[matches,setMatches]=useState<HotelMatch[]>([]),[message,setMessage]=useState("");
 async function search(){
  setBusy(true);setMatches([]);setMessage("");
  try{
   const response=await fetch("/api/hotels",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query}),signal:AbortSignal.timeout(15000)});
   const data=await response.json() as {error?:string;matches?:HotelMatch[]};
   if(!response.ok||!Array.isArray(data.matches))throw new Error(data.error||"Hotel search is unavailable.");
   setMatches(data.matches);if(!data.matches.length)setMessage("No address found. Add the city to the search, or enter the address manually.");
  }catch(error){setMessage(error instanceof Error?error.message:"Hotel search is unavailable. You can enter the address manually.");}
  finally{setBusy(false);}
 }
 return <div className="stack" style={{gridColumn:"1 / -1"}}><button type="button" className="textButton" onClick={()=>setOpen(!open)}>{open?"Close hotel search":"Find hotel address"}</button>{open&&<div className="flightLookup"><label className="field"><span>Hotel name and city</span><input value={query} maxLength={200} disabled={busy} onChange={e=>{setQuery(e.target.value);setMatches([]);setMessage("");}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(!busy&&query.trim().length>=3)void search();}}}/></label><button type="button" className="secondary" disabled={busy||query.trim().length<3} onClick={()=>void search()}>{busy?"Finding hotels…":"Search hotels"}</button><p role="status">{message}</p>{matches.map(match=><div className="stack" key={match.mapUrl+match.name}><strong>{match.name}</strong><span>{match.address}</span><div className="actions"><button type="button" className="secondary" onClick={()=>{onSelect(match.address);setOpen(false);}}>Use this address</button><a href={match.mapUrl} target="_blank" rel="noopener noreferrer" className="textButton">View map ↗</a></div></div>)}<small>Search sends only the hotel name and city. Results: Photon · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>. Confirm the property before selecting.</small></div>}</div>;
}
