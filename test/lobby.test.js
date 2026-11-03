import { /** test: 테스트 시나리오와 비동기 정리 절차를 등록한다. */ test } from 'node:test';
import /** assert: 실제 결과와 기대 조건을 비교해 테스트 실패를 검출한다. */ assert from 'node:assert/strict';
import /** WebSocket: 클라이언트 연결 생성 또는 WebSocket 연결 상태 상수를 제공한다. */ WebSocket from 'ws';
import { /** createGameServer: 방·게임 시뮬레이션·정적 파일·인증을 제공하는 서버를 생성한다. */ createGameServer } from '../server.js';

/** setup: 테스트 서버와 정리 작업을 준비해 검증용 인터페이스를 반환한다. */ async function setup(/** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t, /** options: 기본값을 재정의하는 생성·요청 옵션. */ options) {
  const /** game: 서버 인스턴스와 방 관리 인터페이스. */ game = createGameServer(options);
  await new Promise(/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ resolve => game.server.listen(0, '127.0.0.1', resolve));
  const /** url: 해석하거나 접속할 URL. */ url = `ws://127.0.0.1:${game.server.address().port}/ws`;
  t.after(/** 현재 비동기 작업의 완료 또는 후속 처리를 수행한다. */ () => game.close());
  /** client: 실제 클라이언트 코드를 API 대역에서 실행하거나 검증용 접속자를 생성한다. */ async function client() {
    const /** ws: 현재 처리 중인 WebSocket 연결. */ ws = new WebSocket(url), /** inbox: 아직 소비하지 않은 수신 메시지 목록. */ inbox = [], /** waiting: 특정 메시지를 기다리는 대기자 목록. */ waiting = [];
    ws.on('message', /** raw: 수신한 원본 메시지. */ /** message 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ raw => { const /** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ m = JSON.parse(raw); const /** index: 찾은 항목의 목록 위치. */ index = waiting.findIndex(/** w: 화면 너비 또는 메시지 대기자. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ w => w.type === m.type); if (index >= 0) waiting.splice(index, 1)[0].resolve(m); else inbox.push(m); });
    const /** next: 다음에 저장하거나 처리할 데이터. */ next = /** type: 처리하거나 기다릴 메시지 또는 이벤트 유형. */ /** next: 지정한 서버 메시지가 올 때까지 기다리되 제한 시간을 넘으면 실패한다. */ type => {
      const /** index: 찾은 항목의 목록 위치. */ index = inbox.findIndex(/** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ m => m.type === type);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise(/** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ (/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ resolve, /** reject: 비동기 처리를 실패로 완료하는 함수. */ reject) => { const /** waiter: 메시지 수신 시 완료할 비동기 대기자. */ waiter = { type, /** resolve: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ resolve: /** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ m => { clearTimeout(timer); resolve(m); } }; const /** timer: 메시지 대기 제한 시간 타이머. */ timer = setTimeout(/** 예약 시간이 지나면 대기·재접속·실패 처리를 실행한다. */ () => { waiting.splice(waiting.indexOf(waiter), 1); reject(new Error(`Timeout: ${type}`)); }, 2000); waiting.push(waiter); });
    };
    const /** welcome: 연결 직후 서버의 식별자 발급 메시지. */ welcome = await next('welcome');
    let /** seq: 테스트 요청 식별자의 증가 번호. */ seq = 0;
    return { ws, next, id: welcome.playerId, /** command: 식별자를 붙인 테스트 명령을 보내고 지정한 응답을 기다린다. */ async command(/** type: 처리하거나 기다릴 메시지 또는 이벤트 유형. */ type, /** data: 전달하거나 해석한 데이터. */ data = {}, /** event: 현재 처리하는 사용자 입력 또는 연결 이벤트. */ event = 'ack') { const /** requestId: 요청과 응답을 대응시키는 식별자. */ requestId = String(++seq); ws.send(JSON.stringify({ v: 1, type, requestId, ...data })); return next(event); } };
  }
  return { ...game, client, url };
}

test('five clients: capacity, authority, readiness, start and late join', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** client: 테스트용 접속자 생성 함수. */ { client } = await setup(t);
  const /** a: 첫 번째 검증용 값·개체·접속 결과; b: 두 번째 검증용 값·개체·접속 결과; c: 세 번째 검증용 연결; d: 네 번째 검증용 연결; e: 다섯 번째 접속자; f: 정원 초과를 검사할 여섯 번째 접속자. */ [a,b,c,d,e,f] = await Promise.all(Array.from({length:6}, client));
  await a.command('room.create', {name:'방장'}); const /** room: 현재 처리하는 방의 상태. */ {room} = await a.next('room.state');
  for (const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p of [b,c,d,e]) await p.command('room.join', {name:'참가자',code:room.code});
  assert.equal((await e.next('room.state')).room.players.length,5);
  const /** full: 여섯 번째 접속자에게 반환한 정원 초과 오류. */ full=await f.command('room.join',{name:'초과',code:room.code},'error');
  assert.equal(full.code,'ROOM_FULL');assert.equal(full.message,'방이 꽉찼습니다');
  assert.equal((await b.command('room.start',{},'error')).code,'FORBIDDEN');
  assert.equal((await a.command('room.ready',{ready:true},'error')).code,'HOST_CANNOT_READY');
  assert.equal((await a.command('room.start',{},'error')).code,'NOT_READY');
  assert.equal((await b.command('room.ready',{ready:'true'},'error')).code,'INVALID_READY');
  await b.command('room.ready',{ready:true}); await b.command('room.ready',{ready:false});
  assert.equal((await a.command('room.start',{},'error')).code,'NOT_READY');
  for (const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p of [b,c,d,e]) await p.command('room.ready',{ready:true});
  await a.command('room.start');
  for (const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p of [a,b,c,d,e]) { let /** state: 현재 상태 스냅샷. */ state; do {state = await p.next('room.state');} while(state.room.phase !== 'started'); assert.equal(state.room.players.length,5);
    assert.ok(state.room.map?.validation.valid);
    for(const /** index: 참가자 순번; player: 검증할 플레이어. */ [index,player] of state.room.players.entries()) {
      const /** tile: 순번에 대응하는 시작 지형. */ tile=state.room.map.tiles.find(/** 번호가 같은 타일을 찾는다. */ (/** item: 지형 타일. */ item)=>item.id===index+1);
      const /** center: 지정 타일의 시작 좌표. */ center=globalThis.PitMapRules.center(tile,state.room.map);
      assert.equal(player.playerNumber,index+1);assert.equal(player.spawnTileId,index+1);assert.equal(player.x,center.x);assert.equal(player.y,center.y);
    }
  }
  const /** tick: 지도 전체를 반복 전송하지 않는 서버 틱 상태. */ tick=await a.next('game.state');
  assert.equal(tick.room.map,undefined);assert.ok(tick.room.mapId);
  assert.equal((await f.command('room.join',{name:'늦은 참가',code:room.code},'error')).code,'GAME_STARTED');
  assert.equal((await b.command('room.ready',{ready:false},'error')).code,'GAME_STARTED');
});
test('guest departure affects only guest; host leave closes room for everyone', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** client: 테스트용 접속자 생성 함수; rooms: 접속코드별 방 상태를 보관하는 맵. */ {client,rooms} = await setup(t); const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await client(),/** b: 두 번째 검증용 값·개체·접속 결과. */ b=await client();
  await a.command('room.create',{name:'A'}); const /** room: 현재 처리하는 방의 상태. */ {room}=await a.next('room.state');
  await b.command('room.join',{name:'B',code:room.code}); await b.next('room.state');
  await b.command('room.leave'); await b.next('room.left'); assert.equal(rooms.get(room.code).players.size,1);
  await b.command('room.join',{name:'B',code:room.code});
  await a.command('room.leave');
  for(const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p of [a,b]) assert.equal((await p.next('room.closed')).message,'방이 해제되었습니다.');
  assert.equal(rooms.size,0);
  assert.equal((await b.command('room.join',{name:'B',code:room.code},'error')).code,'ROOM_NOT_FOUND');
});
test('disconnect removes guests and dissolves host room; clients can create again', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** client: 테스트용 접속자 생성 함수; rooms: 접속코드별 방 상태를 보관하는 맵. */ {client,rooms}=await setup(t);const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await client(),/** b: 두 번째 검증용 값·개체·접속 결과. */ b=await client(),/** c: 세 번째 검증용 연결. */ c=await client();
  await a.command('room.create',{name:'A'});const /** room: 현재 처리하는 방의 상태. */ {room}=await a.next('room.state');
  await b.command('room.join',{name:'B',code:room.code});await c.command('room.join',{name:'C',code:room.code});
  b.ws.terminate();
  let /** state: 현재 상태 스냅샷. */ state;do {state=await a.next('room.state');}while(state.room.players.length!==2);
  a.ws.terminate();await c.next('room.closed');assert.equal(rooms.size,0);
  await c.command('room.create',{name:'C'});assert.equal(rooms.size,1);
});
test('solo start, malformed messages, duplicate membership, invalid codes and names', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** client: 테스트용 접속자 생성 함수. */ {client}=await setup(t);const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await client();
  a.ws.send('{'); assert.equal((await a.next('error')).code,'BAD_MESSAGE');
  a.ws.send('null'); assert.equal((await a.next('error')).code,'BAD_MESSAGE');
  a.ws.send(JSON.stringify({v:2,type:'room.create'}));assert.equal((await a.next('error')).code,'BAD_MESSAGE');
  assert.equal((await a.command('room.leave',{},'error')).code,'NOT_IN_ROOM');
  assert.equal((await a.command('room.create',{name:' '},'error')).code,'INVALID_NAME');
  assert.equal((await a.command('room.join',{name:'A',code:'???'},'error')).code,'INVALID_CODE');
  assert.equal((await a.command('invented',{},'error')).code,'UNKNOWN_TYPE');
  await a.command('room.create',{name:'<script>alert(1)</script>'.slice(0,20)});
  assert.equal((await a.command('room.create',{name:'A'},'error')).code,'ALREADY_IN_ROOM');
  await a.command('room.start');let /** state: 현재 상태 스냅샷. */ state;do{state=await a.next('room.state');}while(state.room.phase!=='started');
});
test('heartbeat expires unresponsive host', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** client: 테스트용 접속자 생성 함수; rooms: 접속코드별 방 상태를 보관하는 맵. */ {client,rooms}=await setup(t,{heartbeatMs:30});const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await client(),/** b: 두 번째 검증용 값·개체·접속 결과. */ b=await client();
  await a.command('room.create',{name:'A'});const /** room: 현재 처리하는 방의 상태. */ {room}=await a.next('room.state');await b.command('room.join',{name:'B',code:room.code});
  a.ws._autoPong=false;await b.next('room.closed');assert.equal(rooms.size,0);
});
test('HTTP serves only public files and health', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** url: 해석하거나 접속할 URL. */ {url}=await setup(t);const /** base: 계정 서버 또는 테스트 서버의 기준 주소. */ base=url.replace('ws:','http:').replace('/ws','');
  for(const /** path: 요청 또는 파일의 경로. */ path of ['/','/app.js','/viewport.js','/motion.js','/style.css','/health'])assert.equal((await fetch(base+path)).status,200);
  assert.equal((await fetch(base+'/server.js')).status,404);
});
test('simultaneous joins never exceed five players', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** client: 테스트용 접속자 생성 함수; rooms: 접속코드별 방 상태를 보관하는 맵. */ {client,rooms}=await setup(t); const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await client();
  await a.command('room.create',{name:'A'});const /** room: 현재 처리하는 방의 상태. */ {room}=await a.next('room.state');
  const /** guests: 일반 참가자 연결 목록. */ guests=await Promise.all(Array.from({length:8},client));
  for(const /** guest: 게스트 접속 결과 또는 게스트 연결. */ guest of guests) guest.ws.send(JSON.stringify({v:1,type:'room.join',name:'동시 참가',code:room.code}));
  const /** results: 여러 비동기 작업의 실행 결과. */ results=await Promise.all(guests.map(/** guest: 게스트 접속 결과 또는 게스트 연결. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ guest=>new Promise(/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ resolve=>{guest.ws.on('message',/** raw: 수신한 원본 메시지. */ /** message 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ raw=>{const /** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ m=JSON.parse(raw);if(m.type==='ack'||m.type==='error')resolve(m);});})));
  assert.equal(results.filter(/** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ /** 조건에 맞는 항목만 다음 처리 대상으로 남긴다. */ m=>m.type==='ack').length,4);
  assert.equal(results.filter(/** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ /** 조건에 맞는 항목만 다음 처리 대상으로 남긴다. */ m=>m.code==='ROOM_FULL').length,4);
  assert.equal(rooms.get(room.code).players.size,5);
});
test('foreign browser origins and oversized payloads are rejected', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** url: 해석하거나 접속할 URL; client: 테스트용 접속자 생성 함수. */ {url,client}=await setup(t);
  const /** foreign: 허용되지 않은 출처의 테스트 연결. */ foreign=new WebSocket(url,{origin:'https://untrusted.example'});
  const /** code: 개체·기술·방 또는 오류를 식별하는 코드. */ code=await new Promise(/** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ (/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ resolve,/** reject: 비동기 처리를 실패로 완료하는 함수. */ reject)=>{foreign.on('close',resolve);foreign.on('error',reject);});
  assert.equal(code,1008);
  const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await client();const /** closed: 연결 종료 결과를 기다리는 비동기 작업. */ closed=new Promise(/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ resolve=>a.ws.once('close',resolve));
  a.ws.send('x'.repeat(5000));assert.equal(await closed,1009);
});

