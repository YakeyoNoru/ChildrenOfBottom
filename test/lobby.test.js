import { /** test: 테스트 시나리오와 비동기 정리 절차를 등록한다. */ test } from 'node:test';
import /** assert: 실제 결과와 기대 조건을 비교해 테스트 실패를 검출한다. */ assert from 'node:assert/strict';
import /** WebSocket: 클라이언트 연결 생성 또는 WebSocket 연결 상태 상수를 제공한다. */ WebSocket from 'ws';
import { /** createGameServer: 방·게임 시뮬레이션·정적 파일·인증을 제공하는 서버를 생성한다. */ createGameServer } from '../server.js';

/** 실제 소켓 종료·서버 틱 조건을 제한 시간 안에 확인한다. */
async function waitFor(/** accept: 서버에 반영됐는지 검사할 조건. */ accept){
 const /** deadline: 실패로 처리할 실제 시각(ms). */ deadline=Date.now()+2000;
 while(!accept()){if(Date.now()>=deadline)throw Error('서버 조건 대기시간 초과');await new Promise(/** 다음 이벤트 루프에서 서버 상태를 재검사한다. */ (/** resolve: 10ms 대기 완료 함수. */ resolve)=>setTimeout(resolve,10));}
}

test('players can buy a skill card through the game socket and equip the starting skill again',/** 실제 서버 메시지로 구매·장착과 부족한 포인트 거절을 확인한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 구매자 소켓; rooms: 방 목록; code: 검증할 방 번호. */ {a,rooms,code}=await startedPair(t);
 const /** player: 구매 요청으로 변경할 서버 참가자. */ player=rooms.get(code).players.get(a.id);
 assert.equal(player.status.skillDeckCode.length,17);
 assert.equal(player.status.handSkillCode.length,3);
 assert.equal((await a.command('game.skill.reroll',{},'error')).code,'INVALID_SKILL');
 player.status.rerollCount=1;
 await a.command('game.skill.reroll');
 assert.equal(player.status.rerollCount,0);
 assert.equal(player.status.graveyardSkillDeckCode.length,3);
 player.status.skillPoints=2;
 await a.command('game.skill.reroll');
 assert.equal(player.status.skillPoints,1);
 assert.equal(player.status.graveyardSkillDeckCode.length,6);
 player.status.handSkillCode=['BAS0001'];
 assert.equal((await a.command('game.skill.buy',{code:'BAS0004'},'error')).code,'INVALID_SKILL');
 player.status.handSkillCode=['BAS0004'];
 await a.command('game.skill.buy',{code:'BAS0004'});
 assert.deepEqual(player.status.handSkillCode,[]);
 assert.deepEqual(player.status.excludedSkillDeckCode,['BAS0004']);
 await a.command('game.skill.reroll');
 assert.equal(player.status.handSkillCode.length,3);
 assert.equal(player.status.ownedSkills.BAS0004,1);
 assert.equal(player.status.skillA,'BAS0004');
 assert.equal(player.status.skillPoints,0);
 await a.command('game.skill.equip',{code:'BAS0001'});
 assert.equal(player.status.skillA,'BAS0001');
});

test('PvP final blow synchronizes killer rewards and preserves the victim result points',/** 실제 기술 요청부터 처치 보상·사망 점수화면·최신 상태 전송까지 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 처치자 연결; b: 피해자 연결; rooms: 서버 방 목록; code: 방 번호. */ {a,b,rooms,code}=await startedPair(t);
 const /** room: 검증할 방; killer: 처치자; victim: 레벨 3 피해자. */ room=rooms.get(code),killer=room.players.get(a.id),victim=room.players.get(b.id);
 room.objects.clear();room.items.clear();killer.status.attack=100;victim.status.level=3;victim.status.competitionPoints=101;victim.x=killer.x+30;victim.y=killer.y;killer.facing=0;
 a.ws.send(JSON.stringify({v:1,type:'game.cast',slot:'A'}));
 const /** result: 피해자가 받은 서버 확정 결과. */ result=(await b.next('game.result')).result;
 assert.equal(result.reason,'DEATH');assert.equal(result.competitionPoints,101);
 assert.equal(killer.status.competitionPoints,50);assert.equal(killer.status.level,2);assert.equal(killer.status.currentExperience,70);
 let /** state: 처치 후 보상을 포함하는 최신 수신 상태. */ state;
 do{state=(await a.next('game.state')).room;}while(state.players.find(/** 처치자 수치를 찾는다. */ (/** player: 수신 참가자. */ player)=>player.id===a.id)?.status.competitionPoints!==50);
 assert.equal(state.players[0].status.currentExperience,70);assert.equal(state.players.length,1);
});

