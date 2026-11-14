using UnityEngine;

namespace ChildrenOfBottom
{
    // 서버 지형 색상과 플레이어의 누적 탐색 영역을 독립된 픽셀 캐시로 보관한다.
    internal sealed class PortMapRaster
    {
        // 미탐색 지형과 지형 사이 빈 공간의 지도 색이다.
        internal static readonly Color32 Fog = new(167, 163, 176, 255);

        // 이 서버 월드 거리보다 큰 위치 변경은 순간이동으로 본다.
        internal const float TeleportThreshold = 400f;

        // 서버 높이 1~4의 웹 지도 색이다.
        private static readonly Color32[] TerrainColors =
        {
            new(190, 217, 172, 255), new(145, 180, 144, 255),
            new(101, 135, 121, 255), new(64, 92, 86, 255)
        };

        // 타일 중심의 서버 좌표이며 X는 오른쪽, Y는 아래쪽이다.
        internal Vector2[] Centers { get; }

        // 서버 타일 번호와 다리 연결을 가져오는 지도다.
        internal PortProtocol.Map Map { get; }

        // 캐시의 서버 월드 시작점과 월드 단위당 픽셀 배율이다.
        private readonly Vector2 origin;
        private readonly float scale;

        // 캐시의 너비와 높이이며 단위는 픽셀이다.
        private readonly int width;
        private readonly int height;

        // 지형·다리 색과 탐색 여부를 각각 보관한다.
        private readonly Color32[] terrain;
        private readonly bool[] explored;

        // 이전 프레임의 플레이어 표시 위치이며 첫 프레임에는 비어 있다.
        private Vector2? previous;

        // 동일 지도를 그리는 동안 재사용할 지형 캐시를 한 번 준비한다.
        internal PortMapRaster(PortProtocol.Map map) // 서버가 생성한 지도다.
        {
            Map = map;
            Centers = new Vector2[map.tiles.Length];
            // 서버 월드 단위의 지도 중심 좌표 범위다.
            Vector2 minimum = new(float.PositiveInfinity, float.PositiveInfinity);
            Vector2 maximum = new(float.NegativeInfinity, float.NegativeInfinity);
            for (int index = 0; index < Centers.Length; index++) // index는 타일 배열 순번이다.
            {
                Centers[index] = map.Center(index);
                minimum = Vector2.Min(minimum, Centers[index]);
                maximum = Vector2.Max(maximum, Centers[index]);
            }

            // 서버 단위의 실제 지형 반지름과 탐색을 고려한 바깥 여백이다.
            float radius = map.tileRadius * map.landScale;
            float margin = radius + 250f;
            origin = minimum - Vector2.one * margin;
            // 지도 지형과 탐색 범위를 감싸는 서버 월드 너비 및 높이다.
            Vector2 span = maximum + Vector2.one * margin - origin;
            scale = Mathf.Min(0.15f, 2048f / Mathf.Max(span.x, span.y));
            width = Mathf.CeilToInt(span.x * scale);
            height = Mathf.CeilToInt(span.y * scale);
            terrain = new Color32[width * height];
            explored = new bool[terrain.Length];

            foreach (int[] bridge in map.bridges) // bridge는 다리 양끝 타일 배열 순번이다.
            {
                // 다리의 서버 중심선 시작·종점과 반폭이다.
                Vector2 start = Centers[bridge[0]];
                Vector2 end = Centers[bridge[1]];
                float halfWidth = (map.tiles[bridge[0]].height == map.tiles[bridge[1]].height
                    ? map.bridgeWidth : map.heightBridgeWidth) * 0.5f;
                // 중심선에 직각인 폭 방향이며 단위는 서버 월드 단위다.
                Vector2 perpendicular = Vector2.Perpendicular((end - start).normalized) * halfWidth;
                Paint(new[] { start - perpendicular, start + perpendicular, end + perpendicular, end - perpendicular }, Color.white);
            }

            for (int index = 0; index < Centers.Length; index++) // index는 육각형을 그릴 타일 배열 순번이다.
            {
                // 이 타일의 서버 평면 육각형 꼭짓점이다.
                var vertices = new Vector2[6];
                for (int side = 0; side < 6; side++) // side는 꼭짓점 순번이다.
                {
                    // 꼭짓점을 정하는 라디안 각도다.
                    float angle = side * Mathf.PI / 3f;
                    vertices[side] = Centers[index] + new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * radius;
                }
                Paint(vertices, TerrainColors[map.tiles[index].height - 1]);
            }
        }

