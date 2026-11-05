import { /** randomUUID: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ randomUUID } from 'node:crypto';

export const /** ObjectType: 플레이어·NPC·적 유닛과 사물의 개체 분류 상수. */ ObjectType = Object.freeze({ PLAYER: 'player', NPC: 'npc', ENEMY: 'enemy', /** PROP: 유닛과 구별되는 공격 가능·상호작용 사물 분류. */ PROP:'prop' });
export const /** LifeState: 생존·사망 상태 상수. */ LifeState = Object.freeze({ ALIVE: 'alive', DEAD: 'dead' });

const /** defaults: 공통 스테이터스의 기본 수치. */ defaults = Object.freeze({
  /** skillACooldownRemaining: A 슬롯의 남은 재사용 대기(초). */ skillACooldownRemaining:0,
  /** skillBCooldownRemaining: B 슬롯의 남은 재사용 대기(초). */ skillBCooldownRemaining:0,
  /** skillCCooldownRemaining: C 슬롯의 남은 재사용 대기(초). */ skillCCooldownRemaining:0,
  /** level: 개체 레벨(1 이상 정수). */ level: 1, /** hitboxDiameter: 중심 기준 원형 피격 히트박스 지름(월드 좌표). 표시 지름 36과 별개. */ hitboxDiameter: 24,
  /** maxHealth: 기본 최대체력. */ maxHealth: 10, /** currentHealth: 현재체력. 최종 최대체력 안으로 제한하며 0이면 사망. */ currentHealth: 10,
  /** maxSkillResource: 기본 최대 스킬자원. 최종 최대치 0이면 UI를 숨김. */ maxSkillResource: 0, /** currentSkillResource: 현재 스킬자원. */ currentSkillResource: 0,
  /** attack: 기본공격력. */ attack: 1, /** defense: 기본방어력. BAS0001 피해 계산에서는 차감하지 않음. */ defense: 0,
  /** healthRegen: 비전투 회복 1회당 기본 체력 회복량. */ healthRegen: 0, /** skillResourceRegen: 초당 기본 스킬자원 회복량. */ skillResourceRegen: 1, /** moveSpeed: 기본 이동속도. 월드 이동량에는 110 배율 적용. */ moveSpeed: 2,
  /** bonusHealth: 기본 최대체력에 합산할 추가체력. */ bonusHealth: 0, /** bonusAttack: 기본공격력에 합산할 추가공격력. */ bonusAttack: 0, /** bonusDefense: 기본방어력에 합산할 추가방어력. */ bonusDefense: 0,
  /** bonusHealthRegen: 비전투 회복 1회당 체력 회복량에 합산할 추가 수치. */ bonusHealthRegen: 0, /** bonusMoveSpeed: 기본 이동속도에 합산할 추가 수치. */ bonusMoveSpeed: 0,
  /** bonusSkillResource: 기본 최대 스킬자원에 합산할 추가 수치. */ bonusSkillResource: 0, /** bonusSkillResourceRegen: 초당 스킬자원 회복량에 합산할 추가 수치. */ bonusSkillResourceRegen: 0,
  /** bountyPoints: 해당 개체의 보상 포인트. 실제 보상 지급 규칙은 미구현. */ bountyPoints: 1,
});

/** 생성 요청의 목록을 깊게 복사하여 다른 개체나 원본 자료와 공유하지 않게 한다. */
function copyStatusList(/** value: 복사할 선택적 목록. */ value,/** field: 검증 오류에 표시할 필드 이름. */ field) {
  if(value===undefined)return [];
  if(!Array.isArray(value))throw new TypeError(`Invalid ${field}`);
  return structuredClone(value);
}

/** 플레이어·NPC·적·사물이 공유하는 서버 소유 데이터. 불리언 false는 N을 뜻한다. */
export /** createStatus: 모든 개체가 공유하는 수치·기술 슬롯·상태를 검증해 생성한다. */ function createStatus(/** objectType: 생성하거나 검사할 개체 분류; classificationCode: 개체 종류 또는 계정의 분류 코드; instanceId: 월드 개체의 고유 인스턴스 식별자; values: 기본 스테이터스를 재정의할 전달값. */ { objectType, classificationCode, instanceId = randomUUID(), ...values }) {
  if (!Object.values(ObjectType).includes(objectType)) throw new TypeError('Invalid objectType');
  if (typeof classificationCode !== 'string' || !classificationCode.trim()) throw new TypeError('classificationCode is required');
  if (typeof instanceId !== 'string' || !instanceId) throw new TypeError('instanceId is required');
  const /** status: 개체 상태 또는 응답 상태. */ status = { objectType, classificationCode, instanceId };
  for (const /** field: 현재 처리하는 스테이터스 필드 이름; fallback: 별도 지정이 없을 때 사용할 기본값. */ [field, fallback] of Object.entries(defaults)) {
    const /** value: 검사하거나 변환할 현재 값. */ value = values[field] ?? fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || (!field.startsWith('bonus') && value < 0)) throw new TypeError(`Invalid ${field}`);
    status[field] = value;
  }
  if (!Number.isInteger(status.level) || status.level < 1) throw new TypeError('level must be an integer >= 1');
  for (const /** field: 현재 처리하는 스테이터스 필드 이름. */ field of ['concealed', 'stunned']) {
    status[field] = values[field] ?? false;
    if (typeof status[field] !== 'boolean') throw new TypeError(`Invalid ${field}`);
  }
  status.state = values.state ?? LifeState.ALIVE;
  if (!Object.values(LifeState).includes(status.state)) throw new TypeError('Invalid state');
  for (const /** slot: 기술을 저장하거나 시전할 A·B·C·P 슬롯. */ slot of ['A','B','C','P']) {
    status['skill'+slot] = values['skill'+slot] ?? (slot === 'A' ? 'BAS0001' : slot === 'B' ? 'BAS0002' : '');
    if (typeof status['skill'+slot] !== 'string') throw new TypeError('Invalid skill slot');
  }
  status.nearestEnemyId = null;
  status.nearestObjectId = null;
  if (objectType === ObjectType.PLAYER) {
    status.skillDeckCode = values.skillDeckCode ?? '';
    status.availableSkills = [...(values.availableSkills ?? [])];
    if (typeof status.skillDeckCode !== 'string' || !Array.isArray(values.availableSkills ?? []) || !status.availableSkills.every(/** code: 개체·기술·방 또는 오류를 식별하는 코드. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ code => typeof code === 'string')) throw new TypeError('Invalid player skills');
  }
  // 상태이상은 향후 잔여시간·중첩 계산에 사용할 개체별 독립 목록이다.
  /** status.statusEffects: 버프·디버프 상태 자료 목록. 현재는 저장만 하며 효과 계산은 별도 구현한다. */ status.statusEffects=copyStatusList(values.statusEffects,'statusEffects');
  if(objectType===ObjectType.PLAYER) {
    for(const /** field: 플레이어 전용 진행·탐색 수치 이름; fallback: 해당 수치의 기본값. */ [field,fallback] of Object.entries({
      /** requiredExperience: 다음 레벨에 필요한 경험치. */ requiredExperience:50,
      /** currentExperience: 현재 누적 경험치. */ currentExperience:0,
      /** skillPoints: 사용 가능한 스킬 포인트. */ skillPoints:0,
      /** competitionPoints: 경쟁 포인트. */ competitionPoints:0,
      /** tracePoints: 기본 흔적 포인트. */ tracePoints:20,
      /** bonusTracePoints: 기본 흔적에 합산할 추가 포인트. */ bonusTracePoints:0,
      /** trackingPoints: 기본 추적 포인트. */ trackingPoints:20,
      /** bonusTrackingPoints: 기본 추적에 합산할 추가 포인트. */ bonusTrackingPoints:0,
    })) {
      const /** value: 서버 생성 시 지정한 수치 또는 기본값. */ value=values[field]??fallback;
      if(typeof value!=='number'||!Number.isFinite(value)||(!field.startsWith('bonus')&&value<0))throw new TypeError(`Invalid ${field}`);
      status[field]=value;
    }
  }
  if(objectType===ObjectType.ENEMY) {
    /** status.spawnPosition: 최초 생성 월드 좌표. 이동·추격으로 변경하지 않는다. */ status.spawnPosition=structuredClone(values.spawnPosition??{x:0,y:0});
    if(!status.spawnPosition||![status.spawnPosition.x,status.spawnPosition.y].every(Number.isFinite))throw new TypeError('Invalid spawnPosition');
    /** status.awarenessState: 일반·전투·복귀 인식상태. 생존 상태와 별개다. */ status.awarenessState=values.awarenessState??'normal';
    if(!['normal','combat','returning'].includes(status.awarenessState))throw new TypeError('Invalid awarenessState');
    /** status.attackTargetId: 마지막 공격자의 개체ID 또는 대상 없음(null). */ status.attackTargetId=values.attackTargetId??null;
    if(status.attackTargetId!==null&&(typeof status.attackTargetId!=='string'||!status.attackTargetId))throw new TypeError('Invalid attackTargetId');
    /** status.experience: 공통 기술로 처치한 플레이어에게 지급할 경험치. */ status.experience=values.experience??20;
    if(typeof status.experience!=='number'||!Number.isFinite(status.experience)||status.experience<0)throw new TypeError('Invalid experience');
    /** status.rewards: 아이템 등 보상 자료 목록. 지급 로직은 별도 구현한다. */ status.rewards=copyStatusList(values.rewards,'rewards');
  }
  /** lastDamageAt: 마지막 실제 체력 피해의 서버 시각(ms). 피격 전에는 null. */ status.lastDamageAt=null;
  /** healthRegenNextAt: 다음 자연 체력 회복 예정 서버 시각(ms). 첫 갱신 시 초기화한다. */ status.healthRegenNextAt=null;
  normalizeVitals(status);
  return status;
}

/** 경험치를 지급하고 남은 경험치로 가능한 모든 레벨업과 추가 능력치를 서버에서 반영한다. */
export function gainExperience(/** status: 경험치 진행 필드를 가진 플레이어 스테이터스. */ status,/** amount: 이번에 획득한 0 이상 유한 경험치. */ amount) {
  if(status.objectType!==ObjectType.PLAYER)throw new TypeError('Experience progression requires player status');
  if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0)throw new TypeError('Invalid experience amount');
  if(!Number.isFinite(status.requiredExperience)||status.requiredExperience<=0||!Number.isFinite(status.currentExperience)||status.currentExperience<0)throw new TypeError('Invalid experience progress');
  let /** experience: 아직 레벨업 비용으로 소비하지 않은 합산 경험치. */ experience=status.currentExperience+amount;
  if(!Number.isFinite(experience))throw new TypeError('Experience overflow');
  let /** level: 계산 중인 레벨. */ level=status.level;
  let /** required: 계산 중인 다음 레벨 필요경험치. */ required=status.requiredExperience;
  let /** levelsGained: 이번 지급으로 상승한 레벨 수. */ levelsGained=0;
  while(experience>=required) {
    experience-=required;
    level+=1;
    required+=level*20;
    levelsGained+=1;
    status.bonusHealth+=10;
    status.bonusAttack+=2;
    status.bonusDefense+=1;
    status.skillPoints+=2;
    if(level%2===0)status.maxSkillResource+=1;
    // 각 레벨의 최대체력 증가를 먼저 적용한 뒤 해당 레벨의 회복량을 계산한다.
    status.currentHealth=Math.min(effectiveStats(status).maxHealth,status.currentHealth+10+level*2);
    normalizeVitals(status);
  }
  status.currentExperience=experience;
  status.level=level;
  status.requiredExperience=required;
  return levelsGained;
}

/** 기본값은 유지하고 추가 수치를 최종 능력치에 합산한다. */
export /** effectiveStats: 기본 수치에 추가 수치를 합산하고 음수를 방지한 최종 능력치를 계산한다. */ function effectiveStats(/** s: 현재 처리하는 공통 스테이터스. */ s) {
  return {
    maxHealth: Math.max(0, s.maxHealth + s.bonusHealth),
    maxSkillResource: Math.max(0, s.maxSkillResource + s.bonusSkillResource),
    attack: Math.max(0, s.attack + s.bonusAttack),
    defense: Math.max(0, s.defense + s.bonusDefense),
    healthRegen: Math.max(0, s.healthRegen + s.bonusHealthRegen),
    skillResourceRegen: Math.max(0, s.skillResourceRegen + s.bonusSkillResourceRegen),
    moveSpeed: Math.max(0, s.moveSpeed + s.bonusMoveSpeed),
  };
}
export /** normalizeVitals: 체력·자원을 최종 최대치 안으로 제한하고 사망 상태를 정규화한다. */ function normalizeVitals(/** s: 현재 처리하는 공통 스테이터스. */ s) {
  const /** effective: 추가 수치를 합산한 최종 스테이터스. */ effective = effectiveStats(s);
  s.currentHealth = Math.max(0, Math.min(s.currentHealth, effective.maxHealth));
  s.currentSkillResource = Math.max(0, Math.min(s.currentSkillResource, effective.maxSkillResource));
  if (s.currentHealth === 0) s.state = LifeState.DEAD;
  if (s.state === LifeState.DEAD) s.currentHealth = 0;
  return effective;
}
export /** regenerate: 생존 유닛의 체력은 피격 후 5초부터 3초마다, 스킬자원은 경과 시간에 따라 회복한다. */ function regenerate(/** s: 현재 처리하는 공통 스테이터스. */ s, /** seconds: 회복량 계산에 사용할 경과 시간(초). */ seconds, /** now: 회복 시점을 판정할 서버 시각(ms). */ now=Date.now()) {
  if (!Number.isFinite(now)) throw new TypeError('Invalid regeneration time');
  if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError('Invalid elapsed time');
  const /** effective: 추가 수치를 합산한 최종 스테이터스. */ effective = normalizeVitals(s);
  for(const /** slot: 경과 시간을 차감할 기술 슬롯. */ slot of ['A','B','C']) {
    s['skill'+slot+'CooldownRemaining']=Math.max(0,(s['skill'+slot+'CooldownRemaining']??0)-seconds);
  }
  if (s.state === LifeState.DEAD) return;
  if(!Number.isFinite(s.healthRegenNextAt))s.healthRegenNextAt=now+5000;
  if(now>=s.healthRegenNextAt){
    const /** pulses: 3초 박자에서 이번 갱신까지 도달한 회복 횟수. */ pulses=1+Math.floor((now-s.healthRegenNextAt)/3000);
    s.currentHealth=Math.min(effective.maxHealth,s.currentHealth+effective.healthRegen*pulses);
    s.healthRegenNextAt+=pulses*3000;
  }
  s.currentSkillResource = Math.min(effective.maxSkillResource, s.currentSkillResource + effective.skillResourceRegen * seconds);
}

/** 자신·NPC는 제외하고 플레이어·몬스터 유닛은 적대한다. 사물은 모든 플레이어만 공격한다. */
export /** areEnemies: 자신·NPC를 제외한 다른 플레이어와 몬스터 유닛을 적대로 판정한다. */ function areEnemies(/** a: 적대 관계를 검사할 기준 스테이터스. */ a, /** b: 적대 관계를 검사할 비교 스테이터스. */ b) {
  if(a===b||(a.instanceId&&a.instanceId===b.instanceId))return false;
  if(b.objectType===ObjectType.PROP)return a.objectType===ObjectType.PLAYER;
  return b.objectType===ObjectType.PLAYER||b.objectType===ObjectType.ENEMY;
}
export const /** TargetPriority: 허용하는 공격 우선대상 선택 방식. */ TargetPriority = Object.freeze(['nearest', 'lowestHealth', 'lowestHealthRatio']);
export /** updateNearestObjects: 생존 개체의 최근접 개체와 설정 우선순위에 맞는 적 ID를 갱신한다. */ function updateNearestObjects(/** objects: 처리할 월드 개체 목록. */ objects, /** hostile: 두 개체의 적대 여부를 판단하는 함수. */ hostile = areEnemies) {
  for (const /** object: 현재 처리하는 월드 개체. */ object of objects) {
    const /** s: 현재 처리하는 공통 스테이터스. */ s = object.status;
    s.nearestEnemyId = null; s.nearestObjectId = null;
    if (s.state === LifeState.DEAD) continue;
    let /** closest: 현재까지 찾은 최근접 개체의 제곱 거리. */ closest = Infinity, /** enemy: 현재 선택한 적까지의 제곱 거리. */ enemy = Infinity, /** bestScore: 현재 선택된 적의 우선순위 점수. */ bestScore = Infinity;
    const /** priority: 본 개체에 설정된 공격 대상 선택 방식. */ priority = object.targetPriority ?? 'nearest';
    const /** rangeSquared: 탐색 반경을 제곱한 거리 제한. */ rangeSquared = (object.targetRange ?? Infinity) ** 2;
    for (const /** candidate: 현재 비교하는 대상 후보. */ candidate of objects) {
      if (candidate.id === object.id || candidate.status.state === LifeState.DEAD) continue;
      const /** distance: 기준 개체와 후보 사이의 제곱 거리. */ distance = (candidate.x - object.x) ** 2 + (candidate.y - object.y) ** 2;
      if (distance < closest) { closest = distance; s.nearestObjectId = candidate.status.instanceId; }
      if (!hostile(s, candidate.status) || distance > rangeSquared) continue;
      const /** maxHealth: 추가체력을 합산한 최대체력. */ maxHealth = effectiveStats(candidate.status).maxHealth;
      const /** score: 현재 후보의 거리·체력·체력비율 점수. */ score = priority === 'lowestHealth' ? candidate.status.currentHealth : priority === 'lowestHealthRatio' ? (maxHealth > 0 ? candidate.status.currentHealth / maxHealth : Infinity) : distance;
      if (score < bestScore || (score === bestScore && distance < enemy)) { bestScore = score; enemy = distance; s.nearestEnemyId = candidate.status.instanceId; }
    }
  }
}

/** NPC·적 생성에 쓰는 공통 생성기. 플레이어 연결에는 서버가 발급한 ID를 사용한다. */
export /** createWorldObject: 공통 스테이터스와 위치를 가진 NPC·적·검증용 플레이어 개체를 만든다. */ function createWorldObject(/** objectType: 생성하거나 검사할 개체 분류; classificationCode: 개체 종류 또는 계정의 분류 코드; instanceId: 월드 개체의 고유 인스턴스 식별자; name: 생성할 월드 개체의 표시 이름; x: 가로 좌표·이동 입력 또는 반복 비교 항목; y: 세로 좌표 또는 이동 입력; stats: 개체 생성 시 전달할 스테이터스 재정의 값. */ { objectType, classificationCode, instanceId, name = '', x = 0, y = 0, ...stats }) {
  if (![x,y].every(Number.isFinite)) throw new TypeError('Invalid position');
  const /** status: 개체 상태 또는 응답 상태. */ status = createStatus({ objectType, classificationCode, instanceId, ...(objectType===ObjectType.ENEMY?{spawnPosition:{x,y}}:{}), ...stats });
  return { id: status.instanceId, name, x, y, action: null, facing: -Math.PI / 2, status };
}
