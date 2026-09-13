import {test} from "node:test";
import assert from "node:assert/strict";
import {disconnectDrive,isDriveConnected,driveSessionVersion,sharedMembers,connectDrive,createSharedVault,updateSharedVault,shareVault,changeSharedMember,type SharedDriveVault} from "../lib/drive";
import type {Envelope} from "../lib/vault";
const file:SharedDriveVault={id:"shared-file",title:"Travel",etag:'"revision-1"',md5Checksum:"hash",capabilities:{canEdit:true,canShare:true}};
const envelope:Envelope={format:"travel-vault",version:1,salt:"salt",iv:"iv",ciphertext:"encrypted",updated:"now"};
test("sharing uses narrow scopes, encrypted regular Drive files, ACLs, and conditional writes",async()=>{
 const originalFetch=globalThis.fetch;
 const originalWindow=globalThis.window;
 const requests:{url:string;init:RequestInit}[]=[];
 let status=200,scope="";
 Object.assign(globalThis,{window:{google:{accounts:{oauth2:{revoke:()=>{},initTokenClient:(config:{scope:string;callback:(r:{access_token:string})=>void})=>{scope=config.scope;return {requestAccessToken:()=>config.callback({access_token:"test-token"})};}}}}}});
 globalThis.fetch=async(input,init={})=>{const url=String(input);requests.push({url,init});return new Response(JSON.stringify(url.includes("/about?")?{user:{emailAddress:"owner@example.com"}}:url.includes("gmail.googleapis.com")?{id:"sent-mail"}:url.includes("drive/v3/files?q=")?{files:[{id:"folder"}]}:file),{status});};
 try{
  await connectDrive(true);
  assert.match(scope,/drive\.file/);assert.match(scope,/drive\.appdata/);assert.ok(!scope.split(" ").includes("https://www.googleapis.com/auth/drive"));
  await createSharedVault("Family",envelope);
  const created=requests.find(r=>r.url.includes("uploadType=multipart"))!;assert.ok(created);
  assert.match(String(created.init.body),/encrypted/);assert.doesNotMatch(String(created.init.body),/appDataFolder/);
  assert.match(String(created.init.body),/"writersCanShare":false/);
  assert.match(String(created.init.body),/"parents":\[{"id":"folder"}\]/);
  const count=requests.length;
  await assert.rejects(()=>updateSharedVault({...file,capabilities:{canEdit:false}},envelope),/read-only/);
  assert.equal(requests.length,count);
  await updateSharedVault(file,envelope);
  assert.equal(new Headers(requests.at(-1)!.init.headers).get("If-Match"),'"revision-1"');
  status=412;await assert.rejects(()=>updateSharedVault(file,envelope),/Someone changed/);status=200;
  for(const role of ["reader","writer"] as const){
   await shareVault(file.id,"friend@example.com",role,"https://travel.example");
   const permission=requests.filter(r=>r.url.includes("permissions?")&&r.init.method==="POST").at(-1)!;
   assert.equal(JSON.parse(String(permission.init.body)).role,role);
   const sent=requests.at(-1)!;assert.match(sent.url,/gmail.googleapis.com/);
   const mime=Buffer.from(JSON.parse(String(sent.init.body)).raw,"base64url").toString();
   assert.match(mime,/To: friend@example.com/);
   assert.match(Buffer.from(mime.split("\r\n\r\n")[1],"base64").toString(),/https:\/\/travel.example\/#sharedVault=shared-file/);
  }
  await assert.rejects(()=>shareVault(file.id,"not-an-email","reader","https://travel.example"),/valid/);
  await shareVault(file.id,"friend@example.com","reader","https://travel.example",false);assert.equal(new URL(requests.at(-1)!.url).searchParams.get("sendNotificationEmail"),"false");assert.equal(new URL(requests.at(-1)!.url).searchParams.has("emailMessage"),false);
  await changeSharedMember(file.id,"member","reader");assert.equal(requests.at(-1)!.init.method,"PATCH");
  await changeSharedMember(file.id,"member",null);assert.equal(requests.at(-1)!.init.method,"DELETE");
 }finally{disconnectDrive();globalThis.fetch=originalFetch;Object.assign(globalThis,{window:originalWindow});}
});

import {sharedVaultLink,sharedVaultId,sharedVaultInvitation} from "../lib/shared-link";
test("invitation links open the app and contain only a validated Drive file ID",()=>{
 const link=sharedVaultLink("https://travel.example/old?token=private","abc_123-X");
 assert.equal(link,"https://travel.example/#sharedVault=abc_123-X");
 assert.equal(sharedVaultId(new URL(link).hash),"abc_123-X");
 assert.equal(sharedVaultId("#sharedVault=https://other.example"),null);
 assert.equal(sharedVaultId("#sharedVault=%3Cscript%3E"),null);
 assert.equal(sharedVaultId(""),null);
 assert.throws(()=>sharedVaultLink("javascript:alert(1)","file"));
 assert.throws(()=>sharedVaultLink("https://travel.example","file&token=bad"));
 assert.match(sharedVaultInvitation("https://travel.example","file"),/passphrase provided separately/);
});

import {loadInvitedVault,DriveFileAccessError} from "../lib/open-invitation";
import {sharedVaultEmail} from "../lib/shared-link";
test("invitation opens its exact vault automatically and only asks for file consent when needed",async()=>{
 let metadataCalls=0,downloads=0,picks=0;
 const services={metadata:async(id:string)=>{assert.equal(id,file.id);metadataCalls++;return file;},download:async(id:string)=>{assert.equal(id,file.id);downloads++;return envelope;},authorize:async(id:string)=>{assert.equal(id,file.id);picks++;return id;}};
 assert.deepEqual(await loadInvitedVault(file.id,services),{file,envelope});assert.equal(picks,0);assert.equal(downloads,1);
 metadataCalls=0;downloads=0;
 const gated={...services,metadata:async()=>{if(metadataCalls++===0)throw new DriveFileAccessError("consent needed");return file;}};
 await loadInvitedVault(file.id,gated);assert.equal(picks,1);assert.equal(downloads,1);
 metadataCalls=0;downloads=0;
 assert.equal(await loadInvitedVault(file.id,{...gated,authorize:async()=>null}),null);assert.equal(downloads,0);
 metadataCalls=0;
 await assert.rejects(()=>loadInvitedVault(file.id,{...gated,authorize:async()=>"wrong-file"}),/invitation/);assert.equal(downloads,0);
 await assert.rejects(()=>loadInvitedVault(file.id,{...services,metadata:async()=>{throw new Error("offline");}}),/offline/);assert.equal(picks,1);
 metadataCalls=0;
 await assert.rejects(()=>loadInvitedVault(file.id,{...services,metadata:async()=>({...file,etag:String(metadataCalls++)})}),/changed/);
 const email=new URL(sharedVaultEmail("https://travel.example",file.id,"friend@example.com"));
 assert.equal(decodeURIComponent(email.pathname),"friend@example.com");
 assert.match(email.searchParams.get("body")!,/https:\/\/travel.example\/#sharedVault=shared-file/);
 assert.doesNotMatch(email.searchParams.get("body")!,/Settings|choose the shared|Load the shared/);
});

test("one Drive connection retains sharing access, reuses invites, and reports specific failures",async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
 let granted="https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send",requested="",mode="member";
 const requests:{url:string;init:RequestInit}[]=[];
 Object.assign(globalThis,{window:{google:{accounts:{oauth2:{revoke:()=>{},initTokenClient:(config:{scope:string;callback:(r:{access_token:string;scope:string})=>void})=>{requested=config.scope;return{requestAccessToken:()=>config.callback({access_token:"test",scope:granted})};}}}}}});
 globalThis.fetch=async(input,init={})=>{
  requests.push({url:String(input),init});
  if(String(input).includes("/about?"))return new Response(JSON.stringify({user:{emailAddress:"owner@example.com"}}));
  if(mode==="denied")return new Response(JSON.stringify({error:{message:"Sharing outside your organization is disabled.",errors:[{reason:"domainPolicy"}]}}),{status:403});
  if(mode==="expired")return new Response("",{status:401});
  if(String(input).includes("gmail.googleapis.com"))return new Response(JSON.stringify(mode==="mail-failed"?{error:{message:"Gmail API disabled"}}:{id:"sent-mail"}),{status:mode==="mail-failed"?403:200});
  return new Response(JSON.stringify({permissions:[{id:"existing",type:"user",emailAddress:"friend@example.com",role:"reader"}]}));
 };
 try{
  const initial=driveSessionVersion();
  await connectDrive();assert.ok(isDriveConnected());assert.ok(driveSessionVersion()>initial);assert.match(requested,/drive.file/);
  await connectDrive(false);assert.match(requested,/drive.file/);assert.ok(isDriveConnected());
  await shareVault(file.id,"FRIEND@example.com","reader","https://travel.example",false);
  assert.equal(requests.filter(r=>r.init.method==="POST").length,0);
  await shareVault(file.id,"friend@example.com","writer","https://travel.example",false);
  assert.equal(requests.at(-1)?.init.method,"PATCH");
  const posts=requests.filter(r=>r.init.method==="POST").length;
  await shareVault(file.id,"friend@example.com","reader","https://travel.example");
  assert.equal(requests.filter(r=>r.init.method==="POST").length,posts+1);
  const sent=new URL(requests.at(-1)!.url);
  assert.equal(sent.hostname,"gmail.googleapis.com");
  mode="mail-failed";await assert.rejects(()=>shareVault(file.id,"friend@example.com","reader","https://travel.example"),/not confirmed as sent.*Gmail API disabled/);
  mode="denied";await assert.rejects(()=>shareVault(file.id,"new@example.com","reader","https://travel.example",false),/outside your organization/);
  mode="expired";await assert.rejects(()=>sharedMembers(file.id),/expired/);assert.equal(isDriveConnected(),false);
  granted="https://www.googleapis.com/auth/drive.appdata";
  await assert.rejects(()=>connectDrive(),/both backup and shared-file/);assert.equal(isDriveConnected(),false);
 }finally{disconnectDrive();globalThis.fetch=previousFetch;Object.assign(globalThis,{window:previousWindow});}
});

import {invitationMime} from "../lib/drive";
test("invitation email prevents header injection and preserves Unicode",()=>{
 assert.throws(()=>invitationMime("friend@example.com\r\nBcc: other@example.com","hi"),/valid email/);
 const mime=Buffer.from(invitationMime("friend@example.com","Bula 🌴"),"base64url").toString();
 assert.equal(Buffer.from(mime.split("\r\n\r\n")[1],"base64").toString(),"Bula 🌴");
});

import "fake-indexeddb/auto";
import {sendSelectedTrips,publishInvitedTrips} from "../lib/trip-sharing";
import {derive,decrypt,encrypt,decryptImportedVault,writeLocalSetting} from "../lib/vault";
import {tripSlice,assertTripEdits} from "../lib/trip-access";
import {emptyVault,vaultSchema,blankBooking} from "../lib/travel";
test("selected sharing excludes private content, persists one catalog, sends one email, and revokes deselected trips",async()=>{
 const oldFetch=globalThis.fetch,oldWindow=globalThis.window;
 const ring=await derive("test passphrase for trip sharing");
 const vault=vaultSchema.parse({version:1,trips:["view","edit","private"].map(id=>({id,name:id,destination:id,notes:id+" secret"})),bookings:[{...blankBooking("private"),title:"Private hotel",start:"2026-12-25T12:00",end:"2026-12-26T12:00"}],artifacts:[]});
 const root={...file,id:"root-trip-test",userPermission:{role:"owner"}};
 type Stored={file:SharedDriveVault;data:unknown;members:{id:string;type:string;emailAddress:string;role:string}[]};
 const entries=new Map<string,Stored>([[root.id,{file:root,data:await encrypt(vault,ring),members:[{id:"whole-grant",type:"user",emailAddress:"friend@example.com",role:"writer"}]}]]);
 let sequence=0,catalogId="",mailCount=0,mailFails=false;
 Object.assign(globalThis,{window:{google:{accounts:{oauth2:{revoke:()=>{},initTokenClient:(config:{callback:(r:{access_token:string})=>void})=>({requestAccessToken:()=>config.callback({access_token:"token"})})}}}}});
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input)),method=init.method??"GET";
  const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
  if(url.pathname.endsWith("/about"))return respond({user:{emailAddress:"owner@example.com"}});
  if(url.hostname==="gmail.googleapis.com"){if(mailFails)return respond({error:{message:"Mail disabled"}},403);mailCount++;return respond({id:"sent-"+mailCount});}
  if(url.searchParams.has("q"))return respond({files:url.searchParams.get("q")!.includes("travelBotCatalog")?(catalogId?[{id:catalogId}]:[]):[{id:"one-folder"}]});
  if(url.searchParams.get("uploadType")==="multipart"){
   const chunks=String(init.body).split("\r\n\r\n"),metadata=JSON.parse(chunks[1].split("\r\n--")[0]),data=JSON.parse(chunks[2].split("\r\n--")[0]);
   assert.ok(JSON.stringify(metadata.parents).includes("one-folder"));
   const id="new-"+(++sequence),created={...root,id,title:metadata.title??metadata.name,etag:'"v1"'};
   entries.set(id,{file:created,data,members:[]});if(metadata.appProperties?.travelBotCatalog)catalogId=id;
   return respond(created);
  }
  const id=url.pathname.match(/files\/([^/]+)/)?.[1],entry=id?entries.get(id):undefined;
  if(!entry)throw new Error("Unexpected request: "+url);
  if(url.pathname.includes("/permissions")){
   if(method==="GET")return respond({permissions:entry.members});
   const permissionId=url.pathname.split("/permissions/")[1];
   if(method==="DELETE")entry.members=entry.members.filter(m=>m.id!==permissionId);
   else if(method==="PATCH"){entry.members.find(m=>m.id===permissionId)!.role=JSON.parse(String(init.body)).role;}
   else entry.members.push({id:"p"+entry.members.length,...JSON.parse(String(init.body))});
   return respond({id:"permission"});
  }
  if(url.searchParams.get("alt")==="media")return respond(entry.data);
  if(url.searchParams.get("fields")==="parents,ownedByMe")return respond({parents:["one-folder"],ownedByMe:true});
  if(url.searchParams.get("uploadType")==="media"){
   if(new Headers(init.headers).get("If-Match")!==entry.file.etag)return respond({},412);
   entry.data=JSON.parse(String(init.body));entry.file={...entry.file,etag:'"v'+(++sequence)+'"'};
  }
  return respond(entry.file);
 };
 try{
  await connectDrive();
  let catalog=await sendSelectedTrips(root,vault,ring,"friend@example.com",{view:"reader",edit:"writer"},"https://travel.example");
  assert.equal(mailCount,1);assert.deepEqual(Object.keys(catalog.trips).sort(),["edit","view"]);
  assert.equal(entries.get(root.id)!.members.length,0);
  assert.equal(entries.get(catalog.trips.view.file.id)!.members[0].role,"reader");
  assert.equal(entries.get(catalog.trips.edit.file.id)!.members[0].role,"writer");
  for(const id of ["view","edit"]){const actual=await decrypt(entries.get(catalog.trips[id].file.id)!.data,"test passphrase for trip sharing");assert.deepEqual(actual.vault,tripSlice(vault,[id]));assert.equal(actual.vault.bookings.length,0);}
  assert.equal(entries.get(catalogId)!.members.length,0,"owner catalog stays private");
  const changed=structuredClone(vault);changed.trips[1].notes="Latest local edit";
  catalog=await sendSelectedTrips(root,changed,ring,"friend@example.com",{view:"reader",edit:"writer"},"https://travel.example");
  assert.equal((await decrypt(entries.get(catalog.trips.edit.file.id)!.data,"test passphrase for trip sharing")).vault.trips[0].notes,"Latest local edit");
  // The full-vault source is older, but sharing never loads it over this device's changes.
  assert.equal(changed.trips[1].notes,"Latest local edit");

  const before=entries.size;
  // Another device discovers the same private catalog instead of duplicating shared trip files.
  await writeLocalSetting("trip-catalog:"+root.id,{trips:{},invites:{}});
  mailFails=true;
  await assert.rejects(()=>sendSelectedTrips(root,vault,ring,"friend@example.com",{edit:"reader"},"https://travel.example"),/not confirmed as sent/);
  mailFails=false;
  catalog=await sendSelectedTrips(root,vault,ring,"friend@example.com",{edit:"reader"},"https://travel.example");
  assert.equal(entries.size,before);assert.equal(mailCount,3);
  assert.equal(entries.get(catalog.trips.view.file.id)!.members.length,0);
  assert.equal(entries.get(catalog.trips.edit.file.id)!.members[0].role,"reader");
  await sendSelectedTrips(root,vault,ring,"friend@example.com",{},"https://travel.example");
  assert.equal(entries.get(catalog.trips.edit.file.id)!.members.length,0);assert.equal(mailCount,3);
 }finally{disconnectDrive();globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow});}
});

