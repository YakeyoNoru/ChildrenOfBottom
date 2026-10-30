const $ = id => document.getElementById(id);
let socket, playerId, room = null, reconnectTimer, pending = null, timeout;
const messages = { closed: '방이 해제되었습니다.', offline: '연결이 끊어졌습니다. 방에서 퇴장했습니다. 다시 연결 중…' };
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function settle() { pending = null; clearTimeout(timeout); render(); }
function send(type, data = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return notice('서버 연결을 기다려 주세요.');
  if (pending) return;
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  pending = requestId;
  socket.send(JSON.stringify({ v: 1, type, requestId, ...data }));
  timeout = setTimeout(() => { notice('서버 응답이 없습니다. 다시 연결합니다.'); socket.close(); }, 8000);
  render();
}
function render() {
  const online = socket?.readyState === WebSocket.OPEN && !!playerId;
  const playing = room?.phase === 'started';
  $('home').hidden = !!room; $('lobby').hidden = !room || playing;
  $('game').hidden = !playing; document.body.classList.toggle('playing', playing);
  updateViewport();
  $('game-leave').disabled = !online || !!pending;
  if (!playing) { closeMenu(); resetInput(); }
  if (playing) $('game-status').textContent = `${room.players.length}명 생존 · ${room.players.find(p => p.id === playerId)?.name ?? ''}`;
  for (const id of ['create', 'join-open', 'join']) $(id).disabled = !online || !!pending;
  if (!room) return;
  const host = room.hostId === playerId, me = room.players.find(p => p.id === playerId), started = room.phase === 'started';
  $('count').textContent = `${room.players.length} / 4`;
  $('room-code').textContent = room.code;
  $('phase-title').textContent = started ? '게임 시작 완료' : '대기실';
  $('phase-message').textContent = started ? '모든 참가자에게 시작 상태가 동기화되었습니다. 생존 플레이는 이후 구현됩니다.' : '참가자가 모두 준비하면 방장이 시작할 수 있습니다.';
  $('players').replaceChildren();
  for (let i = 0; i < 4; i++) {
    const p = room.players[i], li = document.createElement('li'), name = document.createElement('span'), status = document.createElement('span');
    name.textContent = p ? `${p.name}${p.id === playerId ? ' (나)' : ''}` : '생존자 대기 중';
    status.textContent = p ? p.id === room.hostId ? '방장' : p.ready ? '준비 완료' : '준비 전' : '—';
    if (!p) li.className = 'empty'; li.append(name, status); $('players').append(li);
  }
  const canStart = room.players.every(p => p.id === room.hostId || p.ready);
  $('primary').textContent = started ? '시작됨' : host ? '시작' : me?.ready ? '준비해제' : '준비';
  $('primary').disabled = !online || !!pending || started || (host && !canStart);
  $('leave').disabled = !!pending || !online;
  $('hint').textContent = started ? '현재는 로비 프로토타입입니다.' : host ? canStart ? '시작할 수 있습니다. 혼자 시작도 가능합니다.' : '다른 참가자의 준비를 기다리는 중입니다.' : '준비 상태를 방장에게 알려 주세요.';
}
function connect() {
  playerId = null;
  const ws = socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?client=${CLIENT_MODE}`);
  $('connection').textContent = '서버에 연결 중…'; render();
  ws.onmessage = ({ data }) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.v !== 1) return;
    if (m.type === 'welcome') { playerId = m.playerId; $('connection').textContent = '● 실시간 서버 연결됨'; }
    if (m.type === 'game.state') { if (room?.code === m.room.code) room = m.room; return; }
    if (m.type === 'room.state') { const entering = !room || room.code !== m.room.code; room = m.room; if (entering) syncTargetPriority(); notice(''); }
    if (m.type === 'room.closed' || m.type === 'room.left') { room = null; notice(m.type === 'room.closed' ? messages.closed : '방에서 나왔습니다.'); }
    if (m.type === 'error') notice(m.message);
    if ((m.type === 'ack' || m.type === 'error') && m.requestId === pending) settle();
    render();
  };
  ws.onclose = event => {
    room = null; playerId = null; settle(); notice(messages.offline); $('connection').textContent = '○ 연결 끊김 · 재시도 중';
    clearTimeout(reconnectTimer);
    if (CLIENT_MODE === 'app' && event?.reason === 'App login required') { accountProfile = null; initializeClient(); return; }
    reconnectTimer = setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}
$('create').onclick = () => send('room.create', { name: $('name').value });
$('join-open').onclick = () => { $('join-form').hidden = false; $('code-input').focus(); };
$('cancel').onclick = () => { $('join-form').hidden = true; };
$('join-form').onsubmit = e => { e.preventDefault(); send('room.join', { name: $('name').value, code: $('code-input').value }); };
$('primary').onclick = () => { if (!room) return; send(room.hostId === playerId ? 'room.start' : 'room.ready', { ready: !room.players.find(p => p.id === playerId)?.ready }); };
$('leave').onclick = () => send('room.leave');
$('copy').onclick = async () => {
  if (!room) return;
  try { await navigator.clipboard.writeText(room.code); notice('접속코드를 복사했습니다.'); }
  catch { notice('자동 복사를 사용할 수 없습니다. 접속코드를 선택한 뒤 복사해 주세요.'); const range = document.createRange(); range.selectNodeContents($('room-code')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
};
const keys = new Set();
let axis = { x: 0, y: 0 }, action = null, stickPointer = null;
const finePointer = matchMedia('(any-pointer: fine)');
let desktopInput = finePointer.matches;
function updateControls() { $('touch-controls').hidden = desktopInput; }
finePointer.addEventListener('change', e => { desktopInput = e.matches; resetInput(); updateControls(); });
function resetInput() {
  keys.clear(); axis = { x: 0, y: 0 }; action = null; stickPointer = null;
  $('stick').style.transform = ''; $('action-a').classList.remove('pressed'); $('action-b').classList.remove('pressed'); $('action-c').classList.remove('pressed');
}
function useSkill(slot) {
  if (room?.phase !== 'started' || socket?.readyState !== WebSocket.OPEN || $('game-dialog').open || document.hidden || viewport.blockedPortrait) return;
  socket.send(JSON.stringify({v:1,type:'game.cast',slot}));
}
function inputPacket() {
  if (room?.phase !== 'started' || socket?.readyState !== WebSocket.OPEN) return;
  const blocked = $('game-dialog').open || document.hidden || viewport.blockedPortrait;
  const x = blocked ? 0 : ((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) || axis.x);
  const y = blocked ? 0 : ((keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) || axis.y);
  socket.send(JSON.stringify({ v: 1, type: 'game.input', x, y, action: blocked ? null : action }));
}
function showMenuPage(page) {
  for (const name of ['main','test','options']) $('menu-' + name).hidden = name !== page;
  $('menu-title').textContent = {main:'게임 메뉴',test:'테스트설정',options:'옵션'}[page];
}
$('open-test-settings').onclick = () => { showMenuPage('test'); $('test-back').focus(); };
$('open-options').onclick = () => { showMenuPage('options'); $('control-scale').focus(); };
$('test-back').onclick = () => { showMenuPage('main'); $('open-test-settings').focus(); };
$('options-back').onclick = () => { showMenuPage('main'); $('open-options').focus(); };
function syncTargetPriority() {
  if (room && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({v:1,type:'game.options',targetPriority:userSettings.targetPriority ?? 'nearest'}));
}
function closeMenu() { if ($('game-dialog').open) $('game-dialog').close(); }
$('game-menu').onclick = () => { resetInput(); inputPacket(); showMenuPage('main'); $('game-dialog').showModal(); $('resume').focus(); };
$('resume').onclick = closeMenu;
$('game-dialog').addEventListener('close', resetInput);
$('game-leave').onclick = () => { resetInput(); inputPacket(); send('room.leave'); };
window.addEventListener('keydown', e => {
  if (room?.phase !== 'started' || viewport.blockedPortrait) return;
  desktopInput = true; updateControls();
  if (e.code === 'Escape') { e.preventDefault(); if ($('game-dialog').open) closeMenu(); else $('game-menu').click(); return; }
  if ($('game-dialog').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyJ','KeyK','KeyL'].includes(e.code)) {
    e.preventDefault(); if (!keys.has(e.code) && ['KeyJ','KeyK','KeyL'].includes(e.code)) useSkill({KeyJ:'A',KeyK:'B',KeyL:'C'}[e.code]); keys.add(e.code); action = keys.has('KeyJ') ? 'A' : keys.has('KeyK') ? 'B' : null;
  }
});
window.addEventListener('keyup', e => { keys.delete(e.code); action = keys.has('KeyJ') ? 'A' : keys.has('KeyK') ? 'B' : null; });
window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !desktopInput) { desktopInput = true; resetInput(); updateControls(); } });
window.addEventListener('blur', () => { resetInput(); inputPacket(); });
document.addEventListener('visibilitychange', () => { resetInput(); inputPacket(); });
const joystick = $('joystick');
function moveStick(e) {
  if (e.pointerId !== stickPointer) return;
  const r = joystick.getBoundingClientRect(), radius = r.width * .32;
  let x = (e.clientX - r.left - r.width / 2) / radius, y = (e.clientY - r.top - r.height / 2) / radius;
  const length = Math.max(1, Math.hypot(x,y)); x /= length; y /= length;
  axis = { x, y }; $('stick').style.transform = `translate(${x * radius}px,${y * radius}px)`;
}
joystick.onpointerdown = e => { if (stickPointer !== null) return; stickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveStick(e); };
joystick.onpointermove = moveStick;
function releaseStick(e) { if (e.pointerId === stickPointer) { stickPointer = null; axis = { x: 0, y: 0 }; $('stick').style.transform = ''; inputPacket(); } }
for (const event of ['pointerup','pointercancel','lostpointercapture']) joystick.addEventListener(event, releaseStick);
for (const key of ['A','B','C']) {
  const button = $('action-' + key.toLowerCase()); let pointer = null;
  button.onpointerdown = e => { if (pointer !== null) return; pointer = e.pointerId; button.setPointerCapture(e.pointerId); action = key; useSkill(key); button.classList.add('pressed'); inputPacket(); };
  for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, e => { if (e.pointerId !== pointer) return; pointer = null; if (action === key) action = null; button.classList.remove('pressed'); inputPacket(); });
}
updateControls();
setInterval(inputPacket, 100);
let viewport = calculateViewport(innerWidth, innerHeight, CLIENT_MODE);
function updateViewport() {
  viewport = calculateViewport(innerWidth, innerHeight, CLIENT_MODE);
  const frame = $('game-viewport');
  frame.style.width = `${viewport.pixelWidth}px`; frame.style.height = `${viewport.pixelHeight}px`;
  frame.style.left = `${viewport.left}px`; frame.style.top = `${viewport.top}px`;
  const hud = $('game-hud');
  const shrinkHud = CLIENT_MODE === 'web' && viewport.portrait;
  hud.style.width = shrinkHud ? `${viewport.worldWidth}px` : '100%';
  hud.style.height = shrinkHud ? `${viewport.worldHeight}px` : '100%';
  hud.style.transform = shrinkHud ? `scale(${viewport.scale})` : 'none';
  frame.hidden = viewport.blockedPortrait;
  if (viewport.blockedPortrait) closeMenu();
  $('rotate-notice').hidden = !viewport.blockedPortrait;
}
window.addEventListener('resize', () => { updateViewport(); resetInput(); inputPacket(); });
const canvas = $('world'), ctx = canvas.getContext('2d');
function drawWorld() {
  requestAnimationFrame(drawWorld);
  if (room?.phase !== 'started' || viewport.blockedPortrait) return;
  const me = room.players.find(p => p.id === playerId); if (!me) return;
  const w = viewport.worldWidth, h = viewport.worldHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(viewport.pixelWidth*dpr), pixelHeight = Math.round(viewport.pixelHeight*dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
  ctx.setTransform(pixelWidth/w,0,0,pixelHeight/h,0,0); ctx.fillStyle = '#14251e'; ctx.fillRect(0,0,w,h);
  const ox = w/2-me.x, oy = h/2-me.y;
  ctx.strokeStyle = '#284035'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = ((ox % 80)+80)%80; x < w; x += 80) { ctx.moveTo(x,0); ctx.lineTo(x,h); }
  for (let y = ((oy % 80)+80)%80; y < h; y += 80) { ctx.moveTo(0,y); ctx.lineTo(w,y); } ctx.stroke();
  ctx.strokeStyle = '#96a47b'; ctx.strokeRect(ox-1520,oy-1520,3040,3040);
  drawSkillEffects(ctx, room.skillEffects ?? [], ox, oy);
  (room.objects ?? room.players).forEach((p,i) => {
    const x = p.x+ox, y = p.y+oy;
    if (p.action) { ctx.strokeStyle = p.action === 'A' ? '#f7d98b' : '#93ccea'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x,y,32,0,Math.PI*2); ctx.stroke(); }
    ctx.fillStyle = p.id === playerId ? '#c8e5a6' : ['#e6ac8a','#91c8dd','#c7a8de','#d7cc82'][i];
    if (p.status?.objectType === 'player' || p.id === playerId) drawPlayerTriangle(ctx, p, x, y);
    else { ctx.beginPath(); ctx.arc(x,y,18,0,Math.PI*2); ctx.fill(); }
    if (userSettings.showNames) { ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '14px system-ui'; ctx.fillText(p.name + (p.id === playerId ? ' (나)' : ''),x,y-54); }
    drawObjectHud(ctx, p, x, y, playerId);
  });
}
function drawSkillEffects(context, effects, ox, oy) {
  for (const e of effects) {
    const c=Math.cos(e.angle),s=Math.sin(e.angle);
    context.beginPath();
    [[0,-e.width/2],[e.length,-e.width/2],[e.length,e.width/2],[0,e.width/2]].forEach(([f,l],i)=>{
      const x=e.x+ox+f*c-l*s,y=e.y+oy+f*s+l*c;
      if(i===0) context.moveTo(x,y); else context.lineTo(x,y);
    });
    context.closePath();context.fillStyle='#f7d98b33';context.fill();context.strokeStyle='#f7d98b';context.lineWidth=2;context.stroke();
  }
}
/** The first vertex faces movement; an 18-unit circumradius preserves size. */
function drawPlayerTriangle(context, object, x, y) {
  const facing = Number.isFinite(object.facing) ? object.facing : -Math.PI / 2;
  context.beginPath();
  for (let i = 0; i < 3; i++) {
    const angle = facing + i * Math.PI * 2 / 3;
    const vx = x + Math.cos(angle) * 18, vy = y + Math.sin(angle) * 18;
    if (i === 0) context.moveTo(vx, vy); else context.lineTo(vx, vy);
  }
  context.closePath(); context.fill();
}
/** One HUD renderer for every player, NPC and enemy. */
function drawObjectHud(context, object, x, y, localId) {
  const s = object.status;
  if (!s) return;
  const maxHealth = s.effective?.maxHealth ?? Math.max(0, s.maxHealth + s.bonusHealth);
  const maxResource = s.effective?.maxSkillResource ?? Math.max(0, s.maxSkillResource + s.bonusSkillResource);
  const ratio = maxHealth > 0 ? Math.max(0, Math.min(1, s.currentHealth / maxHealth)) : 0;
  const color = s.objectType === 'npc' ? '#68cd84' : s.objectType === 'player' && object.id === localId ? '#63d4d2' : '#e76060';
  const width = 64, top = y - 43;
  context.fillStyle = '#101713'; context.fillRect(x-width/2, top, width, 9);
  context.fillStyle = color; context.fillRect(x-width/2, top, width*ratio, 9);
  context.lineWidth = 1; context.strokeStyle = '#d9e5d766'; context.strokeRect(x-width/2, top, width, 9);
  context.font = 'bold 12px system-ui'; context.fillStyle = '#f1f6ed'; context.textAlign = 'right';
  context.fillText(`Lv.${s.level}`, x-width/2-5, top+9);
  if (maxResource > 0) {
    context.textAlign = 'center'; context.font = '13px system-ui'; context.fillStyle = '#a4d7fa';
    const number = value => String(Math.round(value * 10) / 10);
    context.fillText(`${number(s.currentSkillResource)} / ${number(maxResource)}`, x, y+36);
  }
}
requestAnimationFrame(drawWorld);
initializeClient();
