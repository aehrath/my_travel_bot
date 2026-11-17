import {z} from "zod";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {parseHotelMatches} from "@/lib/hotels";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 const url=new URL(request.url);
 if(request.headers.get("origin")!==url.origin)return reply({error:"Open hotel search from this app."},403);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)&&!await getChatGPTUser())return reply({error:"Sign in to use hotel search."},401);
 const input=z.object({query:z.string().trim().min(3).max(200)}).safeParse(await request.json().catch(()=>null));
 if(!input.success)return reply({error:"Enter the hotel name and, if known, its city."},400);
 try{
  const query=new URLSearchParams({q:input.data.query,limit:"10",lang:"en",osm_tag:"tourism"});
  const response=await fetch("https://photon.komoot.io/api/?"+query,{signal:AbortSignal.timeout(12000),headers:{"User-Agent":"MyTravelBot/1.0 (hotel address lookup)"}});
  if(!response.ok)throw new Error("Search unavailable");
  return reply({matches:parseHotelMatches(await response.json())});
 }catch{return reply({error:"Hotel search is temporarily unavailable. Try again or enter the address manually."},502);}
}
