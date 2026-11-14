using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ChildrenOfBottom
{
    // 필드 아이템의 서버 상태를 화면용 원과 비행으로 표시한다.
    internal sealed class PortItemView
    {
        // 서버의 원본과 로컬 비행 시각을 함께 보관한다.
        private sealed class Entry
        {
            internal PortProtocol.Item Item; // 최신 서버 아이템 상태다.
            internal double FlightStart; // 비행을 받은 로컬 시각(초)이며 음수면 바닥 상태다.
            internal bool Removed; // 서버 지급 완료 후 비행 표시만 남았는지 나타낸다.
            internal string FlightTarget; // 서버 승인 또는 화면 예측으로 선택한 획득 대상이다.
            internal bool Confirmed; // 서버가 비행을 승인했는지 나타낸다.
            internal int InputSequence; // 예측 위치에 반영한 마지막 이동 입력 순번이다.
            internal bool Blocked; // 같은 접근에서 서버가 거절한 비행을 반복하지 않게 한다.
        }

        // 서버 50ms 획득 시간과 같은 화면 연출 길이다. 단위는 초다.
        private const double FlightSeconds = 0.05;
        // 환영조각 획득 중심 반경이며 서버 월드 단위다.
        private const float PickupRadius = 30f;

        // Unity의 인스턴스 렌더링 호출당 허용되는 최대 모형 수다.
        private const int BatchSize = 1023;

        // 방 안의 아이템 식별자로 조회하는 화면 기록이다.
        private readonly Dictionary<string, Entry> entries = new();

        // 전체 상태 재수신 때 여전히 존재하는 서버 아이템 목록이다.
        private readonly HashSet<string> present = new();

        // 순회가 끝난 뒤 제거할 아이템 식별자다.
        private readonly List<string> expired = new();

        // 원 테두리와 밝은 중심부의 프레임별 인스턴스 변환 목록이다.
        private readonly Matrix4x4[] outlines = new Matrix4x4[BatchSize];
        private readonly Matrix4x4[] centers = new Matrix4x4[BatchSize];

        // 프리팹에서 읽은 테두리와 밝은 중심부의 일괄 렌더링 설정이다.
        private readonly MeshFilter outline; // 바깥 테두리에 그릴 메시 제공자다.
        private readonly MeshFilter center; // 밝은 중심부에 그릴 메시 제공자다.
        private readonly Material outlineMaterial; // 바깥 테두리의 인스턴스 재질이다.
        private readonly Material centerMaterial; // 밝은 중심부의 인스턴스 재질이다.
        private readonly Matrix4x4 outlineLocal; // 프리팹 테두리의 기준 위치와 크기다.
        private readonly Matrix4x4 centerLocal; // 프리팹 중심부의 기준 위치와 크기다.

        // 서버 월드 단위당 Unity 미터다.
        private readonly float scale;

        // 현재 표시하고 있는 방의 서버 코드다.
        private string roomCode;
        // 최근 서버에서 본인이 살아 있는 것으로 확인됐는지 나타낸다.
        private bool localAlive;

        // 환영조각의 프리팹 외형을 기존 인스턴스 렌더링에 연결한다.
        internal PortItemView(float scale, GameObject prefab) // scale은 월드 단위당 미터이며 prefab은 환영조각의 외형 원본이다.
        {
            this.scale = scale;
            outline = prefab.transform.Find("FragmentOutline").GetComponent<MeshFilter>();
            center = prefab.transform.Find("FragmentCenter").GetComponent<MeshFilter>();
            outlineMaterial = outline.GetComponent<MeshRenderer>().sharedMaterial;
            centerMaterial = center.GetComponent<MeshRenderer>().sharedMaterial;
            Matrix4x4 rootLocal = LocalMatrix(prefab.transform); // 프리팹 루트의 크기와 방향을 두 파트에 공통 적용한다.
            outlineLocal = rootLocal * LocalMatrix(outline.transform);
            centerLocal = rootLocal * LocalMatrix(center.transform);
        }

        // 환영조각 루트 기준 외형의 위치, 방향과 크기를 일괄 렌더링 변환으로 읽는다.
        private static Matrix4x4 LocalMatrix(Transform part) // part는 표시할 테두리 또는 중심부다.
        {
            return Matrix4x4.TRS(part.localPosition, part.localRotation, part.localScale);
        }

        private PortTerrainSurface terrain; // 조각이 놓일 현재 지형과 다리 윗면이다.

        // 새 지도에서 환영조각이 따라갈 표면을 지정한다.
        internal void UseTerrain(PortTerrainSurface surface) => terrain = surface; // surface는 현재 맵의 표시용 지형이다.

        // 전체 목록 또는 변경분을 서버 수신 순서대로 적용한다.
        internal void Apply(PortProtocol.Room room, double now) // room은 서버 상태, now는 로컬 수신 시각(초)이다.
        {
            if (roomCode != room.code)
            {
                entries.Clear();
                roomCode = room.code;
            }

            if (room.items != null)
            {
                present.Clear();
                foreach (PortProtocol.Item item in room.items) // item은 서버에 남은 필드 아이템이다.
                {
                    present.Add(item.id);
                    UpdateItem(item, now);
                }
                expired.Clear();
                foreach (string id in entries.Keys) // id는 전체 상태에 남았는지 확인할 식별자다.
                    if (!present.Contains(id))
                        expired.Add(id);
                foreach (string id in expired) // id는 새 전체 상태에 없는 아이템이다.
                    Remove(id, now);
            }
            if (room.itemChanges == null)
                return;
            foreach (PortProtocol.Item item in room.itemChanges.updates) // item은 이번 틱에 변경된 서버 상태다.
                UpdateItem(item, now);
            foreach (string id in room.itemChanges.removed) // id는 지급이 끝난 서버 아이템이다.
                Remove(id, now);
        }

        // 서버가 예약하거나 취소한 비행을 화면 기록에 반영한다.
        private void UpdateItem(PortProtocol.Item item, double now) // item은 서버 상태, now는 로컬 수신 시각(초)이다.
        {
            if (!entries.TryGetValue(item.id, out Entry entry)) // entry는 동일한 아이템의 기존 화면 기록이다.
            {
                entry = new Entry { FlightStart = -1 };
                entries.Add(item.id, entry);
            }
            if (item.state == "flying")
            {
                if (entry.FlightStart < 0 || entry.FlightTarget != item.targetId)
                    entry.FlightStart = now;
                entry.FlightTarget = item.targetId;
                entry.Confirmed = true;
            }
            else if (entry.Confirmed)
                CancelFlight(entry);
            entry.Item = item;
            entry.Removed = false;
        }

        // 예측에 사용한 입력이 서버에서 처리된 뒤에만 미획득 조각을 복구한다.
        internal void Reconcile(PortProtocol.Entity player) // 서버에서 확인한 본인 상태와 이동 순번이다.
        {
            localAlive = player.status.state == "alive";
            foreach (Entry entry in entries.Values) // entry는 서버 승인을 기다릴 수 있는 조각의 화면 기록이다.
            {
                if (entry.FlightStart < 0 || entry.Confirmed || entry.Removed ||
                    entry.Item.state != "ground" || player.lastProcessedInput < entry.InputSequence)
                    continue;
                double dx = player.worldX - entry.Item.x; // 서버가 확정한 중심과 조각의 가로 거리다.
                double dy = player.worldY - entry.Item.y; // 서버가 확정한 중심과 조각의 세로 거리다.
                if (!localAlive || dx * dx + dy * dy > PickupRadius * PickupRadius)
                    CancelFlight(entry);
            }
        }

        // 거절되거나 취소된 비행을 원위치로 돌리고 반경을 벗어날 때까지 재예측을 막는다.
        private static void CancelFlight(Entry entry) // 원래 위치로 되돌릴 조각의 표시 기록이다.
        {
            entry.FlightStart = -1d;
            entry.FlightTarget = null;
            entry.Confirmed = false;
            entry.Blocked = true;
        }

        // 지급 완료가 먼저 도착해도 진행 중인 화면 비행을 끝까지 유지한다.
        private void Remove(string id, double now) // id는 제거된 서버 아이템, now는 로컬 수신 시각(초)이다.
        {
            if (!entries.TryGetValue(id, out Entry entry)) // entry는 지급 후 화면에 남아 있을 수 있는 기록이다.
                return;
            if (entry.FlightStart < 0 || now - entry.FlightStart >= FlightSeconds)
                entries.Remove(id);
            else
                entry.Removed = true;
        }

        // 로컬 시각으로 비행을 보간하고 근처 환영조각을 묶어 렌더링한다.
        internal void Draw(
            Camera camera, // 환영조각을 보여 줄 게임 카메라다.
            Vector3 player, // 본인 모형의 표시 위치(미터)다.
            string playerId, // 본인의 서버 개체 식별자다.
            int inputSequence, // 본인 표시 위치에 반영한 최신 이동 입력 순번이다.
            PortWorldView world, // 원격 대상의 표시 위치를 조회한다.
            double now) // 프레임의 로컬 시각(초)이다.
        {
            // 이 렌더링 묶음에 들어 있는 인스턴스 수다.
            int count = 0;
            expired.Clear();
            foreach (KeyValuePair<string, Entry> pair in entries) // pair는 아이템 ID와 서버·표시 상태다.
            {
                // 현재 아이템의 비행 시작과 지급 상태를 담는다.
                Entry entry = pair.Value;
                if (entry.Item.code != "illusionFragment")
                    continue;
                // 서버 판정과 별도로 본인 화면 위치가 픽업 반경에 들어왔는지 확인한다.
                float dx = player.x / scale - entry.Item.x; // 본인 표시 위치와 조각의 월드 가로 거리다.
                float dy = -player.z / scale - entry.Item.y; // 본인 표시 위치와 조각의 월드 세로 거리다.
                bool near = localAlive && dx * dx + dy * dy <= PickupRadius * PickupRadius; // 본인 표시 위치가 반경 안에 있다.
                if (!near)
                    entry.Blocked = false;
                if (near && !entry.Blocked && !entry.Removed && entry.FlightStart < 0 && entry.Item.state == "ground")
                {
                    entry.FlightStart = now;
                    entry.FlightTarget = playerId;
                    entry.InputSequence = inputSequence;
                }
                // 수신 시점부터 흘러간 비행 진행률이다.
                float progress = entry.FlightStart < 0 ? 0f : (float)((now - entry.FlightStart) / FlightSeconds);
                if (entry.Removed && progress >= 1f)
                    expired.Add(pair.Key);
                if (progress >= 1f)
                    continue;

                // 아이템 바닥 위치와 비행 중 표시 위치다. 단위는 Unity 미터다.
                Vector3 position = terrain.Position(entry.Item.x, entry.Item.y, 0.025f);
                if (entry.FlightStart >= 0 && entry.FlightTarget != null)
                {
                    // 비행은 획득자의 렌더링 위치를 따라가며 판정 좌표를 변경하지 않는다.
                    Vector3 target = entry.FlightTarget == playerId ? player : world.DisplayPosition(entry.FlightTarget, position);
                    position = Vector3.Lerp(position, target, progress);
                }

                // 카메라 밖 멀리 있는 아이템은 인스턴스에 넣지 않는다.
                Vector3 viewport = camera.WorldToViewportPoint(position);
                if (viewport.z <= 0 || viewport.x < -0.01f || viewport.x > 1.01f || viewport.y < -0.01f || viewport.y > 1.01f)
                    continue;

                // Unity 미터로 변환한 표시 위치에 프리팹의 두 외형을 함께 배치한다.
                Matrix4x4 placement = Matrix4x4.Translate(position);
                outlines[count] = placement * outlineLocal;
                centers[count] = placement * centerLocal;
                if (++count == BatchSize)
                {
                    DrawBatch(camera, count);
                    count = 0;
                }
            }

            if (count > 0)
                DrawBatch(camera, count);
            foreach (string id in expired) // id는 지급과 화면 비행을 모두 마친 아이템이다.
                entries.Remove(id);
        }

        // 현재 변환 목록의 원 테두리와 중심을 한 번씩 그린다.
        private void DrawBatch(Camera camera, int count) // camera는 게임 카메라, count는 이번에 그릴 개수다.
        {
            Graphics.DrawMeshInstanced(outline.sharedMesh, 0, outlineMaterial, outlines, count, null, ShadowCastingMode.Off, false, 0, camera);
            Graphics.DrawMeshInstanced(center.sharedMesh, 0, centerMaterial, centers, count, null, ShadowCastingMode.Off, false, 0, camera);
        }

        // 방을 나가거나 연결이 끝났을 때 화면의 아이템 기록을 비운다.
        internal void Reset()
        {
            entries.Clear();
            roomCode = null;
            localAlive = false;
        }
    }
}
