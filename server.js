import './public/poison.js';
import './public/input-timeline.js';
import './public/items.js';
import './public/pit-map-rules.js';
import { /** generateRoomMap: 원본 구덩이 규칙으로 서버 맵을 생성한다. */ generateRoomMap } from './game/map-generator.js';
import './public/room-timer.js';
import './public/movement.js';
import { /** spawnMonsters: 일반 필드타일에 프리셋별 수량을 생성한다. */ spawnMonsters, /** tickMonsters: 서버에서 배회·반격·복귀 행동을 실행한다. */ tickMonsters } from './game/monster-ai.js';
import { /** castSkill: 슬롯의 쿨타임과 상태를 검사하고 기술을 시전한다. */ castSkill, /** skillCooldownRemaining: 슬롯의 서버 쿨타임 잔여 시간을 구한다. */ skillCooldownRemaining, /** skillSnapshot: 판정 내부 기록을 제외한 전송 데이터를 만든다. */ skillSnapshot, /** updateSkillCooldowns: 서버 기준 잔여 대기를 갱신한다. */ updateSkillCooldowns, /** getSkillSlotNames: 할당된 기술의 표시 이름을 조회한다. */ getSkillSlotNames } from './game/skills.js';
import /** http: 게임 HTTP 서버 생성 기능을 제공한다. */ http from 'node:http';
import { /** createAuthService: 제공자 로그인·앱 세션·계정 설정 API와 만료 정리를 구성한다. */ createAuthService } from './auth/service.js';
import { /** createStatus: 모든 개체가 공유하는 수치·기술 슬롯·상태를 검증해 생성한다. */ createStatus, /** ObjectType: 플레이어·NPC·적의 개체 분류 상수. */ ObjectType, /** LifeState: 생존·사망 상태 상수. */ LifeState, /** effectiveStats: 기본 수치에 추가 수치를 합산하고 음수를 방지한 최종 능력치를 계산한다. */ effectiveStats, /** normalizeVitals: 체력·자원을 최종 최대치 안으로 제한하고 사망 상태를 정규화한다. */ normalizeVitals, /** regenerate: 생존 개체의 체력과 스킬자원을 경과 시간만큼 회복한다. */ regenerate, /** updateNearestObjects: 생존 개체의 최근접 개체와 설정 우선순위에 맞는 적 ID를 갱신한다. */ updateNearestObjects, /** TargetPriority: 허용하는 공격 우선대상 선택 방식. */ TargetPriority } from './game/status.js';
import { /** readFile: 정적 파일을 비동기로 읽는다. */ readFile } from 'node:fs/promises';
import { /** randomBytes: 방 코드와 인증 증명에 사용할 암호학적 난수를 생성한다. */ randomBytes, /** randomUUID: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ randomUUID } from 'node:crypto';
import { /** pathToFileURL: 현재 실행 파일과 모듈 주소를 비교할 수 있도록 URL로 변환한다. */ pathToFileURL } from 'node:url';
import { /** WebSocketServer: 서버의 WebSocket 연결과 프레임 처리를 제공한다. */ WebSocketServer, /** WebSocket: 클라이언트 연결 생성 또는 WebSocket 연결 상태 상수를 제공한다. */ WebSocket } from 'ws';

