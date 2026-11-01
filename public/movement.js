/** 서버와 클라이언트가 공유하는 50밀리초 이동 규칙. 피해·기술은 재실행하지 않는다. */
globalThis.MovementRules = Object.freeze({
  /** stepMs: 입력 하나가 나타내는 고정 이동 시간(밀리초). */ stepMs:50,
  /** step: 동일한 입력·상태·시작 위치에서 동일한 이동 결과를 계산한다. */
  step(
    /** position: 이동을 시작할 판정 좌표와 방향. */ position,
    /** input: 클라이언트의 정규화 전 이동 입력. */ input,
    /** status: 서버가 확정한 이동속도·기절·생존 상태. */ status,
  ) {
    const /** blocked: 현재 이동을 금지하는 상태인지 여부. */ blocked=status.stunned||status.state==='dead';
    if(position.roll) {
      if(blocked) return {x:position.x,y:position.y,facing:position.facing,roll:null,lastMovementInput:{x:0,y:0}};
      const /** distance: 이번 고정 스텝에 전진할 거리. 마지막에는 남은 거리만 이동한다. */ distance=Math.min(position.roll.remaining,position.roll.speed*.05);
      const /** remaining: 이번 이동 후 남은 구르기 거리. */ remaining=Math.max(0,position.roll.remaining-distance);
      return {
        x:Math.max(-1500,Math.min(1500,position.x+Math.cos(position.roll.angle)*distance)),
        y:Math.max(-1500,Math.min(1500,position.y+Math.sin(position.roll.angle)*distance)),
        facing:position.roll.angle,
        roll:remaining>1e-8?{...position.roll,remaining}:null,
        lastMovementInput:{x:0,y:0},
      };
    }
    const /** length: 대각선 속도를 제한할 벡터 길이. */ length=Math.max(1,Math.hypot(input.x,input.y));
    const /** speed: 한 고정 스텝에서 이동할 월드 거리. */ speed=blocked?0:Math.max(0,status.moveSpeed+status.bonusMoveSpeed)*110*.05;
    const /** x: 경계를 적용한 최종 가로 좌표. */ x=Math.max(-1500,Math.min(1500,position.x+input.x/length*speed));
    const /** y: 경계를 적용한 최종 세로 좌표. */ y=Math.max(-1500,Math.min(1500,position.y+input.y/length*speed));
    return {x,y,roll:null,lastMovementInput:blocked?{x:0,y:0}:{x:input.x/length,y:input.y/length},facing:x!==position.x||y!==position.y?Math.atan2(y-position.y,x-position.x):position.facing};
  },
});
