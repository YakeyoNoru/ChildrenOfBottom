import { /** intersectsSkill: 공통 기술 영역과 대상의 교차를 검사한다. */ intersectsSkill, /** resolveSkillContacts: 접촉부터 피해 결과까지 공통 처리한다. */ resolveSkillContacts } from './combat.js';
export { resolveSkillContacts, skillSnapshot } from './combat.js';
import { /** areEnemies: 적과 플레이어·NPC 사이의 기본 적대 관계를 판정한다. */ areEnemies, /** LifeState: 생존·사망 상태 상수. */ LifeState, /** normalizeVitals: 체력·자원을 최종 최대치 안으로 제한하고 사망 상태를 정규화한다. */ normalizeVitals } from './status.js';

// 기술 정의는 서버가 관리한다. T1은 테스트 범위 표시의 유지 시간만 제어한다.
export const /** skills: 기술 코드별 공통 기술 정의. */ skills = Object.freeze({
  // BAS0001: 기본 A 슬롯에 연결하는 전방 사각형 기본공격 정의.
  BAS0001: Object.freeze({
    /** code: 슬롯에서 조회할 기술 고유 코드. */ code: 'BAS0001',
    /** name: 기술의 표시 이름. */ name: '기본공격',
    /** T1: Y이면 범위 표시를 4초 유지하며 피해는 시전 시 한 번만 적용한다. */ T1: 'Y',
    /** shape: 시전자 중심에서 전방으로 뻗는 사각형 판정 형식. */ shape: 'forwardRectangle',
    /** cooldownMs: 시전 성공 후 같은 슬롯을 다시 사용할 때까지의 시간(밀리초). */ cooldownMs: 300,
    /** width: 전방에 수직인 좌우 전체 폭(월드 좌표). */ width: 50,
    /** length: 시전자 중심부터 전방 끝까지의 거리(월드 좌표). */ length: 72,
    /** bonusDamage: 기본공격력과 추가공격력의 합에 더하는 기술 고유 피해. */ bonusDamage: 5,
    /** debugDurationMs: T1이 Y일 때 시전 위치의 범위를 유지할 시간(밀리초). */ debugDurationMs: 4000,
  }),
  /** BAS0002: 시전자 이동 방향으로 정해진 거리를 전진하는 비공격 기술. */
  BAS0002: Object.freeze({
    /** code: B 슬롯의 기본 기술 코드. */ code:'BAS0002',
    /** name: 기술 표시 이름. */ name:'구르기',
    /** kind: 피해 판정 대신 강제 이동 상태를 시작하는 기술 구분. */ kind:'roll',
    /** T1: 공격 범위 표시를 만들지 않는다. */ T1:'N',
    /** cooldownMs: 별도 대기는 추가하지 않고 구르기 동작 중 재사용만 막는다. */ cooldownMs:0,
    /** distance: 캐릭터 표시 지름 36의 두 배 거리(월드 좌표). */ distance:72,
    /** speedMultiplier: 시전 순간 최종 이동속도에 곱할 배율. */ speedMultiplier:3,
  }),
});
export /** circleIntersectsSkill: 공격 방향으로 좌표를 투영해 원형 히트박스와 전방 사각형의 교차를 검사한다. */ function circleIntersectsSkill(/** caster: 기술을 사용하는 개체. */ caster, /** target: 선택된 적대 개체 또는 히트박스를 검사할 대상. */ target, /** angle: 방향을 나타내는 라디안 각도. */ angle, /** skill: 이번 시전에 적용할 기술 정의. */ skill) {
  return intersectsSkill({x:caster.x,y:caster.y,angle,shape:skill.shape,width:skill.width,length:skill.length,radius:skill.radius},target);
}
export /** castSkill: 서버 기술 슬롯과 선택 대상을 기준으로 적에게 한 번 피해를 적용하고 표시 효과를 만든다. */ function castSkill(/** caster: 기술을 사용하는 개체. */ caster, /** objects: 처리할 월드 개체 목록. */ objects, /** slot: 기술을 저장하거나 시전할 A·B·C·P 슬롯. */ slot, /** now: 현재 처리 시각(밀리초). */ now = Date.now(), /** definitions: 시전에 사용할 기술 코드별 정의 모음. */ definitions = skills) {
  if (!['A','B','C'].includes(slot) || caster.status.stunned || caster.status.state === LifeState.DEAD || caster.roll?.remaining>0) return null;
  const /** skill: 이번 시전에 적용할 기술 정의. */ skill = definitions[caster.status['skill'+slot]];
  if (!skill || skillCooldownRemaining(caster,slot,now)>0) return null;
  if(skill.kind==='roll') return startRoll(caster,skill,slot,now);
  const /** target: 선택된 적대 개체 또는 히트박스를 검사할 대상. */ target = objects.find(/** o: 현재 비교하거나 변환할 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ o=>o.id===caster.status.nearestEnemyId && o.status.state!==LifeState.DEAD && areEnemies(caster.status,o.status));
  const /** angle: 방향을 나타내는 라디안 각도. */ angle = target ? Math.atan2(target.y-caster.y,target.x-caster.x) : caster.facing ?? -Math.PI/2;
  const /** instance: 이번 시전만의 위치·공격 수치·피격 기록을 가진 서버 객체. */ instance=createSkillInstance(caster,skill,angle,now);
  resolveSkillContacts(instance,objects,now);
  /** caster.skillCooldowns: 각 슬롯에서 다음 시전이 허용되는 서버 시각. */
  caster.skillCooldowns ??= {};
  caster.skillCooldowns[slot]=now+Math.max(0,skill.cooldownMs ?? 0);
  return instance;
}

/** 슬롯 공통 쿨타임의 남은 시간을 계산한다. 클라이언트가 보낸 시각은 사용하지 않는다. */
export function skillCooldownRemaining(
  /** caster: 재사용 가능 여부를 확인할 시전자. */ caster,
  /** slot: 확인할 A·B·C 슬롯. */ slot,
  /** now: 서버 현재 시각(밀리초). */ now = Date.now(),
) {
  return Math.max(0,(caster.skillCooldowns?.[slot] ?? 0)-now);
}

/** 시전자를 떠나 독립적으로 판정할 수 있는 기술 인스턴스를 생성한다. 이동·설치 스케줄러는 추후 연결한다. */
export function createSkillInstance(
  /** caster: 공격 수치와 소속을 복사할 시전자. */ caster,
  /** skill: 서버가 조회한 기술 정의. */ skill,
  /** angle: 시전 방향(라디안). */ angle,
  /** now: 생성 시각(밀리초). */ now,
) {
  /** caster.skillCastSequence: 시전자별 시전 인스턴스를 구분하는 증가 번호. */
  caster.skillCastSequence=(caster.skillCastSequence ?? 0)+1;
  return {
    /** id: 시전자와 증가 번호로 구성한 시전 고유 ID. */ id:caster.id+':'+caster.skillCastSequence,
    /** casterId: 공격자의 개체 ID. */ casterId:caster.id,
    /** code: 원본 기술 코드. */ code:skill.code,
    /** sourceStatus: 시전 순간의 소속을 보존해 공격자 퇴장 후에도 적대를 판정한다. */ sourceStatus:{objectType:caster.status.objectType},
    /** attack: 시전 순간의 기본공격력. */ attack:caster.status.attack,
    /** bonusAttack: 시전 순간의 추가공격력. */ bonusAttack:caster.status.bonusAttack,
    /** bonusDamage: 기술 고유 추가 피해. */ bonusDamage:skill.bonusDamage ?? 0,
    /** damage: 기본 공식으로 계산한 표시용 피해. 실제 적용은 공통 피해 함수가 결정한다. */ damage:Math.max(0,caster.status.attack+caster.status.bonusAttack+(skill.bonusDamage ?? 0)),
    /** x: 기술의 현재 가로 위치(월드 좌표). */ x:caster.x,
    /** y: 기술의 현재 세로 위치(월드 좌표). */ y:caster.y,
    /** angle: 판정 방향(라디안). */ angle,
    /** shape: 전방 사각형 또는 원형 판정 구분. */ shape:skill.shape,
    /** width: 사각형 전체 좌우 폭(월드 좌표). */ width:skill.width,
    /** length: 사각형 전방 거리(월드 좌표). */ length:skill.length,
    /** radius: 원형 기술의 판정 반지름(월드 좌표). */ radius:skill.radius,
    /** createdAt: 시전 인스턴스 생성 시각(밀리초). */ createdAt:now,
    /** activeFrom: 접촉 피해 판정을 시작할 시각(밀리초). */ activeFrom:now,
    /** activeUntil: 접촉 피해 판정을 중단할 시각. 기본공격은 최초 판정만 호출한다. */ activeUntil:now+Math.max(1,skill.activeDurationMs ?? 1),
    /** expiresAt: 테스트 범위 표시가 사라지는 시각(밀리초). 피해 유효 시간과 별개다. */ expiresAt:now+(skill.T1==='Y'?skill.debugDurationMs:150),
    /** hitIntervalMs: null이면 시전당 대상별 한 번, 숫자이면 해당 간격으로 재피격 허용. */ hitIntervalMs:skill.hitIntervalMs ?? null,
    /** hitTimes: 대상별 마지막 피해 시각을 보관하는 서버 전용 맵. */ hitTimes:new Map(),
    /** hits: 적중한 대상 ID 목록. */ hits:[],
    /** results: 확정한 피해 결과 기록. */ results:[],
    /** resultSequence: 동일 시전 안의 결과를 구분하는 증가 번호. */ resultSequence:0,
  };
}

/** 이동 또는 주시 방향을 시전 순간 고정하고 구르기 상태를 시작한다. 피해·무적은 부여하지 않는다. */
function startRoll(
  /** caster: 구르기를 시작할 개체. */ caster,
  /** skill: 거리·속도 배율을 정의한 서버 기술. */ skill,
  /** slot: 재사용 대기를 저장할 기술 슬롯. */ slot,
  /** now: 시전 시각(밀리초). */ now,
) {
  const /** input: 서버가 마지막으로 처리한 이동 입력. */ input=caster.lastMovementInput??caster.input??{x:0,y:0};
  const /** angle: 이동 중이면 이동 방향, 정지 중이면 주시 방향(라디안). */ angle=Math.hypot(input.x,input.y)>0?Math.atan2(input.y,input.x):caster.facing??-Math.PI/2;
  const /** speed: 시전 순간 평상시 속도의 3배인 초당 월드 이동 거리. */ speed=Math.max(0,caster.status.moveSpeed+caster.status.bonusMoveSpeed)*110*skill.speedMultiplier;
  if(speed<=0) return null;
  /** caster.roll: 입력으로 꺾을 수 없는 구르기 방향·속도·남은 거리. */
  caster.roll={angle,speed,remaining:skill.distance};
  caster.facing=angle;
  /** caster.skillCooldowns: 슬롯별 다음 시전 가능 서버 시각. */ caster.skillCooldowns??={};
  caster.skillCooldowns[slot]=now+skill.cooldownMs;
  // 구르기는 위치 스냅샷으로 전달하며 공격 사각형 효과를 생성하지 않는다.
  return {code:skill.code,kind:'roll'};
}
