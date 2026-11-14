using System;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 게임 씬에서 재사용할 월드 표시 프리팹을 로드하고 서버 개체 분류를 연결한다.
    internal sealed class PortWorldPrefabs
    {
        internal readonly GameObject LocalPlayer = Load("Players/LocalPlayer"); // 카메라가 따라가는 내 캐릭터다.
        internal readonly GameObject Bridge = Load("Terrain/Bridge"); // 생성 맵의 연결로 외형이다.
        // 서버 지형 단계 1~4에 대응하는 높이별 타일 외형이다.
        private readonly GameObject[] tiles =
        {
            Load("Terrain/TerrainTileH1"), Load("Terrain/TerrainTileH2"),
            Load("Terrain/TerrainTileH3"), Load("Terrain/TerrainTileH4")
        };
        internal readonly GameObject Stone = Load("Effects/StoneProjectile"); // 서버 돌 투사체의 외형이다.
        internal readonly GameObject BasicAttack = Load("Effects/BasicAttack"); // 서버 공격 범위를 보여 주는 외형이다.
        internal readonly GameObject Fragment = Load("Items/IllusionFragment"); // 일괄 렌더링할 환영조각 외형이다.

        private readonly GameObject remotePlayer = Load("Players/RemotePlayer"); // 다른 참가자의 캐릭터다.
        private readonly GameObject monster = Load("Enemies/Monster"); // 공통 몬스터 외형이다.
        private readonly GameObject npc = Load("NPCs/Npc"); // 개별 외형이 없는 NPC의 기본값이다.
        private readonly GameObject exitNpc = Load("NPCs/ExitNpc"); // 탈출구 NPC의 외형이다.
        private readonly GameObject prop = Load("Props/Prop"); // 개별 외형이 없는 사물의 기본값이다.
        private readonly GameObject returnLantern = Load("Props/ReturnLantern"); // 귀환등 사물의 외형이다.

        // 서버 단계에 맞는 타일 프리팹을 반환한다.
        internal GameObject Tile(int height) => tiles[Mathf.Clamp(height - 1, 0, tiles.Length - 1)]; // height는 서버의 지형 단계다.

        // 서버의 종류와 분류 코드를 외형에 매핑한다. 판정은 서버 상태를 계속 사용한다.
        internal GameObject Actor(PortProtocol.EntityStatus status) => (status.objectType, status.classificationCode) switch // status는 서버 개체 종류와 분류 코드를 제공한다.
        {
            ("npc", "NPC_EXIT") => exitNpc,
            ("prop", "OBJ0001") => returnLantern,
            ("npc", _) => npc,
            ("prop", _) => prop,
            ("enemy", _) => monster,
            _ => remotePlayer
        };

        // 게임 씬 로드 중에 프리팹을 찾고 누락된 경로를 바로 알린다.
        private static GameObject Load(string path) // WorldPrefabs 기준 확장자를 제외한 상대 경로다.
        {
            GameObject prefab = Resources.Load<GameObject>("WorldPrefabs/" + path); // 실제 생성에 사용할 원본이다.
            return prefab != null ? prefab : throw new InvalidOperationException($"월드 프리팹을 찾을 수 없습니다: {path}");
        }
    }
}
