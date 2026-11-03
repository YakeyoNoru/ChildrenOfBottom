import { /** test: 테스트 시나리오와 비동기 정리 절차를 등록한다. */ test } from 'node:test';
import /** assert: 실제 결과와 기대 조건을 비교해 테스트 실패를 검출한다. */ assert from 'node:assert/strict';
import { /** readFileSync: 설정·계정·테스트 소스 파일을 동기적으로 읽는다. */ readFileSync } from 'node:fs';
import /** vm: 브라우저·표시 코드를 격리 문맥에서 실행한다. */ vm from 'node:vm';

// 브라우저 API 대역으로 실제 클라이언트의 화면 상태와 입력을 검증한다.
// npm 테스트 실행에 별도 브라우저 설치를 요구하지 않는다.
/** client: 실제 클라이언트 코드를 API 대역에서 실행하거나 검증용 접속자를 생성한다. */ function client(/** mode: 웹 게스트와 APK 계정을 구분하는 접속 모드. */ mode='web') {
  /** Element: 브라우저 API 또는 연결 객체를 대신해 실제 클라이언트의 상태·입력을 검증한다. */
class Element extends EventTarget {
    /** hidden: 테스트 대역에서 유지할 요소 또는 연결 상태. */ hidden=false; /** open: 테스트 대역에서 유지할 요소 또는 연결 상태. */ open=false; /** value: 검사하거나 변환할 현재 값. */ value=''; /** style: 테스트 대역에서 유지할 요소 또는 연결 상태. */ style={/** setProperty: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ setProperty(){}}; /** disabled: 테스트 대역에서 유지할 요소 또는 연결 상태. */ disabled=false; /** checked: 테스트 대역에서 유지할 요소 또는 연결 상태. */ checked=true;
    /** setAttribute: 요소 속성 설정을 테스트 대역에 기록한다. */ setAttribute(/** name: 현재 항목이나 사용자에게 표시할 이름. */ name,/** value: 검사하거나 변환할 현재 값. */ value){/** this.name: 현재 항목이나 사용자에게 표시할 이름. */ this[name]=value;}
    /** classList: 테스트 대역에서 유지할 요소 또는 연결 상태. */ classList={/** toggle: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ toggle(){},/** add: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ add(){},/** remove: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ remove(){}};
    /** append: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ append(){} /** replaceChildren: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ replaceChildren(){} /** focus: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ focus(){} /** setPointerCapture: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ setPointerCapture(){}
    /** getBoundingClientRect: 조이스틱 입력 계산에 사용할 고정 요소 경계를 제공한다. */ getBoundingClientRect(){return {left:0,top:0,width:132,height:132};}
    /** showModal: 테스트 대화상자를 열린 상태로 만든다. */ showModal(){/** this.open: 테스트 대화상자의 열림 여부. */ this.open=true;} /** close: 반복 작업이나 연결을 정리하여 사용 중인 자원을 해제한다. */ close(){/** this.open: 테스트 대화상자의 열림 여부. */ this.open=false;this.dispatchEvent(new Event('close'));}
    /** click: 테스트 요소의 클릭 처리기를 실행한다. */ click(){this.onclick?.();}
    /** getContext: 렌더링 호출을 위한 테스트용 그리기 문맥을 제공한다. */ getContext(){return {};}
  }
  const /** ids: HTML에서 추출한 요소 식별자 목록. */ ids=[...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(/** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ m=>m[1]);
  const /** elements: 식별자별 브라우저 요소 대역 모음. */ elements=new Map(ids.map(/** id: 대상 개체 또는 요소의 식별자. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ id=>[id,new Element()]));
  elements.get('game').hidden=true;
  /** Socket: 브라우저 API 또는 연결 객체를 대신해 실제 클라이언트의 상태·입력을 검증한다. */
class Socket {
    /** OPEN: 테스트 대역에서 유지할 요소 또는 연결 상태. */ static OPEN=1;
    /** readyState: 테스트 대역에서 유지할 요소 또는 연결 상태. */ readyState=1; /** sent: 테스트 대역에서 유지할 요소 또는 연결 상태. */ sent=[];
    /** send: 메시지 종류와 프로토콜 버전을 붙여 현재 연결로 전송한다. */ send(/** raw: 수신한 원본 메시지. */ raw){this.sent.push(JSON.parse(raw));}
    /** close: 반복 작업이나 연결을 정리하여 사용 중인 자원을 해제한다. */ close(){/** this.readyState: 테스트 연결의 접속 상태. */ this.readyState=3;this.onclose();}
  }
  const /** document: 테스트용 문서 API 대역. */ document=new EventTarget(); document.hidden=false;document.body=new Element();document.documentElement=new Element();
  document.getElementById=/** id: 대상 개체 또는 요소의 식별자. */ /** getElementById: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ id=>elements.get(id);document.createElement=/** createElement: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ ()=>new Element();
  const /** window: 테스트용 창 이벤트 API 대역. */ window=new EventTarget(), /** timers: 테스트에서 등록한 주기 실행 함수 목록. */ timers=[];
  const /** context: 그리기 또는 테스트용 격리 실행 문맥. */ context=vm.createContext({document,window,WebSocket:Socket,/** matchMedia: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ matchMedia:()=>({matches:false,/** addEventListener: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ addEventListener(){}}),location:{protocol:'http:',host:'localhost'},crypto:{/** randomUUID: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ randomUUID:()=>String(Math.random())},navigator:{userAgent:''},innerWidth:950,innerHeight:500,/** setTimeout: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ setTimeout:()=>1,/** clearTimeout: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ clearTimeout(){},/** setInterval: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ setInterval:/** fn: 등록하거나 실행할 콜백 함수. */ fn=>timers.push(fn),/** requestAnimationFrame: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ requestAnimationFrame(){}});
  vm.runInContext(readFileSync(new URL('../public/client-mode.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/viewport.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/pit-map-rules.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/movement.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/motion.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/room-timer.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/item-view.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/minimap.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
  const /** run: 격리 문맥 안에서 테스트 코드를 실행하는 함수. */ run=/** script: 격리 문맥에서 실행할 테스트 코드 문자열. */ /** run: 격리 문맥에서 실제 클라이언트 코드를 실행해 결과를 확인한다. */ script=>vm.runInContext(script,context);
  const /** receive: 서버 메시지 수신을 재현하는 테스트 함수. */ receive=/** message: 사용자나 연결에 전달할 안내 내용. */ /** receive: 서버 스냅샷을 표시용 이력으로 복사하고 방 변경·순간이동을 반영한다. */ message=>run(`socket.onmessage({data:${JSON.stringify(JSON.stringify({v:1,...message}))}})`);
  receive({type:'welcome',playerId:'me'});
  const /** state: 현재 상태 스냅샷. */ state={code:'ABC123',hostId:'me',phase:'started',players:[{id:'me',name:'나',x:0,y:0},{id:'other',name:'동료',x:10,y:10}]};
  return {elements,run,receive,state,window,timers};
}
/** key: 키보드 이벤트를 만들어 지정한 대상에 전달한다. */ function key(/** target: 현재 처리할 대상 또는 이동할 URL. */ target,/** type: 처리하거나 기다릴 메시지 또는 이벤트 유형. */ type,/** code: 개체·기술·방 또는 오류를 식별하는 코드. */ code){const /** e: 검증할 이벤트·요소 모음·적 개체. */ e=new Event(type,{cancelable:true});Object.defineProperty(e,'code',{value:code});target.dispatchEvent(e);}

test('client enters own game, hides touch on keyboard, sends input and stops for menu',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** e: 검증할 이벤트·요소 모음·적 개체; receive: 서버 메시지 수신을 재현하는 테스트 함수; state: 현재 상태 스냅샷; window: 테스트용 창 이벤트 API 대역; run: 격리 문맥 안에서 테스트 코드를 실행하는 함수. */ {elements:e,receive,state,window,run}=client();
  receive({type:'room.state',room:state});
  assert.equal(e.get('game').hidden,false);assert.equal(e.get('home').hidden,true);assert.equal(e.get('lobby').hidden,true);
  assert.equal(e.get('touch-controls').hidden,false);
  key(window,'keydown','KeyD');run('inputPacket()');
  assert.equal(e.get('touch-controls').hidden,true);assert.equal(run('socket.sent.at(-1).x'),1);
  e.get('game-menu').click();assert.equal(e.get('game-dialog').open,true);
  run('motionView.lastCommandTime-=50;inputPacket()');assert.equal(run('socket.sent.at(-1).x'),0);
  e.get('resume').click();assert.equal(e.get('game-dialog').open,false);
  receive({type:'game.state',room:{...state,players:[{...state.players[0],x:40}]}});
  assert.equal(run('room.players[0].x'),40);
  e.get('game-menu').click();e.get('game-leave').click();assert.equal(run('socket.sent.at(-1).type'),'room.leave');
  receive({type:'room.left'});assert.equal(e.get('home').hidden,false);assert.equal(e.get('game').hidden,true);assert.equal(e.get('game-dialog').open,false);
  receive({type:'game.state',room:state});assert.equal(run('room'),null);
});
test('touch joystick and A can be held together; cancellation and disconnect clear them',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** e: 검증할 이벤트·요소 모음·적 개체; receive: 서버 메시지 수신을 재현하는 테스트 함수; state: 현재 상태 스냅샷; run: 격리 문맥 안에서 테스트 코드를 실행하는 함수. */ {elements:e,receive,state,run}=client();receive({type:'room.state',room:state});
  const /** touch: 터치 입력을 재현하는 테스트 이벤트. */ touch={pointerId:1,clientX:120,clientY:66};
  e.get('joystick').onpointerdown(touch);e.get('action-a').onpointerdown({pointerId:2});run('inputPacket()');
  assert.equal(run('socket.sent.filter(m=>m.type==="game.input").at(-1).x'),1);assert.equal(run('socket.sent.filter(m=>m.type==="game.input").at(-1).action'),'A');
  const /** cancel: 포인터 취소를 재현하는 테스트 이벤트. */ cancel=new Event('pointercancel');Object.defineProperty(cancel,'pointerId',{value:1});e.get('joystick').dispatchEvent(cancel);run('motionView.lastCommandTime-=50;inputPacket()');
  assert.equal(run('socket.sent.at(-1).x'),0);
  run('socket.close()');assert.equal(e.get('home').hidden,false);assert.equal(run('action'),null);assert.equal(run('axis.x'),0);
});

test('object HUD colors, left level, effective health ratio and conditional skill resource',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** run: 격리 문맥 안에서 테스트 코드를 실행하는 함수. */ {run}=client();
  run(`globalThis.draws=[];globalThis.hud={fillRect(x,y,w,h){draws.push({kind:'bar',color:this.fillStyle,x,y,w,h});},strokeRect(){},fillText(text,x,y){draws.push({kind:'text',text,x,y,align:this.textAlign});}}`);
  for (const /** objectType: 생성하거나 검사할 개체 분류; id: 대상 개체 또는 요소의 식별자; color: 개체 종류나 상태에 따라 선택한 표시 색상. */ [objectType,id,color] of [['player','me','#63d4d2'],['player','other','#e76060'],['npc','npc','#68cd84'],['enemy','enemy','#e76060']]) {
    run(`draws=[];drawObjectHud(hud,${JSON.stringify({id,status:{objectType,level:3,currentHealth:5,maxHealth:10,bonusHealth:10,maxSkillResource:0,bonusSkillResource:0,currentSkillResource:0}})},100,100,'me')`);
    assert.equal(run('draws[1].color'),color);assert.equal(run('draws[1].w'),16);
    assert.equal(run('draws[2].text'),'Lv.3');assert.equal(run('draws[2].align'),'right');assert.ok(run('draws[2].x')<68);
    assert.equal(run('draws.length'),3);
  }
  run(`draws=[];drawObjectHud(hud,{id:'me',status:{objectType:'player',level:1,currentHealth:10,effective:{maxHealth:10,maxSkillResource:5},currentSkillResource:2.5}},100,100,'me')`);
  assert.equal(run('draws.at(-1).text'),'2.5 / 5');assert.ok(run('draws.at(-1).y')>100);
});

test('web portrait resize shrinks fixed 19:10 frame, keeps input active and restores landscape',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** e: 검증할 이벤트·요소 모음·적 개체; receive: 서버 메시지 수신을 재현하는 테스트 함수; state: 현재 상태 스냅샷; window: 테스트용 창 이벤트 API 대역; run: 격리 문맥 안에서 테스트 코드를 실행하는 함수. */ {elements:e,receive,state,window,run}=client();receive({type:'room.state',room:state});
  key(window,'keydown','KeyD');run('inputPacket()');assert.equal(run('socket.sent.at(-1).x'),1);
  e.get('game-menu').click();
  run('innerWidth=400;innerHeight=900');window.dispatchEvent(new Event('resize'));
  assert.equal(e.get('rotate-notice').hidden,true);assert.equal(e.get('game-viewport').hidden,false);assert.equal(run('viewport.worldHeight'),360);
  e.get('resume').click();
  key(window,'keydown','KeyD');run('inputPacket()');assert.equal(run('socket.sent.at(-1).x'),1);
  run('innerWidth=950;innerHeight=500');window.dispatchEvent(new Event('resize'));
  assert.equal(e.get('rotate-notice').hidden,true);assert.equal(e.get('game-viewport').hidden,false);
  assert.equal(run('viewport.worldWidth'),684);assert.equal(run('viewport.worldHeight'),360);
});

test('player triangle apex follows facing including diagonals, with default up and radius 18',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** run: 격리 문맥 안에서 테스트 코드를 실행하는 함수. */ {run}=client();
  run(`globalThis.vertices=[];globalThis.triangleContext={beginPath(){},moveTo(x,y){vertices.push([x,y]);},lineTo(x,y){vertices.push([x,y]);},closePath(){},fill(){}}`);
  for(const /** angle: 방향을 나타내는 라디안 각도. */ angle of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4]){
    run(`vertices=[];drawPlayerTriangle(triangleContext,{facing:${angle}},100,100)`);
    assert.ok(Math.abs(run('vertices[0][0]')-(100+Math.cos(angle)*18))<1e-7);
    assert.ok(Math.abs(run('vertices[0][1]')-(100+Math.sin(angle)*18))<1e-7);
    assert.equal(run('vertices.length'),3);
    assert.ok(run('vertices.every(([x,y])=>Math.abs(Math.hypot(x-100,y-100)-18)<1e-7)'));
  }
  run('vertices=[];drawPlayerTriangle(triangleContext,{},100,100)');assert.equal(run('vertices[0][1]'),82);
});

test('menu separates test settings and options; radio option syncs to server',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** e: 검증할 이벤트·요소 모음·적 개체; receive: 서버 메시지 수신을 재현하는 테스트 함수; state: 현재 상태 스냅샷; run: 격리 문맥 안에서 테스트 코드를 실행하는 함수. */ {elements:e,receive,state,run}=client();receive({type:'room.state',room:state});
  e.get('game-menu').click();assert.equal(e.get('menu-main').hidden,false);assert.equal(e.get('menu-options').hidden,true);
  e.get('open-test-settings').click();assert.equal(e.get('menu-test').hidden,false);assert.equal(e.get('menu-main').hidden,true);
  e.get('test-back').click();e.get('open-options').click();assert.equal(e.get('menu-options').hidden,false);assert.equal(e.get('menu-test').hidden,true);
  for(const /** mode: 웹 게스트와 APK 계정을 구분하는 접속 모드. */ mode of ['nearest','lowestHealth','lowestHealthRatio'])e.get('target-'+mode).checked=mode==='lowestHealthRatio';
  e.get('target-lowestHealthRatio').onchange();assert.equal(run('userSettings.targetPriority'),'lowestHealthRatio');assert.equal(run('socket.sent.at(-1).type'),'game.options');assert.equal(run('socket.sent.at(-1).targetPriority'),'lowestHealthRatio');
  e.get('options-back').click();assert.equal(e.get('menu-main').hidden,false);e.get('resume').click();e.get('game-menu').click();assert.equal(e.get('menu-main').hidden,false);
});

test('desktop maps left/right mouse and either Shift, blocks UI casts and suppresses game context menu',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
 const /** e: 검증할 이벤트·요소 모음·적 개체; receive: 서버 메시지 수신을 재현하는 테스트 함수; state: 현재 상태 스냅샷; window: 테스트용 창 이벤트 API 대역; run: 격리 문맥 안에서 테스트 코드를 실행하는 함수. */ {elements:e,receive,state,window,run}=client();receive({type:'room.state',room:state});
 const /** mouse: 마우스 이벤트를 재현하는 테스트 함수. */ mouse=/** mouse: 마우스 버튼 이벤트를 만들어 조작 매핑을 검증한다. */ (/** target: 현재 처리할 대상 또는 이동할 URL. */ target,/** type: 처리하거나 기다릴 메시지 또는 이벤트 유형. */ type,/** button: 이벤트를 연결하거나 상태를 표시할 버튼 요소. */ button)=>{const /** event: 현재 처리하는 사용자 입력 또는 연결 이벤트. */ event=new Event(type,{cancelable:true});Object.defineProperty(event,'button',{value:button});target.dispatchEvent(event);return event;};
 const /** casts: 전송한 기술 시전 슬롯 목록을 조회하는 함수. */ casts=/** casts: 클라이언트가 전송한 시전 요청의 슬롯 목록을 읽는다. */ ()=>run('socket.sent.filter(m=>m.type==="game.cast").map(m=>m.slot).join(",")');
 mouse(e.get('game-viewport'),'mousedown',0);mouse(window,'mouseup',0);
 mouse(e.get('game-viewport'),'mousedown',2);mouse(window,'mouseup',2);
 key(window,'keydown','ShiftLeft');key(window,'keydown','ShiftLeft');key(window,'keydown','ShiftRight');key(window,'keyup','ShiftLeft');key(window,'keyup','ShiftRight');
 assert.equal(casts(),'A,B,C');
 key(window,'keydown','KeyJ');key(window,'keydown','KeyK');key(window,'keydown','KeyL');assert.equal(casts(),'A,B,C');
 const /** context: 그리기 또는 테스트용 격리 실행 문맥. */ context=new Event('contextmenu',{cancelable:true});e.get('game-viewport').dispatchEvent(context);assert.equal(context.defaultPrevented,true);
 e.get('game-menu').click();mouse(e.get('game-viewport'),'mousedown',0);key(window,'keydown','ShiftLeft');assert.equal(casts(),'A,B,C');
});