test('timed exit NPCs use shared Y/N confirmation and disappear atomically for one player',/** 실제 6분·8분 생성과 취소·동시 확인·한 명만 탈출 처리를 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 let /** clock: 생성 경계를 진행할 검증 시각(ms). */ clock=Date.now();
 const /** a: 첫 사용자; b: 동시 사용자; rooms: 서버 방 목록; code: 게임 번호. */ {a,b,rooms,code}=await startedPair(t,{roomClock:/** 검증 시각을 반환한다. */ ()=>clock});
 const /** room: 진행 중 게임; safeTile: 독기 영향을 받지 않을 높이 4 타일. */ room=rooms.get(code),safeTile=room.map.tiles.find(/** 높이 4 지형을 찾는다. */ (/** tile: 지도 타일. */ tile)=>tile.height===4);
 room.objects.clear();room.items.clear();
 for(const /** player: 시간 진행 중 안전한 곳에 배치할 생존자. */ player of room.players.values())Object.assign(player,globalThis.PitMapRules.center(safeTile,room.map));
 clock=room.gameStartedAt+359999;await new Promise(/** 첫 생성 직전 틱을 기다린다. */ (/** resolve: 대기 완료 함수. */ resolve)=>setTimeout(resolve,70));assert.equal(room.objects.size,0);
 clock+=1;await waitFor(/** 6분 탈출구 생성이 완료될 때까지 기다린다. */ ()=>room.objects.size===1);
 const /** first: 3층에 생성한 첫 탈출구. */ first=[...room.objects.values()][0];assert.equal(room.map.tiles.find(/** 출현 타일을 찾는다. */ (/** tile: 지도 타일. */ tile)=>tile.id===first.spawnTileId).height,3);
 clock=room.gameStartedAt+480000;await waitFor(/** 잔여 인원 2명 조건의 두 번째 생성을 기다린다. */ ()=>room.objects.size===2);
 assert.equal([...room.objects.values()].some(/** 높이 4 탈출구인지 검사한다. */ (/** exit: 탈출구. */ exit)=>room.map.tiles.find(/** 출현 지형 조회. */ (/** tile: 지도 타일. */ tile)=>tile.id===exit.spawnTileId).height===4),true);
 for(const /** player: 첫 탈출구를 함께 이용할 두 플레이어. */ player of room.players.values()){player.x=first.x;player.y=first.y;}
 const /** cancelled: 취소할 첫 확인 요청. */ cancelled=await a.command('game.interact',{targetId:first.id},'interaction.prompt');
 await a.command('game.interact.confirm',{confirmationId:cancelled.id,accept:false});assert.equal(room.objects.has(first.id),true);
 const /** promptA: 첫 사용자의 새 확인; promptB: 같은 탈출구를 요청한 두 번째 확인. */ promptA=await a.command('game.interact',{targetId:first.id},'interaction.prompt'),promptB=await b.command('game.interact',{targetId:first.id},'interaction.prompt');
 const /** result: 먼저 수락한 사용자의 탈출 결과. */ result=await a.command('game.interact.confirm',{confirmationId:promptA.id,accept:true},'game.result');
 assert.equal(result.result.reason,'ESCAPE');assert.equal(room.objects.has(first.id),false);assert.equal(room.players.has(a.id),false);assert.equal(room.players.has(b.id),true);
 assert.equal((await b.command('game.interact.confirm',{confirmationId:promptB.id,accept:true},'error')).code,'INTERACTION_UNAVAILABLE');
 assert.equal(room.objects.size,1);
});

test('guest resumes the same stopped and damageable character without replaying stale input',/** 실제 연결 종료 후 ID·스탯·아이템·좌표·입력 순번 복구를 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 원래 방장; b: 관찰자; client: 신규 연결 생성기; rooms: 방 목록; code: 방 코드. */ {a,b,client,rooms,code}=await startedPair(t);
 const /** room: 진행 중 방; player: 복귀할 동일 서버 객체; token: 비공개 복귀 권한. */ room=rooms.get(code),player=room.players.get(a.id),{token}=await a.next('session.ready');
 room.objects.clear();room.items.clear();player.status.healthRegen=0;player.status.competitionPoints=37;
 player.inputQueue=[{seq:9,x:1,y:0}];player.pendingCasts=[{slot:'A',sequence:9}];player.lastReceivedInput=9;
 a.ws.terminate();await waitFor(/** 서버 연결 종료 처리를 기다린다. */ ()=>player.disconnectedUntil!=null);
 const /** position: 끊긴 시점의 확정 월드 좌표. */ position={x:player.x,y:player.y};
 assert.equal(player.roll,null);assert.equal(player.inputQueue.length,0);assert.equal(player.pendingCasts.length,0);
 await new Promise(/** 이동이 멈춰 있는지 확인할 시간을 준다. */ (/** resolve: 대기 완료 함수. */ resolve)=>setTimeout(resolve,110));
 assert.equal(player.x,position.x);assert.equal(player.y,position.y);
 // 다른 참가자의 실제 서버 공격으로 끊긴 캐릭터도 피해를 받는다.
 const /** attacker: 공격 입력을 보낼 동료 플레이어. */ attacker=room.players.get(b.id);
 attacker.x=player.x-30;attacker.y=player.y;attacker.facing=0;
 b.ws.send(JSON.stringify({v:1,type:'game.cast',slot:'A'}));
 await waitFor(/** 서버 피해 적용을 기다린다. */ ()=>player.status.currentHealth<10);
 const /** health: 복귀 직전 서버 체력; reconnect: 새 브라우저 연결. */ health=player.status.currentHealth,reconnect=await client();
 await reconnect.command('session.resume',{token},'session.resumed');
 const /** state: 재접속으로 받은 지도·아이템 포함 전체 상태. */ state=(await reconnect.next('room.state')).room;
 assert.equal(room.players.get(a.id),player);assert.equal(player.disconnectedUntil,null);assert.equal(player.status.currentHealth,health);
 assert.equal(player.status.competitionPoints,37);assert.equal(player.x,position.x);assert.equal(player.y,position.y);assert.equal(room.players.size,2);
 assert.ok(state.map);assert.ok(Array.isArray(state.items));assert.equal(JSON.stringify(state).includes(token),false);
 reconnect.ws.send(JSON.stringify({v:1,type:'game.input',seq:1,x:1,y:0}));
 await waitFor(/** 복귀 후 첫 입력이 정상 승인될 때까지 기다린다. */ ()=>player.lastProcessedInput===1);
 assert.ok(player.x>position.x);
});

