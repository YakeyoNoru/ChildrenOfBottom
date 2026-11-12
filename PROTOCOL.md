# Unity 연동용 프로토콜 v1

Unity는 아직 연결하지 않았습니다. 추후 RFC 6455 표준 WebSocket 클라이언트로 `/ws`에 연결하고 UTF-8 텍스트 JSON을 교환하면 됩니다. Socket.IO 전용 클라이언트를 사용하지 마세요. 로컬 `ws://localhost:3000/ws`, 운영 `wss://도메인/ws`. 네이티브 클라이언트는 ping 프레임에 pong을 응답해야 합니다.

## 메시지 규약

모든 요청은 `v: 1`, `type`을 포함합니다. `requestId`는 선택 문자열(64자 이하)이지만 응답 추적을 위해 고유 값을 권장합니다. 서버는 요청자에게 성공 시 `ack`, 실패 시 `error`를 보냅니다. 상태 이벤트가 ack보다 먼저 전송됩니다. 재전송 중복 제거 기능은 없으므로 응답이 불명확하면 연결을 종료하고 새로 접속하세요.

```json
{"v":1,"type":"room.create","requestId":"1","name":"생존자"}
```

| 요청 type | 필드 | 조건 |
|---|---|---|
| `room.create` | `name`: string | 현재 방에 없어야 함 |
| `room.join` | `name`: string, `code`: string | 코드 6자리, 대소문자/앞뒤 공백 정규화, lobby 및 정원 미만 |
| `room.ready` | `ready`: boolean | lobby, 일반 참가자만 |
| `room.start` | 없음 | lobby, 방장, 다른 참가자 전원 준비 |
| `room.leave` | 없음 | 현재 방 참여자 |

코드는 `[A-F0-9]{6}`이고 이름은 trim 후 1~20 UTF-16 코드 단위, 제어문자 불가입니다. 참가자 ID와 방 소속은 연결에 묶여 서버가 결정합니다. 요청의 playerId/hostId/code(참가 요청 제외)로 다른 사람을 제어할 수 없습니다.

## 서버 이벤트

```json
{"v":1,"type":"welcome","playerId":"server-issued-uuid"}
```

연결 직후 임시 본인 ID를 저장합니다. 기존 게임의 복귀 권한이 있으면 아래 `session.resume`으로 기존 ID를 복구한 후 게임 상태를 적용합니다.

## 진행 중 게임 재접속

게임 시작 시 본인 연결에만 `session.ready {token, graceMs:120000}`를 보냅니다. `token`은 64자리 난수 문자열이며 공개 방 상태에 포함하지 않습니다. 브라우저는 접속 주소·웹/APK 모드·계정별 저장 공간에 보관하고 URL이나 다른 참가자에게 전달하지 않습니다.

새 연결에서 `welcome`을 받은 후 `{v:1,type:"session.resume",token}`을 보내면 서버는 토큰·기존 접속 모드·앱 계정·유예시간을 확인합니다. 성공 시 `session.resumed {playerId}` 뒤에 지도·아이템을 포함한 `room.state`를 보냅니다. 본인 ID를 먼저 교체하고 이전 예측·입력 기록을 비웁니다. 서버도 미처리 입력·기술·구르기를 폐기하며 새 이동 순번은 1부터 시작합니다. 실패 시 `session.rejected {message}`를 보내며, 이 요청은 별도 ack 없이 성공·실패 이벤트로 응답합니다. 실패한 브라우저는 토큰을 삭제하고 첫 화면으로 돌아갑니다.

서버가 연결 종료를 확인한 시점부터 정확히 120000ms 동안 캐릭터와 방을 보관합니다. 캐릭터는 제자리에서 피해·회복·사망 판정을 계속 받습니다. 방장이나 전원이 끊겨도 즉시 방을 삭제하지 않습니다. 유예시간 만료는 명시적 퇴장과 같은 제거·방장 승계 절차를 적용합니다. 연결 중인 기존 소켓이 남아 있으면 새 연결이 소유권을 인계하고 기존 소켓은 4001 `Session resumed elsewhere`로 닫습니다. 기존 소켓은 자동 복귀를 중단해야 하며, 늦게 도착한 종료·입력 이벤트가 새 연결의 캐릭터를 변경하지 않습니다.

끊긴 동안 사망·방 시간 종료가 확정되면 `session.resumed` 뒤에 `game.result`를 보내며 게임으로 부활하지 않습니다. 직접 `room.leave` 또는 `game.result.leave`를 처리하면 복귀 권한을 폐기합니다. 결과 화면에서도 다시 끊기면 결과 복귀 유예시간은 2분입니다. 대기실은 기존 퇴장 동작을 유지합니다. 서버 재시작 후에는 메모리 상태가 사라져 복귀가 거부됩니다.

