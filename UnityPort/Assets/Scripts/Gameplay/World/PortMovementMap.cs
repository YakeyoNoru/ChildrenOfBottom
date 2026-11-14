using System;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 서버의 배정밀도 지형·다리 판정을 Unity 표시 예측에서 적용한다.
    internal sealed class PortMovementMap
    {
        // 서버 평면에서 월드 단위 좌표와 방향을 배정밀도로 계산한다.
        internal readonly struct Point
        {
            internal readonly double X; // 서버 오른쪽 양수 가로 성분이다.
            internal readonly double Y; // 서버 아래쪽 양수 세로 성분이다.

            // 서버와 같은 정밀도로 평면 성분을 보관한다.
            internal Point(double x, double y) // x와 y는 서버 평면의 두 축이다.
            {
                X = x;
                Y = y;
            }

            // 월드 좌표 차이의 유클리드 길이를 구한다.
            internal double Length()
            {
                double largest = Math.Max(Math.Abs(X), Math.Abs(Y)); // 정규화에 사용할 가장 큰 축의 절댓값이다.
                if (largest == 0d)
                    return 0d;
                double x = X / largest; // 크기를 제한한 가로 성분이다.
                double y = Y / largest; // 크기를 제한한 세로 성분이다.
                return largest * Math.Sqrt(x * x + y * y);
            }

            // Unity에 그릴 때만 단정밀도 좌표로 변환한다.
            internal Vector2 ToDisplay() => new((float)X, (float)Y);

            // 두 평면 성분의 합을 구한다.
            public static Point operator +(Point a, Point b) => new(a.X + b.X, a.Y + b.Y); // a와 b는 합산할 좌표 또는 이동량이다.
            // 기준점에서 평면 좌표 차이를 구한다.
            public static Point operator -(Point a, Point b) => new(a.X - b.X, a.Y - b.Y); // a는 현재점, b는 뺄 기준점이다.
            // 평면 성분에 공통 배율을 곱한다.
            public static Point operator *(Point point, double multiplier) => new(point.X * multiplier, point.Y * multiplier); // point는 원본, multiplier는 배율이다.
            // 평면 성분을 공통 분모로 나눈다.
            public static Point operator /(Point point, double divisor) => new(point.X / divisor, point.Y / divisor); // point는 원본, divisor는 분모다.
        }

        // 서버 다리의 중심선과 통행 조건을 한 번 준비한다.
        private readonly struct Bridge
        {
            internal readonly Point Start; // 첫 타일의 서버 월드 중심이다.
            internal readonly Point Middle; // 서버가 역방향 판정에 쓰는 두 타일의 중점이다.
            internal readonly Point Direction; // 시작에서 끝으로 향하는 서버 평면 단위 벡터다.
            internal readonly double Length; // 중심 간 거리이며 서버 월드 단위다.
            internal readonly double HalfWidth; // 다리 절반 폭이며 서버 월드 단위다.
            internal readonly int OneWay; // 1은 시작→끝, -1은 끝→시작, 0은 양방향이다.

            // 서버 높이와 폭 규칙에 따라 통행에 필요한 수치를 준비한다.
            internal Bridge(Point start, Point end, double width, int oneWay) // start/end는 월드 중심, width는 서버 폭, oneWay는 통행 방향이다.
            {
                Start = start;
                Middle = (start + end) / 2d;
                Length = (end - start).Length();
                Direction = (end - start) / Length;
                HalfWidth = width * 0.5d;
                OneWay = oneWay;
            }
        }

        // 서버 지도 육각형의 바깥 변 법선이다.
        private static readonly Point[] Normals = BuildNormals();

        // 판정 시 비교할 타일 중심과 실제로 연결된 다리다.
        private readonly Point[] centers;
        private readonly Bridge[] bridges;

        // 중심을 건너뛸 빠른 범위와 육각 지형의 내접 반지름이다. 단위는 서버 월드 단위다.
        private readonly double gridRadius;
        private readonly double landApothem;

        // 위치 계산에 필요한 지도 자료를 스냅샷당 반복 생성하지 않게 준비한다.
        internal PortMovementMap(PortProtocol.Map map) // 서버가 게임 시작에 확정한 지도다.
        {
            gridRadius = map.gridRadius;
            landApothem = map.gridRadius * map.gridLandScale * Math.Sqrt(3d) / 2d;
            centers = new Point[map.tiles.Length];
            for (int index = 0; index < centers.Length; index++) // index는 타일 배열의 순번이다.
                centers[index] = map.ExactCenter(index);

            bridges = new Bridge[map.bridges.Length];
            for (int index = 0; index < bridges.Length; index++) // index는 다리 연결의 배열 순번이다.
            {
                int[] ends = map.bridges[index]; // 연결된 두 타일의 배열 순번이다.
                int firstHeight = map.tiles[ends[0]].height; // 첫 번째 타일의 서버 높이다.
                int secondHeight = map.tiles[ends[1]].height; // 두 번째 타일의 서버 높이다.
                int oneWay = firstHeight == 2 && secondHeight == 3 ? 1 : firstHeight == 3 && secondHeight == 2 ? -1 : 0; // 서버의 일방통행 방향이다.
                bridges[index] = new Bridge(centers[ends[0]], centers[ends[1]],
                    firstHeight == secondHeight ? map.bridgeWidth : map.heightBridgeWidth, oneWay);
            }
        }

        // 이동을 2단위 이하로 나누고 서버와 같이 빈 공간·역방향 통과를 차단한다.
        internal Point Constrain(Point start, Point target, double radius, bool slide) // start/target/radius는 서버 월드 단위, slide는 축별 미끄러짐 허용 여부다.
        {
            int count = Math.Max(1, (int)Math.Ceiling((target - start).Length() / 2d)); // 이동 선분을 검사할 횟수다.
            Point increment = (target - start) / count; // 검사 한 번의 서버 월드 이동량이다.
            Point point = start; // 지금까지 허용한 마지막 서버 월드 중심이다.
            for (int index = 0; index < count; index++) // index는 이동 선분 안의 검사 순번이다.
            {
                Point direct = point + increment; // 가로와 세로를 모두 적용한 후보 중심이다.
                Point alongX = point + new Point(increment.X, 0d); // 가로로만 미끄러질 후보 중심이다.
                Point alongY = point + new Point(0d, increment.Y); // 세로로만 미끄러질 후보 중심이다.
                if (CanStep(point, direct, radius))
                    point = direct;
                else if (slide && CanStep(point, alongX, radius))
                    point = alongX;
                else if (slide && CanStep(point, alongY, radius))
                    point = alongY;
                else
                    break;
            }
            return (point - target).Length() < 1e-7d ? target : point;
        }

        // 원이 지형 또는 다리 안에 들어가고 일방통행을 위반하지 않는지 검사한다.
        private bool CanStep(Point from, Point to, double radius) // from/to는 이동 전후 중심, radius는 월드 단위 피격 원 반지름이다.
        {
            if (!Walkable(to, radius))
                return false;

            foreach (Bridge bridge in bridges) // bridge는 방향을 검사할 실제 연결 다리다.
            {
                if (bridge.OneWay == 0)
                    continue;
                double before = Dot(from - bridge.Middle, bridge.Direction) * bridge.OneWay; // 다리 중점에서 이동 전 방향 거리다.
                double after = Dot(to - bridge.Middle, bridge.Direction) * bridge.OneWay; // 다리 중점에서 이동 후 방향 거리다.
                if (before < 0d || after >= 0d)
                    continue;
                Point crossing = from + (to - from) * (before / (before - after)); // 금지 경계를 지나는 월드 중심이다.
                if (Math.Abs(Cross(crossing - bridge.Start, bridge.Direction)) <= bridge.HalfWidth + 12d)
                    return false;
            }
            return true;
        }

        // 플레이어의 피격 원이 육각형 또는 다리의 통행 범위에 들어가는지 확인한다.
        private bool Walkable(Point point, double radius) // point는 서버 월드 중심, radius는 서버 월드 단위 반지름이다.
        {
            double limit = landApothem - radius; // 변 법선에 투영했을 때 허용되는 최대 월드 거리다.
            foreach (Point center in centers) // center는 검사할 서버 타일 중심이다.
            {
                Point relative = point - center; // 중심에서 검사 점까지의 서버 월드 차이다.
                if (Math.Abs(relative.X) > gridRadius || Math.Abs(relative.Y) > gridRadius)
                    continue;
                bool inside = true; // 원 전체가 모든 변의 안쪽에 있는지 기록한다.
                foreach (Point normal in Normals) // normal은 이 변의 바깥쪽 단위 법선이다.
                {
                    if (Dot(relative, normal) <= limit + 1e-8d)
                        continue;
                    inside = false;
                    break;
                }
                if (inside)
                    return true;
            }
            foreach (Bridge bridge in bridges) // bridge는 원이 통과할 수 있는지 검사할 다리다.
            {
                Point relative = point - bridge.Start; // 다리 시작부터 검사 점까지의 서버 월드 차이다.
                double along = Dot(relative, bridge.Direction); // 다리 중심선을 따라 이동한 월드 거리다.
                if (along >= 0d && along <= bridge.Length && Math.Abs(Cross(relative, bridge.Direction)) <= bridge.HalfWidth - radius + 1e-8d)
                    return true;
            }
            return false;
        }

        // 다리 중심선에서 점까지의 수직 성분을 얻는다.
        private static double Cross(Point offset, Point direction) // offset은 서버 월드 차이, direction은 단위 벡터다.
        {
            return offset.X * direction.Y - offset.Y * direction.X;
        }

        // 월드 좌표 차이를 검사 방향에 투영한다.
        private static double Dot(Point offset, Point direction) // offset은 서버 월드 차이, direction은 단위 벡터다.
        {
            return offset.X * direction.X + offset.Y * direction.Y;
        }

        // 육각 타일의 여섯 변에 수직인 바깥 방향을 만든다.
        private static Point[] BuildNormals()
        {
            var normals = new Point[6]; // 육각 변마다 하나씩 공유할 단위 벡터다.
            for (int index = 0; index < normals.Length; index++) // index는 변의 순번이다.
            {
                double angle = Math.PI / 6d + index * Math.PI / 3d; // 바깥 법선의 라디안 방향이다.
                normals[index] = new Point(Math.Cos(angle), Math.Sin(angle));
            }
            return normals;
        }
    }
}
