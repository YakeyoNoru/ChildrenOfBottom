import { /** test: 구르기 검증 시나리오 등록 함수. */ test } from 'node:test';
import /** assert: 기대 결과 검사 모듈. */ assert from 'node:assert/strict';
import { /** createWorldObject: 검증 개체 생성 함수. */ createWorldObject } from '../game/status.js';
import { /** castSkill: 서버 기술 시전 함수. */ castSkill } from '../game/skills.js';
import '../public/movement.js';

/** 기본 B 슬롯을 가진 플레이어를 생성한다. */
function player() { return createWorldObject({objectType:'player',classificationCode:'p',instanceId:'p'}); }

test('B defaults to roll; movement direction overrides facing and diagonal roll travels exactly 72',/** 이동 방향 우선과 거리·속도·도중 입력 잠금을 검증한다. */ ()=>{
 const /** caster: 구르기 시전자. */ caster=player();caster.facing=Math.PI;
 caster.lastMovementInput={x:1,y:1};
 assert.equal(caster.status.skillB,'BAS0002');assert.equal(castSkill(caster,[caster],'B',0).code,'BAS0002');
 assert.equal(caster.roll.speed,660);assert.equal(caster.roll.angle,Math.PI/4);
 assert.equal(castSkill(caster,[caster],'A',1),null);assert.equal(castSkill(caster,[caster],'C',1),null);assert.equal(castSkill(caster,[caster],'B',1),null);
 Object.assign(caster,globalThis.MovementRules.step(caster,{x:-1,y:0},caster.status));
 assert.ok(Math.abs(Math.hypot(caster.x,caster.y)-33)<1e-8);
 while(caster.roll) Object.assign(caster,globalThis.MovementRules.step(caster,{x:-1,y:0},caster.status));
 assert.ok(Math.abs(Math.hypot(caster.x,caster.y)-72)<1e-8);
 const /** endX: 구르기 종료 가로 좌표. */ endX=caster.x;
 Object.assign(caster,globalThis.MovementRules.step(caster,{x:-1,y:0},caster.status));assert.equal(caster.x,endX-11);
 assert.ok(castSkill(caster,[caster],'A',500));
});

test('stationary roll uses facing, includes bonus speed and cannot leave world bounds',/** 정지 방향·추가속도·경계를 검증한다. */ ()=>{
 const /** caster: 정지한 구르기 시전자. */ caster=player();caster.facing=0;caster.status.bonusMoveSpeed=1;caster.x=1490;
 castSkill(caster,[caster],'B',0);assert.equal(caster.roll.speed,990);
 while(caster.roll) Object.assign(caster,globalThis.MovementRules.step(caster,{x:0,y:-1},caster.status));
 assert.equal(caster.x,1500);assert.equal(caster.y,0);
});

test('stun or death interrupts a roll; zero-speed objects cannot start rolling',/** 상태 이상과 이동 불가 시 동작을 검증한다. */ ()=>{
 for(const /** state: 중단을 검사할 상태. */ state of ['stunned','dead']) {
  const /** caster: 상태 이상을 적용할 시전자. */ caster=player();castSkill(caster,[caster],'B',0);
  if(state==='stunned')caster.status.stunned=true;else caster.status.state='dead';
  Object.assign(caster,globalThis.MovementRules.step(caster,{x:1,y:0},caster.status));assert.equal(caster.roll,null);assert.equal(caster.x,0);assert.equal(caster.y,0);
 }
 const /** stopped: 이동속도가 0인 시전자. */ stopped=player();stopped.status.moveSpeed=0;assert.equal(castSkill(stopped,[stopped],'B',0),null);
});
