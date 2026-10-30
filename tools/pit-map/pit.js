/* 구덩이 구현로직: 의존성 없이 브라우저와 Node에서 공유하는 생성기·검증기. */
'use strict';
/** 시드에 따라 재현 가능한 난수 함수를 만든다. */
/** 매개변수 설명 · seed: 같은 지도와 추첨을 재현하는 32비트 시드. */ function randomSource(seed) {
  let /** state: 다음 난수를 계산할 내부 상태. */ state=seed>>>0; // 난수의 현재 내부 상태.
  return /** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ function(){state+=0x6D2B79F5;let /** value: 비트 혼합 또는 현재 계산 중간값. */ value=state;/* 혼합 중인 난수 값. */value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return ((value^value>>>14)>>>0)/4294967296;};
}
const /** directions: 현재 지도 생성·표시·검사 단계에서 사용하는 directions 처리 자료. */ directions=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]; // 축 좌표계의 여섯 이웃 방향.
/** 두 슬롯이 실제로 변을 공유하는지 검사한다. */
/** 매개변수 설명 · a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ function adjacent(a,b){return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r))===1;}
/** 고정 육각 격자의 지정 반지름에 있는 슬롯을 순서대로 반환한다. */
/** 매개변수 설명 · radius: 격자 배치와 표시의 타일 반지름(픽셀). */ function ring(radius){
  const /** slots: 고리에서 선택할 격자 슬롯 목록. */ slots=[]; // 반환할 고리 좌표 목록.
  let /** q: 육각형 격자의 첫 축 정수 좌표. */ q=-radius,/** r: 육각형 격자의 둘째 축 정수 좌표. */ r=radius; // 고리 순회 중의 축 좌표.
  for(const /** direction: 고리 순회 또는 허용 통행의 진행 방향. */ direction of directions){ // 현재 진행 방향.
    for(let /** step: 경로 검사 또는 60도 회전의 진행 횟수. */ step=0;step<radius;step++){/* 한 변에서 진행한 칸 수. */slots.push({/** q: 육각형 격자의 첫 축 정수 좌표. */ q,/** r: 육각형 격자의 둘째 축 정수 좌표. */ r});q+=direction[0];r+=direction[1];}
  }return slots;
}
/** 목록을 시드 난수에 따라 섞은 새 목록을 반환한다. */
/** 매개변수 설명 · values: 원본을 보존하며 섞을 목록; random: 배치 또는 추첨 전용 난수 함수. */ function shuffled(values,random){const /** copy: 원본을 훼손하지 않을 작업 복사본. */ copy=[...values];/* 원본을 보존한 작업 목록. */for(let /** index: 현재 목록에서 처리하는 위치. */ index=copy.length-1;index>0;index--){/* 교환할 목록 위치. */const /** other: 교환 대상 위치 또는 비교할 다른 타일. */ other=Math.floor(random()*(index+1));/* 무작위 교환 위치. */[copy[index],copy[other]]=[copy[other],copy[index]];}return copy;}
/** 다리 목록으로 타일별 이웃 목록을 만든다. */
/** 매개변수 설명 · map: 타일과 물리 다리 및 통행 방향을 담은 지도. */ function neighbors(map){const /** graph: 물리 다리 기준 타일별 이웃 목록. */ graph=map.tiles.map(/** 각 항목을 새 결과 목록의 값으로 변환한다. */ ()=>[]);/* 타일 인덱스별 다리 이웃. */for(const /** a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ [a,b] of map.bridges){/* 다리 양 끝의 타일 인덱스. */graph[a].push(b);graph[b].push(a);}return graph;}
/** 하나 이상의 출발지에서 모든 타일까지의 최단 다리 수를 계산한다. */
/** 매개변수 설명 · graph: 물리 다리 기준 타일별 이웃 목록; sources: 최단 거리 탐색을 시작할 타일 인덱스 목록. */ function distances(graph,sources){const /** result: 현재 계산 또는 검증 후 반환할 결과. */ result=graph.map(/** 각 항목을 새 결과 목록의 값으로 변환한다. */ ()=>Infinity),/** queue: 너비 우선 탐색 대기열. */ queue=[...sources];/* 최단 거리와 너비 우선 탐색 대기열. */for(const /** source: 탐색을 시작할 타일 인덱스. */ source of sources)result[source]=0;/* 초기 출발 타일. */for(let /** head: 대기열에서 다음에 탐색할 위치. */ head=0;head<queue.length;head++){/* 다음 탐색 위치. */for(const /** next: 탐색할 다음 이웃 타일 인덱스. */ next of graph[queue[head]]){/* 인접 타일 인덱스. */if(result[next]===Infinity){result[next]=result[queue[head]]+1;queue.push(next);}}}return result;}
const /** optionalDefinitions: 추가 타일 번호별 높이·종류·독립 생성 확률. */ optionalDefinitions=Object.fromEntries([...Array.from({/** length: 이동 벡터 또는 다리 중심 간 거리(픽셀). */ length:5},/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · _: 현재 지도 생성·표시·검사 단계에서 사용하는 _ 처리 자료; i: 현재 목록 항목 또는 타일 인덱스. */ (_,i)=>[51+i,{/** height: 번호에 고정된 논리 지형 높이. */ height:1,/** kind: 시작점·일반·풍요·안전·보스 지형 분류. */ kind:'normal',/** probability: 추가 타일 하나의 독립 생성 확률. */ probability:.8}]),...Array.from({/** length: 이동 벡터 또는 다리 중심 간 거리(픽셀). */ length:3},/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · _: 현재 지도 생성·표시·검사 단계에서 사용하는 _ 처리 자료; i: 현재 목록 항목 또는 타일 인덱스. */ (_,i)=>[56+i,{/** height: 번호에 고정된 논리 지형 높이. */ height:2,/** kind: 시작점·일반·풍요·안전·보스 지형 분류. */ kind:'rich',/** probability: 추가 타일 하나의 독립 생성 확률. */ probability:.5}]),[59,{/** height: 번호에 고정된 논리 지형 높이. */ height:3,/** kind: 시작점·일반·풍요·안전·보스 지형 분류. */ kind:'normal',/** probability: 추가 타일 하나의 독립 생성 확률. */ probability:.3}],[60,{/** height: 번호에 고정된 논리 지형 높이. */ height:3,/** kind: 시작점·일반·풍요·안전·보스 지형 분류. */ kind:'rich',/** probability: 추가 타일 하나의 독립 생성 확률. */ probability:.3}]]); // 추가 타일별 독립 생성 확률과 고정 정의.
/** 번호별 높이와 종류를 조회한다. */
/** 매개변수 설명 · id: 번호별 지형 정의를 조회할 고유 타일 번호. */ function definition(id){
  if(optionalDefinitions[id])return optionalDefinitions[id];
  const /** height: 번호에 고정된 논리 지형 높이. */ height=id<=20?1:id<=35?2:id<=45?3:4; // 기본 번호의 높이.
  const /** kind: 시작점·일반·풍요·안전·보스 지형 분류. */ kind=id<=5?'start':[18,19,33,49].includes(id)?'safe':[20,34,35,44,45,50].includes(id)?'boss':(id>=14&&id<=17)||(id>=27&&id<=32)||(id>=39&&id<=43)||(id>=46&&id<=48)?'rich':'normal'; // 기본 번호의 종류.
  return {/** height: 번호에 고정된 논리 지형 높이. */ height,/** kind: 시작점·일반·풍요·안전·보스 지형 분류. */ kind};
}
/** 배치 난수와 독립된 난수로 추가 타일을 한 번씩 추첨한다. */
/** 매개변수 설명 · seed: 같은 지도와 추첨을 재현하는 32비트 시드. */ function selectTiles(seed){const /** random: 배치 또는 추첨 전용 난수 함수. */ random=randomSource(seed);/* 추첨 전용 난수. */return Object.keys(optionalDefinitions).map(Number).filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · id: 번호별 지형 정의를 조회할 고유 타일 번호. */ id=>random()<optionalDefinitions[id].probability);}
/** 생성 결과를 독립적으로 검사하며 하나라도 위반하면 예외를 발생시킨다. */
/** 매개변수 설명 · map: 타일과 물리 다리 및 통행 방향을 담은 지도. */ function validate(map){
  const /** tiles: 물리적 지도에 존재하는 전체 타일 목록. */ tiles=map.tiles,/** graph: 물리 다리 기준 타일별 이웃 목록. */ graph=neighbors(map),/** counts: 높이 경계별 다리 수 또는 추가 타일 수. */ counts=[0,0,0],/** seen: 중복 다리 또는 방문 항목을 기록하는 집합. */ seen=new Set(); // 검증할 타일, 이웃, 높이 경계별 다리 수, 중복 다리 집합.
  /** 매개변수 설명 · condition: 만족해야 하는 규칙 조건; message: 위반 시 반환할 구체적인 규칙 설명. */ function requireRule(condition,message){if(!condition)throw Error(message);} // 실패한 규칙을 구체적으로 보고한다.
  const /** selected: 한 번 독립 추첨해 고정한 추가 타일 번호. */ selected=selectTiles(map.seed),/** expected: 검사에서 요구하는 번호 집합 또는 지형 정의. */ expected=[...Array.from({/** length: 이동 벡터 또는 다리 중심 간 거리(픽셀). */ length:50},/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · _: 현재 지도 생성·표시·검사 단계에서 사용하는 _ 처리 자료; i: 현재 목록 항목 또는 타일 인덱스. */ (_,i)=>i+1),...selected]; // 추첨 결과에 따른 정확한 전체 번호 목록.
  requireRule(JSON.stringify(map.selectedOptional)===JSON.stringify(selected),'독립 추첨 결과');
  requireRule(tiles.length===expected.length,'타일 수');
  requireRule(new Set(tiles.map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · t: 현재 처리 중인 타일 데이터. */ t=>t.id)).size===expected.length&&expected.every(/** 전체 항목이 검증 조건을 만족하는지 판정한다 · id: 번호별 지형 정의를 조회할 고유 타일 번호. */ id=>tiles.some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · t: 현재 처리 중인 타일 데이터. */ t=>t.id===id)),'고유 번호');
  requireRule(new Set(tiles.map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · t: 현재 처리 중인 타일 데이터. */ t=>`${t.q},${t.r}`)).size===tiles.length,'슬롯 중복');
  for(const /** index: 현재 목록에서 처리하는 위치; tile: 현재 배치·표시·검증할 타일 데이터. */ [index,tile] of tiles.entries()){ // 검사 중인 타일 인덱스와 데이터.
    const /** expected: 검사에서 요구하는 번호 집합 또는 지형 정의. */ expected=definition(tile.id); // 번호로 결정되는 올바른 정의.
    requireRule(tile.height===expected.height&&tile.kind===expected.kind,'번호별 정의');
    requireRule(Number.isInteger(tile.q)&&Number.isInteger(tile.r),'격자 정렬');
    requireRule(graph[index].length>=(tile.height===1?2:1)&&graph[index].length<=4,'다리 차수');
    requireRule(graph[index].some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · n: 현재 후보 번호 또는 이웃 타일 인덱스. */ n=>tiles[n].height===tile.height),'동일 높이 연결');
    if(tile.height===1)requireRule(tiles.filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · other: 교환 대상 위치 또는 비교할 다른 타일. */ other=>adjacent(tile,other)).length>=2,'높이 1 최소 두 면 인접');
    if(tile.kind==='start'){
      requireRule(directions.some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · q: 육각형 격자의 첫 축 정수 좌표; r: 육각형 격자의 둘째 축 정수 좌표. */ ([q,r])=>!tiles.some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · t: 현재 처리 중인 타일 데이터. */ t=>t.q===tile.q+q&&t.r===tile.r+r)),'외곽 시작점');
      requireRule(graph[index].every(/** 전체 항목이 검증 조건을 만족하는지 판정한다 · n: 현재 후보 번호 또는 이웃 타일 인덱스. */ n=>tiles[n].height===1&&['normal','rich'].includes(tiles[n].kind)),'시작점 직접 연결');
      const /** distance: 시작점부터 타일까지의 최단 다리 수. */ distance=distances(graph,[index]); // 해당 시작점의 최단 경로.
      requireRule(tiles.every(/** 전체 항목이 검증 조건을 만족하는지 판정한다 · t: 현재 처리 중인 타일 데이터; n: 현재 후보 번호 또는 이웃 타일 인덱스. */ (t,n)=>n===index||t.kind!=='start'||distance[n]>=2),'시작점 간 거리');
      requireRule(tiles.every(/** 전체 항목이 검증 조건을 만족하는지 판정한다 · t: 현재 처리 중인 타일 데이터; n: 현재 후보 번호 또는 이웃 타일 인덱스. */ (t,n)=>!['safe','boss'].includes(t.kind)||distance[n]>=3),'시작점 보호 거리');
    }
  }
  for(const /** a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ [a,b] of map.bridges){ // 검증할 다리의 두 끝점.
    const /** key: 높이별 수량 조합 또는 중복 다리 식별자. */ key=[a,b].sort(/** 검증·배정에 필요한 순서로 두 값을 비교한다 · x: 필드의 가로 좌표(픽셀); y: 필드의 세로 좌표(픽셀). */ (x,y)=>x-y).join(','); // 방향을 제거한 다리 식별자.
    requireRule(!seen.has(key),'다리 중복');seen.add(key);
    requireRule(adjacent(tiles[a],tiles[b]),'비인접 다리');
    requireRule(Math.abs(tiles[a].height-tiles[b].height)<=1,'높이 차이');
    if(tiles[a].height!==tiles[b].height)counts[Math.min(tiles[a].height,tiles[b].height)-1]++;
  }
  requireRule(counts[0]>=3&&counts[0]<=7&&counts[1]>=2&&counts[1]<=5&&counts[2]>=2&&counts[2]<=3,'높이별 다리 개수');
  for(let /** height: 번호에 고정된 논리 지형 높이. */ height=1;height<=3;height++){ // 필수 보스 출발 연결의 낮은 높이.
    requireRule(map.bridges.some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ ([a,b])=>[ [a,b],[b,a] ].some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · low: 다리의 낮은 높이 끝점; high: 다리의 높은 높이 끝점. */ ([low,high])=>tiles[low].height===height&&tiles[high].height===height+1&&tiles[low].kind==='boss'&&tiles[high].kind!=='boss')),'보스 출발 연결');
  }
  requireRule(distances(graph,[0]).every(Number.isFinite),'전체 연결');
  const /** componentSizes: 실제 다리에서 재계산한 높이별 묶음 크기. */ componentSizes={},/** componentExits: 묶음별 위·아래 물리 연결의 검증 기록. */ componentExits=[]; // 같은 높이의 실제 다리로 다시 계산한 묶음 크기.
  for(let /** height: 번호에 고정된 논리 지형 높이. */ height=1;height<=4;height++){ // 묶음을 검사할 높이.
    const /** unseen: 같은 높이 묶음 탐색의 미방문 타일 집합. */ unseen=new Set(tiles.flatMap(/** 높이·종류별 타일 인덱스 목록을 만든다 · t: 현재 처리 중인 타일 데이터; i: 현재 목록 항목 또는 타일 인덱스. */ (t,i)=>t.height===height?[i]:[])),/** sizes: 같은 높이의 실제 연결 묶음별 타일 수. */ sizes=[]; // 미방문 타일과 각 묶음의 크기.
    while(unseen.size){const /** first: 새 연결 묶음의 첫 타일 인덱스. */ first=unseen.values().next().value,/** queue: 너비 우선 탐색 대기열. */ queue=[first];/* 새 묶음의 출발점과 탐색 대기열. */unseen.delete(first);for(let /** head: 대기열에서 다음에 탐색할 위치. */ head=0;head<queue.length;head++){/* 너비 우선 탐색 위치. */for(const /** next: 탐색할 다음 이웃 타일 인덱스. */ next of graph[queue[head]]){/* 같은 높이의 다음 타일. */if(unseen.has(next)){unseen.delete(next);queue.push(next);}}}sizes.push(queue.length);if(height===1)requireRule(queue.some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · i: 현재 목록 항목 또는 타일 인덱스. */ i=>tiles[i].kind==='start'),'높이 1 묶음의 시작점 누락');
      const /** upward: 현재 묶음에서 한 높이 위로 이어지는 물리 다리 수. */ upward=queue.reduce(/** 타일 또는 다리 수치를 누적 집계한다 · total: 현재 누적 집계값; i: 현재 목록 항목 또는 타일 인덱스. */ (total,i)=>total+graph[i].filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · n: 현재 후보 번호 또는 이웃 타일 인덱스. */ n=>tiles[n].height===height+1).length,0),/** downward: 현재 묶음에서 한 높이 아래로 이어지는 물리 다리 수. */ downward=queue.reduce(/** 타일 또는 다리 수치를 누적 집계한다 · total: 현재 누적 집계값; i: 현재 목록 항목 또는 타일 인덱스. */ (total,i)=>total+graph[i].filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · n: 현재 후보 번호 또는 이웃 타일 인덱스. */ n=>tiles[n].height===height-1).length,0); // 실제 묶음의 한 높이 위·아래 다리 수.
      if(height<=3)requireRule(upward>=1,'연결 묶음의 위쪽 다리 누락');if(height>=2)requireRule(downward>=1,'연결 묶음의 아래쪽 다리 누락');componentExits.push({/** height: 번호에 고정된 논리 지형 높이. */ height,/** tiles: 물리적 지도에 존재하는 전체 타일 목록. */ tiles:queue.map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · i: 현재 목록 항목 또는 타일 인덱스. */ i=>tiles[i].id),/** upward: 현재 묶음에서 한 높이 위로 이어지는 물리 다리 수. */ upward,/** downward: 현재 묶음에서 한 높이 아래로 이어지는 물리 다리 수. */ downward});}
    componentSizes[height]=sizes;
    if(height<=2)requireRule(sizes.every(/** 전체 항목이 검증 조건을 만족하는지 판정한다 · n: 현재 후보 번호 또는 이웃 타일 인덱스. */ n=>n>=4&&n<=(height===1?8:6)),'같은 높이 묶음 크기');
  }
  const /** radialMeans: 높이별 평균 중심 거리. */ radialMeans=[1,2,3,4].map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · height: 번호에 고정된 논리 지형 높이. */ height=>{const /** group: 같은 높이의 비교 대상 타일 묶음. */ group=tiles.filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · t: 현재 처리 중인 타일 데이터. */ t=>t.height===height);/* 해당 높이 타일. */return group.reduce(/** 타일 또는 다리 수치를 누적 집계한다 · total: 현재 누적 집계값; t: 현재 처리 중인 타일 데이터. */ (total,t)=>total+Math.max(Math.abs(t.q),Math.abs(t.r),Math.abs(t.q+t.r)),0)/group.length;}); // 높이별 평균 격자 반지름.
  requireRule(radialMeans.slice(0,3).every(/** 전체 항목이 검증 조건을 만족하는지 판정한다 · value: 비트 혼합 또는 현재 계산 중간값; i: 현재 목록 항목 또는 타일 인덱스. */ (value,i)=>value>radialMeans[i+1]),'중앙·외곽 배치');
  requireRule(JSON.stringify([...(map.movementArcs||[])].map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표. */ a=>a.join(',')).sort())===JSON.stringify(movementArcs(map).map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표. */ a=>a.join(',')).sort()),'이동 방향: 3→2만 금지');
  return {/** valid: 모든 요구 규칙의 통과 여부. */ valid:true,/** physicalConnectivity: 물리적 단일 연결망 검증 통과 여부. */ physicalConnectivity:true,/** roundTripRequired: 왕복 가능성을 별도 요구하는지 나타내는 설정. */ roundTripRequired:false,/** tileCount: 추첨 결과를 포함한 전체 타일 수. */ tileCount:tiles.length,/** bridgeCount: 물리적 다리의 전체 개수. */ bridgeCount:map.bridges.length,/** transitionCounts: 높이 경계 1↔2·2↔3·3↔4의 다리 수. */ transitionCounts:counts,/** componentSizes: 실제 다리에서 재계산한 높이별 묶음 크기. */ componentSizes,/** componentExits: 묶음별 위·아래 물리 연결의 검증 기록. */ componentExits};
}
/** 물리적 다리에서 3→2만 제외하여 실제 통행 방향을 계산한다. */
/** 매개변수 설명 · map: 타일과 물리 다리 및 통행 방향을 담은 지도. */ function movementArcs(map){const /** arcs: 실제 통행 가능한 방향별 타일 인덱스 쌍. */ arcs=[];/* 실제 이동 가능한 방향 간선 목록. */for(const /** a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ [a,b] of map.bridges){/* 다리 양 끝의 타일 인덱스. */if(!(map.tiles[a].height===3&&map.tiles[b].height===2))arcs.push([a,b]);if(!(map.tiles[b].height===3&&map.tiles[a].height===2))arcs.push([b,a]);}return arcs;}
/** 확정한 추첨 수량의 구조에 번호를 배정하고 격자를 변형해 새 게임 맵을 만든다. */
/** 매개변수 설명 · seed: 같은 지도와 추첨을 재현하는 32비트 시드. */ function generate(seed){
  const /** selected: 한 번 독립 추첨해 고정한 추가 타일 번호. */ selected=selectTiles(seed),/** counts: 높이 경계별 다리 수 또는 추가 타일 수. */ counts=[1,2,3].map(/** 각 항목을 새 결과 목록의 값으로 변환한다 · height: 번호에 고정된 논리 지형 높이. */ height=>selected.filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · id: 번호별 지형 정의를 조회할 고유 타일 번호. */ id=>definition(id).height===height).length),/** key: 높이별 수량 조합 또는 중복 다리 식별자. */ key=counts.join(','); // 추첨된 번호와 높이별 개수.
  if(!layoutBank[key])throw Error('해당 수량의 배치가 준비되지 않았습니다.');
  const /** map: 타일과 물리 다리 및 통행 방향을 담은 지도. */ map=JSON.parse(JSON.stringify(layoutBank[key])),/** random: 배치 또는 추첨 전용 난수 함수. */ random=randomSource(seed^0xA5A5A5A5),/** ids: 이번 게임에 존재하는 고유 번호 목록. */ ids=[...Array.from({/** length: 이동 벡터 또는 다리 중심 간 거리(픽셀). */ length:50},/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · _: 현재 지도 생성·표시·검사 단계에서 사용하는 _ 처리 자료; i: 현재 목록 항목 또는 타일 인덱스. */ (_,i)=>i+1),...selected]; // 원본을 보존한 게임 맵·배치 난수·전체 번호.
  for(let /** height: 번호에 고정된 논리 지형 높이. */ height=1;height<=4;height++){ // 높이별 종류와 고유 번호 배정.
    const /** neutral: 일반·풍요 종류를 배정하기 전 중립 슬롯. */ neutral=shuffled(map.tiles.flatMap(/** 높이·종류별 타일 인덱스 목록을 만든다 · t: 현재 처리 중인 타일 데이터; i: 현재 목록 항목 또는 타일 인덱스. */ (t,i)=>t.height===height&&t.kind==='normal'?[i]:[]),random),/** richIds: 해당 높이에 필요한 풍요필드 번호. */ richIds=ids.filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · id: 번호별 지형 정의를 조회할 고유 타일 번호. */ id=>definition(id).height===height&&definition(id).kind==='rich'); // 일반·풍요필드의 배정 대상.
    neutral.slice(0,richIds.length).forEach(/** 해당 슬롯의 종류 또는 번호를 배정한다 · i: 현재 목록 항목 또는 타일 인덱스. */ i=>map.tiles[i].kind='rich');
    for(const /** kind: 시작점·일반·풍요·안전·보스 지형 분류. */ kind of ['start','normal','rich','safe','boss']){ // 같은 종류의 번호만 무작위 배정.
      const /** matches: 현재 높이와 종류에 맞는 타일 슬롯. */ matches=map.tiles.filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · t: 현재 처리 중인 타일 데이터. */ t=>t.height===height&&t.kind===kind),/** numbers: 현재 종류 슬롯에 배정할 고유 번호. */ numbers=shuffled(ids.filter(/** 조건을 만족하는 지형 또는 번호만 선택한다 · id: 번호별 지형 정의를 조회할 고유 타일 번호. */ id=>definition(id).height===height&&definition(id).kind===kind),random); // 슬롯과 대응 번호.
      if(matches.length!==numbers.length)throw Error('번호별 종류 개수 불일치');matches.forEach(/** 해당 슬롯의 종류 또는 번호를 배정한다 · tile: 현재 배치·표시·검증할 타일 데이터; i: 현재 목록 항목 또는 타일 인덱스. */ (tile,i)=>tile.id=numbers[i]);
    }
  }
  const /** rotation: 지도 전체에 적용할 60도 회전 횟수. */ rotation=Math.floor(random()*6),/** reflected: 격자 반사 적용 여부. */ reflected=random()<.5; // 육각 격자를 보존하는 회전과 반사.
  for(const /** tile: 현재 배치·표시·검증할 타일 데이터. */ tile of map.tiles){let /** q: 육각형 격자의 첫 축 정수 좌표. */ q=tile.q,/** r: 육각형 격자의 둘째 축 정수 좌표. */ r=tile.r;/* 변환할 축 좌표. */if(reflected)[q,r]=[r,q];for(let /** step: 경로 검사 또는 60도 회전의 진행 횟수. */ step=0;step<rotation;step++){/* 60도 회전 횟수. */[q,r]=[-r,q+r];}tile.q=q===0?0:q;tile.r=r===0?0:r;}
  map.seed=seed>>>0;map.version='pit-4.0';map.selectedOptional=selected;map.transform={/** rotation: 지도 전체에 적용할 60도 회전 횟수. */ rotation,/** reflected: 격자 반사 적용 여부. */ reflected};map.movementArcs=movementArcs(map);map.validation=validate(map);return map;
}
if(typeof module!=='undefined')module.exports={generate,validate,selectTiles,definition,adjacent};