test('reconnect tokens reject guesses, expire and are revoked by explicit leave',/** 다른 토큰·시간 만료·직접 나가기 이후 복귀 거부를 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 let /** clock: 복귀 마감을 검사할 서버 시각(ms). */ clock=Date.now();
 const /** a: 기존 연결; client: 연결 생성기; rooms: 방 목록; code: 대상 방 번호. */ {a,client,rooms,code}=await startedPair(t,{roomClock:/** 검증 시각을 반환한다. */ ()=>clock});
 const /** token: 기존 캐릭터 전용 권한; other: 무관한 연결. */ {token}=await a.next('session.ready'),other=await client();
 assert.equal((await other.command('session.resume',{token:'0'.repeat(64)},'session.rejected')).type,'session.rejected');
 await a.command('room.leave');
 await other.command('session.resume',{token},'session.rejected');
 assert.equal(rooms.get(code).players.has(a.id),false);
 const /** next: 만료 검증용 다른 게임의 연결. */ next=await client();
 await next.command('room.create',{name:'expiry'});const /** created: 새로 만든 방 번호. */ created=(await next.next('room.state')).room;
 await next.command('room.start');const /** nextToken: 만료시킬 복귀 권한. */ {token:nextToken}=await next.next('session.ready');
 const /** nextRoom: 연결이 끊겨도 유지할 방; nextPlayer: 마감을 기다릴 캐릭터. */ nextRoom=rooms.get(created.code),nextPlayer=nextRoom.players.get(next.id);nextRoom.objects.clear();
 next.ws.terminate();await waitFor(/** 서버의 연결 종료 처리를 기다린다. */ ()=>nextPlayer.disconnectedUntil!=null);
 clock+=120000;
 await other.command('session.resume',{token:nextToken},'session.rejected');
 assert.equal(rooms.has(created.code),false);
});

test('death and room time limit while disconnected resume to results rather than gameplay',/** 연결이 끊긴 동안 사망·시간 종료 시 확정 점수화면으로 복귀하는지 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 let /** clock: 방 만료를 진행시킬 검증 시각(ms). */ clock=Date.now();
 const /** a: 연결을 끊을 플레이어; b: 같은 방 플레이어; client: 연결 생성기; rooms: 방 목록; code: 방 번호. */ {a,b,client,rooms,code}=await startedPair(t,{roomClock:/** 검증 시각을 반환한다. */ ()=>clock});
 const /** room: 대상 게임; player: 연결을 끊을 캐릭터; token: 본인 전용 복귀 권한. */ room=rooms.get(code),player=room.players.get(a.id),{token}=await a.next('session.ready');room.objects.clear();
 a.ws.terminate();await waitFor(/** 서버의 연결 종료 처리를 기다린다. */ ()=>player.disconnectedUntil!=null);
 player.status.currentHealth=0;player.status.state='dead';
 await waitFor(/** 사망 결과가 확정될 때까지 기다린다. */ ()=>!room.players.has(a.id));
 const /** reconnect: 사망 후 복귀할 연결. */ reconnect=await client();await reconnect.command('session.resume',{token},'session.resumed');
 const /** result: 복귀하여 받은 확정 결과. */ result=(await reconnect.next('game.result')).result;assert.equal(result.reason,'DEATH');
 await reconnect.command('game.result.seen',{resultId:result.id},'game.result.ready');await reconnect.command('game.result.leave',{resultId:result.id},'game.result.left');
 const /** stranger: 종료된 권한을 재사용할 연결; bToken: 생존자의 복귀 권한. */ stranger=await client(),{token:bToken}=await b.next('session.ready');
 await stranger.command('session.resume',{token},'session.rejected');
 b.ws.terminate();await waitFor(/** 생존자의 연결 종료 처리를 기다린다. */ ()=>room.players.get(b.id).disconnectedUntil!=null);
 room.countdownEndsAt=clock+1000;clock+=1000;
 await waitFor(/** 마지막 생존자도 시간 종료 처리될 때까지 기다린다. */ ()=>!rooms.has(code));
 await stranger.command('session.resume',{token:bToken},'session.resumed');
 assert.equal((await stranger.next('game.result')).result.reason,'TIME_LIMIT');
});