/** startedPair: 두 접속자를 같은 방에 참여·준비·시작시켜 진행 중 상태를 만든다. */ async function startedPair(/** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t, /** options: 기본값을 재정의하는 생성·요청 옵션. */ options) {
  const /** game: 서버 인스턴스와 방 관리 인터페이스. */ game = await setup(t, options), /** a: 첫 번째 검증용 값·개체·접속 결과. */ a = await game.client(), /** b: 두 번째 검증용 값·개체·접속 결과. */ b = await game.client();
  await a.command('room.create', {name:'방장'}); const /** room: 현재 처리하는 방의 상태. */ {room} = await a.next('room.state');
  await b.command('room.join', {name:'참가자',code:room.code});
  await b.command('room.ready', {ready:true}); await a.command('room.start');
  return {...game,a,b,code:room.code};
}
test('playing host leaves alone, successor can move, room disappears only after last departure', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** a: 첫 번째 검증용 값·개체·접속 결과; b: 두 번째 검증용 값·개체·접속 결과; rooms: 접속코드별 방 상태를 보관하는 맵; code: 개체·기술·방 또는 오류를 식별하는 코드. */ {a,b,rooms,code} = await startedPair(t);
  await a.command('room.leave'); await a.next('room.left');
  assert.equal(rooms.get(code).phase,'started'); assert.equal(rooms.get(code).hostId,b.id);
  assert.equal(rooms.get(code).players.size,1);
  const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p = rooms.get(code).players.get(b.id), /** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ x = p.x;
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0,action:'A',playerId:a.id}));
  let /** state: 현재 상태 스냅샷. */ state; do {state = await b.next('game.state');} while(state.room.players[0].x <= x);
  assert.equal(state.room.players[0].id,b.id); assert.equal(state.room.players[0].action,'A');
  await a.command('room.create',{name:'다른 방'});
  assert.equal(rooms.has(code),true);
  await b.command('room.leave'); await b.next('room.left'); assert.equal(rooms.has(code),false);
});
test('playing host disconnect and heartbeat timeout preserve the remaining game', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** a: 첫 번째 검증용 값·개체·접속 결과; b: 두 번째 검증용 값·개체·접속 결과; rooms: 접속코드별 방 상태를 보관하는 맵; code: 개체·기술·방 또는 오류를 식별하는 코드. */ {a,b,rooms,code} = await startedPair(t,{heartbeatMs:50});
  a.ws._autoPong = false;
  let /** state: 현재 상태 스냅샷. */ state; do {state = await b.next('game.state');} while(state.room.players.length !== 1);
  assert.equal(state.room.phase,'started'); assert.equal(rooms.get(code).hostId,b.id);
  b.ws.terminate();
  await new Promise(/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ resolve => b.ws.once('close',resolve));
  await new Promise(/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ resolve => setImmediate(resolve));
  // 서버의 연결 종료 프레임은 다음 이벤트 루프에서 처리될 수 있다.
  for(let /** i: 현재 반복 항목의 순번. */ i=0; i<20 && rooms.has(code); i++) await new Promise(/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ resolve=>setTimeout(resolve,5));
  assert.equal(rooms.has(code),false);
});
test('movement is validated, bounded, diagonal normalized, stale input stops', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** a: 첫 번째 검증용 값·개체·접속 결과; b: 두 번째 검증용 값·개체·접속 결과; rooms: 접속코드별 방 상태를 보관하는 맵; code: 개체·기술·방 또는 오류를 식별하는 코드. */ {a,b,rooms,code} = await startedPair(t);
  for (const /** input: 현재 프레임에 적용할 이동 입력. */ input of [{x:2,y:0},{x:'1',y:0},{x:0,y:0,action:'INVALID'}]) {
    assert.equal((await b.command('game.input',input,'error')).code,'INVALID_INPUT');
  }
  const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p = rooms.get(code).players.get(b.id);
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:1}));
  let /** state: 현재 상태 스냅샷. */ state; do {state = await b.next('game.state');} while(p.inputAt === 0);
  assert.ok(Math.abs(Math.hypot(p.input.x,p.input.y)-1)<1e-9);
  const /** host: 방장 여부 또는 방장 개체. */ host = rooms.get(code).players.get(a.id); assert.equal(host.x,globalThis.PitMapRules.center(rooms.get(code).map.tiles.find(/** 1번 시작 타일을 찾는다. */ (/** tile: 지도 타일. */ tile)=>tile.id===1),rooms.get(code).map).x);
  for(let /** i: 현재 반복 항목의 순번. */ i=0;i<12;i++) await b.next('game.state');
  const /** stopped: 입력이 만료됐을 때 기록한 정지 위치. */ stopped = p.x; await b.next('game.state'); assert.equal(p.x,stopped);
  assert.deepEqual(p.input,{x:0,y:0});
  // 지도 없는 기존 필드의 경계 제한도 별도로 검증한다.
  rooms.get(code).map=null;
  p.x=1500; p.y=1500; b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:1}));
  await b.next('game.state'); await b.next('game.state'); assert.ok(p.x<=1500 && p.y<=1500);
});
test('input is rejected before game start', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** client: 테스트용 접속자 생성 함수. */ {client}=await setup(t);const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await client();
  assert.equal((await a.command('game.input',{x:0,y:0},'error')).code,'NOT_IN_ROOM');
  await a.command('room.create',{name:'A'});
  assert.equal((await a.command('game.input',{x:0,y:0},'error')).code,'GAME_NOT_STARTED');
});

