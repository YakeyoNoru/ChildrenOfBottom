using System.Collections.Generic;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 서버의 개체 상태와 기술 효과를 장면에 반영한다.
    internal sealed class PortWorldView
    {
        // 서버가 확정한 개체 상태와 화면에 표시할 모형을 묶는다.
        private sealed class Actor
        {
            internal PortProtocol.Entity State; // 위치와 생존 상태를 포함한 서버 원본이다.
            internal GameObject Model; // 해당 개체의 화면 전용 모형이다.
            internal TextMesh Nameplate; // 카메라에 보일 때만 만드는 개체 이름이다.
            internal readonly List<Pose> History = new(32); // 상대 보간에 쓰는 최근 서버 시각별 위치다.
        }

        // 한 서버 스냅샷의 표시 전용 위치다.
        private readonly struct Pose
        {
            internal readonly double TimeMs; // 서버가 위치를 생성한 시각(밀리초)이다.
            internal readonly Vector2 Position; // 서버 평면 월드 좌표다.

            // 이후 상태 변경에도 영향을 받지 않게 좌표를 복사한다.
            internal Pose(double timeMs, Vector2 position) // timeMs는 밀리초, position은 서버 월드 위치다.
            {
                TimeMs = timeMs;
                Position = position;
            }
        }

        // 개체별 위치 이력을 같은 서버 시각으로 보간하는 재생기다.
        private readonly PortRemoteClock clock = new();

        // 개체를 서버 식별자로 찾아 변경분을 적용한다.
        private readonly Dictionary<string, Actor> actors = new();

        // 서버가 제거할 때까지 시전 원점에 남겨 둘 기본공격 범위다.
        private readonly Dictionary<string, GameObject> effects = new();

        // 서버가 유지하는 돌 투사체의 식별자별 모형이다.
        private readonly Dictionary<string, GameObject> stones = new();

        // 이번 전체 상태에 살아 있는 식별자를 기록할 때 재사용한다.
        private readonly HashSet<string> present = new();

        // 사전 순회를 마친 뒤 제거할 식별자 목록이다.
        private readonly List<string> stale = new();

        // 월드 모형과 공격 표시를 담는 씬 루트다.
        private readonly Transform root = new GameObject("ChildrenOfBottom World Objects").transform;

        // 서버 월드 단위를 Unity 미터로 바꾸는 배율이다.
        private readonly float scale;

        // 체력바를 표시하는 플레이어 중심 기준 수평 반경이며 서버 월드 단위다.
        private const float HealthBarRange = 600f;

        // 월드 개체용 씬 루트와 좌표 변환을 준비한다.
        internal PortWorldView(float scale) // 서버 월드 단위당 Unity 미터다.
        {
            this.scale = scale;
        }

        // 전체 스냅샷 또는 서버 순서대로 수신한 개체 변경분을 적용한다.
        internal void Apply(
            PortProtocol.Room room, // 이번 전체 상태 또는 변경 스냅샷이다.
            string localId, // 별도 카메라 대상이 이미 그리는 본인 식별자다.
            double now) // 로컬 수신 시각(초)이다.
        {
            present.Clear();
            foreach (PortProtocol.Entity player in room.players) // player는 서버가 전체 상태를 보내는 참가자다.
                if (player.id != localId)
                    AddOrUpdate(player);

            if (room.objects != null)
            {
                foreach (PortProtocol.Entity entity in room.objects) // entity는 전체 상태에 포함된 서버 개체다.
                    if (entity.status.objectType != "player")
                        AddOrUpdate(entity);
            }

            stale.Clear();
            foreach (KeyValuePair<string, Actor> entry in actors) // entry는 유지 또는 제거할 기존 화면 개체다.
                if (!present.Contains(entry.Key) && (room.objects != null || entry.Value.State.status.objectType == "player"))
                    stale.Add(entry.Key);
            foreach (string id in stale) // id는 서버 상태에서 사라진 개체 식별자다.
                Remove(id);

            if (room.objectChanges != null)
                ApplyChanges(room.objectChanges);
            RecordPoses(room.serverTime, now);
            ApplyEffects(room.skillEffects);
            ApplyStones(room.stones);
        }

        // 부분 변경을 모두 적용한 뒤 표시 전용 위치를 서버 시각별로 남긴다.
        private void RecordPoses(long serverTime, double now) // serverTime은 서버 생성 ms, now는 로컬 수신 초다.
        {
            double stamp = clock.Receive(serverTime, now, out bool resetHistory); // stamp는 이력 시각(ms), resetHistory는 시간축 교체 여부다.
            foreach (Actor actor in actors.Values) // actor는 이번 스냅샷에서 위치를 기록할 개체다.
            {
                List<Pose> history = actor.History; // 이 개체의 최근 32개 위치 이력이다.
                if (resetHistory)
                    history.Clear();
                var pose = new Pose(stamp, new Vector2(actor.State.x, actor.State.y)); // 최신 서버 표시 좌표다.
                if (history.Count > 0 && history[history.Count - 1].TimeMs == stamp)
                    history[history.Count - 1] = pose;
                else
                {
                    if (history.Count == 32)
                        history.RemoveAt(0);
                    history.Add(pose);
                }
            }
        }

        // 서버 돌의 최신 위치를 표시하고 사라진 투사체를 제거한다.
        private void ApplyStones(PortProtocol.Stone[] active) // 이번 상태에서 비행 중인 서버 돌 목록이다.
        {
            present.Clear();
            if (active != null)
            {
                foreach (PortProtocol.Stone stone in active) // stone은 서버가 유지하는 투사체다.
                {
                    present.Add(stone.id);
                    if (!stones.TryGetValue(stone.id, out GameObject model)) // model은 현재 돌의 표시 모형이다.
                    {
                        model = CreateModel("Stone Projectile", PrimitiveType.Sphere, new Color(0.06f, 0.05f, 0.08f));
                        model.transform.localScale = Vector3.one * (14f * scale);
                        stones.Add(stone.id, model);
                    }
                    model.transform.position = Position(stone.x, stone.y, 0.24f);
                }
            }
            stale.Clear();
            foreach (string id in stones.Keys) // id는 이번 상태에서 남아 있는지 확인할 투사체다.
                if (!present.Contains(id))
                    stale.Add(id);
            foreach (string id in stale) // id는 서버가 제거한 투사체다.
            {
                Object.Destroy(stones[id]);
                stones.Remove(id);
            }
        }

        // 변경 스냅샷의 생성·좌표 수정·제거를 기존 화면 개체에 반영한다.
        private void ApplyChanges(PortProtocol.ObjectChanges changes) // 서버가 한 틱 동안 계산한 변경분이다.
        {
            foreach (PortProtocol.Entity entity in changes.added) // entity는 이번 틱에 생성된 서버 개체다.
                AddOrUpdate(entity);

            foreach (PortProtocol.EntityPatch patch in changes.updated) // patch는 기존 개체의 변경 필드다.
            {
                if (!actors.TryGetValue(patch.id, out Actor actor)) // actor는 변경을 적용할 화면 개체다.
                    continue;

                // 좌표 변경은 가로와 세로 중 하나만 도착할 수 있다.
                PortProtocol.PositionFields coordinates = patch.fields?.set;
                actor.State.x = coordinates?.x ?? actor.State.x;
                actor.State.y = coordinates?.y ?? actor.State.y;
                actor.State.interactionEnabled = coordinates?.interactionEnabled ?? actor.State.interactionEnabled;
                PortProtocol.StatusFields changedStatus = patch.status?.set; // 이번 틱에 서버가 보낸 생존 상태와 체력 변경이다.
                actor.State.status.state = changedStatus?.state ?? actor.State.status.state;
                actor.State.status.currentHealth = changedStatus?.currentHealth ?? actor.State.status.currentHealth;
                actor.State.status.effective = changedStatus?.effective ?? actor.State.status.effective;
                actor.Model.SetActive(actor.State.status.state != "dead");
            }

            foreach (string id in changes.removed) // id는 서버가 삭제한 개체 식별자다.
                Remove(id);
        }

        // 본인 기준 60 월드 단위 안의 서버 상호작용 후보 중 가장 가까운 개체를 찾는다.
        internal string FindInteraction(PortProtocol.Entity player) // 최신 서버 위치와 소유자 ID를 제공한다.
        {
            if (player.status.state != "alive")
                return null;

            // 아직 선택하지 않았으면 null이며 선택 후에는 서버 개체 ID다.
            string targetId = null;
            // 허용 거리 제곱이며 단위는 서버 월드 단위의 제곱이다.
            float nearestSquared = 60f * 60f;
            foreach (Actor actor in actors.Values) // actor는 거리와 사용 조건을 비교할 개체다.
            {
                // 위치와 상호작용 가능 상태의 최신 서버 값이다.
                PortProtocol.Entity target = actor.State;
                if (!target.interactionEnabled || target.status.state != "alive" ||
                    (target.status.classificationCode != "NPC_EXIT" &&
                     (target.status.classificationCode != "OBJ0001" || target.ownerId != player.id)))
                    continue;

                // 서버 평면에서 두 개체 중심 간 가로·세로 거리다. 단위는 월드 단위다.
                float dx = target.x - player.x;
                float dy = target.y - player.y;
                // 중심 거리 제곱이며 단위는 서버 월드 단위의 제곱이다.
                float distanceSquared = dx * dx + dy * dy;
                if (distanceSquared <= nearestSquared)
                {
                    targetId = target.id;
                    nearestSquared = distanceSquared;
                }
            }
            return targetId;
        }

        // 개체 종류별 임시 모형을 만들거나 이미 있는 모형의 목표 상태를 갱신한다.
        private void AddOrUpdate(PortProtocol.Entity state) // 해당 개체의 최신 전체 상태다.
        {
            present.Add(state.id);
            if (!actors.TryGetValue(state.id, out Actor actor)) // actor는 이번 상태를 표시하는 화면 개체다.
            {
                // 사물은 상자로, NPC는 원기둥으로, 유닛은 캡슐로 구분한다.
                PrimitiveType shape = state.status.objectType switch
                {
                    "prop" => PrimitiveType.Cube,
                    "npc" => PrimitiveType.Cylinder,
                    _ => PrimitiveType.Capsule
                };
                // 공격 가능한 사물, 몬스터, NPC, 다른 플레이어를 구분하는 표시 색이다.
                Color color = state.status.objectType switch
                {
                    "prop" => new Color(0.42f, 0.85f, 1f),
                    "enemy" => new Color(0.97f, 0.34f, 0.22f),
                    "npc" => new Color(0.30f, 1f, 0.74f),
                    _ => new Color(0.66f, 0.74f, 1f)
                };
                // 개체의 위치를 표현할 시각 전용 프리미티브다.
                GameObject model = CreateModel(state.status.objectType, shape, color);
                model.transform.localScale = new Vector3(24f * scale, shape == PrimitiveType.Cube ? 0.42f : 0.24f, 24f * scale);
                model.transform.position = Position(state.x, state.y, 0.24f);
                actor = new Actor { Model = model };
                actors.Add(state.id, actor);
            }

            actor.State = state;
            actor.Model.SetActive(state.status.state != "dead");
        }

        // 삭제된 서버 개체의 모형과 표시 상태를 정리한다.
        private void Remove(string id) // 서버가 제거한 개체 식별자다.
        {
            if (actors.TryGetValue(id, out Actor actor)) // actor는 씬에서 제거할 개체다.
            {
                Object.Destroy(actor.Model);
                actors.Remove(id);
            }
        }

        // 현재 서버 효과 목록을 기준으로 시전 범위의 생성과 제거를 처리한다.
        private void ApplyEffects(PortProtocol.SkillEffect[] activeEffects) // 서버가 아직 유지하는 효과의 전체 목록이다.
        {
            present.Clear();
            foreach (PortProtocol.SkillEffect effect in activeEffects) // effect는 현재 서버가 유지하는 기술 효과다.
            {
                if (effect.code != "BAS0001")
                    continue;

                present.Add(effect.id);
                if (effects.ContainsKey(effect.id))
                    continue;

                // 서버 시전 각도를 Unity XZ 평면의 전방 벡터로 바꾼 값이다.
                Vector3 forward = new(Mathf.Cos(effect.angle), 0f, -Mathf.Sin(effect.angle));
                // 서버 사각형의 길이와 폭을 사용하는 주황색 바닥 표시다.
                GameObject model = CreateModel("Basic Attack", PrimitiveType.Cube, new Color(1f, 0.46f, 0.09f));
                model.transform.SetPositionAndRotation(
                    Position(effect.x, effect.y, 0.035f) + forward * (effect.length * scale / 2f),
                    Quaternion.LookRotation(forward));
                model.transform.localScale = new Vector3(effect.width * scale, 0.025f, effect.length * scale);
                effects.Add(effect.id, model);
            }

            stale.Clear();
            foreach (string id in effects.Keys) // id는 서버가 계속 유지하는지 검사할 효과 식별자다.
                if (!present.Contains(id))
                    stale.Add(id);
            foreach (string id in stale) // id는 서버에서 만료된 효과 식별자다.
            {
                Object.Destroy(effects[id]);
                effects.Remove(id);
            }
        }

        // 서버 시각을 기준으로 모형을 보간하고 화면에 들어온 가까운 개체의 체력을 표시한다.
        internal void Draw(
            double now, // 로컬 시간(초)이다.
            Camera camera, // 개체 이름과 체력바의 화면 위치를 계산한다.
            PortHud hud, // 개체 체력바를 배치하고 이름에 사용할 글꼴을 제공한다.
            bool showNames, // 이름만 제어하는 사용자 설정이다.
            Vector3 localPosition) // 본인 모형의 표시 위치(Unity 미터)다.
        {
            double renderAt = clock.Sample(now); // 위치 이력 위에서 렌더링할 시각(밀리초)이다.
            float range = HealthBarRange * scale; // 체력바 표시 반경을 Unity 미터로 변환한 값이다.
            foreach (Actor actor in actors.Values) // actor는 서버 시각으로 보간할 상대 개체다.
            {
                Vector2 point = SampleActor(actor, renderAt); // Unity 좌표로 바꿀 서버 평면 표시 위치다.
                Transform model = actor.Model.transform; // 위치와 이름, 체력바의 기준이 되는 화면 모형이다.
                model.position = Position(point.x, point.y, 0.24f);
                actor.Nameplate = DrawName(model, actor.Nameplate, actor.State.name, camera, hud.SharedFont, showNames);
                Vector3 offset = model.position - localPosition; // 본인과 개체의 표시 위치 차이이며 Unity 미터 단위다.
                if (offset.x * offset.x + offset.z * offset.z <= range * range)
                    hud.DrawWorldHealth(model, actor.State.status, camera, false);
            }
        }

        // 화면 안에서만 개체 이름을 카메라 방향으로 표시한다.
        internal static TextMesh DrawName(Transform parent, TextMesh label, string name, Camera camera, Font font, bool enabled) // parent는 월드 모형, label은 기존 이름, name은 서버 이름, camera/font는 렌더링, enabled는 표시 설정이다.
        {
            Vector3 viewport = enabled ? camera.WorldToViewportPoint(parent.position) : Vector3.zero; // 모형의 카메라 화면 위치다.
            bool visible = enabled && !string.IsNullOrEmpty(name) && parent.gameObject.activeSelf &&
                viewport.z > 0f && viewport.x >= 0f && viewport.x <= 1f && viewport.y >= 0f && viewport.y <= 1f;
            if (!visible)
            {
                if (label != null && label.gameObject.activeSelf)
                    label.gameObject.SetActive(false);
                return label;
            }
            if (label == null)
            {
                GameObject nameplate = new("Nameplate"); // 모형 아래에서 표시할 월드 이름 오브젝트다.
                nameplate.transform.SetParent(parent, false);
                label = nameplate.AddComponent<TextMesh>();
                label.font = font;
                label.GetComponent<MeshRenderer>().sharedMaterial = font.material;
                label.fontSize = 40;
                label.characterSize = 0.12f;
                label.anchor = TextAnchor.MiddleCenter;
                label.richText = false;
                nameplate.transform.localPosition = new Vector3(0f, 0.55f / parent.localScale.y, 0f);
                nameplate.transform.localScale = new Vector3(1f / parent.localScale.x, 1f / parent.localScale.y, 1f / parent.localScale.z);
            }
            if (!label.gameObject.activeSelf)
                label.gameObject.SetActive(true);
            if (label.text != name)
                label.text = name;
            label.transform.rotation = camera.transform.rotation;
            return label;
        }

        // 순간이동과 데이터 부족 시 외삽을 하지 않고 받은 위치만 사용한다.
        private static Vector2 SampleActor(Actor actor, double time) // actor는 위치 이력을 가진 상대 개체, time은 재생 시각(ms)이다.
        {
            List<Pose> history = actor.History; // 서버 생성 시각 순으로 저장된 최근 위치 목록이다.
            if (history.Count == 0)
                return new Vector2(actor.State.x, actor.State.y);
            Pose previous = history[0]; // 보간 구간의 왼쪽 서버 위치다.
            if (time <= previous.TimeMs)
                return previous.Position;
            for (int index = 1; index < history.Count; index++) // index는 다음 서버 위치 순번이다.
            {
                Pose next = history[index]; // 현재 구간의 오른쪽 서버 위치다.
                if (time <= next.TimeMs)
                {
                    if ((next.Position - previous.Position).sqrMagnitude > 200f * 200f)
                        return new Vector2(actor.State.x, actor.State.y);
                    float ratio = (float)((time - previous.TimeMs) / (next.TimeMs - previous.TimeMs)); // 두 서버 시각 사이의 비율이다.
                    return Vector2.Lerp(previous.Position, next.Position, ratio);
                }
                previous = next;
            }
            return previous.Position;
        }

        // 새 방이나 재접속 이후 이전 상대 위치를 재생하지 않게 한다.
        internal void ResetMotion()
        {
            clock.Reset();
            foreach (Actor actor in actors.Values) // actor는 예전 서버 이력을 폐기할 상대 개체다.
                actor.History.Clear();
        }

        // 원격 플레이어나 적을 향하는 아이템에 화면상의 목적지를 제공한다.
        internal Vector3 DisplayPosition(string id, Vector3 fallback) // id는 획득자, fallback은 대상이 사라졌을 때의 표시 좌표(미터)다.
        {
            // 원격 개체 모형이 있으면 현재 화면 위치를 쓴다.
            return actors.TryGetValue(id, out Actor actor) ? actor.Model.transform.position : fallback;
        }

        // 최신 서버 상태에서 생존 중인 귀환등 중심만 지도에 제공한다.
        internal void CopyLampPositions(List<Vector2> positions) // 지도에서 재사용할 서버 평면 좌표 목록이다.
        {
            positions.Clear();
            foreach (Actor actor in actors.Values) // actor는 서버 월드 개체의 현재 화면 기록이다.
            {
                // 표식의 종류와 생존 여부를 판정할 서버 스테이터스다.
                PortProtocol.Entity state = actor.State;
                if (state.status.objectType == "prop" && state.status.classificationCode == "OBJ0001" &&
                    state.status.state == "alive" && state.status.currentHealth > 0)
                    positions.Add(new Vector2(state.x, state.y));
            }
        }

        // Play가 끝날 때 월드 개체와 공격 표시를 정리한다.
        internal void Clear()
        {
            Object.Destroy(root.gameObject);
        }

        // 방에서 나갈 때 다음 방에서도 사용할 루트를 유지하며 개체만 제거한다.
        internal void Reset()
        {
            foreach (Transform child in root) // child는 지난 방의 모형 또는 기술 표시다.
            {
                child.gameObject.SetActive(false);
                Object.Destroy(child.gameObject);
            }
            actors.Clear();
            effects.Clear();
            stones.Clear();
            clock.Reset();
        }

        // 서버 평면 좌표를 Unity의 수평 XZ 위치로 바꾼다.
        private Vector3 Position(
            float x, // 서버 오른쪽 양수 좌표이며 월드 단위다.
            float y, // 서버 아래쪽 양수 좌표이며 월드 단위다.
            float height) // 지면 위에 그릴 높이이며 Unity 미터다.
        {
            return new Vector3(x * scale, height, -y * scale);
        }

        // 물리 판정 없이 렌더링하는 단색 모형을 준비한다.
        private GameObject CreateModel(
            string name, // Unity 계층에 표시할 모형 이름이다.
            PrimitiveType shape, // 개체 종류를 구분하는 임시 모양이다.
            Color color) // 화면에서 개체나 효과를 구분하는 색이다.
        {
            // 서버 판정과 별도로 배치할 화면 모형이다.
            GameObject model = GameObject.CreatePrimitive(shape);
            model.name = name;
            model.transform.SetParent(root);
            Object.Destroy(model.GetComponent<Collider>());
            PortPreview.Tint(model, color);
            return model;
        }
    }
}