test("mixed trip imports preserve ACLs and reject changes to view-only trips",async()=>{
 const ring=await derive("another test vault passphrase");
 const vault={...emptyVault(),trips:[{id:"view",name:"View trip",destination:"Fiji",notes:""},{id:"edit",name:"Edit trip",destination:"",notes:""}]};
 const parts=await Promise.all(vault.trips.map(async t=>({file:{...file,id:t.id,capabilities:{canEdit:t.id==="edit"}},envelope:await encrypt(tripSlice(vault,[t.id]),ring)})));
 const result=await decryptImportedVault({...parts[0].envelope,tripBundle:parts},"",ring);
 assert.equal(result.sources.length,2);assert.deepEqual(result.vault,vault);
 const changed=structuredClone(vault);changed.trips[1].notes="Allowed edit";assert.doesNotThrow(()=>assertTripEdits(vault,changed,result.sources));
 changed.trips[0].notes="Forbidden";assert.throws(()=>assertTripEdits(vault,changed,result.sources),/view only/);
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error("View-only trip attempted upload");};
 try{await publishInvitedTrips(vault,ring,result.sources.filter(s=>!s.file.capabilities.canEdit));}finally{globalThis.fetch=previousFetch;}
 const {parseEnvelope}=await import("../lib/vault");assert.equal(parseEnvelope({...parts[0].envelope,tripBundle:parts}).tripBundle,undefined);
 await assert.rejects(()=>decryptImportedVault({...parts[0].envelope,tripBundle:[parts[0],parts[0]]},"",ring));
});

