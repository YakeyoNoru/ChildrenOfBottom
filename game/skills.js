import { /** areEnemies: 적과 플레이어·NPC 사이의 기본 적대 관계를 판정한다. */ areEnemies, /** LifeState: 생존·사망 상태 상수. */ LifeState, /** normalizeVitals: 체력·자원을 최종 최대치 안으로 제한하고 사망 상태를 정규화한다. */ normalizeVitals } from './status.js';

// 기술 정의는 서버가 관리한다. T1은 테스트 범위 표시의 유지 시간만 제어한다.
export const /** skills: 기술 코드별 공통 기술 정의. */ skills = Object.freeze({
  // BAS0001: 기본 A 슬롯에 연결하는 전방 사각형 기본공격 정의.
  BAS0001: Object.freeze({
    /** code: 슬롯에서 조회할 기술 고유 코드. */ code: 'BAS0001',
    /** name: 기술의 표시 이름. */ name: '기본공격',
    /** T1: Y이면 범위 표시를 4초 유지하며 피해는 시전 시 한 번만 적용한다. */ T1: 'Y',
    /** shape: 시전자 중심에서 전방으로 뻗는 사각형 판정 형식. */ shape: 'forwardRectangle',
    /** width: 전방에 수직인 좌우 전체 폭(월드 좌표). */ width: 50,
    /** length: 시전자 중심부터 전방 끝까지의 거리(월드 좌표). */ length: 72,
    /** bonusDamage: 기본공격력과 추가공격력의 합에 더하는 기술 고유 피해. */ bonusDamage: 5,
    /** debugDurationMs: T1이 Y일 때 시전 위치의 범위를 유지할 시간(밀리초). */ debugDurationMs: 4000,
  }),
});
export /** circleIntersectsSkill: 공격 방향으로 좌표를 투영해 원형 히트박스와 전방 사각형의 교차를 검사한다. */ function circleIntersectsSkill(/** caster: 기술을 사용하는 개체. */ caster, /** target: 선택된 적대 개체 또는 히트박스를 검사할 대상. */ target, /** angle: 방향을 나타내는 라디안 각도. */ angle, /** skill: 이번 시전에 적용할 기술 정의. */ skill) {
  const /** dx: 대상과 기준점의 가로 좌표 차이. */ dx = target.x-caster.x, /** dy: 대상과 기준점의 세로 좌표 차이. */ dy = target.y-caster.y;
  const /** forward: 공격 방향으로 투영한 전방 거리. */ forward = dx*Math.cos(angle)+dy*Math.sin(angle);
  const /** sideways: 공격 방향에 수직인 좌우 거리. */ sideways = -dx*Math.sin(angle)+dy*Math.cos(angle);
  const /** radius: 대상의 원형 피격 히트박스 반지름(월드 좌표). */ radius = (target.status.hitboxDiameter ?? 24)/2;
  const /** fx: 전방 거리와 공격 사각형 최근접점의 차이. */ fx = forward-Math.max(0,Math.min(skill.length,forward));
  const /** sy: 좌우 거리와 공격 사각형 최근접점의 차이. */ sy = sideways-Math.max(-skill.width/2,Math.min(skill.width/2,sideways));
  return fx*fx+sy*sy <= radius*radius;
}
export /** castSkill: 서버 기술 슬롯과 선택 대상을 기준으로 적에게 한 번 피해를 적용하고 표시 효과를 만든다. */ function castSkill(/** caster: 기술을 사용하는 개체. */ caster, /** objects: 처리할 월드 개체 목록. */ objects, /** slot: 기술을 저장하거나 시전할 A·B·C·P 슬롯. */ slot, /** now: 현재 처리 시각(밀리초). */ now = Date.now(), /** definitions: 시전에 사용할 기술 코드별 정의 모음. */ definitions = skills) {
  if (!['A','B','C'].includes(slot) || caster.status.stunned || caster.status.state === LifeState.DEAD) return null;
  const /** skill: 이번 시전에 적용할 기술 정의. */ skill = definitions[caster.status['skill'+slot]];
  if (!skill) return null;
  const /** target: 선택된 적대 개체 또는 히트박스를 검사할 대상. */ target = objects.find(/** o: 현재 비교하거나 변환할 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ o=>o.id===caster.status.nearestEnemyId && o.status.state!==LifeState.DEAD && areEnemies(caster.status,o.status));
  const /** angle: 방향을 나타내는 라디안 각도. */ angle = target ? Math.atan2(target.y-caster.y,target.x-caster.x) : caster.facing ?? -Math.PI/2;
  const /** damage: 이번 시전이 가할 최종 피해량. */ damage = Math.max(0,caster.status.attack+caster.status.bonusAttack+skill.bonusDamage);
  const /** hits: 한 번 피해를 적용한 대상 식별자 목록. */ hits=[];
  for (const /** object: 현재 처리하는 월드 개체. */ object of objects) {
    if (object.id===caster.id || object.status.state===LifeState.DEAD || !areEnemies(caster.status,object.status) || !circleIntersectsSkill(caster,object,angle,skill)) continue;
    object.status.currentHealth=Math.max(0,object.status.currentHealth-damage); normalizeVitals(object.status); hits.push(object.id);
  }
  return { casterId:caster.id,code:skill.code,x:caster.x,y:caster.y,angle,width:skill.width,length:skill.length,damage,hits,createdAt:now,expiresAt:now+(skill.T1==='Y'?skill.debugDurationMs:150) };
}