## 방 상태 이벤트

```json
{"v":1,"type":"room.state","room":{"code":"A12BCD","hostId":"uuid-1","phase":"lobby","players":[{"id":"uuid-1","name":"방장","ready":false},{"id":"uuid-2","name":"참가자","ready":true}]}}
```

변경마다 방 전체에 완전한 스냅샷을 전송합니다. 기존 상태를 교체하세요. `players`는 입장순이며 최대 5개입니다. 방장 `ready`는 항상 false이고 준비 조건에서 제외됩니다. `phase`는 `lobby` 또는 `started`입니다. `started` 수신 시 게임 시작 화면으로 전환합니다. 이후 `game.state`로 위치 스냅샷을 받습니다.

```json
{"v":1,"type":"ack","requestId":"1","command":"room.create"}
{"v":1,"type":"error","requestId":"2","code":"NOT_READY","message":"모든 참가자가 준비해야 합니다."}
{"v":1,"type":"room.left"}
{"v":1,"type":"room.closed","message":"방이 해제되었습니다."}
```

`room.left`: 게임 중에는 방장을 포함해 본인만 퇴장. `room.closed`: 대기실 방장 퇴장 시에만 방 전체에 전송. 게임 중 방장 이탈은 남은 첫 플레이어에게 hostId를 넘기며 진행 상태를 유지합니다. 마지막 플레이어 이탈 시 방을 삭제합니다. 두 경우 로컬 방 상태를 지우고 메인으로 복귀합니다. 연결 자체가 끊어진 클라이언트는 이벤트를 받을 수 없으므로 로컬에서 방 상태를 지우고 연결 종료 안내를 표시합니다.

오류 코드는 `BAD_MESSAGE`, `UNKNOWN_TYPE`, `INVALID_NAME`, `INVALID_CODE`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `SERVER_FULL`, `ALREADY_IN_ROOM`, `NOT_IN_ROOM`, `FORBIDDEN`, `HOST_CANNOT_READY`, `INVALID_READY`, `NOT_READY`, `GAME_STARTED`, `RATE_LIMIT`입니다. 해석 불가 메시지와 속도 제한 오류는 requestId가 없을 수 있습니다. 오류는 일반적으로 연결을 종료하지 않습니다. 4 KiB 초과/유효하지 않은 WebSocket 프레임은 연결 종료 대상입니다.

HTTP `GET /health`는 `{"ok":true,"protocolVersion":1}`을 반환합니다. 방 API는 WebSocket으로만 제공합니다. 클라이언트는 서버 상태만 표시하고 시작 여부를 스스로 확정하지 않아야 합니다. 이후 생존 시스템 명령 추가 시 이 문서를 확장하고 호환성이 깨지면 버전을 올립니다.

## 게임 입력과 위치 (v1 추가 필드)

`room.state` 및 `game.state`의 `players`에 숫자 `x`, `y`와 `action`(null/A/B)이 추가됩니다. 시작 시 플레이어마다 다른 위치를 배정합니다. 서버는 게임 중 50ms 간격으로 `{"v":1,"type":"game.state","room":{...}}` 완전 스냅샷을 전송합니다. 클라이언트는 현재 방 코드와 같은 스냅샷만 적용하고 본인 ID의 위치를 카메라 중심으로 사용합니다.

```json
{"v":1,"type":"game.input","x":0.5,"y":-1,"action":"A"}
```

각 축은 유한한 숫자 -1~1, action은 생략/null/A/B입니다. 약 100ms마다 전송합니다. 이 연속 입력은 ack를 반환하지 않습니다. 오류는 error 이벤트로 전달합니다. 추가 오류: `GAME_NOT_STARTED`, `INVALID_INPUT`. 서버가 본인 연결에만 입력을 적용하고 대각선을 정규화합니다. 입력이 350ms 동안 없으면 멈춥니다. 메뉴/백그라운드/포커스 이탈 시 클라이언트는 0 입력을 보냅니다. 클라이언트 좌표·playerId는 신뢰하지 않습니다. 입력 포함 10초에 160요청 제한입니다.

## 공통 스테이터스와 월드 개체 (v1 추가 필드)

`room.state` / `game.state`의 room에 `objects` 배열을 추가합니다. `objects`는 플레이어를 포함한 모든 개체의 배열이고 `players`는 기존 로비 호환용 플레이어 배열입니다. 렌더링은 `objects`만 순회하여 중복으로 표시하지 않습니다. `players`와 `objects`의 플레이어 `id`는 같으며 자신의 카메라는 기존 `playerId`로 찾습니다.

