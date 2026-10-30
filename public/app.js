const /** $: HTML 요소 조회 보조 함수. */ $ = /** id: 대상 개체 또는 요소의 식별자. */ /** $: 식별자로 HTML 요소를 조회한다. */ id => document.getElementById(id);
let /** socket: 브라우저의 현재 게임 서버 연결. */ socket, /** playerId: 서버에서 발급받은 본인 개체 식별자. */ playerId, /** room: 현재 처리하는 방의 상태. */ room = null, /** reconnectTimer: 연결 재시도 예약 타이머. */ reconnectTimer, /** pending: 응답을 기다리는 로비 요청 식별자. */ pending = null, /** timeout: 요청 응답 제한 시간 타이머. */ timeout;
const /** motionView: 서버 좌표와 분리한 표시용 이동 보간 상태. */ motionView = new MotionView();
const /** messages: 연결 종료 등에 사용할 안내 문구 모음. */ messages = { closed: '방이 해제되었습니다.', offline: '연결이 끊어졌습니다. 방에서 퇴장했습니다. 다시 연결 중…' };
/** notice: 안내 문구를 표시하거나 비어 있으면 숨긴다. */ function notice(/** message: 사용자나 연결에 전달할 안내 내용. */ message) { $('notice').textContent = message; $('notice').hidden = !message; }
/** settle: 요청 대기 상태와 제한 시간을 해제하고 UI를 다시 그린다. */ function settle() { pending = null; clearTimeout(timeout); render(); }
/** send: 메시지 종류와 프로토콜 버전을 붙여 현재 연결로 전송한다. */ function send(/** type: 처리하거나 기다릴 메시지 또는 이벤트 유형. */ type, /** data: 전달하거나 해석한 데이터. */ data = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return notice('서버 연결을 기다려 주세요.');
  if (pending) return;
  const /** requestId: 요청과 응답을 대응시키는 식별자. */ requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  pending = requestId;
  socket.send(JSON.stringify({ v: 1, type, requestId, ...data }));
  timeout = setTimeout(/** 예약 시간이 지나면 대기·재접속·실패 처리를 실행한다. */ () => { notice('서버 응답이 없습니다. 다시 연결합니다.'); socket.close(); }, 8000);
  render();
}
/** render: 접속·로비·진행 상태에 맞춰 화면과 버튼 활성 상태를 갱신한다. */ function render() {
  const /** online: 서버 연결과 본인 식별자 준비 여부. */ online = socket?.readyState === WebSocket.OPEN && !!playerId;
  const /** playing: 현재 방이 게임 진행 중인지 여부. */ playing = room?.phase === 'started';
  $('home').hidden = !!room; $('lobby').hidden = !room || playing;
  $('game').hidden = !playing; document.body.classList.toggle('playing', playing);
  updateViewport();
  $('game-leave').disabled = !online || !!pending;
  if (!playing) { motionView.clear(); closeMenu(); resetInput(); }
  if (playing) $('game-status').textContent = `${room.players.length}명 생존 · ${room.players.find(/** p: 현재 처리하는 플레이어 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ p => p.id === playerId)?.name ?? ''}`;
  for (const /** id: 대상 개체 또는 요소의 식별자. */ id of ['create', 'join-open', 'join']) $(id).disabled = !online || !!pending;
  if (!room) return;
  const /** host: 방장 여부 또는 방장 개체. */ host = room.hostId === playerId, /** me: 현재 접속자의 개체. */ me = room.players.find(/** p: 현재 처리하는 플레이어 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ p => p.id === playerId), /** started: 방이 게임 시작 상태인지 여부. */ started = room.phase === 'started';
  $('count').textContent = `${room.players.length} / 4`;
  $('room-code').textContent = room.code;
  $('phase-title').textContent = started ? '게임 시작 완료' : '대기실';
  $('phase-message').textContent = started ? '모든 참가자에게 시작 상태가 동기화되었습니다. 생존 플레이는 이후 구현됩니다.' : '참가자가 모두 준비하면 방장이 시작할 수 있습니다.';
  $('players').replaceChildren();
  for (let /** i: 현재 반복 항목의 순번. */ i = 0; i < 4; i++) {
    const /** p: 현재 처리하는 플레이어 또는 검증 개체. */ p = room.players[i], /** li: 참가자 한 줄을 표시하는 목록 요소. */ li = document.createElement('li'), /** name: 현재 항목이나 사용자에게 표시할 이름. */ name = document.createElement('span'), /** status: 개체 상태 또는 응답 상태. */ status = document.createElement('span');
    name.textContent = p ? `${p.name}${p.id === playerId ? ' (나)' : ''}` : '생존자 대기 중';
    status.textContent = p ? p.id === room.hostId ? '방장' : p.ready ? '준비 완료' : '준비 전' : '—';
    if (!p) li.className = 'empty'; li.append(name, status); $('players').append(li);
  }
  const /** canStart: 모든 비방장 참가자의 준비 완료 여부. */ canStart = room.players.every(/** p: 현재 처리하는 플레이어 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ p => p.id === room.hostId || p.ready);
  $('primary').textContent = started ? '시작됨' : host ? '시작' : me?.ready ? '준비해제' : '준비';
  $('primary').disabled = !online || !!pending || started || (host && !canStart);
  $('leave').disabled = !!pending || !online;
  $('hint').textContent = started ? '현재는 로비 프로토타입입니다.' : host ? canStart ? '시작할 수 있습니다. 혼자 시작도 가능합니다.' : '다른 참가자의 준비를 기다리는 중입니다.' : '준비 상태를 방장에게 알려 주세요.';
}
/** connect: 게임 서버에 연결하고 수신 상태 반영·연결 종료·재접속을 처리한다. */ function connect() {
  playerId = null;
  const /** ws: 현재 처리 중인 WebSocket 연결. */ ws = socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?client=${CLIENT_MODE}`);
  $('connection').textContent = '서버에 연결 중…'; render();
  ws.onmessage = /** onmessage: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ (/** data: 전달하거나 해석한 데이터. */ { data }) => {
    let /** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ m; try { m = JSON.parse(data); } catch { return; }
    if (m.v !== 1) return;
    if (m.type === 'welcome') { playerId = m.playerId; $('connection').textContent = '● 실시간 서버 연결됨'; }
    if (m.type === 'game.state') { if (room?.code === m.room.code) { room = m.room; motionView.receive(room,playerId,Date.now()); } return; }
    if (m.type === 'room.state') { const /** entering: 새로운 방 상태로 진입했는지 여부. */ entering = !room || room.code !== m.room.code; room = m.room; motionView.receive(room,playerId,Date.now()); if (entering) syncTargetPriority(); notice(''); }
    if (m.type === 'room.closed' || m.type === 'room.left') { room = null; notice(m.type === 'room.closed' ? messages.closed : '방에서 나왔습니다.'); }
    if (m.type === 'error') notice(m.message);
    if ((m.type === 'ack' || m.type === 'error') && m.requestId === pending) settle();
    render();
  };
  ws.onclose = /** event: 현재 처리하는 사용자 입력 또는 연결 이벤트. */ /** onclose: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ event => {
    room = null; playerId = null; settle(); notice(messages.offline); $('connection').textContent = '○ 연결 끊김 · 재시도 중';
    clearTimeout(reconnectTimer);
    if (CLIENT_MODE === 'app' && event?.reason === 'App login required') { accountProfile = null; initializeClient(); return; }
    reconnectTimer = setTimeout(connect, 2000);
  };
  ws.onerror = /** onerror: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => ws.close();
}
$('create').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => send('room.create', { name: $('name').value });
$('join-open').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { $('join-form').hidden = false; $('code-input').focus(); };
$('cancel').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { $('join-form').hidden = true; };
$('join-form').onsubmit = /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** onsubmit: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ e => { e.preventDefault(); send('room.join', { name: $('name').value, code: $('code-input').value }); };
$('primary').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { if (!room) return; send(room.hostId === playerId ? 'room.start' : 'room.ready', { ready: !room.players.find(/** p: 현재 처리하는 플레이어 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ p => p.id === playerId)?.ready }); };
$('leave').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => send('room.leave');
$('copy').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ async () => {
  if (!room) return;
  try { await navigator.clipboard.writeText(room.code); notice('접속코드를 복사했습니다.'); }
  catch { notice('자동 복사를 사용할 수 없습니다. 접속코드를 선택한 뒤 복사해 주세요.'); const /** range: 복사할 방 코드의 문서 선택 범위. */ range = document.createRange(); range.selectNodeContents($('room-code')); const /** selection: 브라우저의 현재 텍스트 선택 객체. */ selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
};
const /** keys: 현재 누르고 있는 키 코드 집합. */ keys = new Set();
let /** axis: 터치 조이스틱의 정규화된 이동 입력. */ axis = { x: 0, y: 0 }, /** action: 현재 기술 입력 또는 인증 작업 종류. */ action = null, /** stickPointer: 이동 조이스틱을 잡은 포인터 식별자. */ stickPointer = null;
const /** mouseButtons: 현재 누르고 있는 마우스 버튼 집합. */ mouseButtons = new Set();
/** desktopAction: 현재 마우스 버튼과 Shift 입력에서 표시할 기술 행동을 선택한다. */ function desktopAction() { return mouseButtons.has(0) ? 'A' : mouseButtons.has(2) ? 'B' : (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 'C' : null; }
const /** finePointer: 정밀 포인터 연결 여부를 감시하는 미디어 조건. */ finePointer = matchMedia('(any-pointer: fine)');
let /** desktopInput: 키보드·마우스 조작부 사용 여부. */ desktopInput = finePointer.matches;
/** updateControls: 키보드·마우스 사용 여부에 따라 터치 조작부를 표시한다. */ function updateControls() { $('touch-controls').hidden = desktopInput; }
finePointer.addEventListener('change', /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** change 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ e => { desktopInput = e.matches; resetInput(); updateControls(); });
/** resetInput: 눌린 키·마우스·터치 입력을 지워 이동이나 기술 입력이 남지 않게 한다. */ function resetInput() {
  keys.clear(); mouseButtons.clear(); axis = { x: 0, y: 0 }; action = null; stickPointer = null;
  $('stick').style.transform = ''; $('action-a').classList.remove('pressed'); $('action-b').classList.remove('pressed'); $('action-c').classList.remove('pressed');
}
/** useSkill: 게임 진행과 조작 가능 여부를 검사하고 슬롯 시전 요청을 보낸다. */ function useSkill(/** slot: 기술을 저장하거나 시전할 A·B·C·P 슬롯. */ slot) {
  if (room?.phase !== 'started' || socket?.readyState !== WebSocket.OPEN || $('game-dialog').open || document.hidden || viewport.blockedPortrait) return;
  socket.send(JSON.stringify({v:1,type:'game.cast',slot}));
}
/** movementInput: 키보드와 조이스틱을 조합해 현재 프레임의 이동 입력을 구한다. */ function movementInput() {
  const /** blocked: 메뉴·기절 등으로 현재 조작이 차단되는지 여부. */ blocked = $('game-dialog').open || document.hidden || viewport.blockedPortrait;
  const /** x: 가로 좌표·이동 입력 또는 반복 비교 항목. */ x = blocked ? 0 : ((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) || axis.x);
  const /** y: 세로 좌표 또는 이동 입력. */ y = blocked ? 0 : ((keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) || axis.y);
  return {x,y,blocked};
}
/** inputPacket: 현재 이동과 기술 버튼 상태를 서버에 주기적으로 전송한다. */ function inputPacket() {
  if (room?.phase !== 'started' || socket?.readyState !== WebSocket.OPEN) return;
  const /** x: 가로 좌표·이동 입력 또는 반복 비교 항목; y: 세로 좌표 또는 이동 입력; blocked: 메뉴·기절 등으로 현재 조작이 차단되는지 여부. */ {x,y,blocked} = movementInput();
  socket.send(JSON.stringify({ v: 1, type: 'game.input', x, y, action: blocked ? null : action }));
}
/** showMenuPage: 게임 메뉴·테스트설정·옵션 중 선택한 화면만 표시한다. */ function showMenuPage(/** page: 메뉴에서 표시할 하위 화면 이름. */ page) {
  for (const /** name: 현재 항목이나 사용자에게 표시할 이름. */ name of ['main','test','options']) $('menu-' + name).hidden = name !== page;
  $('menu-title').textContent = {main:'게임 메뉴',test:'테스트설정',options:'옵션'}[page];
}
$('open-test-settings').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { showMenuPage('test'); $('test-back').focus(); };
$('open-options').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { showMenuPage('options'); $('control-scale').focus(); };
$('test-back').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { showMenuPage('main'); $('open-test-settings').focus(); };
$('options-back').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { showMenuPage('main'); $('open-options').focus(); };
/** syncTargetPriority: 사용자 설정의 공격 우선대상을 본인 서버 개체에 동기화한다. */ function syncTargetPriority() {
  if (room && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({v:1,type:'game.options',targetPriority:userSettings.targetPriority ?? 'nearest'}));
}
/** closeMenu: 열린 게임 메뉴 대화상자를 닫는다. */ function closeMenu() { if ($('game-dialog').open) $('game-dialog').close(); }
$('game-menu').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { resetInput(); inputPacket(); showMenuPage('main'); $('game-dialog').showModal(); $('resume').focus(); };
$('resume').onclick = closeMenu;
$('game-dialog').addEventListener('close', resetInput);
$('game-leave').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ () => { resetInput(); inputPacket(); send('room.leave'); };
window.addEventListener('keydown', /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** keydown 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ e => {
  if (room?.phase !== 'started' || viewport.blockedPortrait) return;
  desktopInput = true; updateControls();
  if (e.code === 'Escape') { e.preventDefault(); if ($('game-dialog').open) closeMenu(); else $('game-menu').click(); return; }
  if ($('game-dialog').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)) {
    e.preventDefault(); if (['ShiftLeft','ShiftRight'].includes(e.code) && !keys.has('ShiftLeft') && !keys.has('ShiftRight')) useSkill('C'); keys.add(e.code); action = desktopAction();
  }
});
window.addEventListener('keyup', /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** keyup 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ e => { keys.delete(e.code); action = desktopAction(); });
$('game-viewport').addEventListener('mousedown', /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** mousedown 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ e => {
  if (![0,2].includes(e.button) || room?.phase !== 'started' || $('game-dialog').open || viewport.blockedPortrait || e.target.closest?.('button, input, select, dialog, #joystick')) return;
  e.preventDefault(); desktopInput = true; updateControls();
  if (!mouseButtons.has(e.button)) useSkill(e.button === 0 ? 'A' : 'B');
  mouseButtons.add(e.button); action = desktopAction(); inputPacket();
});
window.addEventListener('mouseup', /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** mouseup 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ e => { mouseButtons.delete(e.button); action = desktopAction(); inputPacket(); });
$('game-viewport').addEventListener('contextmenu', /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** contextmenu 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ e => {
  if (room?.phase === 'started' && !$('game-dialog').open) e.preventDefault();
});
window.addEventListener('pointermove', /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** pointermove 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ e => { if (e.pointerType === 'mouse' && !desktopInput) { desktopInput = true; resetInput(); updateControls(); } });
window.addEventListener('blur', /** blur 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ () => { resetInput(); inputPacket(); });
document.addEventListener('visibilitychange', /** visibilitychange 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ () => { resetInput(); inputPacket(); });
const /** joystick: 이동 조이스틱의 HTML 요소. */ joystick = $('joystick');
/** moveStick: 포인터 위치를 조이스틱의 정규화된 이동 방향으로 변환한다. */ function moveStick(/** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ e) {
  if (e.pointerId !== stickPointer) return;
  const /** r: 조이스틱 요소의 화면 경계. */ r = joystick.getBoundingClientRect(), /** radius: 원형 판정 또는 조이스틱 이동의 반지름. */ radius = r.width * .32;
  let /** x: 가로 좌표·이동 입력 또는 반복 비교 항목. */ x = (e.clientX - r.left - r.width / 2) / radius, /** y: 세로 좌표 또는 이동 입력. */ y = (e.clientY - r.top - r.height / 2) / radius;
  const /** length: 이동 입력 벡터의 정규화에 사용할 길이. */ length = Math.max(1, Math.hypot(x,y)); x /= length; y /= length;
  axis = { x, y }; $('stick').style.transform = `translate(${x * radius}px,${y * radius}px)`;
}
joystick.onpointerdown = /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** onpointerdown: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ e => { if (stickPointer !== null) return; stickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveStick(e); };
joystick.onpointermove = moveStick;
/** releaseStick: 현재 조이스틱 포인터가 해제되면 이동 입력을 멈춘다. */ function releaseStick(/** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ e) { if (e.pointerId === stickPointer) { stickPointer = null; axis = { x: 0, y: 0 }; $('stick').style.transform = ''; inputPacket(); } }
for (const /** event: 현재 처리하는 사용자 입력 또는 연결 이벤트. */ event of ['pointerup','pointercancel','lostpointercapture']) joystick.addEventListener(event, releaseStick);
for (const /** key: 현재 항목의 식별 키. */ key of ['A','B','C']) {
  const /** button: 이벤트를 연결하거나 상태를 표시할 버튼 요소. */ button = $('action-' + key.toLowerCase()); let /** pointer: 기술 버튼을 잡고 있는 포인터 식별자. */ pointer = null;
  button.onpointerdown = /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** onpointerdown: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ e => { if (pointer !== null) return; pointer = e.pointerId; button.setPointerCapture(e.pointerId); action = key; useSkill(key); button.classList.add('pressed'); inputPacket(); };
  for (const /** event: 현재 처리하는 사용자 입력 또는 연결 이벤트. */ event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ /** 등록된 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ e => { if (e.pointerId !== pointer) return; pointer = null; if (action === key) action = null; button.classList.remove('pressed'); inputPacket(); });
}
updateControls();
setInterval(inputPacket, 100);
let /** viewport: 게임의 유효 화면 크기·배율·여백 정보. */ viewport = calculateViewport(innerWidth, innerHeight, CLIENT_MODE);
/** updateViewport: 화면 크기와 접속 모드에 맞게 월드 영역·여백·UI 배율을 갱신한다. */ function updateViewport() {
  viewport = calculateViewport(innerWidth, innerHeight, CLIENT_MODE);
  const /** frame: 현재 표시할 화면 영역 또는 수신 위치 프레임. */ frame = $('game-viewport');
  frame.style.width = `${viewport.pixelWidth}px`; frame.style.height = `${viewport.pixelHeight}px`;
  frame.style.left = `${viewport.left}px`; frame.style.top = `${viewport.top}px`;
  const /** hud: 게임 조작·상태 UI를 담는 영역. */ hud = $('game-hud');
  const /** shrinkHud: 세로 웹 화면에 맞춰 UI를 축소할지 여부. */ shrinkHud = CLIENT_MODE === 'web' && viewport.portrait;
  hud.style.width = shrinkHud ? `${viewport.worldWidth}px` : '100%';
  hud.style.height = shrinkHud ? `${viewport.worldHeight}px` : '100%';
  hud.style.transform = shrinkHud ? `scale(${viewport.scale})` : 'none';
  frame.hidden = viewport.blockedPortrait;
  if (viewport.blockedPortrait) closeMenu();
  $('rotate-notice').hidden = !viewport.blockedPortrait;
}
window.addEventListener('resize', /** resize 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ () => { updateViewport(); resetInput(); inputPacket(); });
const /** canvas: 월드 화면을 그리는 캔버스 요소. */ canvas = $('world'), /** ctx: 캔버스 또는 테스트 격리 실행 문맥. */ ctx = canvas.getContext('2d');
/** drawWorld: 표시용 이동 좌표와 같은 카메라 기준으로 필드·개체·기술 효과를 매 프레임 그린다. */ function drawWorld() {
  requestAnimationFrame(drawWorld);
  if (room?.phase !== 'started' || viewport.blockedPortrait) return;
  const /** displayObjects: 보간·예측을 마친 렌더링 전용 개체 목록. */ displayObjects = motionView.sample(playerId,movementInput(),Date.now());
  const /** me: 현재 접속자의 개체. */ me = displayObjects.find(/** p: 현재 처리하는 플레이어 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ p => p.id === playerId); if (!me) return;
  const /** w: 현재 대기 항목 또는 화면 너비. */ w = viewport.worldWidth, /** h: 화면의 세로 월드 길이. */ h = viewport.worldHeight, /** dpr: 캔버스 해상도에 적용할 제한된 기기 배율. */ dpr = Math.min(devicePixelRatio || 1, 2);
  const /** pixelWidth: 실제 렌더링 영역의 가로 픽셀 수. */ pixelWidth = Math.round(viewport.pixelWidth*dpr), /** pixelHeight: 실제 렌더링 영역의 세로 픽셀 수. */ pixelHeight = Math.round(viewport.pixelHeight*dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
  ctx.setTransform(pixelWidth/w,0,0,pixelHeight/h,0,0); ctx.fillStyle = '#14251e'; ctx.fillRect(0,0,w,h);
  const /** ox: 카메라 중심을 맞추는 월드 가로 오프셋. */ ox = w/2-me.x, /** oy: 카메라 중심을 맞추는 월드 세로 오프셋. */ oy = h/2-me.y;
  ctx.strokeStyle = '#284035'; ctx.lineWidth = 1; ctx.beginPath();
  for (let /** x: 가로 좌표·이동 입력 또는 반복 비교 항목. */ x = ((ox % 80)+80)%80; x < w; x += 80) { ctx.moveTo(x,0); ctx.lineTo(x,h); }
  for (let /** y: 세로 좌표 또는 이동 입력. */ y = ((oy % 80)+80)%80; y < h; y += 80) { ctx.moveTo(0,y); ctx.lineTo(w,y); } ctx.stroke();
  ctx.strokeStyle = '#96a47b'; ctx.strokeRect(ox-1520,oy-1520,3040,3040);
  drawSkillEffects(ctx, room.skillEffects ?? [], ox, oy);
  displayObjects.forEach(/** 각 항목에 현재 단계의 상태 갱신 또는 표시 처리를 적용한다. */ (/** p: 현재 처리하는 플레이어 또는 검증 개체. */ p,/** i: 현재 반복 항목의 순번. */ i) => {
    const /** x: 가로 좌표·이동 입력 또는 반복 비교 항목. */ x = p.x+ox, /** y: 세로 좌표 또는 이동 입력. */ y = p.y+oy;
    if (p.action) { ctx.strokeStyle = p.action === 'A' ? '#f7d98b' : '#93ccea'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x,y,32,0,Math.PI*2); ctx.stroke(); }
    ctx.fillStyle = p.id === playerId ? '#c8e5a6' : ['#e6ac8a','#91c8dd','#c7a8de','#d7cc82'][i];
    if (p.status?.objectType === 'player' || p.id === playerId) drawPlayerTriangle(ctx, p, x, y);
    else { ctx.beginPath(); ctx.arc(x,y,18,0,Math.PI*2); ctx.fill(); }
    if (userSettings.showNames) { ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '14px system-ui'; ctx.fillText(p.name + (p.id === playerId ? ' (나)' : ''),x,y-54); }
    drawObjectHud(ctx, p, x, y, playerId);
  });
}
/** drawSkillEffects: 시전 위치에 고정한 기술 사각형 범위를 월드 좌표로 그린다. */ function drawSkillEffects(/** context: 그리기 또는 테스트용 격리 실행 문맥. */ context, /** effects: 표시할 기술 범위 효과 목록. */ effects, /** ox: 카메라 중심을 맞추는 월드 가로 오프셋. */ ox, /** oy: 카메라 중심을 맞추는 월드 세로 오프셋. */ oy) {
  for (const /** e: 현재 입력 이벤트 또는 그릴 기술 효과. */ e of effects) {
    const /** c: 시전 방향의 코사인 값. */ c=Math.cos(e.angle),/** s: 시전 방향의 사인 값 또는 개체 스테이터스. */ s=Math.sin(e.angle);
    context.beginPath();
    [[0,-e.width/2],[e.length,-e.width/2],[e.length,e.width/2],[0,e.width/2]].forEach(/** 각 항목에 현재 단계의 상태 갱신 또는 표시 처리를 적용한다. */ (/** f: 공격 사각형 꼭짓점의 전방 거리; l: 공격 사각형 꼭짓점의 좌우 거리. */ [f,l],/** i: 현재 반복 항목의 순번. */ i)=>{
      const /** x: 가로 좌표·이동 입력 또는 반복 비교 항목. */ x=e.x+ox+f*c-l*s,/** y: 세로 좌표 또는 이동 입력. */ y=e.y+oy+f*s+l*c;
      if(i===0) context.moveTo(x,y); else context.lineTo(x,y);
    });
    context.closePath();context.fillStyle='#f7d98b33';context.fill();context.strokeStyle='#f7d98b';context.lineWidth=2;context.stroke();
  }
}
/** 첫 꼭짓점은 이동 방향을 향하며 외접원 반지름 18로 기존 표시 크기를 유지한다. */
/** drawPlayerTriangle: 이동 방향으로 꼭짓점이 향하는 반지름 18의 플레이어 삼각형을 그린다. */ function drawPlayerTriangle(/** context: 그리기 또는 테스트용 격리 실행 문맥. */ context, /** object: 현재 처리하는 월드 개체. */ object, /** x: 가로 좌표·이동 입력 또는 반복 비교 항목. */ x, /** y: 세로 좌표 또는 이동 입력. */ y) {
  const /** facing: 개체가 바라보는 방향(라디안). */ facing = Number.isFinite(object.facing) ? object.facing : -Math.PI / 2;
  context.beginPath();
  for (let /** i: 현재 반복 항목의 순번. */ i = 0; i < 3; i++) {
    const /** angle: 방향을 나타내는 라디안 각도. */ angle = facing + i * Math.PI * 2 / 3;
    const /** vx: 방향 벡터의 가로 성분 또는 꼭짓점 가로 좌표. */ vx = x + Math.cos(angle) * 18, /** vy: 방향 벡터의 세로 성분 또는 꼭짓점 세로 좌표. */ vy = y + Math.sin(angle) * 18;
    if (i === 0) context.moveTo(vx, vy); else context.lineTo(vx, vy);
  }
  context.closePath(); context.fill();
}
/** 플레이어·NPC·적에게 같은 상태 표시 규칙을 적용한다. */
/** drawObjectHud: 개체별 체력바·레벨·스킬자원을 공통 규칙으로 그린다. */ function drawObjectHud(/** context: 그리기 또는 테스트용 격리 실행 문맥. */ context, /** object: 현재 처리하는 월드 개체. */ object, /** x: 가로 좌표·이동 입력 또는 반복 비교 항목. */ x, /** y: 세로 좌표 또는 이동 입력. */ y, /** localId: 현재 접속자의 개체 식별자. */ localId) {
  const /** s: 시전 방향의 사인 값 또는 개체 스테이터스. */ s = object.status;
  if (!s) return;
  const /** maxHealth: 추가체력을 합산한 최대체력. */ maxHealth = s.effective?.maxHealth ?? Math.max(0, s.maxHealth + s.bonusHealth);
  const /** maxResource: 추가 수치를 합산한 최대 스킬자원. */ maxResource = s.effective?.maxSkillResource ?? Math.max(0, s.maxSkillResource + s.bonusSkillResource);
  const /** ratio: 최대치에 대한 현재 수치의 비율. */ ratio = maxHealth > 0 ? Math.max(0, Math.min(1, s.currentHealth / maxHealth)) : 0;
  const /** color: 개체 종류나 상태에 따라 선택한 표시 색상. */ color = s.objectType === 'npc' ? '#68cd84' : s.objectType === 'player' && object.id === localId ? '#63d4d2' : '#e76060';
  const /** width: 표시 영역 또는 공격 범위의 가로 폭. */ width = 64, /** top: 화면 요소 또는 체력바의 위쪽 좌표. */ top = y - 43;
  context.fillStyle = '#101713'; context.fillRect(x-width/2, top, width, 9);
  context.fillStyle = color; context.fillRect(x-width/2, top, width*ratio, 9);
  context.lineWidth = 1; context.strokeStyle = '#d9e5d766'; context.strokeRect(x-width/2, top, width, 9);
  context.font = 'bold 12px system-ui'; context.fillStyle = '#f1f6ed'; context.textAlign = 'right';
  context.fillText(`Lv.${s.level}`, x-width/2-5, top+9);
  if (maxResource > 0) {
    context.textAlign = 'center'; context.font = '13px system-ui'; context.fillStyle = '#a4d7fa';
    const /** number: 표시용 수치를 소수 첫째 자리로 정리하는 함수. */ number = /** value: 검사하거나 변환할 현재 값. */ /** number: 표시할 수치를 소수 첫째 자리까지 정리한다. */ value => String(Math.round(value * 10) / 10);
    context.fillText(`${number(s.currentSkillResource)} / ${number(maxResource)}`, x, y+36);
  }
}
requestAnimationFrame(drawWorld);
initializeClient();
