// Offline suggestions, not an exhaustive airline directory. Unlisted names are allowed.
const entries = [
 ["FJ","Fiji Airways"],["UA","United Airlines"],["AA","American Airlines"],["DL","Delta Air Lines"],
 ["AS","Alaska Airlines"],["HA","Hawaiian Airlines"],["WN","Southwest Airlines"],["B6","JetBlue Airways"],
 ["AC","Air Canada"],["WS","WestJet"],["AM","Aeromexico"],["AV","Avianca"],["LA","LATAM Airlines"],
 ["BA","British Airways"],["VS","Virgin Atlantic"],["AF","Air France"],["KL","KLM"],["LH","Lufthansa"],
 ["LX","Swiss International Air Lines"],["OS","Austrian Airlines"],["IB","Iberia"],["EI","Aer Lingus"],
 ["AY","Finnair"],["SK","Scandinavian Airlines SAS"],["TP","TAP Air Portugal"],["TK","Turkish Airlines"],
 ["FR","Ryanair"],["U2","easyJet"],["W6","Wizz Air"],["VY","Vueling"],["LO","LOT Polish Airlines"],
 ["EK","Emirates"],["QR","Qatar Airways"],["EY","Etihad Airways"],["LY","El Al"],["SV","Saudia"],
 ["SQ","Singapore Airlines"],["CX","Cathay Pacific"],["NH","All Nippon Airways ANA"],["JL","Japan Airlines"],
 ["KE","Korean Air"],["OZ","Asiana Airlines"],["BR","EVA Air"],["CI","China Airlines"],
 ["CA","Air China"],["MU","China Eastern Airlines"],["CZ","China Southern Airlines"],["AI","Air India"],
 ["6E","IndiGo"],["TG","Thai Airways"],["VN","Vietnam Airlines"],["MH","Malaysia Airlines"],
 ["AK","AirAsia"],["TR","Scoot"],["PR","Philippine Airlines"],["GA","Garuda Indonesia"],
 ["QF","Qantas"],["JQ","Jetstar Airways"],["VA","Virgin Australia"],["NZ","Air New Zealand"],
 ["TN","Air Tahiti Nui"],["ET","Ethiopian Airlines"],["KQ","Kenya Airways"],["SA","South African Airways"],
 ["MS","EgyptAir"],["AT","Royal Air Maroc"],["CM","Copa Airlines"],["FI","Icelandair"]
];
export type Airline = {code:string;name:string};
export const airlines:Airline[]=entries.map(([code,name])=>({code,name}));
export const airlineLabel=(a:Airline)=>`${a.name} (${a.code})`;
export function searchAirlines(query:string):Airline[]{
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return airlines.filter(a=>words.every(w=>airlineLabel(a).toLowerCase().includes(w)))
  .sort((a,b)=>Number(b.code.toLowerCase()===query.toLowerCase())-Number(a.code.toLowerCase()===query.toLowerCase())).slice(0,20);
}