개체 형식: `{id, name, x, y, action, status}`. 플레이어의 players 배열 항목에는 `ready`도 있습니다. `status.instanceId === id`이며 공통 스테이터스와 `effective`(추가값을 포함한 최종 수치)를 담습니다. 필드별 정의는 [STATUSES.md](STATUSES.md)를 참고하세요. `concealed`, `stunned`는 JSON boolean이고, `state`는 `alive`/`dead`입니다. 최근접 ID는 개체 ID 또는 null입니다. 모든 개체에 `ownedSkills` 딕셔너리(스킬코드→양의 정수 레벨, 기본 `{}`)가 있으며, 플레이어에게만 `skillDeckCode` 배열(드로우할 카드 코드 문자열 목록)이 있습니다. 이전 사용 가능 기술 목록 필드는 제거했습니다.

스테이터스는 서버 소유이며 game.input에 임의 status/공격력/이동속도/playerId를 넣어도 반영하지 않습니다. NPC/적 스폰은 현재 서버 내부 API만 제공하고 네트워크 생성 요청은 허용하지 않습니다. 이번 확장은 추가 필드이며 기존 메시지 명령 계약을 유지합니다.

## 접속 모드와 앱 계정

- `/ws?client=web`(또는 client 생략)은 항상 게스트입니다. 앱 세션 쿠키를 무시합니다.
- `/ws?client=app`은 HTTPOnly 앱 세션이 있어야 연결됩니다. 없으면 1008 `App login required`로 종료합니다. 앱 플레이어의 분류코드는 영구 게임 계정 ID, 개체ID는 기존 연결 UUID입니다. 이름/플레이어ID 요청값으로 계정 ID를 지정할 수 없습니다.
- `GET /api/session`은 웹에서는 항상 게스트이고, 앱 요청(`X-Client-Mode: app`)은 세션의 계정/설정/CSRF 값을 반환합니다. 모드 표식 자체가 인증은 아닙니다.
- `PUT /api/settings`, `POST /api/logout`은 앱 세션 + 같은 Origin + `X-CSRF-Token`을 요구합니다.
- OAuth 시작은 `/auth/start/google|kakao`, callback은 `/auth/callback/google|kakao`입니다. 앱 복귀용 일회성 코드/증명은 `POST /auth/app-session`에서 교환합니다. 상세 설정과 남은 실서비스 검증은 WEB-AND-APK.md에 있습니다.

## 플레이어 표시 방향

개체 스냅샷에 `facing`(라디안)을 추가합니다. 0은 오른쪽, π/2는 아래쪽, -π/2는 위쪽이며 기본은 위쪽입니다. 서버가 실제 이동량의 atan2로 갱신하므로 정지·기절·이동속도 0일 때 마지막 방향을 유지합니다. 클라이언트는 요청한 facing 값을 서버 상태에 덮어쓸 수 없습니다. 플레이어는 첫 꼭짓점이 facing 방향인 삼각형으로 표시하고 NPC/적은 기존 원형을 유지합니다.

### 공격 우선대상 옵션
`game.options` 메시지 `{v:1,type:"game.options",targetPriority:"nearest"|"lowestHealth"|"lowestHealthRatio"}`는 본인에게만 적용됩니다. 게임 중 대상 참조는 서버에서 100ms마다 갱신하며 `status.nearestEnemyId`로 전달합니다. 생존한 적대 개체만 대상이며 동률은 거리순, 완전히 같으면 방의 개체 순서를 유지합니다. 비율은 현재체력 / max(0, 최대체력 + 추가체력)입니다. `nearestObjectId`는 계속 거리만 기준으로 합니다. 아직 탐색 반경이 없으므로 방 전체가 기본입니다. 서버 개체의 `targetRange`를 지정하면 세 옵션 모두 그 반경 안에서 선택합니다. 공격 실행 및 사거리는 별도입니다.

## 기술과 히트박스
모든 개체의 status에 `hitboxDiameter:24`, `skillA`, `skillB`, `skillC`, `skillP`가 있습니다. 표시 크기 36과 피격 원의 지름 24는 별개이며 이동 충돌/밀어내기는 아직 없습니다. 기본 skillA는 BAS0001, B/C/P는 미지정입니다. P는 패시브 예약 슬롯입니다.

`{v:1,type:"game.cast",slot:"A"|"B"|"C"}`로 한 번 시전합니다. 서버는 해당 연결의 개체/기술 슬롯만 사용하며 클라이언트 damage/각도/대상 ID를 신뢰하지 않습니다. 슬롯별 잔여 쿨타임이 0일 때만 시전하며 BAS0001은 0.5초, BAS0002는 2초입니다. 기절/사망 시 시전하지 않습니다. A는 마우스 좌클릭, B는 마우스 우클릭, C는 좌/우 Shift 키이며 길게 눌러도 자동 반복하지 않습니다.

