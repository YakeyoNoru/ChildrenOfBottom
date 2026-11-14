using System;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.InputSystem;

namespace ChildrenOfBottom
{
    // 씬 전환 중에도 연결을 유지하고 서버 상태를 현재 화면에 반영한다.
    internal sealed partial class PortPreview : MonoBehaviour
    {
        // 서버 월드 좌표 100단위를 Unity 1미터로 표시한다.
        private const float WorldScale = 0.01f;

        // 캐릭터 중심 기준으로 기울어진 카메라의 상대 위치다. 단위는 미터다.
        private static readonly Vector3 CameraOffset = new(0f, 14f, -10f);

        // 웹 화면과 동일한 가로 시야이며 플레이어 표시 지름 36의 19배(서버 월드 단위)다.
        private const float CameraWorldWidth = 19f * 36f;

        // 로컬 또는 운영 출처와 선택적 회원 세션을 현재 실행 메모리에 보관한다.
        private PortConnection connectionSettings;
        private CookieContainer memberCookies;
        private bool startingConnection; // 진행 중인 인증이나 서버 세션의 중복 시작을 막는다.

        // 씬이 끝나면 서버 수신과 이동 전송을 중단하는 신호다.
        private readonly CancellationTokenSource lifetime = new();

        // 플레이어의 표시 위치를 따라갈 직교 카메라다.
        private Camera sceneCamera;

        // 배경용 지도 또는 현재 서버 지도가 들어 있는 루트다.
        private GameObject terrain;

        // 게임 씬에서 사용하는 월드 외형 프리팹 모음이다.
        private PortWorldPrefabs worldPrefabs;

        // 서버 평면 위치에서 화면상의 지면 높이를 읽는 자료다.
        private PortTerrainSurface terrainSurface;

        // 원격 개체와 서버 공격 범위를 그리는 화면 자료다.
        private PortWorldView world;

        // 필드 아이템과 획득 비행을 그리는 화면 자료다.
        private PortItemView items;

        // 서버가 현재 연결의 welcome에서 발급한 본인 식별자다.
        private string playerId;

        // 체력, 경험치, 기술, 상호작용, 결과를 표시할 Canvas다.
        private PortHud hud;

        // 방 생성·참가·준비를 표시하는 로비 화면이다.
        private PortLobby lobby;

        // 서버 손패의 구매·리롤과 기술 장착을 보여 주는 게임 메뉴다.
        private PortSkillShop skillShop;

        // 본인의 탐색 이력을 공유하는 미니맵과 전체맵이다.
        private PortMapView mapView;

        // 자동 감지와 수동 표시 설정을 가진 터치 조이스틱과 기술 버튼이다.
        private PortTouchControls touchControls;

        // 게임 메뉴, 읽기 전용 서버 상태와 테스트 옵션이다.
        private PortGameOptions options;

        // 게임 중 본인만 퇴장하는 확인창이 열려 있는지 나타낸다.
        private bool leavingPrompt;

        // 화면에 표시할 본인 이름과 이름표다.
        private string localName;
        // 본인 모형 위 체력바에 사용하는 최신 서버 스테이터스다.
        private PortProtocol.EntityStatus localWorldStatus;

        // 서버가 현재 로비 명령에 답할 때까지 중복 요청을 막는다.
        private bool lobbyPending;

        // 현재 Play 세션 메모리에만 보관하는 서버 복귀 권한이다.
        private string resumeToken;

        // 재접속을 시도할 수 있는 서버 유예시간이며 단위는 밀리초다.
        private int resumeGraceMs;

        // 현재 단절에 대해 재접속 시도를 멈출 단조 시각이다. 단위는 초다.
        private double resumeDeadline;

        // 서버에서 확인한 가장 가까운 상호작용 대상 식별자다.
        private string interactionTarget;

        // 서버가 발급한 탈출 확인 ID이며 확인창이 닫히면 비운다.
        private string confirmationId;

        // 결과 확인과 퇴장에 사용할 서버의 확정 결과다.
        private PortProtocol.Result matchResult;
        private const double ResultSeconds = 60d; // 결과 화면에서 로비로 자동 복귀하기까지의 시간(초)이다.
        private double resultDeadline; // 현재 결과의 자동 퇴장 시각이며 시작 이후 실제 시간(초)이다.
        private bool resultReady; // 서버에서 결과 확인을 기록해 퇴장할 수 있는 상태다.
        private bool resultShowing; // 현재 대화창이 결과를 표시 중일 때만 초를 갱신한다.
        private bool resultAutoLeaveSent; // 같은 연결에서 자동 퇴장을 중복 전송하지 않게 한다.
        private int shownResultSeconds; // 화면에 이미 표시한 남은 초다.

        // 이동과 중복 송신하지 않도록 대기시키는 화면 명령 JSON이다.
        private string controlPacket;

        // 현재 서버 연결과 방 입장에 사용하는 소켓이다.
        private GameSocket socket;

