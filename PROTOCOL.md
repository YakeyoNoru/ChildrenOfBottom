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

연결 직후 본인 ID를 저장합니다. 재접속하면 새 ID가 발급됩니다.

```json
{"v":1,"type":"room.state","room":{"code":"A12BCD","hostId":"uuid-1","phase":"lobby","players":[{"id":"uuid-1","name":"방장","ready":false},{"id":"uuid-2","name":"참가자","ready":true}]}}
```

변경마다 방 전체에 완전한 스냅샷을 전송합니다. 기존 상태를 교체하세요. `players`는 입장순이며 최대 4개입니다. 방장 `ready`는 항상 false이고 준비 조건에서 제외됩니다. `phase`는 `lobby` 또는 `started`입니다. `started` 수신 시 게임 시작 화면으로 전환합니다. 이후 `game.state`로 위치 스냅샷을 받습니다.

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

개체 형식: `{id, name, x, y, action, status}`. 플레이어의 players 배열 항목에는 `ready`도 있습니다. `status.instanceId === id`이며 공통 스테이터스와 `effective`(추가값을 포함한 최종 수치)를 담습니다. 필드별 정의는 [STATUSES.md](STATUSES.md)를 참고하세요. `concealed`, `stunned`는 JSON boolean이고, `state`는 `alive`/`dead`입니다. 최근접 ID는 개체 ID 또는 null입니다. 플레이어에게만 `skillDeckCode`와 `availableSkills`가 있습니다.

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

`{v:1,type:"game.cast",slot:"A"|"B"|"C"}`로 한 번 시전합니다. 서버는 해당 연결의 개체/기술 슬롯만 사용하며 클라이언트 damage/각도/대상 ID를 신뢰하지 않습니다. 중복 요청 방지를 위한 최소 간격은 100ms이고 정식 쿨다운은 미정입니다. 기절/사망 시 시전하지 않습니다. A는 마우스 좌클릭, B는 마우스 우클릭, C는 좌/우 Shift 키이며 길게 눌러도 자동 반복하지 않습니다.

`game/skills.js`의 기술 포맷으로 BAS0001을 정의합니다. 선택된 nearestEnemyId 방향(없으면 마지막 이동 방향), 시전자 중심에서 전방 길이72·폭50 사각형과 적의 원형 히트박스가 겹치면 `max(0,attack+bonusAttack+5)` 피해를 한 번 적용합니다. 방어력 차감은 없습니다. T1=Y일 때 시전 위치에 범위가 4000ms 유지됩니다. T1=N은 일반 시전 표시 150ms만 남습니다. 스냅샷의 skillEffects는 피해 판정 결과/월드 좌표/남은 시간을 포함하며 범위 표시는 지속 피해가 아닙니다.