/** MAX_PLAYERS: 방장을 포함한 방 정원. */
export const MAX_PLAYERS=5;
export /** createGameServer: 방·게임 시뮬레이션·정적 파일·인증을 제공하는 서버를 생성한다. */ function createGameServer(/** heartbeatMs: 연결 생존 확인 주기(밀리초); authOptions: 인증 서비스 생성 옵션; roomClock: 방 수명 검증에 사용할 서버 시계 함수. */ { heartbeatMs = 15000, auth: authOptions = {}, roomClock = Date.now } = {}) {
  const /** rooms: 접속코드별 방 상태를 보관하는 맵. */ rooms = new Map();
  const /** auth: 앱 로그인과 계정 API를 처리하는 인증 서비스. */ auth = createAuthService(authOptions);
  const /** files: 외부에 제공할 정적 파일 경로와 MIME 형식. */ files = { '/pit-map-rules.js': ['pit-map-rules.js','text/javascript'], '/minimap.js': ['minimap.js','text/javascript'], '/item-view.js': ['item-view.js','text/javascript'], '/items.js': ['items.js','text/javascript'], '/map-renderer.js': ['map-renderer.js','text/javascript'], '/room-timer.js': ['room-timer.js', 'text/javascript'], '/movement.js': ['movement.js', 'text/javascript'], '/pit-map.html': ['pit-map.html', 'text/html'], '/motion.js': ['motion.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/viewport.js': ['viewport.js', 'text/javascript'], '/client-mode.js': ['client-mode.js', 'text/javascript'], '/app': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'] };
  const /** server: 정적 파일과 WebSocket 연결을 제공하는 HTTP 서버. */ server = http.createServer(/** 현재 비동기 작업의 완료 또는 후속 처리를 수행한다. */ async (/** req: 수신한 HTTP 요청. */ req, /** res: HTTP 응답 작성 객체. */ res) => {
    if (await auth.handle(req,res)) return;
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"protocolVersion":1}'); }
    const /** file: 읽거나 저장할 파일 경로. */ file = files[req.url];
    if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end(); }
    try {
      const /** body: 응답 또는 요청 본문 데이터. */ body = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(500); res.end('Server error'); }
  });
  const /** wss: 게임 연결을 관리하는 WebSocket 서버. */ wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const /** send: 버전과 메시지 유형을 붙여 송신하는 함수. */ send = /** send: 메시지 종류와 프로토콜 버전을 붙여 현재 연결로 전송한다. */ (/** ws: 현재 처리 중인 WebSocket 연결. */ ws, /** type: 처리하거나 기다릴 메시지 또는 이벤트 유형. */ type, /** data: 전달하거나 해석한 데이터. */ data = {}) => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 65536) return ws.terminate();
      ws.send(JSON.stringify({ v: 1, type, ...data }));
    }
  };
  const /** objectSnapshot: 개체를 전송용 상태로 복사하는 함수. */ objectSnapshot = /** p: 현재 처리하는 플레이어 또는 검증 개체. */ /** objectSnapshot: 개체의 최종 수치를 계산하고 전송 가능한 상태만 복사한다. */ p => {
    updateSkillCooldowns(p);
    const /** effective: 추가 수치를 합산한 최종 스테이터스. */ effective = normalizeVitals(p.status);
    return { id: p.id, name: p.name, x: p.x, y: p.y, action: p.action, facing: p.facing ?? -Math.PI / 2, inputQueueLength:p.inputQueue?.length??0,inputQueueDelayMs:p.inputQueue?.length?Math.max(0,Date.now()-(p.inputQueue[0].receivedAt??Date.now())):0,playerNumber:p.playerNumber??null,spawnTileId:p.spawnTileId??null,presetId:p.presetId??null,skillNames:getSkillSlotNames(p.status), lastProcessedInput: p.lastProcessedInput ?? 0, roll:p.roll?{...p.roll}:null, lastMovementInput:p.lastMovementInput??{x:0,y:0}, status: { ...p.status, effective } };
  };
  const /** allObjects: 방의 플레이어와 일반 개체를 함께 조회하는 함수. */ allObjects = /** room: 현재 처리하는 방의 상태. */ /** allObjects: 방 안의 플레이어와 NPC·적을 하나의 목록으로 모은다. */ room => [...room.players.values(), ...room.objects.values()];
  const /** snapshot: 방 상태를 전송용 데이터로 변환하는 함수. */ snapshot = /** room: 현재 처리하는 방의 상태. */ /** snapshot: 현재 방의 참가자·개체·기술 효과를 전송용 스냅샷으로 만든다. */ (room, /** includeMap: 지도는 초기 상태에만 포함하고 틱 전송에서는 생략한다. */ includeMap=true) => {
    const /** objects: 처리할 월드 개체 목록. */ objects = allObjects(room);
    for (const /** object: 현재 처리하는 월드 개체. */ object of objects) normalizeVitals(object.status);
    // 대상 참조는 100밀리초 주기의 서버 시뮬레이션에서 갱신한다.
    /** room.snapshotSequence: 방별 상태 전송 순번. */ room.snapshotSequence=(room.snapshotSequence??0)+1;
    /** room.snapshotTime: 시계 역행 시에도 감소하지 않는 상태 생성 시각(ms). */ room.snapshotTime=Math.max(room.snapshotTime??0,Date.now());
    return {
      snapshotSequence:room.snapshotSequence,serverTime:room.snapshotTime,
      ...(includeMap&&room.map?{map:room.map}:{}), mapId:room.map?.id??null, private:room.private??false,code: room.code, hostId: room.hostId, phase: room.phase, maxPlayers:MAX_PLAYERS, timer:globalThis.RoomTimerRules.snapshot(room,roomClock()),
      players: [...room.players.values()].map(/** p: 현재 처리하는 플레이어 또는 검증 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ p => ({ ...objectSnapshot(p), ready: p.ready })),
      objects: objects.map(objectSnapshot),
      ...(includeMap?{items:[...(room.items??new Map()).values()]}:{itemChanges:room.itemChanges}),
      skillEffects: (room.skillEffects ?? []).map(/** effect: 시전 위치·피해 결과·표시 만료 시각을 담은 기술 효과. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ effect => skillSnapshot(effect)),
    };
  };
  const /** broadcast: 방 참가자 전체에 상태를 전송하는 함수. */ broadcast = /** room: 현재 처리하는 방의 상태. */ /** broadcast: 방 참가자 모두에게 최신 방 상태를 알린다. */ room => { for (const /** p: 현재 처리하는 플레이어 또는 검증 개체. */ p of room.players.values()) send(p.ws, 'room.state', { room: snapshot(room) }); };
  /** 시간 만료 시 전원을 방에서 분리하고 방 데이터·효과를 정리한다. 소켓 연결 자체는 유지한다. */
  function closeExpiredRoom(/** room: 종료할 방. */ room) {
    rooms.delete(room.code);
    for(const /** player: 퇴장시킬 방 참가자. */ player of room.players.values()) {
      player.ws.roomCode=null;
      send(player.ws,'room.closed',{reason:'TIME_LIMIT',message:'제한 시간이 지나 방이 종료되었습니다.'});
    }
    room.players.clear();room.objects.clear();room.skillEffects=[];
  }
  /** leave: 대기실·진행 중 상태에 맞춰 퇴장과 방장 승계·방 삭제를 처리한다. */ function leave(/** ws: 현재 처리 중인 WebSocket 연결. */ ws) {
    const /** room: 현재 처리하는 방의 상태. */ room = rooms.get(ws.roomCode);
    ws.roomCode = null;
    if (!room) return;
    if (room.hostId === ws.id && room.phase === 'lobby') {
      rooms.delete(room.code);
      for (const /** p: 현재 처리하는 플레이어 또는 검증 개체. */ p of room.players.values()) { p.ws.roomCode = null; send(p.ws, 'room.closed', { message: '방이 해제되었습니다.' }); }
    } else {
      room.players.delete(ws.id); send(ws, 'room.left');
      if (!room.players.size) rooms.delete(room.code);
      else {
        if (room.hostId === ws.id) { room.hostId = room.players.keys().next().value; room.players.get(room.hostId).ready = false; }
        broadcast(room);
      }
    }
  }
  /** 이동 순서가 도달한 기술을 실행 시점의 상태·쿨타임으로 검증한다. */
  function executeCast(/** room: 현재 방. */ room,/** caster: 시전자. */ caster,/** command: 예약한 슬롯·요청 ID. */ command,/** now: 서버 실행 시각. */ now){
    if(!room.players.has(caster.id))return;
    if(caster.roll?.remaining>0){send(caster.ws,'error',{code:'ACTION_LOCKED',message:'구르는 동안에는 기술을 사용할 수 없습니다.',requestId:command.requestId});return;}
    if(skillCooldownRemaining(caster,command.slot,now)>0){send(caster.ws,'error',{code:'SKILL_COOLDOWN',message:'기술 재사용 대기 중입니다.',requestId:command.requestId});return;}
    updateNearestObjects(allObjects(room));
    const /** effect: 이동을 반영한 시전자 위치에서 생성된 효과. */ effect=castSkill(caster,allObjects(room),command.slot,now);
    if(effect?.kind==='roll'){caster.movementClock??={last:now,credit:0};caster.movementClock.last=now;caster.movementClock.credit=0;}
    if(effect&&effect.kind!=='roll'){room.skillEffects??=[];room.skillEffects.push(effect);}
  }
  wss.on('connection', /** connection 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ (/** ws: 현재 처리 중인 WebSocket 연결. */ ws, /** req: 수신한 HTTP 요청. */ req) => {
    const /** allowed: 서버에서 허용하는 브라우저 출처. */ allowed = process.env.ALLOWED_ORIGIN;
    if (req.headers.origin && req.headers.origin !== (allowed || `http://${req.headers.host}`) && req.headers.origin !== (!allowed ? `https://${req.headers.host}` : allowed)) { ws.close(1008, 'Origin rejected'); return; }
    const /** mode: 웹 게스트와 APK 계정을 구분하는 접속 모드. */ mode = new URL(req.url,'http://local').searchParams.get('client') === 'app' ? 'app' : 'web';
    ws.account = auth.identity(req,mode);
    if (mode === 'app' && !ws.account) { ws.close(1008,'App login required'); return; }
    ws.id = randomUUID(); ws.alive = true; ws.windowStart = Date.now(); ws.count = 0;
    send(ws, 'welcome', { playerId: ws.id });
    ws.on('pong', /** pong 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ () => { ws.alive = true; });
    ws.on('error', /** error 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ () => {});
    ws.on('close', /** close 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ () => leave(ws));
    ws.on('message', /** message 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ (/** raw: 수신한 원본 메시지. */ raw, /** binary: 바이너리 프레임 수신 여부. */ binary) => {
      const /** error: 오류 정보 또는 오류 응답 처리기. */ error = /** error: 요청 실패 내용을 오류 응답으로 전달한다. */ (/** code: 개체·기술·방 또는 오류를 식별하는 코드. */ code, /** message: 사용자나 연결에 전달할 안내 내용. */ message, /** requestId: 요청과 응답을 대응시키는 식별자. */ requestId) => send(ws, 'error', { code, message, requestId });
      if (Date.now() - ws.windowStart > 10000) { ws.windowStart = Date.now(); ws.count = 0; }
      if (++ws.count > 500) return error('RATE_LIMIT', '요청이 너무 많습니다. 잠시 후 다시 시도하세요.');
      let /** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ m;
      try { m = JSON.parse(raw.toString()); } catch { return error('BAD_MESSAGE', '올바른 JSON이 필요합니다.'); }
      if (binary || !m || Array.isArray(m) || m.v !== 1 || typeof m.type !== 'string' || (m.requestId !== undefined && (typeof m.requestId !== 'string' || m.requestId.length > 64))) return error('BAD_MESSAGE', '지원하지 않는 메시지입니다.');
      const /** fail: 현재 요청 식별자를 포함해 오류를 반환하는 함수. */ fail = /** fail: 현재 요청 ID와 함께 게임 명령 실패를 전달한다. */ (/** code: 개체·기술·방 또는 오류를 식별하는 코드. */ code, /** message: 사용자나 연결에 전달할 안내 내용. */ message) => error(code, message, m.requestId);
      let /** room: 현재 처리하는 방의 상태. */ room = rooms.get(ws.roomCode);
      if(room && globalThis.RoomTimerRules.expired(room,roomClock())) {closeExpiredRoom(room);room=null;}
      if(m.type==='room.list'){
        const /** available: 공개된 시작 대기방의 최소 목록 자료. */ available=[...rooms.values()].filter(/** 공개·대기·미만료 방만 노출한다. */ (/** candidate: 조회할 방. */ candidate)=>!candidate.private&&candidate.phase==='lobby'&&!globalThis.RoomTimerRules.expired(candidate,roomClock())).map(/** 선택 화면에 필요한 값만 보낸다. */ (/** candidate: 공개 방. */ candidate)=>({code:candidate.code,hostName:candidate.players.get(candidate.hostId)?.name??'',playerCount:candidate.players.size,maxPlayers:MAX_PLAYERS}));
        send(ws,'room.list',{rooms:available,requestId:m.requestId});
      }else if(m.type==='room.privacy'){
        if(!room)return fail('NOT_IN_ROOM','참여 중인 방이 없습니다.');
        if(room.phase!=='lobby')return fail('GAME_STARTED','이미 시작한 방입니다.');
        if(room.hostId!==ws.id)return fail('FORBIDDEN','방장만 공개 여부를 변경할 수 있습니다.');
        if(typeof m.private!=='boolean')return fail('INVALID_PRIVACY','Private 값은 체크 여부여야 합니다.');
        room.private=m.private;broadcast(room);
      }else if (m.type === 'room.create' || m.type === 'room.join') {
        if (room) return fail('ALREADY_IN_ROOM', '이미 방에 참여 중입니다.');
        if (typeof m.name !== 'string' || !m.name.trim() || m.name.trim().length > 20 || /[\x00-\x1f]/.test(m.name)) return fail('INVALID_NAME', '이름은 1~20자로 입력하세요.');
        if (m.type === 'room.create') {
          if (rooms.size >= 1000) return fail('SERVER_FULL', '서버가 가득 찼습니다.');
          let /** code: 개체·기술·방 또는 오류를 식별하는 코드. */ code; do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (rooms.has(code));
          room = { ...globalThis.RoomTimerRules.create(roomClock()), code, hostId: ws.id, phase: 'lobby', private:false, players: new Map(), objects: new Map() }; rooms.set(code, room);
        } else {
          if (typeof m.code !== 'string' || !/^[A-F0-9]{6}$/.test(m.code.trim().toUpperCase())) return fail('INVALID_CODE', '접속코드 6자리를 확인하세요.');
          room = rooms.get(m.code.trim().toUpperCase());
          if(room && globalThis.RoomTimerRules.expired(room,roomClock())) {closeExpiredRoom(room);room=null;}
          if (!room) return fail('ROOM_NOT_FOUND', '방을 찾을 수 없습니다.');
          if(m.publicOnly===true&&room.private)return fail('ROOM_PRIVATE','비공개로 변경된 방입니다. 접속코드로 참여해 주세요.');
          if (room.phase !== 'lobby') return fail('GAME_STARTED', '이미 시작한 방입니다.');
          if (room.players.size >= MAX_PLAYERS) return fail('ROOM_FULL', '방이 꽉찼습니다');
        }
        ws.roomCode = room.code; room.players.set(ws.id, { id: ws.id, name: m.name.trim(), ready: false, x: 0, y: 0, input: { x: 0, y: 0 }, inputAt: 0, action: null, facing: -Math.PI / 2, targetPriority: 'nearest', status: createStatus({ objectType: ObjectType.PLAYER, classificationCode: ws.account?.id ?? ws.id, instanceId: ws.id }), ws }); broadcast(room);
      } else if (m.type === 'game.options') {
        if (!room) return fail('NOT_IN_ROOM', '참여 중인 방이 없습니다.');
        if (!TargetPriority.includes(m.targetPriority)) return fail('INVALID_OPTIONS', '올바른 공격 우선대상이 필요합니다.');
        room.players.get(ws.id).targetPriority = m.targetPriority;
        return;
      } else if (m.type === 'game.cast') {
        if (!room) return fail('NOT_IN_ROOM', '참여 중인 방이 없습니다.');
        if (room.phase !== 'started') return fail('GAME_NOT_STARTED', '게임 시작 후 사용할 수 있습니다.');
        if (!['A','B','C'].includes(m.slot)) return fail('INVALID_SKILL', '올바른 기술 슬롯이 필요합니다.');
        const /** caster: 기술을 사용하는 개체. */ caster = room.players.get(ws.id), /** now: 현재 처리 시각(밀리초). */ now = Date.now();
        if (caster.roll?.remaining>0) return fail('ACTION_LOCKED','구르는 동안에는 기술을 사용할 수 없습니다.');
        if (skillCooldownRemaining(caster,m.slot,now)>0) return fail('SKILL_COOLDOWN', '기술 재사용 대기 중입니다.');
        const /** sequence: 요청에 연결한 이동 순번. 구버전은 마지막 수신 입력에 연결한다. */ sequence=m.afterInputSeq??caster.lastReceivedInput??0;
        const /** errorCode: 순번·대기열 검증 오류. */ errorCode=globalThis.InputTimeline.enqueue(caster,m.slot,sequence,m.requestId);
        if(errorCode)return fail(errorCode,'시전 입력 순서를 다시 확인해 주세요.');
        globalThis.InputTimeline.ready(caster,/** 순서가 이미 도달한 시전을 처리한다. */ (/** command: 예약 요청. */ command)=>executeCast(room,caster,command,Date.now()));
        return;
      } else if (m.type === 'game.input') {
        if (!room) return fail('NOT_IN_ROOM', '참여 중인 방이 없습니다.');
        if (room.phase !== 'started') return fail('GAME_NOT_STARTED', '게임 시작 후 조작할 수 있습니다.');
        if (![m.x, m.y].every(/** n: 검증할 숫자 입력. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1) || ![null, 'A', 'B', 'C'].includes(m.action ?? null)) return fail('INVALID_INPUT', '올바른 이동 및 행동 입력이 필요합니다.');
        const /** p: 현재 처리하는 플레이어 또는 검증 개체. */ p = room.players.get(ws.id), /** length: 이동 입력 벡터의 정규화에 사용할 길이. */ length = Math.max(1, Math.hypot(m.x, m.y));
        if (m.seq !== undefined) {
          if (!Number.isSafeInteger(m.seq) || m.seq<1) return fail('INVALID_INPUT_SEQUENCE','입력 순번이 올바르지 않습니다.');
          if (m.seq <= (p.lastReceivedInput ?? 0)) return;
          if (m.seq !== (p.lastReceivedInput ?? 0)+1 || (p.inputQueue?.length ?? 0)>=32) return fail('INVALID_INPUT_SEQUENCE','입력 순서를 다시 확인해야 합니다.');
          /** p.inputQueue: 서버가 아직 이동에 반영하지 않은 고정 시간 입력 목록. */
          p.inputQueue ??= [];
          p.inputQueue.push({seq:m.seq,x:m.x,y:m.y,action:m.action ?? null,receivedAt:Date.now()});
          /** p.lastReceivedInput: 수신 검증을 마친 마지막 입력 번호. 처리 확인 번호와 다르다. */
          p.lastReceivedInput=m.seq;
          /** p.sequencedInput: 고정 스텝 입력 프로토콜 사용 여부. */ p.sequencedInput=true;
          p.inputAt=Date.now();
          return;
        }
        if (p.sequencedInput) return fail('INVALID_INPUT_SEQUENCE','순번 입력 연결에는 이전 입력 형식을 사용할 수 없습니다.');
        p.input = { x: m.x / length, y: m.y / length }; p.inputAt = Date.now(); p.action = m.action ?? null;
        return; // 연속 입력은 로비 요청과 확인 응답의 대기 흐름과 별도로 처리한다.
      } else if (['room.leave', 'room.ready', 'room.start'].includes(m.type)) {
        if (!room) return fail('NOT_IN_ROOM', '참여 중인 방이 없습니다.');
        if (m.type === 'room.leave') leave(ws);
        else if (room.phase !== 'lobby') return fail('GAME_STARTED', '이미 게임이 시작되었습니다.');
        else if (m.type === 'room.ready') {
          if (room.hostId === ws.id) return fail('HOST_CANNOT_READY', '방장은 시작 버튼을 사용하세요.');
          if (typeof m.ready !== 'boolean') return fail('INVALID_READY', '준비 상태는 boolean이어야 합니다.');
          room.players.get(ws.id).ready = m.ready; broadcast(room);
        } else {
          if (room.hostId !== ws.id) return fail('FORBIDDEN', '방장만 시작할 수 있습니다.');
          if ([...room.players.values()].some(/** p: 현재 처리하는 플레이어 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ p => p.id !== room.hostId && !p.ready)) return fail('NOT_READY', '모든 참가자가 준비해야 합니다.');
          try {
            const /** seed: 서버가 정한 이번 게임의 재현 가능한 지도 시드. */ seed=randomBytes(4).readUInt32LE(0);
            room.map=generateRoomMap(seed);
            room.items=globalThis.ItemRules.spawn(room.map);
            room.objects=spawnMonsters(room.map);
          } catch {return fail('MAP_GENERATION_FAILED','맵 생성에 실패했습니다. 다시 시작해 주세요.');}
          room.phase = 'started';
          /** room.gameStartedAt: 대기실 생성 시각과 별개인 실제 게임 시작 시각(ms). */ room.gameStartedAt=roomClock();
          /** room.poisonPulse: 마지막 처리한 게임 시작 기준 3초 구간 번호. */ room.poisonPulse=0;
          [...room.players.values()].forEach(/** 입장 순서별 지정 타일 중심에 배치한다. */ (/** player: 배치할 참가자. */ player,/** index: 현재 참가자의 입장 순서. */ index)=>{
            const /** tile: 플레이어 순번과 같은 번호의 지형타일. */ tile=room.map.tiles.find(/** 시작 타일을 찾는다. */ (/** item: 지도 타일. */ item)=>item.id===index+1);
            Object.assign(player,globalThis.PitMapRules.center(tile,room.map));
            player.pendingCasts=[];player.movementClock={last:Date.now(),credit:50};
            player.playerNumber=index+1;player.spawnTileId=tile.id;player.roll=null;player.input={x:0,y:0};player.inputQueue=[];
          });
          broadcast(room);
        }
      } else return fail('UNKNOWN_TYPE', '알 수 없는 요청입니다.');
      send(ws, 'ack', { requestId: m.requestId, command: m.type });
    });
  });
  let /** lastTick: 직전 서버 시뮬레이션 실행 시각. */ lastTick = Date.now();
  const /** simulation: 게임 시뮬레이션 반복 타이머. */ simulation = setInterval(/** 등록한 주기에 맞춰 상태 갱신이나 정리 작업을 반복한다. */ () => {
    const /** now: 현재 처리 시각(밀리초). */ now = Date.now(), /** dt: 현재 프레임 또는 틱의 경과 시간(초). */ dt = Math.min((now - lastTick) / 1000, 0.1); lastTick = now;
    for (const /** room: 현재 처리하는 방의 상태. */ room of rooms.values()) {
      if(globalThis.RoomTimerRules.expired(room,roomClock())) {closeExpiredRoom(room);continue;}
      if (room.phase !== 'started') continue;
      room.skillEffects = (room.skillEffects ?? []).filter(/** e: 현재 처리하는 이벤트 또는 검증 개체. */ /** 조건에 맞는 항목만 다음 처리 대상으로 남긴다. */ e=>e.expiresAt>now);
      const /** objects: 처리할 월드 개체 목록. */ objects = allObjects(room);
      for (const /** object: 현재 처리하는 월드 개체. */ object of objects) { regenerate(object.status, dt); updateSkillCooldowns(object,now); }
      for (const /** p: 현재 처리하는 플레이어 또는 검증 개체. */ p of room.players.values()) {
        if (p.sequencedInput) {
          globalThis.InputTimeline.advance(p,room.map,now,/** 해당 이동 직후 시전을 실행한다. */ (/** command: 예약 시전. */ command)=>executeCast(room,p,command,now));
          continue;
        }
        if(p.roll) {
          Object.assign(p,globalThis.MovementRules.step(p,{x:0,y:0},p.status,room.map));
          p.action=p.status.stunned||p.status.state===LifeState.DEAD?null:'roll';
          continue;
        }
        if (p.status.stunned || p.status.state === LifeState.DEAD) { p.input = { x: 0, y: 0 }; p.action = null; }
        if (now - p.inputAt > 350) { p.input = { x: 0, y: 0 }; p.action = null; }
        const /** previousX: 이동 전 가로 좌표. */ previousX = p.x, /** previousY: 이동 전 세로 좌표. */ previousY = p.y;
        const /** bound: 지도에서는 지형 판정으로 제한하고 빈 필드만 기존 범위를 적용한다. */ bound=room.map?Infinity:1500;
        p.x = Math.max(-bound, Math.min(bound, p.x + p.input.x * effectiveStats(p.status).moveSpeed * 110 * dt));
        p.y = Math.max(-bound, Math.min(bound, p.y + p.input.y * effectiveStats(p.status).moveSpeed * 110 * dt));
        if(room.map) {
          const /** allowed: 구형 입력도 동일한 맵의 통행 구역으로 제한한다. */ allowed=globalThis.PitMapRules.constrain(room.map,{x:previousX,y:previousY},p,(p.status.hitboxDiameter??24)/2);
          p.x=allowed.x;p.y=allowed.y;
        }
        if (p.x !== previousX || p.y !== previousY) p.facing = Math.atan2(p.y - previousY, p.x - previousX);
      }
      globalThis.PoisonRules.tick(room,roomClock());
      if (now - (room.targetsAt ?? 0) >= 100) { updateNearestObjects(objects); room.targetsAt = now; }
      room.skillEffects.push(...tickMonsters(objects,room.map,now,dt));
      room.itemChanges=globalThis.ItemRules.tick(room.items??new Map(),objects,now);
      const /** state: 현재 상태 스냅샷. */ state = snapshot(room,false);
      for (const /** p: 현재 처리하는 플레이어 또는 검증 개체. */ p of room.players.values()) send(p.ws, 'game.state', { room: state });
    }
  }, 50);
  simulation.unref();
  const /** heartbeat: 무응답 연결을 검사하는 반복 타이머. */ heartbeat = setInterval(/** 등록한 주기에 맞춰 상태 갱신이나 정리 작업을 반복한다. */ () => { for (const /** ws: 현재 처리 중인 WebSocket 연결. */ ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } } }, heartbeatMs);
  heartbeat.unref();
  return { server, rooms, /** close: 반복 작업이나 연결을 정리하여 사용 중인 자원을 해제한다. */ close: async () => { clearInterval(heartbeat); clearInterval(simulation); auth.close(); for (const /** ws: 현재 처리 중인 WebSocket 연결. */ ws of wss.clients) ws.terminate(); await new Promise(/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ /** 등록된 콜백에서 현재 상태를 확인하고 후속 작업을 수행한다. */ resolve => wss.close(resolve)); await new Promise(/** resolve: 비동기 처리를 성공으로 완료하는 함수. */ /** 등록된 콜백에서 현재 상태를 확인하고 후속 작업을 수행한다. */ resolve => server.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const /** game: 서버 인스턴스와 방 관리 인터페이스. */ game = createGameServer();
  game.server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', /** 현재 비동기 작업의 완료 또는 후속 처리를 수행한다. */ () => console.log(`ChildrenOfBottom: http://localhost:${game.server.address().port}`));
  for (const /** signal: 서버 종료를 요청한 운영체제 신호. */ signal of ['SIGINT', 'SIGTERM']) process.on(signal, /** 등록된 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ async () => { await game.close(); process.exit(0); });
}
