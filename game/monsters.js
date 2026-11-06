import { /** createWorldObject: 공통 수치와 고유 개체ID를 생성하는 서버 함수. */ createWorldObject, /** ObjectType: 몬스터의 적 유닛 분류를 지정하는 상수. */ ObjectType } from './status.js';

/** 종류코드와 별개인 프리셋 이름으로 조회하는 몬스터 기본 정의. 지정하지 않은 수치는 공통 기본값을 따른다. */
export const MonsterPresets = Object.freeze({
  /** 몬스터A01: TEST001 종류의 레벨 1 프리셋. */
  몬스터A01: Object.freeze({
    /** classificationCode: 몬스터 종류코드. 프리셋 식별자로 사용하지 않는다. */ classificationCode: 'TEST001',
    /** level: 생성 시 레벨. */ level: 1,
    /** hitboxDiameter: 원형 피격 판정 지름(월드 좌표 단위). */ hitboxDiameter: 26,
    /** maxHealth: 생성 시 기본 최대체력. */ maxHealth: 20,
    /** attack: 생성 시 기본공격력. */ attack: 3,
    /** experience: 처치한 플레이어에게 공통 피해 흐름에서 지급할 경험치. */ experience: 20,
  }),
  /** 몬스터A02: TEST001 종류의 레벨 5 프리셋. */
  몬스터A02: Object.freeze({
    /** classificationCode: A01과 공유하는 몬스터 종류코드. */ classificationCode: 'TEST001',
    /** level: 생성 시 레벨. */ level: 5,
    /** hitboxDiameter: 원형 피격 판정 지름(월드 좌표 단위). */ hitboxDiameter: 26,
    /** maxHealth: 생성 시 기본 최대체력. */ maxHealth: 50,
    /** attack: 생성 시 기본공격력. */ attack: 10,
    /** experience: 처치한 플레이어에게 공통 피해 흐름에서 지급할 경험치. */ experience: 50,
  }),
  /** 몬스터C01: TEST003 보스 전용 프리셋. */
  몬스터C01:Object.freeze({
    /** classificationCode: 보스 전용 행동 분류. */ classificationCode:'TEST003',
    /** level: 보스 레벨. */ level:8,
    /** hitboxDiameter: 보스 원형 판정 지름. */ hitboxDiameter:30,
    /** maxHealth: 보스 최대체력. */ maxHealth:250,
    /** attack: 보스 기본 공격력. */ attack:30,
    /** defense: 보스 방어력. */ defense:2,
    /** moveSpeed: 보스 기본 이동속도. */ moveSpeed:2.5,
    /** skillResourceRegen: 보스의 기본 스킬자원 회복량. */ skillResourceRegen:0,
    /** bountyPoints: 별도 현상금 보상 미지정. */ bountyPoints:0,
    /** experience: 보스 처치 경험치. */ experience:400,
  }),
});

/** 프리셋의 확정 능력치와 최대체력으로 독립된 몬스터 유닛을 생성한다. 서버 배치·행동은 monster-ai.js에서 연결한다. */
export function createMonster(
  /** presetId: 몬스터A01·몬스터A02·몬스터C01 프리셋 식별자. */ presetId,
  /** options: 서버에서 지정할 위치·개체ID·표시 이름. */ options = {},
) {
  if (!Object.hasOwn(MonsterPresets, presetId)) throw new TypeError('Unknown monster preset');
  const /** preset: 변경 불가능한 선택 프리셋의 능력치 정의. */ preset = MonsterPresets[presetId];
  const /** monster: 공통 기본값과 프리셋 수치를 적용한 독립 몬스터 개체. */ monster = createWorldObject({
    objectType: ObjectType.ENEMY,
    ...preset,
    currentHealth: preset.maxHealth,
    instanceId: options.instanceId,
    name: options.name ?? presetId,
    x: options.x ?? 0,
    y: options.y ?? 0,
  });
  /** monster.presetId: 같은 종류 안에서 생성 원본 프리셋을 구분하는 식별자. */ monster.presetId = presetId;
  /** rewardGranted: 처치 경험치가 중복 지급되지 않도록 기록한다. */ monster.rewardGranted=false;
  return monster;
}
