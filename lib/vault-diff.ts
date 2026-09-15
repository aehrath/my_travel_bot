import type {Vault} from "./travel";
export function sameValue(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameValue(value,b[index]));
 if(a&&b&&typeof a==="object"&&typeof b==="object"){
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  const keys=[...new Set([...Object.keys(left),...Object.keys(right)])];
  return keys.every(key=>sameValue(left[key],right[key]));
 }
 return false;
}
export type VaultDifference={id:string;name:string;kind:string;status:"Only on this device"|"Only on Google Drive"|"Changed";fields:{key:string;local:unknown;remote:unknown}[]};
export function vaultDifferences(local:Vault,remote:Vault):VaultDifference[]{
 const differences:VaultDifference[]=[];
 for(const kind of ["trips","bookings","artifacts"] as const){
  const here=new Map(local[kind].map(item=>[item.id,item])),there=new Map(remote[kind].map(item=>[item.id,item]));
  for(const id of new Set([...here.keys(),...there.keys()])){
   const left=here.get(id) as Record<string,unknown>|undefined,right=there.get(id) as Record<string,unknown>|undefined;
   if(sameValue(left,right))continue;
   const item=left??right!;
   const fields=[...new Set([...Object.keys(left??{}),...Object.keys(right??{})])].filter(key=>key!=="id"&&!sameValue(left?.[key],right?.[key])).map(key=>({key,local:left?.[key],remote:right?.[key]}));
   differences.push({id,kind,name:String(item.title??item.name??id),status:!left?"Only on Google Drive":!right?"Only on this device":"Changed",fields});
  }
 }
 const localDeleted=[...new Set(local.deletedTripIds??[])].sort(),remoteDeleted=[...new Set(remote.deletedTripIds??[])].sort();
 if(!sameValue(localDeleted,remoteDeleted))differences.push({id:"deleted-trips",kind:"deletions",name:"Deleted trips",status:"Changed",fields:[{key:"deletedTripIds",local:localDeleted,remote:remoteDeleted}]});
 if(local.version!==remote.version)differences.push({id:"version",kind:"vault",name:"Vault version",status:"Changed",fields:[{key:"version",local:local.version,remote:remote.version}]});
 return differences;
}
