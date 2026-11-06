import '../public/pit-map-rules.js';
import { /** createMonster: 프리셋별 몬스터 유닛을 생성한다. */ createMonster } from './monsters.js';
import { /** castSkill: 공통 접촉·피해 파이프라인으로 기술을 실행한다. */ castSkill } from './skills.js';
import { /** applySkillDamage: 보스 돌진 접촉 피해를 공통으로 확정한다. */ applySkillDamage } from './combat.js';
import { /** effectiveStats: 이동속도와 최종 최대체력을 조회한다. */ effectiveStats, /** LifeState: 사망 유닛의 행동을 차단한다. */ LifeState } from './status.js';

/** 일반 높이 1·2 타일마다 A01 0~8마리·A02 2~6마리를 원형 히트박스까지 지형 안에 생성한다. */
export function spawnMonsters(
  /** map: 게임 시작 시 서버가 생성한 지도. */ map,
  /** random: 수량·위치 선택에 쓰는 0 이상 1 미만 난수 함수. */ random = Math.random,
) {
  const /** monsters: 개체ID로 조회하는 이번 게임의 몬스터 목록. */ monsters = new Map();
  const /** normals: 육각형의 각 변 바깥 방향 단위 벡터. */ normals = Array.from({length:6}, /** 변 순번에서 법선을 계산한다. */ (/** unused: 사용하지 않는 배열 값. */ unused, /** index: 변 순번. */ index) => ({x:Math.cos(Math.PI/6+index*Math.PI/3),y:Math.sin(Math.PI/6+index*Math.PI/3)}));
  for (const /** tile: 수량과 프리셋을 결정할 필드타일. */ tile of map.tiles) {
    if(!['normal','boss'].includes(tile.kind)||![1,2].includes(tile.height))continue;
    if(tile.kind==='boss'){
      const /** center: 보스 타일의 정확한 월드 중심. */ center=globalThis.PitMapRules.center(tile,map);
      const /** boss: 보스 지역마다 하나만 생성하는 몬스터C01. */ boss=createMonster('몬스터C01',center);
      /** boss.spawnTileId: 보스가 처음 생성된 타일 번호. */ boss.spawnTileId=tile.id;
      monsters.set(boss.id,boss);continue;
    }
    const /** count: 양 끝을 포함한 이번 타일 생성 수. */ count = tile.height===1 ? Math.floor(random()*9) : 2+Math.floor(random()*5);
    const /** center: 이번 타일의 월드 중심. */ center = globalThis.PitMapRules.center(tile,map);
    const /** radius: 타일 한 변 길이(월드 거리). */ radius = (map.tileRadius??90)*(map.landScale??.89);
    const /** placed: 이번 타일에 생성한 개체. */ placed = [];
    for(let /** attempt: 배치 실패 시 무한 반복을 막는 시도 수. */ attempt=0;placed.length<count&&attempt<10000;attempt++) {
      const /** position: 타일 경계와 기존 몬스터 간격을 검사할 후보 월드 위치. */ position = {x:center.x+(random()*2-1)*radius,y:center.y+(random()*2-1)*radius};
      if(!normals.every(/** 원형 히트박스 전체가 지형 내부인지 검사한다. */ (/** normal: 변의 바깥 법선. */ normal)=>(position.x-center.x)*normal.x+(position.y-center.y)*normal.y<=radius*Math.sqrt(3)/2-13))continue;
      if(placed.some(/** 같은 타일에서 히트박스가 겹치는 생성을 피한다. */ (/** other: 이미 생성한 몬스터. */ other)=>Math.hypot(other.x-position.x,other.y-position.y)<26))continue;
      const /** monster: 타일 높이에 해당하는 프리셋으로 생성한 유닛. */ monster = createMonster(tile.height===1?'몬스터A01':'몬스터A02',position);
      /** monster.spawnTileId: 최초 생성 타일의 번호. */ monster.spawnTileId=tile.id;
      monsters.set(monster.id,monster);placed.push(monster);
    }
    if(placed.length!==count)throw new Error('몬스터 배치 공간이 부족합니다.');
  }
  return monsters;
}

/** 두 월드 좌표의 중심 간 거리를 구한다. */
function distance(/** a: 기준 좌표. */ a, /** b: 비교 좌표. */ b) { return Math.hypot(a.x-b.x,a.y-b.y); }

