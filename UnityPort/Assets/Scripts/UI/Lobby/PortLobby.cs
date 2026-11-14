using System;
using System.Text;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 멀티플레이 방의 생성, 코드 참가와 준비 상태를 표시한다.
    internal sealed class PortLobby
    {
        // 입장 전 화면과 참가 후 화면을 바꾸는 패널이다.
        private readonly RectTransform entry;
        private readonly RectTransform waiting;
        // 공개방 목록과 목록의 다섯 행이다.
        private readonly RectTransform browser;
        private readonly UnityEngine.UI.Button[] roomRows = new UnityEngine.UI.Button[5];
        private readonly UnityEngine.UI.Text[] rowLabels = new UnityEngine.UI.Text[5];
        private readonly UnityEngine.UI.Text browserNotice;
        private readonly UnityEngine.UI.Button previousPage;
        private readonly UnityEngine.UI.Button nextPage;
        private PortProtocol.PublicRoom[] rooms = Array.Empty<PortProtocol.PublicRoom>(); // 서버가 응답한 공개방 전체 목록이다.
        private int page; // 목록에서 현재 보이는 페이지 번호다.
        private string activeCode; // 코드 복사에 사용할 현재 방 코드다.
        private bool privateRoom; // 서버가 확정한 방의 공개 설정이다.
        private readonly UnityEngine.UI.Button privacyButton;
        private readonly UnityEngine.UI.Text privacyLabel;

        // 서버에 보낼 참가 이름과 접속 코드다.
        private readonly UnityEngine.UI.InputField playerName;
        private readonly UnityEngine.UI.InputField roomCode;

        // 두 화면의 서버 응답 안내와 현재 참가자 목록이다.
        private readonly UnityEngine.UI.Text entryNotice;
        private readonly UnityEngine.UI.Text roomNotice;
        private readonly UnityEngine.UI.Text roster;
        private readonly UnityEngine.UI.Text heading;

        // 현재 방에서 시작 또는 준비 상태를 바꾸는 버튼이다.
        private readonly UnityEngine.UI.Button roomAction;
        private readonly UnityEngine.UI.Text roomActionText;

        // 일반 참가자의 다음 준비 상태이며 방장은 사용하지 않는다.
        private bool readyNext;
        // 방장에게 시작 버튼을 표시할 때 사용한다.
        private bool isHost;

        // 서버 상태를 반영하는 방 입장 및 대기 화면을 만든다.
        internal PortLobby(
            PortSceneUi ui, // 로비 씬에 저장한 화면과 버튼 참조다.
            Action<string, string, bool> enter, // 이름, 방 코드, 공개 목록 참가 여부를 전송한다.
            Action start, // 방장의 게임 시작 요청이다.
            Action<bool> ready, // 일반 참가자의 준비 변경 요청이다.
            Action leave, // 대기실 퇴장 요청이다.
            Action browse, // 서버의 공개방 목록 요청이다.
            Action<bool> privacy) // 방장이 서버에 공개 상태를 바꾸도록 요청한다.
        {
            entry = ui.Get("Lobby Entry");
            waiting = ui.Get("Lobby Room");
            playerName = ui.Get("Lobby Entry/이름").GetComponent<UnityEngine.UI.InputField>();
            roomCode = ui.Get("Lobby Entry/참가할 방 코드 6자리").GetComponent<UnityEngine.UI.InputField>();
            entryNotice = ui.Get("Lobby Entry/Status").GetComponent<UnityEngine.UI.Text>();

            var create = ui.Get("Lobby Entry/Create Room").GetComponent<UnityEngine.UI.Button>(); // 방 생성 버튼이다.
            create.onClick.AddListener(() => enter(playerName.text, null, false)); // 코드 없이 방 생성 요청을 보낸다.
            var join = ui.Get("Lobby Entry/Join Room").GetComponent<UnityEngine.UI.Button>(); // 코드 입장 버튼이다.
            join.onClick.AddListener(() => enter(playerName.text, roomCode.text, false)); // 직접 입력한 코드로 참가한다.
            // 공개방 검색 화면으로 이동하는 버튼이다.
            var browseButton = ui.Get("Lobby Entry/Browse Rooms").GetComponent<UnityEngine.UI.Button>(); // 공개방 목록 버튼이다.
            browseButton.onClick.AddListener(() => // 새로 열 때 서버에 최신 목록을 요청한다.
            {
                if (string.IsNullOrWhiteSpace(playerName.text))
                {
                    Notice("먼저 이름을 입력해 주세요.");
                    return;
                }
                entry.gameObject.SetActive(false);
                browser.gameObject.SetActive(true);
                ReceiveRooms(null);
                browserNotice.text = "공개방을 불러오는 중입니다.";
                browse();
            });

            browser = ui.Get("Public Rooms");
            for (int index = 0; index < roomRows.Length; index++) // index는 보이는 목록의 행 순번이다.
            {
                int row = index; // 버튼을 눌렀을 때 선택할 고정 행 번호다.
                roomRows[index] = ui.Get("Public Rooms/Public Room " + index).GetComponent<UnityEngine.UI.Button>();
                rowLabels[index] = ui.Get("Public Rooms/Public Room " + index + "/Label").GetComponent<UnityEngine.UI.Text>();
                rowLabels[index].supportRichText = false;
                roomRows[index].onClick.AddListener(() => enter(playerName.text, rooms[page * roomRows.Length + row].code, true)); // 목록에서 고른 공개방으로 참가한다.
            }
            browserNotice = ui.Get("Public Rooms/Status").GetComponent<UnityEngine.UI.Text>();
            previousPage = BrowserButton(ui, "이전", () => ChangePage(-1)); // 앞 페이지를 연다.
            nextPage = BrowserButton(ui, "다음", () => ChangePage(1)); // 뒤 페이지를 연다.
            BrowserButton(ui, "새로고침", browse);
            BrowserButton(ui, "돌아가기", () => ShowEntry()); // 이름과 코드 입력으로 돌아간다.

            heading = ui.Get("Lobby Room/Room Code").GetComponent<UnityEngine.UI.Text>();
            roster = ui.Get("Lobby Room/Players").GetComponent<UnityEngine.UI.Text>();
            roster.supportRichText = false;
            roomNotice = ui.Get("Lobby Room/Status").GetComponent<UnityEngine.UI.Text>();
            roomAction = ui.Get("Lobby Room/Ready or Start").GetComponent<UnityEngine.UI.Button>();
            roomActionText = ui.Get("Lobby Room/Ready or Start/Label").GetComponent<UnityEngine.UI.Text>();
            roomAction.onClick.AddListener(() => // 현재 권한에 맞는 방 명령을 보낸다.
            {
                if (isHost)
                    start();
                else
                    ready(readyNext);
            });
            // 방장과 참가자가 공통으로 쓰는 나가기 버튼이다.
            var exit = ui.Get("Lobby Room/Leave Room").GetComponent<UnityEngine.UI.Button>(); // 방 퇴장 버튼이다.
            exit.onClick.AddListener(() => leave()); // 현재 대기실에서 나간다.
            privacyButton = ui.Get("Lobby Room/Room Privacy").GetComponent<UnityEngine.UI.Button>();
            privacyLabel = ui.Get("Lobby Room/Room Privacy/Label").GetComponent<UnityEngine.UI.Text>();
            privacyButton.onClick.AddListener(() => privacy(!privateRoom)); // 다음 공개 상태를 서버에 요청한다.
            // 현재 방의 코드를 운영체제 클립보드에 복사하는 버튼이다.
            var copy = ui.Get("Lobby Room/Copy Room Code").GetComponent<UnityEngine.UI.Button>(); // 방 코드 복사 버튼이다.
            copy.onClick.AddListener(() => // 다른 참가자에게 공유할 수 있도록 서버 코드를 복사한다.
            {
                GUIUtility.systemCopyBuffer = activeCode;
                roomNotice.text = "방 코드를 복사했습니다.";
            });
            ShowEntry();
        }

        // 공개방 목록의 하단 탐색 버튼을 만든다.
        private UnityEngine.UI.Button BrowserButton(PortSceneUi ui, string title, Action action) // ui는 씬 참조, title은 버튼 키, action은 클릭 동작이다.
        {
            // 목록 탐색에 쓰는 버튼과 표시 라벨이다.
            var button = ui.Get("Public Rooms/" + title).GetComponent<UnityEngine.UI.Button>(); // 페이지 탐색에 쓰는 버튼이다.
            button.onClick.AddListener(() => action()); // 버튼이 맡은 탐색 동작을 호출한다.
            return button;
        }

        // 서버가 보내온 공개 대기방 목록을 다시 표시한다.
        internal void ReceiveRooms(PortProtocol.PublicRoom[] latest) // latest는 서버가 확정한 공개 방 목록이다.
        {
            rooms = latest ?? Array.Empty<PortProtocol.PublicRoom>();
            page = 0;
            ChangePage(0);
        }

        // 공개방 목록 페이지를 범위 안에서 이동하고 행을 갱신한다.
        private void ChangePage(int delta) // 현재 페이지에서 이동할 페이지 수다.
        {
            int last = Mathf.Max(0, (rooms.Length - 1) / roomRows.Length); // 목록의 마지막 페이지다.
            page = Mathf.Clamp(page + delta, 0, last);
            for (int index = 0; index < roomRows.Length; index++) // index는 이번 페이지의 표시 행이다.
            {
                int roomIndex = page * roomRows.Length + index; // 전체 서버 목록 안의 실제 방 순번이다.
                roomRows[index].gameObject.SetActive(roomIndex < rooms.Length);
                if (roomIndex >= rooms.Length)
                    continue;
                PortProtocol.PublicRoom room = rooms[roomIndex]; // 이 버튼에 배치할 방이다.
                rowLabels[index].text = $"{room.hostName}   {room.code}   {room.playerCount}/{room.maxPlayers}";
                roomRows[index].interactable = room.playerCount < room.maxPlayers;
            }
            browserNotice.text = rooms.Length == 0 ? "참가할 공개방이 없습니다." : $"{page + 1} / {last + 1}";
            previousPage.interactable = page > 0;
            nextPage.interactable = page < last;
        }

        // 이름과 방 코드를 입력할 수 있는 초기 화면을 표시한다.
        internal void ShowEntry(string notice = "") // 서버 연결 또는 방 퇴장 안내다.
        {
            waiting.gameObject.SetActive(false);
            browser.gameObject.SetActive(false);
            entry.gameObject.SetActive(true);
            entryNotice.text = notice;
        }

        // 서버가 발행한 참가자 순서와 준비 정보를 표시한다.
        internal void ShowRoom(PortProtocol.Room room, string localId) // room은 전체 대기실, localId는 현재 본인 식별자다.
        {
            entry.gameObject.SetActive(false);
            browser.gameObject.SetActive(false);
            waiting.gameObject.SetActive(true);
            isHost = room.hostId == localId;
            privateRoom = room.privateRoom;
            activeCode = room.code;
            privacyButton.interactable = isHost;
            privacyLabel.text = privateRoom ? "비공개 방" : "공개 방";
            heading.text = $"방 코드 {room.code}   |   {room.players.Length}/{room.maxPlayers}";

            // 화면 줄 단위로 정리할 참가자 표시 목록이다.
            var lines = new StringBuilder();
            // 방장을 제외한 참가자가 모두 준비했는지 추적한다.
            bool everyoneReady = true;
            foreach (PortProtocol.Entity player in room.players) // player는 입장 순서대로 들어온 서버 참가자다.
            {
                if (player.id != room.hostId && !player.ready)
                    everyoneReady = false;
                if (player.id == localId)
                    readyNext = !player.ready;
                lines.AppendLine($"{player.name}{(player.id == localId ? " (나)" : "")}   {(player.id == room.hostId ? "방장" : player.ready ? "준비 완료" : "준비 중")}");
            }
            roster.text = lines.ToString().TrimEnd();
            roomAction.interactable = !isHost || everyoneReady;
            roomActionText.text = isHost ? "게임 시작" : readyNext ? "준비" : "준비 취소";
            roomNotice.text = isHost && !everyoneReady ? "다른 참가자가 준비할 때까지 기다려 주세요." : "";
        }

        // 서버에서 방 명령을 거절한 사유를 현재 대기 화면에 표시한다.
        internal void Notice(string message) // 사용자에게 표시할 서버 안내다.
        {
            (waiting.gameObject.activeSelf ? roomNotice : browser.gameObject.activeSelf ? browserNotice : entryNotice).text = message;
        }

    }
}
