import {/** test: 테스트 시나리오와 비동기 정리 절차를 등록한다. */ test} from 'node:test';
import /** assert: 실제 결과와 기대 조건을 비교해 테스트 실패를 검출한다. */ assert from 'node:assert/strict';
import {/** createWorldObject: 외부 모듈에서 제공하는 createWorldObject 기능. */ createWorldObject} from '../game/status.js';
import {/** castSkill: 외부 모듈에서 제공하는 castSkill 기능. */ castSkill,/** skills: 기술 코드별 공통 기술 정의. */ skills,/** circleIntersectsSkill: 공격 방향으로 좌표를 투영해 원형 히트박스와 전방 사각형의 교차를 검사한다. */ circleIntersectsSkill} from '../game/skills.js';
const /** obj: 기술 판정 검증용 월드 개체 생성 함수. */ obj=/** obj: 지정한 위치와 수치로 기술 판정 검증 개체를 만든다. */ (/** id: 대상 개체 또는 요소의 식별자. */ id,/** kind: 검증 대상 개체의 분류. */ kind,/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ x,/** y: 세로 좌표 또는 이동 입력. */ y,/** stats: 개체 생성 시 전달할 스테이터스 재정의 값. */ stats={})=>createWorldObject({objectType:kind,classificationCode:id,instanceId:id,x,y,healthRegen:0,...stats});
test('24 diameter hitboxes intersect forward rectangle including edges, corners and rotations',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
 const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=obj('p','player',0,0);assert.equal(p.status.hitboxDiameter,24);
 for(const /** x: 검증 좌표·비교 항목 또는 위치 조회 함수; y: 세로 좌표 또는 이동 입력; hit: 해당 좌표에서 예상하는 피격 여부. */ [x,y,hit] of [[84,0,true],[84.01,0,false],[-12,0,true],[-12.01,0,false],[30,37,true],[30,37.01,false],[80,33,true],[82,35,false]]) assert.equal(circleIntersectsSkill(p,obj('e','enemy',x,y),0,skills.BAS0001),hit,`${x},${y}`);
 assert.equal(circleIntersectsSkill(p,obj('e','enemy',0,80),Math.PI/2,skills.BAS0001),true);
});
test('A targets selected enemy, damages all intersecting hostiles once, ignores defense and allies, persists 4 seconds',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
 const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=obj('p','player',0,0,{attack:2,bonusAttack:3}),/** e: 검증할 이벤트·요소 모음·적 개체. */ e=obj('e','enemy',0,50,{maxHealth:30,currentHealth:30,defense:100}),/** ally: 피해 제외 여부를 검사할 우호 개체. */ ally=obj('n','npc',0,30),/** out: 공격 범위 밖의 적 개체. */ out=obj('o','enemy',100,0);
 p.status.nearestEnemyId=e.id;
 const /** effect: 시전 위치·피해 결과·표시 만료 시각을 담은 기술 효과. */ effect=castSkill(p,[p,e,ally,out],'A',1000);assert.equal(effect.angle,Math.PI/2);assert.equal(e.status.currentHealth,20);assert.equal(ally.status.currentHealth,10);assert.equal(out.status.currentHealth,10);assert.deepEqual(effect.hits,['e']);assert.equal(effect.expiresAt,5000);
 assert.equal(p.status.skillA,'BAS0001');assert.equal(p.status.skillP,'');assert.equal(castSkill(p,[p,e],'B'),null);
 p.status.stunned=true;assert.equal(castSkill(p,[p,e],'A'),null);
});
test('no target uses last facing; death normalizes and T1 N does not retain debug box',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
 const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=obj('p','player',0,0),/** e: 검증할 이벤트·요소 모음·적 개체. */ e=obj('e','enemy',30,0,{currentHealth:1});p.facing=0;
 const /** effect: 시전 위치·피해 결과·표시 만료 시각을 담은 기술 효과. */ effect=castSkill(p,[p,e],'A',1000,{BAS0001:{...skills.BAS0001,T1:'N'}});assert.equal(e.status.state,'dead');assert.equal(effect.expiresAt,1150);
});
