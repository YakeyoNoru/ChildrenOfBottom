import { /** applySkillDamage: 기술 피해와 처치 보상을 확정한다. */ applySkillDamage } from './combat.js';
import { /** areEnemies: 공통 적대 관계를 검사한다. */ areEnemies, /** effectiveStats: 대상의 최종 최대체력을 읽는다. */ effectiveStats } from './status.js';
import { /** spawnExit: 일회용 탈출구를 생성한다. */ spawnExit } from './exits.js';
import { /** randomUUID: 지연 기술 시전을 구분하는 고유 ID를 만든다. */ randomUUID } from 'node:crypto';

/** 사거리 안에서 현재 타겟 우선순위에 맞는 생존 적을 선택한다. */
function findTarget(/** caster: 시전자. */ caster,/** objects: 방 개체 목록. */ objects,/** range: 월드 단위 최대 거리. */ range){
  let /** target: 현재 최적 대상. */ target=null;
  let /** best: 대상의 우선순위 점수. */ best=Infinity;
  let /** nearest: 동률일 때 사용할 거리. */ nearest=Infinity;
  for(const /** object: 후보 개체. */ object of objects){
    if(!canHit(caster.status,object))continue;
    const /** distance: 시전자와 대상의 중심 거리. */ distance=Math.hypot(object.x-caster.x,object.y-caster.y);
    if(distance>Math.min(range,caster.targetRange??Infinity))continue;
    let /** score: 작을수록 우선하는 선택 점수. */ score=distance;
    if(caster.targetPriority==='lowestHealth')score=object.status.currentHealth;
    if(caster.targetPriority==='lowestHealthRatio')score=object.status.currentHealth/effectiveStats(object.status).maxHealth;
    if(score<best||(score===best&&distance<nearest)){target=object;best=score;nearest=distance;}
  }
  return target;
}

/** 공통 적대 조건과 피해 면역을 확인한다. */
function canHit(/** source: 공격자 분류와 ID. */ source,/** object: 접촉 후보. */ object){
  return object.status.state==='alive'&&!object.status.damageImmune&&areEnemies(source,object.status);
}

/** 버튼 기술의 사거리·레벨 조건을 검사하고 서버 실행 상태를 만든다. */
export function startAdvancedSkill(/** caster: 시전자. */ caster,/** objects: 방 개체 목록. */ objects,/** skill: 시전할 기술 정의. */ skill,/** now: 서버 시각(ms). */ now){
  if(skill.kind==='sprint'){
    if(caster.sprintUntil==null)caster.status.bonusMoveSpeed+=1;
    /** sprintUntil: 이동속도 보너스를 회수할 시각(ms). */ caster.sprintUntil=now+skill.durationMs;
    return {kind:'sprint'};
  }
  if(skill.kind==='hearth'){
    if(caster.status.ownedSkills?.[skill.code]!==3||caster.pendingExit)return null;
    /** pendingExit: 시전 위치에 탈출구를 설치할 예약. */ caster.pendingExit={x:caster.x,y:caster.y,at:now+skill.delayMs};
    return {kind:'hearth'};
  }
  const /** target: 제한 거리 내에서 선택한 적. */ target=findTarget(caster,objects,skill.targetRange);
  if(!target)return null;
  const /** attack: 지연 피해 계산에 사용할 시전 시점 공격력 합계. */ attack=Math.max(0,caster.status.attack+caster.status.bonusAttack);
  const /** hit: 공통 피해 처리에 전달할 시전 식별 정보. */ hit={id:randomUUID(),code:skill.code,casterId:caster.id,resultSequence:0};
  if(skill.kind==='dashStrike'){
    /** dashStrike: 준비 시간과 추적할 대상 및 피해 수치. */ caster.dashStrike={targetId:target.id,readyAt:now+skill.windupMs,stopDistance:skill.stopDistance,speed:skill.speed*110,attack,hit};
    /** dashActive: 준비·돌진 중 일반 이동과 시전을 막는 서버 상태. */ caster.status.dashActive=true;
    return {kind:'dashStrike'};
  }
  const /** angle: 투사체가 시전 시 고정한 진행 방향(라디안). */ angle=Math.atan2(target.y-caster.y,target.x-caster.x);
  return {kind:'stone',id:hit.id,hit,source:{objectType:caster.status.objectType,instanceId:caster.status.instanceId},x:caster.x,y:caster.y,angle,speed:skill.speed*110,remaining:skill.distance,attack};
}