import {pickSharedFiles,pullInvitation,getSharedVault} from "../lib/drive";
import {sharedTripIds} from "../lib/shared-link";
test("invitation consent is grouped, resumes downloading, and settles on errors or cancellation",async()=>{
 const previousWindow=globalThis.window,previousGoogle=globalThis.google,previousFetch=globalThis.fetch;
 let callback:(data:{action:string;docs?:{id:string}[]})=>void=()=>{},action="picked",selection:string[]|undefined,shown=0,disposed=0,viewIds="",folders=true,multiselect=false;
 const granted=new Set<string>();
 const progress:string[]=[];
 class View{
  setMode(){return this;}setMimeTypes(){return this;}
  setIncludeFolders(value:boolean){folders=value;return this;}setSelectFolderEnabled(value:boolean){assert.equal(value,false);return this;}
  setFileIds(ids:string){viewIds=ids;return this;}
 }
 class Builder{
  setOAuthToken(){return this;}setAppId(){return this;}setDeveloperKey(){return this;}setOrigin(){return this;}addView(){return this;}
  setTitle(title:string){assert.match(title,/click Select/);return this;}
  enableFeature(){multiselect=true;return this;}
  setCallback(cb:typeof callback){callback=cb;return this;}
  build(){return {dispose:()=>{disposed++;},setVisible:()=>{shown++;queueMicrotask(()=>{const ids=selection??viewIds.split(",");if(action==="picked")ids.forEach(id=>granted.add(id));callback({action,docs:ids.map(id=>({id}))});});}};}
 }
 const googleMock={picker:{DocsView:View,PickerBuilder:Builder,DocsViewMode:{LIST:"list"},Feature:{MULTISELECT_ENABLED:"multi"},Action:{PICKED:"picked",CANCEL:"cancel",ERROR:"error"}},accounts:{oauth2:{revoke:()=>{},initTokenClient:(config:{callback:(r:{access_token:string})=>void})=>({requestAccessToken:()=>config.callback({access_token:"test"})})}}};
 Object.assign(globalThis,{google:googleMock,window:{google:googleMock,location:{origin:"https://travel.example"}}});
 const encrypted={...envelope,salt:btoa("1234567890123456"),iv:btoa("123456789012")};
 globalThis.fetch=async input=>{
  const url=new URL(String(input)),id=url.pathname.split("/").at(-1)!;
  if(!granted.has(id))return new Response("{}",{status:404});
  return new Response(JSON.stringify(url.searchParams.has("alt")?(id==="invite"?{format:"travel-trip-collection",version:1,files:["trip-a","trip-b"]}:encrypted):{...file,id}));
 };
 try{
  await connectDrive();
  const link=sharedVaultLink("https://travel.example","invite",["trip-a","trip-b"]);
  assert.deepEqual(sharedTripIds(new URL(link).hash),["trip-a","trip-b"]);
  assert.deepEqual(sharedTripIds("#tripFiles=bad%2Fid"),[]);
  const open=()=>loadInvitedVault("invite",{metadata:getSharedVault,download:id=>pullInvitation(id,message=>progress.push(message)),authorize:async id=>(await pickSharedFiles([id,...sharedTripIds(new URL(link).hash)],message=>progress.push(message),[id]))?.[0]??null});
  const result=await open();
  assert.equal(shown,1);assert.equal(disposed,1);assert.equal(folders,false);assert.equal(multiselect,true);
  assert.deepEqual(result?.envelope.tripBundle?.map(part=>part.file.id),["trip-a","trip-b"]);
  assert.ok(progress.some(message=>message.includes("2 of 2")));
  await open();assert.equal(shown,1,"already approved files need no picker");
  granted.clear();granted.add("invite");
  await pullInvitation("invite");assert.equal(shown,2,"old invitations batch the remaining trip approvals");
  action="error";await assert.rejects(()=>pickSharedFiles(["invite"]),/Google could not approve/);
  action="cancel";assert.equal(await pickSharedFiles(["invite"]),null);
  action="picked";selection=["wrong-file"];await assert.rejects(()=>pickSharedFiles(["invite"]),/Select all/);
  selection=["trip-a"];await assert.rejects(()=>pickSharedFiles(["trip-a","trip-b"]),/Select all/);
  selection=["invite"];assert.deepEqual(await pickSharedFiles(["invite","revoked-trip"],undefined,["invite"]),["invite"],"outdated link hints cannot prevent opening the current invitation");
  assert.equal(disposed,shown);
 }finally{disconnectDrive();Object.assign(globalThis,{window:previousWindow,google:previousGoogle});globalThis.fetch=previousFetch;}
});

