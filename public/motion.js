/** 화면 표시만 처리하며 서버 판정용 방 개체는 변경하지 않는다. */
/** MotionView: 서버 상태와 분리된 좌표 이력으로 이동 보간·본인 예측·카메라 좌표를 제공한다. */
class MotionView {
  /** constructor: 새 인스턴스에서 사용할 초기 상태를 준비한다. */ constructor() { this.clear(); }
  /** clear: 이전 방의 위치 이력과 본인 예측 좌표를 모두 초기화한다. */ clear() { /** this.frames: 수신 시각별 표시용 개체 위치 이력. */ this.frames=[]; /** this.local: 본인의 예측·보정 표시 좌표와 방향. */ this.local=null; /** this.lastTime: 직전 표시 프레임 시각. */ this.lastTime=null; /** this.code: 현재 표시 이력이 속한 방 코드. */ this.code=null; }
  /** receive: 서버 스냅샷을 표시용 이력으로 복사하고 방 변경·순간이동을 반영한다. */ receive(/** room: 현재 처리하는 방의 상태. */ room, /** localId: 현재 접속자의 개체 식별자. */ localId, /** now: 현재 처리 시각(밀리초). */ now) {
    if(this.code!==room.code || room.phase!=='started') this.clear();
    /** this.code: 현재 표시 이력이 속한 방 코드. */ this.code=room.code;
    const /** objects: 처리할 월드 개체 목록. */ objects=(room.objects??room.players).map(/** o: 표시 이력으로 복사할 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ o=>({...o}));
    this.frames.push({time:now,objects});
    while(this.frames.length>12) this.frames.shift();
    const /** me: 현재 접속자의 개체. */ me=objects.find(/** o: 표시 이력으로 복사할 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ o=>o.id===localId);
    if(me && (!this.local || Math.hypot(me.x-this.local.x,me.y-this.local.y)>200)) /** this.local: 본인의 예측·보정 표시 좌표와 방향. */ this.local={x:me.x,y:me.y,facing:me.facing};
  }
  /** sample: 다른 개체를 보간하고 본인은 제한된 이동 예측과 서버 보정으로 표시한다. */ sample(/** localId: 현재 접속자의 개체 식별자. */ localId, /** input: 현재 프레임에 적용할 이동 입력. */ input, /** now: 현재 처리 시각(밀리초). */ now) {
    const /** latest: 가장 최근에 수신한 위치 프레임. */ latest=this.frames.at(-1); if(!latest) return [];
    const /** dt: 현재 프레임 또는 틱의 경과 시간(초). */ dt=this.lastTime===null?0:Math.max(0,Math.min((now-this.lastTime)/1000,.05));/** this.lastTime: 직전 표시 프레임 시각. */ this.lastTime=now;
    const /** renderAt: 다른 개체를 보간할 지연 표시 시각. */ renderAt=now-75;
    let /** a: 지연 표시 시각 이전의 보간 시작 프레임. */ a=this.frames[0],/** b: 지연 표시 시각 이후의 보간 종료 프레임. */ b=latest;
    for(const /** frame: 현재 표시할 화면 영역 또는 수신 위치 프레임. */ frame of this.frames) { if(frame.time<=renderAt) a=frame; if(frame.time>=renderAt) { b=frame;break; } }
    const /** t: 두 수신 프레임 사이의 보간 진행률. */ t=b.time>a.time?Math.max(0,Math.min(1,(renderAt-a.time)/(b.time-a.time))):1;
    const /** old: 보간 시작 프레임의 식별자별 개체 맵. */ old=new Map(a.objects.map(/** o: 표시 이력으로 복사할 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ o=>[o.id,o])),/** next: 보간 종료 프레임의 식별자별 개체 맵. */ next=new Map(b.objects.map(/** o: 표시 이력으로 복사할 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ o=>[o.id,o]));
    return latest.objects.map(/** object: 현재 처리하는 월드 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ object=>{
      if(object.id===localId && this.local) {
        const /** s: 본인 개체의 최신 서버 스테이터스. */ s=object.status,/** blocked: 메뉴·기절 등으로 현재 조작이 차단되는지 여부. */ blocked=s?.stunned||s?.state==='dead'||now-latest.time>250;
        const /** length: 이동 입력 벡터의 정규화에 사용할 길이. */ length=Math.max(1,Math.hypot(input.x,input.y));
        const /** vx: 방향 벡터의 가로 성분 또는 꼭짓점 가로 좌표. */ vx=blocked?0:input.x/length,/** vy: 방향 벡터의 세로 성분 또는 꼭짓점 세로 좌표. */ vy=blocked?0:input.y/length;
        const /** speed: 서버 규칙에 맞춘 초당 월드 이동 속도. */ speed=(s?.effective?.moveSpeed??Math.max(0,(s?.moveSpeed??2)+(s?.bonusMoveSpeed??0)))*110;
        this.local.x+=vx*speed*dt;this.local.y+=vy*speed*dt;
        // 서버 판정을 바꾸지 않고 한 틱 앞의 제한된 표시 목표로 수신 지연을 완화한다.
        const /** lead: 제한된 본인 위치 예측 시간(초). */ lead=blocked?0:Math.min(Math.max(0,now-latest.time)+50,150)/1000;
        const /** targetX: 서버 위치에서 예측한 가로 보정 목표. */ targetX=object.x+vx*speed*lead,/** targetY: 서버 위치에서 예측한 세로 보정 목표. */ targetY=object.y+vy*speed*lead;
        const /** alpha: 경과 시간에 따른 부드러운 위치 보정 비율. */ alpha=1-Math.exp(-10*dt);
        this.local.x+=(targetX-this.local.x)*alpha;this.local.y+=(targetY-this.local.y)*alpha;
        this.local.x=Math.max(-1500,Math.min(1500,this.local.x));this.local.y=Math.max(-1500,Math.min(1500,this.local.y));
        if(vx||vy) this.local.facing=Math.atan2(vy,vx);
        return {...object,...this.local};
      }
      const /** from: 보간 시작 개체 상태. */ from=old.get(object.id),/** to: 보간 종료 개체 상태. */ to=next.get(object.id);
      if(!from||!to||Math.hypot(to.x-from.x,to.y-from.y)>200) return {...object};
      const /** angle: 방향을 나타내는 라디안 각도. */ angle=(to.facing??0)-(from.facing??0),/** turn: 각도 경계를 넘지 않게 정규화한 회전 차이. */ turn=Math.atan2(Math.sin(angle),Math.cos(angle));
      return {...object,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,facing:(from.facing??0)+turn*t};
    });
  }
}
