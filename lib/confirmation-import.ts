import { airports, airportLabel } from "./airports";
import { airlines, airlineLabel } from "./airlines";
import { blankBooking, bookingSchema, flightReservationName, instant, today, uid, type Booking } from "./travel";

const months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
function clean(text:string):string {
 return text.replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/<br\s*\/?\s*>/gi,"\n")
  .replace(/&nbsp;|&#160;/gi," ").replace(/[\u00a0\u202f]/g," ").replace(/[*#|\\]/g," ")
  .split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^[-:\s]+$/.test(line)).join("\n");
}
function clock(text:string):string {
 const matches=[...text.matchAll(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/gi)];
 const values=matches.map(m=>{
  let hour=Number(m[1]);const minute=Number(m[2]);
  if(minute>59||hour>(m[3]?12:23)||(m[3]&&hour<1))throw new Error("Invalid flight time in confirmation.");
  if(m[3])hour=hour%12+(m[3].toUpperCase()==="PM"?12:0);
  return String(hour).padStart(2,"0")+":"+m[2];
 });
 if(!values.length||new Set(values).size!==1)throw new Error("Could not identify one consistent local time for each flight date. Paste one flight at a time, including both dates and times.");
 return values[0];
}
function deltaPlainRows(text:string):string[][] {
 const plain=clean(text).replace(/\s+/g," ");
 const dates=[...plain.matchAll(/\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s*\d{1,2}\s*(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+\d{4})?\b/gi)];
 const rows:string[][]=[];
 for(let i=0;i<dates.length;i++){
  const part=plain.slice(dates[i].index!+dates[i][0].length,dates[i+1]?.index);
  const flight=/\bDELTA\s+\d{1,4}\b/i.exec(part);
  if(!flight)throw new Error("Could not find the Delta flight number beside its date.");
  const route=part.slice(flight.index+flight[0].length);
  const times=[...route.matchAll(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b(?:\s*\+\s*\d\s*(?:days?)?)?/gi)];
  if(times.length!==2)throw new Error("Could not identify two Delta local times. Include the departure and arrival times with AM/PM.");
  // Clipboard text can flatten table cells into tabs, newlines, or spaces. Locate city/code
  // mentions independently of that whitespace, then preserve their departure/arrival order.
  const names=[...new Set(airports.flatMap(a=>[a.city,a.code]).filter(name=>name.length>=3))];
  const mentions=names.flatMap(name=>{
   const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
   const regex=new RegExp(`\\b${escaped}\\b(?:,\\s*([A-Z]{2})\\b)?`,"gi");
   return [...route.matchAll(regex)].map(m=>({name,at:m.index!,end:m.index!+m[0].length,country:m[1]}));
  }).sort((a,b)=>a.at-b.at||b.end-a.end);
  const places:typeof mentions=[];
  for(const m of mentions){
   if(places.some(p=>m.at<p.end&&m.end>p.at))continue;
   // Ignore fare/cabin prose: locations must be after the last cabin parenthesis,
   // or be in the section leading directly into the first departure time.
   if(m.at<route.lastIndexOf(")",times[0].index))continue;
   places.push(m);
  }
  if(places.length!==2)throw new Error("Could not confidently identify both Delta airports from the pasted text. Include both cities or airport codes next to their times.");
  const cells=places.map((p,j)=>`${p.name}${p.country?", "+p.country.toUpperCase():""}\n${times[j][0]}`);
  rows.push([dates[i][0],"DEPART","ARRIVE"],[flight[0],...cells]);
 }
 if(!rows.length)throw new Error("Could not read the Delta departure date. Include the date, such as Fri, 15JAN.");
 return rows;
}
function deltaConfirmation(text:string,tripId:string,referenceDate:string):Booking[]|null {
 const plain=clean(text);
 if(!/\bDELTA\s+\d+\b/i.test(plain)||!/\bDEPART\b/i.test(plain)||!/\bARRIVE\b/i.test(plain))return null;
 let rows=text.split(/\r?\n/).filter(line=>line.includes("|")).map(line=>line.split("|").slice(1,-1).map(clean));
 const findHeaders=()=>rows.map((row,index)=>({row,index})).filter(({row})=>row.some(c=>/^DEPART$/i.test(c))&&row.some(c=>/^ARRIVE$/i.test(c)));
 if(!findHeaders().length)rows=deltaPlainRows(text);
 const headers=findHeaders();
 return headers.map(({row,index})=>{
  const values=rows.slice(index+1).find(r=>r.some(c=>/^DELTA\s+\d+/i.test(c)));
  if(!values)throw new Error("Delta flight row is missing.");
  const date=/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s*(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{4}))?\b/i.exec(row.join(" "));
  if(!date)throw new Error("Delta departure date could not be read.");
  const month=months.indexOf(date[3].toLowerCase())+1,day=Number(date[2]);
  const year=Number(date[4]||referenceDate.slice(0,4));
  const makeDate=(y:number)=>`${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  let departureDate=makeDate(year);
  if(!date[4]&&departureDate<referenceDate)departureDate=makeDate(year+1);
  if(new Date(departureDate+"T00:00:00Z").toISOString().slice(0,10)!==departureDate||["sun","mon","tue","wed","thu","fri","sat"][new Date(departureDate+"T00:00:00Z").getUTCDay()]!==date[1].toLowerCase())throw new Error("The flight weekday does not match the inferred year. Add the four-digit year after the date before importing.");
  const warnings:string[]=[];
  if(!date[4])warnings.push(`Year inferred as ${departureDate.slice(0,4)} from the next upcoming date; confirm it.`);
  function endpoint(cell:string){
   const cityLine=cell.split("\n")[0].trim();
   const [city,country]=cityLine.split(",").map(s=>s.trim());
   const candidates=airports.filter(a=>(a.code===city.toUpperCase()||a.city.toLowerCase()===city.toLowerCase())&&(!country||a.country===country.toUpperCase()));
   const preferred=candidates.filter(a=>a.code===city.toUpperCase()||/international/i.test(a.name));
   const options=preferred.length?preferred:candidates;
   if(options.length!==1)throw new Error(`Airport is ambiguous for ${cityLine}. Replace the city with the airport's three-letter code and try again.`);
   const airport=options[0];
   if(airport.code!==city.toUpperCase())warnings.push(`Airport inferred: ${cityLine} → ${airport.code}; confirm it.`);
   return {airport,time:clock(cell),offset:/\+\s*(\d)\b/i.exec(cell)?.[1]};
  }
  const dep=endpoint(values[row.findIndex(c=>/^DEPART$/i.test(c))]||""),arr=endpoint(values[row.findIndex(c=>/^ARRIVE$/i.test(c))]||"");
  const start=departureDate+"T"+dep.time;
  let arrivalDate=departureDate;
  const shift=(n:number)=>new Date(Date.parse(departureDate+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
  if(arr.offset)arrivalDate=shift(Number(arr.offset));
  else {
   // Compare actual instants, not clock strings: eastbound date-line flights can arrive earlier locally.
   let offset=0;
   while(instant(arrivalDate+"T"+arr.time,arr.airport.zone)<=instant(start,dep.airport.zone)&&offset<2)arrivalDate=shift(++offset);
   warnings.push(`Arrival date inferred as ${arrivalDate}; confirm it against your ticket.`);
  }
  const number=/\bDELTA\s+(\d{1,4})\b/i.exec(values.join(" "))?.[1];
  const b={...blankBooking(tripId),kind:"Flight" as const,start,end:arrivalDate+"T"+arr.time,zone:dep.airport.zone,endZone:arr.airport.zone,
   fromAirport:airportLabel(dep.airport),toAirport:airportLabel(arr.airport),airline:"Delta Air Lines (DL)",flightNumber:"DL"+number,
   notes:"Import review: "+warnings.join(" ")+"\n\n"+text};
  return bookingSchema.parse({...b,title:flightReservationName(b)});
 });
}
function hotelConfirmation(text:string,tripId:string):Booking[]|null {
 const plain=clean(text);
 if(!/\bProperty\s*:/i.test(plain)||!/\bArrival Date\s*:/i.test(plain)||!/\bDeparture Date\s*:/i.test(plain))return null;
 const labels="Reference|Property|Customer Name|Customer Address|Customer Contact|Arrival Date|Departure Date|Stay Period|Status|Total Cost|Payments/Invoiced|Balance Required";
 const field=(label:string)=>new RegExp(`(?:^|\\b)${label}\\s*:\\s*([\\s\\S]*?)(?=\\b(?:${labels})\\s*:|$)`,"i").exec(plain)?.[1].trim()||"";
 const property=field("Property");
 if(!property)throw new Error("The hotel property name is missing.");
 const regions=new Intl.DisplayNames(["en"],{type:"region"});
 const countries=[...new Set(airports.map(a=>a.country))].filter(code=>{try{const name=regions.of(code);return name&&new RegExp(`\\b${name}\\b`,"i").test(property);}catch{return false;}});
 const zones=[...new Set(airports.filter(a=>countries.includes(a.country)).map(a=>a.zone))];
 const zone=zones.length===1?zones[0]:"";
 const countryName=countries.length===1?regions.of(countries[0]):undefined;
 const firstLine=property.split("\n")[0];
 const countryIndex=countryName?firstLine.toLowerCase().indexOf(countryName.toLowerCase()):-1;
 const countryEnd=countryIndex>=0?countryIndex+countryName!.length:0;
 const title=(countryEnd>0?firstLine.slice(0,countryEnd):firstLine).trim();
 const location=property.slice(title.length).trim();
 function date(label:string){
  const match=/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/.exec(field(label));
  if(!match||!months.includes(match[2].slice(0,3).toLowerCase()))throw new Error(`Could not read hotel ${label.toLowerCase()}. Include day, month and year.`);
  const value=`${match[3]}-${String(months.indexOf(match[2].slice(0,3).toLowerCase())+1).padStart(2,"0")}-${match[1].padStart(2,"0")}`;
  if(!Number.isFinite(Date.parse(value+"T00:00:00Z"))||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)throw new Error("Invalid hotel calendar date.");
  return value;
 }
 const arrival=date("Arrival Date"),departure=date("Departure Date");
 if(departure<=arrival)throw new Error("Hotel departure must be after arrival.");
 const nights=/\b(\d+)\s+Nights?\b/i.exec(field("Stay Period"));
 if(nights&&(Date.parse(departure)-Date.parse(arrival))/86400000!==Number(nights[1]))throw new Error("Hotel stay dates disagree with the number of nights. Review the confirmation.");
 function amount(label:string){const m=/(?:\$|\b[A-Z]{3}\s*)?\s*(\d[\d,]*\.\d{2})/.exec(field(label));return m?Number(m[1].replace(/,/g,"")):undefined;}
 const total=amount("Total Cost"),credit=amount("Payments/Invoiced"),remaining=amount("Balance Required");
 if(total===undefined)throw new Error("Could not identify the hotel total cost.");
 if(credit!==undefined&&remaining!==undefined&&Math.abs(total-credit-remaining)>.01)throw new Error("The hotel total, payments and remaining balance do not agree.");
 const currency=/\bAll amounts are[^\n]*\(([A-Z]{3})\)/i.exec(plain)?.[1]?.toUpperCase()||/\b([A-Z]{3})\s*[\d,]+\.\d{2}/.exec(field("Balance Required"))?.[1];
 if(!currency)throw new Error("Hotel currency is missing. Include its three-letter code.");
 const warnings=["Check-in/out times are not supplied; 15:00 and 11:00 are placeholders. Confirm them.",zone?`Time zone inferred as ${zone}; confirm it.`:"Select the property's time zone before importing.","No balance due date was supplied; add it if known."];
 if(credit)warnings.push(`Payments/Invoiced reports ${currency} ${credit.toFixed(2)}. Confirm this was actually paid and enter the payment date below, or remove the proposed payment.`);
 const b:Booking={...blankBooking(tripId),kind:"Hotel",title,location,confirmation:field("Reference").split(/\s/)[0],start:arrival+"T15:00",end:departure+"T11:00",zone,endZone:zone,total,currency,
  payments:credit?[{id:uid(),amount:credit,date:"",note:"Imported Payments/Invoiced — confirm payment received"}]:[],notes:"Import review: "+warnings.join(" ")+"\n\n"+text};
 // Missing payment dates/time zones remain explicit review requirements. Saving validates them.
 return [b];
}
function hotelBookingConfirmation(text:string,tripId:string):Booking[]|null {
 // Email HTML often places bold labels directly beside their values without whitespace.
 const plain=clean(text).replace(/Hotel\s+Booking\s+Reference/gi," Hotel Booking Reference ").replace(/Check[ -]?(in|out)/gi," Check $1 ").replace(/Reservation\s+information/gi," Reservation information ");
 const flat=plain.replace(/\s+/g," ");
 if(!/\bHotel Booking Reference\b/i.test(flat)||!/\bCheck[ -]?in\b/i.test(flat)||!/\bCheck[ -]?out\b/i.test(flat))return null;
 // Only the stay section defines arrival/departure. Later fee prose may also say check-in.
 const stay=flat.split(/\bReservation information\b/i)[0];
 const labels=[...stay.matchAll(/\bCheck[ -]?(in|out)\b/gi)];
 if(labels.length!==2||labels[0][1].toLowerCase()!=="in"||labels[1][1].toLowerCase()!=="out")throw new Error("Include one hotel check-in and one check-out section in that order.");
 function endpoint(index:number){
  const section=stay.slice(labels[index].index!+labels[index][0].length,index===0?labels[1].index:undefined);
  const match=/^\s*:?\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s*(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?\b/i.exec(section);
  const label=index===0?"check-in":"check-out";
  if(!match)throw new Error(`Could not read hotel ${label}. Include weekday, day, month, year and local time.`);
  const date=`${match[4]}-${String(months.indexOf(match[3].slice(0,3).toLowerCase())+1).padStart(2,"0")}-${match[2].padStart(2,"0")}`;
  const parsed=new Date(date+"T00:00:00Z");
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||["sun","mon","tue","wed","thu","fri","sat"][parsed.getUTCDay()]!==match[1].slice(0,3).toLowerCase())throw new Error(`Hotel ${label} date and weekday disagree. Review the supplied date.`);
  let hour=Number(match[5]);
  if(Number(match[6])>59||hour>(match[7]?12:23)||(match[7]&&hour<1))throw new Error(`Invalid hotel ${label} time.`);
  if(match[7])hour=hour%12+(match[7].toUpperCase()==="PM"?12:0);
  return date+"T"+String(hour).padStart(2,"0")+":"+match[6];
 }
 const start=endpoint(0),end=endpoint(1);
 if(end.slice(0,10)<=start.slice(0,10))throw new Error("Hotel checkout must be after check-in.");
 const title=(/\bhotel booking at\s+(.+?)\s+(?:for\s+.+?\s+)?is confirmed\b/i.exec(flat)?.[1]||/\bReservation information\s*:?\s*\n([^\n]+)/i.exec(plain)?.[1]||/\bReservation information\s*:?\s*(.+)$/i.exec(flat)?.[1]||"").trim();
 if(!title)throw new Error("The hotel property name is missing.");
 const confirmation=/\bHotel Booking Reference\s*:?\s*([A-Z0-9-]+(?:\s*\([A-Z0-9-]+\))?)/i.exec(flat)?.[1]||"";
 // Infer only from city names inside the property name, never the guest or event text.
 const cities=[...new Set(airports.map(a=>a.city))].filter(city=>city.length>=4&&new RegExp("\\b"+city.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(title));
 const longest=cities.filter(city=>!cities.some(other=>other.length>city.length&&other.toLowerCase().includes(city.toLowerCase())));
 const zones=[...new Set(airports.filter(a=>longest.includes(a.city)).map(a=>a.zone))];
 // Los Angeles also names a city in Chile. This exact property is verified in California:
 // https://www.marriott.com/en-us/hotels/laxox-moxy-downtown-los-angeles/overview/
 const knownPropertyZone=/^Moxy Downtown Los Angeles$/i.test(title)?"America/Los_Angeles":"";
 const zone=knownPropertyZone||(zones.length===1?zones[0]:"");
 const location=longest.length===1?longest[0]:"";
 const nights=/\bNights\s*:?\s*(\d+)\b/i.exec(flat);
 if(nights&&Number(nights[1])!==(Date.parse(end.slice(0,10))-Date.parse(start.slice(0,10)))/86400000)throw new Error("Hotel stay dates disagree with the number of nights. Review the confirmation.");
 const quoted=/(?:^|[^\w-])Total\s*:?\s*(?:([A-Z]{3})\s*)?[$€£]?\s*(\d[\d,]*\.\d{2})\b/i.exec(flat);
 const cents=(value:string)=>Math.round(Number(value.replace(/,/g,""))*100);
 const subtotal=/\bSub[- ]?total\s*:?\s*(?:[A-Z]{3}\s*)?[$€£]?\s*(\d[\d,]*\.\d{2})\b/i.exec(flat);
 const taxes=/\bTaxes\s*:?\s*(?:[A-Z]{3}\s*)?[$€£]?\s*(\d[\d,]*\.\d{2})\b/i.exec(flat);
 const fee=/\bPlus hotel fees\s*:?\s*(?:([A-Z]{3})\s*)?\$?\s*(\d[\d,]*\.\d{2})\b/i.exec(flat);
 const warnings=[zone?`Time zone inferred from the hotel location: ${zone}; confirm it.`:"Select the hotel's time zone before importing."];
 let total=0,currency="USD";
 if(quoted){
  if(!quoted[1])throw new Error("Include the three-letter currency code beside the hotel total.");
  currency=quoted[1].toUpperCase();total=cents(quoted[2]);
  if(subtotal&&taxes&&cents(subtotal[1])+cents(taxes[1])!==total)throw new Error("Hotel subtotal and taxes do not match the quoted total. Review the amounts.");
  warnings.push(`Quoted total: ${currency} ${(total/100).toFixed(2)}${taxes?` (including ${(cents(taxes[1])/100).toFixed(2)} taxes)`:""}.`);
  if(fee){
   if(fee[1]&&fee[1].toUpperCase()!==currency)throw new Error("Hotel fees use a different currency. Review the amounts before importing.");
   const amount=cents(fee[2]);total+=amount;
   warnings.push(`Additional hotel fee: ${currency} ${(amount/100).toFixed(2)}, included once in the reservation total; confirm whether it applies per stay or per night. The confirmation says additional mandatory charges are collected at check-in.`);
  }
  warnings.push("No payment or deadline for the full balance was supplied; no payment has been recorded.");
 }else warnings.push("No cost, payment or balance deadline was supplied; add them if known.");
 const booking:Booking={...blankBooking(tripId),kind:"Hotel",title,location,confirmation,start,end,zone,endZone:zone,total:total/100,currency,notes:"Import review: "+warnings.join(" ")+"\n\n"+text};
 bookingSchema.parse({...booking,zone:zone||"UTC",endZone:zone||"UTC"});
 return [booking];
}
function hotelStayConfirmation(text:string,tripId:string,referenceDate:string):Booking[]|null {
 const plain=clean(text);
 if(!/\bCheck-in\b/i.test(plain)||!/\bCheck-out\b/i.test(plain))return null;
 // Limit parsing to the stay section: cancellation dates/times are not checkout or payment deadlines.
 const stay=plain.split(/\bFree cancellation|\bCancellation policy/i)[0];
 const dates=[...stay.matchAll(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/gi)];
 if(dates.length!==2)throw new Error("Could not identify exactly two hotel stay dates. Include both check-in and check-out dates.");
 const warnings:string[]=[];
 const makeDate=(match:RegExpMatchArray,year:number)=>`${year}-${String(months.indexOf(match[2].toLowerCase())+1).padStart(2,"0")}-${match[3].padStart(2,"0")}`;
 let startDate=makeDate(dates[0],Number(dates[0][4]||referenceDate.slice(0,4)));
 if(!dates[0][4]&&startDate<referenceDate)startDate=makeDate(dates[0],Number(referenceDate.slice(0,4))+1);
 let endDate=makeDate(dates[1],Number(dates[1][4]||startDate.slice(0,4)));
 if(!dates[1][4]&&endDate<startDate)endDate=makeDate(dates[1],Number(startDate.slice(0,4))+1);
 for(const [i,value] of [startDate,endDate].entries()){
  const parsed=new Date(value+"T00:00:00Z");
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value||["sun","mon","tue","wed","thu","fri","sat"][parsed.getUTCDay()]!==dates[i][1].toLowerCase())throw new Error("Hotel date and weekday disagree. Add the correct four-digit years to both stay dates before importing.");
 }
 if(endDate<=startDate)throw new Error("Hotel checkout must be after check-in.");
 if(!dates[0][4]||!dates[1][4])warnings.push(`Stay dates inferred as ${startDate} to ${endDate}; confirm the omitted year.`);
 const clockPattern=/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi;
 const times=[...stay.matchAll(clockPattern)];
 if(times.length!==2)throw new Error("Could not identify both check-in and checkout times. Include each local time with AM/PM.");
 const beforeStay=stay.slice(0,stay.search(/\bCheck-in\b/i)).trim();
 // Expedia puts traveler counts before the address, separated by empty table cells.
 // Require a street suffix so an itinerary number or guest count cannot become the address.
 const street=/\b\d+[A-Za-z]?\s+(?:[A-Za-z][A-Za-z.'’-]*\s+){1,6}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Highway|Hwy|Court|Ct|Place|Pl)\b[\s\S]*$/i.exec(beforeStay)?.[0];
 const location=(street||beforeStay).replace(/\s+/g," ").trim();
 const itinerary=/\bExpedia itinerary\s*:\s*([A-Z0-9-]+)/i.exec(beforeStay);
 const propertyName=itinerary?beforeStay.slice(0,itinerary.index).trim().split("\n").at(-1)?.trim()||"":"";
 const title=propertyName||("Hotel stay"+(location?" · "+location:" · "+startDate)).slice(0,300);
 const regionNames=new Intl.DisplayNames(["en"],{type:"region"});
 const countries=[...new Set(airports.map(a=>a.country))].filter(code=>{try{const name=regionNames.of(code);return name&&new RegExp(`\\b${name}\\b`,"i").test(location);}catch{return false;}});
 const zones=[...new Set(airports.filter(a=>countries.includes(a.country)).map(a=>a.zone))];
 const cityZones=[...new Set(airports.filter(a=>countries.includes(a.country)&&a.city&&new RegExp("\\b"+a.city.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(location)).map(a=>a.zone))];
 const zone=cityZones.length===1?cityZones[0]:zones.length===1?zones[0]:"";
 warnings.push(zone?`Time zone inferred from the property address: ${zone}; confirm it.`:"Property time zone could not be determined; enter it before importing.");
 if(!propertyName)warnings.push("Property name is absent. A provisional name uses the address; rename it when known.");
 warnings.push("Cost is absent; add it when known. The cancellation deadline is retained in notes, not used as a payment due date.");
 return [{...blankBooking(tripId),kind:"Hotel",title,location,confirmation:itinerary?.[1]||"",start:startDate+"T"+clock(times[0][0]),end:endDate+"T"+clock(times[1][0]),zone,endZone:zone,notes:"Import review: "+warnings.join(" ")+"\n\n"+text}];
}
function shuttleConfirmation(text:string,tripId:string):Booking[]|null {
 const plain=clean(text);
 if(!/\bshuttle\b/i.test(plain)||!/\bDepart\s*:/i.test(plain))return null;
 const dateTime="(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2}),?\\s+(\\d{4})\\s+(\\d{1,2}:\\d{2}\\s*(?:AM|PM))";
 function endpoint(label:string){
  const matches=[...plain.matchAll(new RegExp("\\b"+label+"\\s*:\\s*"+dateTime,"gi"))];
  if(matches.length!==1)throw new Error(`Include one shuttle ${label.toLowerCase()} date and time, with weekday, month, day, year and AM/PM.`);
  const m=matches[0];
  const date=`${m[4]}-${String(months.indexOf(m[2].slice(0,3).toLowerCase())+1).padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  const parsed=new Date(date+"T00:00:00Z");
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][parsed.getUTCDay()]!==m[1].toLowerCase())throw new Error("Shuttle date and weekday disagree. Check the departure and arrival dates.");
  return {local:date+"T"+clock(m[5]),match:m};
 }
 const departure=endpoint("Depart"),arrival=endpoint("Arrive");
 if(arrival.local<=departure.local)throw new Error("Shuttle arrival must be after departure. Include the arrival date if it ends on another day.");
 const heading=plain.slice(0,departure.match.index).trim();
 const reference=/\(([A-Z0-9-]+)\)\s*$/.exec(heading)?.[1]||"";
 const title=heading.replace(/\s*\([A-Z0-9-]+\)\s*$/,"").trim();
 if(!title)throw new Error("The shuttle reservation name is missing.");
 const afterArrival=plain.slice(arrival.match.index!+arrival.match[0].length);
 const extraReference=afterArrival.split(/\bStarts\b|\bAddress\b/i)[0].trim();
 const references=[reference,/^[A-Z0-9-]{4,30}$/.test(extraReference)?extraReference:""].filter(Boolean);
 const location=/\bAddress\s*:?\s*([\s\S]*?)(?=Get Directions\b|$)/i.exec(plain)?.[1].replace(/\s+/g," ").trim()||"";
 // Only infer a time zone when the address identifies a country with one zone.
 const regions=new Intl.DisplayNames(["en"],{type:"region"});
 const countries=[...new Set(airports.map(a=>a.country))].filter(code=>{try{const name=regions.of(code);return name&&new RegExp(`\\b${name}\\b`,"i").test(location);}catch{return false;}});
 const zones=[...new Set(airports.filter(a=>countries.includes(a.country)).map(a=>a.zone))];
 const zone=zones.length===1?zones[0]:"";
 const starts=/\bStarts\s*:?\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i.exec(plain);
 if(starts&&clock(starts[1])!==departure.local.slice(11))throw new Error("The shuttle Starts time disagrees with its departure time. Review the confirmation.");
 const warnings=[zone?`Time zone inferred from the pickup address: ${zone}; confirm it.`:"Enter the pickup and arrival time zones before importing.","No cost or payment deadline was supplied; add them if known."];
 const booking:Booking={...blankBooking(tripId),kind:"Shuttle",title,confirmation:[...new Set(references)].join(" · "),start:departure.local,end:arrival.local,zone,endZone:zone,location,notes:"Import review: "+warnings.join(" ")+"\n\n"+text};
 return [zone?bookingSchema.parse(booking):booking];
}
function southSeaCruiseConfirmation(text:string,tripId:string):Booking[]|null {
 const plain=clean(text);
 if(!/\bSOUTH SEA CRUISES(?: GROUP)? CONFIRMATION\b/i.test(plain))return null;
 const sections=plain.split(/\bBooking Ref\s*:\s*/i).slice(1);
 if(!sections.length)throw new Error("South Sea Cruises booking reference is missing. Include the Booking Ref and sailing details.");
 const reference=/\bReference\s*:\s*([A-Z0-9-]+)/i.exec(plain)?.[1]||"";
 return sections.map(section=>{
  const bookingReference=/^([A-Z0-9-]+)/i.exec(section)?.[1];
  const schedule=/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i.exec(section);
  const arrival=/\barriving\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i.exec(section);
  if(!bookingReference||!schedule||!arrival)throw new Error("Include each cruise's Booking Ref, departure date and time, and arriving time with AM/PM.");
  const date=`${schedule[3]}-${String(months.indexOf(schedule[2].slice(0,3).toLowerCase())+1).padStart(2,"0")}-${schedule[1].padStart(2,"0")}`;
  const start=date+"T"+clock(schedule[4]);
  const end=date+"T"+clock(arrival[1]);
  if(end<=start)throw new Error("Cruise arrival must be after departure. An overnight sailing needs its arrival date entered manually.");
  const routeAndService=section.slice(schedule.index+schedule[0].length,arrival.index);
  const service=/\bTravelling on South Sea Cruises service\s+([A-Z0-9-]+)/i.exec(routeAndService);
  if(!service)throw new Error("The South Sea Cruises service and route are missing.");
  const route=routeAndService.slice(0,service.index).trim();
  if(!/\s+to\s+/i.test(route))throw new Error("Include the cruise departure and arrival ports.");
  const zone=/\bPort Denarau\b/i.test(route)?"Pacific/Fiji":"";
  const warnings=[zone?"Time zone inferred as Pacific/Fiji from Port Denarau; confirm it.":"Enter the departure and arrival time zones before importing.","Arrival uses the departure date; confirm this is a same-day sailing.","No price or payment amount was supplied; add them if known."];
  const b:Booking={...blankBooking(tripId),kind:"Cruise",title:"South Sea Cruises · "+route,location:route,confirmation:[...new Set([bookingReference,reference].filter(Boolean))].join(" · "),start,end,zone,endZone:zone,notes:"Import review: "+warnings.join(" ")+"\nService: "+service[1]+"\n\n"+text};
  // Validate the dates even when the user still needs to choose time zones.
  bookingSchema.parse({...b,zone:zone||"UTC",endZone:zone||"UTC"});
  return b;
 });
}
export function importConfirmation(text:string,tripId:string,referenceDate=today()):Booking[]{
 const cruise=southSeaCruiseConfirmation(text,tripId);if(cruise)return cruise;
 const shuttle=shuttleConfirmation(text,tripId);if(shuttle)return shuttle;
 const hotelBooking=hotelBookingConfirmation(text,tripId);if(hotelBooking)return hotelBooking;
 const stay=hotelStayConfirmation(text,tripId,referenceDate);if(stay)return stay;
 const hotel=hotelConfirmation(text,tripId);if(hotel)return hotel;
 const delta=deltaConfirmation(text,tripId,referenceDate);if(delta)return delta;
 const plain=clean(text);
 if(!/\bDEPARTS?\b/i.test(plain)||!/\bARRIVES?\b/i.test(plain)){
  return [{...blankBooking(tripId),kind:"Other",title:plain.split("\n")[0]?.slice(0,100)||"Imported reservation",notes:text}];
 }
 const dates=[...plain.matchAll(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/gi)];
 if(dates.length!==2)throw new Error("Could not identify exactly two flight dates. Paste one flight with departure and arrival dates, including the year (for example 23 Dec 2026).");
 // This confirmation layout lists departure first, then arrival. Only accept two standalone airport codes.
 const codes=plain.slice(0,dates[0].index).split(/\s+/).filter(token=>/^[A-Z]{3}$/.test(token)&&airports.some(a=>a.code===token));
 const unique=[...new Set(codes)];
 if(unique.length!==2)throw new Error("Could not identify the departure and arrival airports. Include their three-letter codes and paste one flight at a time.");
 const from=airports.find(a=>a.code===unique[0])!,to=airports.find(a=>a.code===unique[1])!;
 const local=dates.map((m,i)=>{
  const date=`${m[3]}-${String(months.indexOf(m[2].slice(0,3).toLowerCase())+1).padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const end=i===0?dates[1].index:plain.search(/\b(?:Economy Class|Business Class|Operated By|Fare Type|All times)\b/i);
  const following=plain.slice(m.index!+m[0].length,end<0?undefined:end);
  return date+"T"+clock(following);
 });
 const flight=/\b([A-Z0-9]{2})\s*(\d{1,4})\b/.exec(plain.slice(0,dates[0].index));
 const carrier=airlines.find(a=>a.code===flight?.[1]);
 const booking={...blankBooking(tripId),kind:"Flight" as const,fromAirport:airportLabel(from),toAirport:airportLabel(to),
  start:local[0],end:local[1],zone:from.zone,endZone:to.zone,airline:carrier?airlineLabel(carrier):flight?.[1]||"",
  flightNumber:flight?flight[1]+flight[2]:"",confirmation:/Booking Reference\s*:\s*([A-Z0-9-]+)/i.exec(plain)?.[1]||"",notes:text};
 return [bookingSchema.parse({...booking,title:flightReservationName(booking)})];
}
