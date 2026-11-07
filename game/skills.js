import { /** startAdvancedSkill: 새 기술의 시전 조건과 초기 효과를 처리한다. */ startAdvancedSkill } from './advanced-skills.js';
import { /** intersectsSkill: 공통 기술 영역과 대상의 교차를 검사한다. */ intersectsSkill, /** resolveSkillContacts: 접촉부터 피해 결과까지 공통 처리한다. */ resolveSkillContacts } from './combat.js';
export { resolveSkillContacts, skillSnapshot } from './combat.js';
import { /** areEnemies: 자신·NPC를 제외한 유닛 대상의 적대 관계를 판정한다. */ areEnemies, /** LifeState: 생존·사망 상태 상수. */ LifeState, /** normalizeVitals: 체력·자원을 최종 최대치 안으로 제한하고 사망 상태를 정규화한다. */ normalizeVitals } from './status.js';

/** 기술별 구매 비용과 허용 무기 속성의 공통 기본값을 적용한다. */
function defineSkill(/** definition: 기술별 정의와 설명. */ definition) {
  return Object.freeze({
    /** skillPoints: 카드 한 장을 구매할 때 소모하는 스킬포인트. */ skillPoints:1,
    /** allowedAttributeCodes: 허용하는 무기 속성코드. 빈 목록은 제한이 없다. */ allowedAttributeCodes:Object.freeze([]),
    /** basicEffect: 버튼으로 시전할 때 적용하는 효과 설명. */ basicEffect:'',
    /** triggerEffect: 카드 구매에 따르는 효과 설명. */ triggerEffect:'구매 시 보유 레벨 +1',
    ...definition,
  });
}