test('rolling blocks local movement axes and skill requests',/** 구르는 동안 웹 조작부가 이동·기술을 요청하지 않는지 검증한다. */ ()=>{
 const /** e: UI 요소; receive: 상태 수신 함수; state: 기본 방; run: 격리 실행 함수; window: 이벤트 대상. */ {elements:e,receive,state,run,window}=client();
 receive({type:'room.state',room:{...state,players:[{...state.players[0],roll:{remaining:72,angle:0,speed:660}}]}});
 key(window,'keydown','KeyD');run("useSkill('A');useSkill('B');useSkill('C')");
 assert.equal(run('movementInput().x'),0);assert.equal(run('socket.sent.filter(m=>m.type==="game.cast").length'),0);
});

test('touch control checkbox overrides hardware detection and can always hide controls',/** 수동 표시·숨김이 키보드·마우스 감지보다 우선하는지 검증한다. */ ()=>{
 const /** e: UI 요소; receive: 상태 수신 함수; state: 방 상태; window: 입력 이벤트; run: 코드 실행기. */ {elements:e,receive,state,window,run}=client();receive({type:'room.state',room:state});
 assert.equal(e.get('show-touch-controls').checked,true);
 key(window,'keydown','KeyD');assert.equal(e.get('show-touch-controls').checked,false);
 e.get('show-touch-controls').checked=true;e.get('show-touch-controls').onchange();
 key(window,'keydown','KeyW');assert.equal(e.get('touch-controls').hidden,false);assert.equal(run('userSettings.showTouchControls'),true);
 e.get('show-touch-controls').checked=false;e.get('show-touch-controls').onchange();assert.equal(e.get('touch-controls').hidden,true);
 run('desktopInput=false;updateControls()');assert.equal(e.get('touch-controls').hidden,true);
});

