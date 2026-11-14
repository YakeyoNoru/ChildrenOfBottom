using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;

namespace ChildrenOfBottom
{
    // 서버 상태를 표시하고 결과 및 탈출 확인 버튼을 제공하는 화면이다.
    internal sealed class PortHud
    {
        // 패널 배경과 텍스트에 사용할 색이다.
        private static readonly Color PanelColor = new(0.055f, 0.09f, 0.13f, 0.95f);
        private static readonly Color TextColor = new(0.92f, 0.97f, 0.98f);

        // HUD와 대화창이 들어 있는 Canvas 루트다.
        private readonly GameObject root;

        // 메뉴, HUD와 이름표가 공유하는 프로젝트 글꼴이다.
        private readonly Font font = Resources.Load<Font>("Mabinogi_Classic_OTF") ??
            Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

        // 화면 상단에 경쟁 점수와 남은 방 시간을 표시한다.
        private readonly UnityEngine.UI.Text score;
        private readonly UnityEngine.UI.Text timer;

        // 서버가 보고한 현재 위치의 독기 차감량을 알린다.
        private readonly UnityEngine.UI.Text poison;

        // 본인 경험치 바의 안내 숫자와 채움 영역이다.
        private readonly UnityEngine.UI.Text experienceText;
        private readonly RectTransform experienceTrack; // 본인 발밑에 배치할 경험치 바의 배경이다.
        private readonly RectTransform experienceFill;

        // 다른 HUD 요소 아래에 개체 체력바를 그리는 전체 화면 레이어다.
        private readonly RectTransform worldHealthLayer;
        private readonly RectTransform worldHealthTemplate; // 풀에 새 체력바가 필요할 때 복제하는 프리팹이다.

        // 화면에 나타나는 개체에 순서대로 재사용하는 체력바 배경과 채움 영역이다.
        private readonly List<(RectTransform Background, UnityEngine.UI.Image Fill, UnityEngine.UI.Text Level, UnityEngine.UI.Text Name, UnityEngine.UI.Text Detail)> worldHealthBars = new();

        // 현재 프레임에 사용한 체력바 수다.
        private int worldHealthCount;

        // 이번 프레임에 본인 경험치 바를 배치했는지 나타낸다.
        private bool localExperienceVisible;

        // 거리 조건을 충족했을 때만 드러나는 상호작용 버튼이다.
        private readonly UnityEngine.UI.Button interaction;

        // 탈출 확인, 결과, 대기 화면에서 공유하는 중앙 대화 상자다.
        private readonly RectTransform dialog;
        private readonly UnityEngine.UI.Text dialogTitle;
        private readonly UnityEngine.UI.Text dialogBody;
        private readonly UnityEngine.UI.Button primary;
        private readonly UnityEngine.UI.Text primaryText;
        private readonly UnityEngine.UI.Button secondary;
        private readonly UnityEngine.UI.Text secondaryText;
        private readonly UnityEngine.UI.Text dialogCountdown; // 결과 퇴장 버튼 옆의 남은 초 표시다.

        // 현재 대화 상자의 버튼이 수행할 명령이다.
        private Action primaryAction;
        private Action secondaryAction;

        // 플레이 상태와 결과 화면을 표시할 Canvas를 생성한다.
        internal PortHud()
        {
            root = new GameObject("Loading Canvas", typeof(Canvas));
            root.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            // 화면 크기에 따라 HUD의 크기를 조절한다.
            var scaler = root.AddComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(900, 600);
            scaler.matchWidthOrHeight = 0.15f;
            root.AddComponent<UnityEngine.UI.GraphicRaycaster>();
            if (EventSystem.current == null)
            {
                // 키보드와 마우스로 Canvas 버튼을 선택할 수 있게 한다.
                GameObject events = new("HUD Event System", typeof(EventSystem), typeof(InputSystemUIInputModule));
                UnityEngine.Object.DontDestroyOnLoad(events);
                events.GetComponent<InputSystemUIInputModule>().AssignDefaultActions();
            }
        }

