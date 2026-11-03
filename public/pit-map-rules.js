/** geometryCache: 같은 맵의 육각형·다리 좌표를 반복 계산하지 않기 위한 캐시. */
const geometryCache=new WeakMap();
/** hexNormals: 육각형의 여섯 변 법선을 반복 삼각함수 계산 없이 공유한다. */
const hexNormals=Array.from({length:6},/** 각 변 법선을 만든다. */ (/** unused: 사용하지 않는 배열 항목. */ unused,/** side: 변 순번. */ side)=>({x:Math.cos(Math.PI/6+side*Math.PI/3),y:Math.sin(Math.PI/6+side*Math.PI/3)}));
/** 지형·다리 판정을 서버와 화면 예측에서 공유한다. 높이는 통행 규칙이며 물리 Z축은 없다. */
globalThis.PitMapRules=Object.freeze({
  /** 육각 격자의 타일을 평면 월드 좌표로 변환한다. */
  center(/** tile: 원본 지도 타일. */ tile,/** map: 타일 크기를 포함한 지도. */ map) {
    const /** radius: 육각 격자 기준 반지름(월드 좌표). */ radius=map.tileRadius??90;
    return {x:1.5*radius*tile.q,y:Math.sqrt(3)*radius*(tile.r+tile.q/2)};
  },
  /** 타일 중심·다리 방향과 길이를 지도당 한 번 준비한다. */
  geometry(/** map: 원본 타일·다리 지도. */ map) {
    if(geometryCache.has(map))return geometryCache.get(map);
    const /** centers: 타일 인덱스별 월드 중심 목록. */ centers=map.tiles.map(/** 각 타일 중심을 구한다. */ (/** tile: 변환할 타일. */ tile)=>this.center(tile,map));
    const /** bridges: 실제로 생성된 다리의 판정 자료. */ bridges=map.bridges.map(/** 다리의 중심·방향·통행 금지 방향을 구한다. */ (/** ends: 연결된 타일 인덱스 쌍. */ ends)=>{
      const /** a: 첫 타일 인덱스; b: 둘째 타일 인덱스. */ [a,b]=ends;
      const /** start: 첫 중심; end: 둘째 중심. */ [start,end]=[centers[a],centers[b]];
      const /** length: 다리 중심 간 거리. */ length=Math.hypot(end.x-start.x,end.y-start.y);
      return {a,b,start,end,length,
        /** width: 연결 지형의 높이가 다르면 좁은 폭을 사용하며 화면과 이동 판정에서 공유한다. */ width:map.tiles[a].height===map.tiles[b].height?(map.bridgeWidth??48):(map.heightBridgeWidth??100),ux:(end.x-start.x)/length,uy:(end.y-start.y)/length,
        oneWay:map.tiles[a].height===2&&map.tiles[b].height===3?1:map.tiles[a].height===3&&map.tiles[b].height===2?-1:0};
    });
    const /** geometry: 이동 판정과 렌더링이 재사용할 변환 자료. */ geometry={centers,bridges};geometryCache.set(map,geometry);return geometry;
  },
  /** 캐릭터 피격 원이 지형 또는 실제 다리 통로 안에 들어가는지 검사한다. */
  walkable(/** map: 지도. */ map,/** x: 중심 가로 좌표. */ x,/** y: 중심 세로 좌표. */ y,/** radius: 개체 원 반지름. */ radius=12) {
    const /** geometry: 미리 계산한 타일·다리 중심 자료. */ geometry=this.geometry(map);
    const /** limit: 육각형 변에서 개체 반지름만큼 안쪽인 최대 수직 거리. */ limit=(map.tileRadius??90)*(map.landScale??.89)*Math.sqrt(3)/2-radius;
    for(const /** center: 검사할 지형타일 중심. */ center of geometry.centers) {
      if(Math.abs(x-center.x)>(map.tileRadius??90)||Math.abs(y-center.y)>(map.tileRadius??90))continue;
      let /** inside: 모든 변의 안쪽 조건을 만족하는지 여부. */ inside=true;
      for(const /** normal: 검사할 육각형 변의 바깥 법선. */ normal of hexNormals) {
        if((x-center.x)*normal.x+(y-center.y)*normal.y>limit+1e-8){inside=false;break;}
      }
      if(inside)return true;
    }
    for(const /** bridge: 검사할 실제 다리. */ bridge of geometry.bridges) {
      const /** along: 다리 시작부터 전방 거리. */ along=(x-bridge.start.x)*bridge.ux+(y-bridge.start.y)*bridge.uy;
      const /** across: 다리 중심선에서 수직 거리. */ across=Math.abs((x-bridge.start.x)*bridge.uy-(y-bridge.start.y)*bridge.ux);
      if(along>=0&&along<=bridge.length&&across<=bridge.width/2-radius+1e-8)return true;
    }
    return false;
  },
  /** 개체 중심의 지형 높이를 조회한다. 다른 높이 다리는 중점을 경계로 가까운 쪽 층을 적용한다. */
  heightAt(/** map: 게임 지도. */ map,/** x: 중심 가로 좌표. */ x,/** y: 중심 세로 좌표. */ y){
    const /** geometry: 공통 지형·다리 좌표. */ geometry=this.geometry(map);
    const /** limit: 지형 육각형의 내접 반지름. */ limit=(map.tileRadius??90)*(map.landScale??.89)*Math.sqrt(3)/2;
    for(let /** index: 검사할 타일 순번. */ index=0;index<map.tiles.length;index++){
      const /** center: 검사할 지형 중심. */ center=geometry.centers[index];
      if(hexNormals.every(/** 육각형 안의 중심인지 검사한다. */ (/** normal: 변 법선. */ normal)=>(x-center.x)*normal.x+(y-center.y)*normal.y<=limit+1e-8))return map.tiles[index].height;
    }
    for(const /** bridge: 실제 연결 다리. */ bridge of geometry.bridges){
      const /** along: 다리 방향 투영 거리; across: 다리 중심선 수직 거리. */ along=(x-bridge.start.x)*bridge.ux+(y-bridge.start.y)*bridge.uy,across=Math.abs((x-bridge.start.x)*bridge.uy-(y-bridge.start.y)*bridge.ux);
      if(along>=0&&along<=bridge.length&&across<=bridge.width/2+1e-8)return map.tiles[along<=bridge.length/2?bridge.a:bridge.b].height;
    }
    return null;
  },
  /** 이동 선분이 금지된 3→2 다리 중앙 경계를 통과하는지 검사한다. */
  directionAllowed(/** map: 지도. */ map,/** from: 이동 전 위치. */ from,/** to: 이동 후보 위치. */ to) {
    for(const /** bridge: 통행 방향을 검사할 다리. */ bridge of this.geometry(map).bridges) {
      if(!bridge.oneWay)continue;
      const /** before: 이동 전 2→3 방향 투영 위치. */ before=((from.x-(bridge.start.x+bridge.end.x)/2)*bridge.ux+(from.y-(bridge.start.y+bridge.end.y)/2)*bridge.uy)*bridge.oneWay;
      const /** after: 이동 후 2→3 방향 투영 위치. */ after=((to.x-(bridge.start.x+bridge.end.x)/2)*bridge.ux+(to.y-(bridge.start.y+bridge.end.y)/2)*bridge.uy)*bridge.oneWay;
      if(before>=0&&after<0) {
        const /** fraction: 선분의 중앙 경계 교차 비율. */ fraction=before/(before-after);
        const /** cross: 다리 중앙에서 교차점의 수직 거리. */ cross=Math.abs((from.x+(to.x-from.x)*fraction-bridge.start.x)*bridge.uy-(from.y+(to.y-from.y)*fraction-bridge.start.y)*bridge.ux);
        if(cross<=bridge.width/2+12)return false;
      }
    }
    return true;
  },
  /** 2좌표 이하로 이동 경로를 나눠 빈 공간·역방향 다리·구르기 관통을 차단한다. */
  constrain(/** map: 지도. */ map,/** from: 이전 위치. */ from,/** to: 후보 위치. */ to,/** radius: 개체 피격 원 반지름. */ radius=12,/** slide: 일반 이동의 변을 따라 미끄러지기를 허용할지 여부. */ slide=true) {
    const /** steps: 이동 선분 검사 횟수. */ steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/2));
    const /** dx: 검사 한 번의 가로 이동량. */ dx=(to.x-from.x)/steps;
    const /** dy: 검사 한 번의 세로 이동량. */ dy=(to.y-from.y)/steps;
    let /** point: 현재까지 허용한 마지막 위치. */ point={x:from.x,y:from.y};
    for(let /** index: 검사할 세부 이동 순번. */ index=0;index<steps;index++) {
      const /** candidates: 전체 이동 우선, 일반 이동이면 축별 미끄러지기 후보. */ candidates=[{x:point.x+dx,y:point.y+dy},...(slide?[{x:point.x+dx,y:point.y},{x:point.x,y:point.y+dy}]:[])];
      const /** next: 지형과 통행 방향을 모두 만족하는 후보. */ next=candidates.find(/** 허용되는 후보를 선택한다. */ (/** candidate: 다음 위치 후보. */ candidate)=>this.walkable(map,candidate.x,candidate.y,radius)&&this.directionAllowed(map,point,candidate));
      if(!next)break;point=next;
    }
    return Math.hypot(point.x-to.x,point.y-to.y)<1e-7?{x:to.x,y:to.y}:point;
  },
});
