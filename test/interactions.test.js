import { /** test: 상호작용·처치 보상 회귀 검증 등록. */ test } from 'node:test';
import /** assert: 기대 결과 검증. */ assert from 'node:assert/strict';
import '../public/interactions.js';
import { /** createWorldObject: 공통 개체 생성. */ createWorldObject } from '../game/status.js';
import { /** createReturnLamp: 귀환전등 생성. */ createReturnLamp } from '../game/props.js';
import { /** castSkill: 실제 공통 기술 판정 실행. */ castSkill } from '../game/skills.js';

test('owner-only lamp interaction uses inclusive center distance 200 and rejects dead targets',/** 소유·거리·상태 공통 조건을 검증한다. */ ()=>{
 const /** owner: 전등 소유자; other: 같은 코드의 다른 접속자. */ owner=createWorldObject({objectType:'player',classificationCode:'P',x:50,y:70}),other=createWorldObject({objectType:'player',classificationCode:'P',x:50,y:70});
 const /** lamp: 시작 좌표 전등. */ lamp=createReturnLamp(owner);
 assert.equal(lamp.status.maxHealth,50);assert.equal(lamp.ownerCode,'P');assert.equal(lamp.ownerId,owner.id);assert.equal(lamp.x,50);assert.equal(lamp.y,70);
 assert.equal(InteractionRules.available(other,lamp),false);
 owner.x=250;assert.equal(InteractionRules.available(owner,lamp),true);assert.equal(InteractionRules.invoke(owner,lamp).type,'escapePrompt');
 owner.x=250.01;assert.equal(InteractionRules.available(owner,lamp),false);
 owner.x=50;lamp.status.state='dead';assert.equal(InteractionRules.invoke(owner,lamp),null);
});
test('NPC classification handlers share the same interaction entry point',/** 후속 NPC 로직을 공통 호출로 확장할 수 있는지 검증한다. */ ()=>{
 const /** player: 상호작용 요청자; npc: 임시 등록 NPC. */ player=createWorldObject({objectType:'player',classificationCode:'P',x:0,y:0}),npc=createWorldObject({objectType:'npc',classificationCode:'TEST_NPC',x:200,y:0});
 npc.interactionEnabled=true;
 InteractionRules.register('TEST_NPC',{/** 대상별 공통 실행 결과를 반환한다. */ run(/** actor: 요청자. */ actor,/** target: NPC. */ target){return {actor:actor.id,target:target.id};}});
 assert.deepEqual(InteractionRules.invoke(player,npc),{actor:player.id,target:npc.id});InteractionRules.handlers.delete('TEST_NPC');
});
test('all players may destroy lamps; last hit grants rewards once through common combat',/** 소유자·다른 플레이어 처치와 중복 지급 방지·경험치 연결을 검증한다. */ ()=>{
 for(const /** isOwner: 처치자가 소유자인지 여부. */ isOwner of [true,false]){
  const /** owner: 생성 소유자; killer: 마지막 일격 플레이어. */ owner=createWorldObject({objectType:'player',classificationCode:'P',x:0,y:0}),killer=isOwner?owner:createWorldObject({objectType:'player',classificationCode:'P',x:0,y:0});
  const /** lamp: 체력 6으로 조정한 처치 대상. */ lamp=createReturnLamp(owner);lamp.x=30;lamp.status.currentHealth=6;killer.facing=0;killer.status.nearestEnemyId=lamp.id;
  castSkill(killer,[killer,lamp],'A',1000);assert.equal(lamp.status.state,'dead');assert.equal(killer.status.competitionPoints,500);assert.equal(killer.status.currentExperience,40);assert.equal(killer.status.skillPoints,1);
  castSkill(killer,[killer,lamp],'A',2000);assert.equal(killer.status.competitionPoints,500);assert.equal(killer.status.skillPoints,1);
 }
 const /** monster: 사물 공격 불가 몬스터; lamp: 보호 대상 전등. */ monster=createWorldObject({objectType:'enemy',classificationCode:'M',x:0,y:0}),lamp=createReturnLamp(createWorldObject({objectType:'player',classificationCode:'P',x:30,y:0}));
 monster.facing=0;castSkill(monster,[monster,lamp],'A',1000);assert.equal(lamp.status.currentHealth,50);
});