test('world snapshots share player/NPC/enemy stats; stun/death and speed use server status', /** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t => {
  const /** createWorldObject: 공통 스테이터스와 위치를 가진 NPC·적·검증용 플레이어 개체를 만든다.. */ {createWorldObject}=await import('../game/status.js');
  const /** a: 첫 번째 검증용 값·개체·접속 결과; b: 두 번째 검증용 값·개체·접속 결과; rooms: 접속코드별 방 상태를 보관하는 맵; code: 개체·기술·방 또는 오류를 식별하는 코드. */ {a,b,rooms,code}=await startedPair(t),/** room: 현재 처리하는 방의 상태. */ room=rooms.get(code),/** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=room.players.get(b.id);
  const /** npc: 검증용 우호 NPC 개체. */ npc=createWorldObject({objectType:'npc',classificationCode:'NPC001',name:'주민',x:300,maxSkillResource:5,currentSkillResource:2});
  const /** enemy: 선택한 적대 개체 또는 해당 대상까지의 제곱 거리. */ enemy=createWorldObject({objectType:'enemy',classificationCode:'ENEMY001',name:'몬스터',x:400});
  room.objects.set(npc.id,npc);room.objects.set(enemy.id,enemy);
  let /** state: 현재 상태 스냅샷. */ state;do{state=await b.next('game.state');}while(state.room.objects.length!==4||!state.room.players.find(/** 대상 갱신이 끝난 본인 상태를 확인한다. */ (/** player: 수신 플레이어. */ player)=>player.id===b.id).status.nearestEnemyId);
  assert.equal(state.room.players.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===b.id).status.moveSpeed,2);
  assert.equal(state.room.players.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===b.id).status.classificationCode,b.id);
  assert.equal(state.room.objects.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===npc.id).status.objectType,'npc');
  assert.equal(state.room.objects.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===enemy.id).status.objectType,'enemy');
  assert.equal(state.room.players.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===b.id).status.nearestEnemyId,enemy.id);
  assert.equal('skillDeckCode' in state.room.objects.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===npc.id).status,false);
  p.status.stunned=true;const /** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ x=p.x;
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0,status:{stunned:false,moveSpeed:1000}}));
  await b.next('game.state');await b.next('game.state');assert.equal(p.x,x);assert.equal(p.status.moveSpeed,2);
  p.status.stunned=false;p.status.bonusMoveSpeed=-2;
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0}));await b.next('game.state');await b.next('game.state');assert.equal(p.x,x);
  p.status.bonusMoveSpeed=0;p.status.currentHealth=0;
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0,action:'A'}));
  await b.next('game.state');await b.next('game.state');assert.equal(p.x,x);assert.equal(p.action,null);assert.equal(p.status.state,'dead');
  await a.command('room.leave');assert.equal(rooms.has(code),true);
});

test('movement facing is synchronized and survives stop, stun and zero-speed input',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t=>{
  const /** a: 첫 번째 검증용 값·개체·접속 결과; b: 두 번째 검증용 값·개체·접속 결과; rooms: 접속코드별 방 상태를 보관하는 맵; code: 개체·기술·방 또는 오류를 식별하는 코드. */ {a,b,rooms,code}=await startedPair(t),/** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=rooms.get(code).players.get(b.id);
  assert.equal(p.facing,-Math.PI/2);
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:1}));
  let /** state: 현재 상태 스냅샷. */ state;do{state=await b.next('game.state');}while(p.facing===-Math.PI/2);
  assert.ok(Math.abs(p.facing-Math.PI/4)<1e-7);
  let /** other: 다른 접속자에게 수신된 상태. */ other;do{other=await a.next('game.state');}while(Math.abs(other.room.players.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===b.id).facing-Math.PI/4)>1e-7);
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:0,y:0}));await b.next('game.state');assert.ok(Math.abs(p.facing-Math.PI/4)<1e-7);
  p.status.stunned=true;b.ws.send(JSON.stringify({v:1,type:'game.input',x:-1,y:0}));await b.next('game.state');await b.next('game.state');assert.ok(Math.abs(p.facing-Math.PI/4)<1e-7);
  p.status.stunned=false;p.status.bonusMoveSpeed=-2;b.ws.send(JSON.stringify({v:1,type:'game.input',x:0,y:-1}));await b.next('game.state');await b.next('game.state');assert.ok(Math.abs(p.facing-Math.PI/4)<1e-7);
});