        // GameUI 씬의 직렬화된 Canvas와 컨트롤을 서버 표시 및 입력에 연결한다.
        internal PortHud(PortSceneUi ui, Action interact, Action openSkills) // ui는 씬 참조, interact는 상호작용, openSkills는 기술 창 동작이다.
        {
            root = ui.gameObject;
            worldHealthTemplate = ui.HealthTemplate;
            worldHealthLayer = ui.Get("World health bars");
            experienceTrack = ui.Get("World health bars/Experience bar");
            experienceText = Text(ui, "World health bars/Experience bar/Experience value");
            experienceFill = ui.Get("World health bars/Experience bar/Fill");
            timer = Text(ui, "Timer panel/Room timer");
            score = Text(ui, "Score panel/Competition score");
            poison = Text(ui, "Poison exposure");
            ui.Get("Skills").GetComponent<UnityEngine.UI.Button>().onClick.AddListener(() => openSkills()); // 기술 창을 토글한다.
            interaction = ui.Get("Interaction").GetComponent<UnityEngine.UI.Button>();
            interaction.onClick.AddListener(() => interact()); // 가까운 서버 개체와 상호작용한다.
            dialog = ui.Get("Game dialog");
            dialogTitle = Text(ui, "Game dialog/Title");
            dialogBody = Text(ui, "Game dialog/Message");
            primary = ui.Get("Game dialog/Confirm").GetComponent<UnityEngine.UI.Button>();
            primaryText = Text(ui, "Game dialog/Confirm/Label");
            secondary = ui.Get("Game dialog/Cancel").GetComponent<UnityEngine.UI.Button>();
            secondaryText = Text(ui, "Game dialog/Cancel/Label");
            dialogCountdown = Text(ui, "Game dialog/Result countdown");
            primary.onClick.AddListener(() => primaryAction?.Invoke()); // 대화창의 주 버튼을 실행한다.
            secondary.onClick.AddListener(() => secondaryAction?.Invoke()); // 대화창의 보조 버튼을 실행한다.
            dialog.gameObject.SetActive(false);
        }

        // 화면 안에 들어온 개체 위에 최신 서버 체력 비율을 표시한다.
        internal void DrawWorldHealth(
            Transform model, // 보간된 개체 위치와 활성 상태를 제공하는 모형이다.
            PortProtocol.EntityStatus status, // 최신 서버 스테이터스다.
            Camera camera, // 월드 위치를 화면 좌표로 변환할 카메라다.
            bool isLocal, // 본인 체력바에 별도 색을 사용할지 나타낸다.
            string playerName) // 이름 표시가 켜진 플레이어의 표시 이름이며 그 외에는 null이다.
        {
            float maximum = status?.effective?.maxHealth ?? 0f; // 서버가 계산한 최대 체력이다.
            if (maximum <= 0f || status.state == "dead" || !model.gameObject.activeInHierarchy)
                return;

            Vector3 viewport = camera.WorldToViewportPoint(model.position); // 모형 중심의 카메라 뷰포트 좌표다.
            if (viewport.z <= 0f || viewport.x < 0f || viewport.x > 1f || viewport.y < 0f || viewport.y > 1f)
                return;

            Vector3 overhead = camera.WorldToViewportPoint(model.position + Vector3.up * 0.42f); // 머리 위 0.42 Unity 미터의 뷰포트 위치다.
            if (worldHealthCount == worldHealthBars.Count)
            {
                RectTransform background = UnityEngine.Object.Instantiate(worldHealthTemplate, worldHealthLayer); // 풀에 추가할 체력바 원본이다.
                var fill = background.Find("Fill").GetComponent<UnityEngine.UI.Image>(); // 체력 비율을 그릴 이미지다.
                var level = background.Find("Level").GetComponent<UnityEngine.UI.Text>(); // 서버 레벨을 그릴 글자다.
                var name = background.Find("Player name").GetComponent<UnityEngine.UI.Text>(); // 플레이어 이름을 그릴 글자다.
                var detail = background.Find("Public status").GetComponent<UnityEngine.UI.Text>(); // 공개 효과를 그릴 글자다.
                worldHealthBars.Add((background, fill, level, name, detail));
            }

            var bar = worldHealthBars[worldHealthCount++]; // 현재 개체에 배정한 재사용 체력바다.
            Vector2 canvasSize = worldHealthLayer.rect.size; // 전체 체력바 레이어의 Canvas 기준 픽셀 크기다.
            Vector2 halfBar = bar.Background.sizeDelta * 0.5f; // 화면 가장자리에서 확보할 바의 반폭과 반높이다.
            Vector2 position = Vector2.Scale(new Vector2(overhead.x, overhead.y), canvasSize); // 머리 위 화면 위치를 Canvas 기준 픽셀로 바꾼 값이다.
            bar.Background.anchoredPosition = new Vector2(
                Mathf.Clamp(position.x, halfBar.x, canvasSize.x - halfBar.x),
                Mathf.Clamp(position.y, halfBar.y, canvasSize.y - halfBar.y));
            Fill(bar.Fill.rectTransform, status.currentHealth, maximum);
            bar.Level.text = $"Lv.{status.level}";
            bar.Name.gameObject.SetActive(!string.IsNullOrEmpty(playerName));
            bar.Name.text = playerName;
            bar.Fill.color = isLocal ? new Color32(99, 212, 210, 255) :
                status.objectType == "npc" ? new Color32(104, 205, 132, 255) : new Color32(231, 96, 96, 255);
            bool showDetail = !isLocal && status.objectType == "player" && status.activeEffects?.Length > 0; // 공개 활성 효과가 있는 상대에게만 설명을 붙인다.
            bar.Detail.gameObject.SetActive(showDetail);
            if (showDetail)
                bar.Detail.text = DescribeOpponent(status);
            bar.Background.gameObject.SetActive(true);
            if (isLocal)
            {
                // 본인 경험치만 모델 아래에 두고 숫자는 바 아래에 표시한다.
                experienceTrack.anchoredPosition = Vector2.Scale(new Vector2(viewport.x, viewport.y), canvasSize) - Vector2.up * 49f;
                Fill(experienceFill, status.currentExperience, status.requiredExperience);
                experienceText.text = $"{status.currentExperience} / {status.requiredExperience}";
                localExperienceVisible = true;
            }
        }