        // 50ms 이동 입력을 순번으로 저장하고 서버 위치에 재실행한다.
        private readonly PortLocalMotion localMotion = new();

        // 동일 방에서 반영한 마지막 서버 스냅샷 순번이다.
        private long lastStateSequence;
        // 마지막 스냅샷 생성 시각이며 단위는 서버 밀리초다.
        private long lastStateServerTime;

        // 서버가 확정한 목표 위치다. 단위는 Unity 미터다.
        private Vector3 serverPosition;

        // 서버가 방의 게임 시작을 확정하고 내 위치를 보내면 켜진다.
        private bool playingOnServer;

        // 게임 중 중복 송신을 막기 위해 현재 송신 작업을 기록한다.
        private Task sending = Task.CompletedTask;

        // 다음 이동 스텝 직후 서버에 시전할 슬롯이며 대기 요청이 없으면 null이다.
        private string pendingCast;

        // 서버의 전체 맵에서 높이별 타일과 접점이 맞는 다리를 생성한다.
        private void BuildTerrain(PortProtocol.Map map) // map은 서버가 확정한 평면 지도다.
        {
            if (terrain != null)
                Destroy(terrain);
            terrain = new GameObject("ChildrenOfBottom Pit Map");
            terrainSurface = new PortTerrainSurface(map, worldPrefabs, WorldScale);
            world.UseTerrain(terrainSurface);
            items.UseTerrain(terrainSurface);

            for (int index = 0; index < map.tiles.Length; index++) // index는 서버 타일 배열 순번이다.
            {
                PortProtocol.Tile tile = map.tiles[index]; // 표시할 서버 타일이다.
                Vector3 center = terrainSurface.Centers[index]; // 타일 윗면 중심(미터)이다.
                GameObject land = Instantiate(worldPrefabs.Tile(tile.height), terrain.transform); // 해당 높이의 타일 인스턴스다.
                land.name = $"Tile {tile.id}";
                land.transform.position = new Vector3(center.x, 0f, center.z);
                land.transform.localScale = Vector3.Scale(land.transform.localScale, new Vector3(terrainSurface.Radius, 1f, terrainSurface.Radius));
                if (tile.id == 1)
                    playerModel.position = center + Vector3.up * 0.38f;
            }

            foreach (PortTerrainSurface.Ramp ramp in terrainSurface.Ramps) // ramp는 다리의 접점과 표시 폭이다.
            {
                GameObject deck = Instantiate(worldPrefabs.Bridge, terrain.transform); // 월드에 배치할 다리 프리팹이다.
                deck.name = "Bridge";
                Vector3 longAxis = ramp.End - ramp.Start; // 경사를 포함한 다리 길이 벡터(미터)다.
                if (longAxis.sqrMagnitude <= 0.000001f)
                {
                    Destroy(deck);
                    continue;
                }
                Quaternion rotation = Quaternion.LookRotation(longAxis); // 다리 표면이 접점 사이를 잇는 회전이다.
                Vector3 shift = rotation * Vector3.up * (deck.transform.localScale.y * 0.5f); // 중심 축에서 윗면까지의 오프셋(미터)이다.
                deck.transform.SetPositionAndRotation((ramp.Start + ramp.End) / 2f - shift, rotation);
                deck.transform.localScale = Vector3.Scale(deck.transform.localScale, new Vector3(ramp.Width, 1f, longAxis.magnitude));
            }
        }

