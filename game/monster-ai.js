import '../public/pit-map-rules.js';
import { /** createMonster: 프리셋별 몬스터 유닛을 생성한다. */ createMonster } from './monsters.js';
import { /** castSkill: 공통 접촉·피해 파이프라인으로 기술을 실행한다. */ castSkill } from './skills.js';
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
  if(!returning)monster.monsterAI.returnPath.push(previous);
  monster.x=allowed.x;monster.y=allowed.y;monster.facing=angle;monster.action='move';
  if(!returning&&distance(monster,monster.status.spawnPosition)>=400)startReturn(monster,map);
  return true;
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
    if(monster.status.objectType!=='enemy'||monster.status.classificationCode!=='TEST001')continue;
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