        // 서버가 공개한 효과 코드만 화면 문구로 바꾼다.
        private static string DescribeOpponent(PortProtocol.EntityStatus status) // status는 상대의 공개 스테이터스다.
        {
            string label = ""; // 확인된 공개 효과를 연결한 문구다.
            if (status.activeEffects == null)
                return label;
            foreach (PortProtocol.ActiveEffect effect in status.activeEffects) // effect는 서버가 이번 틱에 공개한 효과다.
            {
                string name = effect?.code switch // 지원하는 공개 효과의 화면 이름이다.
                {
                    "BAS0003" => "돌진베기",
                    "BAS0005" => "러닝크루",
                    "stunned" => "기절",
                    _ => null
                };
                if (name != null)
                    label += label.Length == 0 ? name : " · " + name;
            }
            return label;
        }

        // 이전 프레임에서 남은 바를 숨기고 다음 프레임에 전체 목록을 재사용한다.
        internal void FinishWorldHealth()
        {
            for (int index = worldHealthCount; index < worldHealthBars.Count; index++) // index는 이번 프레임에 쓰이지 않은 바의 순번이다.
                worldHealthBars[index].Background.gameObject.SetActive(false);
            worldHealthCount = 0;
            experienceTrack.gameObject.SetActive(localExperienceVisible);
            localExperienceVisible = false;
        }

        // 최신 서버 스냅샷의 숫자로 HUD와 상호작용 표시를 갱신한다.
        internal void UpdateStatus(
            PortProtocol.EntityStatus status, // 본인 서버 스테이터스다.
            long remainingMs, // 방 타이머의 남은 시간(밀리초)이다.
            bool canInteract, // 서버 위치와 사용 조건을 만족한 대상이 있는지 나타낸다.
            int poisonDamage) // 서버가 현재 층에서 계산한 3초당 체력 차감량이다.
        {
            // 남은 시간을 초로 올림해 0초가 먼저 표시되는 현상을 막는다.
            long seconds = (remainingMs + 999) / 1000;
            timer.text = $"{seconds / 60:00}:{seconds % 60:00}";
            score.text = $"경쟁 점수  {status.competitionPoints}";
            interaction.gameObject.SetActive(canInteract && !dialog.gameObject.activeSelf);
            poison.gameObject.SetActive(poisonDamage > 0);
            if (poisonDamage > 0)
                poison.text = $"독기   −{poisonDamage} HP / 3초";
        }

        // 결과 화면이 열릴 때 월드 HUD와 독기 경고를 정리한다.
        internal void EndMatch()
        {
            poison.gameObject.SetActive(false);
            interaction.gameObject.SetActive(false);
            FinishWorldHealth();
        }

        // 팝업에서 표시할 문구와 확인·취소 동작을 설정한다.
        internal void ShowDialog(
            string title, // 팝업 제목이다.
            string message, // 종료 사유와 점수 또는 확인 질문이다.
            string confirm, // 주 버튼에 표시할 문구다.
            Action onConfirm, // 주 버튼을 누를 때 실행하며 null이면 서버 응답 대기 상태다.
            string cancel = null, // 보조 버튼의 문구이며 생략하면 숨긴다.
            Action onCancel = null) // 보조 버튼 동작이다.
        {
            dialogTitle.text = title;
            dialogBody.text = message;
            primaryText.text = confirm;
            primaryAction = onConfirm;
            primary.interactable = onConfirm != null;
            primary.GetComponent<RectTransform>().anchoredPosition = new Vector2(cancel == null ? 0 : -74, 17);
            secondaryText.text = cancel;
            secondaryAction = onCancel;
            secondary.gameObject.SetActive(cancel != null);
            dialogCountdown.gameObject.SetActive(false);
            interaction.gameObject.SetActive(false);
            dialog.gameObject.SetActive(true);
        }

