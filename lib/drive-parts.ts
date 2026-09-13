import {z} from "zod";
import {vaultSchema,type Vault} from "./travel";
import {encryptPayload,decryptPayload,readLocalSetting,writeLocalSetting,type Envelope,type Keyring} from "./vault";

const reference=z.object({kind:z.enum(["trip","artifact"]),key:z.string(),id:z.string().min(1),hash:z.string().regex(/^[a-f0-9]{64}$/)});
const indexSchema=z.object({format:z.literal("travel-vault-index"),version:z.literal(1),parts:z.array(reference),bookingOrder:z.array(z.string()),deletedTripIds:z.array(z.string()).optional()});
export type VaultIndex=z.infer<typeof indexSchema>;
const digest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");
const cacheKey=(ring:Keyring,id:string)=>"drive-part:"+ring.salt+":"+id;
async function boundedMap<T,R>(values:T[],fn:(value:T)=>Promise<R>):Promise<R[]>{
 const result:R[]=new Array(values.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,values.length)},async()=>{while(cursor<values.length){const i=cursor++;result[i]=await fn(values[i]);}}));
 return result;
}

// Parts are immutable. Only a successfully written index makes new parts visible.
// Both the index (including hashes and links) and each part are encrypted.
export async function prepareDriveParts(vault:Vault,ring:Keyring,previous:VaultIndex|null,create:(envelope:Envelope)=>Promise<{id:string}>){
 const pieces:{kind:"trip"|"artifact";key:string;value:unknown}[]=[
  ...vault.trips.map(trip=>({kind:"trip" as const,key:trip.id,value:{trip,bookings:vault.bookings.filter(b=>b.tripId===trip.id)}})),
  ...vault.artifacts.map(artifact=>({kind:"artifact" as const,key:artifact.id,value:artifact})),
 ];
 const parts=await boundedMap(pieces,async piece=>{
  const hash=await digest(piece.value);
  const existing=previous?.parts.find(p=>p.kind===piece.kind&&p.key===piece.key&&p.hash===hash);
  if(existing)return existing;
  const envelope=await encryptPayload(piece.value,ring),file=await create(envelope);
  await writeLocalSetting(cacheKey(ring,file.id),envelope);
  return {kind:piece.kind,key:piece.key,id:file.id,hash};
 });
 const index:VaultIndex={format:"travel-vault-index",version:1,parts,bookingOrder:vault.bookings.map(b=>b.id),...(vault.deletedTripIds?{deletedTripIds:vault.deletedTripIds}:{})};
 return {index,document:await encryptPayload(index,ring)};
}

export async function readDriveParts(document:Envelope,ring:Keyring,download:(id:string)=>Promise<Envelope>):Promise<{vault:Vault;index:VaultIndex|null}>{
 const payload=await decryptPayload(document,ring);
 if((payload as {format?:string})?.format!=="travel-vault-index")return {vault:vaultSchema.parse(payload),index:null};
 const index=indexSchema.parse(payload);
 const seen=new Set<string>();
 const parts=await boundedMap(index.parts,async ref=>{
  const identity=ref.kind+":"+ref.key;
  if(seen.has(identity))throw new Error("The Drive index contains duplicate records. Your local changes are kept.");
  seen.add(identity);
  const cached=await readLocalSetting<Envelope>(cacheKey(ring,ref.id));
  const envelope=cached??await download(ref.id);
  const value=await decryptPayload(envelope,ring);
  if(await digest(value)!==ref.hash)throw new Error("A linked Drive file is damaged or changed. Your local changes are kept.");
  if(!cached)await writeLocalSetting(cacheKey(ring,ref.id),envelope);
  return {ref,value};
 });
 const vault:Vault={version:1,trips:[],bookings:[],artifacts:[],...(index.deletedTripIds?{deletedTripIds:index.deletedTripIds}:{})};
 for(const {ref,value} of parts){
  if(ref.kind==="trip"){
   const part=value as {trip:Vault["trips"][number];bookings:Vault["bookings"]};
   if(part?.trip?.id!==ref.key||!Array.isArray(part.bookings)||part.bookings.some(b=>b.tripId!==ref.key))throw new Error("Invalid linked trip file.");
   vault.trips.push(part.trip);vault.bookings.push(...part.bookings);
  }else{
   const artifact=value as Vault["artifacts"][number];
   if(artifact?.id!==ref.key)throw new Error("Invalid linked attachment file.");
   vault.artifacts.push(artifact);
  }
 }
 const bookings=new Map(vault.bookings.map(b=>[b.id,b]));
 if(index.bookingOrder.length!==vault.bookings.length||new Set(index.bookingOrder).size!==index.bookingOrder.length||index.bookingOrder.some(id=>!bookings.has(id)))throw new Error("Invalid reservation order in Drive index.");
 vault.bookings=index.bookingOrder.map(id=>bookings.get(id)!);
 return {vault:vaultSchema.parse(vault),index};
}
