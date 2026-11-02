/** 방 생성부터 10분 카운트다운과 1분 종료 유예를 계산하는 공통 규칙. */
globalThis.RoomTimerRules = Object.freeze({
  /** durationMs: 기본 카운트다운 길이(밀리초). */ durationMs:600000,
  /** graceMs: 0 이후 참가자를 내보내기 전 유예(밀리초). */ graceMs:60000,
  /** 방 생성 순간 서버가 확정할 종료 시각을 만든다. */
  create(/** now: 방 생성 시각(밀리초). */ now) {
    return {createdAt:now,countdownEndsAt:now+600000,closesAt:now+660000};
  },
  /** 서버 또는 단일 브라우저 테스트에서 방 종료 기한을 검사한다. */
  expired(/** room: 서버가 보관한 방의 기한. */ room,/** now: 현재 시각(밀리초). */ now) {
    return now>=room.closesAt;
  },
  /** 서버 시계와 무관하게 클라이언트가 표시할 잔여 시간 정보를 만든다. */
  snapshot(/** room: 생성·카운트다운·종료 시각. */ room,/** now: 서버 현재 시각(밀리초). */ now) {
    return {createdAt:room.createdAt,countdownEndsAt:room.countdownEndsAt,closesAt:room.closesAt,
      remainingMs:Math.max(0,room.countdownEndsAt-now),closeRemainingMs:Math.max(0,room.closesAt-now)};
  },
  /** 남은 밀리초를 음수 없는 분:초 형식으로 표시한다. */
  format(/** remainingMs: 표시할 남은 시간(밀리초). */ remainingMs) {
    const /** seconds: 표시 반올림 때문에 조기 종료처럼 보이지 않도록 올림한 남은 초. */ seconds=Math.ceil(Math.max(0,remainingMs)/1000);
    return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  },
});
