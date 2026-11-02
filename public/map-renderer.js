/** 공통 지도 데이터를 단순한 육각 지형·다리·번호로 표시하는 프로토타입 렌더러. */
globalThis.MapRenderer=Object.freeze({
  /** 서버가 확정한 지도와 카메라 오프셋으로 이동 가능한 영역을 그린다. */
  draw(/** context: 캔버스 문맥. */ context,/** map: 서버 지도. */ map,/** ox: 가로 카메라 오프셋. */ ox,/** oy: 세로 카메라 오프셋. */ oy,/** width: 화면 월드 폭. */ width,/** height: 화면 월드 높이. */ height) {
    const /** geometry: 지형·다리의 공통 평면 좌표. */ geometry=globalThis.PitMapRules.geometry(map);
    const /** radius: 표시할 지형 육각형의 외접 반지름. */ radius=map.tileRadius*map.landScale;
    const /** colors: 논리 높이별 지형 표시 색상. */ colors=['#bbd9ac','#91b490','#658779','#405c56'];
    context.fillStyle='#101b21';context.fillRect(0,0,width,height);
    context.lineCap='butt';
    for(const /** bridge: 실제 존재하는 다리. */ bridge of geometry.bridges) {
      context.beginPath();context.moveTo(bridge.start.x+ox,bridge.start.y+oy);context.lineTo(bridge.end.x+ox,bridge.end.y+oy);
      context.strokeStyle='#667e76';context.lineWidth=bridge.width;context.stroke();
    }
    map.tiles.forEach(/** 지형과 번호를 표시한다. */ (/** tile: 표시할 타일. */ tile,/** index: 중심 좌표 인덱스. */ index)=>{
      const /** center: 화면상의 지형 중심. */ center={x:geometry.centers[index].x+ox,y:geometry.centers[index].y+oy};
      if(center.x < -radius||center.x>width+radius||center.y < -radius||center.y>height+radius)return;
      context.beginPath();
      for(let /** corner: 육각형 꼭짓점 순번. */ corner=0;corner<6;corner++) {
        const /** angle: 꼭짓점 각도. */ angle=corner*Math.PI/3;
        const /** x: 꼭짓점 가로 위치. */ x=center.x+Math.cos(angle)*radius;
        const /** y: 꼭짓점 세로 위치. */ y=center.y+Math.sin(angle)*radius;
        if(corner===0)context.moveTo(x,y);else context.lineTo(x,y);
      }
      context.closePath();context.fillStyle=colors[tile.height-1];context.fill();
      context.strokeStyle=tile.id<=5?'#ffe5a0':'#c8dfce';context.lineWidth=2;context.stroke();
      context.textAlign='center';context.fillStyle=tile.height>=3?'#f0f5e9':'#17342b';context.font='bold 16px system-ui';context.fillText(String(tile.id),center.x,center.y+6);
      context.font='11px system-ui';context.fillText(tile.id<=5?'시작 '+tile.id:'높이 '+tile.height,center.x,center.y+24);
    });
    for(const /** bridge: 단방향 표시를 그릴 다리. */ bridge of geometry.bridges) {
      if(!bridge.oneWay)continue;
      const /** x: 다리 중점 가로 화면 좌표. */ x=(bridge.start.x+bridge.end.x)/2+ox;
      const /** y: 다리 중점 세로 화면 좌표. */ y=(bridge.start.y+bridge.end.y)/2+oy;
      const /** ux: 허용 방향 가로 성분. */ ux=bridge.ux*bridge.oneWay;
      const /** uy: 허용 방향 세로 성분. */ uy=bridge.uy*bridge.oneWay;
      context.beginPath();context.moveTo(x+ux*10,y+uy*10);context.lineTo(x-ux*7-uy*6,y-uy*7+ux*6);context.lineTo(x-ux*7+uy*6,y-uy*7-ux*6);context.closePath();context.fillStyle='#ffb14d';context.fill();
    }
  },
});
