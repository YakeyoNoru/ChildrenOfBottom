# ChildrenOfBottom Unity 이식

Unity 6000.3.5f2에서 `Assets/Scenes/Main.unity`을 열고 Play를 누른다. 에디터 Play 모드는 기본적으로 Android와 같은 운영 서버(`https://arena.childrenofbottoms.duckdns.org`)에 접속한다. 로컬에서 테스트할 때는 저장소 루트에서 `npm start`를 실행하고, 아래 접속 설정으로 `http://127.0.0.1:3000`을 지정한다.

Windows 실행 파일은 `--cob-server https://게임서버주소`로 접속 출처를 지정할 수 있다. 빌드 기본값은 `Assets/Resources/ConnectionSettings.json`의 `serverOrigin`에 설정한다. 원격 주소에는 HTTPS가 필요하며 경로, 쿼리 및 인증 정보는 넣지 않는다.

로그인과 회원가입은 같은 Google 인증을 사용한다. 기본 브라우저에서 인증하고 게임으로 돌아오면 서버에서 발급한 앱 세션으로 연결한다. 첫 인증에서 계정을 생성하고 이후에는 같은 계정을 불러온다. 운영 서버에는 Unity 인증 경로가 포함된 서버 코드와 `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 설정이 필요하다. Google OAuth의 리디렉션 URI는 운영 서버 출처 뒤에 `/auth/callback/google`을 붙인 주소다. Google 클라이언트 비밀키는 서버에만 둔다.

Android APK는 `Assets/Resources/AndroidConnectionSettings.json`의 `serverOrigin`을 우선 읽는다. 패키지 ID `com.childrenofbottom.unity`는 기존 WebView 앱의 패키지와 별개다.

메인에서 서버 연결이 확인되면 `Lobby`로 이동한다. 방장 시작 이후에는 서버가 시드로 생성한 맵과 초기 개체 상태를 받아 `Game`에 월드를 구성하며, `GameUI`를 추가 로드한다. 월드와 HUD가 준비되는 동안 공통 로딩 화면이 입력을 차단한다. 결과 퇴장 또는 방 종료 시 게임과 HUD 씬을 내리고 로비로 돌아간다.

조작은 WASD 또는 방향키로 이동, 좌클릭·우클릭·Shift로 기술, F로 상호작용, B로 기술 창, Tab으로 전체맵, Esc로 메뉴다. 터치 조작의 자동·켜기·끄기 설정은 게임 메뉴에서 전환할 수 있다. Android에서 처음 실행하면 터치 조작이 켜진다.

게임 UI에는 넥슨코리아가 제공한 마비옛체를 사용한다. 서체의 권리는 넥슨코리아에 있으며, 원본을 수정하지 않는 조건으로 사용할 수 있다. 글꼴 자체의 유료 판매는 금지되며, 소프트웨어에 포함할 때는 저작권 안내를 함께 제공한다. [마비옛체 공식 사용 조건](https://mabinogi.nexon.com/page/pds/font.asp)