`game/skills.js`의 기술 포맷으로 BAS0001을 정의합니다. 선택된 nearestEnemyId 방향(없으면 마지막 이동 방향), 시전자 중심에서 전방 길이72·폭50 사각형과 적의 원형 히트박스가 겹치면 `max(0,attack+bonusAttack+5)` 피해를 한 번 적용합니다. 방어력 차감은 없습니다. T1=Y일 때 시전 위치에 범위가 4000ms 유지됩니다. T1=N은 일반 시전 표시 150ms만 남습니다. 스냅샷의 skillEffects는 피해 판정 결과/월드 좌표/남은 시간을 포함하며 범위 표시는 지속 피해가 아닙니다.

## 화면 이동 보간
서버 위치·피격 판정·20Hz 전송은 유지합니다. `public/motion.js`는 표시용 복사본만 만들며 다른 개체는 수신 이력 기준 75ms 지연 보간합니다. 본인은 입력 기반 프레임 이동과 최대 150ms의 제한된 예측 목표를 사용하고 서버 위치로 지수 보정합니다. 카메라는 본인의 같은 표시 좌표를 사용합니다. 250ms 이상 새 스냅샷이 없으면 예측을 중지하며, 200좌표 초과 위치 변경은 순간이동으로 즉시 반영합니다. 방 변경/퇴장 시 이력을 초기화합니다. 이 보간은 공격 판정이나 서버 상태를 변경하지 않습니다.

## 기술 접촉·피해 공통 처리 (최신)
A/B/C의 재사용 대기는 시전자별 `skillCooldowns[slot]`에 다음 사용 가능 서버 시각을 저장합니다. BAS0001 기본값은 500ms이며 다른 기술은 `cooldownMs`로 지정합니다. 대기 중 요청은 `SKILL_COOLDOWN` 오류로 거절하고, 기절·사망·미지정 기술 실패는 새로운 쿨타임을 소비하지 않습니다. 기존 전체 기술 공통 100ms 차단 대신 슬롯별 규칙을 적용합니다. 공격속도 연동과 쿨타임 UI는 아직 없습니다.

`game/skills.js`는 시전 승인과 기술 인스턴스 생성을 담당하고 `game/combat.js`는 접촉 검사→피해 계산→체력·사망 적용→확정 결과 생성을 담당합니다. 시전 당시 공격력과 소속을 인스턴스에 복사하며, 이후 시전자 이동·공격력 변경과 분리됩니다. 인스턴스의 위치·각도를 바꾼 뒤 같은 `resolveSkillContacts`를 호출하면 이동한 판정 영역에 대한 검사가 가능합니다. `hitIntervalMs=null`은 인스턴스당 대상별 1회, 숫자이면 같은 대상의 재피격 간격입니다. `activeFrom/activeUntil`은 실제 피해 유효 시간이며 T1 표시 유지와 별개입니다. 즉시 기본공격은 생성 시 한 번만 판정합니다. 투사체 이동·연속 충돌 검사·장판 생성·지속시간 스케줄링은 이번 변경에 포함하지 않습니다.

기술별 피해 공식은 서버에서 `resolveSkillContacts(instance, objects, now, damageRule)`로 연결합니다. 기본공격은 기존 `max(0,기본공격력+추가공격력+5)`를 유지합니다. 확정 결과에는 id, instanceId, casterId, targetId, code, damage, appliedDamage, healthBefore, healthAfter, killed, occurredAt가 있습니다. `skillSnapshot`이 내부 피격 맵을 제외해 `skillEffects[].results`로 전달하며, 반복 스냅샷에서 동일 결과는 id로 중복 제거할 수 있습니다. 새 피해 숫자 UI는 아직 없습니다.

## 입력 순번 기반 이동 재조정 (최신)
웹과 APK 공통 클라이언트는 이제 `{v:1,type:"game.input",seq:1,x:1,y:0,action:null}`처럼 증가 순번을 전송합니다. 입력 하나는 50ms의 고정 이동을 의미하며 클라이언트가 이동 시간·좌표를 지정하지 않습니다. `public/movement.js`의 같은 대각선 정규화·이동속도·기절·사망·경계 규칙을 서버와 클라이언트가 공유합니다. 서버는 50ms 틱마다 큐의 입력 하나만 소비하고 **실제 반영 후** `lastProcessedInput`을 올립니다. 중복 순번은 재실행하지 않으며 건너뛴 순번·잘못된 순번·32개를 넘는 대기는 거절합니다. 수신 번호와 처리 번호는 별개입니다.