        // 연결이 끊긴 진행 중 참가자는 서버가 허용한 시간 안에 같은 캐릭터로 돌아온다.
        private async Task RunSessionAsync()
        {
            // Play를 종료하면 연결과 재접속 대기가 함께 끝난다.
            CancellationToken cancellationToken = lifetime.Token;
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await RunConnectionAsync(cancellationToken);
                    return;
                }
                catch (Exception error) // error는 연결, 수신 또는 종료 실패를 나타낸다.
                {
                    if (cancellationToken.IsCancellationRequested)
                        return;

                    playingOnServer = false;
                    resultShowing = false;
                    socket = null;
                    items?.Reset();
                    skillShop?.Reset();
                    mapView?.Reset();
                    options?.Reset();
                    ResetInput();
                    lobbyPending = false;
                    if (error is GameSocketClosedException closed && (int?)closed.Status == 4001) // closed는 서버의 세션 인계 통지다.
                    {
                        resumeToken = null;
                        SetLoading(false);
                        await ShowMainAsync("다른 연결에서 이 게임을 이어서 플레이 중입니다.");
                        return;
                    }
                    if (resumeDeadline == 0)
                        resumeDeadline = Time.realtimeSinceStartupAsDouble + resumeGraceMs / 1000d;
                    if (resumeToken == null || Time.realtimeSinceStartupAsDouble >= resumeDeadline ||
                        !(error is WebSocketException || error is GameSocketClosedException || error is OperationCanceledException))
                    {
                        Debug.LogWarning($"게임 서버 연결이 끝났습니다. {error}");
                        resumeToken = null;
                        SetLoading(false);
                        await ShowMainAsync("게임 서버에 연결하지 못했습니다. 연결을 확인해 주세요.");
                        return;
                    }

                    hud?.ShowDialog("연결 끊김", "같은 캐릭터로 다시 연결하고 있습니다.", "연결 중", null);
                    try
                    {
                        await Task.Delay(1000, cancellationToken);
                    }
                    catch (OperationCanceledException)
                    {
                        return;
                    }
                }
            }
        }

        // 하나의 소켓에서 로비, 복귀, 게임과 결과 이벤트를 처리한다.
        private async Task RunConnectionAsync(CancellationToken cancellationToken) // Play 종료 시 연결 및 수신을 중단한다.
        {
            // 연결이 끊기면 다음 복귀 시도에서 새 소켓을 만든다.
            using var connection = new GameSocket();
            socket = connection;
            // 접속이 지연되어 복귀 시도가 멈추지 않도록 연결에 제한 시간을 둔다.
            using (var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken))
            {
                connectTimeout.CancelAfter(TimeSpan.FromSeconds(5));
                await connection.ConnectAsync(connectionSettings.Endpoint(memberCookies != null), connectTimeout.Token,
                    memberCookies?.GetCookieHeader(connectionSettings.Origin));
            }
            while (!cancellationToken.IsCancellationRequested)
            {
                // 분할 WebSocket 프레임을 합쳐 읽은 서버 메시지다.
                string json = await connection.ReceiveAsync(cancellationToken); // 읽기 전용 상태 목록에서도 쓸 서버 메시지 원문이다.
                PortProtocol.Message message; // 프로토콜 버전과 서버 이벤트를 검사할 메시지다.
                try
                {
                    message = PortProtocol.Read<PortProtocol.Message>(json);
                }
                catch (Exception error) // 원본 메시지와 토큰을 로그에 노출하지 않고 파싱 단계만 기록한다.
                {
                    throw new InvalidDataException($"서버 메시지를 읽지 못했습니다 ({error.GetType().Name}).");
                }
                if (message.v != 1)
                    throw new InvalidDataException("지원하지 않는 게임 프로토콜입니다.");

                switch (message.type)
                {
                    case "welcome":
                        playerId = message.playerId;
                        if (resumeToken == null)
                            await ShowLobbyAsync();
                        else
                            await connection.SendAsync($"{{\"v\":1,\"type\":\"session.resume\",\"token\":\"{resumeToken}\"}}", cancellationToken);
                        break;
                    case "session.ready":
                        resumeToken = message.token;
                        resumeGraceMs = message.graceMs;
                        break;
                    case "session.resumed":
                        playerId = message.playerId;
                        resumeDeadline = 0;
                        ResetInput();
                        hud?.HideDialog();
                        break;
                    case "session.rejected":
                        resumeToken = null;
                        resumeDeadline = 0;
                        matchResult = null;
                        await ShowLobbyAsync(message.message ?? "복귀할 수 있는 게임이 없습니다.");
                        break;
                    case "room.state" when message.room.phase == "lobby":
                        if (lobby == null)
                            await ShowLobbyAsync();
                        lobby.ShowRoom(message.room, playerId);
                        break;
                    case "room.state":
                        if (hud == null && message.room.map == null)
                            break;
                        await LoadGameAsync();
                        if (!AcceptState(message.room))
                            break;
                        skillShop.ReceiveCatalog(message.room.skillCatalog);
                        mapView.Prepare(message.room.code, message.room.map);
                        localMotion.UseMap(message.room.map);
                        if (message.room.map != null && !playingOnServer)
                            BuildTerrain(message.room.map);
                        world.Apply(message.room, playerId, Time.unscaledTimeAsDouble);
                        items.Apply(message.room, Time.unscaledTimeAsDouble);
                        ApplyPlayer(message.room, playerId, json);
                        if (playingOnServer && terrain != null)
                            SetLoading(false);
                        break;
                    case "game.state":
                        if (hud == null || !AcceptState(message.room))
                            break;
                        world.Apply(message.room, playerId, Time.unscaledTimeAsDouble);
                        items.Apply(message.room, Time.unscaledTimeAsDouble);
                        ApplyPlayer(message.room, playerId, json);
                        if (playingOnServer && terrain != null)
                            SetLoading(false);
                        break;
                    case "game.result":
                        playingOnServer = false;
                        if (matchResult?.id != message.result.id)
                            resultDeadline = Time.realtimeSinceStartupAsDouble + ResultSeconds;
                        resultAutoLeaveSent = false;
                        matchResult = message.result;
                        confirmationId = null;
                        pendingCast = null;
                        controlPacket = null;
                        items.Reset();
                        skillShop.Reset();
                        mapView.Reset();
                        options.Reset();
                        hud.EndMatch();
                        ShowResult(false);
                        await sending;
                        await connection.SendAsync($"{{\"v\":1,\"type\":\"game.result.seen\",\"resultId\":\"{matchResult.id}\"}}", cancellationToken);
                        break;
                    case "game.result.ready":
                        if (matchResult?.id == message.resultId)
                            ShowResult(true);
                        break;
                    case "game.result.left":
                        matchResult = null;
                        resumeToken = null;
                        ResetInput();
                        await ShowLobbyAsync();
                        break;
                    case "room.left":
                    case "room.closed":
                        playingOnServer = false;
                        resumeToken = null;
                        lobbyPending = false;
                        ResetInput();
                        await ShowLobbyAsync(message.message ?? "");
                        break;
                    case "room.list":
                        lobby?.ReceiveRooms(message.rooms);
                        break;
                    case "ack" when message.requestId == "lobby":
                        lobbyPending = false;
                        break;
                    case "ack" when message.requestId == "skill-shop":
                        skillShop.Complete("");
                        break;
                    case "ack" when message.requestId == "test-options":
                        options.CompleteTests("");
                        break;
                    case "error" when message.requestId == "test-options":
                        options.CompleteTests(message.message ?? message.code);
                        break;
                    case "error" when message.requestId == "target-priority":
                        Debug.Log($"서버 공격 우선대상 응답: {message.code}");
                        break;
                    case "error" when message.requestId == "skill-shop":
                        skillShop.Complete(message.message ?? message.code);
                        break;
                    case "error" when message.requestId == "lobby":
                        lobbyPending = false;
                        lobby?.Notice(message.message ?? message.code);
                        break;
                    case "interaction.prompt":
                        confirmationId = message.id;
                        pendingCast = null;
                        hud.ShowDialog("탈출 확인", "지금 탈출하시겠습니까?", "예 [Y]", AcceptEscape, "아니요 [N]", RejectEscape);
                        break;
                    case "error" when message.requestId == "interaction":
                        confirmationId = null;
                        hud.HideDialog();
                        Debug.Log($"서버 상호작용 응답: {message.code}");
                        break;
                    case "error" when message.requestId == "leave-result" && matchResult != null:
                        ShowResult(true);
                        Debug.Log($"서버 결과 퇴장 응답: {message.code}");
                        break;
                    case "error" when message.requestId?.StartsWith("cast-", StringComparison.Ordinal) == true:
                        Debug.Log($"서버 기술 사용 응답: {message.code}");
                        break;
                    case "error" when !playingOnServer && message.requestId == null &&
                                      (message.code == "NOT_IN_ROOM" || message.code == "GAME_NOT_STARTED"):
                        // 결과 확정 직전에 전송된 이동 입력의 늦은 응답이다.
                        break;
                    case "error":
                        throw new InvalidOperationException($"게임 서버 오류 {message.code}");
                }
            }
        }

        // 방 이동이나 재접속 뒤 첫 입력을 순번 1에서 다시 시작한다.
        private void ResetInput()
        {
            localMotion.Reset();
            touchControls?.Reset();
            world?.ResetMotion();
            lastStateSequence = 0;
            lastStateServerTime = 0;
            pendingCast = null;
            controlPacket = null;
            confirmationId = null;
            leavingPrompt = false;
        }

        // 중복 또는 역순 스냅샷을 상태와 예측 모두에 반영하지 않는다.
        private bool AcceptState(PortProtocol.Room room) // 서버가 생성한 진행 중 방 스냅샷이다.
        {
            if (room.snapshotSequence <= 0)
                return true;
            if (room.snapshotSequence <= lastStateSequence ||
                (room.serverTime > 0 && room.serverTime < lastStateServerTime))
                return false;
            lastStateSequence = room.snapshotSequence;
            lastStateServerTime = room.serverTime;
            return true;
        }

        // 서버의 본인 좌표를 Unity의 표시 위치로 변환하고 확인 순번을 저장한다.
        private void ApplyPlayer(
            PortProtocol.Room room, // 서버가 보낸 방 상태다.
            string playerId, // 현재 서버 연결이 부여한 본인 식별자다.
            string json) // 읽기 전용으로 표시할 서버 상태 원문이다.
        {
            foreach (PortProtocol.Entity player in room.players) // player는 이번 상태의 참가자 한 명이다.
            {
                if (player.id != playerId)
                    continue;
                // 서버의 위치가 순간이동한 경우 화면도 즉시 옮겨 중간 경로를 탐색하지 않는다.
                Vector3 nextPosition = terrainSurface.Position(player.x, player.y, 0.38f); // 서버 위치에 대응하는 캐릭터 표시 좌표(미터)다.
                const float teleportDistance = PortMapRaster.TeleportThreshold * WorldScale; // 순간이동 표시를 나누는 Unity 미터 거리다.
                Vector2 planarChange = new(nextPosition.x - serverPosition.x, nextPosition.z - serverPosition.z); // 순간이동 검사에 쓰는 평면 차이(미터)다.
                if (playingOnServer && planarChange.sqrMagnitude > teleportDistance * teleportDistance)
                    playerModel.position = nextPosition;
                serverPosition = nextPosition;
                localMotion.Receive(player, Time.unscaledTimeAsDouble);
                items.Reconcile(player);
                interactionTarget = world.FindInteraction(player);
                skillShop.ReceiveStatus(player.status);
                touchControls.Receive(player.status, skillShop);
                options.Receive(player, json, Time.unscaledTimeAsDouble);
                localName = player.name;
                localWorldStatus = player.status;
                mapView.Receive(room, player);
                hud.UpdateStatus(player.status, room.timer.remainingMs, interactionTarget != null && CanControl(),
                    player.poisonDamage);
                if (!playingOnServer)
                {
                    playerModel.position = serverPosition;
                    playingOnServer = true;
                    SendPriority(options.TargetPriority);
                    Debug.Log("ChildrenOfBottom 서버 맵과 플레이어 위치를 받았습니다.");
                }
                return;
            }
        }

        // 키보드 입력을 50ms 간격으로 서버에 보내고 서버 좌표를 부드럽게 표시한다.
        private void Update()
        {
            if (controlPacket != null && sending.IsCompleted && socket != null)
            {
                // 이전 이동 송신이 끝난 뒤 UI 요청을 같은 소켓으로 보낸다.
                string packet = controlPacket;
                controlPacket = null;
                sending = SendControlAsync(packet);
            }

            if (hud == null)
                return;
            if (resultShowing && matchResult != null)
                UpdateResultCountdown();
            touchControls.SetAvailable(playingOnServer, CanControl());
            options.SetAvailable(playingOnServer);
            if (!playingOnServer)
                return;

            ReadGameActions();
            TrySendMovement();
            // 서버 확정 좌표와 분리된 예측 목표까지 화면 모형만 부드럽게 움직인다.
            Vector2 predicted = localMotion.Predicted;
            Vector3 target = new(predicted.x * WorldScale, 0f, -predicted.y * WorldScale); // 수평 보간 목표인 Unity XZ 위치(미터)다.
            float weight = 1f - Mathf.Exp(-25f * Mathf.Min(Time.unscaledDeltaTime, 0.05f));
            Vector3 display = Vector3.Lerp(playerModel.position, target, weight); // 화면 모형의 수평 보간 위치(미터)다.
            display.y = terrainSurface.HeightAt(new Vector2(display.x, display.z)) + 0.38f;
            playerModel.position = display;
        }

        // 서버의 고정 스텝 시각과 상태가 허용하면 하나의 이동을 예측하고 전송한다.
        private void TrySendMovement()
        {
            if (!sending.IsCompleted)
                return;

            // 현재 연결된 키보드이며 포커스를 잃으면 0 입력을 보낸다.
            bool canControl = CanControl(); // 모달과 포커스를 고려한 입력 가능 여부다.
            Keyboard keyboard = canControl ? Keyboard.current : null;
            // 서버로 보낼 오른쪽 양수 가로 입력이다.
            int x = keyboard == null ? 0 : (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed ? 1 : 0)
                - (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed ? 1 : 0);
            // 서버로 보낼 아래쪽 양수 세로 입력이다.
            int y = keyboard == null ? 0 : (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed ? 1 : 0)
                - (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed ? 1 : 0);

            Vector2 stick = canControl ? touchControls.Axis : Vector2.zero; // 서버에 적용할 아날로그 이동축이다.
            Vector2 direction = new(x == 0 ? stick.x : x, y == 0 ? stick.y : y); // 축별 키보드 입력이 없으면 조이스틱을 사용한다.
            int sequence = localMotion.Command(direction, Time.unscaledTimeAsDouble); // 이 이동에 배정된 서버 순번이며 0이면 다음 프레임에 다시 확인한다.
            if (sequence == 0)
                return;
            // 이번 이동 순번 직후 실행할 기술 요청이며 전송 시작 뒤에는 다시 쓰지 않는다.
            string slot = pendingCast;
            pendingCast = null;
            sending = SendInputAsync(sequence, direction, slot);
        }

        // 포커스가 있고 게임 조작을 막는 화면이 없을 때만 이동과 터치 버튼을 허용한다.
        private bool CanControl()
        {
            return Application.isFocused && confirmationId == null && !leavingPrompt &&
                !skillShop.IsOpen && !mapView.IsOpen && !options.IsOpen;
        }

        // 터치 기술을 데스크톱 입력과 같은 서버 순서에 넣는다.
        private void CastTouchSkill(string slot) // 화면에서 누른 서버 A·B·C 슬롯이다.
        {
            if (playingOnServer && CanControl() && !mapView.BlocksPointer && pendingCast == null)
                pendingCast = slot;
        }

        // 웹과 같은 버튼으로 기술을 한 번 요청하고 다음 이동 입력까지 보관한다.
        private void ReadGameActions()
        {
            if (!Application.isFocused)
            {
                pendingCast = null;
                return;
            }
            // 좌클릭과 우클릭의 새 입력을 확인할 현재 마우스다.
            Mouse mouse = Mouse.current;
            // 상호작용과 기술의 새 입력을 확인할 현재 키보드다.
            Keyboard keyboard = Keyboard.current;
            if (leavingPrompt)
            {
                if (keyboard?.escapeKey.wasPressedThisFrame == true)
                    CancelLeave();
                return;
            }
            if (options.IsOpen)
            {
                if (keyboard?.escapeKey.wasPressedThisFrame == true)
                    options.Escape();
                return;
            }
            if (confirmationId != null)
            {
                if (keyboard?.yKey.wasPressedThisFrame == true)
                    AcceptEscape();
                else if (keyboard?.nKey.wasPressedThisFrame == true || keyboard?.escapeKey.wasPressedThisFrame == true)
                    RejectEscape();
                return;
            }
            if (mapView.IsOpen)
            {
                if (keyboard?.tabKey.wasPressedThisFrame == true || keyboard?.escapeKey.wasPressedThisFrame == true)
                    mapView.Close();
                return;
            }
            if (keyboard?.tabKey.wasPressedThisFrame == true)
            {
                OpenMap();
                return;
            }
            if (keyboard?.bKey.wasPressedThisFrame == true)
            {
                ToggleSkills();
                return;
            }
            if (skillShop.IsOpen)
            {
                if (keyboard?.escapeKey.wasPressedThisFrame == true)
                    skillShop.Hide();
                return;
            }
            if (keyboard?.escapeKey.wasPressedThisFrame == true)
            {
                OpenOptions();
                return;
            }
            if (keyboard?.fKey.wasPressedThisFrame == true)
                Interact();
            if (pendingCast != null || controlPacket != null || mapView.BlocksPointer ||
                UnityEngine.EventSystems.EventSystem.current?.IsPointerOverGameObject() == true)
                return;
            if (mouse?.leftButton.wasPressedThisFrame == true)
                pendingCast = "A";
            else if (mouse?.rightButton.wasPressedThisFrame == true)
                pendingCast = "B";
            else if (keyboard?.shiftKey.wasPressedThisFrame == true)
                pendingCast = "C";
        }

        // 현재 캐릭터를 중심으로 전체맵을 열고 이전 게임 입력을 비운다.
        private void OpenMap()
        {
            if (!playingOnServer || confirmationId != null || leavingPrompt || options.IsOpen || mapView.BlocksPointer)
                return;
            pendingCast = null;
            skillShop.Hide();
            mapView.Open();
        }

        // HUD 버튼과 B 키에서 같은 기술 창을 열거나 닫는다.
        private void ToggleSkills()
        {
            if (!playingOnServer || confirmationId != null || leavingPrompt || options.IsOpen || mapView.IsOpen || mapView.BlocksPointer)
                return;
            pendingCast = null;
            if (skillShop.IsOpen)
                skillShop.Hide();
            else
                skillShop.Show();
        }

        // 가까운 대상의 상호작용을 요청한다. 최종 거리와 소유 조건은 서버가 확인한다.
        private void Interact()
        {
            if (playingOnServer && CanControl() && !mapView.BlocksPointer &&
                interactionTarget != null && controlPacket == null)
                controlPacket = $"{{\"v\":1,\"type\":\"game.interact\",\"targetId\":\"{interactionTarget}\",\"requestId\":\"interaction\"}}";
        }

        // 기존 게임 위에서 옵션을 열고 남은 시전 입력을 지운다.
        private void OpenOptions()
        {
            if (!playingOnServer || !CanControl() || mapView.BlocksPointer)
                return;
            pendingCast = null;
            options.Show();
        }

        // 본인만 현재 서버 방에서 빠지는 동작을 확인한다.
        private void PromptLeave()
        {
            if (!playingOnServer || controlPacket != null)
                return;
            options.Close();
            leavingPrompt = true;
            hud.ShowDialog("게임에서 나가기", "다른 참가자는 계속 플레이합니다.", "나가기", ConfirmLeave, "취소", CancelLeave);
        }

        // 확인 버튼으로 현재 서버 방만 명시적으로 떠난다.
        private void ConfirmLeave()
        {
            if (!leavingPrompt)
                return;
            LeaveRoom();
            if (lobbyPending)
                hud.ShowDialog("게임에서 나가기", "서버 응답을 기다리고 있습니다.", "대기 중", null);
        }

        // 퇴장 확인을 닫고 기존 게임 메뉴로 복귀한다.
        private void CancelLeave()
        {
            if (lobbyPending)
                return;
            leavingPrompt = false;
            hud.HideDialog();
            options.Show();
        }

        // 웹과 동일한 우선대상 선택을 서버에 요청한다.
        private bool SendPriority(string priority) // 서버가 검증할 우선대상 문자열이다.
        {
            if (!playingOnServer || controlPacket != null)
                return false;
            controlPacket = $"{{\"v\":1,\"type\":\"game.options\",\"targetPriority\":\"{priority}\",\"requestId\":\"target-priority\"}}";
            return true;
        }

        // 서버 권한을 가진 이름에 한해 테스트 상태의 두 값을 전송한다.
        private bool SendTestOptions(bool mapHack, bool highSpeed) // mapHack은 전체맵, highSpeed는 이동 속도 설정이다.
        {
            if (!playingOnServer || localName != "열쇠" || controlPacket != null)
                return false;
            controlPacket = $"{{\"v\":1,\"type\":\"game.testOptions\",\"mapHack\":{(mapHack ? "true" : "false")},\"highSpeed\":{(highSpeed ? "true" : "false")},\"requestId\":\"test-options\"}}";
            return true;
        }

        // 기술 창에서 누른 구매·장착·리롤을 기존 서버 규약으로 전송 대기시킨다.
        private bool RequestSkill(string command, string code) // command는 상점 명령, code는 서버가 제공한 기술 코드다.
        {
            if (!playingOnServer || controlPacket != null || !skillShop.IsOpen)
                return false;
            // 리롤은 기술 코드를 보내지 않고 구매와 장착만 선택한 코드를 붙인다.
            string selection = code == null ? "" : $",\"code\":\"{code}\"";
            controlPacket = $"{{\"v\":1,\"type\":\"{command}\",\"requestId\":\"skill-shop\"{selection}}}";
            return true;
        }

        // 서버에 탈출 확인을 수락한다.
        private void AcceptEscape() => ConfirmEscape(true);

        // 서버에 탈출 확인을 거절한다.
        private void RejectEscape() => ConfirmEscape(false);

        // 서버 확인 ID와 선택을 전송 대기열에 올린다.
        private void ConfirmEscape(bool accept) // true이면 탈출을 요청한다.
        {
            if (confirmationId == null || controlPacket != null)
                return;
            controlPacket = $"{{\"v\":1,\"type\":\"game.interact.confirm\",\"confirmationId\":\"{confirmationId}\",\"accept\":{(accept ? "true" : "false")},\"requestId\":\"interaction\"}}";
            confirmationId = null;
            hud.HideDialog();
        }

        // 서버가 확정한 사유와 경쟁 점수로 결과 화면을 연다.
        private void ShowResult(bool ready) // 서버가 결과 확인을 기록한 경우에만 퇴장할 수 있다.
        {
            resultReady = ready;
            resultShowing = true;
            // 서버의 종료 사유에 대응하는 화면 문구다.
            string reason = matchResult.reason switch
            {
                "DEATH" => "사망했습니다.",
                "TIME_LIMIT" => "게임 시간이 종료되었습니다.",
                "ESCAPE" => "탈출했습니다.",
                _ => "게임이 종료되었습니다."
            };
            hud.ShowDialog("게임 결과", $"{reason}\n경쟁 점수  {matchResult.competitionPoints}",
                ready ? "나가기" : "서버 확인 중", ready ? LeaveResult : null);
            shownResultSeconds = -1;
            UpdateResultCountdown();
        }

        // 실제 경과 시간으로 남은 초를 갱신하고 서버가 승인한 뒤 자동 퇴장한다.
        private void UpdateResultCountdown()
        {
            int seconds = (int)Math.Max(0d, Math.Ceiling(resultDeadline - Time.realtimeSinceStartupAsDouble)); // 결과 퇴장까지 화면에 표시할 초다.
            if (shownResultSeconds != seconds)
            {
                shownResultSeconds = seconds;
                hud.SetResultCountdown(seconds);
            }
            if (seconds == 0 && resultReady && !resultAutoLeaveSent && controlPacket == null)
            {
                resultAutoLeaveSent = true;
                LeaveResult();
            }
        }

        // 서버에서 확인한 결과 화면을 퇴장한다.
        private void LeaveResult()
        {
            if (matchResult == null || !resultReady || controlPacket != null)
                return;
            ShowResult(false);
            controlPacket = $"{{\"v\":1,\"type\":\"game.result.leave\",\"resultId\":\"{matchResult.id}\",\"requestId\":\"leave-result\"}}";
        }

        // 사용자 입력을 직렬화하여 방 생성 또는 코드 참가를 요청한다.
        private void EnterRoom(string name, string code, bool publicOnly) // name은 표시 이름, code가 null이면 생성, publicOnly는 목록에서 고른 참가다.
        {
            if (string.IsNullOrWhiteSpace(name) || (code != null && code.Trim().Length != 6))
            {
                lobby.Notice("이름과 참가 코드 6자리를 확인해 주세요.");
                return;
            }
            // 서버 방 생성 또는 참가에 사용할 자료다.
            var request = new PortProtocol.RoomEntry
            {
                type = code == null ? "room.create" : "room.join", name = name, code = code, publicOnly = publicOnly
            };
            QueueLobby(JsonUtility.ToJson(request));
        }

        // 방장 권한으로 서버의 게임 시작을 요청한다.
        private void StartRoom() => QueueLobby("{\"v\":1,\"type\":\"room.start\",\"requestId\":\"lobby\"}");

        // 일반 참가자의 준비 상태를 변경한다.
        private void ReadyRoom(bool ready) // true이면 시작할 준비를 마쳤다는 뜻이다.
        {
            QueueLobby($"{{\"v\":1,\"type\":\"room.ready\",\"ready\":{(ready ? "true" : "false")},\"requestId\":\"lobby\"}}");
        }

        // 시작 전의 현재 대기실을 나간다.
        private void LeaveRoom() => QueueLobby("{\"v\":1,\"type\":\"room.leave\",\"requestId\":\"lobby\"}");

        // 서버에서 현재 공개 중인 대기방을 조회한다.
        private void BrowseRooms() => QueueLobby("{\"v\":1,\"type\":\"room.list\",\"requestId\":\"lobby\"}");

        // 방장의 공개·비공개 변경을 서버에 요청한다.
        private void SetRoomPrivacy(bool hidden) // hidden이 true이면 코드로만 참가한다.
        {
            QueueLobby($"{{\"v\":1,\"type\":\"room.privacy\",\"private\":{(hidden ? "true" : "false")},\"requestId\":\"lobby\"}}");
        }

        // 로비의 각 요청을 같은 연결로 한 번씩 보낸다.
        private void QueueLobby(string packet) // 유효한 서버 로비 명령 JSON이다.
        {
            if (lobbyPending || controlPacket != null)
                return;
            if (socket == null)
            {
                lobby.Notice("로컬 서버에 연결되어 있지 않습니다.");
                return;
            }
            lobbyPending = true;
            controlPacket = packet;
        }

        // UI 명령을 이전 이동 및 기술 요청과 같은 순서로 보낸다.
        private async Task SendControlAsync(string packet) // 게임 서버로 보낼 UI 명령 JSON이다.
        {
            try
            {
                await socket.SendAsync(packet, lifetime.Token);
            }
            catch (Exception error) // error는 UI 명령 전송 실패의 원인이다.
            {
                if (!lifetime.IsCancellationRequested)
                    Debug.LogWarning($"서버 명령을 전송하지 못했습니다. {error.Message}");
            }
        }

        // 이동 스텝과 기술 요청을 하나의 송신 흐름에서 순서대로 서버에 전달한다.
        private async Task SendInputAsync(
            int sequence, // 서버에서 처리 여부를 확인할 이동 입력 순번이다.
            Vector2 direction, // 오른쪽·아래쪽이 양수인 정규화 전 이동 입력이다.
            string slot) // 이 이동 직후 시전할 슬롯이며 null이면 이동만 한다.
        {
            try
            {
                // 이동과 시전이 같은 연결에서 순서대로 나가도록 연결과 취소 신호를 보관한다.
                GameSocket connection = socket;
                CancellationToken cancellationToken = lifetime.Token;
                // 소수 이동축의 JSON 구분자는 현재 기기 언어와 관계없이 점을 사용한다.
                string movement = FormattableString.Invariant($"{{\"v\":1,\"type\":\"game.input\",\"seq\":{sequence},\"x\":{direction.x},\"y\":{direction.y}}}");
                await connection.SendAsync(movement, cancellationToken);
                if (slot != null)
                    await connection.SendAsync($"{{\"v\":1,\"type\":\"game.cast\",\"slot\":\"{slot}\",\"afterInputSeq\":{sequence},\"requestId\":\"cast-{sequence}\"}}", cancellationToken);
            }
            catch (Exception error) // error는 소켓 종료 또는 전송 실패 원인이다.
            {
                if (!lifetime.IsCancellationRequested)
                    Debug.LogWarning($"이동 입력 전송이 중단됐습니다. {error.Message}");
                playingOnServer = false;
            }
        }

        // 표시 좌표가 갱신된 뒤 카메라를 캐릭터에 맞춘다.
        private void LateUpdate()
        {
            if (sceneCamera == null)
                return;
            sceneCamera.orthographicSize = CameraWorldWidth * WorldScale / (2f * sceneCamera.aspect);
            sceneCamera.transform.position = playerModel.position + CameraOffset;
            sceneCamera.transform.LookAt(playerModel.position);
            if (playingOnServer)
            {
                world.Draw(Time.unscaledTimeAsDouble, sceneCamera, hud, options.ShowNames, playerModel.position);
                hud.DrawWorldHealth(playerModel, localWorldStatus, sceneCamera, true, options.ShowNames ? localName : null);
            }
            hud.FinishWorldHealth();
            items.Draw(sceneCamera, playerModel.position, playerId, localMotion.Sequence, world, Time.unscaledTimeAsDouble);
            if (playingOnServer)
                mapView.Draw(new Vector2(playerModel.position.x, -playerModel.position.z) / WorldScale,
                    localMotion.Facing, world, Time.unscaledTimeAsDouble);
        }

        // Play를 끝내면 수신 중인 서버 연결을 중단한다.
        private void OnDestroy()
        {
            lifetime.Cancel();
            ReleaseSceneViews();
            loadingHud?.Clear();
            lifetime.Dispose();
        }
    }
}
