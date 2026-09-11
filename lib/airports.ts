import data from "./airports-data.json";

export type Airport = { code: string; icao: string; name: string; city: string; country: string; zone: string };
// mwgg/Airports, MIT. Snapshot downloaded 2026-09-10; see airports.LICENSE.
export const airports: Airport[] = data.map(([code, icao, name, city, country, zone]) => ({code, icao, name, city, country, zone}));
export const airportLabel = (a: Airport) => `${a.code} — ${a.name} (${a.city || a.country})`;
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const regionNames = new Intl.DisplayNames(["en"], {type:"region"});
const countryNames = new Map([...new Set(airports.map(a=>a.country))].map(code=>{
 try { return [code,regionNames.of(code)||code] as const; } catch { return [code,code] as const; }
}));
export const airportCountryName=(code:string)=>countryNames.get(code)||code;
const countryAliases:Record<string,string>={US:"USA United States of America",GB:"UK Great Britain Britain",AE:"UAE",KR:"Republic of Korea",CZ:"Czech Republic",CI:"Ivory Coast"};
const countrySearch=(code:string)=>normalize([code,airportCountryName(code),countryAliases[code]||""].join(" "));
const indexed = airports.map(a => ({airport:a, text:normalize([a.code,a.icao,a.name,a.city,countrySearch(a.country)].join(" "))}));
export function searchAirports(query: string): Airport[] {
 const q = normalize(query), words=q.split(/\s+/).filter(Boolean);
 const selected=airports.find(a=>normalize(airportLabel(a))===q);
 if(selected)return [selected];
 if (!q) return ["SFO","LAX","JFK","LHR","CDG","FCO","AMS","DXB","SIN","HND"].map(code=>airports.find(a=>a.code===code)!).filter(Boolean);
 return indexed.filter(x=>words.every(w=>x.text.includes(w))).sort((a,b)=>{
  const rank=(a:Airport)=>a.code.toLowerCase()===q||a.icao.toLowerCase()===q?0:normalize(a.city)===q?1:a.code.toLowerCase().startsWith(q)?2:words.every(w=>countrySearch(a.country).includes(w))&&/international/i.test(a.name)?3:4;
  return rank(a.airport)-rank(b.airport)||a.airport.code.localeCompare(b.airport.code);
 }).slice(0,20).map(x=>x.airport);
}
