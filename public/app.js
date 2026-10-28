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
  $('home').hidden = !!room; $('lobby').hidden = !room;
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
  const ws = socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  $('connection').textContent = '서버에 연결 중…'; render();
  ws.onmessage = ({ data }) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.v !== 1) return;
    if (m.type === 'welcome') { playerId = m.playerId; $('connection').textContent = '● 실시간 서버 연결됨'; }
    if (m.type === 'room.state') { room = m.room; notice(''); }
    if (m.type === 'room.closed' || m.type === 'room.left') { room = null; notice(m.type === 'room.closed' ? messages.closed : '방에서 나왔습니다.'); }
    if (m.type === 'error') notice(m.message);
    if ((m.type === 'ack' || m.type === 'error') && m.requestId === pending) settle();
    render();
  };
  ws.onclose = () => {
    room = null; playerId = null; settle(); notice(messages.offline); $('connection').textContent = '○ 연결 끊김 · 재시도 중';
    clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 2000);
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
connect();