test('remaining cooldown disables touch skills and keyboard or mouse cast until server reaches zero',/** 잔여 대기에 맞춰 모든 조작 경로와 버튼 활성화가 바뀌는지 검증한다. */ ()=>{
 const /** e: UI 요소; receive: 상태 수신 함수; state: 방 상태; run: 코드 실행기. */ {elements:e,receive,state,run}=client();
 receive({type:'room.state',room:{...state,players:[{...state.players[0],status:{skillACooldownRemaining:.5,skillBCooldownRemaining:2,skillCCooldownRemaining:0}}]}});
 assert.equal(e.get('action-a').disabled,true);assert.equal(e.get('action-b').disabled,true);assert.equal(e.get('action-c').disabled,false);
 run("useSkill('A');useSkill('B')");assert.equal(run('socket.sent.filter(m=>m.type==="game.cast").length'),0);
 receive({type:'game.state',room:{...state,players:[{...state.players[0],status:{skillACooldownRemaining:0,skillBCooldownRemaining:0}}]}});
 assert.equal(e.get('action-a').disabled,false);run("useSkill('A')");assert.equal(run('socket.sent.at(-1).slot'),'A');
});

test('assigned skill names and cooldown labels update from server state',/** 이름과 잔여 시간 표시·완료 숨김·할당 변경을 검증한다. */ ()=>{
 const /** e: UI 요소; receive: 수신 함수; state: 기본 방. */ {elements:e,receive,state}=client();
 receive({type:'room.state',room:{...state,players:[{...state.players[0],skillNames:{A:'기본공격',B:'구르기',C:'미지정'},status:{skillACooldownRemaining:.45,skillBCooldownRemaining:2}}]}});
 assert.equal(e.get('skill-name-a').textContent,'기본공격');assert.equal(e.get('skill-name-b').textContent,'구르기');
 assert.equal(e.get('cooldown-a').textContent,'0.5초');assert.equal(e.get('cooldown-b').textContent,'2.0초');assert.equal(e.get('cooldown-c').hidden,true);
 receive({type:'game.state',room:{...state,players:[{...state.players[0],skillNames:{A:'구르기',B:'기본공격'},status:{skillACooldownRemaining:0}}]}});
 assert.equal(e.get('cooldown-a').hidden,true);assert.equal(e.get('skill-name-a').textContent,'구르기');
});

