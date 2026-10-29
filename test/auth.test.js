import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import WebSocket from 'ws';
import { createGameServer } from '../server.js';
import { createAccountStore } from '../auth/accounts.js';

async function setup(t, configured=true) {
  const dir=await mkdtemp(join(tmpdir(),'subtrpg-auth-')),file=join(dir,'accounts.json');
  let calls=[];
  const mockFetch=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/token'))return new Response(JSON.stringify({access_token:'provider-access'}));
    if(url.includes('googleapis.com'))return new Response(JSON.stringify({sub:'google-subject',name:'구글유저'}));
    return new Response(JSON.stringify({id:12345,kakao_account:{profile:{nickname:'카카오유저'}}}));
  };
  const game=createGameServer({auth:{baseUrl:'https://game.test',accountsFile:file,providers:configured?{google:{clientId:'google-id',clientSecret:'secret'},kakao:{clientId:'kakao-id',clientSecret:'secret'}}:{},fetch:mockFetch}});
  await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+game.server.address().port;
  t.after(async()=>{await game.close();await rm(dir,{recursive:true,force:true});});
  const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
  async function signIn(provider='google') {
    const verifier='a'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url');
    const start=await request('/auth/start/'+provider+'?challenge='+challenge);
    assert.equal(start.status,302);const target=new URL(start.headers.get('location'));
    const binding=start.headers.get('set-cookie').split(';')[0];
    const callback=await request('/auth/callback/'+provider+'?state='+target.searchParams.get('state')+'&code=provider-code',{headers:{Cookie:binding}});
    assert.equal(callback.status,302);const code=new URL(callback.headers.get('location')).searchParams.get('code');
    const exchange=await request('/auth/app-session',{method:'POST',body:new URLSearchParams({code,verifier})});
    assert.equal(exchange.status,303);const cookie=exchange.headers.get('set-cookie').split(';')[0];
    const session=await (await request('/api/session',{headers:{Cookie:cookie,'X-Client-Mode':'app'}})).json();
    return {cookie,session,code,verifier};
  }
  return {...game,request,signIn,calls,file,base};
}
test('providers require real configuration and APK proof; invalid state is rejected',async t=>{
  const {request}=await setup(t,false);
  assert.equal((await request('/auth/start/google?challenge='+'a'.repeat(43))).status,503);
  const session=await(await request('/api/session')).json();assert.equal(session.account,null);assert.equal(session.providers.google,false);
});
test('Google/Kakao create separate stable IDs; settings persist; web stays guest even with app cookie',async t=>{
  const {request,signIn,calls,file}=await setup(t);
  assert.equal((await request('/auth/start/google')).status,400);
  assert.equal((await request('/auth/callback/google?state=forged&code=fake')).status,400);
  const a=await signIn(),b=await signIn('kakao'),again=await signIn();
  assert.equal(a.session.account.id,again.session.account.id);assert.notEqual(a.session.account.id,b.session.account.id);
  assert.ok(calls.some(x=>x.url==='https://oauth2.googleapis.com/token'&&x.options.body.get('code_verifier')));
  assert.ok(calls.some(x=>x.url==='https://kauth.kakao.com/oauth/token'));
  const guest=await(await request('/api/session',{headers:{Cookie:a.cookie}})).json();assert.equal(guest.mode,'web');assert.equal(guest.account,null);assert.equal(guest.csrf,null);
  const put=body=>request('/api/settings',{method:'PUT',headers:{Cookie:a.cookie,'X-Client-Mode':'app',Origin:'https://game.test','X-CSRF-Token':a.session.csrf,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await put({controlScale:1.25,showNames:false})).status,200);
  const persisted=createAccountStore(file).find(a.session.account.id);assert.equal(persisted.settings.controlScale,1.25);assert.equal(persisted.settings.showNames,false);
  assert.equal((await put({controlScale:100,showNames:true})).status,400);
  assert.equal((await request('/api/settings',{method:'PUT',headers:{Cookie:a.cookie,'X-Client-Mode':'app',Origin:'https://evil.test','X-CSRF-Token':a.session.csrf},body:'{}'})).status,403);
  assert.equal((await request('/api/settings',{method:'PUT',body:'{}'})).status,401);
  assert.equal((await request('/auth/app-session',{method:'POST',body:new URLSearchParams({code:a.code,verifier:a.verifier})})).status,400);
});
test('OAuth state requires its browser binding and grant requires APK verifier',async t=>{
  const {request}=await setup(t);const challenge=createHash('sha256').update('b'.repeat(43)).digest('base64url');
  const start=await request('/auth/start/kakao?challenge='+challenge),state=new URL(start.headers.get('location')).searchParams.get('state');
  assert.equal((await request('/auth/callback/kakao?state='+state+'&code=fake')).status,400);
  const callback=await request('/auth/callback/kakao?state='+state+'&code=real',{headers:{Cookie:start.headers.get('set-cookie').split(';')[0]}});
  const code=new URL(callback.headers.get('location')).searchParams.get('code');
  assert.equal((await request('/auth/app-session',{method:'POST',body:new URLSearchParams({code,verifier:'x'.repeat(43)})})).status,400);
  assert.equal((await request('/auth/app-session',{method:'POST',body:new URLSearchParams({code,verifier:'b'.repeat(43)})})).status,303);
  assert.equal((await request('/auth/callback/kakao?state='+state+'&code=real',{headers:{Cookie:start.headers.get('set-cookie').split(';')[0]}})).status,400);
});
test('app WebSockets require login; web ignores app identity; logout revokes API session',async t=>{
  const {base,request,signIn}=await setup(t);const {cookie,session}=await signIn();
  const denied=new WebSocket(base.replace('http:','ws:')+'/ws?client=app');
  assert.equal(await new Promise(r=>denied.on('close',r)),1008);
  async function create(mode){
    const ws=new WebSocket(base.replace('http:','ws:')+'/ws?client='+mode,{headers:{Cookie:cookie}});
    await new Promise(r=>ws.once('message',r));
    const state=new Promise(r=>ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='room.state')r(m.room);}));
    ws.send(JSON.stringify({v:1,type:'room.create',name:'이름'}));const room=await state;ws.close();return room.players[0];
  }
  const app=await create('app'),web=await create('web');assert.equal(app.status.classificationCode,session.account.id);assert.equal(web.status.classificationCode,web.id);
  assert.equal((await request('/api/logout',{method:'POST',headers:{Cookie:cookie,'X-Client-Mode':'app',Origin:'https://game.test','X-CSRF-Token':session.csrf}})).status,200);
  const after=await(await request('/api/session',{headers:{Cookie:cookie,'X-Client-Mode':'app'}})).json();assert.equal(after.account,null);
});
