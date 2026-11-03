/** 서버 확정 아이템과 화면의 줍기 예측을 분리한다. */
class ItemView {
  /** 표시 전용 상태를 초기화한다. */
  constructor(){this.clear();}
  /** 방 퇴장·재접속 시 모든 조각 표시와 예측을 초기화한다. */
  clear(){
    /** records: 서버 상태와 로컬 비행·승인 대기를 보관할 ID별 표시 자료. */ this.records=new Map();
    /** code: 현재 표시 자료의 방 코드. */ this.code=null;
  }
  /** 서버 메시지를 로컬 수신 시각 기준으로 반영한다. 서버 시계는 연출에 사용하지 않는다. */
  receive(/** room: 전체 또는 변경분을 포함한 방 상태. */ room,/** now: 로컬 수신 시각(ms). */ now){
    if(this.code!==room.code){this.clear();this.code=room.code;}
    const /** updates: 전체 목록 또는 변경된 아이템. */ updates=room.items??room.itemChanges?.updates??[];
    if(room.items){
      const /** ids: 전체 스냅샷에 존재하는 ID. */ ids=new Set(room.items.map(/** ID를 조회한다. */ (/** item: 서버 아이템. */ item)=>item.id));
      for(const /** id: 기존 표시 ID. */ id of this.records.keys())if(!ids.has(id))this.remove(id,now);
    }
    for(const /** item: 수신한 아이템. */ item of updates){
      let /** record: 기존 또는 새로운 표시 기록. */ record=this.records.get(item.id);
      if(!record){record={item:{...item},flight:null,removed:false,blocked:false};this.records.set(item.id,record);}
      record.item={...item};record.removed=false;
      if(item.state==='flying'){
        if(!record.flight||record.flight.targetId!==item.targetId)record.flight={start:now,targetId:item.targetId,confirmed:true};
        else record.flight.confirmed=true;
      }else if(record.flight?.confirmed){record.flight=null;record.blocked=true;}
    }
    for(const /** id: 서버에서 획득 완료한 ID. */ id of room.itemChanges?.removed??[])this.remove(id,now);
  }
  /** 완료 메시지가 먼저 도착해도 진행 중인 50ms 비행은 끝까지 보존한다. */
  remove(/** id: 완료된 아이템 ID. */ id,/** now: 로컬 수신 시각. */ now){
    const /** record: 완료할 표시 기록. */ record=this.records.get(id);if(!record)return;
    record.removed=true;
    if(!record.flight||now-record.flight.start>=50)this.records.delete(id);
  }
  /** 내 예측 위치에서 즉시 비행을 시작하고 서버 미승인 시 원위치로 복구한다. 점수는 변경하지 않는다. */
  sample(/** objects: 보간·예측된 표시 개체. */ objects,/** localId: 본인 ID. */ localId,/** now: 로컬 화면 시각(ms). */ now){
    const /** me: 본인 표시 개체. */ me=objects.find(/** 본인을 조회한다. */ (/** object: 표시 개체. */ object)=>object.id===localId);
    const /** output: 이번 프레임에 그릴 조각 좌표. */ output=[];
    for(const /** id: 조각 ID; record: 서버와 표시 상태. */ [id,record] of this.records){
      const /** near: 생존한 본인 중심이 반경 30 안에 있는지 여부. */ near=me?.status?.state==='alive'&&Math.hypot(me.x-record.item.x,me.y-record.item.y)<=30;
      if(!near)record.blocked=false;
      if(!record.flight&&!record.removed&&!record.blocked&&record.item.state==='ground'&&record.item.code==='illusionFragment'&&near)record.flight={start:now,targetId:localId,confirmed:false};
      if(record.flight&&!record.flight.confirmed&&now-record.flight.start>=500){record.flight=null;record.blocked=true;}
      const /** flight: 현재 표시 비행. */ flight=record.flight;
      const /** progress: 로컬 시작 기준 비행 진행률. */ progress=flight?Math.max(0,Math.min(1,(now-flight.start)/50)):0;
      if(record.removed&&progress>=1){this.records.delete(id);continue;}
      if(flight&&progress>=1)continue;
      const /** target: 비행 목적지 개체. */ target=objects.find(/** 획득자를 조회한다. */ (/** object: 표시 개체. */ object)=>object.id===flight?.targetId);
      output.push({id,x:record.item.x+(target?target.x-record.item.x:0)*progress,y:record.item.y+(target?target.y-record.item.y:0)*progress});
    }
    return output;
  }
}
