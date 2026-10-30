import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer } from '../server.js';

async function setup(t, options) {
  const game = createGameServer(options);
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${game.server.address().port}/ws`;
  t.after(() => game.close());
  async function client() {
    const ws = new WebSocket(url), inbox = [], waiting = [];
    ws.on('message', raw => { const m = JSON.parse(raw); const index = waiting.findIndex(w => w.type === m.type); if (index >= 0) waiting.splice(index, 1)[0].resolve(m); else inbox.push(m); });
    const next = type => {
      const index = inbox.findIndex(m => m.type === type);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise((resolve, reject) => { const waiter = { type, resolve: m => { clearTimeout(timer); resolve(m); } }; const timer = setTimeout(() => { waiting.splice(waiting.indexOf(waiter), 1); reject(new Error(`Timeout: ${type}`)); }, 2000); waiting.push(waiter); });
    };
    const welcome = await next('welcome');
    let seq = 0;
    return { ws, next, id: welcome.playerId, async command(type, data = {}, event = 'ack') { const requestId = String(++seq); ws.send(JSON.stringify({ v: 1, type, requestId, ...data })); return next(event); } };
  }
  return { ...game, client, url };
}

test('four clients: capacity, authority, readiness, start and late join', async t => {
  const { client } = await setup(t);
  const [a,b,c,d,e] = await Promise.all(Array.from({length:5}, client));
  await a.command('room.create', {name:'방장'}); const {room} = await a.next('room.state');
  for (const p of [b,c,d]) await p.command('room.join', {name:'참가자',code:room.code});
  assert.equal((await d.next('room.state')).room.players.length,4);
  assert.equal((await e.command('room.join',{name:'초과',code:room.code},'error')).code,'ROOM_FULL');
  assert.equal((await b.command('room.start',{},'error')).code,'FORBIDDEN');
  assert.equal((await a.command('room.ready',{ready:true},'error')).code,'HOST_CANNOT_READY');
  assert.equal((await a.command('room.start',{},'error')).code,'NOT_READY');
  assert.equal((await b.command('room.ready',{ready:'true'},'error')).code,'INVALID_READY');
  await b.command('room.ready',{ready:true}); await b.command('room.ready',{ready:false});
  assert.equal((await a.command('room.start',{},'error')).code,'NOT_READY');
  for (const p of [b,c,d]) await p.command('room.ready',{ready:true});
  await a.command('room.start');
  for (const p of [a,b,c,d]) { let state; do {state = await p.next('room.state');} while(state.room.phase !== 'started'); assert.equal(state.room.players.length,4); }
  assert.equal((await e.command('room.join',{name:'늦은 참가',code:room.code},'error')).code,'GAME_STARTED');
  assert.equal((await b.command('room.ready',{ready:false},'error')).code,'GAME_STARTED');
});
test('guest departure affects only guest; host leave closes room for everyone', async t => {
  const {client,rooms} = await setup(t); const a=await client(),b=await client();
  await a.command('room.create',{name:'A'}); const {room}=await a.next('room.state');
  await b.command('room.join',{name:'B',code:room.code}); await b.next('room.state');
  await b.command('room.leave'); await b.next('room.left'); assert.equal(rooms.get(room.code).players.size,1);
  await b.command('room.join',{name:'B',code:room.code});
  await a.command('room.leave');
  for(const p of [a,b]) assert.equal((await p.next('room.closed')).message,'방이 해제되었습니다.');
  assert.equal(rooms.size,0);
  assert.equal((await b.command('room.join',{name:'B',code:room.code},'error')).code,'ROOM_NOT_FOUND');
});
test('disconnect removes guests and dissolves host room; clients can create again', async t => {
  const {client,rooms}=await setup(t);const a=await client(),b=await client(),c=await client();
  await a.command('room.create',{name:'A'});const {room}=await a.next('room.state');
  await b.command('room.join',{name:'B',code:room.code});await c.command('room.join',{name:'C',code:room.code});
  b.ws.terminate();
  let state;do {state=await a.next('room.state');}while(state.room.players.length!==2);
  a.ws.terminate();await c.next('room.closed');assert.equal(rooms.size,0);
  await c.command('room.create',{name:'C'});assert.equal(rooms.size,1);
});
test('solo start, malformed messages, duplicate membership, invalid codes and names', async t => {
  const {client}=await setup(t);const a=await client();
  a.ws.send('{'); assert.equal((await a.next('error')).code,'BAD_MESSAGE');
  a.ws.send('null'); assert.equal((await a.next('error')).code,'BAD_MESSAGE');
  a.ws.send(JSON.stringify({v:2,type:'room.create'}));assert.equal((await a.next('error')).code,'BAD_MESSAGE');
  assert.equal((await a.command('room.leave',{},'error')).code,'NOT_IN_ROOM');
  assert.equal((await a.command('room.create',{name:' '},'error')).code,'INVALID_NAME');
  assert.equal((await a.command('room.join',{name:'A',code:'???'},'error')).code,'INVALID_CODE');
  assert.equal((await a.command('invented',{},'error')).code,'UNKNOWN_TYPE');
  await a.command('room.create',{name:'<script>alert(1)</script>'.slice(0,20)});
  assert.equal((await a.command('room.create',{name:'A'},'error')).code,'ALREADY_IN_ROOM');
  await a.command('room.start');let state;do{state=await a.next('room.state');}while(state.room.phase!=='started');
});
test('heartbeat expires unresponsive host', async t => {
  const {client,rooms}=await setup(t,{heartbeatMs:30});const a=await client(),b=await client();
  await a.command('room.create',{name:'A'});const {room}=await a.next('room.state');await b.command('room.join',{name:'B',code:room.code});
  a.ws._autoPong=false;await b.next('room.closed');assert.equal(rooms.size,0);
});
test('HTTP serves only public files and health', async t => {
  const {url}=await setup(t);const base=url.replace('ws:','http:').replace('/ws','');
  for(const path of ['/','/app.js','/viewport.js','/motion.js','/style.css','/health'])assert.equal((await fetch(base+path)).status,200);
  assert.equal((await fetch(base+'/server.js')).status,404);
});
test('simultaneous joins never exceed four players', async t => {
  const {client,rooms}=await setup(t); const a=await client();
  await a.command('room.create',{name:'A'});const {room}=await a.next('room.state');
  const guests=await Promise.all(Array.from({length:8},client));
  for(const guest of guests) guest.ws.send(JSON.stringify({v:1,type:'room.join',name:'동시 참가',code:room.code}));
  const results=await Promise.all(guests.map(guest=>new Promise(resolve=>{guest.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='ack'||m.type==='error')resolve(m);});})));
  assert.equal(results.filter(m=>m.type==='ack').length,3);
  assert.equal(results.filter(m=>m.code==='ROOM_FULL').length,5);
  assert.equal(rooms.get(room.code).players.size,4);
});
test('foreign browser origins and oversized payloads are rejected', async t => {
  const {url,client}=await setup(t);
  const foreign=new WebSocket(url,{origin:'https://untrusted.example'});
  const code=await new Promise((resolve,reject)=>{foreign.on('close',resolve);foreign.on('error',reject);});
  assert.equal(code,1008);
  const a=await client();const closed=new Promise(resolve=>a.ws.once('close',resolve));
  a.ws.send('x'.repeat(5000));assert.equal(await closed,1009);
});

async function startedPair(t, options) {
  const game = await setup(t, options), a = await game.client(), b = await game.client();
  await a.command('room.create', {name:'방장'}); const {room} = await a.next('room.state');
  await b.command('room.join', {name:'참가자',code:room.code});
  await b.command('room.ready', {ready:true}); await a.command('room.start');
  return {...game,a,b,code:room.code};
}
test('playing host leaves alone, successor can move, room disappears only after last departure', async t => {
  const {a,b,rooms,code} = await startedPair(t);
  await a.command('room.leave'); await a.next('room.left');
  assert.equal(rooms.get(code).phase,'started'); assert.equal(rooms.get(code).hostId,b.id);
  assert.equal(rooms.get(code).players.size,1);
  const p = rooms.get(code).players.get(b.id), x = p.x;
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0,action:'A',playerId:a.id}));
  let state; do {state = await b.next('game.state');} while(state.room.players[0].x <= x);
  assert.equal(state.room.players[0].id,b.id); assert.equal(state.room.players[0].action,'A');
  await a.command('room.create',{name:'다른 방'});
  assert.equal(rooms.has(code),true);
  await b.command('room.leave'); await b.next('room.left'); assert.equal(rooms.has(code),false);
});
test('playing host disconnect and heartbeat timeout preserve the remaining game', async t => {
  const {a,b,rooms,code} = await startedPair(t,{heartbeatMs:50});
  a.ws._autoPong = false;
  let state; do {state = await b.next('game.state');} while(state.room.players.length !== 1);
  assert.equal(state.room.phase,'started'); assert.equal(rooms.get(code).hostId,b.id);
  b.ws.terminate();
  await new Promise(resolve => b.ws.once('close',resolve));
  await new Promise(resolve => setImmediate(resolve));
  // Server's close frame may be processed on the next event loop turn.
  for(let i=0; i<20 && rooms.has(code); i++) await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(rooms.has(code),false);
});
test('movement is validated, bounded, diagonal normalized, stale input stops', async t => {
  const {a,b,rooms,code} = await startedPair(t);
  for (const input of [{x:2,y:0},{x:'1',y:0},{x:0,y:0,action:'INVALID'}]) {
    assert.equal((await b.command('game.input',input,'error')).code,'INVALID_INPUT');
  }
  const p = rooms.get(code).players.get(b.id);
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:1}));
  let state; do {state = await b.next('game.state');} while(p.inputAt === 0);
  assert.ok(Math.abs(Math.hypot(p.input.x,p.input.y)-1)<1e-9);
  const host = rooms.get(code).players.get(a.id); assert.equal(host.x,-60);
  for(let i=0;i<12;i++) await b.next('game.state');
  const stopped = p.x; await b.next('game.state'); assert.equal(p.x,stopped);
  assert.deepEqual(p.input,{x:0,y:0});
  p.x=1500; p.y=1500; b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:1}));
  await b.next('game.state'); await b.next('game.state'); assert.ok(p.x<=1500 && p.y<=1500);
});
test('input is rejected before game start', async t => {
  const {client}=await setup(t);const a=await client();
  assert.equal((await a.command('game.input',{x:0,y:0},'error')).code,'NOT_IN_ROOM');
  await a.command('room.create',{name:'A'});
  assert.equal((await a.command('game.input',{x:0,y:0},'error')).code,'GAME_NOT_STARTED');
});

test('world snapshots share player/NPC/enemy stats; stun/death and speed use server status', async t => {
  const {createWorldObject}=await import('../game/status.js');
  const {a,b,rooms,code}=await startedPair(t),room=rooms.get(code),p=room.players.get(b.id);
  const npc=createWorldObject({objectType:'npc',classificationCode:'NPC001',name:'주민',x:300,maxSkillResource:5,currentSkillResource:2});
  const enemy=createWorldObject({objectType:'enemy',classificationCode:'ENEMY001',name:'몬스터',x:400});
  room.objects.set(npc.id,npc);room.objects.set(enemy.id,enemy);
  let state;do{state=await b.next('game.state');}while(state.room.objects.length!==4);
  assert.equal(state.room.players.find(x=>x.id===b.id).status.moveSpeed,2);
  assert.equal(state.room.players.find(x=>x.id===b.id).status.classificationCode,b.id);
  assert.equal(state.room.objects.find(x=>x.id===npc.id).status.objectType,'npc');
  assert.equal(state.room.objects.find(x=>x.id===enemy.id).status.objectType,'enemy');
  assert.equal(state.room.players.find(x=>x.id===b.id).status.nearestEnemyId,enemy.id);
  assert.equal('skillDeckCode' in state.room.objects.find(x=>x.id===npc.id).status,false);
  p.status.stunned=true;const x=p.x;
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0,status:{stunned:false,moveSpeed:1000}}));
  await b.next('game.state');await b.next('game.state');assert.equal(p.x,x);assert.equal(p.status.moveSpeed,2);
  p.status.stunned=false;p.status.bonusMoveSpeed=-2;
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0}));await b.next('game.state');await b.next('game.state');assert.equal(p.x,x);
  p.status.bonusMoveSpeed=0;p.status.currentHealth=0;
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0,action:'A'}));
  await b.next('game.state');await b.next('game.state');assert.equal(p.x,x);assert.equal(p.action,null);assert.equal(p.status.state,'dead');
  await a.command('room.leave');assert.equal(rooms.has(code),true);
});

test('movement facing is synchronized and survives stop, stun and zero-speed input',async t=>{
  const {a,b,rooms,code}=await startedPair(t),p=rooms.get(code).players.get(b.id);
  assert.equal(p.facing,-Math.PI/2);
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:1}));
  let state;do{state=await b.next('game.state');}while(p.facing===-Math.PI/2);
  assert.ok(Math.abs(p.facing-Math.PI/4)<1e-7);
  let other;do{other=await a.next('game.state');}while(Math.abs(other.room.players.find(x=>x.id===b.id).facing-Math.PI/4)>1e-7);
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:0,y:0}));await b.next('game.state');assert.ok(Math.abs(p.facing-Math.PI/4)<1e-7);
  p.status.stunned=true;b.ws.send(JSON.stringify({v:1,type:'game.input',x:-1,y:0}));await b.next('game.state');await b.next('game.state');assert.ok(Math.abs(p.facing-Math.PI/4)<1e-7);
  p.status.stunned=false;p.status.bonusMoveSpeed=-2;b.ws.send(JSON.stringify({v:1,type:'game.input',x:0,y:-1}));await b.next('game.state');await b.next('game.state');assert.ok(Math.abs(p.facing-Math.PI/4)<1e-7);
});

test('per-player targeting options are validated and propagated on the 100 ms tick',async t=>{
  const {createWorldObject}=await import('../game/status.js');
  const {client,rooms}=await setup(t);const a=await client(),b=await client();
  await a.command('room.create',{name:'A'});const initial=(await a.next('room.state')).room;
  await b.command('room.join',{name:'B',code:initial.code});await b.command('room.ready',{ready:true});await a.command('room.start');
  const room=rooms.get(initial.code),p=room.players.get(a.id);
  for(const [id,x,hp] of [['near',10,8],['low',80,2]]) {const o=createWorldObject({objectType:'enemy',classificationCode:id,instanceId:id,x:p.x+x,y:p.y,currentHealth:hp,healthRegen:0});room.objects.set(id,o);}
  const nextTarget=async id=>{for(let i=0;i<10;i++){const m=await a.next('game.state');if(m.room.players.find(p=>p.id===a.id).status.nearestEnemyId===id)return;}assert.fail('target did not update');};
  await nextTarget('near');
  a.ws.send(JSON.stringify({v:1,type:'game.options',targetPriority:'lowestHealth'}));await nextTarget('low');
  assert.equal(room.players.get(b.id).targetPriority,'nearest');
  assert.equal((await a.command('game.options',{targetPriority:'bad'},'error')).code,'INVALID_OPTIONS');
  room.objects.delete('low');await nextTarget('near');room.objects.clear();await nextTarget(null);
});

test('game.cast resolves server slot and selected target without trusting supplied damage or caster',async t=>{
 const {createWorldObject}=await import('../game/status.js');
 const {a,b,rooms,code}=await startedPair(t),room=rooms.get(code),p=room.players.get(a.id);
 const enemy=createWorldObject({objectType:'enemy',classificationCode:'e',x:p.x+40,y:p.y,maxHealth:30,currentHealth:30,healthRegen:0});room.objects.set(enemy.id,enemy);
 let state;do{state=await a.next('game.state');}while(state.room.players.find(x=>x.id===a.id).status.nearestEnemyId!==enemy.id);
 a.ws.send(JSON.stringify({v:1,type:'game.cast',slot:'A',damage:9999,casterId:b.id}));
 do{state=await a.next('game.state');}while(!state.room.skillEffects.length);
 assert.equal(enemy.status.currentHealth,24);assert.equal(state.room.skillEffects[0].casterId,a.id);assert.equal(state.room.skillEffects[0].length,72);
 assert.equal(state.room.players.find(x=>x.id===a.id).status.hitboxDiameter,24);
});