import {listBackups} from "../lib/drive";
test("cross-device discovery includes older pages and only the signed-in owner's copies",async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
 Object.assign(globalThis,{window:{google:{accounts:{oauth2:{revoke:()=>{},initTokenClient:(config:{callback:(r:{access_token:string})=>void})=>({requestAccessToken:()=>config.callback({access_token:"test"})})}}}}});
 const calls:URL[]=[];
 globalThis.fetch=async input=>{
  const url=new URL(String(input));calls.push(url);
  assert.match(url.searchParams.get("q")!,/'me' in owners/);
  assert.match(url.searchParams.get("fields")!,/mimeType/);
  const id=url.searchParams.get("spaces")+"-"+(url.searchParams.has("pageToken")?"older-pc":"newer-phone");
  return new Response(JSON.stringify({files:[{id,name:id+".travel",modifiedTime:"2026-09-12",mimeType:"application/json"},{id:"doc-"+id,name:"my-travel-bot-copy.travel",modifiedTime:"2026-09-12",mimeType:"application/vnd.google-apps.document"}],...(!url.searchParams.has("pageToken")?{nextPageToken:"page2"}:{})}));
 };
 try{await connectDrive();const copies=await listBackups(true);assert.equal(copies.length,4);assert.equal(calls.length,4);assert.ok(copies.some(file=>file.id==="drive-older-pc"));}
 finally{disconnectDrive();globalThis.fetch=previousFetch;Object.assign(globalThis,{window:previousWindow});}
});