test('resume replaces a half-open connection exactly once without removing its character',/** 예전 소켓의 뒤늦은 종료가 복귀한 캐릭터를 제거하지 않는지 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 아직 열린 이전 연결; client: 연결 생성기; rooms: 방 목록; code: 게임 번호. */ {a,client,rooms,code}=await startedPair(t);
 const /** token: 캐릭터 복귀 권한; next: 새 연결; player: 기존 서버 캐릭터 객체. */ {token}=await a.next('session.ready'),next=await client(),player=rooms.get(code).players.get(a.id);
 await next.command('session.resume',{token},'session.resumed');await next.next('room.state');
 await waitFor(/** 예전 소켓의 종료를 확인한다. */ ()=>a.ws.readyState===WebSocket.CLOSED);
 assert.equal(rooms.get(code).players.get(a.id),player);assert.equal(player.disconnectedUntil,null);
 assert.equal((await next.command('session.resume',{token},'session.rejected')).type,'session.rejected');
});

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
  const /** page: 배포 후 다시 검증해야 하는 진입 화면 응답. */ page=await fetch(base+'/');
  assert.equal(page.headers.get('cache-control'),'no-cache');
  const /** html: 실제 진입 화면에 포함된 스크립트 경로. */ html=await page.text();
  const /** minimapPath: 이전 브라우저 캐시와 구분되는 지도 스크립트 주소. */ minimapPath=html.match(/src="(\/minimap\.js\?v=[^"]+)"/)[1];
  const /** minimap: 버전 쿼리를 포함해 받은 실제 지도 스크립트 응답. */ minimap=await fetch(base+minimapPath);
  assert.equal(minimap.status,200);assert.equal(minimap.headers.get('cache-control'),'no-cache');
  assert.match(await minimap.text(),/drawTileNumbers\(/);
  assert.equal((await fetch(base+'/server.js?v=test')).status,404);
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
  await a.command('room.create', {name:options?.hostName??'방장'}); const /** room: 현재 처리하는 방의 상태. */ {room} = await a.next('room.state');
  await b.command('room.join', {name:'참가자',code:room.code});
  await b.command('room.ready', {ready:true}); await a.command('room.start');
  if(!options?.keepProps)for(const /** id: 제거할 사물 ID; object: 테스트와 무관한 사물. */ [id,object] of game.rooms.get(room.code).objects)if(object.status.objectType==='prop')game.rooms.get(room.code).objects.delete(id);
  return {...game,a,b,code:room.code};
}
test('playing host leaves alone, successor can move, room disappears only after last departure', /** 방장 퇴장 5초 후 새 게임 상태와 후임자의 이동·방 삭제를 검증한다. */ async /** t: 테스트 정리·검증 문맥. */ t => {
  const /** a: 퇴장할 방장; b: 남을 참가자; rooms: 서버 방 상태; code: 시험 중인 방 코드. */ {a,b,rooms,code} = await startedPair(t);
  /** nextLiveState: 과거 수신함 대신 등록 이후 도착한 게임 상태만 기다린다. accept는 원하는 상태 판정 함수다. */
  function nextLiveState(accept) {
    return new Promise(/** resolve: 조건을 만족한 상태 전달; reject: 제한 시간 초과 전달. */ (resolve,reject) => {
      const /** timer: 새 상태의 최대 대기 시간 2000밀리초. */ timer=setTimeout(/** 제한 시간 초과 시 수신기를 정리하고 실패시킨다. */ () => {b.ws.off('message',onMessage);reject(Error('Timeout: fresh game.state'));},2000);
      /** onMessage: 새 게임 상태만 검사한다. raw는 WebSocket 메시지 원문이다. */
      function onMessage(raw) {
        const /** message: 새로 도착한 서버 메시지. */ message=JSON.parse(raw.toString());
        if(message.type!=='game.state'||!accept(message))return;
        clearTimeout(timer);b.ws.off('message',onMessage);resolve(message);
      }
      b.ws.on('message',onMessage);
    });
  }
  await a.command('room.leave'); await a.next('room.left');
  // 퇴장 확인 후 5초를 기다린다. 과거 메시지 큐는 이후 검증에 사용하지 않는다.
  await new Promise(/** resolve: 5000밀리초 대기 완료 함수. */ resolve=>setTimeout(resolve,5000));
  const /** afterLeave: 5초 경과 뒤 실제로 새로 수신한 게임 상태. */ afterLeave=await nextLiveState(/** message: 새 게임 상태이며 첫 수신 자체를 검사 대상으로 삼는다. */ message=>true);
  assert.equal(afterLeave.room.phase,'started');assert.equal(afterLeave.room.hostId,b.id);
  assert.equal(afterLeave.room.players.length,1);assert.equal(afterLeave.room.players[0].id,b.id);
  assert.equal(rooms.get(code).phase,'started');assert.equal(rooms.get(code).hostId,b.id);assert.equal(rooms.get(code).players.size,1);
  const /** p: 서버의 B 개체; x: 이동 입력 직전 서버 X 좌표. */ p=rooms.get(code).players.get(b.id), x=p.x;
  const /** moved: 입력 전 수신기를 등록해 이후 B의 이동 상태를 기다리는 작업. */ moved=nextLiveState(/** message: 입력 이후 새로 수신한 게임 상태. */ message=>message.room.players.some(/** player: 이동 여부를 검사할 참가자. */ player=>player.id===b.id&&player.x>x));
  b.ws.send(JSON.stringify({v:1,type:'game.input',x:1,y:0,action:'A',playerId:a.id}));
  const /** state: B가 실제 이동한 새 게임 상태. */ state=await moved;
  assert.equal(state.room.players[0].id,b.id);assert.equal(state.room.players[0].action,'A');
  await a.command('room.create',{name:'다른 방'});
  assert.equal(rooms.has(code),true);
  await b.command('room.leave');await b.next('room.left');assert.equal(rooms.has(code),false);
});
test('heartbeat loss retains both players until the two-minute reconnect deadline',/** 방장·마지막 참가자의 끊김이 즉시 방을 삭제하지 않는지 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 let /** clock: 2분 경계를 검증할 서버 시각(ms). */ clock=Date.now();
 const /** a: 방장 연결; b: 참가자 연결; rooms: 방 목록; code: 진행 중 방 코드. */ {a,b,rooms,code}=await startedPair(t,{heartbeatMs:50,roomClock:/** 고정된 검증 시각을 제공한다. */ ()=>clock});
 const /** room: 유지 중인 게임. */ room=rooms.get(code);room.objects.clear();
 a.ws._autoPong=false;
 await waitFor(/** 무응답 방장이 유예 상태가 될 때까지 기다린다. */ ()=>room.players.get(a.id).disconnectedUntil!=null);
 assert.equal(room.players.size,2);assert.equal(room.hostId,a.id);
 b.ws.terminate();
 await waitFor(/** 마지막 연결도 종료될 때까지 기다린다. */ ()=>room.players.get(b.id).disconnectedUntil!=null);
 clock+=119999;
 await new Promise(/** 경계 직전 서버 틱을 기다린다. */ (/** resolve: 대기 완료 함수. */ resolve)=>setTimeout(resolve,70));
 assert.equal(room.players.size,2);assert.equal(rooms.has(code),true);
 clock+=1;await waitFor(/** 정확히 2분 뒤 빈 방이 제거될 때까지 기다린다. */ ()=>!rooms.has(code));
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
  const /** npc: 검증용 우호 NPC 개체. */ npc=createWorldObject({objectType:'npc',classificationCode:'NPC001',name:'주민',x:p.x+20,y:p.y,maxSkillResource:5,currentSkillResource:2});
  const /** enemy: 선택한 적대 개체 또는 해당 대상까지의 제곱 거리. */ enemy=createWorldObject({objectType:'enemy',classificationCode:'ENEMY001',name:'몬스터',x:p.x+50,y:p.y});
  room.objects.set(npc.id,npc);room.objects.set(enemy.id,enemy);
  let /** state: 현재 상태 스냅샷. */ state;do{state=await b.next('game.state');}while(!state.room.objects.some(/** object: 새 NPC가 포함된 상태인지 확인한다. */ object=>object.id===npc.id)||!state.room.objects.some(/** object: 새 적이 포함된 상태인지 확인한다. */ object=>object.id===enemy.id)||state.room.objects.length!==room.objects.size+room.players.size||!state.room.players.find(/** 대상 갱신이 끝난 본인 상태를 확인한다. */ (/** player: 수신 플레이어. */ player)=>player.id===b.id).status.nearestEnemyId);
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
  await b.next('game.result');assert.equal(p.x,x);assert.equal(p.status.state,'dead');assert.equal(room.players.has(b.id),false);
  await a.command('room.leave');assert.equal(rooms.has(code),false);
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
  for(const /** id: 사물 ID; object: 별도 검증 대상이 아닌 사물. */ [id,object] of room.objects)if(object.status.objectType==='prop')room.objects.delete(id);
  for(const /** id: 대상 개체 또는 요소의 식별자; x: 검증 좌표·비교 항목 또는 위치 조회 함수; hp: 검증용 현재체력. */ [id,x,hp] of [['near',10,8],['low',80,2]]) {const /** o: 현재 비교하거나 변환할 개체. */ o=createWorldObject({objectType:'enemy',classificationCode:id,instanceId:id,x:p.x+x,y:p.y,currentHealth:hp,healthRegen:0});room.objects.set(id,o);}
  const /** nextTarget: 지정한 대상 ID가 동기화될 때까지 기다리는 함수. */ nextTarget=/** nextTarget: 선택된 적 ID가 서버 스냅샷에 반영될 때까지 기다린다. */ async /** id: 대상 개체 또는 요소의 식별자. */ id=>{for(let /** i: 현재 반복 항목의 순번. */ i=0;i<10;i++){const /** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ m=await a.next('game.state');if(m.room.players.find(/** p: 검증 기준이 되는 개체 또는 표시 위치. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ p=>p.id===a.id).status.nearestEnemyId===id)return;}assert.fail('target did not update');};
  await nextTarget('near');
  a.ws.send(JSON.stringify({v:1,type:'game.options',targetPriority:'lowestHealth'}));await nextTarget('low');
  assert.equal(room.players.get(b.id).targetPriority,'nearest');
  assert.equal((await a.command('game.options',{targetPriority:'bad'},'error')).code,'INVALID_OPTIONS');
  room.objects.delete('low');await nextTarget('near');room.objects.clear();await nextTarget(b.id);
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

test('room countdown starts at creation and sends all five players to results at zero',/** 10분·1분 경계와 모든 참가자 퇴장·소켓 재사용을 검증한다. */ async (/** t: 테스트 정리 문맥. */ t)=>{
 let /** clock: 실제 11분을 기다리지 않고 진행할 서버 방 시각. */ clock=0;
 const /** client: 연결 생성 함수; rooms: 실제 방 목록. */ {client,rooms}=await setup(t,{/** 테스트 시각을 반환한다. */ roomClock:()=>clock});
 const /** clients: 방에 참가할 5개 연결. */ clients=await Promise.all(Array.from({length:5},client));
 await clients[0].command('room.create',{name:'방장'});
 const /** code: 만료를 검증할 방 코드. */ code=(await clients[0].next('room.state')).room.code;
 for(const /** connection: 입장할 일반 참가자. */ connection of clients.slice(1)) {await connection.command('room.join',{name:'참가자',code});await connection.command('room.ready',{ready:true});}
 clock=599999;await clients[0].command('room.start');
 let /** state: 시간 경계를 검증할 서버 스냅샷. */ state=await clients[0].next('game.state');
 assert.equal(state.room.timer.remainingMs,1);assert.equal(state.room.timer.createdAt,0);
 clock=600000;
 for(const /** connection: 점수화면을 받을 참가자. */ connection of clients){
  const /** result: 서버 확정 결과. */ result=(await connection.next('game.result')).result;assert.equal(result.reason,'TIME_LIMIT');
  await connection.command('game.result.seen',{resultId:result.id});await connection.command('game.result.leave',{resultId:result.id});
 }
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

test('multiplayer snapshots expose monotonic server timestamps and ordered sequence',/** 서버 전송 시각·순번이 상대 보간에 사용할 수 있는 형태인지 검사한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 접속 클라이언트. */ {a}=await startedPair(t);
 const /** first: 먼저 생성된 상태; second: 다음 상태. */ first=(await a.next('game.state')).room,second=(await a.next('game.state')).room;
 assert.ok(Number.isFinite(first.serverTime));assert.ok(Number.isSafeInteger(first.snapshotSequence));
 assert.ok(second.serverTime>=first.serverTime);assert.ok(second.snapshotSequence>first.snapshotSequence);
});

test('server poison starts three minutes after game start rather than room creation',/** 실제 서버 틱에서 시작 시각·방어력 무시·반복 차감을 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 let /** clock: 제어할 방·게임 시각. */ clock=0;
 const /** client: 접속 생성기; rooms: 실제 방 목록. */ {client,rooms}=await setup(t,{roomClock:/** 검증 시각을 반환한다. */ ()=>clock});
 const /** host: 방장 연결. */ host=await client();await host.command('room.create',{name:'독기검증'});
 const /** code: 생성한 방 코드. */ code=(await host.next('room.state')).room.code;
 clock=60000;await host.command('room.start');
 const /** room: 시작한 방; player: 시작 지형 1층 플레이어. */ room=rooms.get(code),player=room.players.get(host.id);
 assert.equal(room.gameStartedAt,60000);player.status.healthRegen=0;player.status.defense=999;
 clock=239999;do{await host.next('game.state');}while(room.poisonPulse<59);assert.equal(player.status.currentHealth,10);
 clock=240000;do{await host.next('game.state');}while(room.poisonPulse<60);assert.equal(player.status.currentHealth,7);
 clock=243000;do{await host.next('game.state');}while(room.poisonPulse<61);assert.equal(player.status.currentHealth,4);
});

test('multiplayer PvP targets and damages the other player without hurting NPCs',/** 서버에서 플레이어 자동 타겟·피해 동기화·NPC 보호를 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 공격자 연결; b: 피격자 연결; rooms: 방 목록; code: 방 코드. */ {a,b,rooms,code}=await startedPair(t);
 const /** room: 게임 방; attacker: 공격자; target: 피격자. */ room=rooms.get(code),attacker=room.players.get(a.id),target=room.players.get(b.id);
 target.x=attacker.x+40;target.y=attacker.y;attacker.status.healthRegen=0;target.status.healthRegen=0;
 const /** createWorldObject: 공통 유닛 생성기. */ {createWorldObject}=await import('../game/status.js');
 const /** npc: 공격 범위 안 보호 대상. */ npc=createWorldObject({objectType:'npc',classificationCode:'NPC',x:attacker.x+20,y:attacker.y});room.objects.set(npc.id,npc);
 a.ws.send(JSON.stringify({v:1,type:'game.cast',slot:'A'}));
 do{await b.next('game.state');}while(!room.skillEffects.length);
 assert.equal(attacker.status.nearestEnemyId,target.id);assert.equal(target.status.currentHealth,4);assert.equal(npc.status.currentHealth,10);assert.equal(attacker.status.currentHealth,10);
 assert.deepEqual(room.skillEffects[0].hits,[target.id]);
});

test('room start spawns monsters and synchronizes server AI, retaliation effects and private timers', /** 실제 서버 생성·상태 전송·피격 후 AI 시전 연결을 검사한다. */ async (/** t: 서버 정리 문맥. */ t) => {
  const /** client: 연결 생성 함수; rooms: 서버 방 목록. */ {client,rooms}=await setup(t);
  const /** connection: 검증용 플레이어 연결. */ connection=await client();
  await connection.command('room.create',{name:'몬스터검증'});
  const /** initial: 대기실 스냅샷. */ initial=(await connection.next('room.state')).room;
  await connection.command('room.start');
  let /** state: 실제 게임 시작 스냅샷. */ state;
  do{state=(await connection.next('room.state')).room;}while(state.phase!=='started');
  const /** room: 서버 내부 게임 방. */ room=rooms.get(initial.code);
  const /** monsters: 생성된 몬스터 스냅샷. */ monsters=state.objects.filter(/** 적만 조회한다. */ (/** object: 수신 개체. */ object)=>object.status.objectType==='enemy');
  assert.ok(monsters.length>0);assert.equal(monsters.length,[...room.objects.values()].filter(/** 몬스터만 센다. */ (/** object: 서버 개체. */ object)=>object.status.objectType==='enemy').length);
  for(const /** snapshot: 검증할 몬스터 스냅샷. */ snapshot of monsters) {
    assert.deepEqual(snapshot.status.spawnPosition,{x:snapshot.x,y:snapshot.y});
    assert.equal(snapshot.status.awarenessState,'normal');assert.equal(snapshot.status.attackTargetId,null);
    assert.equal(snapshot.monsterAI,undefined);assert.ok(['몬스터A01','몬스터A02','몬스터A03','몬스터A04','몬스터C01','몬스터C02'].includes(snapshot.presetId));
    const /** tile: 해당 몬스터 생성 지형. */ tile=room.map.tiles.find(/** 생성 타일을 조회한다. */ (/** candidate: 타일 후보. */ candidate)=>candidate.id===snapshot.spawnTileId);
    // 보스와 일반 프리셋의 필드 종류·높이를 각각 검증한다.
    if(snapshot.status.classificationCode==='TEST003'){assert.equal(tile.kind,'boss');assert.ok((snapshot.presetId==='몬스터C01'?[1,2]:[3,4]).includes(tile.height));}
    else{assert.ok(['normal','rich'].includes(tile.kind));assert.ok(snapshot.presetId==='몬스터A01'?[1,2].includes(tile.height):tile.height===Number(snapshot.presetId.slice(-2)));}
  }
  const /** monster: 1.5초 반격 패턴을 검증할 일반 몬스터. 보스 패턴과 구분한다. */ monster=[...room.objects.values()].find(/** 일반 반격 프리셋만 고른다. */ (/** object: 서버 개체. */ object)=>object.presetId==='몬스터A01');
  const /** attacker: 인위적 피해의 실제 공격자. */ attacker=room.players.get(connection.id);
  // 생성점까지의 직선이 지형 안에 있도록 대상과 몬스터의 중심을 잠시 일치시킨다.
  attacker.x=monster.x;attacker.y=monster.y;attacker.status.maxHealth=1000;attacker.status.currentHealth=1000;
  const /** applySkillDamage: 공통 기술 피해 함수. */ {applySkillDamage}=await import('../game/combat.js');
  applySkillDamage({id:'integration-hit',casterId:attacker.id,code:'BAS0001',resultSequence:0},monster,1,Date.now(),attacker);
  let /** retaliated: 서버 AI가 공격 표시를 생성했는지 여부. */ retaliated=false;
  for(let /** attempt: 1.5초 공격 준비와 전송 여유를 포함한 반격 스냅샷 대기 횟수. */ attempt=0;attempt<60;attempt++) {
    state=(await connection.next('game.state')).room;
    if(state.skillEffects.some(/** 해당 몬스터의 시전을 찾는다. */ (/** effect: 수신 기술 표시. */ effect)=>effect.casterId===monster.id&&effect.code==='BAS0001')){retaliated=true;break;}
  }
  assert.equal(retaliated,true);
  const /** snapshot: AI가 갱신한 몬스터 수신 상태. */ snapshot=state.objects.find(/** ID로 몬스터를 찾는다. */ (/** object: 수신 개체. */ object)=>object.id===monster.id);
  assert.equal(snapshot.status.attackTargetId,attacker.id);assert.equal(snapshot.status.awarenessState,'combat');assert.equal(snapshot.monsterAI,undefined);
});

test('return lamps validate ownership, confirmation, distance and result-screen exit receipt',/** 실제 연결로 탈출·결과 확인·재입장 조건을 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 소유자 연결; b: 다른 연결; rooms: 서버 방 목록; code: 방 코드. */ {a,b,rooms,code}=await startedPair(t,{keepProps:true});
 const /** room: 진행 중인 방; player: 전등 소유자; lamp: 소유 전등. */ room=rooms.get(code),player=room.players.get(a.id),lamp=[...room.objects.values()].find(/** 소유 전등 조회. */ (/** object: 사물 후보. */ object)=>object.ownerId===a.id);
 assert.equal([...room.objects.values()].filter(/** 전등만 조회. */ (/** object: 개체. */ object)=>object.status.classificationCode==='OBJ0001').length,2);
 assert.equal(lamp.x,player.x);assert.equal(lamp.y,player.y);assert.equal(lamp.ownerCode,player.status.classificationCode);
 assert.equal((await b.command('game.interact',{targetId:lamp.id},'error')).code,'INTERACTION_UNAVAILABLE');
 await a.command('game.interact',{targetId:lamp.id});const /** cancel: 취소할 확인 ID. */ cancel=await a.next('interaction.prompt');
 await a.command('game.interact.confirm',{confirmationId:cancel.id,accept:false});assert.equal(room.players.has(a.id),true);
 assert.equal((await a.command('game.interact.confirm',{confirmationId:cancel.id,accept:true},'error')).code,'INVALID_INTERACTION');
 await a.command('game.interact',{targetId:lamp.id});const /** distant: 거리 재검증용 ID. */ distant=await a.next('interaction.prompt');player.x=lamp.x+60.01;
 assert.equal((await a.command('game.interact.confirm',{confirmationId:distant.id,accept:true},'error')).code,'INTERACTION_UNAVAILABLE');player.x=lamp.x;
 player.status.competitionPoints=123;
 await a.command('game.interact',{targetId:lamp.id});const /** prompt: 수락할 확인 ID. */ prompt=await a.next('interaction.prompt');
 await a.command('game.interact.confirm',{confirmationId:prompt.id,accept:true});const /** result: 서버 확정 점수. */ result=(await a.next('game.result')).result;
 assert.equal(result.reason,'ESCAPE');assert.equal(result.competitionPoints,123);assert.equal(lamp.interactionEnabled,false);assert.equal(lamp.status.currentHealth,50);assert.equal(room.players.has(a.id),false);assert.equal(room.hostId,b.id);
 assert.equal((await a.command('room.create',{name:'A'},'error')).code,'RESULT_PENDING');
 assert.equal((await a.command('game.result.leave',{resultId:result.id},'error')).code,'RESULT_NOT_SEEN');
 assert.equal((await b.command('game.result.seen',{resultId:result.id},'error')).code,'INVALID_RESULT');
 await a.command('game.result.seen',{resultId:result.id});await a.command('game.result.leave',{resultId:result.id});await a.next('game.result.left');
 assert.equal(player.ws.completedResult.competitionPoints,123);assert.ok(player.ws.completedResult.seenAt);assert.ok(player.ws.completedResult.completedAt);
 assert.equal((await a.command('game.result.leave',{resultId:result.id},'error')).code,'INVALID_RESULT');
 await a.command('room.create',{name:'다시 시작'});assert.equal(rooms.size,2);
});