test('per-player targeting options are validated and propagated on the 100 ms tick',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t=>{
  const /** createWorldObject: 공통 스테이터스와 위치를 가진 NPC·적·검증용 플레이어 개체를 만든다.. */ {createWorldObject}=await import('../game/status.js');
  const /** client: 테스트용 접속자 생성 함수; rooms: 접속코드별 방 상태를 보관하는 맵. */ {client,rooms}=await setup(t);const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await client(),/** b: 두 번째 검증용 값·개체·접속 결과. */ b=await client();
  await a.command('room.create',{name:'A'});const /** initial: 방 입장 직후의 초기 스냅샷. */ initial=(await a.next('room.state')).room;
  await b.command('room.join',{name:'B',code:initial.code});await b.command('room.ready',{ready:true});await a.command('room.start');
  const /** room: 현재 처리하는 방의 상태. */ room=rooms.get(initial.code),/** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=room.players.get(a.id);
  for(const /** id: 대상 개체 또는 요소의 식별자; x: 검증 좌표·비교 항목 또는 위치 조회 함수; hp: 검증용 현재체력. */ [id,x,hp] of [['near',10,8],['low',80,2]]) {const /** o: 현재 비교하거나 변환할 개체. */ o=createWorldObject({objectType:'enemy',classificationCode:id,instanceId:id,x:p.x+x,y:p.y,currentHealth:hp,healthRegen:0});room.objects.set(id,o);}
  const /** nextTarget: 지정한 대상 ID가 동기화될 때까지 기다리는 함수. */ nextTarget=/** nextTarget: 선택된 적 ID가 서버 스냅샷에 반영될 때까지 기다린다. */ async /** id: 대상 개체 또는 요소의 식별자. */ id=>{for(let /** i: 현재 반복 항목의 순번. */ i=0;i<10;i++){const /** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ m=await a.next('game.state');if(m.room.players.find(/** p: 검증 기준이 되는 개체 또는 표시 위치. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ p=>p.id===a.id).status.nearestEnemyId===id)return;}assert.fail('target did not update');};
  await nextTarget('near');
  a.ws.send(JSON.stringify({v:1,type:'game.options',targetPriority:'lowestHealth'}));await nextTarget('low');
  assert.equal(room.players.get(b.id).targetPriority,'nearest');
  assert.equal((await a.command('game.options',{targetPriority:'bad'},'error')).code,'INVALID_OPTIONS');
  room.objects.delete('low');await nextTarget('near');room.objects.clear();await nextTarget(null);
});

test('game.cast resolves server slot and selected target without trusting supplied damage or caster',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t=>{
 const /** createWorldObject: 공통 스테이터스와 위치를 가진 NPC·적·검증용 플레이어 개체를 만든다.. */ {createWorldObject}=await import('../game/status.js');
 const /** a: 첫 번째 검증용 값·개체·접속 결과; b: 두 번째 검증용 값·개체·접속 결과; rooms: 접속코드별 방 상태를 보관하는 맵; code: 개체·기술·방 또는 오류를 식별하는 코드. */ {a,b,rooms,code}=await startedPair(t),/** room: 현재 처리하는 방의 상태. */ room=rooms.get(code),/** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=room.players.get(a.id);
 const /** enemy: 선택한 적대 개체 또는 해당 대상까지의 제곱 거리. */ enemy=createWorldObject({objectType:'enemy',classificationCode:'e',x:p.x+40,y:p.y,maxHealth:30,currentHealth:30,healthRegen:0});room.objects.set(enemy.id,enemy);
 let /** state: 현재 상태 스냅샷. */ state;do{state=await a.next('game.state');}while(state.room.players.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===a.id).status.nearestEnemyId!==enemy.id);
 a.ws.send(JSON.stringify({v:1,type:'game.cast',slot:'A',damage:9999,casterId:b.id}));
 do{state=await a.next('game.state');}while(!state.room.skillEffects.length);
 assert.equal(enemy.status.currentHealth,24);assert.equal(state.room.skillEffects[0].casterId,a.id);assert.equal(state.room.skillEffects[0].length,72);
 assert.equal(state.room.players.find(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.id===a.id).status.hitboxDiameter,24);
  assert.equal(state.room.skillEffects[0].results[0].targetId,enemy.id);
  assert.equal((await a.command('game.cast',{slot:'A'},'error')).code,'SKILL_COOLDOWN');
});