test('room timer displays countdown and grace then returns home with server closure message',/** 서버 시간 표시와 종료 시 입력·대기 해제를 검증한다. */ ()=>{
 const /** e: UI 요소; receive: 메시지 수신; state: 기본 방; run: 격리 실행. */ {elements:e,receive,state,run}=client();
 receive({type:'room.state',room:{...state,timer:{remainingMs:600000,closeRemainingMs:660000}}});
 assert.equal(e.get('room-timer-value').textContent,'10:00');assert.equal(e.get('room-timer-grace').hidden,true);
 receive({type:'game.state',room:{...state,timer:{remainingMs:0,closeRemainingMs:60000}}});run('updateRoomTimer()');
 assert.equal(e.get('room-timer-value').textContent,'00:00');assert.equal(e.get('room-timer-grace').hidden,false);
 run('pending="waiting"');receive({type:'room.closed',reason:'TIME_LIMIT',message:'제한 시간이 지나 방이 종료되었습니다.'});
 assert.equal(e.get('home').hidden,false);assert.equal(e.get('notice').textContent,'제한 시간이 지나 방이 종료되었습니다.');assert.equal(run('pending'),null);assert.equal(run('socket.readyState'),1);
});

test('client retains initial map through lightweight snapshots and clears it on leaving',/** 초기 지도 수신 후 틱에서 맵이 빠져도 유지하며 퇴장 시 초기화하는지 검증한다. */ ()=>{
 const /** receive: 상태 수신 함수; state: 방 상태; run: 실행 문맥 조회. */ {receive,state,run}=client();
 const /** map: 예측과 화면이 공유할 최소 검증 지도. */ map={id:'test-map',tileRadius:90,landScale:.89,bridgeWidth:48,tiles:[{id:1,q:0,r:0,height:1}],bridges:[]};
 receive({type:'room.state',room:{...state,map}});receive({type:'game.state',room:{...state,mapId:map.id}});
 assert.equal(run('room.map.id'),map.id);assert.equal(run('motionView.map.id'),map.id);
 receive({type:'room.left'});assert.equal(run('motionView.map'),null);
});

