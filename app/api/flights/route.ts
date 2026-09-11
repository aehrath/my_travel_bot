import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { airports } from "@/lib/airports";
import { dateInZone, parseFlights } from "@/lib/flights";

export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 const url=new URL(request.url);
 if(request.headers.get("origin")!==url.origin)return reply({error:"Open flight search from this app."},403);
 const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
 if(!local&&!await getChatGPTUser())return reply({error:"Sign in to use flight search."},401);
 const parsed=z.object({from:z.string().regex(/^[A-Z]{3}$/),to:z.string().regex(/^[A-Z]{3}$/),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return reply({error:"Choose both airports and a departure date."},400);
 const {from,to,date}=parsed.data;
 const airport=airports.find(a=>a.code===from);
 if(!airport||!airports.some(a=>a.code===to)||from===to)return reply({error:"Choose two different airports from the suggestions."},400);
 if(date!==dateInZone(airport.zone))return reply({error:"Free flight lookup covers current flights only. For future or past dates, enter the schedule from your ticket."},422);
 if(!env.AVIATIONSTACK_API_KEY)return reply({error:"Flight lookup needs a free Aviationstack API key configured by the app owner. Airline suggestions and manual entry work without an account."},503);
 try{
  // Only the free current-flights endpoint; no historical/future endpoint or paid fallback.
  const query=new URLSearchParams({access_key:env.AVIATIONSTACK_API_KEY,dep_iata:from,arr_iata:to,limit:"100"});
  const response=await fetch("https://api.aviationstack.com/v1/flights?"+query,{signal:AbortSignal.timeout(15000)});
  const raw=await response.json() as {error?:unknown;pagination?:{total?:number;count?:number}};
  if(!response.ok||raw.error)return reply({error:"The flight provider could not complete this lookup. Check the API key and free quota, or enter the flight manually."},502);
  return reply({flights:parseFlights(raw,from,to,date),checkedAt:new Date().toISOString(),partial:(raw.pagination?.total??0)>(raw.pagination?.count??100)});
 }catch{return reply({error:"Flight lookup is temporarily unavailable. You can still enter the times from your ticket."},502);}
}
