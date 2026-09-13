const validId=(id:string)=>/^[A-Za-z0-9_-]{1,200}$/.test(id);
export function sharedVaultLink(origin:string,id:string,files:string[]=[]){
 if(!validId(id))throw new Error("Invalid shared vault file ID.");
 const url=new URL("/",origin);
 if(!["http:","https:"].includes(url.protocol))throw new Error("Invalid app address.");
 if(files.length>100||files.some(file=>!validId(file)))throw new Error("Invalid shared trip file IDs.");
 const params=new URLSearchParams({sharedVault:id});
 if(files.length)params.set("tripFiles",[...new Set(files)].join(","));
 url.hash=params.toString();
 return url.toString();
}
export function sharedVaultId(hash:string):string|null{
 const id=new URLSearchParams(hash.replace(/^#/,"")).get("sharedVault");
 return id&&validId(id)?id:null;
}
export function sharedTripIds(hash:string):string[]{
 const files=new URLSearchParams(hash.replace(/^#/,"")).get("tripFiles")?.split(",")??[];
 return files.length<=100&&files.every(validId)?[...new Set(files)]:[];
}
export function sharedVaultInvitation(origin:string,id:string,files:string[]=[]){
 return `You’re invited to a shared trip in My Travel Bot.\n\nOpen your trip:\n${sharedVaultLink(origin,id,files)}\n\nSign in with your invited Google account. If Google asks for file access, highlight the listed files and click Select. The app will then open your shared trip; unlock it with the passphrase provided separately by the owner.`;
}
export function sharedVaultEmail(origin:string,id:string,email:string){
 return "mailto:"+encodeURIComponent(email)+"?"+new URLSearchParams({subject:"You’re invited to a shared trip",body:sharedVaultInvitation(origin,id)}).toString().replace(/\+/g,"%20");
}