import {restoreDriveSession} from "../lib/drive";
test("Drive reuses valid sessions across reloads, honors Google expiry, and disconnect does not revoke consent",async()=>{
 const previousWindow=globalThis.window,previousStorage=globalThis.sessionStorage;
 const values=new Map<string,string>();let requests=0,revocations=0,prompt:string|undefined;
 Object.assign(globalThis,{sessionStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)},window:{google:{accounts:{oauth2:{revoke:()=>{revocations++;},initTokenClient:(config:{callback:(r:{access_token:string;expires_in:number})=>void})=>({requestAccessToken:(options:{prompt:string})=>{requests++;prompt=options.prompt;config.callback({access_token:"session-token",expires_in:3600});}})}}}}});
 try{
  disconnectDrive();const before=Date.now();await connectDrive();
  const saved=values.get("travel-drive-session")!,session=JSON.parse(saved);
  assert.ok(session.expires>=before+3599000);assert.equal(prompt,"");
  await connectDrive();assert.equal(requests,1);
  disconnectDrive();assert.equal(revocations,0);assert.equal(values.size,0);
  values.set("travel-drive-session",saved);restoreDriveSession();assert.ok(isDriveConnected());await connectDrive();assert.equal(requests,1);
  disconnectDrive();values.set("travel-drive-session",JSON.stringify({...session,expires:Date.now()-1}));restoreDriveSession();assert.equal(isDriveConnected(),false);
 }finally{disconnectDrive();Object.assign(globalThis,{window:previousWindow,sessionStorage:previousStorage});}
});

