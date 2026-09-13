import { z } from "zod";

export const uid = () => crypto.randomUUID();
export const today = () => { const d = new Date(); return localDate(d); };
export const localDate = (d: Date) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const n=Date.parse(v+"T00:00:00Z");return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v;},"Invalid calendar date");
const time = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const zone = z.string().refine(v => {try {new Intl.DateTimeFormat("en",{timeZone:v});return true;}catch{return false;}}, "Use an IANA time zone, such as Europe/Rome");
export const kinds = ["Flight","Hotel","Rental car","Shuttle","Cruise","Ferry","Excursion","Other"] as const;
export const reservationNameFields:Record<(typeof kinds)[number],{label:string;placeholder:string}>={
 Flight:{label:"Flight name",placeholder:"Flight SFO → NAN"},
 Hotel:{label:"Hotel / property name",placeholder:"e.g. Coral Coast Resort"},
 "Rental car":{label:"Rental car reservation name",placeholder:"e.g. Hertz · Nadi airport pick-up"},
 Cruise:{label:"Cruise reservation name",placeholder:"e.g. Yasawa Islands cruise"},
 Ferry:{label:"Ferry reservation name",placeholder:"e.g. Port Denarau to Waya Island"},
 Shuttle:{label:"Shuttle reservation name",placeholder:"e.g. Dans Shuttle for SSC AM"},
 Excursion:{label:"Excursion / activity name",placeholder:"e.g. Sunset cruise"},
 Other:{label:"Reservation name",placeholder:"e.g. Airport transfer or dinner reservation"},
};
export const reservationTimeLabels:Record<(typeof kinds)[number],{start:string;end:string}>={
 Flight:{start:"Departure",end:"Arrival"},
 Hotel:{start:"Check-in",end:"Check-out"},
 "Rental car":{start:"Pick-up",end:"Drop-off"},
 Cruise:{start:"Departure",end:"Arrival"},
 Ferry:{start:"Departure",end:"Arrival"},
 Shuttle:{start:"Departure",end:"Arrival"},
 Excursion:{start:"Excursion start",end:"Excursion end"},
 Other:{start:"Start",end:"End"},
};
export function normalizeProviderUrl(value:string):string {
 const trimmed=value.trim();
 if(!trimmed)return "";
 if(trimmed.startsWith("//"))return "https:"+trimmed;
 if(/^[a-z][a-z0-9+.-]*:/i.test(trimmed))return trimmed;
 return "https://"+trimmed;
}
export const paymentSchema = z.object({id:z.string(),amount:z.number().positive().finite(),date,note:z.string()});
export const bookingSchema = z.object({
 id:z.string(),tripId:z.string(),kind:z.enum(kinds),title:z.string().trim().min(1).max(300),start:time,end:time,zone,endZone:zone,
 airline:z.string().max(300).default(""),flightNumber:z.string().max(30).default(""),
 fromAirport:z.string().max(300).default(""),toAirport:z.string().max(300).default(""),
 location:z.string(),confirmation:z.string(),notes:z.string(),url:z.string().transform(normalizeProviderUrl).refine(v=>{if(!v)return true;try{const parsed=new URL(v);return ["https:","http:"].includes(parsed.protocol)&&!!parsed.hostname;}catch{return false;}},"Enter a valid website address"),
 total:z.number().nonnegative().finite(),currency:z.string().regex(/^[A-Z]{3}$/).refine(v=>{try{new Intl.NumberFormat("en",{style:"currency",currency:v});return true;}catch{return false;}}),
 dueDaysBefore:z.number().int().min(0).max(36500).nullable().optional(),
 due:z.union([date,z.literal("")]),payments:z.array(paymentSchema),
}).transform(b=>({...b,due:balanceDueDate(b)})).superRefine((b,c)=>{if(b.dueDaysBefore!=null&&!date.safeParse(b.due).success)c.addIssue({code:"custom",message:"Enter a valid check-in date and whole number of days before it"});try{if(instant(b.end,b.endZone)<instant(b.start,b.zone))c.addIssue({code:"custom",message:"End must be after start"});}catch(e){c.addIssue({code:"custom",message:String(e)});}if(paid(b)>b.total+0.005)c.addIssue({code:"custom",message:"Payments exceed the reservation total"});});
export type Booking=z.infer<typeof bookingSchema>;
// Subtract calendar days from the reservation's local date, independent of DST.
export function balanceDueDate(b:{start:string;due:string;dueDaysBefore?:number|null}):string {
 if(b.dueDaysBefore==null)return b.due;
 const start=b.start.slice(0,10);
 if(!date.safeParse(start).success||!Number.isInteger(b.dueDaysBefore)||b.dueDaysBefore<0||b.dueDaysBefore>36500)return "";
 const day=new Date(start+"T00:00:00Z");
 day.setUTCDate(day.getUTCDate()-b.dueDaysBefore);
 const result=day.toISOString().slice(0,10);
 return date.safeParse(result).success?result:"";
}
export function updateReservationTime(b:Booking,key:"start"|"end",value:string):Booking {
 const next={...b,[key]:value};
 if(key==="start"&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&value.slice(0,10)!==b.start.slice(0,10)){
  next.end=value.slice(0,10)+"T"+(b.end.slice(11)||"10:00");
 }
 return {...next,due:balanceDueDate(next)};
}
export function flightReservationName(b:Pick<Booking,"fromAirport"|"toAirport">):string {
 const short=(value:string)=>/^([A-Z]{3})(?:\s+—|$)/.exec(value.trim())?.[1]||value.trim().slice(0,120);
 const from=short(b.fromAirport),to=short(b.toAirport);
 return from&&to?`Flight ${from} → ${to}`:"";
}
export function prefillFlightName(previous:Booking,next:Booking):Booking {
 if(next.kind!=="Flight"||next.title!==previous.title)return next;
 if(next.title.trim()&&next.title!==flightReservationName(previous))return next;
 return {...next,title:flightReservationName(next)||next.title};
}
export const tripSchema=z.object({id:z.string(),name:z.string().trim().min(1),destination:z.string(),notes:z.string()});
export const artifactSchema=z.object({id:z.string(),tripId:z.string(),bookingId:z.string(),name:z.string(),type:z.string(),data:z.string(),size:z.number().nonnegative(),added:date});
export const vaultSchema=z.object({version:z.literal(1),trips:z.array(tripSchema),bookings:z.array(bookingSchema),artifacts:z.array(artifactSchema),deletedTripIds:z.array(z.string().min(1)).optional()}).superRefine((v,c)=>{
 const ids=[...v.trips,...v.bookings,...v.artifacts].map(x=>x.id);
 if(new Set(ids).size!==ids.length)c.addIssue({code:"custom",message:"Duplicate record IDs"});
 if(v.bookings.some(b=>!v.trips.some(t=>t.id===b.tripId))||v.artifacts.some(a=>!v.trips.some(t=>t.id===a.tripId)||(a.bookingId&&!v.bookings.some(b=>b.id===a.bookingId&&b.tripId===a.tripId))))c.addIssue({code:"custom",message:"Document or reservation references a missing trip"});
});
export type Vault=z.infer<typeof vaultSchema>;
export type Artifact=z.infer<typeof artifactSchema>;
export const emptyVault=():Vault=>({version:1,trips:[],bookings:[],artifacts:[]});
export const paid=(b:{payments:{amount:number}[]})=>Math.round(b.payments.reduce((a,p)=>a+p.amount,0)*100)/100;
export const balance=(b:Booking)=>Math.max(0,Math.round((b.total-paid(b))*100)/100);
export const money=(n:number,c="USD")=>new Intl.NumberFormat("en-US",{style:"currency",currency:c}).format(n);
export function instant(local:string,tz:string):number{
 const target=Date.parse(local+"Z"); if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,16)!==local)throw new Error("Invalid date");
 const fmt=new Intl.DateTimeFormat("sv-SE",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 let value=target;
 for(let i=0;i<4;i++){const parts=Object.fromEntries(fmt.formatToParts(value).map(x=>[x.type,x.value]));const rendered=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);const delta=target-rendered;if(!delta)return value;value+=delta;}
 throw new Error("This local time does not exist because of daylight saving time");
}
export function reservationDuration(b:Pick<Booking,"kind"|"start"|"end"|"zone"|"endZone">):string {
 try {
  const elapsed=instant(b.end,b.endZone)-instant(b.start,b.zone);
  if(elapsed<0)return "Duration unavailable";
  if(b.kind==="Hotel"){
   const nights=Math.round((Date.parse(b.end.slice(0,10)+"T00:00:00Z")-Date.parse(b.start.slice(0,10)+"T00:00:00Z"))/86400000);
   return nights>=0?`${nights} ${nights===1?"night":"nights"}`:"Duration unavailable";
  }
  let minutes=Math.round(elapsed/60000);
  const parts:string[]=[];
  if(b.kind!=="Flight"&&minutes>=1440){
   const days=Math.floor(minutes/1440);
   parts.push(`${days} ${days===1?"day":"days"}`);
   minutes%=1440;
  }
  const hours=Math.floor(minutes/60);
  if(hours)parts.push(`${hours} ${hours===1?"hr":"hrs"}`);
  if(minutes%60||!parts.length)parts.push(`${minutes%60} min`);
  return parts.join(" ");
 }catch{return "Duration unavailable";}
}
// Hotel check-in is an availability time; show that stay after the journey there.
export function itineraryOrder(bookings:Booking[]):Booking[] {
 const orderTime=(b:Booking)=>{
  const start=instant(b.start,b.zone);
  if(b.kind!=="Hotel")return start;
  const arrivals=bookings.filter(other=>other.tripId===b.tripId
   &&(other.kind==="Flight"||other.kind==="Shuttle"||other.kind==="Cruise"||other.kind==="Ferry")
   &&other.endZone===b.zone&&other.end.slice(0,10)===b.start.slice(0,10));
  return arrivals.reduce((time,arrival)=>Math.max(time,instant(arrival.end,arrival.endZone)),start);
 };
 const keyed=bookings.map((booking,index)=>({booking,index,time:orderTime(booking)}));
 return keyed.sort((a,b)=>a.time-b.time
  ||Number(a.booking.kind==="Hotel")-Number(b.booking.kind==="Hotel")
  ||a.index-b.index).map(item=>item.booking);
}
export const stamp=(b:Booking,key:"start"|"end"="start")=>{
 const zone=key==="start"?b.zone:b.endZone;
 const showDate=key==="start"||b.start.slice(0,10)!==b.end.slice(0,10);
 return new Intl.DateTimeFormat("en-US",{...(showDate?{month:"short" as const,day:"numeric" as const}:{}),...(b.start.slice(0,4)!==b.end.slice(0,4)?{year:"numeric" as const}:{}),hour:"numeric",minute:"2-digit",timeZone:zone}).format(instant(b[key],zone));
};
export function blankBooking(tripId:string):Booking {return {id:uid(),tripId,kind:"Flight",title:"",airline:"",flightNumber:"",fromAirport:"",toAirport:"",start:today()+"T09:00",end:today()+"T10:00",zone:Intl.DateTimeFormat().resolvedOptions().timeZone,endZone:Intl.DateTimeFormat().resolvedOptions().timeZone,location:"",confirmation:"",notes:"",url:"",total:0,currency:"USD",due:"",payments:[]};}
export const bookingLocation=(b:Booking)=>b.kind==="Flight"&&(b.fromAirport||b.toAirport)?[b.fromAirport||"Departure not set",b.toAirport||"Arrival not set"].join(" → "):b.location;
const esc=(s:string)=>s.replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
const utc=(n:number)=>new Date(n).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
export function calendarExport(bookings:Booking[]):string{
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//My Travel Bot//Travel//EN","CALSCALE:GREGORIAN"];
 for(const b of bookings){
  lines.push("BEGIN:VEVENT","UID:"+b.id+"@mytravelbot","DTSTAMP:"+utc(Date.now()),"DTSTART:"+utc(instant(b.start,b.zone)),"DTEND:"+utc(instant(b.end,b.endZone)),"SUMMARY:"+esc(b.title),"LOCATION:"+esc(bookingLocation(b)),"DESCRIPTION:"+esc([b.kind,b.airline,b.flightNumber].filter(Boolean).join(" • ")+" • "+b.zone+"\n"+b.notes),"BEGIN:VALARM","TRIGGER:-PT2H","ACTION:DISPLAY","DESCRIPTION:Travel reservation","END:VALARM","END:VEVENT");
  if(b.due&&balance(b)>0)lines.push("BEGIN:VEVENT","UID:"+b.id+"-payment@mytravelbot","DTSTAMP:"+utc(Date.now()),"DTSTART;VALUE=DATE:"+b.due.replace(/-/g,""),"SUMMARY:"+esc("Payment due: "+b.title+" "+money(balance(b),b.currency)),"BEGIN:VALARM","TRIGGER:-P1D","ACTION:DISPLAY","DESCRIPTION:Travel payment due","END:VALARM","END:VEVENT");
 }
 lines.push("END:VCALENDAR");
 // Fold by UTF-8 octets, preserving Unicode code points (RFC 5545).
 return lines.map(line=>{let out="",chunk="";for(const ch of line){if(new TextEncoder().encode(chunk+ch).length>73){out+=chunk+"\r\n ";chunk="";}chunk+=ch;}return out+chunk;}).join("\r\n")+"\r\n";
}
export function csvRows(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],v="",quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){v+='"';i++;}else quoted=!quoted;}else if(ch===","&&!quoted){row.push(v);v="";}else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(v);if(row.some(Boolean))rows.push(row);row=[];v="";}else v+=ch;}
 if(quoted)throw new Error("CSV has an unclosed quotation mark");row.push(v);if(row.some(Boolean))rows.push(row);return rows;
}
export function importBookings(text:string,tripId:string):Booking[]{
 const rows=csvRows(text.trim());const header=rows.shift()?.map(x=>x.trim().replace(/^\uFEFF/,""))??[];
 if(!["title","start","end","zone"].every(x=>header.includes(x)))throw new Error("CSV requires title, start, end, zone columns");
 return rows.map((r,i)=>{const f=Object.fromEntries(header.map((k,j)=>[k,r[j]??""]));return bookingSchema.parse({...blankBooking(tripId),...f,id:uid(),tripId,endZone:f.endZone||f.zone,total:Number(f.total||0),payments:[]});});
}
export function importCalendar(text:string,tripId:string):Booking[]{
 const unfolded=text.replace(/\r?\n[ \t]/g,"");const blocks=unfolded.split("BEGIN:VEVENT").slice(1);
 if(!blocks.length)throw new Error("No calendar events found");
 return blocks.map(block=>{
 const lines=block.split(/\r?\n/);if(lines.some(l=>/^RRULE|^RECURRENCE-ID/.test(l)))throw new Error("Recurring calendar events need manual review; import individual appointments.");
 const get=(key:string)=>lines.find(l=>l.startsWith(key+":")||l.startsWith(key+";"))??"";
 const value=(line:string)=>line.slice(line.indexOf(":")+1).replace(/\\n/gi,"\n").replace(/\\([,;\\])/g,"$1");
 const dt=(key:string)=>{const l=get(key);const v=value(l);const m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z)?)?$/.exec(v);if(!m)throw new Error("Unsupported calendar date");return {local:m[1]+"-"+m[2]+"-"+m[3]+"T"+(m[4]||"09")+":"+(m[5]||"00"),zone:m[6]?"UTC":(/TZID=([^:;]+)/.exec(l)?.[1]||Intl.DateTimeFormat().resolvedOptions().timeZone)};};
 const s=dt("DTSTART"),e=get("DTEND")?dt("DTEND"):s;
 return bookingSchema.parse({...blankBooking(tripId),kind:"Other",title:value(get("SUMMARY"))||"Imported appointment",start:s.local,end:e.local,zone:s.zone,endZone:e.zone,notes:value(get("DESCRIPTION")),location:value(get("LOCATION"))});
 });
}
