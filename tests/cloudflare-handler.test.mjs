import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerHandler} from '../cloudflare/handler.mjs';
const request = path => new Request('https://my-travel-bot.aehrath.workers.dev'+path);
test('unauthorized CSS and JS requests never reach assets or application',async()=>{
 const fail=()=>{throw new Error('Must not reach assets or app');};
 const worker=createWorkerHandler({fetch:fail},async()=>new Response('Forbidden',{status:403}));
 for(const path of ['/','/_next/static/css/app.css','/_next/static/chunks/app.js'])assert.equal((await worker.fetch(request(path),{ASSETS:{fetch:fail}},{})).status,403);
});
test('authorized assets retain their body and content type; missing bundles stay 404',async()=>{
 const worker=createWorkerHandler({fetch:()=>{throw new Error('Must serve assets directly');}},async r=>r);
 for(const [path,type,body] of [['/_next/static/css/app.css','text/css','body{color:green}'],['/_next/static/chunks/app.js','text/javascript','console.log(1)']]){
  const response=await worker.fetch(request(path),{ASSETS:{fetch:async()=>new Response(body,{headers:{'Content-Type':type}})}},{});
  assert.equal(response.headers.get('Content-Type'),type);assert.equal(await response.text(),body);
 }
 assert.equal((await worker.fetch(request('/_next/static/missing.js'),{ASSETS:{fetch:async()=>new Response(null,{status:404})}},{})).status,404);
});
test('page and API requests still reach the app with authorized identity',async()=>{
 const worker=createWorkerHandler({fetch:async r=>new Response(r.headers.get('test-identity'))},async r=>new Request(r,{headers:{'test-identity':'owner'}}));
 const env={ASSETS:{fetch:async()=>new Response(null,{status:404})}};
 const page=await worker.fetch(request('/'),env,{});
 assert.equal(await page.text(),'owner');assert.equal(page.headers.get('X-Travel-App-Shell'),'1');
 const api=await worker.fetch(new Request('https://example.com/api/flights',{method:'POST'}),env,{});
 assert.equal(await api.text(),'owner');
});

import {authorizeCloudflareRequest} from '../cloudflare/access-guard.mjs';
test('retained Access guard verifies signed identity and rejects invalid claims',async()=>{
 const {publicKey,privateKey}=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const env={CF_ACCESS_TEAM_DOMAIN:'https://hipergames.cloudflareaccess.com',CF_ACCESS_AUD:'test-audience',CF_ACCESS_EMAIL:'owner@example.com'};
 const now=Math.floor(Date.now()/1000);
 const claims={iss:env.CF_ACCESS_TEAM_DOMAIN,aud:env.CF_ACCESS_AUD,email:env.CF_ACCESS_EMAIL,sub:'owner-id',iat:now,exp:now+300};
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 async function signed(payload){
  const body=encode({alg:'RS256',typ:'JWT'})+'.'+encode(payload);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(body));
  return new Request('https://example.com/',{headers:{'cf-access-jwt-assertion':body+'.'+Buffer.from(signature).toString('base64url'),'oai-authenticated-user-id':'forged'}});
 }
 const authorized=await authorizeCloudflareRequest(await signed(claims),env,publicKey);
 assert.ok(authorized instanceof Request);assert.equal(authorized.headers.get('oai-authenticated-user-id'),'owner-id');
 const collaboratorEnv={...env,CF_ACCESS_EMAIL:"owner@example.com, FRIEND@example.com "};
 const collaborator=await authorizeCloudflareRequest(await signed({...claims,email:"friend@example.com",sub:"friend-id"}),collaboratorEnv,publicKey);
 assert.ok(collaborator instanceof Request);assert.equal(collaborator.headers.get('oai-authenticated-user-id'),'friend-id');
 assert.equal((await authorizeCloudflareRequest(await signed({...claims,email:"intruder@example.com"}),collaboratorEnv,publicKey)).status,403);
 for(const change of [{email:'other@example.com'},{aud:'other-audience'},{iss:'https://other.cloudflareaccess.com'},{exp:now-60}]){
  const denied=await authorizeCloudflareRequest(await signed({...claims,...change}),env,publicKey);
  assert.equal(denied.status,403);
 }
 assert.equal((await authorizeCloudflareRequest(request('/'),env,publicKey)).status,403);
 assert.equal((await authorizeCloudflareRequest(request('/'),{},publicKey)).status,503);
});
