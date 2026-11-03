import { /** test: 표시 로직 검증 등록. */ test } from 'node:test';
import /** assert: 기대 결과 비교 도구. */ assert from 'node:assert/strict';
import /** vm: 브라우저 표시 코드 실행 문맥. */ vm from 'node:vm';
import { /** readFileSync: 소스 읽기. */ readFileSync } from 'node:fs';
/** 독립 표시 모델을 생성한다. */
function view(){return vm.runInNewContext(readFileSync(new URL('../public/item-view.js',import.meta.url),'utf8')+';new ItemView()');}
const /** item: 기본 바닥 조각. */ item={id:'one',code:'illusionFragment',x:0,y:0,state:'ground'};
const /** me: 반경 안에 들어온 본인 표시 개체. */ me={id:'me',x:20,y:0,status:{state:'alive',competitionPoints:0}};
test('delayed approval never respawns or replays a predicted pickup',/** 0.5초 이후에도 승인 대기를 유지하고 늦은 승인에 중복 비행하지 않음을 검증한다. */ ()=>{
 const /** model: 독립 표시 모델. */ model=view();model.receive({code:'room',items:[item]},1000);
 assert.equal(model.sample([me],'me',1000,12)[0].x,0);assert.equal(model.sample([me],'me',1025,12)[0].x,10);
 assert.equal(model.sample([me],'me',1600,12).length,0);assert.equal(me.status.competitionPoints,0);
 model.receive({code:'room',players:[{...me,x:60,lastProcessedInput:11}]},1650);
 assert.equal(model.sample([me],'me',1660,12).length,0);
 model.receive({code:'room',itemChanges:{updates:[{...item,state:'flying',targetId:'me'}]}},1700);
 assert.equal(model.sample([me],'me',1700,12).length,0);
 model.receive({code:'room',itemChanges:{removed:['one']}},1750);assert.equal(model.records.size,0);
});
test('rollback requires authoritative processed input and out-of-range position',/** 미처리 입력이나 범위 내 위치로는 복구하지 않고 실제 미획득일 때만 복구한다. */ ()=>{
 const /** model: 독립 표시 모델. */ model=view();model.receive({code:'room',items:[item]},0);model.sample([me],'me',0,5);
 model.receive({code:'room',players:[{...me,lastProcessedInput:5}]},700);assert.equal(model.sample([me],'me',700,5).length,0);
 model.receive({code:'room',players:[{...me,x:80,lastProcessedInput:5}]},800);
 assert.equal(model.sample([me],'me',800,5)[0].x,0);assert.equal(model.sample([me],'me',900,5)[0].x,0);
});
test('server flight uses local receipt time and completion preserves remaining animation',/** 서버 시계가 달라도 수신 후 50ms를 표시하며 완료 메시지가 연출을 자르지 않음을 검사한다. */ ()=>{
 const /** model: 독립 표시 모델. */ model=view();model.receive({code:'room',items:[{...item,state:'flying',targetId:'me',startedAt:-99999999}]},100);
 assert.equal(model.sample([me],'other',100)[0].x,0);
 model.receive({code:'room',itemChanges:{removed:['one']}},110);
 assert.equal(model.sample([me],'other',125)[0].x,10);assert.equal(model.sample([me],'other',150).length,0);
});
test('server reassignment redirects prediction and leaving clears every record',/** 다른 획득자 승인과 방 변경을 반영한다. */ ()=>{
 const /** model: 독립 표시 모델. */ model=view();model.receive({code:'room',items:[item]},0);model.sample([me],'me',0);
 model.receive({code:'room',itemChanges:{updates:[{...item,state:'flying',targetId:'other'}]}},20);
 assert.equal(model.sample([me,{id:'other',x:-20,y:0}],'me',45)[0].x,-10);
 model.receive({code:'new',items:[]},50);assert.equal(model.records.size,0);model.clear();assert.equal(model.code,null);
});