클라이언트는 마지막 서버 위치를 기준으로 처리 확인 번호 이하의 입력을 제거하고 나머지 이동 입력만 다시 계산합니다. 기술 시전·피해 적용은 이동 재실행에 포함하지 않습니다. 표시 캐릭터와 카메라는 이 예측 좌표를 같은 기준으로 부드럽게 따라갑니다. 이전의 50~150ms 임의 전방 목표와 이를 제거하며 생기던 정지 시 뒤로 보정은 삭제했습니다. 벽·기절·서버 상태 변경에 의한 실제 예측 오차는 여전히 서버 기준으로 보정될 수 있습니다. 다른 개체의 75ms 지연 보간은 유지합니다.

이동 입력 생성 주기는 100ms에서 50ms(초당 약 20회)로 변경했습니다. 즉시 UI 이벤트의 중복 송신은 같은 순번을 사용하며 추가 이동을 만들지 않습니다. 브라우저 타이머/서버 부하로 실제 호출 간격은 달라질 수 있습니다. 새 서버 상태를 250ms 넘게 받지 못하거나 미확인 입력이 32개면 추가 예측 생성을 멈춥니다. 재접속·새 방에서 기록을 초기화합니다. 이전 순번 없는 클라이언트는 기존 프로토타입 동작으로 호환하되 순번 방식에 진입한 연결이 구형 입력으로 전환하는 것은 금지합니다. 입력 증가에 맞춰 요청 제한은 연결당 10초 500회입니다.

## BAS0002 구르기
모든 개체의 기본 `skillB`는 BAS0002입니다. B 버튼/마우스 우클릭으로 사용하며 서버가 마지막으로 처리한 이동 방향, 이동하지 않으면 현재 주시 방향을 시전 순간 고정합니다. 캐릭터 한 거리=표시 지름 36으로 보아 총 72좌표를 이동합니다. 속도는 시전 순간 `max(0,moveSpeed+bonusMoveSpeed)*110*3`이며 구르는 도중에는 방향 변경·일반 이동·A/B/C 시전을 허용하지 않습니다. 별도 재사용 대기는 2000ms이며 동작 중 중복 시전은 `ACTION_LOCKED`로 거절합니다.

서버 스냅샷의 `roll={angle,speed,remaining}`은 방향·초당 속도·남은 거리입니다. 구르기는 후속 이동 입력이 없어도 서버 틱마다 진행하며 들어온 순번 입력은 소비·확인하되 방향에는 적용하지 않습니다. 서버와 클라이언트의 공유 이동 규칙이 같은 상태를 진행하며 재계산은 구르기를 새로 시전하지 않습니다. 마지막 50ms 스텝에서는 남은 거리만 이동하고, 그 스텝에는 일반 이동을 추가하지 않습니다. 기절·사망은 진행을 중단하며 월드 경계는 유지합니다. 종료 후 일반 조작이 돌아옵니다. 시전 시 이동속도 0이면 사용할 수 없습니다. 피해·무적·벽 통과 능력은 추가하지 않습니다. 현재 지형 충돌 규칙은 기존 월드 경계 수준이며 별도 맵 연동은 포함하지 않습니다.


## 슬롯 잔여 쿨타임·5인 정원·화면 조작부 (최신)
공통 스테이터스 `skillACooldownRemaining`, `skillBCooldownRemaining`, `skillCCooldownRemaining`은 초 단위이며 기본 0입니다. 시전 성공 시 A의 BAS0001은 0.5초, B의 BAS0002는 2초가 설정됩니다. 모든 개체의 잔여 시간은 경과 시간만큼 감소하고 0 아래로 내려가지 않습니다. 서버는 내부 종료 시각과 동기화하므로 통신·틱 지연으로 대기가 늘어나지 않습니다. 잔여 값은 스냅샷으로 전송하며 클라이언트 기술 버튼과 키보드·마우스 시전을 잠급니다. 최종 허용 여부는 서버에서 검증합니다. 구르기 동작 잠금도 별도로 유지합니다.

방 정원은 방장 포함 5명입니다. 스냅샷의 `maxPlayers`에 정원을 포함하고 로비 목록과 인원 표시가 이를 사용합니다. 여섯 번째부터는 `ROOM_FULL`과 `방이 꽉찼습니다`를 반환하며 입장시키지 않습니다.

옵션의 `showTouchControls`는 선택적 boolean입니다. 미지정이면 기존 장치 감지 결과에 맞춰 조이스틱·기술 버튼과 체크박스를 표시합니다. 사용자가 체크하면 키보드·마우스를 사용해도 터치 조작부를 함께 유지하고, 해제하면 터치 기기에서도 숨깁니다. 수동 설정 후에는 장치 감지가 그 선택을 덮어쓰지 않습니다. 웹 게스트는 현재 접속 동안 유지하며 앱은 계정 설정과 함께 로컬·서버에 저장합니다. 크기·이름 등 다른 옵션을 바꿔도 수동 표시 여부가 보존됩니다.

