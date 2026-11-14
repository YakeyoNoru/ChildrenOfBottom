using System;
using System.Collections.Generic;
using System.Runtime.Serialization;
using Newtonsoft.Json;

namespace ChildrenOfBottom
{
    // 서버 메시지에서 이번 3D 프리뷰에 필요한 필드를 역직렬화한다.
    internal static class PortProtocol
    {
        // 로비에서 자유 입력 이름을 안전하게 JSON으로 직렬화하는 명령이다.
        [System.Serializable]
        internal sealed class RoomEntry
        {
            public int v = 1; // 현재 서버 프로토콜 버전이다.
            public string type; // 방 생성 또는 참가 요청 종류다.
            public string requestId = "lobby"; // 방 응답을 현재 대기 명령과 대조한다.
            public string name; // 플레이어가 입력한 표시 이름이다.
            public string code; // 참가할 서버 방 코드이며 생성에는 사용하지 않는다.
            public bool publicOnly; // 공개 목록에서 고른 방이 그 사이 비공개로 전환됐다면 참가를 거절한다.
        }

        // 중첩 배열을 포함하는 서버의 JSON을 그대로 읽는다.
        internal static T Read<T>(string json) // 서버 메시지 또는 미리보기 맵 원본이다.
        {
            // Unity의 IL2CPP를 지원하는 JSON 패키지로 기존 DataMember 이름과 사전·중첩 배열을 읽는다.
            return JsonConvert.DeserializeObject<T>(json);
        }

        // 서버가 전송하는 메시지 봉투다.
        [DataContract]
        internal sealed class Message
        {
            [DataMember] internal int v; // 서버 프로토콜 버전이다.
            [DataMember] internal string type; // 처리할 메시지 종류다.
            [DataMember] internal string playerId; // 서버가 welcome에서 부여한 플레이어 식별자다.
            [DataMember] internal string code; // 실패 시 서버가 부여한 오류 코드다.
            [DataMember] internal string requestId; // 기술 실패를 일으킨 시전 요청을 식별한다.
            [DataMember] internal string message; // 방 명령 실패나 해제 사유를 표시한다.
            [DataMember] internal PublicRoom[] rooms; // 서버가 공개한 대기실 목록이다.
            [DataMember] internal Room room; // 상태 이벤트에 포함된 방 자료다.
            [DataMember] internal string id; // 서버가 발급한 상호작용 확인 ID다.
            [DataMember] internal string resultId; // 서버가 확인을 기록한 결과 ID다.
            [DataMember] internal Result result; // 서버에서 확정한 점수와 종료 사유다.
            [DataMember] internal string token; // 현재 게임으로 돌아갈 때만 쓰는 비공개 복귀 토큰이다.
            [DataMember] internal int graceMs; // 끊긴 뒤 서버가 캐릭터를 보관하는 시간(밀리초)이다.
        }

        // 공개 방 검색 결과의 한 항목이다.
        [DataContract]
        internal sealed class PublicRoom
        {
            [DataMember] internal string code; // 참가할 방 코드다.
            [DataMember] internal string hostName; // 대기방 방장의 서버 이름이다.
            [DataMember] internal int playerCount; // 현재 방 인원이다.
            [DataMember] internal int maxPlayers; // 서버가 허용한 방 정원이다.
        }

