/* The production build injects immutable asset URLs here. No user data is cached. */
const ASSETS = /* PRECACHE */ [];
const CACHE = "travel-shell-v1";
self.addEventListener("install", event => {
 event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS);
  const shell = await fetch("/", {cache:"reload"});
  if (!shell.ok || shell.redirected) throw new Error("Authenticated app shell unavailable");
  await cache.put("/", shell);
  await self.skipWaiting();
 })());
});
self.addEventListener("activate", event => {
 event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith("travel-shell-")&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());
});
self.addEventListener("fetch", event => {
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin)return;
 if(event.request.mode==="navigate"&&url.pathname==="/"){
  event.respondWith(fetch(event.request).then(async response=>{if(response.ok&&!response.redirected)(await caches.open(CACHE)).put("/",response.clone());return response;}).catch(async()=>await caches.match("/")||Response.error()));
 }else if(ASSETS.includes(url.pathname)){
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).catch(async()=>await caches.match(url.pathname)||Response.error())));
 }
});
