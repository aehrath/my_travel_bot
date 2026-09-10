import type { Vault } from "./travel";
export function registerTravelTools(read:()=>Vault|null):()=>void{
 const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
 if(!context?.registerTool)return()=>{};
 const controller=new AbortController();
 const result=context.registerTool({
  name:"read_travel_reservations",title:"Read travel reservations",
  description:"Read reservations in the currently unlocked travel vault. Does not unlock the vault or expose attached file contents.",
  inputSchema:{type:"object",properties:{tripId:{type:"string"}},additionalProperties:false},
  annotations:{readOnlyHint:true,untrustedContentHint:true},
  execute(input:unknown){if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Expected an object.");const v=input as Record<string,unknown>;if(Object.keys(v).some(k=>k!=="tripId")||(v.tripId!==undefined&&typeof v.tripId!=="string"))throw new Error("Invalid tripId.");const vault=read();if(!vault)throw new Error("The vault is locked.");if(v.tripId&&!vault.trips.some(t=>t.id===v.tripId))throw new Error("Trip not found.");return {reservations:vault.bookings.filter(b=>!v.tripId||b.tripId===v.tripId)};}
 },{signal:controller.signal});
 Promise.resolve(result).catch(()=>{});
 return()=>controller.abort();
}
