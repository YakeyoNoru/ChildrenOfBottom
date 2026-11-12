using System;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 게임 설정, 서버 스테이터스와 권한이 있는 테스트 설정을 표시한다.
    internal sealed class PortGameOptions
    {
        // 로컬 게스트 설정을 보관하는 기기별 키의 공통 접두어다.
        private const string Key = "ChildrenOfBottom.Unity.";
        // 서버가 받는 공격 우선대상 값과 대응하는 표시 이름이다.
        private static readonly string[] Priorities = { "nearest", "lowestHealth", "lowestHealthRatio" };
        private static readonly string[] PriorityLabels = { "가장 가까운", "체력이 가장 적은", "체력 비율이 낮은" };
        // 웹 설정과 같은 조이스틱 크기 순서다.
        private static readonly float[] Scales = { 0.75f, 1f, 1.25f, 1.5f };
        // 이 메뉴와 버튼들의 공통 앵커다.
        private static readonly Vector2 Top = new(0.5f, 1f);
        private static readonly Vector2 Middle = new(0.5f, 0.5f);

        // 게임 메뉴 진입과 각 메뉴 패널이다.
        private readonly UnityEngine.UI.Button openButton;
        private readonly RectTransform panel;
        private readonly RectTransform statusPanel;
        private readonly UnityEngine.UI.Text statusText;
        private readonly UnityEngine.UI.Text priorityText;
        private readonly UnityEngine.UI.Text namesText;
        private readonly UnityEngine.UI.Text scaleText;
        private readonly UnityEngine.UI.Text notice;
        private readonly UnityEngine.UI.Button mapHackButton;
        private readonly UnityEngine.UI.Button highSpeedButton;
        private readonly UnityEngine.UI.Text mapHackText;
        private readonly UnityEngine.UI.Text highSpeedText;

        // 사용자 설정 변경을 담당하는 서버와 화면 콜백이다.
        private readonly Func<string, bool> sendPriority;
        private readonly Func<bool, bool, bool> sendTests;
        private readonly Action<float> setScale;

        // 서버에서 받은 최신 테스트 옵션과 권한이다.
        private bool testAllowed;
        private bool mapHack;
        private bool highSpeed;
        private bool pendingTest;

        // 현재 사용자가 선택한 공격 우선대상과 조이스틱 크기의 배열 순번이다.
        private int priorityIndex = Mathf.Clamp(PlayerPrefs.GetInt(Key + "TargetPriority", 0), 0, 2);
        private int scaleIndex = Mathf.Clamp(PlayerPrefs.GetInt(Key + "ControlScale", 1), 0, 3);

        // 상태 화면에 사용할 마지막 서버 스냅샷과 본인 ID다.
        private string snapshot;
        private string localId;
        // 상태 텍스트의 다음 갱신을 허용하는 로컬 초다.
        private double nextStatusUpdate;

        // 게임의 기능 설정과 읽기 전용 상태 창을 준비한다.
        internal PortGameOptions(
            PortHud hud, // 공통 Canvas와 버튼·텍스트를 제공한다.
            Action open, // 다른 모달과 충돌하지 않게 메뉴를 연다.
            Action leave, // 본인만 방에서 나가기 전에 확인한다.
            Func<string, bool> sendPriority, // 공격 우선대상을 서버에 적용한다.
            Func<bool, bool, bool> sendTests, // 서버 테스트 옵션 두 값을 함께 전송한다.
            Action<float> setScale) // 조이스틱 크기를 화면에 적용한다.
        {
            this.sendPriority = sendPriority;
            this.sendTests = sendTests;
            this.setScale = setScale;
            // 게임 HUD에 붙일 진입 버튼과 화면 라벨이다.
            (UnityEngine.UI.Button menuButton, UnityEngine.UI.Text menuLabel) = hud.Button(hud.CanvasRoot, "Game Menu", Vector2.up,
                new Vector2(18, -184), new Vector2(172, 36));
            openButton = menuButton;
            menuLabel.text = "메뉴 [Esc]";
            openButton.onClick.AddListener(() => open()); // 게임 메뉴 버튼을 연다.
            panel = PortHud.Panel(hud.CanvasRoot, "Game Options", Middle, Vector2.zero, new Vector2(480, 335));
            panel.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            hud.Label(panel, "Title", Top, new Vector2(0, -12), new Vector2(438, 36), 23).text = "게임 메뉴";
            (_, priorityText) = Row(hud, "Target Priority", -59, CyclePriority);
            (_, namesText) = Row(hud, "Show Names", -103, ToggleNames);
            (_, scaleText) = Row(hud, "Joystick Size", -147, CycleScale);
            (mapHackButton, mapHackText) = Row(hud, "Map Hack", -191, () => ChangeTests(!mapHack, highSpeed)); // 맵핵만 반전한다.
            (highSpeedButton, highSpeedText) = Row(hud, "High Speed", -235, () => ChangeTests(mapHack, !highSpeed)); // 고속화만 반전한다.
            notice = hud.Label(panel, "Notice", Top, new Vector2(0, -274), new Vector2(438, 24), 14);
            AddFooter(hud, panel, "상태", -147, ShowStatus);
            AddFooter(hud, panel, "계속하기", 0, Close);
            AddFooter(hud, panel, "나가기", 147, leave);

            statusPanel = PortHud.Panel(hud.CanvasRoot, "Player Status", Middle, Vector2.zero, new Vector2(590, 450));
            statusPanel.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            hud.Label(statusPanel, "Title", Top, new Vector2(0, -8), new Vector2(550, 36), 21).text = "서버 상태 · 읽기 전용";
            // 긴 상태 목록을 스크롤할 사각형이다.
            RectTransform frame = PortHud.Rect(statusPanel, "Status Scroll", Top, new Vector2(0, -52), new Vector2(550, 333));
            var scroll = frame.gameObject.AddComponent<UnityEngine.UI.ScrollRect>(); // 세로 목록만 이동한다.
            scroll.horizontal = false;
            scroll.movementType = UnityEngine.UI.ScrollRect.MovementType.Clamped;
            scroll.scrollSensitivity = 28;
            RectTransform viewport = PortHud.Panel(frame, "Viewport", Top, Vector2.zero, new Vector2(550, 333)); // 목록 영역의 배경과 클릭 영역이다.
            viewport.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            viewport.gameObject.AddComponent<UnityEngine.UI.RectMask2D>();
            statusText = hud.Label(viewport, "Server Fields", Top, Vector2.zero, new Vector2(520, 0), 17);
            statusText.alignment = TextAnchor.UpperLeft;
            statusText.supportRichText = false;
            statusText.verticalOverflow = VerticalWrapMode.Overflow;
            var fitter = statusText.gameObject.AddComponent<UnityEngine.UI.ContentSizeFitter>(); // 글줄 수에 맞게 내용 높이를 확장한다.
            fitter.verticalFit = UnityEngine.UI.ContentSizeFitter.FitMode.PreferredSize;
            scroll.viewport = viewport;
            scroll.content = statusText.rectTransform;
            AddFooter(hud, statusPanel, "뒤로", 0, BackToMenu);
            ShowNames = PlayerPrefs.GetInt(Key + "ShowNames", 1) != 0;
            setScale(Scales[scaleIndex]);
            Refresh();
            SetAvailable(false);
            Close();
        }

        // 게임 입력을 잠그는 메뉴 상태다.
        internal bool IsOpen => panel.gameObject.activeSelf || statusPanel.gameObject.activeSelf;
        // 화면에 개체 이름을 그리는 사용자 선택이다.
        internal bool ShowNames { get; private set; }
        // 입장·복귀 때 서버로 다시 보낼 현재 공격 대상 옵션이다.
        internal string TargetPriority => Priorities[priorityIndex];

        // 진행 중 사용 가능한 메뉴 버튼을 표시한다.
        internal void SetAvailable(bool available) // 현재 게임 중이며 다른 모달이 입력을 가로채지 않는 상태다.
        {
            openButton.gameObject.SetActive(available);
        }

        // 사용자 게임 메뉴를 연다.
        internal void Show()
        {
            notice.text = "";
            panel.gameObject.SetActive(true);
            statusPanel.gameObject.SetActive(false);
        }

        // 상태 창이 열려 있으면 먼저 메뉴로 돌아간다.
        internal void Escape()
        {
            if (statusPanel.gameObject.activeSelf)
                BackToMenu();
            else
                Close();
        }

        // 옵션 화면을 모두 닫는다.
        internal void Close()
        {
            panel.gameObject.SetActive(false);
            statusPanel.gameObject.SetActive(false);
        }

        // 최신 서버 상태를 저장하고 열린 읽기 전용 목록을 갱신한다.
        internal void Receive(PortProtocol.Entity player, string json, double now) // player는 본인 상태, json은 누락 없는 서버 스냅샷, now는 로컬 초다.
        {
            snapshot = json;
            localId = player.id;
            testAllowed = player.name == "열쇠" && player.status.state == "alive";
            mapHack = player.testOptions?.mapHack == true;
            highSpeed = player.testOptions?.highSpeed == true;
            Refresh();
            if (statusPanel.gameObject.activeSelf && now >= nextStatusUpdate)
            {
                nextStatusUpdate = now + 0.2d;
                ReadStatus();
            }
        }

        // 테스트 설정이 서버에서 승인 또는 거절됐음을 표시한다.
        internal void CompleteTests(string message) // 성공이면 빈 문자열, 실패면 서버의 안내다.
        {
            pendingTest = false;
            notice.text = message;
            Refresh();
        }

        // 방 종료 후 이전 플레이어의 옵션 권한과 스냅샷을 폐기한다.
        internal void Reset()
        {
            Close();
            SetAvailable(false);
            snapshot = null;
            localId = null;
            testAllowed = false;
            pendingTest = false;
            nextStatusUpdate = 0d;
        }

        // 서버 우선대상 적용 요청이 송신 대기에 들어갔을 때 설정을 보관한다.
        private void CyclePriority()
        {
            int next = (priorityIndex + 1) % Priorities.Length; // 사용자가 선택할 다음 우선대상이다.
            if (!sendPriority(Priorities[next]))
                return;
            priorityIndex = next;
            PlayerPrefs.SetInt(Key + "TargetPriority", priorityIndex);
            PlayerPrefs.Save();
            Refresh();
        }

        // 모든 월드 이름 표시를 바꾼다.
        private void ToggleNames()
        {
            ShowNames = !ShowNames;
            PlayerPrefs.SetInt(Key + "ShowNames", ShowNames ? 1 : 0);
            PlayerPrefs.Save();
            Refresh();
        }

        // 웹과 같은 네 가지 크기를 순서대로 적용한다.
        private void CycleScale()
        {
            scaleIndex = (scaleIndex + 1) % Scales.Length;
            setScale(Scales[scaleIndex]);
            PlayerPrefs.SetInt(Key + "ControlScale", scaleIndex);
            PlayerPrefs.Save();
            Refresh();
        }

        // 두 테스트 값을 함께 보내며 서버가 다시 보낸 값으로만 표시를 갱신한다.
        private void ChangeTests(bool nextMapHack, bool nextHighSpeed) // 두 매개변수는 각각 요청할 서버 테스트 값이다.
        {
            if (!testAllowed || pendingTest || !sendTests(nextMapHack, nextHighSpeed))
                return;
            pendingTest = true;
            Refresh();
        }

        // 사용자 선택과 서버 권한으로 버튼의 표시 상태를 갱신한다.
        private void Refresh()
        {
            priorityText.text = "공격 우선 · " + PriorityLabels[priorityIndex];
            namesText.text = ShowNames ? "개체 이름 · 표시" : "개체 이름 · 숨김";
            scaleText.text = $"조이스틱 크기 · {Scales[scaleIndex]:0.##}배";
            mapHackButton.gameObject.SetActive(testAllowed);
            highSpeedButton.gameObject.SetActive(testAllowed);
            mapHackButton.interactable = highSpeedButton.interactable = !pendingTest;
            mapHackText.text = mapHack ? "맵핵 · 켜짐" : "맵핵 · 꺼짐";
            highSpeedText.text = highSpeed ? "고속화 · 켜짐" : "고속화 · 꺼짐";
        }

        // 마지막 서버 상태 목록을 즉시 표시한다.
        private void ShowStatus()
        {
            panel.gameObject.SetActive(false);
            statusPanel.gameObject.SetActive(true);
            ReadStatus();
        }

        // 상태 화면에서 게임 메뉴로 돌아간다.
        private void BackToMenu()
        {
            statusPanel.gameObject.SetActive(false);
            panel.gameObject.SetActive(true);
        }

        // DTO에서 생략한 필드를 포함해 원본 JSON 스테이터스 전체를 읽는다.
        private void ReadStatus()
        {
            if (snapshot == null || localId == null)
                return;
            // JSON을 데이터 타입과 필드 이름을 유지하는 읽기 전용 트리로 읽는다.
            using XmlDictionaryReader reader = JsonReaderWriterFactory.CreateJsonReader(Encoding.UTF8.GetBytes(snapshot), XmlDictionaryReaderQuotas.Max);
            XElement root = XElement.Load(reader); // 현재 방 서버 메시지다.
            XElement status = root.Element("room")?.Element("players")?.Elements().FirstOrDefault(
                player => (string)player.Element("id") == localId)?.Element("status"); // player는 본인 ID를 찾기 위한 참가자다.
            if (status == null)
                return;
            statusText.text = string.Join("\n", status.Elements().Select(
                field => $"{FieldName(field)}  {Value(field)}")); // field는 숨김 없이 표시할 서버 필드다.
        }

        // JSON 키가 XML 이름으로 직접 표현될 수 없으면 원래 키 속성을 읽는다.
        private static string FieldName(XElement element) // 원래 JSON의 한 필드다.
        {
            return element.Attributes().FirstOrDefault(attribute => attribute.Name.LocalName == "item")?.Value
                ?? element.Name.LocalName; // attribute는 인코딩된 JSON 키 속성이다.
        }

        // 원본의 값 타입을 보존하며 중첩 목록과 딕셔너리를 읽기 쉬운 문자열로 표시한다.
        private static string Value(XElement element) // 원래 JSON의 한 필드 또는 배열 항목이다.
        {
            return (string)element.Attribute("type") switch
            {
                "null" => "null",
                "object" => "{" + string.Join(", ", element.Elements().Select(child => FieldName(child) + ": " + Value(child))) + "}", // child는 중첩 객체 필드다.
                "array" => "[" + string.Join(", ", element.Elements().Select(Value)) + "]",
                "string" => "\"" + element.Value + "\"",
                _ => element.Value
            };
        }

        // 화면 중앙의 설정 버튼 한 행을 만든다.
        private (UnityEngine.UI.Button, UnityEngine.UI.Text) Row(PortHud hud, string name, float y, Action click) // hud는 Canvas, name은 계층 이름, y는 기준 픽셀, click은 클릭 동작이다.
        {
            // 설정값을 표시하고 변경할 버튼과 라벨이다.
            (UnityEngine.UI.Button button, UnityEngine.UI.Text label) = hud.Button(panel, name, Top, new Vector2(0, y), new Vector2(438, 38));
            button.onClick.AddListener(() => click()); // 선택한 설정을 한 번 적용한다.
            return (button, label);
        }

        // 메뉴 하단의 상태·계속·퇴장 또는 돌아가기 버튼을 만든다.
        private static void AddFooter(PortHud hud, RectTransform parent, string title, float x, Action click) // hud/parent는 배치 대상, title은 라벨, x는 기준 픽셀, click은 선택 동작이다.
        {
            // 현재 메뉴 하단에 고정한 버튼과 라벨이다.
            (UnityEngine.UI.Button button, UnityEngine.UI.Text label) = hud.Button(parent, title, new Vector2(0.5f, 0f),
                new Vector2(x, 9), new Vector2(136, 34));
            label.text = title;
            button.onClick.AddListener(() => click()); // 메뉴 하단 버튼을 실행한다.
        }
    }
}
