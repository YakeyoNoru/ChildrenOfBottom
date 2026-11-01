import { /** test: 테스트 시나리오 등록 함수. */ test } from 'node:test';
import /** assert: 기대 결과 검사 모듈. */ assert from 'node:assert/strict';
import /** vm: 브라우저 코드 격리 실행 모듈. */ vm from 'node:vm';
import { /** readFileSync: 실제 표시 소스를 읽는 함수. */ readFileSync } from 'node:fs';
/** 서버와 같은 규칙을 사용하는 실제 표시 이동기를 테스트 문맥에 생성한다. */
function create() {
 const /** context: 전역 상태를 격리한 실행 문맥. */ context=vm.createContext({});
 for(const /** file: 실행할 공통 이동·표시 코드 파일명. */ file of ['movement.js','motion.js']) vm.runInContext(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),context);
 return vm.runInContext('new MotionView()',context);
}
/** 서버가 보내는 개체 스냅샷을 구성한다. */
function object(/** id: 개체 ID. */ id,/** x: 가로 좌표. */ x,/** y: 세로 좌표. */ y=0,/** ack: 실제 처리한 입력 번호. */ ack=0) {
 return {id,x,y,facing:0,lastProcessedInput:ack,status:{state:'alive',moveSpeed:2,bonusMoveSpeed:0}};
}
/** 동일 방의 상태를 구성한다. */
function room(/** objects: 서버 개체 목록. */ objects) { return {code:'ONE',phase:'started',objects}; }

test('remote interpolation remains smooth and leaves authoritative objects unchanged',/** 타 개체 보간과 판정 좌표 분리를 검증한다. */ ()=>{
 const /** view: 표시 이동기. */ view=create();
 const /** first: 첫 수신 상태. */ first=room([object('me',0),object('enemy',0)]);
 view.receive(first,'me',0);view.receive(room([object('me',0),object('enemy',50)]),'me',50);
 assert.equal(view.sample('me',{},100).find(/** 적을 조회한다. */ (/** item: 표시 개체. */ item)=>item.id==='enemy').x,25);
 assert.equal(first.objects[1].x,0);
});

test('delayed acknowledgements replay only remaining inputs; diagonal stopping never rewinds',/** 지연 확인 중 대각선 정지와 중복 재계산 방지를 검증한다. */ ()=>{
 const /** view: 표시 이동기. */ view=create();view.receive(room([object('me',0)]),'me',0);
 view.command({x:1,y:1,localId:'me'},0);view.command({x:1,y:1,localId:'me'},50);
 const /** expected: 두 고정 입력의 대각선 최종 좌표. */ expected=22/Math.sqrt(2);
 assert.ok(Math.abs(view.predicted.x-expected)<1e-8);
 view.receive(room([object('me',11/Math.sqrt(2),11/Math.sqrt(2),1)]),'me',75);
 assert.equal(view.pendingInputs.length,1);assert.ok(Math.abs(view.predicted.x-expected)<1e-8);
 view.command({x:0,y:0,localId:'me'},100);
 let /** previous: 이전 표시 프레임의 가로 좌표. */ previous=0;
 for(let /** now: 검증할 렌더 시각(밀리초). */ now=100;now<180;now+=16) {
  const /** displayed: 현재 프레임의 본인 표시 좌표. */ displayed=view.sample('me',{},now)[0];
  assert.ok(displayed.x>=previous-1e-8);previous=displayed.x;
 }
 view.receive(room([object('me',expected,expected,3)]),'me',180);
 assert.equal(view.pendingInputs.length,0);
 assert.ok(view.sample('me',{},196)[0].x>=previous-1e-8);
});

test('same-time calls cannot create extra movement and stale snapshots bound prediction',/** 중복 전송과 통신 단절이 무한 예측 이동을 만들지 않음을 검증한다. */ ()=>{
 const /** view: 표시 이동기. */ view=create();view.receive(room([object('me',0)]),'me',0);
 assert.ok(view.command({x:1,y:0,localId:'me'},0));
 assert.equal(view.command({x:1,y:0,localId:'me'},1),null);
 assert.equal(view.command({x:1,y:0,localId:'me'},1000),null);
 assert.equal(view.predicted.x,11);
});

test('stun reconciles movement; new rooms and teleports reset visible state',/** 서버 상태 변화와 방 전환 시 이전 예측이 섞이지 않는지 검증한다. */ ()=>{
 const /** view: 표시 이동기. */ view=create();view.receive(room([object('me',0)]),'me',0);
 view.command({x:1,y:0,localId:'me'},0);
 const /** frozen: 서버에서 기절이 확정된 개체. */ frozen=object('me',0);frozen.status.stunned=true;
 view.receive(room([frozen]),'me',50);assert.equal(view.predicted.x,0);
 view.receive({code:'TWO',phase:'started',objects:[object('me',500)]},'me',100);
 assert.equal(view.pendingInputs.length,0);assert.equal(view.sequence,0);assert.equal(view.local.x,500);
 view.clear();assert.equal(view.sample('me',{},200).length,0);
});

test('roll replay preserves authoritative state without restarting skill',/** 서버 구르기 상태의 복사·미확인 이동 재계산을 검증한다. */ ()=>{
 const /** view: 표시·예측 이동기. */ view=create();
 const /** me: 서버가 확정한 구르기 초기 상태. */ me=object('me',0);me.roll={angle:0,speed:660,remaining:72};
 view.receive(room([me]),'me',0);view.command({x:-1,y:0,localId:'me'},0);
 assert.equal(view.predicted.x,33);assert.equal(me.roll.remaining,72);
 const /** confirmed: 첫 입력이 반영된 서버 구르기 상태. */ confirmed=object('me',33,0,1);confirmed.roll={angle:0,speed:660,remaining:39};
 view.receive(room([confirmed]),'me',50);assert.equal(view.predicted.x,33);assert.equal(view.pendingInputs.length,0);
 view.command({x:0,y:-1,localId:'me'},50);assert.equal(view.predicted.x,66);assert.equal(view.predicted.y,0);
});
