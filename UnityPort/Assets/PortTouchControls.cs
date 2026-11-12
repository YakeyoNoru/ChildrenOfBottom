using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace ChildrenOfBottom
{
    // 수동 설정과 마지막 입력 장치를 기준으로 터치 조이스틱과 기술 버튼을 제공한다.
    internal sealed class PortTouchControls
    {
        // 이 PC 또는 기기에만 적용하는 터치 표시 설정의 키다.
        private const string PreferenceKey = "ChildrenOfBottom.Unity.TouchControls";
        private static readonly Vector2 SkillAnchor = new(1f, 0f); // 기술 버튼의 우측 하단 기준점이다.
        private static readonly Vector2[] SkillOffsets = { new(0f, 0f), new(0f, 116f), new(-116f, 0f) }; // 우하단 A, 그 위 B, 그 왼쪽 C의 기준 픽셀 오프셋이다.
        private static readonly Vector2 SkillMargin = new(-24f, 28f); // 화면 오른쪽·아래쪽 끝과 버튼 사이의 기준 픽셀 여백이다.

        // 메뉴에서 반복 선택하는 자동·켜기·끄기 값이다.
        private enum Visibility
        {
            Auto,
            On,
            Off
        }

        // 게임 HUD의 터치 조작부 전체다.
        private readonly RectTransform root;

        // 조이스틱 바탕과 입력 방향을 보여 주는 손잡이다.
        private readonly RectTransform stick;
        private readonly RectTransform thumb;
        private readonly Sprite controlFace; // 조이스틱과 기술 버튼이 공유하는 원형 이미지다.

        // A·B·C 순서로 서버 기술 이름과 재사용 상태를 표시한다.
        private readonly UnityEngine.UI.Button[] buttons = new UnityEngine.UI.Button[3];
        private readonly UnityEngine.UI.Text[] labels = new UnityEngine.UI.Text[3];

        // 최근 사용한 입력이 터치였는지 나타내는 자동 감지 자료다.
        private bool touchDetected = Application.isMobilePlatform || Touchscreen.current != null;

        // 현재 사용자가 선택한 자동 또는 수동 표시 모드다.
        private Visibility visibility;

        // 다른 손가락의 기술 터치와 분리해서 추적할 조이스틱 포인터다.
        private int? stickPointer;

        // 현재 게임의 서버 평면 이동 입력이며 아래쪽을 양수로 사용한다.
        internal Vector2 Axis { get; private set; }

        // 기존 HUD 위에 웹과 같은 원형 조이스틱과 기술 배치를 만든다.
        internal PortTouchControls(PortHud hud, Action<string> cast) // hud는 Canvas, cast는 슬롯을 시전 대기에 올리는 동작이다.
        {
            Visibility defaultMode = Application.platform == RuntimePlatform.Android ? Visibility.On : Visibility.Auto; // Android에서 처음 실행할 때 터치 조작을 켠다.
            int saved = PlayerPrefs.GetInt(PreferenceKey, (int)defaultMode); // 사용자가 명시적으로 저장한 선택은 기본값보다 우선한다.
            visibility = saved >= (int)Visibility.Auto && saved <= (int)Visibility.Off ? (Visibility)saved : defaultMode;

            root = PortHud.Rect(hud.CanvasRoot, "Touch Controls", Vector2.zero, Vector2.zero, Vector2.zero);
            root.anchorMax = Vector2.one;
            root.offsetMin = Vector2.zero;
            root.offsetMax = Vector2.zero;
            controlFace = CreateControlFace();
            stick = PortHud.Panel(root, "Touch Joystick", Vector2.zero, new Vector2(28, 30), new Vector2(132, 132));
            StyleCircle(stick.GetComponent<UnityEngine.UI.Image>(), true);
            thumb = PortHud.Panel(stick, "Joystick Thumb", Vector2.one * 0.5f, Vector2.zero, new Vector2(54, 54));
            StyleCircle(thumb.GetComponent<UnityEngine.UI.Image>(), false);
            // 같은 포인터가 조이스틱 바깥으로 나가도 해제 전까지 입력을 추적한다.
            var stickEvents = stick.gameObject.AddComponent<EventTrigger>();
            AddPointerEvent(stickEvents, EventTriggerType.PointerDown, PressStick);
            AddPointerEvent(stickEvents, EventTriggerType.Drag, MoveStick);
            AddPointerEvent(stickEvents, EventTriggerType.PointerUp, ReleaseStick);
            AddPointerEvent(stickEvents, EventTriggerType.EndDrag, ReleaseStick);

            for (int index = 0; index < buttons.Length; index++) // index는 A·B·C 슬롯의 배열 순번이다.
            {
                string slot = ((char)('A' + index)).ToString(); // 이 화면 버튼이 시전할 서버 슬롯이다.
                float diameter = index == 0 ? 104f : 68f; // 기본 기술과 보조 기술 버튼의 지름이며 기준 픽셀이다.
                // 각 기술의 조작 대상 버튼과 서버 상태 라벨이다.
                (UnityEngine.UI.Button button, UnityEngine.UI.Text label) = hud.Button(root, "Touch Skill " + slot,
                    SkillAnchor, SkillMargin + SkillOffsets[index], Vector2.one * diameter);
                StyleCircle(button.image, true);
                buttons[index] = button;
                labels[index] = label;
                label.fontSize = index == 0 ? 17 : 12;
                label.rectTransform.sizeDelta = new Vector2(diameter - 14f, diameter * 0.7f);
                label.gameObject.AddComponent<UnityEngine.UI.Outline>().effectColor = new Color(0f, 0f, 0f, 0.65f);
                // 탭을 떼기 전에 기존 웹 조작과 같이 포인터를 누를 때 시전한다.
                var trigger = button.gameObject.AddComponent<EventTrigger>();
                AddPointerEvent(trigger, EventTriggerType.PointerDown, pointer => // pointer는 기술 버튼의 마우스 또는 터치 입력이다.
                {
                    if (pointer.button == PointerEventData.InputButton.Left && button.interactable)
                        cast(slot);
                });
            }
            SetAvailable(false, false);
        }

        // 반투명 바탕, 진한 테두리, 밝은 바깥선을 가진 원형 스프라이트를 생성한다.
        private static Sprite CreateControlFace()
        {
            const int size = 128; // 원형 텍스처의 가로·세로 픽셀 수다.
            Texture2D texture = new(size, size, TextureFormat.RGBA32, false); // 원형 그림과 입력 범위를 공유하는 읽기 가능한 텍스처다.
            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            Color32[] pixels = new Color32[size * size]; // 투명 바깥 영역을 포함한 픽셀 배열이다.
            Color fill = new(0.78f, 0.86f, 0.70f, 0.25f); // 지형이 비치는 바탕색이다.
            Color stroke = new(0.23f, 0.29f, 0.23f, 0.9f); // 밝은 지형에서도 보이는 진한 테두리다.
            Color edge = new(0.84f, 0.9f, 0.79f, 0.72f); // 어두운 지형에서 원형을 드러내는 바깥선이다.
            for (int y = 0; y < size; y++) // y는 아래쪽부터 세는 텍스처 행이다.
            for (int x = 0; x < size; x++) // x는 왼쪽부터 세는 텍스처 열이다.
            {
                float distance = new Vector2(x + 0.5f - size / 2f, y + 0.5f - size / 2f).magnitude; // 원 중심까지의 픽셀 거리다.
                Color color = Color.Lerp(fill, stroke, Mathf.Clamp01(distance - 58f)); // 원 내부와 안쪽 테두리의 경계를 부드럽게 연결한다.
                color = Color.Lerp(color, edge, Mathf.Clamp01(distance - 61f));
                color.a *= Mathf.Clamp01(63f - distance);
                pixels[y * size + x] = color;
            }
            texture.SetPixels32(pixels);
            texture.Apply();
            return Sprite.Create(texture, new Rect(0f, 0f, size, size), Vector2.one * 0.5f, 100f, 0, SpriteMeshType.FullRect);
        }

        // 원형 그림을 붙이고 투명한 모서리를 터치 입력 영역에서 제외한다.
        private void StyleCircle(UnityEngine.UI.Image image, bool receivesTouch) // image는 바탕 그림, receivesTouch는 포인터 입력 수신 여부다.
        {
            image.sprite = controlFace;
            image.color = Color.white;
            image.raycastTarget = receivesTouch;
            image.alphaHitTestMinimumThreshold = 0.05f;
        }

        // 게임 UI를 내릴 때 이번 조작부가 생성한 이미지 리소스를 해제한다.
        internal void Dispose()
        {
            UnityEngine.Object.Destroy(controlFace.texture);
            UnityEngine.Object.Destroy(controlFace);
        }

        // 포커스·게임 상태·모달과 사용자의 표시 설정을 종합한다.
        internal void SetAvailable(bool playing, bool canControl) // playing은 게임 진행 여부, canControl은 현재 직접 입력 가능 여부다.
        {
            bool allowPreference = playing && canControl; // 게임 조작이 가능한 동안만 설정 버튼을 보여 준다.
            if (allowPreference)
                DetectInput();
            bool show = allowPreference && (visibility == Visibility.On || (visibility == Visibility.Auto && touchDetected)); // 최종 터치 표시 여부다.
            if (root.gameObject.activeSelf != show)
                root.gameObject.SetActive(show);
            if (!show)
                Reset();
        }

        // 서버의 슬롯과 쿨타임에 맞춰 터치 기술 버튼을 갱신한다.
        internal void Receive(PortProtocol.EntityStatus status, PortSkillShop shop) // status는 서버 본인 상태, shop은 표시 이름과 보유 레벨 자료다.
        {
            SetSkill(0, status.skillA, status.skillACooldownRemaining, shop);
            SetSkill(1, status.skillB, status.skillBCooldownRemaining, shop);
            SetSkill(2, status.skillC, status.skillCCooldownRemaining, shop);
        }

        // 포인터를 놓거나 창을 열거나 연결이 끝나면 이동 입력을 즉시 지운다.
        internal void Reset()
        {
            stickPointer = null;
            Axis = Vector2.zero;
            thumb.anchoredPosition = Vector2.zero;
        }

        // 웹 설정과 같은 비율로 조이스틱과 기술 버튼을 확대한다.
        internal void SetScale(float scale) // 사용자가 지정한 조작부 크기 배율이다.
        {
            stick.localScale = Vector3.one * scale;
            for (int index = 0; index < buttons.Length; index++) // index는 화면 A·B·C 버튼의 순번이다.
            {
                RectTransform button = buttons[index].GetComponent<RectTransform>(); // 확대와 간격 조정을 적용할 버튼이다.
                button.localScale = Vector3.one * scale;
                button.anchoredPosition = SkillMargin + SkillOffsets[index] * scale;
            }
            Reset();
        }

        // 서버 장착과 잔여 쿨타임을 한 개 버튼에 표시한다.
        private void SetSkill(int index, string code, float cooldown, PortSkillShop shop) // index는 슬롯 순번, code는 서버 기술, cooldown은 초, shop은 이름 조회다.
        {
            bool equipped = !string.IsNullOrEmpty(code); // 사용할 기술이 슬롯에 장착돼 있는지 나타낸다.
            buttons[index].interactable = equipped && cooldown <= 0f;
            labels[index].text = equipped
                ? $"{shop.SlotLabel(code)}\n{(cooldown > 0f ? $"{cooldown:0.0}s" : "준비")}"
                : "미지정";
        }

        // 입력 장치는 자동 모드에서만 실제 표시 여부에 반영한다.
        private void DetectInput()
        {
            // 기기의 주 터치 접촉과 데스크톱 키보드·마우스다.
            Touchscreen screen = Touchscreen.current;
            Mouse mouse = Mouse.current;
            Keyboard keyboard = Keyboard.current;
            if (screen?.primaryTouch.press.wasPressedThisFrame == true)
                touchDetected = true;
            else if (screen?.primaryTouch.press.isPressed != true &&
                (keyboard?.anyKey.wasPressedThisFrame == true || mouse?.delta.ReadValue().sqrMagnitude > 1f ||
                 mouse?.leftButton.wasPressedThisFrame == true || mouse?.rightButton.wasPressedThisFrame == true))
                touchDetected = false;
        }

        // 수동 설정을 저장하고 다음 화면 프레임부터 새 모드를 적용한다.
        internal void CyclePreference()
        {
            visibility = (Visibility)(((int)visibility + 1) % 3);
            PlayerPrefs.SetInt(PreferenceKey, (int)visibility);
            PlayerPrefs.Save();
        }

        // 게임 메뉴에서 사용자가 선택한 현재 조작부 표시 모드를 읽는다.
        internal string PreferenceLabel => visibility switch
            {
                Visibility.On => "터치 조작 · 켜기",
                Visibility.Off => "터치 조작 · 끄기",
                _ => "터치 조작 · 자동"
            };

        // 첫 포인터만 조이스틱을 잡게 하고 초기 위치를 반영한다.
        private void PressStick(PointerEventData pointer) // 조이스틱을 누른 입력이다.
        {
            if (stickPointer.HasValue || pointer.button != PointerEventData.InputButton.Left)
                return;
            stickPointer = pointer.pointerId;
            MoveStick(pointer);
        }

        // 조이스틱의 좌우·상하를 서버의 -1~1 정규화 이동축으로 바꾼다.
        private void MoveStick(PointerEventData pointer) // 조이스틱을 움직인 포인터 위치다.
        {
            if (stickPointer != pointer.pointerId ||
                !RectTransformUtility.ScreenPointToLocalPointInRectangle(stick, pointer.position, pointer.pressEventCamera, out Vector2 local))
                return;
            float radius = stick.rect.width * 0.32f; // 웹과 같은 비율로 계산한 조이스틱 이동 반경이다.
            Vector2 normalized = Vector2.ClampMagnitude((local - stick.rect.center) / radius, 1f); // Canvas 위쪽이 양수인 손잡이 방향이다.
            thumb.anchoredPosition = normalized * radius;
            Axis = new Vector2(normalized.x, -normalized.y);
        }

        // 조이스틱을 잡았던 포인터가 풀리면 이동을 중단한다.
        private void ReleaseStick(PointerEventData pointer) // 해제된 마우스 또는 터치 포인터다.
        {
            if (stickPointer == pointer.pointerId)
                Reset();
        }

        // 필요한 포인터 이벤트를 Unity 입력 시스템에 등록한다.
        private static void AddPointerEvent(EventTrigger trigger, EventTriggerType kind, Action<PointerEventData> handler) // trigger는 대상, kind는 이벤트 종류, handler는 처리 동작이다.
        {
            var entry = new EventTrigger.Entry { eventID = kind }; // 한 종류의 포인터 입력을 연결할 등록 자료다.
            entry.callback.AddListener(data => handler((PointerEventData)data)); // data는 Unity가 보낸 포인터 이벤트다.
            trigger.triggers.Add(entry);
        }
    }
}
