import { /** test: 테스트 시나리오를 등록한다. */ test } from 'node:test';
import /** assert: 기대 결과를 검사한다. */ assert from 'node:assert/strict';
import { /** createWorldObject: 검증용 월드 개체를 생성한다. */ createWorldObject } from '../game/status.js';
import { /** castSkill: 서버 기술을 시전한다. */ castSkill, /** createSkillInstance: 독립 시전 정보를 만든다. */ createSkillInstance, /** skills: 기술 코드별 서버 정의. */ skills, /** skillCooldownRemaining: 남은 재사용 대기를 조회한다. */ skillCooldownRemaining, /** skillSnapshot: 전송용 기술 결과를 만든다. */ skillSnapshot } from '../game/skills.js';
import { /** applySkillDamage: 직접·투사체·장판의 공통 피해 적용을 검사한다. */ applySkillDamage, /** resolveSkillContacts: 공통 접촉·피해 흐름을 처리한다. */ resolveSkillContacts } from '../game/combat.js';

test('player final blow grants floored half points and level times forty experience exactly once',/** 실제 사망 직전 포인트·레벨을 기준으로 보상하고 중복 피격으로 재지급하지 않는지 검사한다. */ ()=>{
 const /** killer: 마지막 일격 플레이어; victim: 홀수 포인트를 보유한 레벨 3 플레이어; earlier: 선행 공격자. */ killer=createWorldObject({objectType:'player',classificationCode:'killer',competitionPoints:7}),victim=createWorldObject({objectType:'player',classificationCode:'victim',level:3,competitionPoints:101}),earlier=createWorldObject({objectType:'player',classificationCode:'earlier'});
 const /** first: 선행 공격 정보; final: 마지막 공격 정보. */ first={id:'first',casterId:earlier.id,resultSequence:0},final={id:'last',casterId:killer.id,resultSequence:0};
 applySkillDamage(first,victim,1,0,earlier);applySkillDamage(final,victim,100,1,killer);
 assert.equal(victim.status.state,'dead');assert.equal(victim.status.competitionPoints,101);assert.equal(killer.status.competitionPoints,57);
 assert.equal(killer.status.level,2);assert.equal(killer.status.currentExperience,70);assert.equal(earlier.status.currentExperience,0);
 assert.equal(applySkillDamage(final,victim,100,2,killer),null);assert.equal(killer.status.competitionPoints,57);assert.equal(killer.status.currentExperience,70);
 const /** environmental: 처치자 없는 환경 피해 대상. */ environmental=createWorldObject({objectType:'player',classificationCode:'environmental',competitionPoints:100});
 applySkillDamage({id:'environment',casterId:killer.id,resultSequence:0},environmental,100,3);
 assert.equal(killer.status.competitionPoints,57);assert.equal(killer.status.currentExperience,70);
});

/** 시전자와 피격 대상을 독립된 위치·수치로 생성한다. */
function pair() {
  const /** caster: A·B·C 시전과 쿨타임을 검사할 플레이어. */ caster=createWorldObject({objectType:'player',classificationCode:'p',instanceId:'p'});
  const /** target: 반복 피해를 검증할 적. */ target=createWorldObject({objectType:'enemy',classificationCode:'e',instanceId:'e',x:40,maxHealth:100,currentHealth:100,healthRegen:0});
  caster.facing=0;caster.status.skillB='BAS0001';caster.status.skillC='BAS0001';
  return {caster,target};
}

test('A B C cooldowns are independent; early casts and invalid states do not consume a new cooldown',/** 슬롯별 서버 재사용 대기를 경계 시각까지 검증한다. */ ()=>{
  const /** caster: 시전자; target: 피격 대상. */ {caster,target}=pair();
  for(const /** slot: 시전할 기술 슬롯. */ slot of ['A','B','C']) {
    assert.ok(castSkill(caster,[caster,target],slot,1000));
    assert.equal(skillCooldownRemaining(caster,slot,1001),499);
    assert.equal(castSkill(caster,[caster,target],slot,1499),null);
    assert.ok(castSkill(caster,[caster,target],slot,1500));
  }
  caster.status.stunned=true;
  assert.equal(castSkill(caster,[caster,target],'A',2000),null);
  assert.equal(skillCooldownRemaining(caster,'A',2000),0);
  caster.status.stunned=false;caster.status.skillA='';
  assert.equal(castSkill(caster,[caster,target],'A',2000),null);
});