test('cast carries the latest generated input sequence without duplicate movement packets',/** 동일 프레임 호출이 입력을 늘리지 않고 시전이 이동 순번에 연결되는지 검사한다. */ ()=>{
 const /** receive: 서버 수신 대역; state: 방 상태; run: 격리 실행기. */ {receive,state,run}=client();receive({type:'room.state',room:state});
 run('useSkill("A");inputPacket();inputPacket()');
 assert.equal(run('socket.sent.filter(m=>m.type==="game.input").length'),1);
 assert.equal(run('socket.sent.find(m=>m.type==="game.cast").afterInputSeq'),1);
 assert.equal(run('socket.sent.find(m=>["game.input","game.cast"].includes(m.type)).type'),'game.input');
});

test('public browser and code join are distinct; privacy follows host authority',/** 공개 목록 요청과 코드 폼·비공개 체크 동기화를 검사한다. */ ()=>{
 const /** e: 요소 대역; receive: 메시지 수신; state: 방 상태; run: 격리 실행기. */ {elements:e,receive,state,run}=client();
 e.get('browse-open').click();assert.equal(e.get('room-browser').hidden,false);assert.equal(run('socket.sent.at(-1).type'),'room.list');
 receive({type:'room.list',rooms:[{code:'ABC123',hostName:'방장',playerCount:1,maxPlayers:5}]});receive({type:'ack',requestId:run('pending')});
 assert.equal(run('publicRooms.length'),1);assert.equal(e.get('rooms-empty').hidden,true);
 e.get('join-open').click();assert.equal(e.get('join-form').hidden,false);assert.equal(e.get('room-browser').hidden,true);
 receive({type:'room.state',room:{...state,phase:'lobby',private:true}});assert.equal(e.get('room-private').checked,true);assert.equal(e.get('room-private').disabled,false);
 e.get('room-private').checked=false;e.get('room-private').onchange();assert.equal(run('socket.sent.at(-1).type'),'room.privacy');assert.equal(run('socket.sent.at(-1).private'),false);
 receive({type:'ack',requestId:run('pending')});receive({type:'room.state',room:{...state,phase:'lobby',hostId:'other',private:true}});assert.equal(e.get('room-private').disabled,true);
});

