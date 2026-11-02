/** 아이템 정의·생성·획득을 서버와 단독 테스트 모드에서 공유한다. 아이템은 물리 충돌에 참여하지 않는다. */
globalThis.ItemRules=Object.freeze({
  /** definitions: 즉발형·저장형이 공통으로 참조할 아이템별 획득 조건과 효과. */
  definitions:Object.freeze({
    /** illusionFragment: 환영조각은 플레이어 전용 즉발형이며 경쟁포인트를 지급한다. */
    illusionFragment:Object.freeze({code:'illusionFragment',name:'환영조각',mode:'instant',eligibleTypes:['player'],competitionPoints:10,diameter:5}),
  }),
  /** 종류별 획득 가능 조건을 공통으로 검사한다. */
  eligible(/** item: 검사할 아이템. */ item,/** object: 접근한 플레이어 또는 적. */ object) {
    const /** definition: 아이템 종류 정의. */ definition=this.definitions[item.code];
    return !!definition&&['player','enemy'].includes(object.status?.objectType)&&object.status.state==='alive'&&definition.eligibleTypes.includes(object.status.objectType);
  },
  /** 지형 내부에만 높이·풍요 여부별 수량을 배치한다. 모든 조각 중심 간격은 7 이상이다. */
  spawn(/** map: 생성된 게임 지도. */ map,/** random: 0 이상 1 미만 난수 함수. */ random=Math.random) {
    const /** items: 고유 ID별 아이템 목록. */ items=new Map();
    const /** cells: 최소 간격 검사를 주변 조각으로 제한하는 7단위 격자. */ cells=new Map();
    const /** ranges: 높이별 일반·풍요 수량의 양 끝 포함 범위. */ ranges={1:[[10,15],[30,45]],2:[[15,20],[40,50]],3:[[20,25],[60,80]],4:[[20,25],[80,100]]};
    const /** normals: 정육각형 변의 법선 목록. */ normals=Array.from({length:6},/** 법선을 만든다. */ (/** unused: 사용하지 않는 값. */ unused,/** index: 변 번호. */ index)=>({x:Math.cos(Math.PI/6+index*Math.PI/3),y:Math.sin(Math.PI/6+index*Math.PI/3)}));
    for(const /** tile: 생성 대상 지형. */ tile of map.tiles) {
      const /** center: 지형 중심. */ center=globalThis.PitMapRules.center(tile,map);
      const /** radius: 지형 한 변 길이. */ radius=map.tileRadius*map.landScale;
      const /** bounds: 지형 높이와 종류의 생성 범위. */ bounds=ranges[tile.height][tile.kind==='rich'?1:0];
      const /** count: 이번 타일 생성 수. */ count=bounds[0]+Math.floor(random()*(bounds[1]-bounds[0]+1));
      let /** placed: 현재 타일에 배치한 수. */ placed=0;
      for(let /** attempt: 무한 반복을 막는 배치 시도 순번. */ attempt=0;placed<count&&attempt<100000;attempt++) {
        const /** x: 후보 중심 가로 좌표; y: 후보 중심 세로 좌표. */ x=center.x+(random()*2-1)*radius,y=center.y+(random()*2-1)*radius;
        if(!normals.every(/** 원 전체가 지형 내부인지 검사한다. */ (/** normal: 변 법선. */ normal)=>(x-center.x)*normal.x+(y-center.y)*normal.y<=radius*Math.sqrt(3)/2-2.5))continue;
        const /** cx: 후보의 가로 격자; cy: 세로 격자. */ cx=Math.floor(x/7),cy=Math.floor(y/7);
        let /** crowded: 반경 7 이내 다른 조각이 있는지 여부. */ crowded=false;
        for(let /** dx: 이웃 가로 격자 차이. */ dx=-1;dx<=1;dx++)for(let /** dy: 이웃 세로 격자 차이. */ dy=-1;dy<=1;dy++)for(const /** other: 주변 격자의 기존 조각. */ other of cells.get((cx+dx)+','+(cy+dy))??[])if(Math.hypot(other.x-x,other.y-y)<7)crowded=true;
        if(crowded)continue;
        const /** id: 방 안에서 고유한 아이템 식별자. */ id='item-'+tile.id+'-'+placed;
        const /** item: 새로 배치할 조각. */ item={id,code:'illusionFragment',tileId:tile.id,x,y,state:'ground'};
        items.set(id,item);
        const /** key: 후보 격자의 조회 키. */ key=cx+','+cy;
        if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);placed++;
      }
      if(placed!==count)throw new Error('아이템 배치 공간이 부족합니다.');
    }
    return items;
  },
  /** 공통 줍기: 가까운 적격 개체를 예약하고 200밀리초 비행 후 효과 또는 보관함 저장을 한 번 적용한다. */
  tick(/** items: 방의 미획득 아이템. */ items,/** objects: 획득 후보 개체. */ objects,/** now: 서버 현재 시각(밀리초). */ now) {
    const /** updates: 이번 틱에 상태가 바뀐 아이템. */ updates=[];
    const /** removed: 획득 완료되어 제거된 ID. */ removed=[];
    for(const /** item: 현재 검사할 아이템. */ item of items.values()) {
      if(item.state==='flying') {
        const /** target: 비행 중인 대상. */ target=objects.find(/** 예약 대상을 찾는다. */ (/** object: 후보 개체. */ object)=>object.id===item.targetId);
        if(!target||!this.eligible(item,target)){item.state='ground';delete item.targetId;delete item.startedAt;updates.push({...item});continue;}
        if(now-item.startedAt<200)continue;
        const /** definition: 획득 효과와 보관 방식을 정의한 자료. */ definition=this.definitions[item.code];
        if(definition.mode==='instant')target.status.competitionPoints=(target.status.competitionPoints??0)+definition.competitionPoints;
        else {target.inventory??=[];target.inventory.push({code:item.code});}
        items.delete(item.id);removed.push(item.id);continue;
      }
      let /** nearest: 가장 가까운 적격 획득자. */ nearest=null;
      let /** distance: 획득 가능한 최대 중심 거리. */ distance=20;
      for(const /** object: 플레이어·적 획득 후보. */ object of objects) {
        if(!this.eligible(item,object))continue;
        const /** candidate: 아이템과 개체 중심 거리. */ candidate=Math.hypot(item.x-object.x,item.y-object.y);
        if(candidate<=distance&&(!nearest||candidate<distance||object.id<nearest.id)){nearest=object;distance=candidate;}
      }
      if(nearest){item.state='flying';item.targetId=nearest.id;item.startedAt=now;updates.push({...item});}
    }
    return {updates,removed};
  },
});