        // 전체 상태에서 맵을 받고 이후 상태에서 본인 위치를 읽는 데 사용한다.
        [DataContract]
        internal sealed class Room
        {
            [DataMember] internal string code; // 다른 방에 입장했는지 판별하는 서버 코드다.
            [DataMember] internal long serverTime; // 탐지 효과 만료와 비교할 서버 시각(ms)이다.
            [DataMember] internal long snapshotSequence; // 중복 상태를 걸러낼 서버의 방별 증가 순번이다.
            [DataMember] internal string hostId; // 방 시작을 요청할 수 있는 플레이어다.
            [DataMember] internal int maxPlayers; // 서버가 허용하는 방 정원이다.
            [DataMember(Name = "private")] internal bool privateRoom; // 목록에 공개하지 않는 방인지 나타낸다.
            [DataMember] internal string phase; // 대기실과 게임 중 상태를 구분한다.
            [DataMember] internal Map map; // 초기 스냅샷이 보내는 서버 지도다.
            [DataMember] internal Entity[] players; // 변경 스냅샷에도 포함되는 서버 플레이어 상태다.
            [DataMember] internal Entity[] objects; // 전체 스냅샷에 들어 있는 월드 개체 목록이다.
            [DataMember] internal ObjectChanges objectChanges; // 직전 상태에 적용할 비플레이어 개체 변경분이다.
            [DataMember] internal SkillEffect[] skillEffects; // 현재 표시할 서버 확정 기술 효과다.
            [DataMember] internal Timer timer; // 방 생성부터 흐르는 서버 카운트다운이다.
            [DataMember] internal Item[] items; // 초기 전체 필드 아이템 상태다.
            [DataMember] internal ItemChanges itemChanges; // 이후 틱에 바뀌거나 제거된 필드 아이템이다.
            [DataMember] internal Dictionary<string, SkillDefinition> skillCatalog; // 초기 방 상태에 오는 코드별 기술 정의다.
            [DataMember] internal Stone[] stones; // 이번 서버 상태의 비행 중 투사체 전체 목록이다.
        }

        // 서버가 확정한 월드 개체 위치와 표시 상태다.
        [DataContract]
        internal sealed class Entity
        {
            [DataMember] internal string id; // 본인 식별자와 비교한다.
            [DataMember(Name = "x")] internal double worldX; // 서버의 오른쪽 양수 가로 좌표(월드 단위) 원본이다.
            [DataMember(Name = "y")] internal double worldY; // 서버의 아래쪽 양수 세로 좌표(월드 단위) 원본이다.
            internal float x { get => (float)worldX; set => worldX = value; } // 화면 표시에서 쓰는 가로 좌표다.
            internal float y { get => (float)worldY; set => worldY = value; } // 화면 표시에서 쓰는 세로 좌표다.
            [DataMember] internal int lastProcessedInput; // 서버가 처리한 마지막 이동 입력 순번이다.
            [DataMember] internal EntityStatus status; // 월드 모형과 생존 상태를 결정하는 자료다.
            [DataMember] internal string ownerId; // 소유자가 있는 사물을 사용할 수 있는 플레이어 ID다.
            [DataMember] internal bool interactionEnabled; // 서버가 상호작용을 열어 둔 개체인지 나타낸다.
            [DataMember] internal int poisonDamage; // 현 위치에서 독기 3초 박자당 차감될 서버 체력 수치다.
            [DataMember] internal string name; // 대기실에 표시할 플레이어 이름이다.
            [DataMember] internal bool ready; // 방장이 아닌 참가자가 게임 시작에 동의했는지 나타낸다.
            [DataMember] internal float facing; // 서버 화면 평면의 주시 방향이며 단위는 라디안이다.
            [DataMember] internal TestOptions testOptions; // 서버가 허용한 테스트 옵션이다.
            [DataMember] internal int inputQueueLength; // 서버가 아직 처리하지 않은 이동 스텝의 개수다.
            [DataMember] internal Roll roll; // 서버가 시작한 구르기의 이동 방향과 남은 거리다.
        }

        // 서버가 시전 승인한 구르기를 재실행할 때 필요한 이동 상태다.
        [DataContract]
        internal sealed class Roll
        {
            [DataMember] internal double angle; // 서버 평면 방향이며 단위는 라디안이다.
            [DataMember] internal double speed; // 구르기 속도이며 단위는 서버 월드 단위/초다.
            [DataMember] internal double remaining; // 남은 구르기 거리이며 단위는 서버 월드 단위다.
        }

        // 지도의 공개 범위를 결정하는 서버 승인 옵션이다.
        [DataContract]
        internal sealed class TestOptions
        {
            [DataMember] internal bool mapHack; // 전체맵 지형만 공개하는 옵션이다.
            [DataMember] internal bool highSpeed; // 서버가 이동속도 6을 적용했는지 나타낸다.
        }

