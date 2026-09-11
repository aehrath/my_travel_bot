"use client";
import { useId, useRef, useState } from "react";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "@/components/ui/combobox";
import { airports, airportLabel, airportCountryName, searchAirports, type Airport } from "@/lib/airports";

export function AirportField({label,value,onChange}:{label:string;value:string;onChange:(value:string,airport?:Airport)=>void}) {
 const id=useId();
 const [query,setQuery]=useState<string|null>(null);
 const queryRef=useRef<string|null>(null);
 const matches=searchAirports(query??value);
 const selected=airports.find(airport=>airportLabel(airport)===value)??null;
 const highlighted=useRef<Airport|undefined>(undefined);
 const popupOpen=useRef(false);
 const selectAirport=(airport:Airport)=>{queryRef.current=null;setQuery(null);onChange(airportLabel(airport),airport);};
 return <div className="field"><label htmlFor={id}>{label}</label>
  <Combobox items={matches} filter={null} inputValue={query??value} value={selected} itemToStringLabel={airportLabel}
   autoHighlight
   onOpenChange={(open,details)=>{
    popupOpen.current=open;
    if(open){
     // Opening an existing selection starts a fresh search, not a filter for its full label.
     if(details.reason!=="input-change"){queryRef.current="";setQuery("");}
    }else{
     const pending=queryRef.current;
     // Preserve the saved selection on dismissal; still allow unlisted airports as manual entries.
     if(pending?.trim()&&!searchAirports(pending).length)onChange(pending);
     queryRef.current=null;setQuery(null);highlighted.current=undefined;
    }
   }}
   onItemHighlighted={airport=>{highlighted.current=airport;}}
   isItemEqualToValue={(airport,current)=>airport.icao===current.icao}
   // Ignore the combobox's automatic filter reset on close; manual entries are valid.
   onInputValueChange={(text,details)=>{if(details.reason==="input-change"){queryRef.current=text;setQuery(text);}}}
   onValueChange={airport=>{if(airport)selectAirport(airport);}}>
   <ComboboxInput id={id} placeholder="Country, city, airport, or code" autoComplete="off" className="airportInput"
    onKeyDownCapture={event=>{
     if(event.key!=="Tab"||event.shiftKey||!popupOpen.current)return;
     const airport=matches.find(candidate=>candidate.icao===highlighted.current?.icao);
     // Commit before the combobox closes on blur, without trapping normal Tab navigation.
     if(airport)selectAirport(airport);
    }}/>
   <ComboboxContent className="pointer-events-auto"><ComboboxEmpty>No matches. You can keep the airport you typed.</ComboboxEmpty>
    <ComboboxList>{(airport:Airport)=><ComboboxItem key={airport.icao} value={airport}><div><strong>{airport.code} · {airport.name}</strong><small>{airport.city} · {airportCountryName(airport.country)}</small></div></ComboboxItem>}</ComboboxList>
   </ComboboxContent>
  </Combobox>
 </div>;
}