test('sequenced movement acknowledges consumed ticks only; duplicates cannot move twice',/** 입력 순번과 실제 처리 확인·중복 방지·형식 전환 차단을 검증한다. */ async (/** t: 서버 정리용 테스트 문맥. */ t)=>{
 const /** a: 본인 연결; rooms: 서버 방 목록; code: 방 코드. */ {a,rooms,code}=await startedPair(t);
 const /** player: 이동 판정을 검사할 서버 개체. */ player=rooms.get(code).players.get(a.id);
 const /** startX: 검증 시작 좌표. */ startX=player.x;
 a.ws.send(JSON.stringify({v:1,type:'game.input',seq:1,x:1,y:0}));
 a.ws.send(JSON.stringify({v:1,type:'game.input',seq:1,x:1,y:0}));
 let /** snapshot: 실제 처리 확인을 담을 수신 상태. */ snapshot;
 do {snapshot=await a.next('game.state');}while((snapshot.room.players.find(/** 본인을 조회한다. */ (/** item: 수신 플레이어. */ item)=>item.id===a.id).lastProcessedInput??0)<1);
 assert.equal(player.x,startX+11);
 await a.next('game.state');assert.equal(player.x,startX+11);
 assert.equal((await a.command('game.input',{seq:3,x:1,y:0},'error')).code,'INVALID_INPUT_SEQUENCE');
 assert.equal((await a.command('game.input',{x:1,y:0},'error')).code,'INVALID_INPUT_SEQUENCE');
 a.ws.send(JSON.stringify({v:1,type:'game.input',seq:2,x:0,y:0}));
 do {await a.next('game.state');}while(player.lastProcessedInput<2);
 assert.equal(player.x,startX+11);
});

