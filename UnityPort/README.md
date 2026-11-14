# ChildrenOfBottom Unity 이식

Unity 6000.3.5f2에서 `Assets/Scenes/Main.unity`을 열고 Play를 누른다. 에디터 Play 모드는 기본적으로 Android와 같은 운영 서버(`https://arena.childrenofbottoms.duckdns.org`)에 접속한다. 로컬에서 테스트할 때는 저장소 루트에서 `npm start`를 실행하고, 아래 접속 설정으로 `http://127.0.0.1:3000`을 지정한다.

Windows 실행 파일은 `--cob-server https://게임서버주소`로 접속 출처를 지정할 수 있다. 빌드 기본값은 `Assets/Resources/ConnectionSettings.json`의 `serverOrigin`에 설정한다. 원격 주소에는 HTTPS가 필요하며 경로, 쿼리 및 인증 정보는 넣지 않는다.

로그인과 회원가입은 같은 Google 인증을 사용한다. 기본 브라우저에서 인증하고 게임으로 돌아오면 서버에서 발급한 앱 세션으로 연결한다. 첫 인증에서 계정을 생성하고 이후에는 같은 계정을 불러온다. 운영 서버에는 Unity 인증 경로가 포함된 서버 코드와 `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 설정이 필요하다. Google OAuth의 리디렉션 URI는 운영 서버 출처 뒤에 `/auth/callback/google`을 붙인 주소다. Google 클라이언트 비밀키는 서버에만 둔다.

Android APK는 `Assets/Resources/AndroidConnectionSettings.json`의 `serverOrigin`을 우선 읽는다. 패키지 ID `com.childrenofbottom.unity`는 기존 WebView 앱의 패키지와 별개다.

메인에서 서버 연결이 확인되면 `Lobby`로 이동한다. 방장 시작 이후에는 서버가 시드로 생성한 맵과 초기 개체 상태를 받아 `Game`에 월드를 구성하며, `GameUI`를 추가 로드한다. 월드와 HUD가 준비되는 동안 공통 로딩 화면이 입력을 차단한다. 결과 퇴장 또는 방 종료 시 게임과 HUD 씬을 내리고 로비로 돌아간다.

조작은 WASD 또는 방향키로 이동, 좌클릭·우클릭·Shift로 기술, F로 상호작용, B로 기술 창, Tab으로 전체맵, Esc로 메뉴다. 터치 조작의 자동·켜기·끄기 설정은 게임 메뉴에서 전환할 수 있다. Android에서 처음 실행하면 터치 조작이 켜진다.

게임 UI에는 넥슨코리아가 제공한 마비옛체를 사용한다. 서체의 권리는 넥슨코리아에 있으며, 원본을 수정하지 않는 조건으로 사용할 수 있다. 글꼴 자체의 유료 판매는 금지되며, 소프트웨어에 포함할 때는 저작권 안내를 함께 제공한다. [마비옛체 공식 사용 조건](https://mabinogi.nexon.com/page/pds/font.asp)


## Main 씬 UI 배치와 수정

`Assets/Scenes/Main.unity`를 열면 Play를 누르지 않아도 Hierarchy의 `Main Canvas > Main Menu`에서 로그인·게스트·회원가입·인증 취소 버튼과 상태 문구를 확인할 수 있다. Scene 뷰에서 UI 위치·크기·앵커를 수정하고 저장한다. 기존 코드처럼 실행 시 버튼을 새로 생성하지 않는다.

- `Main Canvas`: 전체 화면 Canvas, 배경, 화면 비율에 대응하는 Canvas Scaler
- `Main Menu`: 제목, `Google Login`, `Guest Login`, `Google Registration`, `Google Cancel`, `Status`를 소유한 패널
- `PortMainMenuView`: Main Menu에 부착된 스크립트. Inspector의 Button/Text 직렬화 참조를 통해 클릭 이벤트를 연결하고 상태 안내를 갱신한다
- Google 인증 취소 버튼은 에디터에서 배치를 확인할 수 있도록 저장하지만 Play를 시작하면 숨겨지고 인증 대기 중에만 표시한다

Unity 6000.3.5f2에서 Main 씬을 열어 Console 컴파일 오류가 없는지, 네 버튼 위치가 Scene/Game 뷰에서 보이는지, Play 중 Google 로그인·회원가입·게스트 입장·인증 취소가 동작하는지 확인해야 한다.

## Lobby와 GameUI 씬 UI 편집

- `Assets/Scenes/Lobby.unity`를 열고 Hierarchy에서 `Lobby Canvas`를 펼치면 방 생성, 방 목록, 대기실 UI를 선택할 수 있다.
- `Assets/Scenes/GameUI.unity`를 열고 Hierarchy에서 Canvas를 펼치면 미니맵, 메뉴, 기술 버튼과 터치 조작부를 선택할 수 있다. Scene 뷰를 2D로 전환하고 오브젝트를 선택한 상태에서 F를 눌러 배치에 초점을 맞춘다.
- 비활성 패널은 편집 중 잠시 활성화해 위치와 크기를 확인하고 원래 활성 상태로 돌린 뒤 저장한다. 위치·크기·앵커는 Inspector의 Rect Transform에서 수정한다.
- 월드 체력바와 스킬 카드의 공통 배치는 Project 창에서 `Assets/WorldHealthBar.prefab`, `Assets/SkillCard.prefab`을 더블클릭해 수정한다. Play 중에는 게임 데이터에 따라 필요한 개수만큼 생성한다.
- 기존 오브젝트를 교체했다면 Canvas의 Port Scene Ui 컴포넌트에 저장된 참조도 새 오브젝트로 갱신한다.

## 월드 프리팹 편집

Project 창의 `Assets/Resources/WorldPrefabs`에서 플레이어(`Players`), 몬스터(`Enemies`), NPC(`NPCs`), 사물(`Props`), 투사체와 공격 표시(`Effects`) 프리팹을 편집한다. `ExitNpc`와 `ReturnLantern`은 각각 `Npc`와 `Prop`의 변형이다. 서버 분류 코드와 프리팹 경로의 연결은 `Assets/Scripts/Gameplay/World/PortWorldPrefabs.cs`에 있다.

- `Items/IllusionFragment`의 `FragmentOutline`과 `FragmentCenter`는 일괄 렌더링에 사용하는 두 메시다. 이 두 자식의 이름과 재질의 GPU Instancing 설정을 유지한다.
- `Terrain/TerrainTileH1`~`TerrainTileH4`는 `TerrainHex` 메시를 공유하며 윗면 높이는 각각 4·3·2·1 Unity 미터다. 타일 위치는 서버 지도를 따르며, 다리의 수평 길이가 플레이어 지름을 넘지 않도록 3D 타일의 표시 가장자리를 조정한다. `Bridge`는 양쪽 표면에 맞춰 회전하고 서버 통로 폭을 유지한다. 미니맵, 전체맵, 이동 판정은 기존 서버 평면 좌표를 사용한다.
- 프리팹 변경은 화면 외형에 적용된다. 생성 위치, 피격, 상호작용과 보상은 기존 서버 상태와 공통 판정을 따른다.
