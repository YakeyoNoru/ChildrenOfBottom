/** 화면 표시만 처리하며 서버 판정용 방 개체는 변경하지 않는다. */
/** MotionView: 서버 상태와 분리된 좌표 이력으로 이동 보간·본인 예측·카메라 좌표를 제공한다. */
class MotionView {
  /** constructor: 새 인스턴스에서 사용할 초기 상태를 준비한다. */ constructor() { this.clear(); }
  /** clear: 이전 방의 위치 이력과 본인 예측 좌표를 모두 초기화한다. */ clear() { /** this.frames: 수신 시각별 표시용 개체 위치 이력. */ this.frames=[]; /** this.local: 본인의 예측·보정 표시 좌표와 방향. */ this.local=null; /** this.lastTime: 직전 표시 프레임 시각. */ this.lastTime=null; /** this.code: 현재 표시 이력이 속한 방 코드. */ this.code=null;
    /** this.pendingInputs: 서버 처리 확인을 기다리는 이동 전용 입력 기록. */ this.pendingInputs=[];
    /** this.sequence: 본인이 생성한 마지막 이동 입력 번호. */ this.sequence=0;
    /** this.lastCommandTime: 마지막 고정 스텝 입력을 만든 시각. */ this.lastCommandTime=null;
    /** this.predicted: 서버 상태에 미확인 입력을 재실행한 판정용 예측 좌표. */ this.predicted=null;
    /** this.serverClock: 서버 시각이 있는 스냅샷을 사용하는지 여부. */ this.serverClock=false;
    /** this.lastSnapshotSequence: 중복·역순 수신을 거르는 마지막 순번. */ this.lastSnapshotSequence=0;
    /** this.clockSamples: 로컬 수신 시각과 서버 시각 차이의 최근 표본. */ this.clockSamples=[];
    /** this.clockOffset: 네트워크 최소 지연을 포함한 두 시계의 기준 차이(ms). */ this.clockOffset=0;
    /** this.arrivalJitter: 생성 간격 대비 수신 간격 흔들림의 이동 평균(ms). */ this.arrivalJitter=0;
    /** this.remoteDelay: 상대 표시를 위한 제한된 적응형 버퍼(ms). */ this.remoteDelay=100;
    /** this.remoteTime: 단조 증가하는 상대 재생 서버 시각(ms). */ this.remoteTime=null;
    /** this.remoteSampleAt: 상대 재생기를 마지막 갱신한 로컬 시각(ms). */ this.remoteSampleAt=null;
    /** this.map: 본인 이동 재계산에 적용할 서버 지도. */ this.map=null;
  }
  /** receive: 서버 스냅샷을 표시용 이력으로 복사하고 방 변경·순간이동을 반영한다. */ receive(/** room: 현재 처리하는 방의 상태. */ room, /** localId: 현재 접속자의 개체 식별자. */ localId, /** now: 현재 처리 시각(밀리초). */ now) {
    if(this.code!==room.code || room.phase!=='started') this.clear();
    /** this.code: 현재 표시 이력이 속한 방 코드. */ this.code=room.code;
    if(room.map) this.map=room.map;
    const /** timed: 유효한 서버 시각·순번이 포함됐는지 여부. */ timed=Number.isFinite(room.serverTime)&&Number.isSafeInteger(room.snapshotSequence)&&room.snapshotSequence>0;
    if(timed&&this.serverClock&&room.snapshotSequence<=this.lastSnapshotSequence)return;
    if(timed&&!this.serverClock){this.frames=[];this.serverClock=true;}
    if(timed){
      const /** previous: 직전 정상 수신 프레임. */ previous=this.frames.at(-1);
      if(previous&&room.serverTime<previous.serverTime)return;
      if(previous&&room.serverTime>previous.serverTime){
        const /** variation: 서버 생성 간격과 로컬 도착 간격의 차이(ms). */ variation=Math.abs((now-previous.time)-(room.serverTime-previous.serverTime));
        this.arrivalJitter+=.1*(Math.min(variation,300)-this.arrivalJitter);
      }
      this.lastSnapshotSequence=room.snapshotSequence;
      this.clockSamples.push(now-room.serverTime);if(this.clockSamples.length>60)this.clockSamples.shift();
      this.clockOffset=Math.min(...this.clockSamples);
      this.remoteDelay=Math.max(100,Math.min(175,100+this.arrivalJitter*2));
    }
    const /** objects: 처리할 월드 개체 목록. */ objects=(room.objects??room.players).map(/** o: 표시 이력으로 복사할 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ o=>({...o}));
    if(timed&&this.frames.at(-1)?.serverTime===room.serverTime)this.frames.pop();
    this.frames.push({time:now,serverTime:timed?room.serverTime:now,objects});
    while(this.frames.length>32) this.frames.shift();
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
    let /** renderAt: 상대를 재생할 서버 시각. 구버전은 수신 시각 보간을 유지한다. */ renderAt=now-75;
    if(this.serverClock){
      const /** desired: 현재 추정 서버 시각에서 제한된 버퍼를 뺀 목표 시점. */ desired=now-this.clockOffset-this.remoteDelay;
      const /** elapsed: 실제 화면 간 경과 시간(ms). */ elapsed=this.remoteSampleAt===null?0:Math.max(0,now-this.remoteSampleAt);
      if(this.remoteTime===null||elapsed>1000)this.remoteTime=Math.max(this.frames[0].serverTime,Math.min(latest.serverTime,desired));
      else {
        const /** difference: 목표 대비 재생기 시간 차이. */ difference=desired-(this.remoteTime+elapsed);
        const /** rate: 버퍼를 천천히 회복하는 재생 배율. 시각을 뒤로 돌리지 않는다. */ rate=difference>20?1.1:difference< -20?.9:1;
        if(desired>=this.frames[0].serverTime)this.remoteTime=Math.max(this.remoteTime,Math.min(latest.serverTime,this.remoteTime+elapsed*rate));
      }
      this.remoteSampleAt=now;renderAt=this.remoteTime;
    }
    let /** a: 재생 시각 이전 프레임. */ a=this.frames[0],/** b: 재생 시각 이후 프레임. */ b=latest;
    for(const /** frame: 서버 생성 시각으로 정렬된 프레임. */ frame of this.frames) {if(frame.serverTime<=renderAt)a=frame;if(frame.serverTime>=renderAt){b=frame;break;}}
    const /** t: 서버 생성 시각 사이 보간 비율. */ t=b.serverTime>a.serverTime?Math.max(0,Math.min(1,(renderAt-a.serverTime)/(b.serverTime-a.serverTime))):1;
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
