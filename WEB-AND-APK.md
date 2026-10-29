# 웹 및 APK 접속 방식

테스트 링크 기록: https://subtrpg-playtest-cloi.roundgenet17.chatgpt.site

이 링크는 브라우저 안에서 혼자 실행하는 화면 테스트용입니다. 실제 멀티플레이 및 OAuth 계정 서버는 포함하지 않습니다. 구글/카카오에 로그인한 척하는 테스트 계정을 발급하지 않습니다.

## 웹

- 루트 `/`는 로그인 없이 게스트입니다. APK 세션 쿠키가 있어도 웹 WebSocket(`client=web`)은 항상 게스트로 새 플레이어ID를 발급합니다.
- 웹에는 구글/카카오 로그인 버튼을 노출하지 않습니다. 게스트 설정은 현재 페이지 메모리에만 있고 계정/서버에 저장하지 않습니다.
- 가로는 기존 19:8~19:15 자동 시야입니다. 높이가 너비보다 큰 세로 화면에서는 19:10 시야를 고정하고, 화면 안에 맞게 줄여 중앙 배치합니다. 캐릭터/체력바/조작부도 함께 줄이며 나머지는 여백입니다. 가로 회전 안내로 플레이를 막지 않습니다.

## APK

`android/`는 같은 웹 게임을 HTTPS WebView에서 사용하는 Android 소스 프로젝트입니다. 별도 게임 로직을 복제하지 않습니다.

1. Android Studio에서 `android` 폴더를 엽니다. SDK 36, JDK 17, Gradle 8.13 및 Android Gradle Plugin 8.13.0이 필요합니다. Gradle이 설치된 환경에서는 `gradle wrapper --gradle-version 8.13`으로 래퍼를 생성할 수 있습니다. 이번 전달물에는 Gradle 바이너리/래퍼 JAR/서명키를 포함하지 않습니다.
2. 실제 Node.js 멀티플레이·계정 서버를 HTTPS로 배포합니다. **현재 Sites 테스트 링크를 이 서버 주소 대신 사용하면 로그인 API가 없으므로 APK 계정 로그인이 작동하지 않습니다.**
3. `-PgameOrigin=https://실제서버주소`를 지정해 빌드합니다. Gradle 설치 환경의 예: `gradle :app:assembleDebug -PgameOrigin=https://game.example.com`.
4. 디버그 APK 출력은 `app/build/outputs/apk/debug/`입니다. 배포 APK는 개인 서명키로 별도 서명해야 합니다. 실제 APK 빌드 및 기기 설치는 이번 실행 환경에 Android SDK가 없어 검증하지 못했습니다.

앱은 가로 사용을 요청하고, 세로 viewport에서는 회전 안내를 유지합니다. WebView는 `/app`에 접속하며 `SubTRPG-Android/1` 표식을 사용합니다. 이 표식은 UX 구분값이며 앱 진위를 보장하는 보안 인증은 아닙니다. 서버 계정 권한은 검증된 로그인 세션으로만 얻습니다.

## 실제 로그인 설정

`.env.example`을 참고하세요. `PUBLIC_BASE_URL`은 끝 `/` 없는 실제 HTTPS origin이고 `ALLOWED_ORIGIN`도 같은 주소를 지정합니다. 비밀키는 서버 환경변수에만 저장합니다. `.env`를 사용할 경우 `node --env-file=.env server.js`로 실행합니다.

### Google

Google Cloud에서 OAuth 동의 화면을 설정하고 서버용 OAuth 클라이언트를 생성합니다. 승인된 리디렉션 URI는 `https://실제서버주소/auth/callback/google`입니다. 클라이언트 ID/secret을 각각 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 설정합니다. 테스트 상태의 앱은 테스트 사용자 등록이 필요할 수 있습니다.

### Kakao

카카오디벨로퍼스에서 앱을 등록하고 카카오 로그인을 활성화합니다. Redirect URI는 `https://실제서버주소/auth/callback/kakao`로 등록하고 닉네임 등 필요한 동의 항목을 설정합니다. `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`을 서버에 설정합니다. 실제 서비스의 플랫폼/운영 설정은 개발자 콘솔에서 완료해야 합니다.

### 인증 흐름

- APK는 로그인 버튼 선택 시 자체 생성한 비밀 verifier를 개인 설정에 보관합니다. SHA-256 challenge만 서버에 보냅니다.
- 외부 시스템 브라우저에서 구글/카카오 인가를 수행합니다. OAuth를 WebView 안에서 진행하지 않습니다.
- 서버는 state 및 브라우저 바인딩 쿠키를 확인하고, 인가코드를 각 제공자 토큰 API로 교환한 뒤 userinfo로 사용자를 확인합니다.
- 제공자 고유 ID로 게임 ID `acct_UUID`를 생성/재사용합니다. Google/Kakao 계정은 자동 병합하지 않습니다. 계정 연결 기능은 별도 설계 대상입니다.
- 서버가 60초짜리 일회용 앱 복귀 코드를 `subtrpg://auth/callback`으로 보냅니다. APK가 보관한 verifier를 POST해 증명해야 HTTPOnly 앱 세션을 얻습니다. 리다이렉트로 장기 토큰을 전달하지 않습니다.
- 세션은 최대 30일이며 서버 메모리에만 보관합니다. 서버 재시작 후에는 다시 로그인해야 하지만 게임 ID와 설정은 유지됩니다. 제공자 액세스 토큰은 계정 파일에 저장하지 않습니다.

## 설정 저장

현재 실제 적용되는 설정은 `controlScale`(터치 조작부 크기)와 `showNames`(이름 표시)입니다.

- 서버: 기본 `.data/accounts.json`에 계정별 저장. 원자적 파일 교체를 사용하며 단일 프로세스 개발 서버용입니다. 운영에서는 영구 디스크와 백업 또는 DB로 교체해야 합니다.
- 앱 로컬: 계정별 `subtrpg:account:<ID>:settings` 키로 WebView localStorage에 캐시합니다. 비밀 토큰은 저장하지 않습니다. 서버의 저장값이 로그인 시 기준입니다. 서버 동기화 실패 시 로컬 적용 사실과 실패를 표시하고 다시 저장할 수 있습니다.
- 설정 변경/로그아웃 API는 세션, 같은 Origin 및 CSRF 토큰을 확인합니다. 웹 게스트는 계정 설정 API를 사용할 수 없습니다.

## 구현·검증 범위

서버 OAuth 코드/계정 생성·재사용/설정 저장, 웹 게스트 분리, APK 복귀 코드 증명 및 클라이언트 UI를 작성했습니다. 자동 테스트는 제공자 응답을 가짜 HTTP 응답으로 대체해 검증합니다. **실제 구글·카카오 로그인은 인증키/앱 등록/HTTPS 서버가 없어 아직 완료 검증하지 못했습니다. APK도 아직 빌드된 설치 파일이 아닙니다.**

공식 참고:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.kakao.com/docs/ko/kakaologin/rest-api
- https://developer.android.com/develop/ui/views/layout/webapps/webview

게임 메뉴의 테스트 조작은 ‘테스트설정’, 조이스틱 크기·이름 표시·공격 우선대상은 ‘옵션’으로 분리했습니다. 공격 우선대상은 웹 게스트는 접속 중 유지, 앱 계정은 기존 설정 저장 경로로 저장하며 방 입장 시 서버로 적용합니다. 현재 대상 탐색 범위는 방 전체이고, 주기는 0.1초입니다. 로그인 연동 소스 자체는 변경하지 않았습니다.