## 기술 버튼 이름·잔여 대기 표시
개체 스냅샷의 `skillNames`는 A/B/C 슬롯의 실제 서버 기술 정의 이름입니다. 기본 표시는 기본공격·구르기·미지정이며 할당이 바뀌면 이름도 함께 갱신됩니다. 클라이언트는 textContent로 표시합니다. 버튼 위에는 슬롯별 남은 대기를 소수 첫째 자리 초 단위로 올림 표시하고 0이면 숨깁니다. 글자 크기는 월드 캐릭터 이름의 14좌표에 화면 배율을 적용하며, 세로 웹 UI에서는 중복 확대하지 않습니다. 잔여 시간은 버튼 바깥에 두어 버튼이 비활성화되어도 읽을 수 있습니다.

## 방 생성 기준 타이머와 강제 종료
방 생성 시 서버가 createdAt, countdownEndsAt(생성+600000ms), closesAt(생성+660000ms)를 한 번 확정합니다. 게임 시작·입장·방장 변경으로 초기화하지 않습니다. `room.timer`에 이 시각과 remainingMs, closeRemainingMs를 보내며 클라이언트는 남은 시간에 수신 후 경과만 반영해 메뉴 왼쪽에 MM:SS를 표시합니다. 타이머는 터치 조작부 표시 옵션과 무관하게 유지됩니다.

진행 중인 게임은 생성 후 10분에 타이머가 0이 되면 모든 참가자에게 서버 확정 `game.result`를 보내고 점수화면으로 이동시킵니다. 참가자가 모두 종료하면 방을 삭제합니다. 시작하지 않은 대기실은 생성 후 11분에 기존 `room.closed`로 정리합니다. 소켓은 유지하며, 점수화면의 로비로 나가기를 거친 뒤 새 방 생성·입장이 가능합니다. 입장·게임 시작·방장 변경으로 수명은 초기화하지 않습니다. 종료 시점은 서버가 검사합니다.

## 구덩이 지도와 시작 위치

- 시작 요청을 승인할 때 서버가 기존 구덩이 생성기로 지도 하나를 생성한다. 실패하면 대기실을 유지한다.
- 입장 순서 `playerNumber` 1~5를 지형 번호 `spawnTileId` 1~5에 연결하여 중심에 배치한다.
- 최초 `room.state`에 `map`을 전송하고 주기적인 `game.state`는 `mapId`만 전송한다. 클라이언트는 받은 지도를 유지한다.
- 지형과 명시된 다리에서만 지름 24의 플레이어가 이동한다. 같은 높이 다리 폭은 500, 다른 높이 다리 폭은 100이고 지형 가장자리 사이 노출 길이는 30이며 구르기도 같은 이동 제한을 따른다.
- 기존 높이 2→3 다리는 단방향이다. 일반 이동·구르기·미처리 입력 재실행은 공통 `PitMapRules`를 사용한다. 빠른 이동은 잘게 나누어 검사하므로 빈 공간을 건너뛰지 않는다.
- 지도 좌표와 판정은 2D이며 현재 높이는 색과 방향 표시로만 표현한다. 3D 지형 에셋은 별도 작업이다.

## 몬스터 생성과 인식

몬스터 개체에는 `presetId`, `spawnTileId`를 전송하고 `status`에 `spawnPosition:{x,y}`, `awarenessState:'normal'|'combat'|'returning'`, `attackTargetId:string|null`을 포함한다. 위치·대상·인식·타일별 수량과 TEST001 행동은 서버가 관리하며 클라이언트가 설정하는 명령은 없다. AI 대기 시각·이동 목적지·복귀 경로는 전송하지 않는다. 몬스터 BAS0001도 기존 `skillEffects`와 피해 결과 형식을 공유한다. 상세 행동은 STATUSES.md 참조.

## 이동과 시전 순서

`game.cast`는 슬롯과 `afterInputSeq`(시전 전에 서버가 처리해야 할 마지막 이동 입력 순번)를 전송한다. 클라이언트 좌표는 전송하지 않는다. 순번이 없으면 구버전 호환으로 마지막 수신 입력을 사용한다. 서버는 해당 순번 직후 시전하며, 미래·이미 지난·역순 순번은 `INVALID_CAST_SEQUENCE`, 시전 대기열 초과는 `CAST_QUEUE_FULL`을 반환한다. 쿨타임·조작 잠금은 실행 시에도 검사한다. 개체 스냅샷에는 `inputQueueLength`, `inputQueueDelayMs`를 함께 전송한다. 시간 예산 및 검증은 NETWORKING.md 참조.