test('roll moves without further inputs, rejects casts and ends after 72 units',/** 서버가 구르기와 조작 잠금·종료를 확정하는지 검증한다. */ async (/** t: 테스트 정리 문맥. */ t)=>{
 const /** a: 본인 연결; rooms: 서버 방 목록; code: 방 코드. */ {a,rooms,code}=await startedPair(t);
 const /** caster: 구르기 시전자. */ caster=rooms.get(code).players.get(a.id);const /** map: 시작한 방 지도. */ map=rooms.get(code).map;
 const /** startIndex: 1번 시작 타일 인덱스. */ startIndex=map.tiles.findIndex(/** 1번 지형을 찾는다. */ (/** tile: 지도 타일. */ tile)=>tile.id===1);
 const /** bridge: 시작 타일에서 나가는 실제 다리. */ bridge=map.bridges.find(/** 시작점 연결을 찾는다. */ (/** ends: 다리 양 끝 인덱스. */ ends)=>ends.includes(startIndex));
 const /** destination: 연결된 타일의 중심. */ destination=globalThis.PitMapRules.center(map.tiles[bridge.find(/** 반대 끝을 찾는다. */ (/** index: 타일 인덱스. */ index)=>index!==startIndex)],map);
 caster.facing=Math.atan2(destination.y-caster.y,destination.x-caster.x);
 const /** startX: 시작 가로 좌표; startY: 시작 세로 좌표. */ startX=caster.x,startY=caster.y;
 a.ws.send(JSON.stringify({v:1,type:'game.input',seq:1,x:0,y:0}));
 do {await a.next('game.state');}while(caster.lastProcessedInput!==1);
 a.ws.send(JSON.stringify({v:1,type:'game.cast',slot:'B'}));
 assert.equal((await a.command('game.cast',{slot:'A'},'error')).code,'ACTION_LOCKED');
 do {await a.next('game.state');}while(caster.roll);
 assert.ok(Math.abs(Math.hypot(caster.x-startX,caster.y-startY)-72)<1e-8);assert.equal(caster.status.skillB,'BAS0002');
});

