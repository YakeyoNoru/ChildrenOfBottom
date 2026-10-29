# 공통 스테이터스

서버 모듈 `game/status.js`가 플레이어·NPC·적의 스테이터스를 생성하고 관리합니다. `createStatus`는 데이터만, `createWorldObject`는 스테이터스와 위치를 가진 개체를 만듭니다. 클라이언트 요청으로 스테이터스를 덮어쓸 수 없습니다.

| 설계 항목 | 필드 | 기본값 / 의미 |
|---|---|---|
| 오브젝트 구분 | `objectType` | 생성 시 `player`, `npc`, `enemy` 지정 |
| 분류코드 | `classificationCode` | 생성 시 필수. 플레이어ID / NPC코드 / 적 종류 코드 |
| 개체ID | `instanceId` | 서버 UUID. 각 개체별 유일 |
| 레벨 | `level` | 1 |
| 최대체력 | `maxHealth` | 10 |
| 현재체력 | `currentHealth` | 10 |
| 최대스킬자원 | `maxSkillResource` | 0 |
| 현재스킬자원 | `currentSkillResource` | 0 |
| 공격력 | `attack` | 1 |
| 방어력 | `defense` | 0 |
| 체력회복속도 | `healthRegen` | 1 / 초 |
| 스킬자원회복속도 | `skillResourceRegen` | 1 / 초 |
| 이동속도 | `moveSpeed` | 2 |
| 은폐상태 | `concealed` | false = N, true = Y |
| 기절상태 | `stunned` | false = N, true = Y |
| 추가체력 | `bonusHealth` | 0. 최대체력에 합산 |
| 추가공격력 | `bonusAttack` | 0 |
| 추가방어력 | `bonusDefense` | 0 |
| 추가체력회복속도 | `bonusHealthRegen` | 0 |
| 추가이동속도 | `bonusMoveSpeed` | 0 |
| 추가스킬자원 | `bonusSkillResource` | 0. 최대스킬자원에 합산 |
| 추가스킬자원회복속도 | `bonusSkillResourceRegen` | 0 |
| 현재상태 | `state` | `alive` = 생존, `dead` = 사망. 기본 생존 |
| 현상금점수 | `bountyPoints` | 1 |
| 가장가까운적ID | `nearestEnemyId` | 대상 개체ID, 없으면 null |
| 가장가까운오브젝트ID | `nearestObjectId` | 대상 개체ID, 없으면 null |

플레이어에게만 아래 필드가 추가됩니다. NPC/적에는 필드 자체를 생성하지 않습니다.

| 설계 항목 | 필드 | 기본값 |
|---|---|---|
| 스킬덱 코드 | `skillDeckCode` | 빈 문자열 |
| 사용가능스킬목록 | `availableSkills` | 빈 배열. 스킬 코드 문자열 목록 |

현재 로그인 계정/영구 캐릭터 시스템은 없으므로 플레이어 분류코드는 연결 시 발급한 플레이어ID입니다. 플레이어 개체ID도 이 ID를 사용하며, NPC·적의 종류코드와 개체ID는 별개입니다. 같은 종류의 몬스터라도 UUID는 다릅니다.

## 수치 적용 규칙

- 기본 수치를 유지하고 `effectiveStats(status)`가 기본값 + 추가값의 최종 수치를 계산합니다. 최종 수치는 0 미만이 되지 않습니다. 스냅샷의 `status.effective`에도 최종 수치를 제공합니다.
- 추가체력/추가스킬자원은 최대치만 늘립니다. 현재치를 즉시 채우지는 않습니다. 최대치 감소 시 현재치가 최대치를 넘으면 잘라냅니다.
- 생존 중 체력/자원은 초당 회복속도에 따라 회복하고 최대치에서 멈춥니다. 최대스킬자원 0이면 현재자원도 0입니다.
- 체력 0이면 사망 처리합니다. 사망자는 자연 회복으로 부활하지 않으며 이동/행동을 수행하지 않습니다. 기절 중에는 이동/행동을 막지만 자연 회복은 유지합니다.
- 이동속도 1당 기존 필드 좌표 110/초입니다. 기본속도 2는 이전 화면의 220/초와 같습니다. 이동속도 추가값도 서버 이동에 적용됩니다.
- 최근접 대상은 같은 방의 살아 있는 개체를 대상으로 거리의 제곱을 비교합니다. 자신/사망자는 제외하고, 동거리에서는 순회순으로 선택합니다. 대상 이탈 시 참조를 갱신하고 없으면 null로 지웁니다.
- 적대 규칙이 아직 지정되지 않아 기본값은 **플레이어·NPC 대 적**입니다. 플레이어끼리는 최근접 오브젝트에는 포함되지만 적 대상에는 포함되지 않습니다. `updateNearestObjects`의 적대 판정 함수를 교체해 향후 PvP/진영 규칙을 적용할 수 있습니다.
- 은폐, 공격력, 방어력, 현상금 및 스킬목록 데이터는 정의하되 아직 전투/스킬/은폐 판정 시스템을 새로 만들지는 않습니다.

## 오브젝트 표시

모든 표시 개체에 동일한 `drawObjectHud`를 사용합니다.

- 위쪽 이름 아래에 체력바, 체력바 왼쪽에 `Lv.현재레벨`을 표시합니다.
- 내 플레이어 체력바는 청록색, 다른 플레이어와 적은 붉은색, NPC는 녹색입니다. 내 색상은 미지정 항목에 대한 임시 기본값입니다.
- 체력바 길이는 현재체력 / 최종 최대체력 비율입니다. 최대체력 0에서도 계산 오류 없이 빈 바로 표시합니다.
- 개체 아래에 현재 / 최종 최대스킬자원을 숫자로 표시합니다. 소수는 한 자리까지 표시하며, 최종 최대자원이 0이면 숨깁니다.
- NPC/적 생성은 `createWorldObject`로 지원하며 서버의 `room.objects` Map에 개체ID로 등록하면 스냅샷·회복·최근접 검색·화면 표시가 적용됩니다. 이번 작업에서 임의의 NPC/몬스터를 게임에 자동 배치하지는 않습니다.

```js
import { createWorldObject } from './game/status.js';
const npc = createWorldObject({
  objectType: 'npc', classificationCode: 'NPC001', name: '주민',
  x: 300, y: 100, level: 2, maxSkillResource: 5, currentSkillResource: 3,
});
room.objects.set(npc.id, npc);
```
