using System;
using System.Collections.Generic;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 상대 위치를 네트워크 도착 간격에서 분리해 서버 생성 시각으로 재생한다.
    internal sealed class PortRemoteClock
    {
        // 최근 도착 표본의 로컬 시각과 서버 시각 차이다. 단위는 밀리초다.
        private readonly Queue<double> offsets = new(60);
        // 이전 서버 스냅샷의 생성 시각과 수신 시각이다. 단위는 밀리초다.
        private double latest;
        private double arrival;
        // 렌더 시각을 서버 시계로 바꾸는 기준 차이와 도착 간격 흔들림이다. 단위는 밀리초다.
        private double offset;
        private double jitter;
        // 보간 이력의 첫 시각과 현재 재생 위치다. 단위는 밀리초다.
        private double earliest;
        private double playback;
        // 직전 화면 표본의 로컬 시각이다. 단위는 밀리초다.
        private double sampled;
        // 서버 생성 시각 유무 및 이력 초기화 여부다.
        private bool timed;
        private bool initialized;
        private bool playing;

        // 새 상태의 시간축을 갱신하고 이 상태의 샘플 시각을 반환한다.
        internal double Receive(long serverTime, double now, out bool resetHistory) // serverTime은 서버 ms, now는 로컬 수신 초, resetHistory는 시간축 교체 여부다.
        {
            bool nextTimed = serverTime > 0; // 현재 스냅샷이 서버 생성 시각을 갖는지 나타낸다.
            double local = now * 1000d; // 현재 수신 시각을 밀리초로 변환한 값이다.
            double time = nextTimed ? serverTime : local; // 상태 이력에 사용할 밀리초 시각이다.
            resetHistory = initialized && (timed != nextTimed || time < latest);
            if (resetHistory)
                Reset();
            timed = nextTimed;
            if (!initialized)
                earliest = time;
            else if (timed && time > latest)
            {
                double variation = Math.Abs((local - arrival) - (time - latest)); // 생성 간격과 수신 간격의 차이(ms)다.
                jitter += 0.1d * (Math.Min(variation, 300d) - jitter);
            }
            if (timed)
            {
                if (offsets.Count == 60)
                    offsets.Dequeue();
                offsets.Enqueue(local - time);
                offset = double.PositiveInfinity;
                foreach (double sample in offsets) // sample은 로컬 수신과 서버 생성 시각의 차이(ms)다.
                    offset = Math.Min(offset, sample);
            }
            initialized = true;
            latest = time;
            arrival = local;
            return time;
        }

        // 100~175ms 버퍼를 향해 단조롭게 움직이며 최신 상태 너머로 외삽하지 않는다.
        internal double Sample(double now) // 로컬 화면 시각(초)이다.
        {
            double local = now * 1000d; // 로컬 화면 시각(밀리초)이다.
            if (!timed)
                return local - 75d;
            double delay = Math.Min(175d, 100d + jitter * 2d); // 도착 간격에 따른 제한된 표시 버퍼(ms)다.
            double desired = local - offset - delay; // 재생기가 따라갈 서버 시각(ms)이다.
            double elapsed = local - sampled; // 직전 화면에서 경과한 밀리초다.
            if (!playing || elapsed > 1000d)
                playback = Math.Max(earliest, Math.Min(latest, desired));
            else if (desired >= earliest)
            {
                double difference = desired - (playback + elapsed); // 현재 재생 시간과 목표의 차이(ms)다.
                double rate = difference > 20d ? 1.1d : difference < -20d ? 0.9d : 1d; // 버퍼 복구 시 적용할 재생 속도 배율이다.
                playback = Math.Max(playback, Math.Min(latest, playback + elapsed * rate));
            }
            playing = true;
            sampled = local;
            return playback;
        }

        // 방 종료나 복귀 시 이전 세션의 보간 시각을 폐기한다.
        internal void Reset()
        {
            offsets.Clear();
            initialized = false;
            playing = false;
            timed = false;
            jitter = 0d;
        }
    }
}
