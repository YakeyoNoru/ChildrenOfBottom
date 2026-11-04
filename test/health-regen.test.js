import { /** test: 시나리오 등록 함수. */ test } from 'node:test';
import /** assert: 기대 결과 비교. */ assert from 'node:assert/strict';
import { /** createWorldObject: 공통 유닛 생성기. */ createWorldObject, /** regenerate: 자원·비전투 체력 회복 처리. */ regenerate } from '../game/status.js';
import { /** applySkillDamage: 공통 기술 피해 처리. */ applySkillDamage } from '../game/combat.js';
import '../public/pit-map-rules.js';
import '../public/poison.js';

/** 고유 시전 결과를 만들고 지정 시각에 공격 피해를 적용한다. */
function damage(/** unit: 피격 유닛. */ unit,/** now: 피격 시각(ms). */ now,/** amount: 차감할 체력. */ amount=1){return applySkillDamage({id:'hit',casterId:'attacker',code:'BAS0001',resultSequence:0},unit,amount,now);}
test('all unit defaults have zero natural regeneration and bonuses heal at 5/8/11 seconds',/** 공통 기본값과 정확한 5초·3초 회복 경계를 검사한다. */ ()=>{
 for(const /** kind: 유닛 종류. */ kind of ['player','enemy','npc']){
  const /** unit: 기본 회복이 없는 검증 유닛. */ unit=createWorldObject({objectType:kind,classificationCode:'T',maxHealth:30,currentHealth:10,bonusHealthRegen:2});
  assert.equal(unit.status.healthRegen,0);regenerate(unit.status,0,0);regenerate(unit.status,4.999,4999);assert.equal(unit.status.currentHealth,10);
  regenerate(unit.status,.001,5000);assert.equal(unit.status.currentHealth,12);regenerate(unit.status,0,5000);assert.equal(unit.status.currentHealth,12);
  regenerate(unit.status,2.999,7999);assert.equal(unit.status.currentHealth,12);regenerate(unit.status,.001,8000);assert.equal(unit.status.currentHealth,14);
  regenerate(unit.status,3,11000);assert.equal(unit.status.currentHealth,16);
 }
 const /** zero: 기본 회복값 0인 개체. */ zero=createWorldObject({objectType:'player',classificationCode:'ZERO',currentHealth:2});regenerate(zero.status,0,0);regenerate(zero.status,50,50000);assert.equal(zero.status.currentHealth,2);
});
test('positive damage resets recovery; zero damage does not postpone it; healing caps at max and never revives',/** 재피격 대기 초기화·무효 피해·최대치·사망을 검사한다. */ ()=>{
 const /** unit: 기본 회복량을 명시한 플레이어. */ unit=createWorldObject({objectType:'player',classificationCode:'T',healthRegen:3});
 damage(unit,1000,5);regenerate(unit.status,0,5999);assert.equal(unit.status.currentHealth,5);
 damage(unit,5999,1);regenerate(unit.status,0,6000);assert.equal(unit.status.currentHealth,4);
 regenerate(unit.status,0,10998);assert.equal(unit.status.currentHealth,4);damage(unit,10998,0);regenerate(unit.status,0,10999);assert.equal(unit.status.currentHealth,7);
 regenerate(unit.status,3,13999);assert.equal(unit.status.currentHealth,10);damage(unit,14000,100);regenerate(unit.status,60,74000);assert.equal(unit.status.currentHealth,0);assert.equal(unit.status.state,'dead');
});
test('poison delays regeneration and resource recovery stays time-based',/** 독기 피해 대기와 스킬자원 회복의 기존 동작을 검증한다. */ ()=>{
 const /** unit: 독기를 받을 플레이어. */ unit=createWorldObject({objectType:'player',classificationCode:'T',healthRegen:2,maxSkillResource:10,currentSkillResource:0});
 const /** room: 1층 독기 검증 방. */ room={phase:'started',gameStartedAt:0,map:{tileRadius:600,landScale:1,tiles:[{q:0,r:0,height:1}],bridges:[]},players:new Map([[unit.id,unit]])};
 PoisonRules.tick(room,180000);assert.equal(unit.status.currentHealth,7);assert.equal(unit.status.healthRegenNextAt,185000);
 regenerate(unit.status,1,184999);assert.equal(unit.status.currentHealth,7);assert.equal(unit.status.currentSkillResource,1);
 regenerate(unit.status,.001,185000);assert.equal(unit.status.currentHealth,9);
});