/** 정해진 시각부터 다음 배회까지 1~3초 대기한다. */
function scheduleWander(/** ai: 몬스터 전용 행동 시간표. */ ai, /** now: 서버 시각(ms). */ now, /** random: 난수 함수. */ random) {
  ai.nextWanderAt=now+1000+random()*2000;ai.destination=null;
}

/** 생성 좌표와 대상을 보존하는 서버 전용 AI 시간표를 최초 한 번 준비한다. */
function getAI(/** monster: 행동을 실행할 유닛. */ monster, /** now: 서버 시각(ms). */ now, /** random: 난수 함수. */ random) {
  if(!monster.monsterAI) {
    /** monster.monsterAI: 네트워크에 전송하지 않는 배회·공격 대기·복귀 경로 자료. */ monster.monsterAI={
      /** nextWanderAt: 다음 무작위 이동 시작 시각(ms). */ nextWanderAt:0,
      /** destination: 배회 목적지 또는 정지(null). */ destination:null,
      /** pauseUntil: 공격 후 이동·시전을 금지할 종료 시각(ms). */ pauseUntil:0,
      /** windupUntil: 저장 방향으로 공격할 준비 종료 시각(ms). 준비하지 않을 때는 0. */ windupUntil:0,
      /** attackAngle: 30거리에서 저장한 시전 방향(라디안). 공격 준비가 없으면 null. */ attackAngle:null,
      /** hasAttacked: 마지막 대상에게 시전하여 150거리 이탈 조건이 활성화되었는지 여부. */ hasAttacked:false,
      /** returnPath: 지도 장애물을 통과하지 않고 돌아올 수 있게 기록한 이동 전 좌표. */ returnPath:[],
    };
    scheduleWander(monster.monsterAI,now,random);
  }
  return monster.monsterAI;
}

/** 추격·정지를 취소하고 회복한 뒤 통행 가능한 복귀 경로를 선택한다. */
function startReturn(/** monster: 생성점에서 400거리 이상 벗어난 몬스터. */ monster, /** map: 통행 판정 지도 또는 빈 필드(null). */ map) {
  monster.status.awarenessState='returning';monster.status.attackTargetId=null;
  monster.status.currentHealth=effectiveStats(monster.status).maxHealth;
  monster.monsterAI.destination=null;monster.monsterAI.pauseUntil=0;monster.monsterAI.hasAttacked=false;
  monster.monsterAI.windupUntil=0;monster.monsterAI.attackAngle=null;
  const /** direct: 생성점까지 직선 이동으로 도달 가능한 마지막 위치. */ direct=map?globalThis.PitMapRules.constrain(map,monster,monster.status.spawnPosition,monster.status.hitboxDiameter/2,false):monster.status.spawnPosition;
  // 빈 공간·금지 통행이 없는 직선이면 지나온 배회 경로를 모두 거슬러 올라가지 않는다.
  if(distance(direct,monster.status.spawnPosition)<1e-6)monster.monsterAI.returnPath=[];
}

/** 공통 지도 판정 안에서 목적지를 향해 이동하고 이동 전 위치를 복귀 경로에 기록한다. */
function moveToward(
  /** monster: 이동할 몬스터. */ monster,
  /** destination: 이번 이동의 목적 좌표. */ destination,
  /** map: 지형·다리 통행 규칙을 가진 지도 또는 빈 필드(null). */ map,
  /** seconds: 서버 틱 경과 시간(초). */ seconds,
  /** stopDistance: 목적지와 유지할 중심 거리. */ stopDistance=0,
  /** returning: 복귀 경로 이동이면 새 경로를 기록하지 않는다. */ returning=false,
) {
  const /** remaining: 목적지까지 남은 이동 거리. */ remaining=Math.max(0,distance(monster,destination)-stopDistance);
  const /** step: 목적지를 넘지 않는 틱 이동량. */ step=Math.min(remaining,effectiveStats(monster.status).moveSpeed*110*seconds);
  if(step<=0)return false;
  const /** angle: 목적지를 향한 라디안 각도. */ angle=Math.atan2(destination.y-monster.y,destination.x-monster.x);
  const /** previous: 이번 이동 전 월드 좌표. */ previous={x:monster.x,y:monster.y};
  const /** candidate: 이동속도를 적용한 후보 좌표. */ candidate={x:monster.x+Math.cos(angle)*step,y:monster.y+Math.sin(angle)*step};
  const /** allowed: 실제 지도에서 허용한 이동 좌표. */ allowed=map?globalThis.PitMapRules.constrain(map,previous,candidate,monster.status.hitboxDiameter/2):candidate;
  if(!returning&&map) {
    const /** reverse: 같은 경로로 생성 좌표에 복귀할 수 있는지 검사한 역방향 이동. */ reverse=globalThis.PitMapRules.constrain(map,allowed,previous,monster.status.hitboxDiameter/2,false);
    // 반드시 복귀하는 종류이므로 되돌아올 수 없는 단방향 통행은 선택하지 않는다.
    if(distance(reverse,previous)>1e-6)return false;
  }
  if(distance(previous,allowed)<1e-8)return false;
  if(!returning&&monster.monsterAI)monster.monsterAI.returnPath.push(previous);
  monster.x=allowed.x;monster.y=allowed.y;monster.facing=angle;monster.action='move';
  if(!returning&&distance(monster,monster.status.spawnPosition)>=400)startReturn(monster,map);
  return true;
}