## 공개 대기방과 Private

새 방의 `private`는 기본 false다. `room.privacy {private:boolean}`는 대기실 방장만 변경할 수 있으며 전체 방 상태에 동기화된다. 비공개라도 기존 `room.join {name,code}`로 입장할 수 있다.

`room.list` 요청에는 `room.list {rooms:[{code,hostName,playerCount,maxPlayers}],requestId}`와 기존 ack를 반환한다. 미만료·공개·시작 대기방만 노출하며 만원 방은 인원 표시와 함께 목록에 남긴다. UI는 만원 방 선택을 비활성화한다. 시작·종료·비공개 전환 후에는 새로고침으로 목록을 갱신한다.

목록 선택 입장은 `room.join {name,code,publicOnly:true}`를 사용한다. 서버는 실제 입장 시 공개 여부·정원·시작·만료를 다시 검사한다. 비공개 전환 시 `ROOM_PRIVATE`를 반환한다. 서버 목록은 비공개 방 코드나 참가자 전체 정보는 공개하지 않는다.

## 상태 생성 시각

`room.state.room` 및 `game.state.room`에 `serverTime`(서버 상태 생성 시각 ms), `snapshotSequence`(방별 증가하는 상태 순번)를 포함한다. 클라이언트는 상대 표시만 서버 생성 시각 기준으로 보간하고, 내 입력 확인·시전 순서는 기존 규칙을 유지한다. 같은 생성 시각의 새 순번은 이력 한 칸을 갱신하며 이전 순번은 이동 표시 모델에서 무시한다.

## 게임 결과·공통 상호작용

- `game.interact {targetId}`: 중심 거리 60 이내 사용 가능한 NPC/사물을 서버 분류코드 처리기로 호출한다.
- `interaction.prompt {id,message}`: OBJ0001 귀환등 또는 NPC_EXIT 탈출구의 Y/N 확인. 서버 발급 ID의 유효시간은 15초다.
- `game.interact.confirm {confirmationId,accept:boolean}`: Y/N 응답. Y는 대상 상태·거리·소유권을 다시 검사한다. 다른 분류코드 처리 결과는 `interaction.result {code,response}`로 전달할 수 있다.
- `game.result {result:{id,competitionPoints,reason}}`: 사망(DEATH), 타이머 0(TIME_LIMIT), 탈출(ESCAPE) 시 서버 확정 점수. 참가자는 즉시 게임에서 제외된다.
- `game.result.seen {resultId}` → `game.result.ready {resultId}`: 점수화면 표시 확인 기록. 결과는 본인 연결의 서버 ID만 허용한다.
- `game.result.leave {resultId}` → `game.result.left`: 확인 기록 후 첫 화면으로 퇴장한다. 요청 명령은 기존 `requestId`/`ack` 규칙을 따른다. 결과 확인 전 새 방 생성·입장은 RESULT_PENDING이다.
- 오브젝트 스냅샷의 `interactionEnabled`는 상호작용 사용 여부, `ownerCode`/`ownerId`는 사물의 소유 코드/개체 ID다. OBJ0001은 `status.objectType='prop'`이다.

계정 보상은 미구현이다. 결과 확인 기록과 후속 영속 보상 연결 시 주의점은 RESULTS-AND-INTERACTIONS.md를 참고한다.


## 실서버 테스트옵션

`game.testOptions {mapHack:boolean,highSpeed:boolean}` 요청은 기존 requestId/ack 규칙을 따른다. 진행 중 생존 플레이어의 서버 이름이 정확히 `열쇠`인 경우에만 허용한다. 일반 이름은 FORBIDDEN, 불리언 이외 입력은 INVALID_OPTIONS로 거부한다. 적용 직후 room.state를 전송하고 이후 game.state에도 `testOptions`와 변경된 `status.moveSpeed`를 동기화한다. 기본 체크는 모두 false이며 새 참가 개체를 생성할 때 초기화한다. 고속화 적용 시 moveSpeed는 6, 해제 시 적용 전 기본값으로 돌아간다. 맵핵은 전체맵 표시만 변경한다.

귀환등의 탈출 확인이 성공하면 서버는 해당 사물의 `interactionEnabled=false`를 남은 참가자에게 전송한다. 사물 자체의 체력·처치 보상은 유지한다.


## 플레이어 처치와 시간제 탈출구

플레이어 처치 시 사망 시점 피해자 경쟁포인트의 절반을 내림하여 처치자 `status.competitionPoints`에 더하며, 피해자 `status.level*40` 경험치를 공통 함수로 지급한다. 피해자의 점수화면 값은 유지한다. 보상은 서버 공통 피해 적용에서 한 번만 확정하고 기존 상태 스냅샷의 점수·경험치·레벨에 반영한다.

