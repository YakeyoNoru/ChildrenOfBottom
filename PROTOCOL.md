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

변경마다 방 전체에 완전한 스냅샷을 전송합니다. 기존 상태를 교체하세요. `players`는 입장순이며 최대 4개입니다. 방장 `ready`는 항상 false이고 준비 조건에서 제외됩니다. `phase`는 `lobby` 또는 `started`입니다. `started` 수신 시 게임 시작 화면으로 전환합니다. 현재 버전은 이후 생존 시뮬레이션을 실행하지 않습니다.

```json
{"v":1,"type":"ack","requestId":"1","command":"room.create"}
{"v":1,"type":"error","requestId":"2","code":"NOT_READY","message":"모든 참가자가 준비해야 합니다."}
{"v":1,"type":"room.left"}
{"v":1,"type":"room.closed","message":"방이 해제되었습니다."}
```

`room.left`: 본인 일반 퇴장. `room.closed`: 방장 포함 연결된 방 전체에 전송. 두 경우 로컬 방 상태를 지우고 메인으로 복귀합니다. 연결 자체가 끊어진 클라이언트는 이벤트를 받을 수 없으므로 로컬에서 방 상태를 지우고 연결 종료 안내를 표시합니다.

오류 코드는 `BAD_MESSAGE`, `UNKNOWN_TYPE`, `INVALID_NAME`, `INVALID_CODE`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `SERVER_FULL`, `ALREADY_IN_ROOM`, `NOT_IN_ROOM`, `FORBIDDEN`, `HOST_CANNOT_READY`, `INVALID_READY`, `NOT_READY`, `GAME_STARTED`, `RATE_LIMIT`입니다. 해석 불가 메시지와 속도 제한 오류는 requestId가 없을 수 있습니다. 오류는 일반적으로 연결을 종료하지 않습니다. 4 KiB 초과/유효하지 않은 WebSocket 프레임은 연결 종료 대상입니다.

HTTP `GET /health`는 `{"ok":true,"protocolVersion":1}`을 반환합니다. 방 API는 WebSocket으로만 제공합니다. 클라이언트는 서버 상태만 표시하고 시작 여부를 스스로 확정하지 않아야 합니다. 이후 생존 시스템 명령 추가 시 이 문서를 확장하고 호환성이 깨지면 버전을 올립니다.