test('room countdown starts at creation, allows grace, then removes all five players without disconnecting',/** 10분·1분 경계와 모든 참가자 퇴장·소켓 재사용을 검증한다. */ async (/** t: 테스트 정리 문맥. */ t)=>{
 let /** clock: 실제 11분을 기다리지 않고 진행할 서버 방 시각. */ clock=0;
 const /** client: 연결 생성 함수; rooms: 실제 방 목록. */ {client,rooms}=await setup(t,{/** 테스트 시각을 반환한다. */ roomClock:()=>clock});
 const /** clients: 방에 참가할 5개 연결. */ clients=await Promise.all(Array.from({length:5},client));
 await clients[0].command('room.create',{name:'방장'});
 const /** code: 만료를 검증할 방 코드. */ code=(await clients[0].next('room.state')).room.code;
 for(const /** connection: 입장할 일반 참가자. */ connection of clients.slice(1)) {await connection.command('room.join',{name:'참가자',code});await connection.command('room.ready',{ready:true});}
 clock=599999;await clients[0].command('room.start');
 let /** state: 시간 경계를 검증할 서버 스냅샷. */ state=await clients[0].next('game.state');
 assert.equal(state.room.timer.remainingMs,1);assert.equal(state.room.timer.createdAt,0);
 clock=600000;do{state=await clients[0].next('game.state');}while(state.room.timer.remainingMs!==0);
 assert.equal(rooms.has(code),true);assert.equal(state.room.timer.closeRemainingMs,60000);
 clock=659999;do{state=await clients[0].next('game.state');}while(state.room.timer.closeRemainingMs!==1);
 assert.equal(rooms.has(code),true);
 clock=660000;
 for(const /** connection: 강제 퇴장을 받아야 하는 참가자. */ connection of clients)assert.equal((await connection.next('room.closed')).reason,'TIME_LIMIT');
 assert.equal(rooms.has(code),false);
 await clients[0].command('room.create',{name:'다시 시작'});
 assert.equal((await clients[0].next('room.state')).room.timer.remainingMs,600000);
 assert.equal((await clients[1].command('room.join',{name:'만료된 방',code},'error')).code,'ROOM_NOT_FOUND');
});

test('lobby also expires and requests cannot reopen the expired room',/** 게임을 시작하지 않아도 생성 후 11분이면 정리되는지 검증한다. */ async (/** t: 테스트 정리 문맥. */ t)=>{
 let /** clock: 제어할 방 시각. */ clock=0;
 const /** client: 연결 생성 함수; rooms: 서버 방 목록. */ {client,rooms}=await setup(t,{/** 지정한 시각을 반환한다. */ roomClock:()=>clock});
 const /** host: 방장 연결; guest: 입장을 시도할 연결. */ [host,guest]=await Promise.all([client(),client()]);
 await host.command('room.create',{name:'방장'});
 const /** code: 만료시킬 방 코드. */ code=(await host.next('room.state')).room.code;
 clock=660000;
 assert.equal((await guest.command('room.join',{name:'참가자',code},'error')).code,'ROOM_NOT_FOUND');
 assert.equal((await host.next('room.closed')).reason,'TIME_LIMIT');assert.equal(rooms.has(code),false);
});


