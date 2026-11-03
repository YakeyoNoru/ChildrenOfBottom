/** 이동과 시전을 같은 입력 순서로 처리하고 실제 경과 시간만큼 고정 스텝을 허용한다. */
globalThis.InputTimeline=Object.freeze({
  /** 시전을 이미 수신한 이동 순번 뒤에 예약한다. 클라이언트 좌표는 받지 않는다. */
  enqueue(/** player: 서버 개체. */ player,/** slot: 시전 슬롯. */ slot,/** sequence: 시전 전에 끝나야 할 이동 순번. */ sequence,/** requestId: 오류 응답용 요청 ID. */ requestId){
    if(!Number.isSafeInteger(sequence)||sequence<0||sequence>(player.lastReceivedInput??0)||sequence<(player.lastProcessedInput??0))return 'INVALID_CAST_SEQUENCE';
    if((player.pendingCasts?.length??0)>=8)return 'CAST_QUEUE_FULL';
    /** pendingCasts: 입력 순번에 연결한 시전 요청 목록. */ player.pendingCasts??=[];
    if(player.pendingCasts.length&&sequence<player.pendingCasts.at(-1).sequence)return 'INVALID_CAST_SEQUENCE';
    player.pendingCasts.push({slot,sequence,requestId});return null;
  },
  /** 앞선 이동이 완료된 시전만 다음 이동 전에 실행한다. */
  ready(/** player: 서버 개체. */ player,/** cast: 서버 검증을 포함한 실행 함수. */ cast){
    while(player.pendingCasts?.length&&player.pendingCasts[0].sequence<=(player.lastProcessedInput??0))cast(player.pendingCasts.shift());
  },
  /** 최대 200ms의 시간 예산으로 한 호출에 최대 네 스텝만 처리한다. 입력 개수로 시간이 늘어나지 않는다. */
  advance(/** player: 이동·시전 대기열 개체. */ player,/** map: 이동 판정 지도. */ map,/** now: 서버 시각(ms). */ now,/** cast: 순서가 도달한 시전 처리기. */ cast){
    /** movementClock: 누적 가능한 고정 이동 시간 예산. */ player.movementClock??={last:now,credit:50};
    const /** clock: 개체의 서버 시간 예산. */ clock=player.movementClock;
    clock.credit=Math.min(200,clock.credit+Math.max(0,now-clock.last));clock.last=now;
    this.ready(player,cast);
    let /** steps: 이번 호출에서 처리한 스텝 수. */ steps=0;
    while(clock.credit>=50&&steps<4&&(player.inputQueue?.length||player.roll)){
      const /** command: 순서대로 꺼낸 이동 입력. */ command=player.inputQueue?.shift();
      const /** wasRolling: 이동 전 구르기 상태. */ wasRolling=!!player.roll;
      Object.assign(player,globalThis.MovementRules.step(player,command??{x:0,y:0},player.status,map));
      if(command)player.lastProcessedInput=command.seq;
      player.action=player.status.stunned||player.status.state==='dead'?null:wasRolling?'roll':command?.action??null;
      clock.credit-=50;steps++;
      this.ready(player,cast);
    }
    if(!steps)player.action=null;
    return steps;
  },
});