test('Tab toggles expanded map and minimap touch opens it; repeat does not toggle',/** 확대 지도 열기·닫기와 연속 키 반복·공격 잠금을 검증한다. */ ()=>{
 const /** e: 화면 요소; receive: 수신 대역; state: 기본 방; window: 이벤트 대상; run: 실행기. */ {elements:e,receive,state,window,run}=client();receive({type:'room.state',room:state});
 assert.equal(e.get('expanded-map').hidden,true);key(window,'keydown','Tab');assert.equal(e.get('expanded-map').hidden,false);
 run('useSkill("A")');assert.equal(run('socket.sent.filter(m=>m.type==="game.cast").length'),0);
 const /** repeated: 자동 반복 Tab 이벤트. */ repeated=new Event('keydown',{cancelable:true});Object.defineProperty(repeated,'code',{value:'Tab'});Object.defineProperty(repeated,'repeat',{value:true});window.dispatchEvent(repeated);assert.equal(e.get('expanded-map').hidden,false);
 key(window,'keydown','Tab');assert.equal(e.get('expanded-map').hidden,true);
 e.get('minimap').click();assert.equal(e.get('expanded-map').hidden,false);
 const /** pointer: 화면 닫기 터치. */ pointer=new Event('pointerdown',{cancelable:true});window.dispatchEvent(pointer);assert.equal(e.get('expanded-map').hidden,true);assert.equal(pointer.defaultPrevented,true);
 receive({type:'room.left'});assert.equal(e.get('expanded-map').hidden,true);
});
