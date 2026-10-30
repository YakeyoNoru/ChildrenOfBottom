import { /** test: 테스트 시나리오와 비동기 정리 절차를 등록한다. */ test } from 'node:test';
import /** assert: 실제 결과와 기대 조건을 비교해 테스트 실패를 검출한다. */ assert from 'node:assert/strict';
import { /** createStatus: 모든 개체가 공유하는 수치·기술 슬롯·상태를 검증해 생성한다. */ createStatus, /** createWorldObject: 외부 모듈에서 제공하는 createWorldObject 기능. */ createWorldObject, /** effectiveStats: 기본 수치에 추가 수치를 합산하고 음수를 방지한 최종 능력치를 계산한다. */ effectiveStats, /** regenerate: 생존 개체의 체력과 스킬자원을 경과 시간만큼 회복한다. */ regenerate, /** normalizeVitals: 체력·자원을 최종 최대치 안으로 제한하고 사망 상태를 정규화한다. */ normalizeVitals, /** updateNearestObjects: 생존 개체의 최근접 개체와 설정 우선순위에 맞는 적 ID를 갱신한다. */ updateNearestObjects } from '../game/status.js';

const /** status: 개체 상태 또는 응답 상태. */ status = /** status: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ (/** objectType: 생성하거나 검사할 개체 분류. */ objectType = 'player', /** values: 기본 스테이터스를 재정의할 전달값. */ values = {}) => createStatus({objectType,classificationCode:'TEST',...values});
test('all object kinds share defaults; skills belong only to players and arrays are independent',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  for (const /** kind: 검증 대상 개체의 분류. */ kind of ['player','npc','enemy']) {
    const /** s: 검증할 공통 스테이터스. */ s=status(kind);
    assert.equal(s.objectType,kind);assert.equal(s.classificationCode,'TEST');assert.ok(s.instanceId);
    assert.equal(s.level,1);assert.equal(s.maxHealth,10);assert.equal(s.currentHealth,10);
    assert.equal(s.maxSkillResource,0);assert.equal(s.currentSkillResource,0);
    assert.equal(s.attack,1);assert.equal(s.defense,0);assert.equal(s.healthRegen,1);assert.equal(s.skillResourceRegen,1);assert.equal(s.moveSpeed,2);
    assert.equal(s.concealed,false);assert.equal(s.stunned,false);assert.equal(s.state,'alive');assert.equal(s.bountyPoints,1);
    assert.equal(s.nearestEnemyId,null);assert.equal(s.nearestObjectId,null);
    for(const /** key: 현재 항목의 식별 키. */ key of ['bonusHealth','bonusAttack','bonusDefense','bonusHealthRegen','bonusMoveSpeed','bonusSkillResource','bonusSkillResourceRegen'])assert.equal(s[key],0);
    assert.equal('skillDeckCode' in s,kind==='player');assert.equal('availableSkills' in s,kind==='player');
  }
  const /** skills: 기술 코드별 공통 기술 정의. */ skills=['SK001'],/** a: 첫 번째 검증용 값·개체·접속 결과. */ a=status('player',{availableSkills:skills}),/** b: 두 번째 검증용 값·개체·접속 결과. */ b=status();
  a.availableSkills.push('SK002');assert.deepEqual(skills,['SK001']);assert.deepEqual(b.availableSkills,[]);
  assert.notEqual(a.instanceId,b.instanceId);
});
test('bonuses add to effective values; regen respects caps, zero resources and death',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** s: 검증할 공통 스테이터스. */ s=status('npc',{currentHealth:5,maxSkillResource:4,currentSkillResource:1,bonusHealth:5,bonusAttack:2,bonusDefense:3,bonusHealthRegen:1,bonusMoveSpeed:1,bonusSkillResource:2,bonusSkillResourceRegen:2});
  assert.deepEqual(effectiveStats(s),{maxHealth:15,maxSkillResource:6,attack:3,defense:3,healthRegen:2,moveSpeed:3,skillResourceRegen:3});
  regenerate(s,.5);assert.equal(s.currentHealth,6);assert.equal(s.currentSkillResource,2.5);
  regenerate(s,100);assert.equal(s.currentHealth,15);assert.equal(s.currentSkillResource,6);assert.equal(s.maxHealth,10);
  s.bonusHealth=-8;s.bonusSkillResource=-10;normalizeVitals(s);assert.equal(s.currentHealth,2);assert.equal(s.currentSkillResource,0);
  s.currentHealth=0;regenerate(s,10);assert.equal(s.state,'dead');assert.equal(s.currentHealth,0);
  const /** zero: 스킬자원 최대치가 0인 검증 개체. */ zero=status();regenerate(zero,20);assert.equal(zero.currentSkillResource,0);
});
test('nearest references exclude self/dead, distinguish enemy, and clear when a target disappears',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** make: 지정한 수치와 좌표로 검증 개체를 만드는 함수. */ make=/** make: 개체 종류와 수치를 지정해 독립된 검증 개체를 만든다. */ (/** objectType: 생성하거나 검사할 개체 분류. */ objectType,/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ x)=>createWorldObject({objectType,classificationCode:'TEST',x});
  const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=make('player',0),/** npc: 검증용 우호 NPC 개체. */ npc=make('npc',2),/** enemy: 선택한 적대 개체 또는 해당 대상까지의 제곱 거리. */ enemy=make('enemy',5),/** dead: 대상 선택에서 제외해야 할 사망 개체. */ dead=make('enemy',1);
  dead.status.currentHealth=0;normalizeVitals(dead.status);
  updateNearestObjects([p,npc,enemy,dead]);
  assert.equal(p.status.nearestObjectId,npc.id);assert.equal(p.status.nearestEnemyId,enemy.id);
  assert.equal(enemy.status.nearestEnemyId,npc.id);assert.equal(dead.status.nearestEnemyId,null);
  updateNearestObjects([p]);assert.equal(p.status.nearestObjectId,null);assert.equal(p.status.nearestEnemyId,null);
});
test('invalid statuses are rejected rather than leaking NaN, invalid levels or string flags',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  for(const /** values: 기본 스테이터스를 재정의할 전달값. */ values of [{attack:NaN},{maxHealth:-1},{level:0},{level:1.5},{moveSpeed:Infinity},{concealed:'N'},{stunned:1},{state:'unknown'},{availableSkills:'skill'}])assert.throws(/** 현재 비동기 작업의 완료 또는 후속 처리를 수행한다. */ ()=>status('player',values),TypeError);
  assert.throws(/** 현재 비동기 작업의 완료 또는 후속 처리를 수행한다. */ ()=>status('unknown'),TypeError);assert.throws(/** 현재 비동기 작업의 완료 또는 후속 처리를 수행한다. */ ()=>regenerate(status(),-1),TypeError);
});