test('independent instance retains cast stats, moves into contact later and emits one result per target',/** 시전자 이후의 변화와 독립된 접촉·피해·결과 흐름을 검증한다. */ ()=>{
  const /** caster: 시전자; target: 접촉 대상. */ {caster,target}=pair();
  const /** instance: 아직 대상에 닿지 않은 원형 기술. */ instance=createSkillInstance(caster,{...skills.BAS0001,shape:'circle',radius:5,activeDurationMs:1000},0,1000);
  caster.status.attack=99;
  assert.equal(resolveSkillContacts(instance,[target],1000).length,0);
  instance.x=40;
  const /** results: 이동 후 최초 접촉이 생성한 확정 결과. */ results=resolveSkillContacts(instance,[target],1100);
  assert.equal(results[0].damage,6);assert.equal(results[0].healthAfter,94);
  assert.equal(resolveSkillContacts(instance,[target],1200).length,0);
  const /** packed: 클라이언트에 전달할 기술 결과. */ packed=skillSnapshot(instance,1200);
  assert.equal(packed.hitTimes,undefined);assert.equal(packed.results[0].targetId,target.id);
});

test('area instance re-hits only at interval and applies target-specific formula until expiry',/** 장판용 반복 간격과 기술별 피해 공식 연결을 검증한다. */ ()=>{
  const /** caster: 시전자; target: 반복 접촉 대상. */ {caster,target}=pair();
  const /** instance: 지정 간격으로 같은 대상을 다시 타격할 기술. */ instance=createSkillInstance(caster,{...skills.BAS0001,activeDurationMs:1000,hitIntervalMs:300},0,1000);
  /** 별도 기술이 대상별 피해량을 계산하는 연결 예시다. */
  const /** formula: 대상의 최대체력 10퍼센트를 피해로 계산할 서버 함수. */ formula=(/** skill: 현재 판정할 기술 인스턴스. */ skill,/** victim: 피해를 계산할 대상. */ victim)=>victim.status.maxHealth*.1;
  assert.equal(resolveSkillContacts(instance,[target],1000,formula)[0].damage,10);
  assert.equal(resolveSkillContacts(instance,[target],1299,formula).length,0);
  assert.equal(resolveSkillContacts(instance,[target],1300,formula).length,1);
  assert.equal(resolveSkillContacts(instance,[target],2000,formula).length,0);
  assert.notEqual(instance.results[0].id,instance.results[1].id);
});

test('shared remaining cooldowns start at zero, count down and unlock A at .5s and B at 2s',/** 공통 잔여 시간과 기술별 재사용 경계를 검증한다. */ ()=>{
 const /** caster: 시전자; target: 피격 대상. */ {caster,target}=pair();caster.status.skillB='BAS0002';
 for(const /** slot: 기본값을 검사할 슬롯. */ slot of ['A','B','C']) assert.equal(caster.status['skill'+slot+'CooldownRemaining'],0);
 castSkill(caster,[caster,target],'A',1000);assert.equal(caster.status.skillACooldownRemaining,.5);
 assert.equal(skillCooldownRemaining(caster,'A',1250),250);assert.equal(caster.status.skillACooldownRemaining,.25);
 assert.equal(castSkill(caster,[caster,target],'A',1499),null);assert.ok(castSkill(caster,[caster,target],'A',1500));
 assert.ok(castSkill(caster,[caster,target],'B',1600));assert.equal(caster.status.skillBCooldownRemaining,2);
 caster.roll=null;
 assert.equal(skillCooldownRemaining(caster,'B',2600),1000);
 assert.equal(castSkill(caster,[caster,target],'B',3599),null);assert.ok(castSkill(caster,[caster,target],'B',3600));
});

test('three A01 defeats grant 60 experience, level 2 and remainder 10 exactly once',/** 실제 몬스터 정의와 공통 공격으로 처치·레벨업 전체 흐름을 검증한다. */ async ()=>{
 const /** createMonster: 확정 몬스터 프리셋 생성기. */ {createMonster}=await import('../game/monsters.js');
 const /** caster: 처치 경험치를 받을 플레이어. */ caster=createWorldObject({objectType:'player',classificationCode:'P',attack:100});caster.facing=0;
 for(let /** index: 처치 순번. */ index=0;index<3;index++){
  const /** monster: 경험치20 몬스터A01; effect: 실제 시전 결과. */ monster=createMonster('몬스터A01',{x:30,y:0}),effect=castSkill(caster,[caster,monster],'A',1000+index*2000);
  assert.equal(monster.status.state,'dead');assert.equal(monster.rewardGranted,true);
  resolveSkillContacts(effect,[caster,monster],1001+index*2000);castSkill(caster,[caster,monster],'A',1600+index*2000);assert.equal(caster.status.currentExperience,index<2?(index+1)*20:10);
 }
 assert.equal(caster.status.level,2);assert.equal(caster.status.requiredExperience,90);assert.equal(caster.status.bonusHealth,10);assert.equal(caster.status.bonusAttack,2);assert.equal(caster.status.bonusDefense,1);assert.equal(caster.status.skillPoints,2);assert.equal(caster.status.maxSkillResource,1);
 const /** stronger: A02의 경험치50 검증 대상. */ stronger=createMonster('몬스터A02',{x:30,y:0});castSkill(caster,[caster,stronger],'A',10000);assert.equal(caster.status.currentExperience,60);
});