/** TEST003 보스의 배회·위협 대상 선정·구르기·돌진·기본공격·복귀를 서버에서 순차 처리한다. */
function tickBoss(
  /** boss: 행동할 보스 개체. */ boss,
  /** objects: 같은 방의 플레이어와 적 개체. */ objects,
  /** map: 서버 이동 판정 지도. */ map,
  /** now: 서버 시각(ms). */ now,
  /** seconds: 이번 서버 틱의 경과 시간(초). */ seconds,
  /** random: 확률과 배회 방향에 사용할 난수 함수. */ random,
  /** effects: 공통 기술 표시 효과를 모으는 목록. */ effects,
){
  const /** status: 보스의 서버 공통 상태. */ status=boss.status;
  if(status.state===LifeState.DEAD){status.attackTargetId=null;return;}
  /** boss.bossAI: 보스의 순차 행동과 시간표를 보관하는 서버 전용 상태. */
  boss.bossAI??={phase:'idle',until:0,point:null,hitIds:new Set(),nextWanderAt:now+1000+random()*2000};
  const /** ai: 이번 보스의 행동 시간표. */ ai=boss.bossAI;
  const /** players: 현재 살아 있는 플레이어만 조회하는 대상 목록. */ players=objects.filter(/** 살아 있는 플레이어만 선정한다. */ (/** object: 대상 후보 개체. */ object)=>object.status.objectType==='player'&&object.status.state===LifeState.ALIVE);
  const /** byId: 현재 공격대상 ID로 조회한 살아 있는 플레이어. */ byId=players.find(/** 공격대상 ID가 일치하는지 확인한다. */ (/** player: 대상 후보 플레이어. */ player)=>player.id===status.attackTargetId);
  /** chooseThreat: 누적 위협수치가 가장 높은 살아 있는 플레이어를 찾는 함수. */
  const chooseThreat=()=>{
    const /** ordered: 누적 피해량 내림차순의 생존 플레이어 목록. */ ordered=players.filter(/** 위협수치가 기록된 플레이어만 남긴다. */ (/** player: 대상 후보. */ player)=>Object.hasOwn(status.threatTable,player.id)).sort(/** 위협수치가 높은 대상을 우선한다. */ (/** a: 첫 대상. */ a,/** b: 비교 대상. */ b)=>status.threatTable[b.id]-status.threatTable[a.id]);
    return ordered[0]??null;
  };
  /** reset: 생성 좌표로 복귀하여 체력·위협수치·인식상태를 초기화한다. */
  const reset=()=>{
    status.awarenessState='returning';status.attackTargetId=null;ai.phase='return';ai.point=null;ai.hitIds.clear();boss.roll=null;
  };
  if(status.awarenessState!=='returning'&&distance(boss,status.spawnPosition)>=800)reset();
  if(status.stunned){boss.roll=null;return;}
  if(status.awarenessState==='returning'){
    moveToward(boss,status.spawnPosition,map,seconds,0,true);
    if(distance(boss,status.spawnPosition)<1){
      boss.x=status.spawnPosition.x;boss.y=status.spawnPosition.y;
      status.currentHealth=effectiveStats(status).maxHealth;
      status.threatTable=Object.create(null);status.attackTargetId=null;status.awarenessState='normal';
      ai.phase='idle';ai.point=null;ai.nextWanderAt=now+1000+random()*2000;
    }
    return;
  }
  if(status.awarenessState==='normal'){
    const /** nearby: 인식 거리 150 이내에서 가장 가까운 생존 플레이어. */ nearby=players.filter(/** 인식 범위에 들어왔는지 확인한다. */ (/** player: 거리 검사 대상. */ player)=>distance(boss,player)<=150).sort(/** 거리가 가까운 순서로 정렬한다. */ (/** a: 첫 플레이어. */ a,/** b: 둘째 플레이어. */ b)=>distance(boss,a)-distance(boss,b))[0];
    if(status.attackTargetId&&byId||nearby){
      status.attackTargetId=byId?.id??nearby.id;status.awarenessState='combat';ai.phase='start';
    }else{
      if(now>=ai.nextWanderAt){
        const /** angle: 배회할 무작위 방향(라디안). */ angle=random()*Math.PI*2;
        const /** length: 배회할 월드 거리(5~70). */ length=5+random()*65;
        ai.point={x:boss.x+Math.cos(angle)*length,y:boss.y+Math.sin(angle)*length};
        ai.nextWanderAt=now+1000+random()*2000;
      }
      if(ai.point&&(!moveToward(boss,ai.point,map,seconds)||distance(boss,ai.point)<1))ai.point=null;
      return;
    }
  }
  const /** target: 현재 공격 대상으로 지정된 살아 있는 플레이어. */ target=players.find(/** 공격대상 ID를 조회한다. */ (/** player: 대상 후보. */ player)=>player.id===status.attackTargetId);
  if(!target||distance(boss,target)>200){reset();return;}
  if(ai.phase==='start'){
    if(distance(boss,status.spawnPosition)>=800){reset();return;}
    if(random()<0.3){
      const /** angle: 구르기에 사용할 무작위 방향(라디안). */ angle=random()*Math.PI*2;
      boss.facing=angle;boss.lastMovementInput={x:Math.cos(angle),y:Math.sin(angle)};
      const /** roll: B 슬롯의 BAS0002 공통 구르기 결과. */ roll=castSkill(boss,objects,'B',now);
      if(roll?.kind==='roll'){ai.phase='roll';return;}
    }
    ai.phase='distance';
  }
  if(ai.phase==='roll'){
    if(boss.roll?.remaining>0){
      const /** remaining: 이번 틱에 이동할 구르기 거리. */ remaining=Math.min(boss.roll.remaining,boss.roll.speed*seconds);
      const /** point: 구르기 방향으로 이동할 후보 위치. */ point={x:boss.x+Math.cos(boss.roll.angle)*remaining,y:boss.y+Math.sin(boss.roll.angle)*remaining};
      const /** allowed: 지형 통행 판정을 통과한 실제 위치. */ allowed=map?globalThis.PitMapRules.constrain(map,boss,point,status.hitboxDiameter/2):point;
      const /** moved: 실제로 구른 월드 거리. */ moved=distance(boss,allowed);
      boss.x=allowed.x;boss.y=allowed.y;boss.roll.remaining-=moved;
      if(moved<remaining)boss.roll.remaining=0;
      if(boss.roll.remaining>0)return;
    }
    boss.roll=null;ai.phase='distance';
  }
  if(ai.phase==='distance'){
    if(distance(boss,target)>=100){
      ai.point={x:target.x,y:target.y};ai.until=now+800;ai.phase='dashWait';
    }else ai.phase='approach';
  }
  if(ai.phase==='dashWait'){
    if(now<ai.until)return;
    ai.phase='dash';ai.hitIds.clear();
  }
  if(ai.phase==='dash'){
    const /** point: 돌진 준비 때 저장한 목표 좌표. */ point=ai.point;
    if(point&&distance(boss,point)>1){
      const /** before: 돌진 시작 위치. */ before={x:boss.x,y:boss.y};
      const /** maxStep: 이동속도 6의 이번 틱 최대 월드 거리. */ maxStep=6*110*seconds;
      const /** ratio: 목표 좌표를 넘지 않도록 제한하는 이동 비율. */ ratio=Math.min(1,maxStep/distance(boss,point));
      const /** candidate: 저장 좌표를 향한 이번 이동 후보. */ candidate={x:boss.x+(point.x-boss.x)*ratio,y:boss.y+(point.y-boss.y)*ratio};
      const /** allowed: 서버 지형 충돌 판정을 거친 돌진 위치. */ allowed=map?globalThis.PitMapRules.constrain(map,before,candidate,status.hitboxDiameter/2):candidate;
      boss.x=allowed.x;boss.y=allowed.y;boss.facing=Math.atan2(point.y-before.y,point.x-before.x);boss.action='move';
      for(const /** player: 돌진 중 접촉 피해를 검사할 생존 플레이어. */ player of players){
        if(ai.hitIds.has(player.id))continue;
        const /** vx: 이번 돌진 구간의 가로 이동량. */ vx=boss.x-before.x;
        const /** vy: 이번 돌진 구간의 세로 이동량. */ vy=boss.y-before.y;
        const /** lengthSquared: 이동 구간의 길이 제곱. */ lengthSquared=vx*vx+vy*vy;
        const /** projection: 이동 구간에서 플레이어와 가장 가까운 위치 비율. */ projection=lengthSquared?Math.max(0,Math.min(1,((player.x-before.x)*vx+(player.y-before.y)*vy)/lengthSquared)):0;
        const /** separation: 이동 경로와 플레이어 중심의 최단 거리. */ separation=Math.hypot(player.x-before.x-vx*projection,player.y-before.y-vy*projection);
        if(separation<=(status.hitboxDiameter+player.status.hitboxDiameter)/2){
          const /** instance: 돌진 피해를 공통 피해 함수로 전달할 서버 기술 인스턴스. */ instance={id:boss.id+':dash:'+now,code:'TEST003_DASH',casterId:boss.id,resultSequence:0};
          const /** result: 공통 피해 파이프라인에서 확정한 돌진 접촉 결과. */ result=applySkillDamage(instance,player,effectiveStats(status).attack,now,boss);
          if(result)ai.hitIds.add(player.id);
        }
      }
      if(distance(boss,point)>1&&distance(before,boss)>0)return;
    }
    ai.phase='retarget';
  }
  if(ai.phase==='approach'){
    if(distance(boss,target)>40){moveToward(boss,target,map,seconds,40);return;}
    ai.point={angle:Math.atan2(target.y-boss.y,target.x-boss.x)};
    boss.facing=ai.point.angle;ai.until=now+1200;ai.phase='attackWait';
  }
  if(ai.phase==='attackWait'){
    boss.action='windup';
    if(now<ai.until)return;
    const /** effect: 저장한 방향으로 사용한 BAS0001 기본공격. */ effect=castSkill(boss,objects,'A',now,undefined,ai.point.angle);
    if(effect)effects.push(effect);
    ai.until=now+1500;ai.phase='pause';return;
  }
  if(ai.phase==='pause'&&now<ai.until)return;
  if(ai.phase==='pause'||ai.phase==='retarget'){
    const /** highest: 누적 위협수치가 가장 높은 생존 플레이어. */ highest=chooseThreat();
    if(highest)status.attackTargetId=highest.id;
    const /** next: 재지정된 현재 공격 대상. */ next=players.find(/** 살아 있는 다음 대상인지 검사한다. */ (/** player: 대상 후보. */ player)=>player.id===status.attackTargetId);
    if(!next||distance(boss,next)>200){reset();return;}
    ai.phase='start';
  }
}

