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

        // 메뉴에서 반복 선택하는 자동·켜기·끄기 값이다.
        private enum Visibility
        {
            Auto,
            On,
            Off
        }

        // 터치 조작부 전체와 표시 모드 버튼이다.
        private readonly RectTransform root;
        private readonly UnityEngine.UI.Button preference;
        private readonly UnityEngine.UI.Text preferenceText;

        // 조이스틱 바탕과 입력 방향을 보여 주는 손잡이다.
        private readonly RectTransform stick;
        private readonly RectTransform thumb;

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

        // 기존 HUD 위에 작은 기능 검증용 조작부를 만든다.
        internal PortTouchControls(PortHud hud, Action<string> cast) // hud는 Canvas, cast는 슬롯을 시전 대기에 올리는 동작이다.
        {
            // 로컬 저장값이 비정상일 경우 자동 감지로 돌아간다.
            int saved = PlayerPrefs.GetInt(PreferenceKey, (int)Visibility.Auto);
            visibility = saved >= (int)Visibility.Auto && saved <= (int)Visibility.Off ? (Visibility)saved : Visibility.Auto;
            (preference, preferenceText) = hud.Button(hud.CanvasRoot, "Touch Controls Preference", Vector2.up,
                new Vector2(18, -141), new Vector2(172, 35));
            preference.onClick.AddListener(CyclePreference); // 자동과 두 수동 설정을 차례로 선택한다.
            RefreshPreference();

            root = PortHud.Rect(hud.CanvasRoot, "Touch Controls", Vector2.zero, Vector2.zero, Vector2.zero);
            root.anchorMax = Vector2.one;
            root.offsetMin = Vector2.zero;
            root.offsetMax = Vector2.zero;
            stick = PortHud.Panel(root, "Touch Joystick", Vector2.zero, new Vector2(30, 29), new Vector2(144, 144));
            stick.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            thumb = PortHud.Panel(stick, "Joystick Thumb", Vector2.one * 0.5f, Vector2.zero, new Vector2(52, 52));
            thumb.GetComponent<UnityEngine.UI.Image>().color = new Color(0.53f, 0.67f, 0.68f, 0.88f);
            // 같은 포인터가 조이스틱 바깥으로 나가도 해제 전까지 입력을 추적한다.
            var stickEvents = stick.gameObject.AddComponent<EventTrigger>();
            AddPointerEvent(stickEvents, EventTriggerType.PointerDown, PressStick);
            AddPointerEvent(stickEvents, EventTriggerType.Drag, MoveStick);
            AddPointerEvent(stickEvents, EventTriggerType.PointerUp, ReleaseStick);
            AddPointerEvent(stickEvents, EventTriggerType.EndDrag, ReleaseStick);

            for (int index = 0; index < buttons.Length; index++) // index는 A·B·C 슬롯의 배열 순번이다.
            {
                string slot = ((char)('A' + index)).ToString(); // 이 화면 버튼이 시전할 서버 슬롯이다.
                // 각 기술의 조작 대상 버튼과 서버 상태 라벨이다.
                (UnityEngine.UI.Button button, UnityEngine.UI.Text label) = hud.Button(root, "Touch Skill " + slot,
                    new Vector2(1f, 0f), new Vector2(-18 - (2 - index) * 88, 100), new Vector2(82, 58));
                buttons[index] = button;
                labels[index] = label;
                label.fontSize = 15;
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

        // 포커스·게임 상태·모달과 사용자의 표시 설정을 종합한다.
        internal void SetAvailable(bool playing, bool canControl) // playing은 게임 진행 여부, canControl은 현재 직접 입력 가능 여부다.
        {
            bool allowPreference = playing && canControl; // 게임 조작이 가능한 동안만 설정 버튼을 보여 준다.
            preference.gameObject.SetActive(allowPreference);
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
                button.anchoredPosition = new Vector2(-18 - (2 - index) * 88 * scale, 100);
            }
            Reset();
        }

        // 서버 장착과 잔여 쿨타임을 한 개 버튼에 표시한다.
        private void SetSkill(int index, string code, float cooldown, PortSkillShop shop) // index는 슬롯 순번, code는 서버 기술, cooldown은 초, shop은 이름 조회다.
        {
            bool equipped = !string.IsNullOrEmpty(code); // 사용할 기술이 슬롯에 장착돼 있는지 나타낸다.
            buttons[index].interactable = equipped && cooldown <= 0f;
            labels[index].text = equipped
                ? $"{(char)('A' + index)} {shop.SlotLabel(code)}\n{(cooldown > 0f ? $"{cooldown:0.0}s" : "준비")}"
                : $"{(char)('A' + index)} 미지정";
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
        private void CyclePreference()
        {
            visibility = (Visibility)(((int)visibility + 1) % 3);
            PlayerPrefs.SetInt(PreferenceKey, (int)visibility);
            PlayerPrefs.Save();
            RefreshPreference();
        }

        // 사용자가 현재 선택한 표시 모드를 버튼에 알린다.
        private void RefreshPreference()
        {
            preferenceText.text = visibility switch
            {
                Visibility.On => "터치 조작 · 켜기",
                Visibility.Off => "터치 조작 · 끄기",
                _ => "터치 조작 · 자동"
            };
        }

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
