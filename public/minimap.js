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
    /** fogContext: 작은 탐색 픽셀을 자주 읽는 CPU 우선 마스크 문맥. */ this.fogContext=this.fog.getContext('2d',{willReadFrequently:true});
    for(const /** layer: 지형·마스크 캐시. */ layer of [this.terrain,this.fog]){layer.width=Math.ceil(width*this.atlasScale);layer.height=Math.ceil(height*this.atlasScale);}
    const /** ctx: 지형 캐시 문맥. */ ctx=this.terrain.getContext('2d');
    ctx.setTransform(this.atlasScale,0,0,this.atlasScale,-this.left*this.atlasScale,-this.top*this.atlasScale);
    ctx.strokeStyle='#ffffff';ctx.lineCap='butt';
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
    const /** ctx: 누적 공개 마스크 문맥. */ ctx=this.fogContext;
    ctx.setTransform(this.atlasScale,0,0,this.atlasScale,-this.left*this.atlasScale,-this.top*this.atlasScale);
    ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.lineWidth=500;ctx.lineCap='round';
    if(this.previous&&Math.hypot(position.x-this.previous.x,position.y-this.previous.y)<=400){ctx.beginPath();ctx.moveTo(this.previous.x,this.previous.y);ctx.lineTo(position.x,position.y);ctx.stroke();}
    ctx.beginPath();ctx.arc(position.x,position.y,250,0,Math.PI*2);ctx.fill();
    this.previous={x:position.x,y:position.y};
  }
  /** 실제 탐색 마스크에서 좌표의 공개 여부를 읽는다. 맵핵으로는 공개되지 않는다. */
  isExplored(/** point: 귀환등의 월드 중심 좌표. */ point){
    if(!this.fog||!this.fogContext)return false;
    const /** x: 마스크 가로 픽셀; y: 마스크 세로 픽셀. */ x=Math.floor((point.x-this.left)*this.atlasScale),y=Math.floor((point.y-this.top)*this.atlasScale);
    if(x<0||y<0||x>=this.fog.width||y>=this.fog.height)return false;
    return this.fogContext.getImageData(x,y,1,1).data[3]>0;
  }
  /** 살아 있고 탐색한 귀환등을 지도 프레임 안에 하늘색 고정 크기 마커로 그린다. */
  drawLamps(/** ctx: 클리핑이 적용된 지도 문맥. */ ctx,/** objects: 최신 서버 개체 목록. */ objects,/** player: 지도 중심 플레이어. */ player,/** pan: 지도 드래그 거리. */ pan,/** scale: 월드 대비 지도 배율. */ scale,/** width: 지도 가로 픽셀. */ width,/** height: 지도 세로 픽셀. */ height){
    for(const /** lamp: 지도에 표시할 귀환등 후보. */ lamp of objects){
      if(lamp.status?.objectType!=='prop'||lamp.status.classificationCode!=='OBJ0001'||lamp.status.state!=='alive'||lamp.status.currentHealth<=0||!this.isExplored(lamp))continue;
      const /** x: 마커 가로 픽셀; y: 마커 세로 픽셀. */ x=width/2+(lamp.x-player.x-pan.x)*scale,y=height/2+(lamp.y-player.y-pan.y)*scale;
      // 본인 위치의 삼각형과 구별되는 원형 마커이며 지도 밖에서는 클리핑된다.
      ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.fillStyle='#87CEEB';ctx.fill();ctx.strokeStyle='#173744';ctx.lineWidth=1.5;ctx.stroke();
    }
  }
  /** 확대 전체맵에서만 탐색된 타일의 고유 번호를 중앙에 표시한다. */
  drawTileNumbers(
    /** ctx: 확대 지도 캔버스 문맥. */ ctx,
    /** map: 서버에서 확정한 타일 목록과 좌표. */ map,
    /** player: 지도 중심의 플레이어. */ player,
    /** pan: 지도 드래그 오프셋. */ pan,
    /** scale: 월드 좌표를 지도 픽셀로 변환하는 배율. */ scale,
    /** width: 지도 캔버스 너비. */ width,
    /** height: 지도 캔버스 높이. */ height,
    /** showAll: 테스트용 전체 공개 여부. */ showAll
  ){
    const /** geometry: 타일별 월드 중심 좌표. */ geometry=globalThis.PitMapRules.geometry(map);
    ctx.save();ctx.beginPath();ctx.rect(3,3,width-6,height-6);ctx.clip();
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold 13px system-ui';ctx.lineJoin='round';ctx.lineWidth=3;
    for(let /** index: 현재 표시할 타일의 목록 순번. */ index=0;index<map.tiles.length;index++){
      const /** tile: 번호를 표시할 지형 타일. */ tile=map.tiles[index];
      const /** center: 타일의 실제 월드 중심 좌표. */ center=geometry.centers[index];
      if(!showAll&&!this.isExplored(center))continue;
      const /** x: 확대 지도에서 타일 중심의 가로 픽셀. */ x=width/2+(center.x-player.x-pan.x)*scale;
      const /** y: 확대 지도에서 타일 중심의 세로 픽셀. */ y=height/2+(center.y-player.y-pan.y)*scale;
      if(x<3||x>width-3||y<3||y>height-3)continue;
      const /** number: 서버가 부여한 고유 타일 번호. */ number=String(tile.id);
      ctx.strokeStyle='#172b26';ctx.fillStyle='#ffffff';
      ctx.strokeText(number,x,y);ctx.fillText(number,x,y);
    }
    ctx.restore();
  }
  /** 본인을 중심으로 고정하고 탐색 마스크 안의 지형·다리만 표시한다. */
  draw(/** map: 현재 지도. */ map,/** code: 방 코드. */ code,/** player: 본인 표시 좌표·방향. */ player,/** worldWidth: 본 화면의 가로 월드 범위. */ worldWidth=684,/** canvas: 기본 또는 확대 지도 표시 대상. */ canvas=this.canvas,/** rectangular: 확대 지도의 사각형 표시 여부. */ rectangular=false,/** pan: 플레이어 기준 표시 중심의 이동 거리. */ pan={x:0,y:0},/** showAll: 전체맵만 탐색 마스크를 생략하는 테스트 설정. */ showAll=false,/** objects: 마커 생존·소멸 판정에 쓸 최신 서버 개체 목록. */ objects=[]){
    if(!map||!player)return;
    const /** key: 방별 지도 구분자. */ key=code+':'+map.id;
    if(this.key!==key)this.prepare(map,key);
    this.reveal(player);
    const /** ctx: 화면 미니맵 문맥. */ ctx=canvas.getContext('2d');
    const /** size: 렌더링 픽셀 크기; scale: 본 화면 가로폭의 2.5배 범위를 표시할 배율. */ size=canvas.width,height=canvas.height,scale=size/(worldWidth*2.5);
    const /** x: 캐시를 옮길 가로 오프셋; y: 세로 오프셋. */ x=size/2+(this.left-player.x-pan.x)*scale,y=height/2+(this.top-player.y-pan.y)*scale;
    ctx.clearRect(0,0,size,height);ctx.save();ctx.beginPath();if(rectangular)ctx.rect(3,3,size-6,height-6);else ctx.arc(size/2,height/2,Math.min(size,height)/2-3,0,Math.PI*2);ctx.clip();
    ctx.drawImage(this.terrain,x,y,this.terrain.width/this.atlasScale*scale,this.terrain.height/this.atlasScale*scale);
    // 실제 탐색 마스크를 변경하지 않아 해제 즉시 원래 밝혀진 영역만 표시한다.
    if(!(rectangular&&showAll)){ctx.globalCompositeOperation='destination-in';ctx.drawImage(this.fog,x,y,this.fog.width/this.atlasScale*scale,this.fog.height/this.atlasScale*scale);}
    ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#A7A3B0';ctx.fillRect(0,0,size,height);
    ctx.globalCompositeOperation='source-over';if(rectangular)this.drawTileNumbers(ctx,map,player,pan,scale,size,height,showAll);this.drawLamps(ctx,objects,player,pan,scale,size,height);ctx.restore();
    ctx.strokeStyle='#b9cfa9';ctx.lineWidth=4;ctx.beginPath();if(rectangular)ctx.rect(3,3,size-6,height-6);else ctx.arc(size/2,height/2,Math.min(size,height)/2-3,0,Math.PI*2);ctx.stroke();
    ctx.save();ctx.translate(size/2-pan.x*scale,height/2-pan.y*scale);ctx.rotate(player.facing??0);ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-6,-5);ctx.lineTo(-6,5);ctx.closePath();ctx.fillStyle='#57e8f1';ctx.fill();ctx.strokeStyle='#102932';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  }
}