import {readLatestDriveDraft,publishLiveDraft,rememberDriveBase} from "../lib/drive-live-sync";
test("live vault refresh accepts remote edits and conditional publication refuses a concurrent save",async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
 Object.assign(globalThis,{window:{google:{accounts:{oauth2:{initTokenClient:(config:{callback:(r:{access_token:string})=>void})=>({requestAccessToken:()=>config.callback({access_token:"live-test"})})}}}}});
 const {derive,encrypt,readLocalSetting}=await import("../lib/vault");const {emptyVault}=await import("../lib/travel");
 const ring=await derive("two computers cannot overwrite"),base=emptyVault();base.trips=[{id:"one",name:"Original",destination:"",notes:""},{id:"two",name:"Second",destination:"",notes:""}];
 const remote=structuredClone(base);remote.trips[0].name="PC changed this";
 const local=structuredClone(base);local.trips[1].notes="Phone local edit";
 const original=await encrypt(base,ring);await rememberDriveBase(original);
 let liveEnvelope=await encrypt(remote,ring),etag='"2"',writes=0;
 const reads:string[]=[];let partCount=0,failPart=false;
 globalThis.fetch=async(input,init={})=>{
  const url=String(input),metadata={...file,id:"live",etag,userPermission:{role:"owner"}};
  if(!init.method||init.method==="GET")reads.push(url);
  if(init.method==="POST"&&url.includes("uploadType=multipart"))return failPart?new Response("upload interrupted",{status:500}):new Response(JSON.stringify({...metadata,id:"part-"+(++partCount)}));
  if(url.includes("drive/v3/files?q="))return new Response(JSON.stringify({files:[{id:"folder"}]}));
  if(init.method==="PUT"){
   writes++;if(new Headers(init.headers).get("If-Match")!==etag)return new Response("",{status:412});
   liveEnvelope=JSON.parse(String(init.body));etag='"4"';return new Response(JSON.stringify({...metadata,etag}));
  }
  return new Response(JSON.stringify(url.includes("?q=")?{items:[metadata]}:url.includes("alt=media")?liveEnvelope:metadata));
 };
 try{
  await connectDrive();const latest=await readLatestDriveDraft(local,ring);
  assert.equal(latest.vault.trips[0].name,"PC changed this");assert.equal(latest.vault.trips[1].notes,"Phone local edit");
  etag='"3"';await assert.rejects(()=>publishLiveDraft(latest,ring),/Someone changed/);
  assert.equal((await readLocalSetting<Envelope>("drive-live-base:"+ring.salt))?.ciphertext,original.ciphertext);
  const fresh=await readLatestDriveDraft(local,ring);
  const prepared=await encrypt(fresh.vault,ring);
  const {saveDriveDraft,driveDraftMarker}=await import("../lib/drive-save-state");
  let checkpointMarker="";
  await saveDriveDraft(prepared,{read:async()=>prepared,publish:()=>publishLiveDraft(fresh,ring,prepared),checkpoint:async saved=>{checkpointMarker=saved.marker;}});
  assert.equal(writes,2,"save publishes the index once after the earlier rejected write");
  assert.equal(checkpointMarker,driveDraftMarker(prepared));
  assert.equal((await readLocalSetting<Envelope>("drive-live-base:"+ring.salt))?.ciphertext,prepared.ciphertext,"reuse the already encrypted local draft as the merge base");
  reads.length=0;
  const warm=await readLatestDriveDraft(fresh.vault,ring);
  assert.equal(reads.length,1,"unchanged live file requires only one fresh metadata request");
  assert.ok(!reads[0].includes("alt=media")&&!reads[0].includes("?q="));
  assert.deepEqual(warm.vault,fresh.vault);
  const edited=structuredClone(fresh.vault);edited.trips[0].notes="New remote edit";
  liveEnvelope=await encrypt(edited,ring);etag='"5"';reads.length=0;
  const changed=await readLatestDriveDraft(fresh.vault,ring);
  assert.equal(changed.vault.trips[0].notes,"New remote edit");
  assert.equal(reads.filter(url=>url.includes("alt=media")).length,1,"changed revision downloads once");
  assert.equal(reads.length,3,"metadata before and after download guards racing saves");
  failPart=true;
  const beforeFailure=liveEnvelope.ciphertext,priorWrites=writes;
  await assert.rejects(()=>publishLiveDraft(changed,ring),/500|upload interrupted|Drive/);
  assert.equal(writes,priorWrites,"failed part upload never publishes a new index");
  assert.equal(liveEnvelope.ciphertext,beforeFailure);
 }finally{disconnectDrive();globalThis.fetch=previousFetch;Object.assign(globalThis,{window:previousWindow});}
});