        // 바닥과 획득 비행에 공통으로 쓰는 필드 아이템 원본이다.
        [DataContract]
        internal sealed class Item
        {
            [DataMember] internal string id; // 방 안에서 고유한 아이템 식별자다.
            [DataMember] internal string code; // 표시 모형을 선택하는 아이템 코드다.
            [DataMember] internal float x; // 시작 가로 좌표이며 서버 월드 단위다.
            [DataMember] internal float y; // 시작 세로 좌표이며 서버 월드 단위다.
            [DataMember] internal string state; // 바닥 대기 또는 서버가 승인한 획득 비행이다.
            [DataMember] internal string targetId; // 비행 대상의 서버 개체 식별자다.
        }

        // 필드 아이템의 생성·획득 예약·취소 및 제거를 담는다.
        [DataContract]
        internal sealed class ItemChanges
        {
            [DataMember] internal Item[] updates; // 새 상태로 교체할 아이템이다.
            [DataMember] internal string[] removed; // 서버에서 지급을 마친 아이템 식별자다.
        }

        // 현재 3D 프리뷰가 읽는 서버 스테이터스 필드다.
        [DataContract]
        internal sealed class EntityStatus
        {
            [DataMember] internal string objectType; // 플레이어·몬스터·NPC·사물 모형을 구분한다.
            [DataMember] internal string state; // 사망 개체의 모형을 숨기는 서버 판정값이다.
            [DataMember] internal string classificationCode; // 귀환등과 탈출구 등의 서버 분류 코드다.
            [DataMember] internal int level; // 서버 확정 플레이어 레벨이다.
            [DataMember] internal float currentHealth; // 현재 체력이다.
            [DataMember] internal Vitals effective; // 보너스까지 적용한 최대 체력 자료다.
            [DataMember] internal ActiveEffect[] activeEffects; // 상대에게 공개된 현재 버프·기술 효과다.
            [DataMember] internal int currentExperience; // 현재 레벨에 누적된 경험치다.
            [DataMember] internal int requiredExperience; // 다음 레벨에 필요한 경험치다.
            [DataMember] internal int competitionPoints; // 플레이 중 서버 경쟁 점수다.
            [DataMember] internal float skillACooldownRemaining; // A 기술의 잔여 쿨타임(초)이다.
            [DataMember] internal float skillBCooldownRemaining; // B 기술의 잔여 쿨타임(초)이다.
            [DataMember] internal float skillCCooldownRemaining; // C 기술의 잔여 쿨타임(초)이다.
            [DataMember] internal string skillC; // Shift 슬롯의 장착 여부를 확인하는 기술 코드다.
            [DataMember] internal string skillA; // 좌클릭 슬롯에 장착된 기술 코드다.
            [DataMember] internal string skillB; // 우클릭 슬롯에 장착된 기술 코드다.
            [DataMember] internal int skillPoints; // 기술 구매와 리롤에 쓸 서버 포인트다.
            [DataMember] internal int rerollCount; // 포인트보다 우선 사용하는 무료 리롤 횟수다.
            [DataMember] internal long playerRevealUntil; // 다른 생존 플레이어의 지도 표식 만료 시각(ms)이다.
            [DataMember] internal double moveSpeed; // 서버가 확정한 기본 이동 능력치다.
            [DataMember] internal double bonusMoveSpeed; // 기본 이동 능력치에 합산할 서버 추가 수치다.
            [DataMember] internal double? hitboxDiameter; // 지형 통행 판정에 쓰는 서버 월드 단위의 피격 원 지름이다.
            [DataMember] internal bool stunned; // 서버 기절 상태로 이동이 막혔는지 나타낸다.
            [DataMember] internal bool dashActive; // 서버가 별도로 처리하는 돌진 이동이 진행 중인지 나타낸다.
            [DataMember] internal string[] handSkillCode; // 중복과 순서를 보존하는 서버 손패다.
            [DataMember] internal Dictionary<string, int> ownedSkills; // 기술 코드별 보유 레벨이다.
        }

