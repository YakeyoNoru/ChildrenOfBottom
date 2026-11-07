import { /** test: 스킬 효과 검증을 등록한다. */ test } from 'node:test';
import /** assert: 기술의 서버 결과를 비교한다. */ assert from 'node:assert/strict';
import { /** createWorldObject: 검증용 개체를 생성한다. */ createWorldObject, /** gainExperience: 환영조각 경험치를 반영한다. */ gainExperience } from '../game/status.js';
import { /** castSkill: 공통 슬롯 시전을 실행한다. */ castSkill, /** buySkill: 카드 구매를 확정한다. */ buySkill } from '../game/skills.js';
import { /** tickPlayerSkill: 지속 효과를 진행한다. */ tickPlayerSkill, /** tickStones: 돌 접촉을 검사한다. */ tickStones } from '../game/advanced-skills.js';
import '../public/items.js';

/** 독립된 플레이어 상태를 준비한다. */
function player(/** values: 검증에 필요한 초기 상태. */ values={}){
  return createWorldObject({objectType:'player',classificationCode:'TEST',...values});
}

test('dash waits 300 ms, follows the selected enemy and strikes once at distance 20',/** 돌진의 거리·준비 시간·공격 경계를 검증한다. */ ()=>{
  const /** caster: 돌진 시전자. */ caster=player({skillB:'BAS0003',attack:2,bonusAttack:3});
  const /** target: 돌진 대상. */ target=player({x:121});
  assert.equal(castSkill(caster,[caster,target],'B',0),null);
  assert.equal(caster.status.skillBCooldownRemaining,0);
  target.x=120;
  assert.ok(castSkill(caster,[caster,target],'B',0));
  assert.equal(caster.status.skillBCooldownRemaining,8);
  tickPlayerSkill({},caster,[target],299,.05);
  assert.equal(caster.x,0);
  for(let /** now: 돌진을 진행할 서버 시각(ms). */ now=300;now<=500;now+=50)tickPlayerSkill({},caster,[target],now,.05);
  assert.equal(caster.x,100);
  assert.equal(target.status.currentHealth,5);
  assert.equal(caster.status.dashActive,undefined);
});

test('stone uses fixed aim and hits the first enemy crossed between ticks',/** 사거리 실패, 고정 방향, 이동 선분에서 첫 접촉을 검증한다. */ ()=>{
  const /** caster: 돌을 던질 시전자. */ caster=player({skillA:'BAS0004',attack:3,bonusAttack:2});
  const /** target: 시전 시 조준한 대상. */ target=player({x:101});
  assert.equal(castSkill(caster,[caster,target],'A',0),null);
  assert.equal(caster.status.skillACooldownRemaining,0);
  target.x=100;
  const /** stone: 공통 시전으로 생성한 투사체. */ stone=castSkill(caster,[caster,target],'A',0);
  target.y=100;
  const /** first: 비행 경로에 들어온 첫 대상. */ first=player({x:26});
  const /** second: 첫 대상 뒤의 다른 적. */ second=player({x:40});
  const /** room: 진행할 투사체 목록. */ room={stones:[stone]};
  tickStones(room,[caster,target,second,first],50,.05);
  assert.equal(room.stones.length,0);
  assert.equal(first.status.currentHealth,5);
  assert.equal(second.status.currentHealth,10);
  assert.equal(target.status.currentHealth,10);
});

test('purchases consume cards, apply passive effects and enable the level-three escape',/** 덱 소모, 구매 비용, 패시브, 탈출구 예약을 검증한다. */ ()=>{
  const /** caster: 구매할 레벨 2 플레이어. */ caster=player({level:2,skillPoints:12,x:10,y:20});
  assert.ok(buySkill(caster,'BAS0007',0));
  assert.equal(caster.status.bonusAttack,14);
  assert.ok(buySkill(caster,'BAS0008',100));
  assert.equal(caster.status.playerRevealUntil,20100);
  for(let /** index: 하스스톤 구매 횟수. */ index=0;index<3;index++){
    assert.ok(buySkill(caster,'BAS0006',100));
    if(index<2)assert.equal(castSkill(caster,[caster],'C',200),null);
  }
  assert.equal(caster.status.skillPoints,0);
  assert.equal(caster.status.ownedSkills.BAS0006,3);
  assert.equal(buySkill(caster,'BAS0006',200),false);
  assert.ok(castSkill(caster,[caster],'C',200));
  assert.equal(castSkill(caster,[caster],'C',201),null);
  const /** room: 탈출구 등록을 확인할 방. */ room={objects:new Map()};
  caster.x=50;
  tickPlayerSkill(room,caster,[caster],10199,.05);
  assert.equal(room.objects.size,0);
  tickPlayerSkill(room,caster,[caster],10200,.05);
  const /** exit: 예약 좌표에서 생성한 탈출구. */ exit=[...room.objects.values()][0];
  assert.equal(exit.x,10);
  assert.equal(exit.y,20);
  assert.equal(exit.interactionEnabled,true);
});

test('running crew adds temporary movement and persistent fragment rewards',/** 이동 보너스 만료와 환영조각 보상이 따로 작동하는지 검증한다. */ ()=>{
  const /** caster: 러닝크루를 구매할 플레이어. */ caster=player({skillPoints:1,bonusMoveSpeed:2});
  assert.ok(buySkill(caster,'BAS0005',0));
  assert.ok(castSkill(caster,[caster],'A',0));
  assert.equal(caster.status.bonusMoveSpeed,3);
  tickPlayerSkill({},caster,[caster],4999,.05);
  assert.equal(caster.status.bonusMoveSpeed,3);
  tickPlayerSkill({},caster,[caster],5000,.05);
  assert.equal(caster.status.bonusMoveSpeed,2);
  const /** items: 획득 확정에 도달한 환영조각. */ items=new Map([['fragment',{id:'fragment',code:'illusionFragment',state:'flying',targetId:caster.id,startedAt:0}]]);
  globalThis.ItemRules.tick(items,[caster],50,gainExperience);
  assert.equal(caster.status.competitionPoints,15);
  assert.equal(caster.status.currentExperience,3);
});