import {prepareDriveParts,readDriveParts} from "../lib/drive-parts";
test("linked vault files reuse unchanged trips and large attachments, restore offline, and retain deletion markers",async()=>{
 const {derive,encrypt}=await import("../lib/vault");const {emptyVault}=await import("../lib/travel");
 const ring=await derive("linked parts regression test"),vault=emptyVault();
 vault.trips=[{id:"a",name:"Fiji",destination:"Fiji",notes:""},{id:"b",name:"Los Angeles",destination:"LA",notes:""}];
 vault.artifacts=[{id:"pdf",tripId:"a",bookingId:"",name:"Ticket.pdf",type:"application/pdf",data:"data:application/pdf;base64,"+"A".repeat(400000),size:300000,added:"2026-09-13"}];
 const files=new Map<string,Envelope>();let bytes=0,uploads=0;
 const create=async(e:Envelope)=>{const id="chunk-"+crypto.randomUUID();files.set(id,e);uploads++;bytes+=JSON.stringify(e).length;return {id};};
 const initial=await prepareDriveParts(vault,ring,null,create);
 assert.equal(uploads,3);
 const totalBytes=bytes;
 const edited=structuredClone(vault);edited.trips[1].notes="Updated itinerary";
 uploads=0;bytes=0;
 const next=await prepareDriveParts(edited,ring,initial.index,create);
 assert.equal(uploads,1,"only the edited trip is uploaded");
 assert.ok(bytes+JSON.stringify(next.document).length<totalBytes/100,"small edit transfers under 1% of the initial attachment-heavy vault");
 assert.equal(next.index.parts.find(p=>p.kind==="artifact")?.id,initial.index.parts.find(p=>p.kind==="artifact")?.id);
 const restored=await readDriveParts(next.document,ring,async()=>{throw new Error("unchanged immutable parts should come from encrypted cache");});
 assert.deepEqual(restored.vault,edited);
 const {writeLocalSetting}=await import("../lib/vault");
 for(const part of next.index.parts)await writeLocalSetting("drive-part:"+ring.salt+":"+part.id,null);
 let downloads=0;
 assert.deepEqual((await readDriveParts(next.document,ring,async id=>{downloads++;return files.get(id)!;})).vault,edited);
 assert.equal(downloads,3,"a new device reads all linked files on its first load");
 downloads=0;
 await readDriveParts(next.document,ring,async id=>{downloads++;return files.get(id)!;});
 assert.equal(downloads,0,"later loads reuse the encrypted files");
 assert.deepEqual((await readDriveParts(await encrypt(vault,ring),ring,async()=>{throw new Error("legacy snapshot");})).vault,vault);
 const deleted={...edited,trips:edited.trips.filter(t=>t.id!=="a"),artifacts:[],deletedTripIds:["a"]};
 uploads=0;const deletion=await prepareDriveParts(deleted,ring,next.index,create);
 assert.equal(uploads,0,"deletion only changes the index");
 assert.deepEqual((await readDriveParts(deletion.document,ring,async id=>files.get(id)!)).vault,deleted);
});
test("missing or damaged linked files fail without producing a partial vault",async()=>{
 const {derive,encryptPayload}=await import("../lib/vault");
 const ring=await derive("missing linked data test");
 const document=await encryptPayload({format:"travel-vault-index",version:1,bookingOrder:[],parts:[{kind:"trip",key:"a",id:"unavailable",hash:"0".repeat(64)}]},ring);
 await assert.rejects(()=>readDriveParts(document,ring,async()=>{throw new Error("missing file");}),/missing file/);
 await assert.rejects(()=>readDriveParts(document,ring,async()=>encryptPayload({trip:{id:"a"},bookings:[]},ring)),/damaged or changed/);
});

test("sharing discovery excludes internal linked files before Drive applies its page limit",async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
 Object.assign(globalThis,{window:{google:{accounts:{oauth2:{initTokenClient:(config:{callback:(r:{access_token:string})=>void})=>({requestAccessToken:()=>config.callback({access_token:"listing-test"})})}}}}});
 let query="";
 globalThis.fetch=async input=>{query=new URL(String(input)).searchParams.get("q")??"";return new Response(JSON.stringify({items:[]}));};
 try{
  await connectDrive();const {listSharedVaults}=await import("../lib/drive");
  assert.deepEqual(await listSharedVaults(),[]);
  assert.match(query,/not title contains 'my-travel-bot-shared-part-'/);
  assert.match(query,/not title contains 'my-travel-bot-shared-live-'/);
 }finally{disconnectDrive();globalThis.fetch=previousFetch;Object.assign(globalThis,{window:previousWindow});}
});
