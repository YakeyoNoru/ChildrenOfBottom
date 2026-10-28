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
  for(const path of ['/','/app.js','/style.css','/health'])assert.equal((await fetch(base+path)).status,200);
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
