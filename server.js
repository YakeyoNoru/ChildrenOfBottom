import http from 'node:http';
import { createAuthService } from './auth/service.js';
import { createStatus, ObjectType, LifeState, effectiveStats, normalizeVitals, regenerate, updateNearestObjects, TargetPriority } from './game/status.js';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

export function createGameServer({ heartbeatMs = 15000, auth: authOptions = {} } = {}) {
  const rooms = new Map();
  const auth = createAuthService(authOptions);
  const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/viewport.js': ['viewport.js', 'text/javascript'], '/client-mode.js': ['client-mode.js', 'text/javascript'], '/app': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'] };
  const server = http.createServer(async (req, res) => {
    if (await auth.handle(req,res)) return;
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"protocolVersion":1}'); }
    const file = files[req.url];
    if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end(); }
    try {
      const body = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(500); res.end('Server error'); }
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const send = (ws, type, data = {}) => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 65536) return ws.terminate();
      ws.send(JSON.stringify({ v: 1, type, ...data }));
    }
  };
  const objectSnapshot = p => {
    const effective = normalizeVitals(p.status);
    return { id: p.id, name: p.name, x: p.x, y: p.y, action: p.action, facing: p.facing ?? -Math.PI / 2, status: { ...p.status, effective } };
  };
  const allObjects = room => [...room.players.values(), ...room.objects.values()];
  const snapshot = room => {
    const objects = allObjects(room);
    for (const object of objects) normalizeVitals(object.status);
    // Target references are refreshed by the 100 ms simulation cadence.
    return {
      code: room.code, hostId: room.hostId, phase: room.phase,
      players: [...room.players.values()].map(p => ({ ...objectSnapshot(p), ready: p.ready })),
      objects: objects.map(objectSnapshot),
    };
  };
  const broadcast = room => { for (const p of room.players.values()) send(p.ws, 'room.state', { room: snapshot(room) }); };
  function leave(ws) {
    const room = rooms.get(ws.roomCode);
    ws.roomCode = null;
    if (!room) return;
    if (room.hostId === ws.id && room.phase === 'lobby') {
      rooms.delete(room.code);
      for (const p of room.players.values()) { p.ws.roomCode = null; send(p.ws, 'room.closed', { message: '방이 해제되었습니다.' }); }
    } else {
      room.players.delete(ws.id); send(ws, 'room.left');
      if (!room.players.size) rooms.delete(room.code);
      else {
        if (room.hostId === ws.id) { room.hostId = room.players.keys().next().value; room.players.get(room.hostId).ready = false; }
        broadcast(room);
      }
    }
  }
  wss.on('connection', (ws, req) => {
    const allowed = process.env.ALLOWED_ORIGIN;
    if (req.headers.origin && req.headers.origin !== (allowed || `http://${req.headers.host}`) && req.headers.origin !== (!allowed ? `https://${req.headers.host}` : allowed)) { ws.close(1008, 'Origin rejected'); return; }
    const mode = new URL(req.url,'http://local').searchParams.get('client') === 'app' ? 'app' : 'web';
    ws.account = auth.identity(req,mode);
    if (mode === 'app' && !ws.account) { ws.close(1008,'App login required'); return; }
    ws.id = randomUUID(); ws.alive = true; ws.windowStart = Date.now(); ws.count = 0;
    send(ws, 'welcome', { playerId: ws.id });
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {});
    ws.on('close', () => leave(ws));
    ws.on('message', (raw, binary) => {
      const error = (code, message, requestId) => send(ws, 'error', { code, message, requestId });
      if (Date.now() - ws.windowStart > 10000) { ws.windowStart = Date.now(); ws.count = 0; }
      if (++ws.count > 160) return error('RATE_LIMIT', '요청이 너무 많습니다. 잠시 후 다시 시도하세요.');
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return error('BAD_MESSAGE', '올바른 JSON이 필요합니다.'); }
      if (binary || !m || Array.isArray(m) || m.v !== 1 || typeof m.type !== 'string' || (m.requestId !== undefined && (typeof m.requestId !== 'string' || m.requestId.length > 64))) return error('BAD_MESSAGE', '지원하지 않는 메시지입니다.');
      const fail = (code, message) => error(code, message, m.requestId);
      let room = rooms.get(ws.roomCode);
      if (m.type === 'room.create' || m.type === 'room.join') {
        if (room) return fail('ALREADY_IN_ROOM', '이미 방에 참여 중입니다.');
        if (typeof m.name !== 'string' || !m.name.trim() || m.name.trim().length > 20 || /[\x00-\x1f]/.test(m.name)) return fail('INVALID_NAME', '이름은 1~20자로 입력하세요.');
        if (m.type === 'room.create') {
          if (rooms.size >= 1000) return fail('SERVER_FULL', '서버가 가득 찼습니다.');
          let code; do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (rooms.has(code));
          room = { code, hostId: ws.id, phase: 'lobby', players: new Map(), objects: new Map() }; rooms.set(code, room);
        } else {
          if (typeof m.code !== 'string' || !/^[A-F0-9]{6}$/.test(m.code.trim().toUpperCase())) return fail('INVALID_CODE', '접속코드 6자리를 확인하세요.');
          room = rooms.get(m.code.trim().toUpperCase());
          if (!room) return fail('ROOM_NOT_FOUND', '방을 찾을 수 없습니다.');
          if (room.phase !== 'lobby') return fail('GAME_STARTED', '이미 시작한 방입니다.');
          if (room.players.size >= 4) return fail('ROOM_FULL', '방이 가득 찼습니다. (최대 4명)');
        }
        ws.roomCode = room.code; room.players.set(ws.id, { id: ws.id, name: m.name.trim(), ready: false, x: 0, y: 0, input: { x: 0, y: 0 }, inputAt: 0, action: null, facing: -Math.PI / 2, targetPriority: 'nearest', status: createStatus({ objectType: ObjectType.PLAYER, classificationCode: ws.account?.id ?? ws.id, instanceId: ws.id }), ws }); broadcast(room);
      } else if (m.type === 'game.options') {
        if (!room) return fail('NOT_IN_ROOM', '참여 중인 방이 없습니다.');
        if (!TargetPriority.includes(m.targetPriority)) return fail('INVALID_OPTIONS', '올바른 공격 우선대상이 필요합니다.');
        room.players.get(ws.id).targetPriority = m.targetPriority;
        return;
      } else if (m.type === 'game.input') {
        if (!room) return fail('NOT_IN_ROOM', '참여 중인 방이 없습니다.');
        if (room.phase !== 'started') return fail('GAME_NOT_STARTED', '게임 시작 후 조작할 수 있습니다.');
        if (![m.x, m.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1) || ![null, 'A', 'B'].includes(m.action ?? null)) return fail('INVALID_INPUT', '올바른 이동 및 행동 입력이 필요합니다.');
        const p = room.players.get(ws.id), length = Math.max(1, Math.hypot(m.x, m.y));
        p.input = { x: m.x / length, y: m.y / length }; p.inputAt = Date.now(); p.action = m.action ?? null;
        return; // Continuous input is independent of lobby request/ack transactions.
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
          if ([...room.players.values()].some(p => p.id !== room.hostId && !p.ready)) return fail('NOT_READY', '모든 참가자가 준비해야 합니다.');
          room.phase = 'started';
          [...room.players.values()].forEach((p, i) => { p.x = (i % 2) * 120 - 60; p.y = Math.floor(i / 2) * 120 - 60; });
          broadcast(room);
        }
      } else return fail('UNKNOWN_TYPE', '알 수 없는 요청입니다.');
      send(ws, 'ack', { requestId: m.requestId, command: m.type });
    });
  });
  let lastTick = Date.now();
  const simulation = setInterval(() => {
    const now = Date.now(), dt = Math.min((now - lastTick) / 1000, 0.1); lastTick = now;
    for (const room of rooms.values()) {
      if (room.phase !== 'started') continue;
      const objects = allObjects(room);
      for (const object of objects) regenerate(object.status, dt);
      for (const p of room.players.values()) {
        if (p.status.stunned || p.status.state === LifeState.DEAD) { p.input = { x: 0, y: 0 }; p.action = null; }
        if (now - p.inputAt > 350) { p.input = { x: 0, y: 0 }; p.action = null; }
        const previousX = p.x, previousY = p.y;
        p.x = Math.max(-1500, Math.min(1500, p.x + p.input.x * effectiveStats(p.status).moveSpeed * 110 * dt));
        p.y = Math.max(-1500, Math.min(1500, p.y + p.input.y * effectiveStats(p.status).moveSpeed * 110 * dt));
        if (p.x !== previousX || p.y !== previousY) p.facing = Math.atan2(p.y - previousY, p.x - previousX);
      }
      if (now - (room.targetsAt ?? 0) >= 100) { updateNearestObjects(objects); room.targetsAt = now; }
      const state = snapshot(room);
      for (const p of room.players.values()) send(p.ws, 'game.state', { room: state });
    }
  }, 50);
  simulation.unref();
  const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } } }, heartbeatMs);
  heartbeat.unref();
  return { server, rooms, close: async () => { clearInterval(heartbeat); clearInterval(simulation); auth.close(); for (const ws of wss.clients) ws.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const game = createGameServer();
  game.server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log(`ChildrenOfBottom: http://localhost:${game.server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await game.close(); process.exit(0); });
}
