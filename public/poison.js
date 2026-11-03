/** 게임 시작 후 층별 독기를 일반 공격·방어력 공식과 독립적으로 처리한다. */
globalThis.PoisonRules=Object.freeze({
  /** 경과한 정수 분과 현재 높이로 3초당 직접 체력 감소량을 계산한다. */
  damage(/** height: 플레이어 중심의 논리 지형 높이. */ height,/** elapsedMs: 게임 시작 후 경과 시간(ms). */ elapsedMs){
    const /** minute: 완전히 경과한 분. */ minute=Math.floor(Math.max(0,elapsedMs)/60000);
    if(height===1&&minute>=3)return 1+(minute-2)*2;
    if(height===2&&minute>=5)return 8+(minute-4)*2;
    if(height===3&&minute>=7)return 10+(minute-6)*3;
    return 0;
  },
  /** 게임 시작에 고정한 3초 박자에서 현재 층의 생존 플레이어 체력을 한 번 차감한다. */
  tick(/** room: 게임 시작 시각·지도·참가자를 가진 서버 방. */ room,/** now: 서버 게임 시계(ms). */ now){
    if(room.phase!=='started'||!room.map||!Number.isFinite(room.gameStartedAt))return;
    const /** elapsed: 실제 게임 시작 이후 경과 시간. */ elapsed=Math.max(0,now-room.gameStartedAt);
    const /** pulse: 게임 시작에 맞춘 3초 구간 번호. */ pulse=Math.floor(elapsed/3000);
    if(pulse<=(room.poisonPulse??0))return;
    room.poisonPulse=pulse;
    // 서버가 오래 멈췄다면 과거 위치를 알 수 없으므로 누락된 피해를 한꺼번에 소급하지 않는다.
    for(const /** player: 방 참가 플레이어. */ player of room.players.values()){
      if(player.status.objectType!=='player'||player.status.state!=='alive')continue;
      const /** height: 현재 중심이 위치한 층. */ height=globalThis.PitMapRules.heightAt(room.map,player.x,player.y);
      const /** damage: 방어력과 무관한 이번 직접 차감량. */ damage=this.damage(height,elapsed);
      if(damage<=0)continue;
      player.status.currentHealth=Math.max(0,player.status.currentHealth-damage);
      if(player.status.currentHealth===0){player.status.state='dead';player.action=null;player.roll=null;}
    }
  },
});