test('death freezes competition points and destroyed lamps cannot confirm escape',/** 사망 결과와 전등 파괴 직후 재검증을 확인한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 소유자; b: 생존자; rooms: 서버 방 목록; code: 방 코드. */ {a,b,rooms,code}=await startedPair(t,{keepProps:true});
 const /** room: 진행 방; player: 사망시킬 플레이어; lamp: 소유 전등. */ room=rooms.get(code),player=room.players.get(a.id),lamp=[...room.objects.values()].find(/** 소유 사물 조회. */ (/** object: 개체. */ object)=>object.ownerId===a.id);
 await a.command('game.interact',{targetId:lamp.id});const /** prompt: 파괴 전 발급한 확인. */ prompt=await a.next('interaction.prompt');lamp.status.currentHealth=0;lamp.status.state='dead';
 assert.equal((await a.command('game.interact.confirm',{confirmationId:prompt.id,accept:true},'error')).code,'INTERACTION_UNAVAILABLE');
 player.status.competitionPoints=77;player.status.currentHealth=0;
 const /** result: 사망 확정 결과. */ result=(await a.next('game.result')).result;
 assert.equal(result.reason,'DEATH');assert.equal(result.competitionPoints,77);player.status.competitionPoints=999;assert.equal(player.ws.matchResult.competitionPoints,77);assert.equal(player.ws.matchResult.seenAt,null);assert.equal(room.players.size,1);assert.equal(room.hostId,b.id);
});