        // 서버가 보내는 기술 카드의 화면 표시 및 구매 자료다.
        [DataContract]
        internal sealed class SkillDefinition
        {
            [DataMember] internal string name; // 기술 카드에 보여 줄 서버 이름이다.
            [DataMember] internal string typeCode; // 장착 슬롯 또는 패시브의 P다.
            [DataMember] internal string basicEffect; // 사용 시 발동하는 서버 정의 설명이다.
            [DataMember] internal string triggerEffect; // 구매 시 또는 조건부로 적용되는 서버 설명이다.
            [DataMember] internal int skillPoints; // 한 장을 구입할 때 사용하는 포인트다.
        }

        // 돌던지기 투사체의 서버 위치다.
        [DataContract]
        internal sealed class Stone
        {
            [DataMember] internal string id; // 같은 투사체를 이전 상태와 연결하는 ID다.
            [DataMember] internal float x; // 가로 위치의 서버 월드 좌표다.
            [DataMember] internal float y; // 세로 위치의 서버 월드 좌표다.
        }

        // 체력 바의 분모에 사용할 최종 능력치다.
        [DataContract]
        internal sealed class Vitals
        {
            [DataMember] internal float maxHealth; // 서버가 계산한 추가 체력 포함 최대 체력이다.
        }

        // 상대에게 공개할 활성 효과의 화면 표시 자료다.
        [DataContract]
        internal sealed class ActiveEffect
        {
            [DataMember] internal string code; // 서버가 공개한 효과의 표시 코드를 식별한다.
        }

        // 클라이언트에서 재설정하지 않는 방 타이머다.
        [DataContract]
        internal sealed class Timer
        {
            [DataMember] internal long remainingMs; // 서버가 계산한 남은 시간(밀리초)이다.
        }

        // 서버가 확정한 결과 화면의 자료다.
        [DataContract]
        internal sealed class Result
        {
            [DataMember] internal string id; // 확인과 퇴장에 재사용할 결과 ID다.
            [DataMember] internal string reason; // 탈출·사망·시간 종료를 구분하는 서버 값이다.
            [DataMember] internal int competitionPoints; // 게임 종료 시 확정된 경쟁 점수다.
        }

        // 한 스냅샷에서 생성·이동·제거된 비플레이어 개체를 담는다.
        [DataContract]
        internal sealed class ObjectChanges
        {
            [DataMember] internal Entity[] added; // 새 개체의 전체 상태다.
            [DataMember] internal EntityPatch[] updated; // 기존 개체에 덮어쓸 상태다.
            [DataMember] internal string[] removed; // 제거된 개체의 식별자다.
        }

        // 위치와 상태의 변경을 각각 서버 스냅샷에서 읽는다.
        [DataContract]
        internal sealed class EntityPatch
        {
            [DataMember] internal string id; // 변경할 기존 개체의 식별자다.
            [DataMember] internal PositionPatch fields; // 이동 좌표를 포함한 개체 필드 변경이다.
            [DataMember] internal StatusPatch status; // 생존 상태를 포함한 스테이터스 변경이다.
        }

        // 현재 표시에서 사용하는 위치 변경 묶음이다.
        [DataContract]
        internal sealed class PositionPatch
        {
            [DataMember] internal PositionFields set; // 서버가 이번 스냅샷에서 갱신한 좌표다.
        }

        // 일부 축만 바뀔 수 있는 월드 좌표 변경이다.
        [DataContract]
        internal sealed class PositionFields
        {
            [DataMember] internal float? x; // 서버의 가로 좌표다. 단위는 월드 단위다.
            [DataMember] internal float? y; // 서버의 세로 좌표다. 단위는 월드 단위다.
            [DataMember] internal bool? interactionEnabled; // 한 번 사용한 상호작용을 비활성화하는 변경이다.
        }

        // 화면에 적용할 변경된 스테이터스 묶음이다.
        [DataContract]
        internal sealed class StatusPatch
        {
            [DataMember] internal StatusFields set; // 이번 스냅샷에 포함된 변경 필드만 읽는다.
        }