test('attack priorities use distance, current health, effective health ratio, range and distance ties',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  const /** make: 지정한 수치와 좌표로 검증 개체를 만드는 함수. */ make=/** make: 개체 종류와 수치를 지정해 독립된 검증 개체를 만든다. */ (/** id: 대상 개체 또는 요소의 식별자. */ id,/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ x,/** hp: 검증용 현재체력. */ hp,/** max: 검증용 기본 최대체력. */ max=10,/** bonus: 검증용 추가체력. */ bonus=0)=>createWorldObject({objectType:id==='p'?'player':'enemy',classificationCode:id,instanceId:id,x,currentHealth:hp,maxHealth:max,bonusHealth:bonus});
  const /** p: 검증 기준이 되는 개체 또는 표시 위치. */ p=make('p',0,10),/** near: 거리 우선순위 검증 대상 또는 근사값 비교 함수. */ near=make('near',2,7),/** low: 현재체력이 낮은 검증 대상. */ low=make('low',5,3),/** ratio: 최대치에 대한 현재 수치의 비율. */ ratio=make('ratio',8,4,10,30),/** dead: 대상 선택에서 제외해야 할 사망 개체. */ dead=make('dead',1,0);
  const /** objects: 처리할 월드 개체 목록. */ objects=[p,near,low,ratio,dead];
  for (const /** mode: 웹 게스트와 APK 계정을 구분하는 접속 모드; id: 대상 개체 또는 요소의 식별자. */ [mode,id] of [['nearest','near'],['lowestHealth','low'],['lowestHealthRatio','ratio']]) { p.targetPriority=mode;updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,id);assert.equal(p.status.nearestObjectId,'near'); }
  p.targetRange=5;updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,'low');
  p.targetRange=1;updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,null);
  p.targetRange=Infinity;p.targetPriority='lowestHealth';near.status.currentHealth=3;updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,'near');
  low.status.state='dead';near.status.state='dead';ratio.status.state='dead';updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,null);
});