test('live-server test options require the exact server player name and never affect other players',/** 위조 요청 거부·이동속도 적용·복구·새 게임 초기화를 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 열쇠 접속자; b: 일반 접속자; rooms: 서버 방 목록; code: 방 코드. */ {a,b,rooms,code}=await startedPair(t,{hostName:'열쇠'});
 const /** room: 진행 중 방; player: 테스트 권한 개체; other: 일반 개체. */ room=rooms.get(code),player=room.players.get(a.id),other=room.players.get(b.id);
 assert.deepEqual(player.testOptions,{mapHack:false,highSpeed:false});assert.equal(player.status.moveSpeed,2);
 assert.equal((await b.command('game.testOptions',{name:'열쇠',playerId:a.id,mapHack:true,highSpeed:true},'error')).code,'FORBIDDEN');
 assert.equal((await a.command('game.testOptions',{mapHack:'true',highSpeed:true},'error')).code,'INVALID_OPTIONS');assert.equal(player.status.moveSpeed,2);
 await a.command('game.testOptions',{mapHack:true,highSpeed:true});assert.equal(player.status.moveSpeed,6);assert.equal(other.status.moveSpeed,2);assert.deepEqual(other.testOptions,{mapHack:false,highSpeed:false});
 const /** step: 실제 서버·클라이언트가 공유하는 50ms 이동 결과. */ step=globalThis.MovementRules.step({x:0,y:0},{x:1,y:0},player.status);
 assert.equal(step.x,33);
 let /** state: 변경된 설정이 포함된 서버 스냅샷. */ state;
 do{state=(await a.next('room.state')).room;}while(!state.players.find(/** 본인 스냅샷 조회. */ (/** item: 참가자. */ item)=>item.id===a.id)?.testOptions?.highSpeed);
 assert.equal(state.players.find(/** 본인 조회. */ (/** item: 참가자. */ item)=>item.id===a.id).status.effective.moveSpeed,6);
 await a.command('game.testOptions',{mapHack:false,highSpeed:true});assert.equal(player.testBaseMoveSpeed,2);assert.equal(player.status.moveSpeed,6);
 await a.command('game.testOptions',{mapHack:false,highSpeed:false});assert.equal(player.status.moveSpeed,2);assert.equal(player.testBaseMoveSpeed,undefined);
 player.status.moveSpeed=4;await a.command('game.testOptions',{mapHack:true,highSpeed:true});await a.command('game.testOptions',{mapHack:false,highSpeed:false});assert.equal(player.status.moveSpeed,4);
 await a.command('room.leave');await a.command('room.create',{name:'열쇠'});
 const /** nextPlayer: 같은 연결의 새 방 플레이어. */ nextPlayer=[...rooms.values()].find(/** 새 방 조회. */ (/** candidate: 방. */ candidate)=>candidate.players.has(a.id)).players.get(a.id);
 assert.deepEqual(nextPlayer.testOptions,{mapHack:false,highSpeed:false});assert.equal(nextPlayer.status.moveSpeed,2);
});