/** 일반·추격·시전 후 정지·생성점 복귀를 서버 틱으로 처리하고 새 기술 표시 효과를 반환한다. */
export function tickMonsters(
  /** objects: 플레이어·NPC·몬스터의 현재 월드 목록. */ objects,
  /** map: 지형 판정에 사용할 지도 또는 빈 필드(null). */ map,
  /** now: 서버 현재 시각(ms). */ now,
  /** seconds: 이번 시뮬레이션 경과 시간(초). */ seconds,
  /** random: 배회 간격·방향·거리를 결정하는 난수 함수. */ random=Math.random,
) {
  const /** effects: 이번 틱에 성공한 공격의 공통 기술 인스턴스. */ effects=[];
  const /** byId: 공격대상을 개체ID로 찾기 위한 목록. */ byId=new Map(objects.map(/** 개체ID별 조회 쌍을 만든다. */ (/** object: 현재 월드 개체. */ object)=>[object.id,object]));
  for(const /** monster: 행동을 검사할 월드 개체. */ monster of objects) {
    if(monster.status.objectType!=='enemy')continue;
    if(monster.status.classificationCode==='TEST003'){
      monster.action=null;tickBoss(monster,objects,map,now,seconds,random,effects);continue;
    }
    if(monster.status.classificationCode!=='TEST001')continue;
    const /** status: 복귀 좌표·인식상태·공격대상을 가진 서버 수치. */ status=monster.status;
    monster.action=null;
    if(status.state===LifeState.DEAD){
      status.attackTargetId=null;
      if(monster.monsterAI){monster.monsterAI.windupUntil=0;monster.monsterAI.attackAngle=null;}
      continue;
    }
    const /** ai: 이 개체만의 서버 행동 시간표. */ ai=getAI(monster,now,random);
    if(status.awarenessState!=='returning'&&distance(monster,status.spawnPosition)>=400) {
      startReturn(monster,map);
    }
    if(status.stunned){ai.windupUntil=0;ai.attackAngle=null;continue;}
    if(status.awarenessState==='returning') {
      const /** waypoint: 지나왔던 마지막 좌표 또는 최초 생성 좌표. */ waypoint=ai.returnPath.at(-1)??status.spawnPosition;
      moveToward(monster,waypoint,map,seconds,0,true);
      if(distance(monster,waypoint)<1e-6)ai.returnPath.pop();
      if(distance(monster,status.spawnPosition)<1e-6) {
        monster.x=status.spawnPosition.x;monster.y=status.spawnPosition.y;
        status.awarenessState='normal';status.attackTargetId=null;status.currentHealth=effectiveStats(status).maxHealth;
        ai.returnPath=[];scheduleWander(ai,now,random);
      }
      continue;
    }
    if(now<ai.pauseUntil)continue;
    if(ai.attackAngle!==null) {
      monster.facing=ai.attackAngle;
      if(now<ai.windupUntil){monster.action='windup';continue;}
      const /** effect: 준비 시작 시 저장한 방향으로 실행한 공통 BAS0001 시전 결과. */ effect=castSkill(monster,objects,'A',now,undefined,ai.attackAngle);
      if(effect){effects.push(effect);ai.pauseUntil=now+2500;ai.hasAttacked=true;monster.action='A';}
      ai.windupUntil=0;ai.attackAngle=null;
      continue;
    }
    const /** target: 마지막 실제 공격자의 현재 개체. */ target=byId.get(status.attackTargetId);
    if(status.awarenessState==='combat'&&(!target||target.status.state===LifeState.DEAD||(ai.hasAttacked&&distance(monster,target)>150))) {
      status.attackTargetId=null;status.awarenessState='normal';ai.hasAttacked=false;scheduleWander(ai,now,random);
    }
    if(status.awarenessState==='combat'&&target) {
      moveToward(monster,target,map,seconds,30);
      // 이동 직후 400거리 경계를 넘었으면 다음 공격보다 복귀 판정을 우선한다.
      if(distance(monster,status.spawnPosition)>=400)continue;
      if(distance(monster,target)<=30+1e-6) {
        ai.attackAngle=Math.atan2(target.y-monster.y,target.x-monster.x);
        ai.windupUntil=now+1500;
        monster.facing=ai.attackAngle;monster.action='windup';
      }
      continue;
    }
    if(now>=ai.nextWanderAt) {
      const /** angle: 배회 이동의 무작위 라디안 방향. */ angle=random()*Math.PI*2;
      const /** length: 이번 배회에서 이동할 5~50 월드 거리. */ length=5+random()*45;
      scheduleWander(ai,now,random);
      ai.destination={x:monster.x+Math.cos(angle)*length,y:monster.y+Math.sin(angle)*length};
    }
    if(ai.destination) {
      const /** destination: 복귀 전환으로 AI 목적지가 초기화되어도 이번 이동을 검사할 좌표. */ destination=ai.destination;
      if(!moveToward(monster,destination,map,seconds)||distance(monster,destination)<1e-6)ai.destination=null;
    }
  }
  return effects;
}
