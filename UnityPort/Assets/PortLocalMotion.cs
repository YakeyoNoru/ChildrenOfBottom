using System;
using System.Collections.Generic;
using UnityEngine;
using Point = ChildrenOfBottom.PortMovementMap.Point;

namespace ChildrenOfBottom
{
    // 서버 이동 좌표에서 미확인 입력만 재실행해 본인의 표시 목표를 만든다.
    internal sealed class PortLocalMotion
    {
        // 한 입력은 서버의 50ms 이동 스텝 하나를 나타낸다. 단위는 초다.
        internal const double StepSeconds = 0.05d;

        // 서버 확인을 기다리는 이동 한 스텝이다.
        private readonly struct Input
        {
            internal readonly int Sequence; // 서버에 전송한 입력 순번이다.
            internal readonly Vector2 Direction; // 정규화 전 서버 평면 이동 입력이다.

            // 서버 순번과 해당 스텝의 방향을 보관한다.
            internal Input(int sequence, Vector2 direction) // sequence는 이동 순번, direction은 축별 -1~1 입력이다.
            {
                Sequence = sequence;
                Direction = direction;
            }
        }

        // 입력 처리 순서대로 재실행할 미확인 스텝이다.
        private readonly List<Input> pending = new(32);
        // 같은 지도에서 타일과 다리 판정을 재사용한다.
        private PortMovementMap geometry;
        // 서버 지형이 바뀌었는지 확인하는 지도 ID다.
        private string mapId;
        // 마지막 서버 스냅샷으로 받은 이동 능력과 상태다.
        private PortProtocol.EntityStatus status;
        // 가장 최근에 생성한 서버 이동 입력 순번이다.
        private int sequence;
        // 서버가 마지막으로 알려 준 대기 이동 개수다.
        private int serverQueueLength;
        // 서버 스냅샷의 로컬 수신 시각과 다음 입력 생성 가능 시각이며 초 단위다.
        private double receivedAt;
        private double nextInputAt;
        // 예측 상태에서 남은 구르기 거리, 초당 속도, 라디안 방향이다.
        private double rollRemaining;
        private double rollSpeed;
        private double rollAngle;

        // 재실행 중에는 서버와 같은 배정밀도 월드 중심을 보존한다.
        private Point predicted;

        // 서버 재실행으로 구한 표시 목표 월드 좌표다.
        internal Vector2 Predicted => predicted.ToDisplay();
        // 현재 표시 위치가 참조하는 마지막 이동 입력 순번이다.
        internal int Sequence => sequence;

        // 서버 주시 방향에서 입력을 재실행한 표시 각도이며 단위는 라디안이다.
        internal float Facing { get; private set; }

        // 게임 시작과 재접속 시 서버 원본 지형의 통행 판정을 준비한다.
        internal void UseMap(PortProtocol.Map map) // 서버가 발급한 월드 지형이다.
        {
            if (map != null && (geometry == null || mapId != map.id))
            {
                geometry = new PortMovementMap(map);
                mapId = map.id;
            }
        }

        // 확인된 입력을 지우고 서버 위치부터 아직 처리되지 않은 이동을 다시 적용한다.
        internal void Receive(PortProtocol.Entity player, double now) // player는 서버 확정 본인, now는 로컬 수신 시각(초)이다.
        {
            status = player.status;
            receivedAt = now;
            serverQueueLength = player.inputQueueLength;
            sequence = Mathf.Max(sequence, player.lastProcessedInput);
            int acknowledged = 0; // 서버가 처리했다고 확인한 이동 입력 수다.
            while (acknowledged < pending.Count && pending[acknowledged].Sequence <= player.lastProcessedInput)
                acknowledged++;
            if (acknowledged > 0)
                pending.RemoveRange(0, acknowledged);

            predicted = new Point(player.worldX, player.worldY);
            Facing = player.facing;
            rollRemaining = player.roll?.remaining ?? 0f;
            rollSpeed = player.roll?.speed ?? 0f;
            rollAngle = player.roll?.angle ?? 0f;
            foreach (Input input in pending) // input은 서버가 아직 처리하지 않은 이동 한 스텝이다.
                Step(input.Direction);
        }

        // 새로운 스텝이 전송 가능한 시각에만 한 번 예측한다.
        internal int Command(Vector2 direction, double now) // direction은 이동축 입력, now는 로컬 프레임 시각(초)이다.
        {
            if (geometry == null || status == null || now - receivedAt > 0.25d ||
                now + 0.000001d < nextInputAt || serverQueueLength >= 3 || pending.Count >= 32)
                return 0;

            nextInputAt = now + StepSeconds;
            pending.Add(new Input(++sequence, direction));
            Step(direction);
            return sequence;
        }

        // 종료 또는 새 서버 연결 뒤 이전 방의 예측과 순번을 폐기한다.
        internal void Reset()
        {
            pending.Clear();
            geometry = null;
            mapId = null;
            status = null;
            sequence = 0;
            serverQueueLength = 0;
            receivedAt = 0;
            nextInputAt = 0;
            rollRemaining = 0f;
            predicted = default;
            Facing = 0f;
        }

        // 웹과 같은 이동량과 지형 판정으로 한 스텝의 표시 목표만 바꾼다.
        private void Step(Vector2 input) // 서버 평면 기준으로 정규화 전 이동축 입력이다.
        {
            bool blocked = status.stunned || status.dashActive || status.state == "dead"; // 서버 상태가 기본 이동을 금지하는지 나타낸다.
            double radius = (status.hitboxDiameter ?? 24d) * 0.5d; // 서버 월드 단위의 원형 피격 반지름이다.
            if (rollRemaining > 1e-8d)
            {
                if (blocked)
                {
                    rollRemaining = 0f;
                    return;
                }

                double distance = Math.Min(rollRemaining, rollSpeed * StepSeconds); // 이번 스텝의 구르기 전진량이다.
                Point direction = new(Math.Cos(rollAngle), Math.Sin(rollAngle)); // 서버 평면의 구르기 단위 방향이다.
                predicted = geometry.Constrain(predicted, predicted + direction * distance, radius, false);
                Facing = (float)rollAngle;
                rollRemaining = Math.Max(0d, rollRemaining - distance);
                return;
            }
            if (blocked)
                return;

            double distancePerStep = Math.Max(0d, status.moveSpeed + status.bonusMoveSpeed) * 110d * StepSeconds; // 일반 이동 한 스텝의 서버 월드 거리다.
            Point axis = new(input.x, input.y); // 서버 평면 방향으로 변환한 이동 입력이다.
            Point candidate = predicted + axis / Math.Max(1d, axis.Length()) * distancePerStep; // 지형 판정을 적용하기 전 월드 좌표다.
            Point allowed = geometry.Constrain(predicted, candidate, radius, true); // 지형을 통과할 수 있는 다음 중심이다.
            Point moved = allowed - predicted; // 실제로 반영한 평면 이동 거리다.
            if (moved.X != 0d || moved.Y != 0d)
                Facing = (float)Math.Atan2(moved.Y, moved.X);
            predicted = allowed;
        }
    }
}