        // 결과 화면에서 퇴장 버튼 옆에 남은 시간을 표시한다.
        internal void SetResultCountdown(int seconds) // seconds는 자동 퇴장까지 남은 정수 초다.
        {
            primary.GetComponent<RectTransform>().anchoredPosition = new Vector2(-55f, 17f);
            dialogCountdown.text = $"{seconds}s";
            dialogCountdown.gameObject.SetActive(true);
        }

        // 확인 팝업을 닫아 플레이 화면으로 돌아간다.
        internal void HideDialog()
        {
            dialog.gameObject.SetActive(false);
        }

        // 대기실을 같은 Canvas와 입력 시스템 위에 놓는다.
        internal Transform CanvasRoot => root.transform;

        // HUD와 대기실이 같은 한국어 글꼴을 공유한다.
        internal Font SharedFont => font;

        // 화면을 닫을 때 Canvas를 정리한다. 글꼴은 다른 화면에서도 공유한다.
        internal void Clear()
        {
            UnityEngine.Object.Destroy(root);
        }

        // 바의 전체 너비에서 현재 수치가 차지하는 비율을 설정한다.
        private static void Fill(RectTransform fill, float value, float maximum) // fill은 채움 영역, value와 maximum은 서버의 현재치와 최대치다.
        {
            fill.anchorMax = new Vector2(maximum > 0 ? Mathf.Clamp01(value / maximum) : 0f, 1f);
        }

        // 씬 참조에서 표시용 Text 컴포넌트를 얻는다.
        private static UnityEngine.UI.Text Text(PortSceneUi ui, string key) => ui.Get(key).GetComponent<UnityEngine.UI.Text>(); // ui는 화면 참조, key는 텍스트 키다.

        // 화면에서 버튼으로 표시할 패널과 가운데 라벨을 만든다.
        internal (UnityEngine.UI.Button, UnityEngine.UI.Text) Button(Transform parent, string name, Vector2 anchor, Vector2 offset, Vector2 size) // parent는 배치 루트, name은 계층 이름, anchor는 화면 기준점, offset과 size는 기준 픽셀 단위다.
        {
            // 버튼의 배경과 클릭 대상이다.
            RectTransform rect = Panel(parent, name, anchor, offset, size);
            rect.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            // 마우스 및 키보드 제출을 받을 UI 버튼이다.
            var button = rect.gameObject.AddComponent<UnityEngine.UI.Button>();
            button.targetGraphic = rect.GetComponent<UnityEngine.UI.Image>();
            return (button, Label(rect, "Label", Vector2.one * 0.5f, Vector2.zero, size, 17));
        }

        // 고정 앵커에 읽기 전용 텍스트를 표시한다.
        internal UnityEngine.UI.Text Label(Transform parent, string name, Vector2 anchor, Vector2 offset, Vector2 size, int fontSize) // parent는 부모, name은 계층 이름, anchor는 기준점, offset과 size는 기준 픽셀, fontSize는 글자 크기다.
        {
            // 위치와 크기가 설정된 텍스트 개체다.
            var label = Rect(parent, name, anchor, offset, size).gameObject.AddComponent<UnityEngine.UI.Text>();
            label.font = font;
            label.fontSize = fontSize;
            label.alignment = TextAnchor.MiddleCenter;
            label.color = TextColor;
            label.raycastTarget = false;
            return label;
        }

        // 지정한 앵커에 어두운 배경을 가진 패널을 만든다.
        internal static RectTransform Panel(Transform parent, string name, Vector2 anchor, Vector2 offset, Vector2 size) // parent는 부모, name은 계층 이름, anchor는 기준점, offset과 size는 기준 픽셀이다.
        {
            // 배경을 붙일 화면 위치다.
            RectTransform rect = Rect(parent, name, anchor, offset, size);
            // 배경은 버튼으로 쓰이는 경우에만 마우스를 받는다.
            var image = rect.gameObject.AddComponent<UnityEngine.UI.Image>();
            image.color = PanelColor;
            image.raycastTarget = false;
            return rect;
        }

        // 부모의 기준점에 비율과 픽셀 오프셋으로 UI를 배치한다.
        internal static RectTransform Rect(Transform parent, string name, Vector2 anchor, Vector2 offset, Vector2 size) // parent는 부모, name은 계층 이름, anchor는 기준점, offset과 size는 기준 픽셀이다.
        {
            // Canvas 아래에 놓일 사각형 UI 오브젝트다.
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.pivot = anchor;
            rect.anchoredPosition = offset;
            rect.sizeDelta = size;
            return rect;
        }
    }
}
