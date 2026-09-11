import {test} from "node:test";
import assert from "node:assert/strict";
import {bookingSchema,blankBooking,emptyVault,balance,paid,instant,calendarExport,importBookings,importCalendar,vaultSchema} from "../lib/travel";
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