/** 시전자의 시간제 효과와 돌진을 진행한다. */
export function tickPlayerSkill(/** room: 현재 방. */ room,/** caster: 효과를 진행할 플레이어. */ caster,/** objects: 공격 대상 목록. */ objects,/** now: 서버 시각(ms). */ now,/** dt: 틱 경과 초. */ dt){
  if(caster.sprintUntil!=null&&now>=caster.sprintUntil){
    caster.status.bonusMoveSpeed-=1;
    delete caster.sprintUntil;
  }
  if(caster.pendingExit&&now>=caster.pendingExit.at){
    if(caster.status.state==='alive')spawnExit(room,caster.pendingExit);
    delete caster.pendingExit;
  }
  const /** dash: 진행 중인 돌진 상태. */ dash=caster.dashStrike;
  if(!dash)return;
  const /** target: 살아 있는 돌진 대상. */ target=objects.find(/** 대상 ID를 찾는다. */ (/** object: 방 개체. */ object)=>object.id===dash.targetId);
  if(caster.disconnectedUntil!=null||caster.status.stunned||caster.status.state!=='alive'||!target||!canHit(caster.status,target)){
    endDash(caster);
    return;
  }
  if(now<dash.readyAt)return;
  const /** dx: 목표까지 가로 거리. */ dx=target.x-caster.x;
  const /** dy: 목표까지 세로 거리. */ dy=target.y-caster.y;
  const /** gap: 목표 중심까지 거리. */ gap=Math.hypot(dx,dy);
  if(gap>dash.stopDistance){
    const /** fraction: 이번 이동에서 전진할 거리 비율. */ fraction=Math.min(gap-dash.stopDistance,dash.speed*dt)/gap;
    const /** next: 거리 20을 넘지 않는 이동 후보. */ next={x:caster.x+dx*fraction,y:caster.y+dy*fraction};
    const /** allowed: 지형 충돌과 이동 방향 제한을 적용한 위치. */ allowed=room.map?globalThis.PitMapRules.constrain(room.map,caster,next,caster.status.hitboxDiameter/2,false):next;
    if(Math.hypot(allowed.x-caster.x,allowed.y-caster.y)<1e-8){endDash(caster);return;}
    caster.x=allowed.x;
    caster.y=allowed.y;
    caster.facing=Math.atan2(dy,dx);
  }
  if(Math.hypot(target.x-caster.x,target.y-caster.y)<=dash.stopDistance+1e-8){
    applySkillDamage(dash.hit,target,dash.attack,now,caster);
    endDash(caster);
  }
}

/** 돌진 상태를 해제해 다음 이동 입력을 허용한다. */
function endDash(/** caster: 돌진 종료 시전자. */ caster){
  delete caster.dashStrike;
  delete caster.status.dashActive;
}

/** 서버 투사체를 이동시키고 틱 사이를 통과한 첫 적에게 피해를 적용한다. */
export function tickStones(/** room: 투사체 목록을 가진 방. */ room,/** objects: 이번 틱 개체 목록. */ objects,/** now: 서버 시각(ms). */ now,/** dt: 틱 경과 초. */ dt){
  if(!room.stones?.length)return;
  room.stones=room.stones.filter(/** 충돌하거나 최대 거리에 도달한 투사체를 제거한다. */ (/** stone: 비행 중인 투사체. */ stone)=>{
    const /** distance: 이번 틱 이동 거리. */ distance=Math.min(stone.remaining,stone.speed*dt);
    const /** ux: 진행 방향 가로 단위 벡터. */ ux=Math.cos(stone.angle);
    const /** uy: 진행 방향 세로 단위 벡터. */ uy=Math.sin(stone.angle);
    let /** first: 이번 선분의 최초 접촉 대상. */ first=null;
    let /** entry: 최초 접촉 거리. */ entry=Infinity;
    for(const /** object: 접촉 후보. */ object of objects){
      if(!canHit(stone.source,object))continue;
      const /** dx: 투사체에서 대상까지 가로 거리. */ dx=object.x-stone.x;
      const /** dy: 투사체에서 대상까지 세로 거리. */ dy=object.y-stone.y;
      const /** along: 진행 방향에 투영한 거리. */ along=dx*ux+dy*uy;
      const /** across: 진행 방향과 수직인 거리. */ across=dx*uy-dy*ux;
      const /** radius: 대상과 지름 5 투사체의 반지름 합. */ radius=object.status.hitboxDiameter/2+2.5;
      if(Math.abs(across)>radius)continue;
      const /** half: 충돌 원과 진행 직선의 교차 반길이. */ half=Math.sqrt(radius*radius-across*across);
      const /** contact: 시작점 또는 충돌 원 진입 거리. */ contact=Math.max(0,along-half);
      if(along+half>=0&&contact<=distance&&contact<entry){first=object;entry=contact;}
    }
    if(first){
      const /** caster: 현재 방에 남아 있는 공격자. */ caster=objects.find(/** 원래 시전자 ID를 찾는다. */ (/** object: 방 개체. */ object)=>object.id===stone.hit.casterId);
      applySkillDamage(stone.hit,first,stone.attack,now,caster);
      return false;
    }
    stone.x+=ux*distance;
    stone.y+=uy*distance;
    stone.remaining-=distance;
    return stone.remaining>0;
  });
}
