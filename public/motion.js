/** 화면 표시만 처리하며 서버 판정용 방 개체는 변경하지 않는다. */
/** MotionView: 서버 상태와 분리된 좌표 이력으로 이동 보간·본인 예측·카메라 좌표를 제공한다. */
class MotionView {
  /** constructor: 새 인스턴스에서 사용할 초기 상태를 준비한다. */ constructor() { this.clear(); }
  /** clear: 이전 방의 위치 이력과 본인 예측 좌표를 모두 초기화한다. */ clear() { /** this.frames: 수신 시각별 표시용 개체 위치 이력. */ this.frames=[]; /** this.local: 본인의 예측·보정 표시 좌표와 방향. */ this.local=null; /** this.lastTime: 직전 표시 프레임 시각. */ this.lastTime=null; /** this.code: 현재 표시 이력이 속한 방 코드. */ this.code=null;
    /** this.pendingInputs: 서버 처리 확인을 기다리는 이동 전용 입력 기록. */ this.pendingInputs=[];
    /** this.sequence: 본인이 생성한 마지막 이동 입력 번호. */ this.sequence=0;
    /** this.lastCommandTime: 마지막 고정 스텝 입력을 만든 시각. */ this.lastCommandTime=null;
    /** this.predicted: 서버 상태에 미확인 입력을 재실행한 판정용 예측 좌표. */ this.predicted=null;
    /** this.map: 본인 이동 재계산에 적용할 서버 지도. */ this.map=null;
  }
  /** receive: 서버 스냅샷을 표시용 이력으로 복사하고 방 변경·순간이동을 반영한다. */ receive(/** room: 현재 처리하는 방의 상태. */ room, /** localId: 현재 접속자의 개체 식별자. */ localId, /** now: 현재 처리 시각(밀리초). */ now) {
    if(this.code!==room.code || room.phase!=='started') this.clear();
    /** this.code: 현재 표시 이력이 속한 방 코드. */ this.code=room.code;
    if(room.map) this.map=room.map;
    const /** objects: 처리할 월드 개체 목록. */ objects=(room.objects??room.players).map(/** o: 표시 이력으로 복사할 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ o=>({...o}));
    this.frames.push({time:now,objects});
    while(this.frames.length>12) this.frames.shift();
    const /** me: 현재 접속자의 개체. */ me=objects.find(/** o: 표시 이력으로 복사할 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ o=>o.id===localId);
    if(me) {
      this.pendingInputs=this.pendingInputs.filter(/** 처리 확인 이후의 입력만 남긴다. */ (/** command: 확인 여부를 검사할 이동 입력. */ command)=>command.seq>(me.lastProcessedInput??0));
      this.predicted={x:me.x,y:me.y,facing:me.facing,roll:me.roll?{...me.roll}:null,lastMovementInput:me.lastMovementInput};
      for(const /** command: 서버가 아직 처리하지 않은 이동 입력. */ command of this.pendingInputs) this.predicted=globalThis.MovementRules.step(this.predicted,command,me.status??{moveSpeed:2,bonusMoveSpeed:0},this.map);
      if(!this.local || Math.hypot(me.x-this.local.x,me.y-this.local.y)>200) this.local={...this.predicted};
    }
  }
  /** 실제 서버에 보낼 고정 스텝 입력을 기록하고 같은 규칙으로 한 번 예측한다. */
  command(
    /** input: 현재 키보드·조이스틱 이동 입력. */ input,
    /** now: 입력 생성 시각(밀리초). */ now,
  ) {
    if(!this.predicted || now-(this.frames.at(-1)?.time??0)>250 || this.pendingInputs.length>=32 || (this.lastCommandTime!==null&&now-this.lastCommandTime<50)) return null;
    const /** queuedOnServer: 최근 서버 스냅샷의 실제 대기 입력 수. 왕복 중인 입력과 구분한다. */ queuedOnServer=this.frames.at(-1)?.objects.find(/** 본인 대기열을 조회한다. */ (/** object: 수신 개체. */ object)=>object.id===input.localId)?.inputQueueLength??0;
    if(queuedOnServer>=3)return null;
    this.lastCommandTime=now;
    const /** command: 순번과 한 스텝의 방향을 가진 이동 전용 기록. */ command={seq:++this.sequence,x:input.x,y:input.y};
    this.pendingInputs.push(command);
    const /** me: 현재 예측에 적용할 서버 확정 스테이터스. */ me=this.frames.at(-1).objects.find(/** 본인 상태를 조회한다. */ (/** object: 수신 개체. */ object)=>object.id===input.localId);
    this.predicted=globalThis.MovementRules.step(this.predicted,command,me?.status??{moveSpeed:2,bonusMoveSpeed:0},this.map);
    return command;
  }
  /** sample: 다른 개체를 보간하고 본인은 확인되지 않은 입력을 재실행한 좌표로 부드럽게 표시한다. */ sample(/** localId: 현재 접속자의 개체 식별자. */ localId, /** input: 현재 프레임에 적용할 이동 입력. */ input, /** now: 현재 처리 시각(밀리초). */ now) {
    const /** latest: 가장 최근에 수신한 위치 프레임. */ latest=this.frames.at(-1); if(!latest) return [];
    const /** dt: 현재 프레임 또는 틱의 경과 시간(초). */ dt=this.lastTime===null?0:Math.max(0,Math.min((now-this.lastTime)/1000,.05));/** this.lastTime: 직전 표시 프레임 시각. */ this.lastTime=now;
    const /** renderAt: 다른 개체를 보간할 지연 표시 시각. */ renderAt=now-75;
    let /** a: 지연 표시 시각 이전의 보간 시작 프레임. */ a=this.frames[0],/** b: 지연 표시 시각 이후의 보간 종료 프레임. */ b=latest;
    for(const /** frame: 현재 표시할 화면 영역 또는 수신 위치 프레임. */ frame of this.frames) { if(frame.time<=renderAt) a=frame; if(frame.time>=renderAt) { b=frame;break; } }
    const /** t: 두 수신 프레임 사이의 보간 진행률. */ t=b.time>a.time?Math.max(0,Math.min(1,(renderAt-a.time)/(b.time-a.time))):1;
    const /** old: 보간 시작 프레임의 식별자별 개체 맵. */ old=new Map(a.objects.map(/** o: 표시 이력으로 복사할 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ o=>[o.id,o])),/** next: 보간 종료 프레임의 식별자별 개체 맵. */ next=new Map(b.objects.map(/** o: 표시 이력으로 복사할 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ o=>[o.id,o]));
    return latest.objects.map(/** object: 현재 처리하는 월드 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ object=>{
      if(object.id===localId && this.local) {
        const /** alpha: 판정 좌표를 바꾸지 않고 표시 위치만 부드럽게 따라가는 비율. */ alpha=1-Math.exp(-25*dt);
        this.local.x+=(this.predicted.x-this.local.x)*alpha;
        this.local.y+=(this.predicted.y-this.local.y)*alpha;
        this.local.facing=this.predicted.facing;
        this.local.roll=this.predicted.roll;
        return {...object,...this.local};
      }
      const /** from: 보간 시작 개체 상태. */ from=old.get(object.id),/** to: 보간 종료 개체 상태. */ to=next.get(object.id);
      if(!from||!to||Math.hypot(to.x-from.x,to.y-from.y)>200) return {...object};
      const /** angle: 방향을 나타내는 라디안 각도. */ angle=(to.facing??0)-(from.facing??0),/** turn: 각도 경계를 넘지 않게 정규화한 회전 차이. */ turn=Math.atan2(Math.sin(angle),Math.cos(angle));
      return {...object,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,facing:(from.facing??0)+turn*t};
    });
  }
}