test('room start spawns fragments and authoritative pickup awards competition points',/** 멀티플레이 전송에서 초기 아이템·획득 변경분·점수를 검증한다. */ async (/** t: 테스트 정리 문맥. */ t)=>{
 const /** a: 첫 접속자; rooms: 서버 방 목록; code: 방 코드. */ {a,rooms,code}=await startedPair(t);
 const /** room: 실제 게임 방; player: 서버 플레이어. */ room=rooms.get(code),player=room.players.get(a.id);
 assert.ok(room.items.size>500);
 const /** fragment: 획득시킬 한 조각. */ fragment=room.items.values().next().value;
 room.items=new Map([[fragment.id,fragment]]);Object.assign(player,{x:fragment.x,y:fragment.y});
 const /** before: 획득 전 경쟁포인트. */ before=player.status.competitionPoints;
 let /** state: 점수 반영까지 기다릴 상태. */ state;
 do{state=await a.next('game.state');}while(player.status.competitionPoints===before);
 assert.equal(player.status.competitionPoints,before+10);assert.equal(room.items.size,0);assert.equal(state.room.items,undefined);
});

test('attack is anchored after its movement sequence and before later queued movement',/** 실제 WebSocket에서 이동·공격 요청 순서와 피해 원점을 검사한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 첫 접속자; rooms: 방 목록; code: 방 코드. */ {a,rooms,code}=await startedPair(t);
 const /** room: 서버 방; player: 서버 플레이어. */ room=rooms.get(code),player=room.players.get(a.id);
 const /** startX: 공격 전 시작 좌표. */ startX=player.x;
 for(let /** seq: 공격 이전 입력. */ seq=1;seq<=4;seq++)a.ws.send(JSON.stringify({v:1,type:'game.input',seq,x:1,y:0}));
 a.ws.send(JSON.stringify({v:1,type:'game.cast',slot:'A',afterInputSeq:4}));
 for(let /** seq: 공격 이후 입력. */ seq=5;seq<=8;seq++)a.ws.send(JSON.stringify({v:1,type:'game.input',seq,x:1,y:0}));
 do{await a.next('game.state');}while((player.lastProcessedInput??0)<8);
 assert.equal(room.skillEffects.length,1);assert.equal(room.skillEffects[0].x,startX+44);assert.equal(player.x,startX+88);
 assert.equal((await a.command('game.cast',{slot:'C',afterInputSeq:100},'error')).code,'INVALID_CAST_SEQUENCE');
});

test('public room listing excludes private/started rooms and code joining remains available',/** 공개 목록·방장 권한·비공개 코드 입장·목록 선택의 재검증을 검사한다. */ async (/** t: 정리 문맥. */ t)=>{
 const /** client: 서버 접속 생성기. */ {client}=await setup(t);
 const /** host: 방장; guest: 목록 조회자; outsider: 코드 입장자. */ host=await client(),guest=await client(),outsider=await client();
 await host.command('room.create',{name:'공개방장'});
 const /** initial: 생성 직후 방 상태. */ initial=(await host.next('room.state')).room;assert.equal(initial.private,false);
 await guest.command('room.list');assert.equal((await guest.next('room.list')).rooms[0].code,initial.code);
 await host.command('room.privacy',{private:true});
 await guest.command('room.list');assert.deepEqual((await guest.next('room.list')).rooms,[]);
 assert.equal((await guest.command('room.join',{name:'목록입장',code:initial.code,publicOnly:true},'error')).code,'ROOM_PRIVATE');
 await outsider.command('room.join',{name:'코드입장',code:initial.code});
 assert.equal((await outsider.command('room.privacy',{private:false},'error')).code,'FORBIDDEN');
 assert.equal((await host.command('room.privacy',{private:'Y'},'error')).code,'INVALID_PRIVACY');
 await host.command('room.privacy',{private:false});await guest.command('room.list');
 const /** reopened: 다시 공개된 방 목록. */ reopened=(await guest.next('room.list')).rooms;assert.equal(reopened.length,1);assert.equal(reopened[0].playerCount,2);
 await outsider.command('room.ready',{ready:true});await host.command('room.start');await guest.command('room.list');assert.deepEqual((await guest.next('room.list')).rooms,[]);
 assert.equal((await guest.command('room.join',{name:'늦은입장',code:initial.code,publicOnly:true},'error')).code,'GAME_STARTED');
});

test('expired public rooms are excluded from listings',/** 목록 요청에서 만료된 방을 노출하지 않는다. */ async (/** t: 정리 문맥. */ t)=>{
 let /** clock: 검증용 서버 방 시각. */ clock=0;
 const /** client: 검증 서버 접속 생성기. */ {client}=await setup(t,{roomClock:/** 제어된 시각을 반환한다. */ ()=>clock});
 const /** host: 방장; browser: 목록 조회자. */ host=await client(),browser=await client();await host.command('room.create',{name:'만료방'});
 clock=660000;await browser.command('room.list');assert.deepEqual((await browser.next('room.list')).rooms,[]);
});