        // 플레이어 경로의 반지름 250 영역을 마스크에 누적한다.
        internal void Reveal(Vector2 point) // 본인 모형의 서버 평면 표시 위치다.
        {
            if (previous.HasValue && (previous.Value - point).sqrMagnitude < 1f)
                return;
            // 400 단위 넘는 위치 변경은 도착점만 공개한다.
            Vector2 start = previous.HasValue && (previous.Value - point).sqrMagnitude <= TeleportThreshold * TeleportThreshold
                ? previous.Value : point;
            previous = point;

            // 캐시 픽셀 공간에서 계산한 탐색 선분과 붓의 반지름이다.
            Vector2 a = (start - origin) * scale;
            Vector2 b = (point - origin) * scale;
            float radius = 250f * scale;
            // 선분에 투영할 방향과 길이 제곱이다. 단위는 픽셀과 픽셀 제곱이다.
            Vector2 segment = b - a;
            float lengthSquared = segment.sqrMagnitude;
            int left = Mathf.Max(0, Mathf.FloorToInt(Mathf.Min(a.x, b.x) - radius)); // 붓의 왼쪽 캐시 픽셀이다.
            int right = Mathf.Min(width - 1, Mathf.CeilToInt(Mathf.Max(a.x, b.x) + radius)); // 붓의 오른쪽 캐시 픽셀이다.
            int top = Mathf.Max(0, Mathf.FloorToInt(Mathf.Min(a.y, b.y) - radius)); // 붓의 위쪽 캐시 픽셀이다.
            int bottom = Mathf.Min(height - 1, Mathf.CeilToInt(Mathf.Max(a.y, b.y) + radius)); // 붓의 아래쪽 캐시 픽셀이다.
            for (int y = top; y <= bottom; y++) // y는 마스크의 검사 행이다.
            for (int x = left; x <= right; x++) // x는 마스크의 검사 열이다.
            {
                // 이전 위치에서 캐시 픽셀 중심까지의 거리다.
                Vector2 relative = new Vector2(x + 0.5f, y + 0.5f) - a;
                // 검사 점을 선분의 0~1 범위에 투영한 비율이다.
                float t = lengthSquared == 0f ? 0f : Mathf.Clamp01(Vector2.Dot(relative, segment) / lengthSquared);
                if ((relative - segment * t).sqrMagnitude <= radius * radius)
                    explored[y * width + x] = true;
            }
        }

        // 전체 공개 옵션을 무시하고 실제 탐색 여부만 조회한다.
        internal bool IsExplored(Vector2 point) // 서버 평면에서 확인할 표식 위치다.
        {
            int index = Index(point.x, point.y); // 확인할 캐시 픽셀의 배열 순번이다.
            return index >= 0 && explored[index];
        }

        // 이 위치의 지형 또는 회색 안개 색을 반환한다.
        internal Color32 Sample(float x, float y, bool showAll) // x·y는 서버 월드 위치, showAll은 전체맵 지형 표시 옵션이다.
        {
            int index = Index(x, y); // 캐시에 해당하는 배열 순번이며 범위 밖이면 -1이다.
            return index >= 0 && (showAll || explored[index]) && terrain[index].a != 0 ? terrain[index] : Fog;
        }

        // 서버 위치를 캐시 배열의 픽셀 순번으로 바꾼다.
        private int Index(float x, float y) // x·y는 서버 월드 위치다.
        {
            int column = Mathf.FloorToInt((x - origin.x) * scale); // 캐시 픽셀 열이다.
            int row = Mathf.FloorToInt((y - origin.y) * scale); // 캐시 픽셀 행이다.
            return column >= 0 && column < width && row >= 0 && row < height ? row * width + column : -1;
        }

        // 볼록한 타일과 다리를 행별 교차점 사이의 픽셀로 채운다.
        private void Paint(Vector2[] vertices, Color32 color) // vertices는 서버 평면 꼭짓점, color는 캐시에 저장할 색이다.
        {
            float top = float.PositiveInfinity; // 도형에서 가장 위에 있는 캐시 픽셀이다.
            float bottom = float.NegativeInfinity; // 도형에서 가장 아래에 있는 캐시 픽셀이다.
            for (int index = 0; index < vertices.Length; index++) // index는 캐시 픽셀로 바꿀 꼭짓점이다.
            {
                vertices[index] = (vertices[index] - origin) * scale;
                top = Mathf.Min(top, vertices[index].y);
                bottom = Mathf.Max(bottom, vertices[index].y);
            }
            for (int y = Mathf.Max(0, Mathf.FloorToInt(top)); y < Mathf.Min(height, Mathf.CeilToInt(bottom)); y++) // y는 채울 캐시 행이다.
            {
                float left = float.PositiveInfinity; // 이 행의 도형 왼쪽 교차점이다.
                float right = float.NegativeInfinity; // 이 행의 도형 오른쪽 교차점이다.
                float scan = y + 0.5f; // 캐시 픽셀 행의 중심이다.
                for (int side = 0; side < vertices.Length; side++) // side는 교차를 검사할 변 순번이다.
                {
                    Vector2 a = vertices[side]; // 검사할 변의 첫 캐시 꼭짓점이다.
                    Vector2 b = vertices[(side + 1) % vertices.Length]; // 검사할 변의 끝 캐시 꼭짓점이다.
                    if ((a.y > scan) == (b.y > scan))
                        continue;
                    float x = Mathf.Lerp(a.x, b.x, (scan - a.y) / (b.y - a.y)); // 이 변과 행의 교차 픽셀 위치다.
                    left = Mathf.Min(left, x);
                    right = Mathf.Max(right, x);
                }
                if (left > right)
                    continue;
                for (int x = Mathf.Max(0, Mathf.CeilToInt(left - 0.5f)); x < Mathf.Min(width, Mathf.CeilToInt(right - 0.5f)); x++) // x는 도형 내부 픽셀이다.
                    terrain[y * width + x] = color;
            }
        }
    }
}
