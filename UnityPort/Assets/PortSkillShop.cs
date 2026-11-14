using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 서버 손패 구매, 리롤, 보유 기술 장착을 위한 기능 화면이다.
    internal sealed class PortSkillShop
    {
        // 기술 창에 고정되는 기준 위치다.
        private static readonly Vector2 Top = new(0.5f, 1f);

        // 카드 행과 버튼에 공통 화면 요소를 제공한다.
        private readonly PortHud hud;
        private readonly UnityEngine.UI.Button skillTemplate; // 동적 기술 카드를 복제할 프리팹이다.

        // 기술 창과 스크롤 목록의 배치 기준이다.
        private readonly RectTransform panel;
        private readonly RectTransform list;
        private readonly UnityEngine.UI.ScrollRect scroll;

        // 서버 포인트, 오류 메시지, 리롤의 비용을 표시한다.
        private readonly UnityEngine.UI.Text resources;
        private readonly UnityEngine.UI.Text notice;
        private readonly UnityEngine.UI.Button reroll;
        private readonly UnityEngine.UI.Text rerollText;

        // 실제 기술 명령을 보내고 서버 응답을 기다리도록 요청한다.
        private readonly Func<string, string, bool> send;

        // 변경되지 않은 목록을 다시 그리지 않도록 마지막 표시 키를 저장한다.
        private string drawn;

        // 보유 기술 탭 여부와 서버 응답 대기 여부다.
        private bool equipping;
        private bool pending;

        // 마지막 서버 스냅샷에서 수신한 기술 정의와 본인 상태다.
        private Dictionary<string, PortProtocol.SkillDefinition> catalog;
        private PortProtocol.EntityStatus status;

        // 같은 씬에 서버 기술을 확인할 창을 만든다.
        internal PortSkillShop(PortHud hud, PortSceneUi ui, Func<string, string, bool> send) // hud는 공통 Canvas, ui는 씬 참조, send는 명령 종류와 코드를 보내는 함수다.
        {
            this.hud = hud;
            this.send = send;
            panel = ui.Get("Skill Shop");
            skillTemplate = ui.SkillTemplate;
            resources = ui.Get("Skill Shop/Skill Points").GetComponent<UnityEngine.UI.Text>();
            AddButton(ui, "손패", () => Select(false)); // 서버 손패를 표시한다.
            AddButton(ui, "보유 기술", () => Select(true)); // 장착 가능한 기술을 표시한다.
            AddButton(ui, "닫기 [B]", Hide);
            scroll = ui.Get("Skill Shop/Skill list").GetComponent<UnityEngine.UI.ScrollRect>();
            list = scroll.content;
            notice = ui.Get("Skill Shop/Skill response").GetComponent<UnityEngine.UI.Text>();
            reroll = ui.Get("Skill Shop/Reroll").GetComponent<UnityEngine.UI.Button>();
            rerollText = ui.Get("Skill Shop/Reroll/Label").GetComponent<UnityEngine.UI.Text>();
            reroll.onClick.AddListener(() => Request("game.skill.reroll", null)); // 서버에 손패 다시 뽑기를 요청한다.
            Hide();
        }

        // 게임 입력을 차단해야 하는 창 열림 상태다.
        internal bool IsOpen => panel.gameObject.activeSelf;

        // 장착한 서버 기술의 표시 이름과 보유 레벨을 반환한다.
        internal string SlotLabel(string code) // 현재 슬롯의 서버 기술 코드다.
        {
            if (string.IsNullOrEmpty(code) || catalog == null || !catalog.TryGetValue(code, out PortProtocol.SkillDefinition skill)) // skill은 서버 기술 정의다.
                return "미지정";
            // level은 기술을 구매해서 얻은 보유 레벨이다.
            return status?.ownedSkills != null && status.ownedSkills.TryGetValue(code, out int level)
                ? $"{skill.name} Lv. {level}" : skill.name;
        }

        // 게임의 최신 전체 기술 정의가 들어오면 보관한다.
        internal void ReceiveCatalog(Dictionary<string, PortProtocol.SkillDefinition> definitions) // 코드별 서버 정의다.
        {
            if (definitions == null)
                return;
            catalog = definitions;
            drawn = null;
        }

        // 게임 상태의 본인 자원과 손패를 화면에 반영한다.
        internal void ReceiveStatus(PortProtocol.EntityStatus current) // 본인의 최신 서버 상태다.
        {
            status = current;
            if (IsOpen)
                Refresh();
        }

        // 서버 손패 구매 탭을 기본으로 연다.
        internal void Show()
        {
            notice.text = "";
            panel.gameObject.SetActive(true);
            Select(false);
        }

        // 조작을 게임 화면으로 돌린다.
        internal void Hide()
        {
            panel.gameObject.SetActive(false);
        }

        // 방을 벗어날 때 구매 상태와 정의를 함께 초기화한다.
        internal void Reset()
        {
            Hide();
            catalog = null;
            status = null;
            pending = false;
            drawn = null;
        }

        // 명령 완료 또는 거부를 받은 뒤 해당 화면의 조작을 다시 허용한다.
        internal void Complete(string message) // 성공이면 빈 문자열, 실패면 서버 오류 안내다.
        {
            pending = false;
            notice.text = message;
            if (IsOpen)
                Refresh();
        }

        // 키보드로 선택한 탭에 맞게 카드 내용을 그린다.
        private void Select(bool equippedTab) // true이면 보유 기술 목록이다.
        {
            equipping = equippedTab;
            drawn = null;
            Refresh();
            scroll.verticalNormalizedPosition = 1f;
        }

        // 서버가 반영하기 전에는 자원과 손패를 직접 바꾸지 않는다.
        private void Request(string command, string code) // command는 구매·리롤·장착, code는 선택 기술이다.
        {
            if (pending || !send(command, code))
                return;
            pending = true;
            notice.text = "";
            Refresh();
        }

        // 실제 상태가 바뀐 경우에만 화면 목록을 재생성한다.
        private void Refresh()
        {
            if (status == null || catalog == null)
                return;

            // 중복 카드와 보유 레벨을 서버 상태 그대로 조회한다.
            string[] hand = status.handSkillCode ?? Array.Empty<string>();
            Dictionary<string, int> owned = status.ownedSkills;
            // 목록의 활성 상태와 내용에 영향을 주는 값의 조합이다.
            string key = $"{equipping}:{pending}:{status.skillPoints}:{status.rerollCount}:{status.skillA}:{status.skillB}:{status.skillC}:" +
                string.Join(",", hand) + ":" + (owned == null ? "" : string.Join(",", owned));
            if (drawn == key)
                return;
            drawn = key;
            resources.text = $"스킬포인트 {status.skillPoints} SP";
            reroll.gameObject.SetActive(!equipping);
            reroll.interactable = !pending && (hand.Length == 0 || status.rerollCount > 0 || status.skillPoints > 0);
            rerollText.text = hand.Length == 0 ? "무료 드로우" :
                status.rerollCount > 0 ? $"무료 리롤 ({status.rerollCount}회)" : "리롤 (1 SP)";

            for (int index = list.childCount - 1; index >= 0; index--) // index는 이전 목록의 자식 순번이다.
            {
                // 현재 서버 상태로 교체할 기존 카드 행이다.
                GameObject previous = list.GetChild(index).gameObject;
                previous.SetActive(false);
                UnityEngine.Object.Destroy(previous);
            }

            if (!equipping && hand.Length == 0)
                hud.Label(list, "Empty hand", Top, Vector2.zero, new Vector2(540, 50), 18).text = "손패가 비었습니다.";
            // 시작 기본 기술은 보유 레벨 0이어도 재장착할 수 있다.
            IEnumerable<string> codes = equipping
                ? new[] { "BAS0001", "BAS0002" }.Concat(owned?.Keys ?? Enumerable.Empty<string>()).Distinct()
                : hand;
            foreach (string code in codes) // code는 이번에 그릴 서버 기술 카드 식별자다.
            {
                if (!catalog.TryGetValue(code, out PortProtocol.SkillDefinition skill)) // skill은 해당 기술의 서버 정의다.
                    continue;
                if (equipping && skill.typeCode == "P")
                    continue;
                AddSkill(code, skill);
            }
        }

        // 기술 설명·가격 또는 보유 레벨과 현재 장착 여부를 한 행에 표시한다.
        private void AddSkill(string code, PortProtocol.SkillDefinition skill) // code는 서버 명령 값, skill은 화면에 표시할 정의다.
        {
            // 현재 서버가 해당 슬롯에 배정한 기술 코드다.
            string equipped = skill.typeCode switch { "A" => status.skillA, "B" => status.skillB, "C" => status.skillC, _ => null };
            // 보유 레벨이 아직 없으면 0으로 표시한다.
            int ownedLevel = status.ownedSkills != null && status.ownedSkills.TryGetValue(code, out int level) ? level : 0; // level은 해당 기술의 서버 보유 레벨이다.
            // 한 줄 장착 버튼 또는 설명을 포함한 구매 카드다.
            var button = UnityEngine.Object.Instantiate(skillTemplate, list); // 서버 기술 하나를 표시하는 프리팹 복제본이다.
            button.name = code;
            var rect = (RectTransform)button.transform; // 장착 행의 높이를 구매 카드보다 짧게 설정한다.
            if (equipping)
                rect.sizeDelta = new Vector2(rect.sizeDelta.x, 43f);
            var label = button.GetComponentInChildren<UnityEngine.UI.Text>(); // 이름 및 기술 설명을 표시한다.
            label.fontSize = 16;
            if (equipping)
            {
                label.text = $"{skill.name}  ·  {skill.typeCode}  ·  Lv. {ownedLevel}  ·  {(equipped == code ? "장착 중" : "장착")}";
                button.interactable = !pending && equipped != code;
                button.onClick.AddListener(() => Request("game.skill.equip", code)); // 이 기술을 서버 슬롯에 장착한다.
            }
            else
            {
                label.text = $"{skill.name}  ·  {skill.typeCode}  ·  {skill.skillPoints} SP\n{skill.basicEffect} {skill.triggerEffect}".Trim();
                label.resizeTextForBestFit = true;
                label.resizeTextMinSize = 12;
                label.resizeTextMaxSize = 16;
                button.interactable = !pending && status.skillPoints >= skill.skillPoints;
                button.onClick.AddListener(() => Request("game.skill.buy", code)); // 해당 손패 카드 한 장의 구입을 요청한다.
            }
        }

        // 창 상단 탭이나 닫기 버튼을 추가한다.
        private static void AddButton(PortSceneUi ui, string title, Action action) // ui는 씬 참조, title은 버튼 키, action은 클릭 동작이다.
        {
            // 화면에 표시할 탐색 버튼과 그 라벨이다.
            var button = ui.Get("Skill Shop/" + title).GetComponent<UnityEngine.UI.Button>(); // 기술 창 탭 또는 닫기 버튼이다.
            button.onClick.AddListener(() => action()); // 선택한 탭 또는 닫기 명령을 실행한다.
        }
    }
}
