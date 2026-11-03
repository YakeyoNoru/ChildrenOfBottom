/** 이동 경로 주변 반지름 250을 누적 공개하는 로컬 미니맵. 게임 판정 좌표는 변경하지 않는다. */
class MiniMap {
  /** 미니맵 캔버스와 독립 탐색 마스크를 준비한다. */
  constructor(/** canvas: 우측 상단 표시 캔버스. */ canvas){
    /** canvas: 화면 표시 대상. */ this.canvas=canvas;
    /** key: 탐색 이력이 속한 방·지도 식별자. */ this.key=null;
    this.clear();
  }
  /** 방 변경·퇴장 시 이전 탐색 정보를 폐기한다. */
  clear(){
    this.key=null;
    /** previous: 직전 공개 위치. */ this.previous=null;
    /** terrain: 지도 지형을 한 번 그려 재사용할 캔버스. */ this.terrain=null;
    /** fog: 이미 지나간 영역을 흰색으로 누적한 마스크. */ this.fog=null;
  }
  /** 지도 전체 경계를 구하고 최대 2048픽셀의 캐시를 만든다. */
  prepare(/** map: 서버 지도. */ map,/** key: 방과 지도 구분자. */ key){
    this.clear();this.key=key;
    const /** geometry: 공통 지형·다리 좌표. */ geometry=globalThis.PitMapRules.geometry(map);
    const /** radius: 육각 지형 한 변 크기. */ radius=map.tileRadius*map.landScale;
    /** left: 지도 캐시의 왼쪽 월드 좌표. */ this.left=Math.min(...geometry.centers.map(/** 가로 좌표를 조회한다. */ (/** point: 지형 중심. */ point)=>point.x))-radius-250;
    /** top: 지도 캐시의 위쪽 월드 좌표. */ this.top=Math.min(...geometry.centers.map(/** 세로 좌표를 조회한다. */ (/** point: 지형 중심. */ point)=>point.y))-radius-250;
    const /** width: 전체 지도 가로 범위; height: 전체 지도 세로 범위. */ width=Math.max(...geometry.centers.map(/** 가로 좌표를 조회한다. */ (/** point: 지형 중심. */ point)=>point.x))+radius+250-this.left,height=Math.max(...geometry.centers.map(/** 세로 좌표를 조회한다. */ (/** point: 지형 중심. */ point)=>point.y))+radius+250-this.top;
    /** atlasScale: 메모리를 제한한 탐색 마스크의 월드 대비 배율. */ this.atlasScale=Math.min(.15,2048/Math.max(width,height));
    this.terrain=document.createElement('canvas');this.fog=document.createElement('canvas');
    for(const /** layer: 지형·마스크 캐시. */ layer of [this.terrain,this.fog]){layer.width=Math.ceil(width*this.atlasScale);layer.height=Math.ceil(height*this.atlasScale);}
    const /** ctx: 지형 캐시 문맥. */ ctx=this.terrain.getContext('2d');
    ctx.setTransform(this.atlasScale,0,0,this.atlasScale,-this.left*this.atlasScale,-this.top*this.atlasScale);
    ctx.strokeStyle='#829c86';ctx.lineCap='butt';
    for(const /** bridge: 실제 다리. */ bridge of geometry.bridges){ctx.beginPath();ctx.moveTo(bridge.start.x,bridge.start.y);ctx.lineTo(bridge.end.x,bridge.end.y);ctx.lineWidth=bridge.width;ctx.stroke();}
    for(let /** index: 타일 순번. */ index=0;index<map.tiles.length;index++){
      const /** tile: 지형 정의; center: 월드 중심. */ tile=map.tiles[index],center=geometry.centers[index];ctx.beginPath();
      for(let /** side: 꼭짓점 순번. */ side=0;side<6;side++){
        const /** x: 꼭짓점 가로; y: 꼭짓점 세로. */ x=center.x+Math.cos(side*Math.PI/3)*radius,y=center.y+Math.sin(side*Math.PI/3)*radius;
        if(side===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();ctx.fillStyle=['#bed9ac','#91b490','#658779','#405c56'][tile.height-1];ctx.fill();ctx.strokeStyle='#d5e7cc';ctx.lineWidth=10;ctx.stroke();
    }
  }
  /** 이동 선분을 지름 500의 둥근 붓으로 공개한다. 순간이동은 중간 경로를 공개하지 않는다. */
  reveal(/** position: 화면에 표시되는 본인 월드 중심. */ position){
    const /** ctx: 누적 공개 마스크 문맥. */ ctx=this.fog.getContext('2d');
    ctx.setTransform(this.atlasScale,0,0,this.atlasScale,-this.left*this.atlasScale,-this.top*this.atlasScale);
    ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.lineWidth=500;ctx.lineCap='round';
    if(this.previous&&Math.hypot(position.x-this.previous.x,position.y-this.previous.y)<=400){ctx.beginPath();ctx.moveTo(this.previous.x,this.previous.y);ctx.lineTo(position.x,position.y);ctx.stroke();}
    ctx.beginPath();ctx.arc(position.x,position.y,250,0,Math.PI*2);ctx.fill();
    this.previous={x:position.x,y:position.y};
  }
  /** 본인을 중심으로 고정하고 탐색 마스크 안의 지형·다리만 표시한다. */
  draw(/** map: 현재 지도. */ map,/** code: 방 코드. */ code,/** player: 본인 표시 좌표·방향. */ player){
    if(!map||!player)return;
    const /** key: 방별 지도 구분자. */ key=code+':'+map.id;
    if(this.key!==key)this.prepare(map,key);
    this.reveal(player);
    const /** ctx: 화면 미니맵 문맥. */ ctx=this.canvas.getContext('2d');
    const /** size: 렌더링 픽셀 크기; scale: 지름 2400 월드 범위를 표시할 배율. */ size=this.canvas.width,scale=size/2400;
    const /** x: 캐시를 옮길 가로 오프셋; y: 세로 오프셋. */ x=size/2+(this.left-player.x)*scale,y=size/2+(this.top-player.y)*scale;
    ctx.clearRect(0,0,size,size);ctx.save();ctx.beginPath();ctx.arc(size/2,size/2,size/2-3,0,Math.PI*2);ctx.clip();
    ctx.drawImage(this.terrain,x,y,this.terrain.width/this.atlasScale*scale,this.terrain.height/this.atlasScale*scale);
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(this.fog,x,y,this.fog.width/this.atlasScale*scale,this.fog.height/this.atlasScale*scale);
    ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#0a121a';ctx.fillRect(0,0,size,size);ctx.restore();
    ctx.strokeStyle='#b9cfa9';ctx.lineWidth=4;ctx.beginPath();ctx.arc(size/2,size/2,size/2-3,0,Math.PI*2);ctx.stroke();
    ctx.save();ctx.translate(size/2,size/2);ctx.rotate(player.facing??0);ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-6,-5);ctx.lineTo(-6,5);ctx.closePath();ctx.fillStyle='#57e8f1';ctx.fill();ctx.strokeStyle='#102932';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  }
}
