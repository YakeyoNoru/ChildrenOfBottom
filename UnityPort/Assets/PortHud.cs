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
        private readonly GameObject root = new("ChildrenOfBottom HUD", typeof(Canvas));

        // 한국어와 숫자를 표시하는 운영체제 글꼴이다.
        private readonly Font font = Font.CreateDynamicFontFromOSFont(new[] { "Malgun Gothic", "Noto Sans CJK KR", "Arial" }, 22);

        // 레벨과 경쟁 점수, 방 시간, 기술 상태를 각각 표시한다.
        private readonly UnityEngine.UI.Text level;
        private readonly UnityEngine.UI.Text timer;
        private readonly UnityEngine.UI.Text skills;

        // 서버가 보고한 현재 위치의 독기 차감량을 알린다.
        private readonly UnityEngine.UI.Text poison;

        // 체력 및 경험치 바의 안내 숫자와 채움 영역이다.
        private readonly UnityEngine.UI.Text healthText;
        private readonly UnityEngine.UI.Text experienceText;
        private readonly RectTransform healthFill;
        private readonly RectTransform experienceFill;

        // 다른 HUD 요소 아래에 개체 체력바를 그리는 전체 화면 레이어다.
        private readonly RectTransform worldHealthLayer;

        // 화면에 나타나는 개체에 순서대로 재사용하는 체력바 배경과 채움 영역이다.
        private readonly List<(RectTransform Background, UnityEngine.UI.Image Fill, UnityEngine.UI.Text Detail)> worldHealthBars = new();

        // 현재 프레임에 사용한 체력바 수다.
        private int worldHealthCount;

        // 결과 도착 직전에 받은 서버 최대 체력이다.
        private float maximumHealth;

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

        // 현재 대화 상자의 버튼이 수행할 명령이다.
        private Action primaryAction;
        private Action secondaryAction;

        // 플레이 상태와 결과 화면을 표시할 Canvas를 생성한다.
        internal PortHud(Action interact = null, Action openSkills = null) // interact와 openSkills는 게임 UI를 만들 때만 전달하는 상호작용과 기술 창 동작이다.
        {
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
            if (interact == null || openSkills == null)
                return;

            worldHealthLayer = Rect(root.transform, "World health bars", Vector2.zero, Vector2.zero, Vector2.zero);
            worldHealthLayer.anchorMax = Vector2.one;

            // 가로 화면에서 왼쪽 위에 고정할 상태 패널이다.
            RectTransform vitals = Panel(root.transform, "Vitals", Vector2.up, new Vector2(18, -18), new Vector2(252, 112));
            level = Label(vitals, "Level and score", Vector2.up, new Vector2(12, -8), new Vector2(228, 24), 18);
            (healthText, healthFill) = Meter(vitals, "HP", -40);
            (experienceText, experienceFill) = Meter(vitals, "EXP", -72);
            timer = Label(root.transform, "Room timer", new Vector2(0.5f, 1), new Vector2(0, -18), new Vector2(144, 43), 26);
            timer.gameObject.AddComponent<UnityEngine.UI.Outline>().effectColor = Color.black;
            timer.text = "--:--";
            poison = Label(root.transform, "Poison exposure", new Vector2(0.5f, 1), new Vector2(0, -58), new Vector2(220, 28), 18);
            poison.color = new Color(1f, 0.76f, 1f);
            poison.gameObject.AddComponent<UnityEngine.UI.Outline>().effectColor = Color.black;
            poison.gameObject.SetActive(false);

            // 아래쪽에 현재 기술 버튼과 서버 쿨타임을 표시한다.
            RectTransform skillPanel = Panel(root.transform, "Skills", new Vector2(1, 0), new Vector2(-18, 18), new Vector2(272, 72));
            // 기술 정보를 누르면 키보드 없이도 같은 기술 창을 연다.
            UnityEngine.UI.Image skillBackground = skillPanel.GetComponent<UnityEngine.UI.Image>();
            skillBackground.raycastTarget = true;
            var skillButton = skillPanel.gameObject.AddComponent<UnityEngine.UI.Button>(); // HUD 기술 창 버튼이다.
            skillButton.targetGraphic = skillBackground;
            skillButton.onClick.AddListener(() => openSkills()); // 기술 창을 열거나 닫는다.
            skills = Label(skillPanel, "Skill cooldowns", Vector2.one * 0.5f, Vector2.zero, new Vector2(260, 68), 16);

            (interaction, _) = Button(root.transform, "Interaction", new Vector2(0.5f, 0), new Vector2(0, 24), new Vector2(186, 46));
            interaction.GetComponentInChildren<UnityEngine.UI.Text>().text = "※ 상호작용 [F]";
            interaction.onClick.AddListener(() => interact()); // 버튼으로 가까운 서버 개체를 사용한다.
            interaction.gameObject.SetActive(false);

            dialog = Panel(root.transform, "Game dialog", Vector2.one * 0.5f, Vector2.zero, new Vector2(374, 188));
            dialog.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            dialogTitle = Label(dialog, "Title", new Vector2(0.5f, 1), new Vector2(0, -15), new Vector2(350, 36), 24);
            dialogBody = Label(dialog, "Message", Vector2.one * 0.5f, new Vector2(0, 8), new Vector2(350, 46), 20);
            (primary, primaryText) = Button(dialog, "Confirm", new Vector2(0.5f, 0), new Vector2(-74, 17), new Vector2(134, 40));
            (secondary, secondaryText) = Button(dialog, "Cancel", new Vector2(0.5f, 0), new Vector2(74, 17), new Vector2(134, 40));
            primary.onClick.AddListener(() => primaryAction?.Invoke()); // 대화창의 주 버튼을 실행한다.
            secondary.onClick.AddListener(() => secondaryAction?.Invoke()); // 대화창의 보조 버튼을 실행한다.
            dialog.gameObject.SetActive(false);
        }

        // 화면 안에 들어온 개체 위에 최신 서버 체력 비율을 표시한다.
        internal void DrawWorldHealth(
            Transform model, // 보간된 개체 위치와 활성 상태를 제공하는 모형이다.
            PortProtocol.EntityStatus status, // 최신 서버 스테이터스다.
            Camera camera, // 월드 위치를 화면 좌표로 변환할 카메라다.
            bool isLocal) // 본인 체력바에 별도 색을 사용할지 나타낸다.
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
                RectTransform background = Panel(worldHealthLayer, "Health bar", Vector2.zero,
                    Vector2.zero, new Vector2(38f, 6f)); // 바의 배경 크기는 Canvas 기준 픽셀이다.
                background.pivot = new Vector2(0.5f, 0.5f);
                RectTransform fillRect = Rect(background, "Fill", Vector2.zero, Vector2.zero, Vector2.zero); // 배경 안쪽의 체력 채움 영역이다.
                fillRect.anchorMax = Vector2.one;
                fillRect.offsetMin = Vector2.up;
                fillRect.offsetMax = Vector2.down;
                UnityEngine.UI.Image fill = fillRect.gameObject.AddComponent<UnityEngine.UI.Image>(); // 서버 체력 비율만큼 가로로 채우는 이미지다.
                fill.raycastTarget = false;
                UnityEngine.UI.Text detail = Label(background, "Public status", new Vector2(0.5f, 0.5f),
                    new Vector2(0f, -11f), new Vector2(190f, 16f), 11); // 상대 레벨과 공개 효과 이름을 바 바로 아래에 표시한다.
                detail.gameObject.AddComponent<UnityEngine.UI.Outline>().effectColor = Color.black;
                worldHealthBars.Add((background, fill, detail));
            }

            var bar = worldHealthBars[worldHealthCount++]; // 현재 개체에 배정한 재사용 체력바다.
            Vector2 canvasSize = worldHealthLayer.rect.size; // 전체 체력바 레이어의 Canvas 기준 픽셀 크기다.
            Vector2 halfBar = bar.Background.sizeDelta * 0.5f; // 화면 가장자리에서 확보할 바의 반폭과 반높이다.
            Vector2 position = Vector2.Scale(new Vector2(overhead.x, overhead.y), canvasSize); // 머리 위 화면 위치를 Canvas 기준 픽셀로 바꾼 값이다.
            bar.Background.anchoredPosition = new Vector2(
                Mathf.Clamp(position.x, halfBar.x, canvasSize.x - halfBar.x),
                Mathf.Clamp(position.y, halfBar.y, canvasSize.y - halfBar.y));
            Fill(bar.Fill.rectTransform, status.currentHealth, maximum);
            bar.Fill.color = isLocal ? new Color32(99, 212, 210, 255) :
                status.objectType == "npc" ? new Color32(104, 205, 132, 255) : new Color32(231, 96, 96, 255);
            bool showDetail = !isLocal && status.objectType == "player"; // 공개 상태 설명은 상대 플레이어에게만 붙인다.
            bar.Detail.gameObject.SetActive(showDetail);
            if (showDetail)
                bar.Detail.text = DescribeOpponent(status);
            bar.Background.gameObject.SetActive(true);
        }

        // 서버에서 공개한 레벨과 현재 효과 코드를 화면 문구로 바꾼다.
        private static string DescribeOpponent(PortProtocol.EntityStatus status) // status는 상대의 공개 스테이터스다.
        {
            string label = $"Lv. {status.level}"; // 상대 체력바와 함께 표시할 레벨 및 효과 문구다.
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
                    label += " · " + name;
            }
            return label;
        }

        // 이전 프레임에서 남은 바를 숨기고 다음 프레임에 전체 목록을 재사용한다.
        internal void FinishWorldHealth()
        {
            for (int index = worldHealthCount; index < worldHealthBars.Count; index++) // index는 이번 프레임에 쓰이지 않은 바의 순번이다.
                worldHealthBars[index].Background.gameObject.SetActive(false);
            worldHealthCount = 0;
        }

        // 최신 서버 스냅샷의 숫자로 HUD와 상호작용 표시를 갱신한다.
        internal void UpdateStatus(
            PortProtocol.EntityStatus status, // 본인 서버 스테이터스다.
            long remainingMs, // 방 타이머의 남은 시간(밀리초)이다.
            bool canInteract, // 서버 위치와 사용 조건을 만족한 대상이 있는지 나타낸다.
            int poisonDamage, // 서버가 현재 층에서 계산한 3초당 체력 차감량이다.
            PortSkillShop skillShop) // 기술의 서버 이름과 보유 레벨을 조회한다.
        {
            // 남은 시간을 초로 올림해 0초가 먼저 표시되는 현상을 막는다.
            long seconds = (remainingMs + 999) / 1000;
            timer.text = $"{seconds / 60:00}:{seconds % 60:00}";
            level.text = $"Lv. {status.level}   |   경쟁 {status.competitionPoints}";
            maximumHealth = status.effective?.maxHealth ?? 0f;
            healthText.text = $"HP   {status.currentHealth:0.#} / {maximumHealth:0.#}";
            experienceText.text = $"EXP   {status.currentExperience} / {status.requiredExperience}";
            Fill(healthFill, status.currentHealth, maximumHealth);
            Fill(experienceFill, status.currentExperience, status.requiredExperience);
            skills.text = $"좌클릭 {skillShop.SlotLabel(status.skillA)}   {Cooldown(status.skillACooldownRemaining)}\n" +
                $"우클릭 {skillShop.SlotLabel(status.skillB)}   {Cooldown(status.skillBCooldownRemaining)}\n" +
                $"Shift {skillShop.SlotLabel(status.skillC)}   {(string.IsNullOrEmpty(status.skillC) ? "—" : Cooldown(status.skillCCooldownRemaining))}   [B] 기술";
            interaction.gameObject.SetActive(canInteract && !dialog.gameObject.activeSelf);
            poison.gameObject.SetActive(poisonDamage > 0);
            if (poisonDamage > 0)
                poison.text = $"독기   −{poisonDamage} HP / 3초";
        }

        // 결과 확정 후 독기 경고를 끄고 사망 결과에서는 체력을 0으로 표시한다.
        internal void EndMatch(bool died) // 서버의 종료 사유가 DEATH이면 true다.
        {
            poison.gameObject.SetActive(false);
            if (died)
            {
                healthText.text = $"HP   0 / {maximumHealth:0.#}";
                Fill(healthFill, 0f, maximumHealth);
            }
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
            interaction.gameObject.SetActive(false);
            dialog.gameObject.SetActive(true);
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

        // Play 종료 시 생성한 Canvas와 동적 글꼴을 해제한다.
        internal void Clear()
        {
            UnityEngine.Object.Destroy(root);
            UnityEngine.Object.Destroy(font);
        }

        // 재사용 가능 또는 서버가 보낸 남은 초를 짧게 표시한다.
        private static string Cooldown(float seconds) // 기술 재사용까지 남은 서버 초다.
        {
            return seconds > 0 ? $"{seconds:0.0}s" : "준비";
        }

        // 바의 전체 너비에서 현재 수치가 차지하는 비율을 설정한다.
        private static void Fill(RectTransform fill, float value, float maximum) // fill은 채움 영역, value와 maximum은 서버의 현재치와 최대치다.
        {
            fill.anchorMax = new Vector2(maximum > 0 ? Mathf.Clamp01(value / maximum) : 0f, 1f);
        }

        // 상태 바 배경, 채움, 현재 값의 화면 구조를 만든다.
        private (UnityEngine.UI.Text, RectTransform) Meter(RectTransform parent, string name, float top) // parent는 상태 패널, name은 표시 이름, top은 기준 화면 픽셀 위치다.
        {
            // 바탕은 상태 패널 안에서 가로로 고정된다.
            RectTransform track = Panel(parent, name, Vector2.up, new Vector2(12, top), new Vector2(228, 23));
            // 채움 너비는 현재 서버 수치의 비율로 설정된다.
            RectTransform fill = Rect(track, "Fill", Vector2.zero, Vector2.zero, Vector2.zero);
            fill.offsetMin = Vector2.zero;
            fill.offsetMax = Vector2.zero;
            // 채움 영역에는 트랙과 대비되는 상태 색을 사용한다.
            var image = fill.gameObject.AddComponent<UnityEngine.UI.Image>();
            image.color = name == "HP" ? new Color(0.71f, 0.24f, 0.25f) : new Color(0.15f, 0.60f, 0.53f);
            image.raycastTarget = false;
            return (Label(track, "Value", Vector2.one * 0.5f, Vector2.zero, new Vector2(228, 23), 15), fill);
        }

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