실제 `gameStartedAt` 이후 360000ms에 높이 3, 480000ms에 생존 참가자가 2명 이상이면 높이 4의 무작위 타일 중앙에 탈출구 NPC를 각각 한 번 생성한다. 연결 끊김 유예 중인 생존자도 포함한다. `NPC_EXIT`는 `objectType=npc`, `status.damageImmune=true`, `interactionEnabled=true`, `spawnTileId`를 전송하며 모든 생존 플레이어가 공통 상호작용 거리 60 이내에서 이용한다. 모든 개체의 `status.damageImmune` 기본값은 false다. Y 성공 시 해당 NPC가 `room.objects`에서 제거되고 사용자는 `game.result`의 ESCAPE 결과를 받는다. 남은 참가자에게는 제거된 최신 개체 목록을 전송하며 다른 사용자의 동시 확인은 재검증으로 거부한다.


게임 중 스킬 메뉴는 전체 방 상태의 `skillCatalog`를 표시합니다. `game.skill.buy {code}`는 손패 카드 한 장을 제외 목록으로 이동하고 정의의 `skillPoints`를 사용하고 보유 레벨을 1 올립니다. 버튼 기술은 타입 슬롯에 장착됩니다. `game.skill.equip {code}`는 보유 기술과 시작 기본 기술을 해당 슬롯에 장착합니다. 구매와 장착은 서버가 게임 진행 상태, 플레이어 생존 여부, 사용 조건을 검증합니다. 비행 중인 돌의 표시 좌표는 `stones`로 전송됩니다.

`game.skill.reroll`은 빈 손패에서 무료로 드로우하고, 손패가 있으면 무료 리롤 1회를 우선 사용하거나 1 SP를 사용합니다. 서버는 이전 손패를 묘지로 옮기고, 덱이 손패최대수보다 적으면 묘지를 덱에 합친 뒤 남은 카드에서 무작위로 뽑습니다. 구매창은 갱신된 서버 손패를 표시합니다.

## 독기 표시

`players[].poisonDamage`는 현재 서버 위치에서 독기 한 박자(3초)당 적용되는 체력 차감량이다. 적용되지 않으면 0이다. 표시용이며 클라이언트는 서버 스테이터스의 체력을 그대로 사용한다.

## 비플레이어 개체 변경 전송

WebSocket URL에 objects=delta1을 지정한 클라이언트는 진행 중 game.state의 objects 대신 objectChanges를 받을 수 있다. room.state 또는 objects가 포함된 game.state는 전체 기준 상태다. 이전 기준을 받지 않은 연결은 전체 game.state를 먼저 받는다.

연결의 송신 대기량이 64 KiB를 넘으면 주기 `game.state`를 건너뛴다. 대기열이 낮아지면 최신 전체 `objects`와 `items`를 담은 `game.state`로 다시 동기화한다. 이 동안에도 결과와 명령 응답 같은 필수 메시지는 보낼 수 있다. 틱 전송 적체가 5초간 지속되거나 필수 메시지 전송 시 대기량이 1 MiB를 넘으면 연결을 종료한다.

서버는 수신자 본인에게 전체 플레이어 상태를 보내고, 다른 플레이어에게는 화면 표시용 개체 ID·이름·좌표·방향·행동·준비 여부와 생존 상태, 현재 체력, 최종 최대 체력(`status.effective.maxHealth`), 레벨, 공개 활성 효과(`status.activeEffects`)만 보낸다. 이 규칙은 `players`와 전체 `objects`에 모두 적용한다. 공개 활성 효과는 코드와 필요한 경우 서버 기준 만료 시각(ms)을 제공한다. 리롤·구매·장착 성공은 `ack`로 응답하고 바뀐 본인 기술 상태는 다음 `game.state`에 포함한다.

- players는 전체 플레이어 상태를 유지한다. 변경 전송에서 objects의 플레이어 복사본은 생략하며 화면에서 players를 월드 목록에 합친다.
- 몬스터, NPC, 사물의 added는 개체 전체 자료, updated는 ID와 fields 및 status의 변경, removed는 제거 ID다. fields와 status는 각각 set과 unset을 포함하고 변경이 없으면 null이다. 위협 목록 등의 중첩 자료는 바뀔 때 필드 단위로 교체한다.
- 아이템은 기존대로 전체 초기 목록과 itemChanges를 사용한다. 획득 비행 시작·취소도 포함한다.
- 변경분은 WebSocket 순서대로 적용하며, 재접속과 전체 방 상태 수신 때 기준을 교체한다. 형식을 요청하지 않은 연결에는 기존 전체 상태를 전송한다.
