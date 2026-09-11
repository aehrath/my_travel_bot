"use client";
import { useId, useRef, useState } from "react";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "@/components/ui/combobox";
import { airlines, airlineLabel, searchAirlines, type Airline } from "@/lib/airlines";

export function AirlineField({label="Airline",value,onChange}:{label?:string;value:string;onChange:(value:string,airline?:Airline)=>void}) {
 const id=useId();
 const [query,setQuery]=useState<string|null>(null);
 const queryRef=useRef<string|null>(null);
 const matches=searchAirlines(query??value);
 const selected=airlines.find(airline=>airlineLabel(airline)===value)??null;
 const highlighted=useRef<Airline|undefined>(undefined);
 const popupOpen=useRef(false);
 const selectAirline=(airline:Airline)=>{queryRef.current=null;setQuery(null);onChange(airlineLabel(airline),airline);};
 return <div className="field"><label htmlFor={id}>{label}</label>
  <Combobox items={matches} filter={null} inputValue={query??value} value={selected} itemToStringLabel={airlineLabel}
   autoHighlight
   onOpenChange={(open,details)=>{
    popupOpen.current=open;
    if(open){
     // Opening an existing selection starts a fresh search, not a filter for its full label.
     if(details.reason!=="input-change"){queryRef.current="";setQuery("");}
    }else{
     const pending=queryRef.current;
     // Preserve the saved selection on dismissal; still allow unlisted airlines as manual entries.
     if(pending?.trim()&&!searchAirlines(pending).length)onChange(pending);
     queryRef.current=null;setQuery(null);highlighted.current=undefined;
    }
   }}
   onItemHighlighted={airline=>{highlighted.current=airline;}}
   isItemEqualToValue={(airline,current)=>airline.code===current.code}
   // Ignore the combobox's automatic filter reset on close; manual entries are valid.
   onInputValueChange={(text,details)=>{if(details.reason==="input-change"){queryRef.current=text;setQuery(text);}}}
   onValueChange={airline=>{if(airline)selectAirline(airline);}}>
   <ComboboxInput id={id} placeholder="Airline name or code" autoComplete="off" className="airportInput"
    onKeyDownCapture={event=>{
     if(event.key!=="Tab"||event.shiftKey||!popupOpen.current)return;
     const airline=matches.find(candidate=>candidate.code===highlighted.current?.code);
     // Commit before the combobox closes on blur, without trapping normal Tab navigation.
     if(airline)selectAirline(airline);
    }}/>
   <ComboboxContent className="pointer-events-auto"><ComboboxEmpty>No matches. You can keep the airline you typed.</ComboboxEmpty>
    <ComboboxList>{(airline:Airline)=><ComboboxItem key={airline.code} value={airline}><div><strong>{airline.code} · {airline.name}</strong></div></ComboboxItem>}</ComboboxList>
   </ComboboxContent>
  </Combobox>
 </div>;
}