// 기술 정의는 서버가 관리한다. T1은 테스트 범위 표시의 유지 시간만 제어한다.
export const /** skills: 기술 코드별 공통 기술 정의. */ skills = Object.freeze({
  // BAS0001: 기본 A 슬롯에 연결하는 전방 사각형 기본공격 정의.
  BAS0001: defineSkill({
    /** typeCode: 배정 가능한 버튼. */ typeCode:'A',
    /** basicEffect: 버튼 사용 시 공격 설명. */ basicEffect:'전방 폭 50, 길이 72 공격. 기본공격력과 추가공격력 합계에 5를 더한 피해.',
    /** code: 슬롯에서 조회할 기술 고유 코드. */ code: 'BAS0001',
    /** name: 기술의 표시 이름. */ name: '기본공격',
    /** T1: Y이면 범위 표시를 4초 유지하며 피해는 시전 시 한 번만 적용한다. */ T1: 'Y',
    /** shape: 시전자 중심에서 전방으로 뻗는 사각형 판정 형식. */ shape: 'forwardRectangle',
    /** cooldownMs: 시전 성공 후 같은 슬롯을 다시 사용할 때까지의 시간(밀리초). */ cooldownMs: 500,
    /** width: 전방에 수직인 좌우 전체 폭(월드 좌표). */ width: 50,
    /** length: 시전자 중심부터 전방 끝까지의 거리(월드 좌표). */ length: 72,
    /** bonusDamage: 기본공격력과 추가공격력의 합에 더하는 기술 고유 피해. */ bonusDamage: 5,
    /** debugDurationMs: T1이 Y일 때 시전 위치의 범위를 유지할 시간(밀리초). */ debugDurationMs: 4000,
  }),
  /** BAS0002: 시전자 이동 방향으로 정해진 거리를 전진하는 비공격 기술. */
  BAS0002: defineSkill({
    /** typeCode: 배정 가능한 버튼. */ typeCode:'B',
    /** basicEffect: 버튼 사용 시 이동 설명. */ basicEffect:'이동 또는 주시 방향으로 이동속도의 3배로 72만큼 구른다.',
    /** code: B 슬롯의 기본 기술 코드. */ code:'BAS0002',
    /** name: 기술 표시 이름. */ name:'구르기',
    /** kind: 피해 판정 대신 강제 이동 상태를 시작하는 기술 구분. */ kind:'roll',
    /** T1: 공격 범위 표시를 만들지 않는다. */ T1:'N',
    /** cooldownMs: 시전 성공 후 B 슬롯 재사용을 막을 시간(밀리초). */ cooldownMs:2000,
    /** distance: 캐릭터 표시 지름 36의 두 배 거리(월드 좌표). */ distance:72,
    /** speedMultiplier: 시전 순간 최종 이동속도에 곱할 배율. */ speedMultiplier:3,
  }),
  BAS0003: defineSkill({
    code:'BAS0003', name:'돌진베기', typeCode:'B', kind:'dashStrike', cooldownMs:8000,
    /** targetRange: 시전 가능한 적 중심 거리. */ targetRange:120,
    /** windupMs: 이동 전 정지 시간(ms). */ windupMs:300,
    /** stopDistance: 공격을 시작할 대상 중심 거리. */ stopDistance:20,
    /** speed: 공통 이동속도 단위. */ speed:5,
    basicEffect:'120 이내 적을 향해 0.3초 정지 후 속도 5로 돌진한다. 거리 20에서 공격력과 추가공격력 합계만큼 피해. 대상이 없으면 실패.',
  }),
  BAS0004: defineSkill({
    code:'BAS0004', name:'돌던지기', typeCode:'A', kind:'stone', cooldownMs:2000,
    /** targetRange: 투사체 조준에 필요한 적 중심 거리. */ targetRange:100,
    /** distance: 투사체 최대 이동 거리. */ distance:150,
    /** speed: 공통 이동속도 단위. */ speed:5,
    basicEffect:'100 이내 적의 현재 위치를 향해 검은 돌을 던진다. 150 이동 또는 첫 적 접촉 시 소멸. 공격력과 추가공격력 합계만큼 피해. 대상이 없으면 실패.',
  }),
  BAS0005: defineSkill({
    code:'BAS0005', name:'러닝크루', typeCode:'A', kind:'sprint', cooldownMs:12000,
    /** durationMs: 이동속도 증가 지속 시간(ms). */ durationMs:5000,
    basicEffect:'5초간 이동속도 +1.',
    triggerEffect:'환영조각 획득마다 경쟁점수 +5, 경험치 +1을 추가한다.',
  }),
  BAS0006: defineSkill({
    code:'BAS0006', name:'하스스톤', typeCode:'C', kind:'hearth', skillPoints:3, cooldownMs:600000,
    /** delayMs: 탈출구 생성까지 대기 시간(ms). */ delayMs:10000,
    basicEffect:'보유 레벨 3일 때 시전 위치에 10초 뒤 탈출구를 생성한다. 재사용 대기 600초.',
  }),
  BAS0007: defineSkill({
    code:'BAS0007', name:'힘세고강한 아침', typeCode:'P', skillPoints:3,
    triggerEffect:'구매 시 추가공격력에 (현재 플레이어 레벨 + 5) × 2를 더한다.',
  }),
  BAS0008: defineSkill({
    code:'BAS0008', name:'짐승같은감', typeCode:'P', skillPoints:0,
    triggerEffect:'구매 후 20초간 미니맵과 전체맵에 다른 생존 플레이어의 위치를 표시한다.',
  }),
});
export /** circleIntersectsSkill: 공격 방향으로 좌표를 투영해 원형 히트박스와 전방 사각형의 교차를 검사한다. */ function circleIntersectsSkill(/** caster: 기술을 사용하는 개체. */ caster, /** target: 선택된 적대 개체 또는 히트박스를 검사할 대상. */ target, /** angle: 방향을 나타내는 라디안 각도. */ angle, /** skill: 이번 시전에 적용할 기술 정의. */ skill) {
  return intersectsSkill({x:caster.x,y:caster.y,angle,shape:skill.shape,width:skill.width,length:skill.length,radius:skill.radius},target);
}
export /** castSkill: 서버 기술 슬롯과 선택 대상 또는 저장 방향으로 피해와 표시 효과를 만든다. */ function castSkill(/** caster: 기술을 사용하는 개체. */ caster, /** objects: 처리할 월드 개체 목록. */ objects, /** slot: 기술을 저장하거나 시전할 A·B·C·P 슬롯. */ slot, /** now: 현재 처리 시각(밀리초). */ now = Date.now(), /** definitions: 시전에 사용할 기술 코드별 정의 모음. */ definitions = skills, /** aimAngle: 서버 AI가 저장한 고정 시전 방향(라디안). null이면 기존 자동 조준. 클라이언트 입력으로 받지 않는다. */ aimAngle = null) {
  if(aimAngle!==null&&!Number.isFinite(aimAngle))return null;
  if (!['A','B','C'].includes(slot) || caster.status.stunned || caster.status.state === LifeState.DEAD || caster.roll?.remaining>0) return null;
  const /** skill: 이번 시전에 적용할 기술 정의. */ skill = definitions[caster.status['skill'+slot]];
  if (!skill || !allowsWeapon(skill,caster.status) || skill.typeCode==='P' || caster.status.dashActive || skillCooldownRemaining(caster,slot,now)>0) return null;
  if(skill.kind==='roll') return startRoll(caster,skill,slot,now);
  if(skill.kind){
    const /** effect: 시전 조건을 통과한 새 기술의 실행 상태. */ effect=startAdvancedSkill(caster,objects,skill,now);
    if(!effect)return null;
    caster.skillCooldowns??={};
    caster.skillCooldowns[slot]=now+(skill.cooldownMs??0);
    updateSkillCooldowns(caster,now);
    return effect;
  }
  const /** target: 선택된 적대 개체 또는 히트박스를 검사할 대상. */ target = objects.find(/** o: 현재 비교하거나 변환할 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ o=>o.id===caster.status.nearestEnemyId && o.status.state!==LifeState.DEAD && areEnemies(caster.status,o.status));
  const /** angle: 서버 지정 방향이 있으면 현재 대상 위치와 무관하게 사용하는 라디안 각도. */ angle = aimAngle ?? (target ? Math.atan2(target.y-caster.y,target.x-caster.x) : caster.facing ?? -Math.PI/2);
  const /** instance: 이번 시전만의 위치·공격 수치·피격 기록을 가진 서버 객체. */ instance=createSkillInstance(caster,skill,angle,now);
  resolveSkillContacts(instance,objects,now);
  /** caster.skillCooldowns: 각 슬롯에서 다음 시전이 허용되는 서버 시각. */
  caster.skillCooldowns ??= {};
  caster.skillCooldowns[slot]=now+Math.max(0,skill.cooldownMs ?? 0);
  updateSkillCooldowns(caster,now);
  return instance;
}

/** 슬롯 공통 쿨타임의 남은 시간을 계산한다. 클라이언트가 보낸 시각은 사용하지 않는다. */
export function skillCooldownRemaining(
  /** caster: 재사용 가능 여부를 확인할 시전자. */ caster,
  /** slot: 확인할 A·B·C 슬롯. */ slot,
  /** now: 서버 현재 시각(밀리초). */ now = Date.now(),
) {
  updateSkillCooldowns(caster,now);
  return (caster.status['skill'+slot+'CooldownRemaining']??0)*1000;
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
    /** sourceStatus: 시전 순간의 소속을 보존해 공격자 퇴장 후에도 적대를 판정한다. */ sourceStatus:{objectType:caster.status.objectType,instanceId:caster.status.instanceId},
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
  updateSkillCooldowns(caster,now);
  // 구르기는 위치 스냅샷으로 전달하며 공격 사각형 효과를 생성하지 않는다.
  return {code:skill.code,kind:'roll'};
}

/** 서버 종료 시각을 기준으로 공통 스테이터스의 슬롯별 잔여 쿨타임(초)을 갱신한다. */
export function updateSkillCooldowns(
  /** object: 개체별 기술 재사용 종료 시각과 공통 스테이터스. */ object,
  /** now: 서버 현재 시각(밀리초). */ now = Date.now(),
) {
  for(const /** slot: 남은 대기를 갱신할 기술 슬롯. */ slot of ['A','B','C']) {
    if(object.skillCooldowns?.[slot]!==undefined) object.status['skill'+slot+'CooldownRemaining']=Math.max(0,object.skillCooldowns[slot]-now)/1000;
  }
}

/** 공통 스테이터스의 기술 코드를 서버 정의의 실제 표시 이름으로 변환한다. */
export function getSkillSlotNames(
  /** status: 기술 코드가 저장된 공통 스테이터스. */ status,
) {
  return Object.fromEntries(['A','B','C'].map(
    /** 각 슬롯에 할당된 이름 또는 미지정을 반환한다. */
    (/** slot: 이름을 조회할 기술 슬롯. */ slot)=>[slot,skills[status['skill'+slot]]?.name??'미지정']));
}

/** 서버에서 무기 속성에 따른 기술 사용 가능 여부를 확인한다. */
function allowsWeapon(/** skill: 기술 정의. */ skill,/** status: 장착 무기의 속성 정보를 가진 상태. */ status){
  return !skill.allowedAttributeCodes?.length||skill.allowedAttributeCodes.includes(status.weaponAttributeCode);
}

/** 덱 카드 한 장과 포인트를 사용해 보유 레벨을 올리고 구매 효과를 적용한다. */
export function buySkill(/** player: 구매 요청을 보낸 생존 플레이어. */ player,/** code: 구매할 카드 코드. */ code,/** now: 서버 시각(ms). */ now){
  const /** status: 구매에 사용하는 서버 플레이어 상태. */ status=player.status;
  const /** skill: 구매할 기술의 서버 정의. */ skill=Object.hasOwn(skills,code)?skills[code]:null;
  if(status.objectType!=='player'||status.state!==LifeState.ALIVE||!skill)return false;
  const /** index: 소모할 덱 카드의 위치. */ index=status.skillDeckCode.indexOf(code);
  if(index<0||status.skillPoints<skill.skillPoints||!allowsWeapon(skill,status))return false;
  status.skillPoints-=skill.skillPoints;
  status.skillDeckCode.splice(index,1);
  status.ownedSkills[code]=(status.ownedSkills[code]??0)+1;
  if(code==='BAS0007')status.bonusAttack+=(status.level+5)*2;
  if(code==='BAS0008'){
    /** playerRevealUntil: 지도에서 플레이어 표식을 숨길 서버 시각(ms). */ status.playerRevealUntil=now+20000;
  }
  if(skill.typeCode!=='P')equipSkill(player,code);
  return true;
}

/** 구매한 버튼 기술 또는 시작 기본 기술을 지정된 타입 슬롯에 배정한다. */
export function equipSkill(/** player: 장착할 플레이어. */ player,/** code: 장착할 스킬코드. */ code){
  const /** skill: 요청한 기술의 서버 정의. */ skill=Object.hasOwn(skills,code)?skills[code]:null;
  if(!skill||skill.typeCode==='P'||!allowsWeapon(skill,player.status))return false;
  if(code!=='BAS0001'&&code!=='BAS0002'&&!Object.hasOwn(player.status.ownedSkills,code))return false;
  player.status['skill'+skill.typeCode]=code;
  return true;
}
