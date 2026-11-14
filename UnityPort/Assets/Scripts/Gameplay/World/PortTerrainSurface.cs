using UnityEngine;

namespace ChildrenOfBottom
{
    // 서버 평면 지도 위에서 화면에만 적용할 타일 높이와 다리 경사를 계산한다.
    internal sealed class PortTerrainSurface
    {
        // 다리 윗면의 끝점과 서버 통로의 표시 폭을 보관한다. 단위는 Unity 미터다.
        internal readonly struct Ramp
        {
            internal readonly Vector3 Start; // 첫 타일 쪽 윗면 끝점이다.
            internal readonly Vector3 End; // 두 번째 타일 쪽 윗면 끝점이다.
            internal readonly float Width; // 다리의 수평 폭이다.
            private readonly Vector2 along; // 시작에서 끝으로 향하는 평면 단위 벡터다.
            private readonly float length; // 다리의 수평 길이(미터)다.

            // 윗면의 높이를 평면 위치로 샘플링할 자료를 준비한다.
            internal Ramp(Vector3 start, Vector3 end, float width) // start와 end는 3D 끝점, width는 통로 폭(미터)이다.
            {
                Start = start;
                End = end;
                Width = width;
                Vector2 delta = new(end.x - start.x, end.z - start.z); // 끝점 사이의 평면 차이(미터)다.
                length = delta.magnitude;
                along = delta.normalized;
            }

            // 다리 위의 높이는 끝점 사이에서 선형으로 변한다.
            internal float HeightAt(Vector2 point) // point는 Unity XZ 위치(미터)다.
            {
                Vector2 offset = point - new Vector2(Start.x, Start.z); // 시작점 대비 평면 차이(미터)다.
                float distance = Vector2.Dot(offset, along); // 다리 방향의 진행 거리(미터)다.
                float sideways = Mathf.Abs(offset.x * along.y - offset.y * along.x); // 중심선과의 수직 거리(미터)다.
                if (distance < -0.001f || distance > length + 0.001f || sideways > Width * 0.5f || length <= 0f)
                    return float.NegativeInfinity;
                return Mathf.Lerp(Start.y, End.y, distance / length);
            }
        }

        internal readonly Vector3[] Centers; // 서버 타일 순번으로 찾는 타일 윗면 중심(미터)이다.
        internal readonly Ramp[] Ramps; // 서버 연결 순번으로 찾는 다리 윗면이다.
        internal readonly float Radius; // 표시 타일의 육각형 외접 반지름(미터)이다.
        private readonly float apothem; // 타일 중심에서 변까지의 거리(미터)다.
        private readonly float scale; // 서버 월드 단위당 Unity 미터다.
        private static readonly Vector2[] Normals = BuildNormals(); // 육각형 여섯 변의 바깥 법선이다.

        // 서버 맵에서 3D 표현만 파생한다.
        internal PortTerrainSurface(PortProtocol.Map map, PortWorldPrefabs prefabs, float scale) // map은 원본 지도, prefabs는 타일 높이 원본, scale은 월드 단위 변환 배율이다.
        {
            this.scale = scale;
            float hexFactor = Mathf.Sqrt(3f) / 2f; // 육각 외접 반지름을 내접 반지름으로 바꾸는 비율이다.
            float maxSpan = 24f * scale; // 플레이어 지름과 같은 다리 수평 길이 상한(미터)이다.
            float centerSpacing = map.tileRadius * Mathf.Sqrt(3f) * scale; // 이웃 타일 중심 간 수평 거리(미터)다.
            apothem = Mathf.Max(map.tileRadius * map.landScale * scale * hexFactor,
                (centerSpacing - maxSpan) * 0.5f); // 다리 길이를 줄이기 위해 표시용 육각형의 변을 바깥으로 옮긴다.
            Radius = apothem / hexFactor;
            Centers = new Vector3[map.tiles.Length];
            for (int index = 0; index < Centers.Length; index++) // index는 서버 타일 순번이다.
            {
                Vector2 center = map.Center(index); // 서버의 평면 타일 중심(월드 단위)이다.
                float height = prefabs.Tile(map.tiles[index].height).transform.localScale.y; // 프리팹 밑면에서 윗면까지의 높이(미터)다.
                Centers[index] = new Vector3(center.x * scale, height, -center.y * scale);
            }

            Ramps = new Ramp[map.bridges.Length];
            for (int index = 0; index < Ramps.Length; index++) // index는 서버 다리 순번이다.
            {
                int[] ends = map.bridges[index]; // 다리가 연결하는 두 서버 타일 순번이다.
                Vector3 first = Centers[ends[0]]; // 첫 타일 윗면 중심(미터)이다.
                Vector3 second = Centers[ends[1]]; // 두 번째 타일 윗면 중심(미터)이다.
                Vector3 direction = Vector3.ProjectOnPlane(second - first, Vector3.up).normalized; // 타일을 잇는 평면 단위 방향이다.
                Vector3 start = first + direction * apothem; // 첫 번째 접점(미터)이다.
                Vector3 end = second - direction * apothem; // 두 번째 접점(미터)이다.
                float width = (map.tiles[ends[0]].height == map.tiles[ends[1]].height ? map.bridgeWidth : map.heightBridgeWidth) * scale; // 서버 통로의 표시 폭(미터)이다.
                Ramps[index] = new Ramp(start, end, width);
            }
        }

