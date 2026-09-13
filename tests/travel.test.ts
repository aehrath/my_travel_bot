import {test} from "node:test";
import assert from "node:assert/strict";
import {itineraryOrder,reservationDuration,balanceDueDate,updateReservationTime,bookingSchema,blankBooking,emptyVault,balance,paid,instant,calendarExport,importBookings,importCalendar,vaultSchema} from "../lib/travel";
import {derive,encrypt,decrypt} from "../lib/vault";
import { searchAirports, airportLabel } from "../lib/airports";
import { importConfirmation } from "../lib/confirmation-import";
const expediaStay=`| |\n| :-: |\n[Queens Highway, Nadi Fiji](https://example.com/address)\n## Check-in\n| |\n| - |\n## Check-out\n**Wed, Dec 30**\n| |\n| - |\n**Thu, Dec 31**\n**Check-in time starts at 2:00pm**\n**10:00am**\nFree cancellation until Dec 23 at 3:00pm (property local time)\nDate changes not available.`;
test("hotel stay layout uses property timezone and excludes cancellation from stay dates",()=>{
 for(const text of [expediaStay,expediaStay.replace(/\|[^\n]*|##|\*\*/g,'').replace(/\s+/g,' ')]){
  const [b]=importConfirmation(text,'t','2026-09-11');
  assert.equal(b.start,'2026-12-30T14:00');assert.equal(b.end,'2026-12-31T10:00');
  assert.equal(b.zone,'Pacific/Fiji');assert.equal(b.endZone,'Pacific/Fiji');assert.equal(b.due,'');
  assert.equal(b.location,'Queens Highway, Nadi Fiji');assert.equal(b.title,'Hotel stay · Queens Highway, Nadi Fiji');assert.equal(b.payments.length,0);assert.doesNotThrow(()=>bookingSchema.parse(b));
  assert.match(b.notes,/confirm the omitted year/);assert.ok(b.notes.includes('Dec 23 at 3:00pm'));
  assert.match(calendarExport([{...b,title:'Hotel'}]),/DTSTART:20261230T020000Z/);
  assert.match(calendarExport([{...b,title:'Hotel'}]),/DTEND:20261230T220000Z/);
 }
});
test("yearless hotel dates reject mismatched weekdays and handle December to January",()=>{
 assert.throws(()=>importConfirmation(expediaStay.replace('Wed, Dec 30','Tue, Dec 30'),'t','2026-09-11'));
 const [b]=importConfirmation(expediaStay.replace('Thu, Dec 31','Fri, Jan 1').replace('Wed, Dec 30','Thu, Dec 31'),'t','2026-09-11');
 assert.equal(b.start,'2026-12-31T14:00');assert.equal(b.end,'2027-01-01T10:00');
});
const hotelConfirmation=`| Booking Confirmation - Octopus Resort - Fiji | Office in USA |
| Reference: | 29623 |
| Property: | Octopus Resort - Fiji<br>Liku Liku Bay, Waya Islands, Yasawa Islands, 1 |
| Customer Name: | Example Guest |
| Customer Address: | California, USA |
| Arrival Date: | Friday, 25 December 2026 | Status: Confirmed |
| Departure Date: | Wednesday, 30 December 2026 |
| Stay Period: | 5 Nights |
| Reservation Details | All amounts are US Dollar (USD) |
| Accommodation | $393.00 x 5 Nights | $1,965.00 |
| Total Cost: | $4,044.00 |
| Payments/Invoiced: | $404.40 |
| Balance Required: | USD 3,639.60 |`;
test("hotel confirmation extracts property dates and accounting without inventing payment dates",()=>{
 for(const text of [hotelConfirmation,hotelConfirmation.replace(/\|/g,'\t').replace(/<br>/g,'\n'),hotelConfirmation.replace(/\||<br>/g,' ').replace(/\s+/g,' ')]){
  const [b]=importConfirmation(text,'t');
  assert.equal(b.kind,'Hotel');assert.equal(b.title,'Octopus Resort - Fiji');assert.equal(b.confirmation,'29623');
  assert.equal(b.start,'2026-12-25T15:00');assert.equal(b.end,'2026-12-30T11:00');
  assert.equal(b.zone,'Pacific/Fiji');assert.equal(b.currency,'USD');assert.equal(b.total,4044);
  assert.equal(b.payments[0].amount,404.4);assert.equal(b.payments[0].date,'');assert.equal(balance(b),3639.6);
  assert.match(b.notes,/placeholders/);assert.match(b.notes,/actually paid/);assert.throws(()=>bookingSchema.parse(b));
  assert.doesNotThrow(()=>bookingSchema.parse({...b,payments:[{...b.payments[0],date:'2026-09-01'}]}));
 }
 assert.throws(()=>importConfirmation(hotelConfirmation.replace('5 Nights','6 Nights'),'t'));
 assert.throws(()=>importConfirmation(hotelConfirmation.replace('3,639.60','3,600.00'),'t'));
});
const fijiConfirmation=`|   |
| - |
## FLIGHT DETAILS
| Booking Reference: DMMR6B |
| :------------------------ |
| **DEPARTS** | **FJ 811**<br> | **ARRIVES** |
| ----------- | -------------- | ----------- |
| **LAX** | | |
| | **NAN** |
| FIJI AIRWAYS | |
Wed 23 Dec 2026
**10:35PM**
**(22:35)**
Los Angeles\\
Fri 25 Dec 2026
**6:00AM**
**(06:00)**
Nadi\\
| **Economy Class:** | Confirmed |
| **Operated By:** | FIJI AIRWAYS (FJ) |
| **Fare Type:** | VALUE ([Fare rules](https://example.com/rules)) |
| **Fare Baggage:** | 1 Checked bag at 30kg pce per person (2+ yrs) |
| **All times are local** |`;
const deltaConfirmation=`| **FLIGHT** | **SEAT** |
| -------- | -------- |
| DELTA 92 | 40G |
| <br>Visit [delta.com](https://example.com/delta) to change your seat.<br><br> | |
| **Fri, 15JAN** | **DEPART** | **ARRIVE** |
| -------- | -------- | -------- |
| DELTA 92<br>Delta Main Classic (V)<br> | BRISBANE, AU<br>10:40AM | LOS ANGELES<br>06:05AM |`;
test("Delta table infers 2027 and keeps earlier local arrival on the same date",()=>{
 const [b]=importConfirmation(deltaConfirmation,"t","2026-09-11");
 assert.equal(b.start,"2027-01-15T10:40");assert.equal(b.end,"2027-01-15T06:05");
 assert.equal(b.zone,"Australia/Brisbane");assert.equal(b.endZone,"America/Los_Angeles");
 assert.equal(b.flightNumber,"DL92");assert.equal(b.airline,"Delta Air Lines (DL)");
 assert.equal(b.title,"Flight BNE → LAX");assert.match(b.notes,/Year inferred as 2027/);
 assert.ok(b.notes.includes(deltaConfirmation));assert.equal(instant(b.end,b.endZone)-instant(b.start,b.zone),805*60000);
});
test("Delta table respects explicit years and rejects conflicting weekdays or ambiguous cities",()=>{
 const [b]=importConfirmation(deltaConfirmation.replace('15JAN','15JAN 2027'),"t","2028-01-01");
 assert.equal(b.start,"2027-01-15T10:40");assert.doesNotMatch(b.notes,/Year inferred/);
 assert.throws(()=>importConfirmation(deltaConfirmation.replace('Fri,','Thu,'),"t","2026-09-11"));
 assert.throws(()=>importConfirmation(deltaConfirmation.replace('BRISBANE, AU','UNKNOWN CITY'),"t","2026-09-11"));
});
test("Delta clipboard imports work with newlines, tabs, or fully flattened plain text",()=>{
 const plain=`FLIGHT\tSEAT\nDELTA 92\t40G\nVisit delta.com or download the Fly Delta app.\nFri, 15JAN\tDEPART\tARRIVE\nDELTA 92\nDelta Main Classic (V)\tBRISBANE, AU\n10:40AM\tLOS ANGELES\n06:05AM`;
 for(const text of [plain,plain.replace(/\t/g,"\n"),plain.replace(/\s+/g," "),plain.replace(/\s+/g,"\u00a0")]){
  const [b]=importConfirmation(text,"t","2026-09-11");
  assert.equal(b.flightNumber,"DL92");assert.equal(b.start,"2027-01-15T10:40");
  assert.equal(b.end,"2027-01-15T06:05");assert.equal(b.title,"Flight BNE → LAX");
  assert.ok(b.notes.includes(text));
 }
 const columns="Fri, 15JAN DEPART ARRIVE DELTA 92 Delta Main Classic (V) BRISBANE, AU LOS ANGELES 10:40AM 06:05AM";
 assert.equal(importConfirmation(columns,"t","2026-09-11")[0].end,"2027-01-15T06:05");
 assert.throws(()=>importConfirmation(plain.replace('06:05AM',''),"t","2026-09-11"));
});
test("pasted Fiji Markdown confirmation preserves separate departure and arrival dates",()=>{
 const [b]=importConfirmation(fijiConfirmation,"trip-1");
 assert.equal(b.start,"2026-12-23T22:35");assert.equal(b.end,"2026-12-25T06:00");
 assert.equal(b.zone,"America/Los_Angeles");assert.equal(b.endZone,"Pacific/Fiji");
 assert.equal(b.title,"Flight LAX → NAN");assert.equal(b.flightNumber,"FJ811");
 assert.equal(b.airline,"Fiji Airways (FJ)");assert.equal(b.confirmation,"DMMR6B");
 assert.equal(b.notes,fijiConfirmation);assert.equal(instant(b.end,b.endZone)-instant(b.start,b.zone),685*60000);
});
test("flight text import handles single clock formats and refuses ambiguous or missing dates",()=>{
 assert.equal(importConfirmation(fijiConfirmation.replace('**(22:35)**','').replace('**(06:00)**',''),"t")[0].end,"2026-12-25T06:00");
 assert.throws(()=>importConfirmation(fijiConfirmation.replace('25 Dec 2026',''),"t"));
 assert.throws(()=>importConfirmation(fijiConfirmation.replace('(22:35)','(21:35)'),"t"));
 assert.throws(()=>importConfirmation(fijiConfirmation.replace('25 Dec 2026','32 Dec 2026'),"t"));
 assert.throws(()=>importConfirmation(fijiConfirmation+'\n26 Dec 2026',"t"));
});
import { searchAirlines } from "../lib/airlines";
import { parseFlights, localFlightTime, dateInZone } from "../lib/flights";
test("airlines match names and codes and old bookings default new fields",()=>{
 assert.equal(searchAirlines("Fiji")[0].code,"FJ");assert.equal(searchAirlines("UA")[0].name,"United Airlines");
 const old={...blankBooking("trip"),title:"Legacy"} as Record<string,unknown>;delete old.airline;delete old.flightNumber;
 assert.equal(bookingSchema.parse(old).airline,"");assert.equal(bookingSchema.parse(old).flightNumber,"");
 const flight=bookingSchema.parse({...old,airline:"Fiji Airways (FJ)",flightNumber:"FJ811"});
 assert.match(calendarExport([flight]),/FJ811/);
});
test("flight timestamps preserve offsets and the international date line",()=>{
 assert.equal(localFlightTime("2026-09-11T23:00:00-07:00","America/Los_Angeles"),"2026-09-11T23:00");
 assert.equal(localFlightTime("2026-09-12T17:00:00Z","Pacific/Fiji"),"2026-09-13T05:00");
 assert.equal(dateInZone("Pacific/Fiji",new Date("2026-09-12T17:00:00Z")),"2026-09-13");
 assert.throws(()=>localFlightTime("2026-09-11T23:00:00","Pacific/Fiji"));
});
test("flight lookup rejects other routes, wrong dates, missing data and deduplicates fares",()=>{
 const row={departure:{iata:"LAX",timezone:"America/Los_Angeles",scheduled:"2026-09-11T23:00:00-07:00"},arrival:{iata:"NAN",timezone:"Pacific/Fiji",scheduled:"2026-09-12T17:00:00Z"},airline:{name:"Fiji Airways",iata:"FJ"},flight:{iata:"FJ811",number:"811"},flight_status:"scheduled"};
 const rows=parseFlights({data:[row,row,{...row,departure:{...row.departure,iata:"SFO"}},{...row,arrival:{...row.arrival,scheduled:null}},{}]},"LAX","NAN","2026-09-11");
 assert.equal(rows.length,1);assert.equal(rows[0].end,"2026-09-13T05:00");assert.equal(rows[0].flightNumber,"FJ811");
 assert.deepEqual(parseFlights({data:[row]},"LAX","NAN","2026-09-12"),[]);
});
test("airport search resolves country names and combined country/city queries",()=>{
 assert.equal(searchAirports("Fiji")[0].code,"NAN");
 assert.ok(searchAirports("Fiji").every(a=>a.country==="FJ"));
 assert.ok(searchAirports("New Zealand Auckland").some(a=>a.code==="AKL"));
 assert.ok(searchAirports("Japan Tokyo").some(a=>a.code==="HND"));
 assert.ok(searchAirports("UK Heathrow").some(a=>a.code==="LHR"));
 assert.ok(searchAirports("United States San Francisco").some(a=>a.code==="SFO"));
});
const booking=()=>({...blankBooking("trip-1"),title:"Rome hotel",kind:"Hotel" as const,start:"2026-10-10T15:00",end:"2026-10-12T11:00",zone:"Europe/Rome",endZone:"Europe/Rome",total:1200,currency:"EUR",due:"2026-10-01"});
test("airport autocomplete searches codes, names, cities, and accents",()=>{assert.equal(searchAirports("sfo")[0].code,"SFO");assert.equal(searchAirports("KSFO")[0].code,"SFO");assert.ok(searchAirports("San Francisco").some(a=>a.code==="SFO"));assert.ok(searchAirports("Heathrow").some(a=>a.code==="LHR"));assert.ok(searchAirports("São Paulo").length>0);const airport=searchAirports("SFO")[0];assert.equal(searchAirports(airportLabel(airport))[0].code,"SFO");assert.equal(airport.zone,"America/Los_Angeles");assert.deepEqual(searchAirports("zzzz-no-airport"),[]);});
test("airport fields survive validation and legacy reservations stay compatible",()=>{const old={...booking()} as Record<string,unknown>;delete old.fromAirport;delete old.toAirport;assert.equal(bookingSchema.parse(old).fromAirport,"");const flight=bookingSchema.parse({...booking(),kind:"Flight",fromAirport:"SFO",toAirport:"FCO"});assert.equal(flight.fromAirport,"SFO");assert.match(calendarExport([flight]),/LOCATION:SFO → FCO/);});
test("partial payments keep exact remaining balance and reject overpayment",()=>{const b={...booking(),payments:[{id:"p1",amount:400.10,date:"2026-09-10",note:"Deposit"}]};assert.equal(paid(b),400.10);assert.equal(balance(b),799.90);assert.throws(()=>bookingSchema.parse({...b,total:300}));});
test("flight arrival in another timezone compares actual instants",()=>{const b={...booking(),start:"2026-10-10T18:00",zone:"America/Los_Angeles",end:"2026-10-11T14:00",endZone:"Europe/Rome"};assert.equal(instant(b.end,b.endZone)-instant(b.start,b.zone),11*3600000);assert.doesNotThrow(()=>bookingSchema.parse(b));});
test("DST gaps and reversed intervals fail",()=>{assert.throws(()=>instant("2026-03-08T02:30","America/Los_Angeles"));assert.throws(()=>bookingSchema.parse({...booking(),end:"2026-10-09T10:00"}));});
test("calendar exports UTC bookings and only outstanding payment reminders",()=>{const b=booking(),ics=calendarExport([b]);assert.match(ics,/DTSTART:20261010T130000Z/);assert.match(ics,/DTSTART;VALUE=DATE:20261001/);assert.match(ics,/TRIGGER:-PT2H/);assert.doesNotMatch(calendarExport([{...b,payments:[{id:"p",amount:1200,date:"2026-09-10",note:"Paid"}]}]),/Payment due:/);});
test("CSV handles quoted commas, multiline notes, and invalid dates",()=>{const rows=importBookings('title,start,end,zone,total,notes\n"Hotel, Rome",2026-10-10T15:00,2026-10-12T11:00,Europe/Rome,1200,"Line one\nLine two"',"trip-1");assert.equal(rows[0].title,"Hotel, Rome");assert.equal(rows[0].notes,"Line one\nLine two");assert.throws(()=>importBookings("title,start,end,zone\nBad,nope,nope,UTC","trip-1"));});
test("ICS imports UTC appointments and rejects silently truncated recurrences",()=>{const ics="BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261010T100000Z\nDTEND:20261010T110000Z\nSUMMARY:Tour\nEND:VEVENT\nEND:VCALENDAR";assert.equal(importCalendar(ics,"trip-1")[0].zone,"UTC");assert.throws(()=>importCalendar(ics.replace("SUMMARY","RRULE:FREQ=DAILY\nSUMMARY"),"trip-1"));});
test("backup validation rejects orphaned artifacts",()=>{assert.throws(()=>vaultSchema.parse({...emptyVault(),bookings:[booking()]}));});
test("AES-GCM round trip, randomized IV, wrong passphrase and tamper detection",async()=>{const v={...emptyVault(),trips:[{id:"trip-1",name:"Italy",destination:"Rome",notes:""}],bookings:[booking()],artifacts:[{id:"a1",tripId:"trip-1",bookingId:"",name:"ticket.txt",type:"text/plain",data:"data:text/plain;base64,aGk=",size:2,added:"2026-09-10"}]};const ring=await derive("a-long-test-passphrase");const e=await encrypt(v,ring),e2=await encrypt(v,ring);assert.notEqual(e.iv,e2.iv);assert.deepEqual((await decrypt(e,"a-long-test-passphrase")).vault,v);assert.ok(!JSON.stringify(e).includes("Rome"));await assert.rejects(()=>decrypt(e,"a-wrong-test-passphrase"));await assert.rejects(()=>decrypt({...e,ciphertext:(e.ciphertext[0]==="A"?"B":"A")+e.ciphertext.slice(1)},"a-long-test-passphrase"));});


test("relative balance deadlines use local calendar days and follow check-in changes",()=>{
 const stay={...blankBooking("t"),kind:"Hotel" as const,title:"Stay",start:"2028-03-01T15:00",end:"2028-03-05T11:00",zone:"America/Los_Angeles",endZone:"America/Los_Angeles",total:500,due:"",dueDaysBefore:1};
 const parsed=bookingSchema.parse(stay);
 assert.equal(parsed.due,"2028-02-29");
 assert.equal(balanceDueDate({...stay,start:"2026-01-05T15:00",dueDaysBefore:10}),"2025-12-26");
 assert.equal(balanceDueDate({...stay,start:"2026-03-09T15:00",dueDaysBefore:1}),"2026-03-08");
 assert.equal(balanceDueDate({...stay,dueDaysBefore:0}),"2028-03-01");
 const movedDraft=updateReservationTime(parsed,"start","2028-04-05T15:00");
 const moved=bookingSchema.parse({...movedDraft,end:"2028-04-09T11:00"});
 assert.equal(moved.due,"2028-04-04");
 assert.match(calendarExport([moved]),/DTSTART;VALUE=DATE:20280404/);
 const fixed=bookingSchema.parse({...moved,dueDaysBefore:null,due:"2028-01-10"});
 assert.equal(updateReservationTime(fixed,"start","2028-05-01T15:00").due,"2028-01-10");
 for(const invalid of [-1,1.5,NaN,Infinity,36501])assert.equal(bookingSchema.safeParse({...stay,dueDaysBefore:invalid}).success,false);
 const legacy={...parsed};delete legacy.dueDaysBefore;
 assert.equal(bookingSchema.parse(legacy).due,"2028-02-29");
});

test("relative balance deadlines survive encrypted backup restore",async()=>{
 const b=bookingSchema.parse({...blankBooking("t"),title:"Hotel",kind:"Hotel",start:"2026-12-25T15:00",end:"2026-12-30T11:00",dueDaysBefore:30});
 const vault={...emptyVault(),trips:[{id:"t",name:"Trip",destination:"",notes:""}],bookings:[b]};
 const ring=await derive("relative deadline test password");
 const restored=await decrypt(await encrypt(vault,ring),"relative deadline test password");
 assert.equal(restored.vault.bookings[0].dueDaysBefore,30);
 assert.equal(restored.vault.bookings[0].due,"2026-11-25");
});


test("provider URLs fill in HTTPS and reject invalid or unsafe links",()=>{
 const b={...blankBooking("t"),title:"Hotel"};
 for(const url of ["octopusresortfiji.com","  octopusresortfiji.com  ","//octopusresortfiji.com"]){
  assert.equal(bookingSchema.parse({...b,url}).url,"https://octopusresortfiji.com");
 }
 assert.equal(bookingSchema.parse({...b,url:"example.com/stay?room=2#details"}).url,"https://example.com/stay?room=2#details");
 assert.equal(bookingSchema.parse({...b,url:"http://example.com"}).url,"http://example.com");
 assert.equal(bookingSchema.parse({...b,url:""}).url,"");
 for(const url of ["javascript:alert(1)","data:text/html,test","not a website","https://"]){
  assert.equal(bookingSchema.safeParse({...b,url}).success,false);
 }
});


test("flight duration uses elapsed time across time zones and the date line",()=>{
 const b={...blankBooking("t"),start:"2026-12-25T22:30",end:"2026-12-27T05:00",zone:"America/Los_Angeles",endZone:"Pacific/Fiji"};
 assert.equal(reservationDuration(b),"10 hrs 30 min");
 assert.equal(reservationDuration({...b,start:"2026-12-27T21:40",end:"2026-12-27T12:30",zone:"Pacific/Fiji",endZone:"America/Los_Angeles"}),"10 hrs 50 min");
 assert.equal(reservationDuration({...b,start:"2026-12-25T09:00",end:"2026-12-26T11:00",zone:"UTC",endZone:"UTC"}),"26 hrs");
});
test("hotel nights count local dates rather than hours or DST offsets",()=>{
 const b={...blankBooking("t"),kind:"Hotel" as const,start:"2026-03-07T15:00",end:"2026-03-09T11:00",zone:"America/Los_Angeles",endZone:"America/Los_Angeles"};
 assert.equal(reservationDuration(b),"2 nights");
 assert.equal(reservationDuration({...b,end:"2026-03-08T11:00"}),"1 night");
 assert.equal(reservationDuration({...b,end:"2026-03-07T18:00"}),"0 nights");
});
test("other reservations show days, hours and minutes as appropriate",()=>{
 const b={...blankBooking("t"),kind:"Rental car" as const,start:"2026-12-25T09:00",end:"2026-12-27T11:30",zone:"UTC",endZone:"UTC"};
 assert.equal(reservationDuration(b),"2 days 2 hrs 30 min");
 assert.equal(reservationDuration({...b,kind:"Excursion",end:"2026-12-25T10:00"}),"1 hr");
 assert.equal(reservationDuration({...b,kind:"Other",end:"2026-12-25T09:45"}),"45 min");
 assert.equal(reservationDuration({...b,end:b.start}),"0 min");
 assert.equal(reservationDuration({...b,end:"2026-12-24T09:00"}),"Duration unavailable");
 assert.equal(reservationDuration({...b,end:""}),"Duration unavailable");
});

const shuttleConfirmation=`|    |
| :- |

## **Dans Shuttle for SSC AM** (PHLCZ0)

### **Depart: Friday, December 25, 2026 7:15 AM Arrive: Friday, December 25, 2026 8:15 AM**

|     |
| :-: |

**RYB4ADN**

| Starts |
| :----- |

## **7:15 AM**

Friday, December 25, 2026

| Address |
| :------ |

### **Naisoso Marina , Nadi BA 00000 Fiji**

[Get Directions](http://p5fzdfgw.r.us-west-2.awstrack.me/L0/http:%2F%2Fmaps.google.com%2Fmaps%3Fsaddr=Current%2BLocation%26daddr=-17.745438,177.4331122%26z=15%26t=m/1/010101a030392149-e7458e18-c634-416e-ba12-aef0d20516de-000000/iZvfxDxhnG8XlZtJc0e6AH6Q0j4=474)`;
test("shuttle confirmation preserves schedule, pickup and both booking references",()=>{
 for(const text of [shuttleConfirmation,shuttleConfirmation.split("\n").filter(line=>!/^\s*\|[\s:|-]*$/.test(line)).join("\n").replace(/[*#|]/g," ").replace(/\s+/g," ")]){
  const [b]=importConfirmation(text,"t");
  assert.equal(b.kind,"Shuttle");assert.equal(b.title,"Dans Shuttle for SSC AM");
  assert.equal(b.start,"2026-12-25T07:15");assert.equal(b.end,"2026-12-25T08:15");
  assert.equal(b.zone,"Pacific/Fiji");assert.equal(b.endZone,"Pacific/Fiji");
  assert.equal(b.confirmation,"PHLCZ0 · RYB4ADN");
  assert.equal(b.location,"Naisoso Marina , Nadi BA 00000 Fiji");
  assert.equal(b.due,"");assert.equal(b.total,0);assert.deepEqual(b.payments,[]);assert.equal(b.url,"");
  assert.equal(reservationDuration(b),"1 hr");
  assert.ok(b.notes.endsWith(text));assert.match(b.notes,/Time zone inferred/);
  assert.doesNotThrow(()=>bookingSchema.parse(b));
 }
});
test("shuttle confirmation rejects incomplete and contradictory dates and times",()=>{
 assert.throws(()=>importConfirmation(shuttleConfirmation.replace("Arrive:","Ends:"),"t"));
 assert.throws(()=>importConfirmation(shuttleConfirmation.replace("Depart: Friday","Depart: Thursday"),"t"));
 assert.throws(()=>importConfirmation(shuttleConfirmation.replace("8:15 AM","6:15 AM"),"t"));
 assert.throws(()=>importConfirmation(shuttleConfirmation.replace("## **7:15 AM**","## **7:30 AM**"),"t"));
 const [overnight]=importConfirmation(shuttleConfirmation.replace("Arrive: Friday, December 25","Arrive: Saturday, December 26"),"t");
 assert.equal(overnight.end,"2026-12-26T08:15");
 const [unknown]=importConfirmation(shuttleConfirmation.replace("Naisoso Marina , Nadi BA 00000 Fiji","Unknown Marina"),"t");
 assert.equal(unknown.zone,"");assert.match(unknown.notes,/Enter the pickup and arrival time zones/);
 assert.equal(bookingSchema.safeParse(unknown).success,false);
});


test("shuttle time zone survives rich text that joins the address to the directions label",()=>{
 const pasted=shuttleConfirmation.replace("### **Naisoso Marina , Nadi BA 00000 Fiji**\n\n[Get Directions]", "Naisoso Marina , Nadi BA 00000 FijiGet Directions");
 const [b]=importConfirmation(pasted,"t");
 assert.equal(b.location,"Naisoso Marina , Nadi BA 00000 Fiji");
 assert.equal(b.zone,"Pacific/Fiji");assert.equal(b.endZone,"Pacific/Fiji");
});


test("Shuttle is supported in CSV imports and encrypted vault validation",()=>{
 const [b]=importBookings("title,kind,start,end,zone\nMarina shuttle,Shuttle,2026-12-25T07:15,2026-12-25T08:15,Pacific/Fiji","t");
 assert.equal(b.kind,"Shuttle");assert.equal(reservationDuration(b),"1 hr");
 const vault={...emptyVault(),trips:[{id:"t",name:"Fiji",destination:"",notes:""}],bookings:[b]};
 assert.equal(vaultSchema.parse(vault).bookings[0].kind,"Shuttle");
 assert.match(calendarExport([b]),/Shuttle/);
});


test("itinerary places hotel availability after same-day transport arrival",()=>{
 const base={...blankBooking("fiji"),zone:"Pacific/Fiji",endZone:"Pacific/Fiji"};
 const hotel={...base,id:"hotel",kind:"Hotel" as const,title:"Hotel",start:"2026-12-30T14:00",end:"2026-12-31T10:00"};
 const shuttle={...base,id:"shuttle",kind:"Shuttle" as const,title:"Shuttle",start:"2026-12-30T17:30",end:"2026-12-30T18:30"};
 const flight={...base,id:"flight",kind:"Flight" as const,title:"Flight",start:"2026-12-30T15:00",end:"2026-12-30T17:00"};
 const source=[hotel,shuttle,flight];
 assert.deepEqual(itineraryOrder(source).map(b=>b.id),["flight","shuttle","hotel"]);
 assert.equal(hotel.start,"2026-12-30T14:00");
 assert.deepEqual(source.map(b=>b.id),["hotel","shuttle","flight"]);
 for(const unrelated of [{...shuttle,tripId:"other"},{...shuttle,endZone:"Pacific/Auckland"},{...shuttle,start:"2026-12-31T17:30",end:"2026-12-31T18:30"},{...shuttle,kind:"Excursion" as const}]){
  assert.deepEqual(itineraryOrder([hotel,unrelated]).map(b=>b.id),["hotel","shuttle"]);
 }
 const early={...shuttle,start:"2026-12-30T09:00",end:"2026-12-30T10:00"};
 assert.deepEqual(itineraryOrder([hotel,early]).map(b=>b.id),["shuttle","hotel"]);
});


test("cruises and ferries support imports, duration, backups and arrival ordering",()=>{
 for(const kind of ["Cruise","Ferry"] as const){
  const [b]=importBookings(`title,kind,start,end,zone\nIsland sailing,${kind},2026-12-25T09:00,2026-12-27T17:30,Pacific/Fiji`,"t");
  assert.equal(b.kind,kind);assert.equal(reservationDuration(b),"2 days 8 hrs 30 min");
  const hotel={...b,id:"hotel",kind:"Hotel" as const,start:"2026-12-27T14:00",end:"2026-12-28T10:00"};
  const vault={...emptyVault(),trips:[{id:"t",name:"Fiji",destination:"",notes:""}],bookings:[hotel,b]};
  assert.equal(vaultSchema.parse(vault).bookings[1].kind,kind);
  assert.deepEqual(itineraryOrder(vault.bookings).map(x=>x.kind),[kind,"Hotel"]);
  assert.ok(calendarExport([b]).includes(kind));
 }
});

const southSeaConfirmation=`SOUTH SEA CRUISES GROUP CONFIRMATION
Bula Vinaka (Welcome & Thank You) for booking with South Sea Cruises, please find below your
booking summary and confirmation. We do recommend you take the time to ensure all the information
regarding your booking is correct. Vinaka, we look forward to seeing you / your client soon.
Details:
Reference: 1827479
Date of Reservation: 24 Aug 2026
Name: Example Traveler
Example Guest1
Example Guest2
Contact Details: example@example.com
Booking Details: Payment
Wed 30 Dec 2026
Confirmed

Booking Ref: 3149207

Octopus Resort to Port Denarau
3 Adults
30 Dec 2026
03:45pm

Octopus Resort (SOUTH) to Port Denarau
Travelling on South Sea Cruises service ROUTE7
(arriving 6:00 pm)`;
test("South Sea Cruises confirmation uses sailing date, route and Fiji time zone",()=>{
 for(const text of [southSeaConfirmation,southSeaConfirmation.replace(/\n/g," ")]){
  const [b]=importConfirmation(text,"t");
  assert.equal(b.kind,"Cruise");assert.equal(b.title,"South Sea Cruises · Octopus Resort (SOUTH) to Port Denarau");
  assert.equal(b.start,"2026-12-30T15:45");assert.equal(b.end,"2026-12-30T18:00");
  assert.equal(b.zone,"Pacific/Fiji");assert.equal(b.endZone,"Pacific/Fiji");
  assert.equal(b.confirmation,"3149207 · 1827479");
  assert.equal(b.location,"Octopus Resort (SOUTH) to Port Denarau");
  assert.equal(reservationDuration(b),"2 hrs 15 min");
  assert.equal(b.total,0);assert.equal(b.due,"");assert.deepEqual(b.payments,[]);
  assert.match(b.notes,/ROUTE7/);assert.ok(b.notes.endsWith(text));
  assert.doesNotThrow(()=>bookingSchema.parse(b));
 }
});
test("South Sea Cruises incomplete or invalid schedules need correction",()=>{
 for(const text of [southSeaConfirmation.replace("(arriving 6:00 pm)",""),southSeaConfirmation.replace("03:45pm",""),southSeaConfirmation.replace("03:45pm","13:45pm"),southSeaConfirmation.replaceAll("30 Dec 2026","32 Dec 2026"),southSeaConfirmation.replace("6:00 pm","2:00 pm")])assert.throws(()=>importConfirmation(text,"t"));
 const [unknown]=importConfirmation(southSeaConfirmation.replaceAll("Port Denarau","Unknown Port"),"t");
 assert.equal(unknown.zone,"");assert.match(unknown.notes,/Enter the departure and arrival time zones/);
});

import {attachmentPreview} from "../lib/attachment-preview";
test("attachment previews identify PDF and image bytes without trusting MIME labels",async()=>{
 const pdf=attachmentPreview("data:application/octet-stream;base64,"+btoa("%PDF-1.7\nexample"));
 assert.equal(pdf?.type,"application/pdf");assert.equal(await pdf?.text(),"%PDF-1.7\nexample");
 const png=attachmentPreview("data:application/octet-stream;base64,"+btoa(String.fromCharCode(137,80,78,71,13,10,26,10)));
 assert.equal(png?.type,"image/png");
 assert.equal(attachmentPreview("data:image/jpeg;base64,"+btoa("<html><script>alert(1)</script></html>")),null);
 assert.equal(attachmentPreview("data:application/pdf;base64,"+btoa("<svg onload='alert(1)'/>")),null);
 assert.equal(attachmentPreview("data:text/plain;base64,"+btoa("notes")),null);
 assert.throws(()=>attachmentPreview("https://example.com/private.pdf"));
 assert.throws(()=>attachmentPreview("data:application/pdf;base64,%%%"));
});

import "fake-indexeddb/auto";
import {rememberVault,openRememberedVault,writeVault,readVault,readVaultReadOnly} from "../lib/vault";
test("remembered vault survives storage round trips, supports updates, and is forgotten on lock",async()=>{
 const ring=await derive("remember my travel vault");
 const first=await encrypt(emptyVault(),ring);
 await writeVault(first,undefined,true);
 assert.equal(await readVaultReadOnly(),true);
 await writeVault(first,first.updated);
 assert.equal(await readVaultReadOnly(),true);
 await writeVault(first);
 assert.equal(await readVaultReadOnly(),false);
 assert.equal(await openRememberedVault(first),null);
 await rememberVault(ring);
 const opened=await openRememberedVault((await readVault())!);
 assert.deepEqual(opened?.vault,emptyVault());
 assert.equal(opened?.ring.key.extractable,false);
 const changed=emptyVault();changed.trips.push({id:"trip",name:"Fiji",destination:"Fiji",notes:""});
 const second=await encrypt(changed,ring);await writeVault(second);
 assert.deepEqual((await openRememberedVault((await readVault())!))?.vault,changed);
 await rememberVault(null);
 assert.equal(await openRememberedVault(second),null);
 assert.deepEqual((await decrypt(second,"remember my travel vault")).vault,changed);
 await rememberVault(ring);
 const other=await encrypt(emptyVault(),await derive("another travel vault"));
 assert.equal(await openRememberedVault(other),null);
 assert.equal(await openRememberedVault(first),null);
});

import {clampDocumentView,zoomDocumentAt} from "../lib/document-zoom";
test("document pinch keeps the focal point stable and supports moving the pinch center",()=>{
 const bounds={width:400,height:500,contentWidth:400,contentHeight:600};
 const view={scale:1,x:0,y:0},finger={x:100,y:200};
 const zoom=zoomDocumentAt(view,2,finger,finger,bounds);
 assert.deepEqual(zoom,{scale:2,x:-100,y:-200});
 assert.equal((finger.x-zoom.x)/zoom.scale,finger.x);
 assert.equal((finger.y-zoom.y)/zoom.scale,finger.y);
 assert.deepEqual(zoomDocumentAt(view,2,finger,{x:120,y:230},bounds),{scale:2,x:-80,y:-170});
});
test("document panning is bounded, small pages are centered, and zoom is limited",()=>{
 const bounds={width:400,height:500,contentWidth:400,contentHeight:600};
 assert.deepEqual(clampDocumentView({scale:2,x:-5000,y:100},bounds),{scale:2,x:-400,y:0});
 assert.deepEqual(clampDocumentView({scale:1,x:30,y:-500},bounds),{scale:1,x:0,y:-100});
 assert.deepEqual(clampDocumentView({scale:1,x:0,y:0},{...bounds,contentHeight:300}),{scale:1,x:0,y:100});
 assert.equal(zoomDocumentAt({scale:1,x:0,y:0},100,{x:200,y:250},{x:200,y:250},bounds).scale,5);
 assert.deepEqual(zoomDocumentAt({scale:2,x:-100,y:-200},.2,{x:100,y:200},{x:100,y:200},bounds),{scale:1,x:0,y:0});
});

const moxyConfirmation=`Congratulations Alexander,
Your hotel booking at Moxy Downtown Los Angeles for L.A. Comic Con 2025 is confirmed.
Hotel Booking Reference
**99211012 (EZE5J5ZR)**
Room 1**Alexander Ehrath**
**Check in**
**Friday 26**
September 2025
**16:00**
**Check out**
**Sunday 28**
September 2025
**11:00**
**Reservation information**
**Moxy Downtown Los Angeles**`;
test("hotel booking reference layout parses split dates, 24-hour times and property city",()=>{
 for(const text of [moxyConfirmation,moxyConfirmation.replace(/\*\*/g,""),moxyConfirmation.replace(/\n/g," "),moxyConfirmation.replace(/\n/g,"\t"),moxyConfirmation.replace("Check in","Check-in").replace("Check out","Check-out")]){
  const [b]=importConfirmation(text,"trip","2026-09-12");
  assert.equal(b.kind,"Hotel");assert.equal(b.title,"Moxy Downtown Los Angeles");assert.equal(b.confirmation,"99211012 (EZE5J5ZR)");
  assert.equal(b.start,"2025-09-26T16:00");assert.equal(b.end,"2025-09-28T11:00");assert.equal(b.location,"Los Angeles");
  assert.equal(b.zone,"America/Los_Angeles");assert.equal(b.endZone,"America/Los_Angeles");assert.equal(reservationDuration(b),"2 nights");
  assert.equal(b.total,0);assert.deepEqual(b.payments,[]);assert.equal(b.due,"");assert.ok(b.notes.includes(text));assert.doesNotThrow(()=>bookingSchema.parse(b));
 }
 const [b]=importConfirmation(moxyConfirmation.replace("16:00","4:00 PM").replace("11:00","11:00 AM"),"trip");assert.equal(b.start,"2025-09-26T16:00");
});
test("split hotel dates reject missing or contradictory values instead of guessing",()=>{
 for(const text of [moxyConfirmation.replace("Friday 26","Friday 31"),moxyConfirmation.replace("Friday 26","Thursday 26"),moxyConfirmation.replace("16:00","24:00"),moxyConfirmation.replace("16:00","16:75"),moxyConfirmation.replace("**16:00**",""),moxyConfirmation.replaceAll("September 2025","September"),moxyConfirmation.replace("Sunday 28","Friday 26")])assert.throws(()=>importConfirmation(text,"trip"));
 const [unknown]=importConfirmation(moxyConfirmation.replaceAll("Moxy Downtown Los Angeles","Hotel Example"),"trip");assert.equal(unknown.zone,"");assert.equal(unknown.endZone,"");assert.match(unknown.notes,/Select the hotel's time zone/);
});

test("rich-text hotel labels joined to values still use the property name instead of the greeting",()=>{
 const text=moxyConfirmation.replace(/\*\*/g,"").replace("Reference\n992", "Reference992").replace("Check in\nFriday", "Check inFriday").replace("Check out\nSunday", "Check outSunday").replace("16:00\nCheck", "16:00Check").replace("11:00\nReservation", "11:00Reservation").replace("information\nMoxy", "informationMoxy");
 for(const source of [text,text.replace(/\n/g," "),text.replace("Friday 26\nSeptember 2025\n16:00","Friday26September202516:00")]){
  const [b]=importConfirmation(source,"trip");assert.equal(b.kind,"Hotel");assert.equal(b.title,"Moxy Downtown Los Angeles");assert.equal(b.confirmation,"99211012 (EZE5J5ZR)");assert.equal(b.start,"2025-09-26T16:00");assert.equal(b.end,"2025-09-28T11:00");
 }
});

const moxy2026=`Congratulations Alexander,

Your hotel booking at Moxy Downtown Los Angeles for L.A. Comic Con 2026 is confirmed.

Hotel Booking Reference

**PUI9DBW6**

Room 1**Alexander Ehrath**

**Check in**

**Friday 30**

October 2026

**16:00**

**Check out**

**Sunday 1**

November 2026

**11:00**

**Reservation information**

**Moxy Downtown Los Angeles**

**King Bed**\\
Standard Room with 1 King Bed.

Room only rate

The rate quoted is exclusive of breakfast

Nights

**2**

Total number of adults

**1**

---

Sub-total

**$450.00**

Taxes

**$72.00**

---

**Total**

**USD $522.00**

---

**Plus**, the following mandatory charges will be collected by the hotel at **check-in**

\\+ Plus hotel fees

**$2.09**`;
test("hotel pricing prose does not create extra stay dates; taxes and extra fee are counted once",()=>{
 for(const text of [moxy2026,moxy2026.replace(/\*\*/g,""),moxy2026.replace(/\n/g," "),moxy2026.replace(/\n/g,"\t"),moxy2026.replace(/\n+/g,"<br>")]){
  const [b]=importConfirmation(text,"trip");assert.equal(b.kind,"Hotel");assert.equal(b.title,"Moxy Downtown Los Angeles");assert.equal(b.confirmation,"PUI9DBW6");
  assert.equal(b.start,"2026-10-30T16:00");assert.equal(b.end,"2026-11-01T11:00");assert.equal(b.zone,"America/Los_Angeles");assert.equal(reservationDuration(b),"2 nights");
  assert.equal(b.total,524.09);assert.equal(b.currency,"USD");assert.deepEqual(b.payments,[]);assert.equal(b.due,"");
  assert.match(b.notes,/including 72.00 taxes/);assert.match(b.notes,/Additional hotel fee: USD 2.09, included once/);assert.ok(b.notes.includes(text));assert.doesNotThrow(()=>bookingSchema.parse(b));
 }
 const [noFee]=importConfirmation(moxy2026.split("**Plus**")[0],"trip");assert.equal(noFee.total,522);
});
test("hotel pricing and night-count contradictions require review",()=>{
 for(const text of [moxy2026.replace("$450.00","$451.00"),moxy2026.replace("**2**","**3**"),moxy2026.replace("USD $522.00","$522.00"),moxy2026.replace("$2.09","EUR $2.09")])assert.throws(()=>importConfirmation(text,"trip"));
});

import {mergeVaultImport,mergeSharedUpdates} from "../lib/merge-vault";
test("older saved versions cannot remove a new trip or overwrite local edits and payments",()=>{
 const old=emptyVault();old.trips=[{id:"original",name:"Fiji",destination:"Fiji",notes:""}];
 const booking={...blankBooking("original"),id:"booking",kind:"Hotel" as const,title:"Original hotel",start:"2026-12-01T14:00",end:"2026-12-02T11:00",total:100};old.bookings=[booking];
 const local=structuredClone(old);local.trips.push({id:"comic-con",name:"Los Angeles Comic Con",destination:"Los Angeles",notes:"New trip"});
 local.bookings[0]={...booking,title:"Corrected hotel",payments:[{id:"paid",date:"2026-09-12",amount:50,note:"Paid"}]};
 const merged=mergeVaultImport(local,old);
 assert.deepEqual(merged,local);assert.equal(merged.trips.length,2);assert.equal(merged.bookings[0].payments[0].amount,50);
 const missing=structuredClone(old);missing.trips.push({id:"recovered",name:"Recovered trip",destination:"",notes:""});
 assert.equal(mergeVaultImport(local,missing).trips.length,3);
});
test("live shared updates accept remote edits only when the local record was unchanged",()=>{
 const base=emptyVault();base.trips=[{id:"a",name:"A",destination:"",notes:""},{id:"b",name:"B",destination:"",notes:""}];
 const local=structuredClone(base);local.trips[0].notes="Local work";local.trips.push({id:"new",name:"Los Angeles Comic Con",destination:"",notes:""});
 const remote=structuredClone(base);remote.trips[0].notes="Conflicting remote work";remote.trips[1].notes="Collaborator's edit";
 const merged=mergeSharedUpdates(local,remote,base);
 assert.equal(merged.trips.find(t=>t.id==="a")!.notes,"Local work");assert.equal(merged.trips.find(t=>t.id==="b")!.notes,"Collaborator's edit");assert.ok(merged.trips.some(t=>t.id==="new"));
 assert.equal(mergeSharedUpdates(local,emptyVault(),base).trips.length,3);
});
test("saving retains encrypted recovery revisions and rejects stale ciphertext even with matching timestamps",async()=>{
 const {readVault,writeVault,readLocalSetting}=await import("../lib/vault");
 const key=await derive("save every new trip safely");
 const first=await encrypt(emptyVault(),key);await writeVault(first);
 const local=emptyVault();local.trips.push({id:"comic-con",name:"Los Angeles Comic Con",destination:"LA",notes:""});
 const second=await encrypt(local,key);second.updated=first.updated;
 await writeVault(second,first.updated,undefined,undefined,first.ciphertext);
 const stale=await encrypt(emptyVault(),key);
 await assert.rejects(()=>writeVault(stale,first.updated,undefined,undefined,first.ciphertext),/another tab/);
 assert.deepEqual((await decrypt((await readVault())!,"save every new trip safely")).vault,local);
 const third=await encrypt({...local,trips:[{...local.trips[0],notes:"More details"}]},key);
 await writeVault(third,second.updated,undefined,undefined,second.ciphertext);
 const history=await readLocalSetting<import("../lib/vault").Envelope[]>("saved-revisions");
 assert.equal(history![0].ciphertext,second.ciphertext);
 assert.equal((await decrypt(history![0],"save every new trip safely")).vault.trips[0].name,"Los Angeles Comic Con");
});

test("a phone with one trip automatically collects the PC's second trip without losing phone work",async()=>{
 const ring=await derive("shared device vault passphrase");
 const pc=emptyVault();pc.trips=[{id:"fiji",name:"Fiji",destination:"Fiji",notes:""},{id:"comic",name:"Los Angeles Comic Con",destination:"LA",notes:""}];
 pc.bookings=[{...blankBooking("fiji"),id:"hotel",title:"Old name",kind:"Hotel",start:"2026-12-01T14:00",end:"2026-12-02T11:00",total:100}];
 const phone=structuredClone(pc);phone.trips=phone.trips.slice(0,1);phone.bookings[0].title="Phone correction";phone.bookings[0].payments=[{id:"paid",amount:30,date:"2026-09-12",note:"Paid on phone"}];
 const remote=(await decrypt(await encrypt(pc,ring),"shared device vault passphrase")).vault;
 const merged=mergeVaultImport(phone,remote);
 assert.deepEqual(merged.trips.map(t=>t.id),["fiji","comic"]);
 assert.equal(merged.bookings[0].title,"Phone correction");
 assert.equal(merged.bookings[0].payments[0].amount,30);
});
test("local removal markers are saved atomically and a stale tab cannot change them",async()=>{
 const {readLocalSetting}=await import("../lib/vault");
 const ring=await derive("keep intentional removals safe");
 const first=await encrypt(emptyVault(),ring);await writeVault(first);
 const second=await encrypt(emptyVault(),ring);
 const removed={trips:["deleted-trip"],bookings:["deleted-booking"],artifacts:["deleted-document"]};
 await writeVault(second,first.updated,undefined,undefined,first.ciphertext,removed);
 assert.deepEqual(await readLocalSetting("drive-local-removals:"+ring.salt),removed);
 await assert.rejects(()=>writeVault(first,second.updated,undefined,undefined,first.ciphertext,{trips:["wrong"],bookings:[],artifacts:[]}),/another tab/);
 assert.deepEqual(await readLocalSetting("drive-local-removals:"+ring.salt),removed);
});


import {recordTripDeletions} from "../lib/merge-vault";
import {saveDriveDraft,hasLocalDriveChanges} from "../lib/drive-save-state";
test("explicit trip deletion propagates encrypted, wins over offline edits, and never deletes unrelated trips",async()=>{
 const key=await derive("deletions travel between devices");
 const original=emptyVault();original.trips=[{id:"delete-me",name:"Old trip",destination:"",notes:""},{id:"keep",name:"Keep",destination:"",notes:""}];
 original.bookings=[{...blankBooking("delete-me"),id:"reservation",title:"Hotel",kind:"Hotel",start:"2026-12-01T14:00",end:"2026-12-02T11:00"}];
 original.artifacts=[{id:"doc",tripId:"delete-me",bookingId:"reservation",name:"Document",type:"text/plain",data:"data:text/plain;base64,aGk=",size:2,added:"2026-09-12"}];
 const deleted=recordTripDeletions(original,{...original,trips:original.trips.slice(1),bookings:[],artifacts:[]});
 assert.deepEqual(deleted.deletedTripIds,["delete-me"]);
 const encrypted=await encrypt(deleted,key);assert.ok(!JSON.stringify(encrypted).includes("delete-me"));
 const stale=structuredClone(original);stale.trips[0].notes="Offline edit after deletion";stale.trips[1].notes="Keep my local notes";
 for(const order of [["deleted","old"],["old","deleted"]]){
  let merged=stale;
  for(const id of order)merged=mergeVaultImport(merged,(await decrypt(id==="deleted"?encrypted:await encrypt(original,key),"deletions travel between devices")).vault);
  const result={vault:merged};
  assert.deepEqual(result.vault.trips.map(t=>t.id),["keep"]);assert.equal(result.vault.trips[0].notes,"Keep my local notes");assert.equal(result.vault.bookings.length,0);assert.equal(result.vault.artifacts.length,0);
  const reopened=(await decrypt(await encrypt(result.vault,key),"deletions travel between devices")).vault;
  assert.deepEqual(mergeVaultImport(reopened,stale),result.vault,"a later stale upload cannot resurrect the deleted trip");
 }
 assert.equal(mergeVaultImport(original,emptyVault()).trips.length,2,"missing records alone do not mean deletion");
});
test("local drafts survive reopening and only an explicit successful Drive save clears the dirty state",async()=>{
 const {readLocalSetting,writeLocalSetting}=await import("../lib/vault");
 const ring=await derive("persistent local drafts before save"),draft=emptyVault();draft.trips=[{id:"draft",name:"Local draft",destination:"",notes:""}];
 const envelope=await encrypt(draft,ring);await writeVault(envelope);
 const reopened=(await readVault())!;assert.deepEqual((await decrypt(reopened,"persistent local drafts before save")).vault,draft);
 assert.equal(hasLocalDriveChanges(reopened,null),true);
 let uploads=0;const checkpointKey="test-drive-checkpoint:"+ring.salt;
 const services={read:readVault,upload:async()=>{uploads++;},publish:async()=>{},checkpoint:async(saved:import("../lib/drive-save-state").DriveSaveCheckpoint)=>writeLocalSetting(checkpointKey,saved)};
 assert.equal(uploads,0,"persisting or reopening a local draft does not upload it");
 const checkpoint=await saveDriveDraft(reopened,services);assert.equal(uploads,1);assert.equal(hasLocalDriveChanges(reopened,await readLocalSetting(checkpointKey)),false);
 const newer=await encrypt({...draft,trips:[{...draft.trips[0],notes:"More local work"}]},ring);await writeVault(newer,reopened.updated,undefined,undefined,reopened.ciphertext);
 await assert.rejects(()=>saveDriveDraft(newer,{...services,upload:async()=>{throw new Error("offline");}}),/offline/);
 assert.equal(hasLocalDriveChanges((await readVault())!,checkpoint),true);
 await assert.rejects(()=>saveDriveDraft(reopened,services),/newer local draft/);
 const latest=await encrypt({...draft,trips:[{...draft.trips[0],notes:"Typed during upload"}]},ring);
 const uploaded=await saveDriveDraft(newer,{...services,upload:async()=>{await writeVault(latest,newer.updated,undefined,undefined,newer.ciphertext);}});
 assert.equal(hasLocalDriveChanges((await readVault())!,uploaded),true,"a save cannot mark later changes as uploaded");
});

test("Google-native files remain excluded from manual backup discovery",async()=>{
 const {isDownloadableDriveCopy}=await import("../lib/drive-file-types");
 for(const kind of ["document","spreadsheet","presentation","folder","shortcut"])assert.equal(isDownloadableDriveCopy({mimeType:"application/vnd.google-apps."+kind}),false);
 assert.equal(isDownloadableDriveCopy({mimeType:"application/json"}),true);
 assert.equal(isDownloadableDriveCopy({}),true);
});

import {mergeLiveDraft} from "../lib/drive-live-sync";
test("live merging refreshes unchanged records but preserves drafts and rejects overlapping edits",()=>{
 const base=emptyVault();base.trips=[{id:"a",name:"A",destination:"",notes:""},{id:"b",name:"B",destination:"",notes:""}];
 const remote=structuredClone(base);remote.trips[0].notes="PC work";
 const local=structuredClone(base);local.trips[1].notes="Phone work";
 const merged=mergeLiveDraft(local,remote,base);assert.equal(merged.trips[0].notes,"PC work");assert.equal(merged.trips[1].notes,"Phone work");
 local.trips[0].notes="Overlapping phone work";assert.throws(()=>mergeLiveDraft(local,remote,base),/another device/);assert.equal(local.trips[0].notes,"Overlapping phone work");
 assert.throws(()=>mergeLiveDraft(local,remote,undefined),/common saved version/);
 const deleted=recordTripDeletions(remote,{...remote,trips:remote.trips.slice(1)});
 assert.deepEqual(mergeLiveDraft(local,deleted,base).trips.map(t=>t.id),["b"]);
});

const fedoraExpedia=`|     |
| :-: |

|   |
| - |

|   |
| - |

|   |
| - |

## Traveler Details

|   |
| - |

Adults, 2

|     |
| :-: |

|   |
| - |

|   |
| - |

|   |
| - |

|   |
| - |

[1020 Fedora Street, Los Angeles, CA, 90006 United States of America](https://click.eg.expedia.com/?qs=ABB7InYiOjEsImQiOjQ5ODV9AAwAAAAAAqhPq3fxLpc69jayZE20wqIWnFk0uugZ5PRd1wl0-L4D26Akym_WnNJydmsR5pj_dpEGkKKXbZHfYEH6kpKEVyCbZ5AfzqSY2UQg3nBn3ppdTbpRFg)

|     |
| :-: |

|   |
| - |

|   |
| - |

## Check-in

|   |
| - |

|   |
| - |

## Check-out

|     |
| :-: |

|   |
| - |

|   |
| - |

**Fri, Sep 25**

|   |
| - |

|   |
| - |

**Sat, Sep 26**

|     |
| :-: |

|   |
| - |

|   |
| - |

**Check-in time starts at 3:00pm**

|   |
| - |

|   |
| - |

**11:00am**`;
test("Expedia Fedora Street stay excludes traveler details and resolves the US city timezone",()=>{
 for(const text of [fedoraExpedia,fedoraExpedia.replace(/\n/g,"<br>"),fedoraExpedia.replace(/\|[^\n]*|##|\*\*/g,"").replace(/\s+/g," ")]){
  const [b]=importConfirmation(text,"trip","2026-09-13");
  assert.equal(b.kind,"Hotel");assert.equal(b.start,"2026-09-25T15:00");assert.equal(b.end,"2026-09-26T11:00");
  assert.equal(b.location,"1020 Fedora Street, Los Angeles, CA, 90006 United States of America");
  assert.equal(b.title,"Hotel stay · "+b.location);assert.doesNotMatch(b.title,/Traveler|Adults/);
  assert.equal(b.zone,"America/Los_Angeles");assert.equal(b.endZone,b.zone);assert.equal(reservationDuration(b),"1 night");
  assert.equal(b.total,0);assert.equal(b.confirmation,"");assert.deepEqual(b.payments,[]);
  assert.match(b.notes,/confirm the omitted year/);assert.ok(b.notes.includes(text));assert.doesNotThrow(()=>bookingSchema.parse(b));
 }
 const [unknown]=importConfirmation(fedoraExpedia.replace("Los Angeles, CA, 90006 ",""),"trip","2026-09-13");assert.equal(unknown.zone,"");
 assert.throws(()=>importConfirmation(fedoraExpedia.replace("Fri, Sep 25","Thu, Sep 25"),"trip","2026-09-13"),/weekday/);
});

const aventuraExpedia=`| |\n| :- |\n\n## Aventura Hotel\n\nExpedia itinerary: 73533711743880\n\n${fedoraExpedia}\n\n| |\n| - |\n\nFree cancellation until Sep 4 at 12:00am (property local time)`;
test("Expedia hotel name, itinerary and street address are independent import fields",async()=>{
 for(const text of [aventuraExpedia,aventuraExpedia.replace(/\n/g,"<br>"),aventuraExpedia.replace(/\|[^\n]*|##|\*\*/g,"").replace(/\s+/g," ")]){
  const [b]=importConfirmation(text,"trip","2026-09-13");
  assert.equal(b.title,"Aventura Hotel");assert.equal(b.location,"1020 Fedora Street, Los Angeles, CA, 90006 United States of America");assert.equal(b.confirmation,"73533711743880");
  assert.doesNotMatch(b.location,/Traveler|735337|Adults/);
  assert.equal(b.start,"2026-09-25T15:00");assert.equal(b.end,"2026-09-26T11:00");assert.equal(b.zone,"America/Los_Angeles");assert.equal(b.due,"");assert.equal(reservationDuration(b),"1 night");
  assert.doesNotMatch(b.notes,/Property name is absent/);assert.ok(b.notes.includes(text));assert.doesNotThrow(()=>bookingSchema.parse(b));
 }
 const [booking]=importConfirmation(aventuraExpedia,"trip","2026-09-13");
 const vault=emptyVault();vault.trips=[{id:"trip",name:"LA",destination:"",notes:""}];vault.bookings=[booking];
 const key=await derive("hotel name and address stay separate");const reopened=(await decrypt(await encrypt(vault,key),"hotel name and address stay separate")).vault.bookings[0];
 assert.equal(reopened.title,"Aventura Hotel");assert.equal(reopened.location,booking.location);assert.equal(reopened.confirmation,booking.confirmation);
});
