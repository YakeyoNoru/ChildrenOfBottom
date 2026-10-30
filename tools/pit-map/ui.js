/* 구덩이 시제품 화면: 하나의 맵 데이터를 전체 지도·미니맵·필드 충돌에 공유한다. */
const /** field: 플레이어 추적 필드 캔버스. */ field=document.querySelector('#field'),/** context: 필드의 2차원 그리기 문맥. */ context=field.getContext('2d'),/** mini: 전체 연결망을 표시할 미니맵 캔버스. */ mini=document.querySelector('#mini'),/** miniContext: 미니맵의 2차원 그리기 문맥. */ miniContext=mini.getContext('2d'); // 필드와 미니맵의 그리기 대상.
const /** colors: 높이 1~4의 명세 색상. */ colors=['#D7FFD0','#AAC9A4','#839C7F','#5C6E59'],/** icons: 지형 종류별 표시 기호. */ icons={/** start: 낮은 끝 또는 첫 다리 중심의 좌표. */ start:'⌂',normal:'',rich:'♧',safe:'♨',boss:'◎'},/** names: 지형 종류별 한국어 표시 이름. */ names={/** start: 낮은 끝 또는 첫 다리 중심의 좌표. */ start:'시작지점',normal:'일반필드',rich:'풍요필드',safe:'안전지대',boss:'보스'}; // 명세의 높이별 색상과 지형별 표시.
const /** radius: 격자 배치와 표시의 타일 반지름(픽셀). */ radius=90,/** keys: 현재 눌린 키 식별자 집합. */ keys=new Set(),/** player: 필드 이동 판정에 사용하는 플레이어 평면 위치. */ player={/** x: 필드의 가로 좌표(픽셀). */ x:0,/** y: 필드의 세로 좌표(픽셀). */ y:0},/** touch: 터치 버튼의 현재 이동 방향. */ touch={/** x: 필드의 가로 좌표(픽셀). */ x:0,/** y: 필드의 세로 좌표(픽셀). */ y:0}; // 격자 크기, 눌린 키, 플레이어 좌표, 터치 이동 방향.
let /** currentMap: 필드·미니맵·충돌이 공유하는 확정 지도. */ currentMap,/** fullMap: 전체 지도 표시 상태. */ fullMap=false,/** previousTime: 이전 프레임 시각(밀리초). */ previousTime=0; // 현재 게임 맵, 전체 지도 표시 여부, 이전 프레임 시간.
/** 축 좌표를 평면 필드 좌표로 변환한다. */
/** 매개변수 설명 · tile: 현재 배치·표시·검증할 타일 데이터. */ function center(tile){return {/** x: 필드의 가로 좌표(픽셀). */ x:1.5*radius*tile.q,/** y: 필드의 세로 좌표(픽셀). */ y:Math.sqrt(3)*radius*(tile.r+tile.q/2)};}
/** 육각형 타일 내부인지 플레이어 반지름을 고려해 판정한다. */
/** 매개변수 설명 · x: 필드의 가로 좌표(픽셀); y: 필드의 세로 좌표(픽셀); tile: 현재 배치·표시·검증할 타일 데이터. */ function insideTile(x,y,tile){const /** point: 타일 중심의 화면 좌표(픽셀). */ point=center(tile),/** dx: 가로 이동량 또는 두 중심의 가로 차이(픽셀). */ dx=Math.abs(x-point.x),/** dy: 세로 이동량 또는 두 중심의 세로 차이(픽셀). */ dy=Math.abs(y-point.y),/** size: 현재 묶음 크기 또는 이동 가능 육각형 크기. */ size=radius*.89-5;/* 중심 거리와 이동 가능 육각형 반지름. */return dx<=size&&dy<=Math.sqrt(3)*size/2&&Math.sqrt(3)*dx+dy<=Math.sqrt(3)*size;}
/** 다리 통로의 폭과 길이 안에 있는지 판정한다. */
/** 매개변수 설명 · x: 필드의 가로 좌표(픽셀); y: 필드의 세로 좌표(픽셀); a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ function insideBridge(x,y,a,b){const /** start: 낮은 끝 또는 첫 다리 중심의 좌표. */ start=center(currentMap.tiles[a]),/** end: 높은 끝 또는 둘째 다리 중심의 좌표. */ end=center(currentMap.tiles[b]),/** dx: 가로 이동량 또는 두 중심의 가로 차이(픽셀). */ dx=end.x-start.x,/** dy: 세로 이동량 또는 두 중심의 세로 차이(픽셀). */ dy=end.y-start.y,/** length: 이동 벡터 또는 다리 중심 간 거리(픽셀). */ length=Math.hypot(dx,dy),/** along: 현재 지도 생성·표시·검사 단계에서 사용하는 along 처리 자료. */ along=((x-start.x)*dx+(y-start.y)*dy)/length,/** across: 현재 지도 생성·표시·검사 단계에서 사용하는 across 처리 자료. */ across=Math.abs((x-start.x)*dy-(y-start.y)*dx)/length;/* 다리 기준 좌표와 길이. */return along>=0&&along<=length&&across<=9;}
/** 타일과 실제 연결된 다리로만 이동을 허용한다. */
/** 매개변수 설명 · x: 필드의 가로 좌표(픽셀); y: 필드의 세로 좌표(픽셀). */ function walkable(x,y){return currentMap.tiles.some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · tile: 현재 배치·표시·검증할 타일 데이터. */ tile=>insideTile(x,y,tile))||currentMap.bridges.some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ ([a,b])=>insideBridge(x,y,a,b));}
/** 실제 이동 선분이 2↔3 다리의 중앙 경계를 3→2 방향으로 넘는지만 차단한다. */
/** 매개변수 설명 · fromX: 이동 전 가로 좌표(픽셀); fromY: 이동 전 세로 좌표(픽셀); toX: 이동 후 후보 가로 좌표(픽셀); toY: 이동 후 후보 세로 좌표(픽셀). */ function canMove(fromX,fromY,toX,toY){
  if(!walkable(toX,toY))return false;
  for(const /** a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ [a,b] of currentMap.bridges){ // 단방향 예외가 있는 다리를 검사한다.
    if(!([currentMap.tiles[a].height,currentMap.tiles[b].height].includes(2)&&[currentMap.tiles[a].height,currentMap.tiles[b].height].includes(3)))continue;
    const /** low: 다리의 낮은 높이 끝점. */ low=currentMap.tiles[a].height===2?a:b,/** high: 다리의 높은 높이 끝점. */ high=low===a?b:a,/** start: 낮은 끝 또는 첫 다리 중심의 좌표. */ start=center(currentMap.tiles[low]),/** end: 높은 끝 또는 둘째 다리 중심의 좌표. */ end=center(currentMap.tiles[high]),/** dx: 가로 이동량 또는 두 중심의 가로 차이(픽셀). */ dx=end.x-start.x,/** dy: 세로 이동량 또는 두 중심의 세로 차이(픽셀). */ dy=end.y-start.y,/** length: 이동 벡터 또는 다리 중심 간 거리(픽셀). */ length=Math.hypot(dx,dy),/** ux: 2→3 중심선의 가로 단위 방향. */ ux=dx/length,/** uy: 2→3 중심선의 세로 단위 방향. */ uy=dy/length,/** mx: 다리 중앙의 가로 좌표(픽셀). */ mx=(start.x+end.x)/2,/** my: 다리 중앙의 세로 좌표(픽셀). */ my=(start.y+end.y)/2; // 2→3 기준의 중심선과 중앙 통행 경계.
    const /** before: 이동 전 단방향 경계의 어느 쪽인지 나타내는 부호. */ before=(fromX-mx)*ux+(fromY-my)*uy,/** after: 이동 후 단방향 경계의 어느 쪽인지 나타내는 부호. */ after=(toX-mx)*ux+(toY-my)*uy; // 이동 전후 중앙 경계의 어느 쪽에 있는지 나타내는 부호.
    if(before>=0&&after<0){
      const /** fraction: 이동 선분이 중앙 경계를 지나는 비율. */ fraction=before/(before-after),/** ix: 중앙 경계 교차점의 가로 좌표(픽셀). */ ix=fromX+(toX-fromX)*fraction,/** iy: 중앙 경계 교차점의 세로 좌표(픽셀). */ iy=fromY+(toY-fromY)*fraction; // 경계를 실제로 통과하는 위치.
      if(Math.abs((ix-mx)*uy-(iy-my)*ux)<=20)return false;
    }
  }return true;
}
/** 지도 전체를 표시할 카메라 변환을 계산한다. */
/** 매개변수 설명 · canvas: 지도를 그릴 화면 요소. */ function fit(canvas){const /** points: 현재 지도 생성·표시·검사 단계에서 사용하는 points 처리 자료. */ points=currentMap.tiles.map(center),/** minX: 현재 지도 생성·표시·검사 단계에서 사용하는 minX 처리 자료. */ minX=Math.min(...points.map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · p: 현재 지도 생성·표시·검사 단계에서 사용하는 p 처리 자료. */ p=>p.x))-radius,/** maxX: 현재 지도 생성·표시·검사 단계에서 사용하는 maxX 처리 자료. */ maxX=Math.max(...points.map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · p: 현재 지도 생성·표시·검사 단계에서 사용하는 p 처리 자료. */ p=>p.x))+radius,/** minY: 현재 지도 생성·표시·검사 단계에서 사용하는 minY 처리 자료. */ minY=Math.min(...points.map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · p: 현재 지도 생성·표시·검사 단계에서 사용하는 p 처리 자료. */ p=>p.y))-radius,/** maxY: 현재 지도 생성·표시·검사 단계에서 사용하는 maxY 처리 자료. */ maxY=Math.max(...points.map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · p: 현재 지도 생성·표시·검사 단계에서 사용하는 p 처리 자료. */ p=>p.y))+radius,/** scale: 현재 지도 생성·표시·검사 단계에서 사용하는 scale 처리 자료. */ scale=Math.min(canvas.width/(maxX-minX+80),canvas.height/(maxY-minY+80));/* 지도 경계와 화면 배율. */return {scale,/** x: 필드의 가로 좌표(픽셀). */ x:canvas.width/2-scale*(minX+maxX)/2,/** y: 필드의 세로 좌표(픽셀). */ y:canvas.height/2-scale*(minY+maxY)/2};}
/** 하나의 맵 데이터를 지정 화면에 그린다. */
/** 매개변수 설명 · canvas: 지도를 그릴 화면 요소; ctx: 해당 화면의 2차원 그리기 문맥; overview: 전체 지도 카메라 사용 여부. */ function draw(canvas,ctx,overview){
  const /** view: 현재 카메라 배율과 평행 이동. */ view=overview?fit(canvas):{scale:1,/** x: 필드의 가로 좌표(픽셀). */ x:canvas.width/2-player.x,/** y: 필드의 세로 좌표(픽셀). */ y:canvas.height/2-player.y}; // 전체 지도 또는 플레이어 추적 카메라.
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#182321';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(view.scale,0,0,view.scale,view.x,view.y);
  for(const /** tile: 현재 배치·표시·검증할 타일 데이터. */ tile of currentMap.tiles){ // 현재 그리는 타일.
    const /** point: 타일 중심의 화면 좌표(픽셀). */ point=center(tile); // 타일 중심.
    ctx.beginPath();for(let /** corner: 정육각형 꼭짓점 순서. */ corner=0;corner<6;corner++){/* 육각형 꼭짓점 순서. */const /** angle: 화면 꼭짓점 또는 다리 방향 각도(라디안). */ angle=corner*Math.PI/3,/** x: 필드의 가로 좌표(픽셀). */ x=point.x+Math.cos(angle)*radius*.89,/** y: 필드의 세로 좌표(픽셀). */ y=point.y+Math.sin(angle)*radius*.89;/* 꼭짓점 좌표. */corner?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fillStyle=colors[tile.height-1];ctx.fill();ctx.strokeStyle='#FFFFFF';ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle=tile.height===4?'#FFFFFF':'#18251c';ctx.textAlign='center';ctx.font='30px "Segoe UI Symbol",sans-serif';ctx.fillText(icons[tile.kind],point.x,point.y+7);ctx.font='bold 19px sans-serif';ctx.fillText(tile.id,point.x,point.y+radius*.43);
    if(!overview){ctx.font='12px sans-serif';ctx.fillText(names[tile.kind],point.x,point.y-28);}
  }
  for(const /** a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ [a,b] of currentMap.bridges){ // 두 타일 사이에 그릴 실제 다리.
    const /** start: 낮은 끝 또는 첫 다리 중심의 좌표. */ start=center(currentMap.tiles[a]),/** end: 높은 끝 또는 둘째 다리 중심의 좌표. */ end=center(currentMap.tiles[b]),/** dx: 가로 이동량 또는 두 중심의 가로 차이(픽셀). */ dx=end.x-start.x,/** dy: 세로 이동량 또는 두 중심의 세로 차이(픽셀). */ dy=end.y-start.y,/** length: 이동 벡터 또는 다리 중심 간 거리(픽셀). */ length=Math.hypot(dx,dy),/** mx: 다리 중앙의 가로 좌표(픽셀). */ mx=(start.x+end.x)/2,/** my: 다리 중앙의 세로 좌표(픽셀). */ my=(start.y+end.y)/2; // 다리 중심과 방향.
    ctx.save();ctx.translate(mx,my);ctx.rotate(Math.atan2(dy,dx));ctx.fillStyle='#748074';ctx.fillRect(-length*.19,-10,length*.38,20);ctx.strokeStyle='white';ctx.lineWidth=8;for(const /** y: 필드의 세로 좌표(픽셀). */ y of [-13,13]){/* 난간의 양쪽 위치. */ctx.beginPath();ctx.moveTo(-length*.2,y);ctx.lineTo(length*.2,y);ctx.stroke();}ctx.strokeStyle='#050807';ctx.lineWidth=5;for(const /** y: 필드의 세로 좌표(픽셀). */ y of [-13,13]){/* 검은 평행 난간. */ctx.beginPath();ctx.moveTo(-length*.2,y);ctx.lineTo(length*.2,y);ctx.stroke();}if(Math.min(currentMap.tiles[a].height,currentMap.tiles[b].height)===2&&Math.max(currentMap.tiles[a].height,currentMap.tiles[b].height)===3){
      const /** sign: 현재 다리 표시 좌표에서 허용하는 2→3 방향 부호. */ sign=currentMap.tiles[a].height===2?1:-1; // 회전된 다리에서 허용되는 2→3 방향.
      ctx.strokeStyle='#F29118';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-13*sign,0);ctx.lineTo(7*sign,0);ctx.stroke();ctx.fillStyle='#F29118';ctx.beginPath();ctx.moveTo(15*sign,0);ctx.lineTo(2*sign,-7);ctx.lineTo(2*sign,7);ctx.closePath();ctx.fill();
    }ctx.restore();
  }
  ctx.beginPath();ctx.arc(player.x,player.y,overview?11:7,0,Math.PI*2);ctx.fillStyle='#ffbc51';ctx.fill();ctx.strokeStyle='#251b0c';ctx.lineWidth=3;ctx.stroke();ctx.setTransform(1,0,0,1,0,0);
}
/** 입력 시드로 게임 시작 시 전체 맵을 한 번 생성하고 플레이어를 배치한다. */
/** 매개변수 설명. */ function newGame(){try{const /** seed: 같은 지도와 추첨을 재현하는 32비트 시드. */ seed=Number(document.querySelector('#seed').value)>>>0;/* 게임 시작 시 확정할 맵 시드. */currentMap=generate(seed);const /** spawn: 현재 지도 생성·표시·검사 단계에서 사용하는 spawn 처리 자료. */ spawn=center(currentMap.tiles.find(/** 조건에 맞는 첫 타일 또는 다리를 조회한다 · t: 현재 처리 중인 타일 데이터. */ t=>t.id===1));/* 1번 시작점 중심. */player.x=spawn.x;player.y=spawn.y;document.querySelector('#result').textContent=`검증 통과 · ${currentMap.tiles.length}타일 · ${currentMap.bridges.length}다리 · 높이 경계 ${currentMap.validation.transitionCounts.join(' / ')}개 · 묶음 출입 통과`;document.querySelector('#selection').textContent=`이번 게임의 추가 타일: ${currentMap.selectedOptional.length?currentMap.selectedOptional.join(', '):'없음'} · 높이 1 묶음 ${currentMap.validation.componentSizes[1].join('+')} / 높이 2 묶음 ${currentMap.validation.componentSizes[2].join('+')}`;window.pitMap=currentMap;}catch(/** error: 현재 검증 또는 실행 중 발생한 오류. */ error){document.querySelector('#result').textContent=error.message;}}
/** 경과 시간에 따라 플레이어를 이동하고 두 화면을 갱신한다. */
/** 매개변수 설명 · time: 현재 프레임 시각(밀리초). */ function frame(time){
  const /** delta: 프레임 사이 이동에 사용할 시간(초). */ delta=Math.min((time-previousTime)/1000,.04); // 프레임 지연 시 벽 관통을 막는 시간 상한.
  previousTime=time;
  let /** dx: 가로 이동량 또는 두 중심의 가로 차이(픽셀). */ dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touch.x,/** dy: 세로 이동량 또는 두 중심의 세로 차이(픽셀). */ dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touch.y; // 키보드와 터치 이동 벡터.
  const /** length: 이동 벡터 또는 다리 중심 간 거리(픽셀). */ length=Math.hypot(dx,dy); // 대각선 속도를 정규화할 이동 크기.
  if(length&&!fullMap){dx=dx/length*160*delta;dy=dy/length*160*delta;if(canMove(player.x,player.y,player.x+dx,player.y))player.x+=dx;if(canMove(player.x,player.y,player.x,player.y+dy))player.y+=dy;}
  draw(field,context,fullMap);draw(mini,miniContext,true);
  const /** tile: 현재 배치·표시·검증할 타일 데이터. */ tile=currentMap.tiles.find(/** 조건에 맞는 첫 타일 또는 다리를 조회한다 · t: 현재 처리 중인 타일 데이터. */ t=>insideTile(player.x,player.y,t)); // 현재 플레이어가 서 있는 타일.
  document.querySelector('#location').textContent=tile?`${tile.id}번 · 높이 ${tile.height} · ${names[tile.kind]}`:'다리 통과 중';requestAnimationFrame(frame);
}
/** 화면 크기에 맞춰 필드 해상도를 조절한다. */
/** 매개변수 설명. */ function resize(){field.width=field.clientWidth;field.height=field.clientHeight;}
window.addEventListener('resize',resize);
window.addEventListener('keydown',/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · event: 현재 키보드·포인터 입력 이벤트. */ event=>{if(event.target.tagName==='INPUT')return;keys.add(event.key.toLowerCase());if(event.key.toLowerCase()==='m'){fullMap=!fullMap;document.querySelector('#toggle').textContent=fullMap?'필드로 돌아가기':'전체 지도 (M)';}if(event.key.startsWith('Arrow'))event.preventDefault();});
window.addEventListener('keyup',/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · event: 현재 키보드·포인터 입력 이벤트. */ event=>keys.delete(event.key.toLowerCase()));window.addEventListener('blur',/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>{keys.clear();touch.x=touch.y=0;});
document.querySelector('#start').onclick=newGame;
document.querySelector('#random').onclick=/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>{document.querySelector('#seed').value=crypto.getRandomValues(new Uint32Array(1))[0];newGame();};
document.querySelector('#toggle').onclick=/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>{fullMap=!fullMap;document.querySelector('#toggle').textContent=fullMap?'필드로 돌아가기':'전체 지도 (M)';};
document.querySelector('#download').onclick=/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>{const /** link: 현재 지도 생성·표시·검사 단계에서 사용하는 link 처리 자료. */ link=document.createElement('a');/* 현재 확정된 지도 데이터의 내려받기 링크. */link.href=URL.createObjectURL(new Blob([JSON.stringify(currentMap,null,2)],{type:'application/json'}));link.download=`pit_${currentMap.seed}.json`;link.click();setTimeout(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>URL.revokeObjectURL(link.href),1000);};
for(const /** button: 현재 터치 이동 버튼 요소. */ button of document.querySelectorAll('[data-move]')){/* 터치 방향 버튼. */button.onpointerdown=/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · event: 현재 키보드·포인터 입력 이벤트. */ event=>{event.preventDefault();button.setPointerCapture(event.pointerId);[touch.x,touch.y]=button.dataset.move.split(',').map(Number);};button.onpointerup=button.onpointercancel=/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>touch.x=touch.y=0;}
resize();newGame();requestAnimationFrame(frame);
