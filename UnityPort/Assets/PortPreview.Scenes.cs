using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ChildrenOfBottom
{
    // 앱 진입 화면과 게임 씬을 연결 수명과 분리해 관리한다.
    internal sealed partial class PortPreview
    {
        private const string MainScene = "Main"; // 로그인과 회원가입을 표시하는 첫 씬이다.
        private const string LobbyScene = "Lobby"; // 방 검색·참가·대기를 표시하는 씬이다.
        private const string GameScene = "Game"; // 맵, 카메라, 필드 개체가 들어가는 씬이다.
        private const string GameUiScene = "GameUI"; // 게임과 함께 추가로 로드하는 HUD 씬이다.

        private Transform playerModel; // 게임 씬의 본인 캐릭터 표시 모형이다.
        private PortHud frontHud; // 현재 메인 또는 로비 씬이 소유하는 Canvas다.
        private PortHud loadingHud; // 씬이 교체되는 동안 유지하는 로딩 Canvas다.
        private PortMainMenuView mainMenu; // Main 씬에 직렬화된 버튼과 상태 표시의 참조다.
        private CancellationTokenSource googleAttempt; // 브라우저에서 진행 중인 Google 인증을 취소한다.

        // 빌드 및 에디터 Play에서 첫 씬을 표시하고 한 개의 세션 관리자만 만든다.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static async void StartApplication()
        {
            GameObject session = new("ChildrenOfBottom Session"); // 씬이 바뀌어도 소켓과 로그인 세션을 유지하는 루트다.
            DontDestroyOnLoad(session);
            PortPreview application = session.AddComponent<PortPreview>(); // 현재 실행의 연결과 화면 전환을 맡는다.
            application.loadingHud = new PortHud();
            DontDestroyOnLoad(application.loadingHud.CanvasRoot.gameObject);
            application.CreateLoadingOverlay();
            application.SetLoading(false);
            try
            {
                await application.ShowMainAsync();
            }
            catch (Exception error) // error는 첫 씬을 준비할 수 없었던 이유다.
            {
                if (application != null)
                    Debug.LogException(error);
            }
        }

        // 씬을 교체하는 동안 화면 전체를 덮는 로딩 UI를 한 번 구성한다.
        private void CreateLoadingOverlay()
        {
            Canvas canvas = loadingHud.CanvasRoot.GetComponent<Canvas>(); // 씬 Canvas보다 위에 그리는 로딩 Canvas다.
            canvas.sortingOrder = 100;
            RectTransform background = AddBackdrop(loadingHud); // 로드 중 입력을 막는 전체 화면 배경이다.
            background.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            loadingHud.Label(background, "Loading", new Vector2(0.5f, 0.5f), Vector2.zero,
                new Vector2(440, 62), 24).text = "게임을 준비하고 있습니다…";
        }

        // 로딩 Canvas를 씬 전환과 초기 월드 준비 상태에 맞춰 표시한다.
        private void SetLoading(bool visible) // visible은 로딩이 사용자 입력을 가려야 하는 상태다.
        {
            loadingHud.CanvasRoot.gameObject.SetActive(visible);
        }

        // 인증 화면과 로비에서 사용할 전체 화면 배경을 만든다.
        private static RectTransform AddBackdrop(PortHud canvas) // canvas는 배경을 붙일 화면이다.
        {
            RectTransform background = PortHud.Panel(canvas.CanvasRoot, "Background", Vector2.zero, Vector2.zero, Vector2.zero); // 화면 전체를 채울 배경이다.
            background.anchorMax = Vector2.one;
            background.GetComponent<UnityEngine.UI.Image>().color = new Color(0.045f, 0.07f, 0.10f);
            return background;
        }

        // 메인과 로비의 Display 1을 채워 에디터에서도 메뉴를 가리는 카메라 안내가 나오지 않게 한다.
        private static void CreateMenuCamera()
        {
            GameObject background = new("Menu Camera"); // 현재 메뉴 씬에서만 사용하는 배경 카메라다.
            Camera camera = background.AddComponent<Camera>(); // 3D 오브젝트 없이 배경색만 그린다.
            camera.cullingMask = 0;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.045f, 0.07f, 0.10f);
        }

        // 메인 씬에 이미 배치된 UI 버튼을 찾아 이벤트를 연결하고 안내 문구를 설정한다.
        private async Task ShowMainAsync(string notice = "") // notice는 로그인 및 접속 결과 안내다.
        {
            if (SceneManager.GetActiveScene().name != MainScene)
            {
                ReleaseSceneViews();
                await SceneManager.LoadSceneAsync(MainScene);
            }
            lifetime.Token.ThrowIfCancellationRequested();
            if (mainMenu == null)
            {
                CreateMenuCamera(); // 메뉴 씬에서도 Display 1의 카메라 안내가 겹치지 않게 한다.
                mainMenu = UnityEngine.Object.FindFirstObjectByType<PortMainMenuView>(FindObjectsInactive.Include);
                if (mainMenu == null)
                    throw new InvalidOperationException("Main.unity에 PortMainMenuView가 없습니다.");
                mainMenu.BindCallbacks(StartGoogle, StartGuest, CancelGoogle);
            }
            mainMenu.SetNotice(notice);
        }

        // Google 로그인 또는 첫 가입을 시작하고 승인된 계정으로 소켓을 연다.
        private async void StartGoogle() => await StartSessionAsync(true);

        // Google 계정과 분리된 기존 게스트 모드로 로비에 입장한다.
        private async void StartGuest() => await StartSessionAsync(false);

        // 브라우저에서 진행 중인 인증만 취소하고 메인 화면에 남는다.
        private void CancelGoogle() => googleAttempt?.Cancel();

        // 사용자 인증이 끝난 뒤 같은 출처의 게임 서버를 연결한다.
        private async Task StartSessionAsync(bool google) // google은 앱 계정으로 로그인할지 나타낸다.
        {
            if (startingConnection)
                return;
            startingConnection = true;
            try
            {
                resumeDeadline = 0;
                connectionSettings = PortConnection.Load();
                memberCookies = null;
                if (google)
                {
                    using var attempt = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); // 현재 Google 인증의 취소 및 제한 시간이다.
                    googleAttempt = attempt;
                    attempt.CancelAfter(TimeSpan.FromMinutes(3));
                    mainMenu.SetGoogleCancelVisible(true);
                    mainMenu.SetNotice("브라우저에서 Google 인증을 마치고 게임으로 돌아오세요.");
                    try
                    {
                        memberCookies = await connectionSettings.SignInGoogleAsync(attempt.Token);
                    }
                    finally
                    {
                        googleAttempt = null;
                        if (mainMenu != null)
                            mainMenu.SetGoogleCancelVisible(false);
                    }
                }
                mainMenu.SetNotice("게임 서버에 연결하고 있습니다.");
                await RunSessionAsync();
            }
            catch (OperationCanceledException)
            {
                if (!lifetime.IsCancellationRequested && mainMenu != null)
                    mainMenu.SetNotice("인증이 취소되었거나 대기 시간이 지났습니다.");
            }
            catch (Exception error) // error는 설정 오류 또는 인증 서버 연결 실패다.
            {
                if (!lifetime.IsCancellationRequested)
                    await ShowMainAsync(error is InvalidOperationException ? error.Message : "인증 서버에 연결할 수 없습니다.");
            }
            finally
            {
                startingConnection = false;
            }
        }

        // 같은 소켓을 유지한 채 로비 씬을 열거나 현재 로비의 방 목록으로 돌아간다.
        private async Task ShowLobbyAsync(string notice = "") // notice는 대기실 퇴장 또는 복귀 안내다.
        {
            if (lobby == null)
            {
                ReleaseSceneViews();
                await SceneManager.LoadSceneAsync(LobbyScene);
                lifetime.Token.ThrowIfCancellationRequested();
                CreateMenuCamera();
                frontHud = new PortHud();
                AddBackdrop(frontHud);
                lobby = new PortLobby(frontHud, EnterRoom, StartRoom, ReadyRoom, LeaveRoom, BrowseRooms, SetRoomPrivacy);
            }
            lobby.ShowEntry(notice);
            SetLoading(false);
        }

        // 서버의 시작 확정 이후 게임과 HUD 씬을 로드하고 소유할 오브젝트를 만든다.
        private async Task LoadGameAsync()
        {
            if (hud != null)
                return;
            SetLoading(true);
            await Awaitable.NextFrameAsync();
            lifetime.Token.ThrowIfCancellationRequested();
            ReleaseSceneViews();
            await SceneManager.LoadSceneAsync(GameScene);
            lifetime.Token.ThrowIfCancellationRequested();
            await SceneManager.LoadSceneAsync(GameUiScene, LoadSceneMode.Additive);
            lifetime.Token.ThrowIfCancellationRequested();

            worldMaterial = Resources.Load<Material>("WorldSurface");
            if (worldMaterial == null)
                throw new InvalidOperationException("월드 표시용 URP 재질을 불러오지 못했습니다.");
            GameObject player = GameObject.CreatePrimitive(PrimitiveType.Capsule); // 서버 피격 지름과 같은 폭의 본인 표시 모형이다.
            player.name = "ChildrenOfBottom Player";
            playerModel = player.transform;
            playerModel.localScale = new Vector3(0.24f, 0.38f, 0.24f);
            Tint(player, worldMaterial, new Color(1f, 0.77f, 0.20f));
            sceneCamera = Camera.main;
            sceneCamera.orthographic = true;
            sceneCamera.clearFlags = CameraClearFlags.SolidColor;
            sceneCamera.backgroundColor = new Color(0.045f, 0.07f, 0.10f);
            world = new PortWorldView(WorldScale, worldMaterial);
            items = new PortItemView(WorldScale, worldMaterial);

            hud = new PortHud(Interact, ToggleSkills);
            SceneManager.MoveGameObjectToScene(hud.CanvasRoot.gameObject, SceneManager.GetSceneByName(GameUiScene));
            skillShop = new PortSkillShop(hud, RequestSkill);
            mapView = new PortMapView(hud, OpenMap);
            touchControls = new PortTouchControls(hud, CastTouchSkill);
            options = new PortGameOptions(hud, OpenOptions, PromptLeave, SendPriority, SendTestOptions, touchControls);
        }

        // 교체할 씬의 화면 자료와 메모리를 정리하고 연결은 현재 실행에 남긴다.
        private void ReleaseSceneViews()
        {
            playingOnServer = false;
            resultShowing = false;
            ResetInput();
            if (mainMenu != null)
                mainMenu.UnbindCallbacks();
            frontHud?.Clear();
            hud?.Clear();
            mapView?.Dispose();
            items?.Clear();
            touchControls?.Dispose();
            world?.Clear();
            frontHud = null;
            mainMenu = null;
            lobby = null;
            hud = null;
            mapView = null;
            items = null;
            world = null;
            skillShop = null;
            touchControls = null;
            options = null;
            sceneCamera = null;
            terrain = null;
            playerModel = null;
            localName = null;
            localWorldStatus = null;
            interactionTarget = null;
        }
    }
}