        // 비플레이어 개체의 상태 변경에서 화면 표시에 필요한 값만 읽는다.
        [DataContract]
        internal sealed class StatusFields
        {
            [DataMember] internal string state; // 모형과 체력바 표시를 제어하는 서버 생존 상태다.
            [DataMember] internal float? currentHealth; // 서버 현재 체력이며, 누락과 실제 체력 0을 구별한다.
            [DataMember] internal Vitals effective; // 최대 체력을 포함하는 서버 최종 능력치의 교체 값이다.
        }

        // 기본공격의 서버 판정 위치에 시각 효과를 놓는 데 쓰인다.
        [DataContract]
        internal sealed class SkillEffect
        {
            [DataMember] internal string id; // 효과가 계속 유지되는 동안 동일한 서버 식별자다.
            [DataMember] internal string code; // 기본공격 BAS0001 표시를 고른다.
            [DataMember] internal float x; // 시전 원점의 가로 좌표다. 단위는 월드 단위다.
            [DataMember] internal float y; // 시전 원점의 세로 좌표다. 단위는 월드 단위다.
            [DataMember] internal float angle; // 서버의 화면 좌표 기준 시전 방향이다. 단위는 라디안이다.
            [DataMember] internal float width; // 공격 범위의 폭이다. 단위는 월드 단위다.
            [DataMember] internal float length; // 공격 범위의 길이다. 단위는 월드 단위다.
        }

        // 구덩이 지형과 다리를 그리는 데 필요한 서버 지도 필드다.
        [DataContract]
        internal sealed class Map
        {
            [DataMember] internal string id; // 동일 방에서 지도 캐시를 식별하는 서버 ID다.
            [DataMember(Name = "tileRadius")] internal double gridRadius; // 격자 중심 간격을 정하는 서버 월드 반지름이다.
            [DataMember(Name = "landScale")] internal double gridLandScale; // 격자 반지름 대비 실제 지형 반지름의 서버 원본 비율이다.
            internal float tileRadius => (float)gridRadius; // 렌더링에서 쓰는 격자 월드 반지름이다.
            internal float landScale => (float)gridLandScale; // 렌더링에서 쓰는 지형 반지름 비율이다.
            [DataMember] internal float bridgeWidth; // 같은 높이 다리의 폭이다. 단위는 월드 단위다.
            [DataMember] internal float heightBridgeWidth; // 다른 높이 다리의 폭이다. 단위는 월드 단위다.
            [DataMember] internal Tile[] tiles; // 배열 순번으로 다리 양끝을 찾는 타일 목록이다.
            [DataMember] internal int[][] bridges; // 연결된 두 타일의 배열 순번이다.

            // 서버와 같은 육각 격자 식으로 평면 타일 중심을 구한다.
            internal UnityEngine.Vector2 Center(int index) // index는 서버 타일 배열의 순번이다.
            {
                return ExactCenter(index).ToDisplay();
            }

            // 서버의 배정밀도를 유지한 육각 격자 중심을 반환한다.
            internal PortMovementMap.Point ExactCenter(int index) // index는 서버 타일 배열의 순번이다.
            {
                Tile tile = tiles[index]; // 현재 타일의 육각 격자 좌표다.
                return new PortMovementMap.Point(1.5d * gridRadius * tile.q,
                    System.Math.Sqrt(3d) * gridRadius * (tile.r + tile.q / 2d));
            }
        }

        // 육각 격자의 지형 한 칸이다.
        [DataContract]
        internal sealed class Tile
        {
            [DataMember] internal int id; // 플레이어 입장 순번과 매칭하는 서버 지형 번호다.
            [DataMember] internal int q; // 육각 격자의 축 좌표다.
            [DataMember] internal int r; // 육각 격자의 다른 축 좌표다.
            [DataMember] internal int height; // 서버 지형 단계이며 Unity에서는 높이별 프리팹 선택에 사용한다.
        }
    }
}