test('three actual monster kills synchronize level and experience to multiplayer snapshots',/** 서버 시전부터 경험치 지급·레벨업·동기화까지 실제 연결로 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
 const /** a: 공격자 연결; b: 관찰자 연결; rooms: 서버 방 목록; code: 방 코드. */ {a,b,rooms,code}=await startedPair(t);
 const /** room: 진행 중 방; player: 경험치 획득 플레이어; createMonster: 실제 몬스터 생성기. */ room=rooms.get(code),player=room.players.get(a.id),{createMonster}=await import('../game/monsters.js');
 room.objects.clear();room.items.clear();player.status.attack=100; // 자동 조각 획득 경험치가 처치 경험치 검증에 섞이지 않게 한다.
 for(let /** index: 처치 순번. */ index=0;index<3;index++){
  const /** monster: 프리셋 경험치20 처치 대상. */ monster=createMonster('몬스터A01',{x:player.x+30,y:player.y});monster.status.stunned=true;room.objects.set(monster.id,monster);
  a.ws.send(JSON.stringify({v:1,type:'game.cast',slot:'A'}));
  while(monster.status.state!=='dead')await a.next('game.state');
  if(index<2)await new Promise(/** 기술 쿨타임 종료를 기다린다. */ (/** resolve: 대기 완료 함수. */ resolve)=>setTimeout(resolve,510));
 }
 assert.equal(player.status.level,2);assert.equal(player.status.currentExperience,10);assert.equal(player.status.requiredExperience,90);
 let /** state: 관찰자가 받은 최신 방 스냅샷. */ state;
 do{state=(await b.next('game.state')).room;}while(state.players.find(/** 공격자 조회. */ (/** item: 참가자. */ item)=>item.id===a.id)?.status.level!==2);
 const /** status: 관찰자에게 전달한 실제 플레이어 수치. */ status=state.players.find(/** 본인 조회. */ (/** item: 참가자. */ item)=>item.id===a.id).status;
 assert.equal(status.currentExperience,10);assert.equal(status.requiredExperience,90);assert.equal(status.bonusAttack,2);assert.equal(status.skillPoints,2);assert.equal(status.effective.maxHealth,20);
});
