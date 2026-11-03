import { /** test: 테스트 등록. */ test } from 'node:test';
import /** assert: 기대 결과 비교. */ assert from 'node:assert/strict';
import '../public/movement.js';
import '../public/input-timeline.js';
/** 고정 속도 개체와 입력 대기열을 만든다. */
function player(/** count: 준비할 이동 입력 수. */ count){return {x:0,y:0,status:{moveSpeed:2,bonusMoveSpeed:0},inputQueue:Array.from({length:count},/** 순번 입력을 만든다. */ (/** unused: 미사용 값. */ unused,/** index: 입력 순번. */ index)=>({seq:index+1,x:1,y:0})),lastReceivedInput:count,movementClock:{last:0,credit:0}};}
test('cast executes after matching movement and before later movement during catch-up',/** 밀린 입력에서도 공격 위치가 지정 순번의 위치임을 검증한다. */ ()=>{
 const /** p: 입력 8개가 대기 중인 개체. */ p=player(8);
 const /** positions: 공격 시점의 위치 기록. */ positions=[];
 assert.equal(InputTimeline.enqueue(p,'A',2),null);
 assert.equal(InputTimeline.advance(p,null,200,/** 실행 위치를 기록한다. */ ()=>positions.push(p.x)),4);
 assert.deepEqual(positions,[22]);assert.equal(p.x,44);assert.equal(p.lastProcessedInput,4);
 InputTimeline.advance(p,null,250,/** 추가 시전은 없어야 한다. */ ()=>assert.fail());assert.equal(p.x,55);
});
test('elapsed time limits burst movement and same-time callbacks cannot accelerate',/** 입력 개수·긴 멈춤이 무제한 이동을 만들지 않음을 검사한다. */ ()=>{
 const /** p: 최대 대기 입력을 가진 개체. */ p=player(32);
 assert.equal(InputTimeline.advance(p,null,5000,/** 사용하지 않는 시전 처리. */ ()=>{}),4);assert.equal(p.x,44);
 assert.equal(InputTimeline.advance(p,null,5000,/** 사용하지 않는 시전 처리. */ ()=>{}),0);
 assert.equal(InputTimeline.advance(p,null,5049,/** 사용하지 않는 시전 처리. */ ()=>{}),0);
 assert.equal(InputTimeline.advance(p,null,5050,/** 사용하지 않는 시전 처리. */ ()=>{}),1);assert.equal(p.x,55);
});
test('cast queue rejects future/stale/out-of-order sequences and caps requests',/** 순번 조작·대기열 남용을 차단한다. */ ()=>{
 const /** p: 수신된 이동 상태. */ p=player(10);p.lastProcessedInput=3;
 assert.equal(InputTimeline.enqueue(p,'A',11),'INVALID_CAST_SEQUENCE');assert.equal(InputTimeline.enqueue(p,'A',2),'INVALID_CAST_SEQUENCE');
 assert.equal(InputTimeline.enqueue(p,'A',5),null);assert.equal(InputTimeline.enqueue(p,'B',4),'INVALID_CAST_SEQUENCE');
 for(let /** index: 남은 허용 요청 순번. */ index=0;index<7;index++)assert.equal(InputTimeline.enqueue(p,'A',5),null);
 assert.equal(InputTimeline.enqueue(p,'A',5),'CAST_QUEUE_FULL');
});
