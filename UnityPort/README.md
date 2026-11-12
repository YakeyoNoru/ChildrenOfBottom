# ChildrenOfBottom Unity 이식

Unity 6000.3.5f2에서 `Assets/Scenes/Main.unity`을 열고 Play를 누른다. 기본 접속 주소는 `http://127.0.0.1:3000`이다. 저장소 루트에서 `npm start`로 로컬 서버를 시작한 뒤 메인에서 게스트 로그인을 선택하면 된다.

Windows 실행 파일은 `--cob-server https://게임서버주소`로 접속 출처를 지정할 수 있다. 빌드 기본값은 `Assets/Resources/ConnectionSettings.json`의 `serverOrigin`에 설정한다. 원격 주소에는 HTTPS가 필요하며 경로, 쿼리 및 인증 정보는 넣지 않는다.

로그인과 회원가입은 같은 Google 인증을 사용한다. 기본 브라우저에서 인증하고 게임으로 돌아오면 서버에서 발급한 앱 세션으로 연결한다. 첫 인증에서 계정을 생성하고 이후에는 같은 계정을 불러온다. 운영 서버에는 Unity 인증 경로가 포함된 서버 코드와 `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 설정이 필요하다. Google OAuth의 리디렉션 URI는 운영 서버 출처 뒤에 `/auth/callback/google`을 붙인 주소다. Google 클라이언트 비밀키는 서버에만 둔다.

Android APK는 `Assets/Resources/AndroidConnectionSettings.json`의 `serverOrigin`을 우선 읽는다. 패키지 ID `com.childrenofbottom.unity`는 기존 WebView 앱의 패키지와 별개다.

메인에서 서버 연결이 확인되면 `Lobby`로 이동한다. 방장 시작 이후에는 서버가 시드로 생성한 맵과 초기 개체 상태를 받아 `Game`에 월드를 구성하며, `GameUI`를 추가 로드한다. 월드와 HUD가 준비되는 동안 공통 로딩 화면이 입력을 차단한다. 결과 퇴장 또는 방 종료 시 게임과 HUD 씬을 내리고 로비로 돌아간다.

조작은 WASD 또는 방향키로 이동, 좌클릭·우클릭·Shift로 기술, F로 상호작용, B로 기술 창, Tab으로 전체맵, Esc로 메뉴다. 터치 조작의 자동·켜기·끄기 설정은 게임 HUD에서 전환할 수 있다.