        // 서버 위치를 타일 또는 다리 표면 위의 표시 좌표로 변환한다.
        internal Vector3 Position(float x, float y, float offset) // x와 y는 서버 월드 좌표, offset은 표면 위 표시 간격(미터)이다.
        {
            Vector2 point = new(x * scale, -y * scale); // Unity XZ 위치(미터)다.
            return new Vector3(point.x, HeightAt(point) + offset, point.y);
        }

        // 수평 보간 뒤의 실제 표시 위치에서도 같은 윗면 높이를 반환한다.
        internal float HeightAt(Vector2 point) // point는 Unity XZ 위치(미터)다.
        {
            float height = float.NegativeInfinity; // 닿는 지형·다리의 윗면 중 가장 높은 높이(미터)다.
            foreach (Vector3 center in Centers) // center는 타일 윗면 중심(미터)이다.
            {
                Vector2 relative = point - new Vector2(center.x, center.z); // 타일 중심 대비 평면 차이(미터)다.
                if (relative.sqrMagnitude > (Radius + 0.001f) * (Radius + 0.001f))
                    continue;
                bool inside = true; // 여섯 변 안쪽인지 나타낸다.
                foreach (Vector2 normal in Normals) // normal은 육각형 변의 바깥 법선이다.
                {
                    if (Vector2.Dot(relative, normal) <= apothem + 0.001f)
                        continue;
                    inside = false;
                    break;
                }
                if (inside)
                    height = Mathf.Max(height, center.y);
            }
            foreach (Ramp ramp in Ramps) // ramp는 위를 지날 수 있는 표시용 다리다.
                height = Mathf.Max(height, ramp.HeightAt(point));
            if (!float.IsNegativeInfinity(height))
                return height;

            // 투사체와 화면 보간이 지형을 잠시 벗어나면 가장 가까운 타일 높이를 사용한다.
            float nearest = float.PositiveInfinity; // 현재까지 가장 가까운 타일 중심과의 거리 제곱(제곱미터)이다.
            height = 0f;
            foreach (Vector3 center in Centers) // center는 근접도를 비교할 타일 중심(미터)이다.
            {
                float distance = (point - new Vector2(center.x, center.z)).sqrMagnitude; // 중심까지의 거리 제곱(제곱미터)이다.
                if (distance >= nearest)
                    continue;
                nearest = distance;
                height = center.y;
            }
            return height;
        }

        // 육각 메시와 같은 방향으로 변의 법선을 준비한다.
        private static Vector2[] BuildNormals()
        {
            Vector2[] normals = new Vector2[6]; // 여섯 변의 바깥 단위 벡터다.
            for (int side = 0; side < normals.Length; side++) // side는 육각형 변 순번이다.
            {
                float angle = (side + 0.5f) * Mathf.PI / 3f; // 변 법선의 각도(라디안)다.
                normals[side] = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle));
            }
            return normals;
        }
    }
}
