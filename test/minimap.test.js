import { /** test: 검증 등록. */ test } from 'node:test';
import /** assert: 기대 결과 비교. */ assert from 'node:assert/strict';
import /** vm: 표시 코드 격리 문맥. */ vm from 'node:vm';
import { /** readFileSync: 실제 소스 조회. */ readFileSync } from 'node:fs';
/** 캔버스 호출을 기록하는 미니맵을 준비한다. */
function setup(/** readAlpha: 특정 픽셀이 실제 탐색됐는지 반환하는 캔버스 대역. */ readAlpha=/** 기본 마스크는 공개된 픽셀로 가정한다. */ ()=>255){
 const /** calls: 그리기 동작 기록. */ calls=[];
 const /** ctx: 캔버스 문맥 대역. */ ctx=new Proxy({/** 탐색 마스크 한 픽셀 읽기를 재현한다. */ getImageData(/** x: 읽을 가로 픽셀. */ x,/** y: 읽을 세로 픽셀. */ y){calls.push(['readPixel',x,y]);return {data:[0,0,0,readAlpha(x,y)]};}},{/** 요청한 캔버스 동작을 기록한다. */ get(/** target: 문맥 속성. */ target,/** key: API 이름. */ key){return target[key]??((/** args: 그리기 인자. */ ...args)=>calls.push([key,...args]));},/** 색상·합성 설정도 기록한다. */ set(/** target: 속성 보관 객체. */ target,/** key: 속성 이름. */ key,/** value: 새 속성값. */ value){target[key]=value;calls.push(['set',key,value]);return true;}});
 const /** canvas: 화면 캔버스. */ canvas={width:256,height:256,getContext:/** 기록 문맥을 반환한다. */ ()=>ctx};
 const /** context: 독립 브라우저 문맥. */ context=vm.createContext({document:{createElement:/** 지도 캐시 캔버스를 생성한다. */ ()=>({...canvas})},canvas});
 for(const /** file: 검증할 스크립트. */ file of ['pit-map-rules.js','minimap.js'])vm.runInContext(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),context);
 return {model:vm.runInContext('new MiniMap(canvas)',context),calls};
}
const /** map: 표시용 지도. */ map={id:'test',tileRadius:600,landScale:1,bridgeWidth:500,tiles:[{id:1,q:0,r:0,height:1}],bridges:[]};
test('tile numbers follow exploration, map hack, pan and expanded-map bounds',/** 일반·맵핵 표시와 해제 복원 및 화면 밖 번호 생략을 검증한다. */ ()=>{
 const /** model: 지도 모델; calls: 캔버스 호출 기록. */ {model,calls}=setup(/** 미탐색 마스크를 재현한다. */ ()=>0);
 const /** canvas: 확대 지도 표시 대상. */ canvas={width:1024,height:640,getContext:/** 기존 기록 문맥을 반환한다. */ ()=>model.canvas.getContext('2d')};
 model.draw(map,'ROOM',{x:0,y:0},684,canvas,true);
 assert.equal(calls.some(/** 번호 표시 호출을 찾는다. */ (/** call: 그리기 호출. */ call)=>call[0]==='fillText'),false);
 calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,canvas,true,{x:100,y:0},true);
 const /** label: 맵핵으로 표시한 고유 번호와 화면 좌표. */ label=calls.find(/** 번호 표시 호출을 찾는다. */ (/** call: 그리기 호출. */ call)=>call[0]==='fillText');
 assert.equal(label[1],'1');assert.ok(Math.abs(label[2]-(512-100*1024/1710))<1e-7);assert.equal(label[3],320);
 calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,canvas,true,{x:0,y:0},false);
 assert.equal(calls.some(/** 맵핵 해제 후 미탐색 번호가 숨는지 검사한다. */ (/** call: 그리기 호출. */ call)=>call[0]==='fillText'),false);
 calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,canvas,true,{x:10000,y:0},true);
 assert.equal(calls.some(/** 화면 밖 번호 호출을 찾는다. */ (/** call: 그리기 호출. */ call)=>call[0]==='fillText'),false);
 const /** explored: 탐색을 완료한 지도 대역. */ explored=setup();
 explored.model.draw(map,'ROOM',{x:0,y:0},684,explored.model.canvas,true);
 assert.ok(explored.calls.some(/** 일반 모드에서도 탐색된 번호가 표시되는지 검사한다. */ (/** call: 그리기 호출. */ call)=>call[0]==='fillText'&&call[1]==='1'));
 calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,model.canvas,false,{x:0,y:0},true);
 assert.equal(calls.some(/** 작은 미니맵에는 번호가 없는지 검사한다. */ (/** call: 그리기 호출. */ call)=>call[0]==='fillText'),false);
});
test('minimap reveals radius 250, retains exploration and centers marker while moving',/** 공개 반경·누적 경로·화면 중심 표시를 검사한다. */ ()=>{
 const /** model: 미니맵; calls: 표시 호출. */ {model,calls}=setup();model.draw(map,'ROOM',{x:0,y:0,facing:0});
 assert.ok(calls.some(/** 반경 250의 공개 원인지 확인한다. */ (/** call: 그리기 기록. */ call)=>call[0]==='arc'&&call[1]===0&&call[2]===0&&call[3]===250));
 const /** fog: 첫 탐색 마스크. */ fog=model.fog;calls.length=0;model.draw(map,'ROOM',{x:100,y:0,facing:1});
 assert.equal(model.fog,fog);assert.ok(calls.some(/** 이동 경로가 연결됐는지 검사한다. */ (/** call: 그리기 기록. */ call)=>call[0]==='lineTo'&&call[1]===100&&call[2]===0));
 assert.ok(calls.some(/** 위치 표식이 중앙인지 검사한다. */ (/** call: 그리기 기록. */ call)=>call[0]==='translate'&&call[1]===128&&call[2]===128));
 assert.ok(calls.some(/** 마스크가 표시와 합성됐는지 검사한다. */ (/** call: 그리기 기록. */ call)=>call[0]==='drawImage'&&call[1]===fog));
});
test('teleport avoids revealing intermediate path; room change resets and bounds cache size',/** 순간이동 경로의 잘못된 공개와 다른 방의 탐색 공유를 방지한다. */ ()=>{
 const /** model: 미니맵; calls: 표시 기록. */ {model,calls}=setup();model.draw(map,'ONE',{x:0,y:0});calls.length=0;model.draw(map,'ONE',{x:1000,y:0});
 assert.equal(calls.some(/** 중간 이동 선분을 확인한다. */ (/** call: 호출. */ call)=>call[0]==='lineTo'&&call[1]===1000),false);
 const /** fog: 이전 방 마스크. */ fog=model.fog;model.draw(map,'TWO',{x:0,y:0});assert.notEqual(model.fog,fog);assert.ok(model.fog.width<=2048&&model.fog.height<=2048);model.clear();assert.equal(model.fog,null);
});


test('minimap spans 2.5 times main-view width and uses gray fog with white bridges',/** 축척·미탐색 배경·다리 색상의 표시 규칙을 검증한다. */ ()=>{
 const /** model: 표시 모델; calls: 캔버스 호출. */ {model,calls}=setup();
 model.draw(map,'ROOM',{x:0,y:0},684);
 const /** image: 첫 지형 캐시 표시 호출. */ image=calls.find(/** 지형 이미지 호출을 선택한다. */ (/** call: 그리기 기록. */ call)=>call[0]==='drawImage'&&call[1]===model.terrain);
 assert.ok(Math.abs(image[4]/model.terrain.width*model.atlasScale-256/1710)<1e-8);
 assert.ok(calls.some(/** 미탐색 배경색을 검사한다. */ (/** call: 설정 기록. */ call)=>call[0]==='set'&&call[1]==='fillStyle'&&call[2]==='#A7A3B0'));
 assert.ok(calls.some(/** 다리 선 색상을 검사한다. */ (/** call: 설정 기록. */ call)=>call[0]==='set'&&call[1]==='strokeStyle'&&call[2]==='#ffffff'));
});


test('expanded map uses rectangular bounds and keeps player at rectangular center',/** 확대 지도의 사각형 클리핑과 중앙 위치를 검사한다. */ ()=>{
 const /** model: 지도 모델; calls: 표시 호출. */ {model,calls}=setup();
 const /** canvas: 가로가 긴 확대 캔버스. */ canvas={width:1024,height:640,getContext:/** 기존 기록 문맥을 사용한다. */ ()=>model.canvas.getContext('2d')};
 model.draw(map,'ROOM',{x:0,y:0},684,canvas,true);
 assert.ok(calls.some(/** 사각형 경계를 확인한다. */ (/** call: 기록. */ call)=>call[0]==='rect'&&call[1]===3&&call[2]===3&&call[3]===1018&&call[4]===634));
 assert.ok(calls.some(/** 직사각형 중앙의 표식을 확인한다. */ (/** call: 기록. */ call)=>call[0]==='translate'&&call[1]===512&&call[2]===320));
});

test('panning shifts terrain and player marker but never exploration center',/** 지도 드래그가 이동·탐색 좌표를 바꾸지 않음을 검증한다. */ ()=>{
 const /** model: 지도 모델; calls: 기록. */ {model,calls}=setup();
 const /** canvas: 전체맵 표시 대상. */ canvas={width:1024,height:640,getContext:/** 검증 문맥을 반환한다. */ ()=>model.canvas.getContext('2d')};
 model.draw(map,'ROOM',{x:0,y:0},684*10/2.5,canvas,true,{x:684,y:0});
 assert.equal(model.previous.x,0);assert.equal(model.previous.y,0);
 assert.ok(calls.some(/** 실제 플레이어 표식의 이동을 확인한다. */ (/** call: 호출 기록. */ call)=>call[0]==='translate'&&Math.abs(call[1]-(512-102.4))<1e-7&&call[2]===320));
});


test('map hack bypasses fog only on expanded map and never overwrites exploration',/** 맵핵 해제 복원과 우측 미니맵 마스크 유지 여부를 검증한다. */ ()=>{
 const /** model: 지도 모델; calls: 캔버스 호출 기록. */ {model,calls}=setup();model.draw(map,'ROOM',{x:0,y:0});
 const /** fog: 실제 탐색 마스크; canvas: 전체맵 캔버스. */ fog=model.fog,canvas={width:1024,height:640,getContext:/** 기록 문맥을 반환한다. */ ()=>model.canvas.getContext('2d')};
 calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,canvas,true,{x:0,y:0},true);
 assert.equal(model.fog,fog);assert.equal(calls.some(/** 마스크가 합성됐는지 확인한다. */ (/** call: 기록. */ call)=>call[0]==='drawImage'&&call[1]===fog),false);
 calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,canvas,true,{x:0,y:0},false);
 assert.equal(model.fog,fog);assert.equal(calls.some(/** 해제 후 마스크 복원 확인. */ (/** call: 기록. */ call)=>call[0]==='drawImage'&&call[1]===fog),true);
 calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,model.canvas,false,{x:0,y:0},true);
 assert.equal(calls.some(/** 미니맵은 항상 탐색 마스크를 사용하는지 확인한다. */ (/** call: 기록. */ call)=>call[0]==='drawImage'&&call[1]===fog),true);
});


test('sky-blue lamp markers share exploration, pan and disappearance rules on both maps',/** 생존·탐색 조건과 최신 서버 목록 제거를 양쪽 지도에서 검증한다. */ ()=>{
 const /** model: 지도 모델; calls: 그리기 호출. */ {model,calls}=setup();
 const /** lamp: 탐색한 귀환등; dead: 파괴된 귀환등; empty: 체력 0 개체; npc: 다른 분류 개체. */ lamp={id:'lamp',x:100,y:0,interactionEnabled:false,status:{objectType:'prop',classificationCode:'OBJ0001',state:'alive',currentHealth:50}},dead={...lamp,id:'dead',status:{...lamp.status,state:'dead'}},empty={...lamp,id:'empty',status:{...lamp.status,currentHealth:0}},npc={...lamp,id:'npc',status:{...lamp.status,objectType:'npc'}};
 const /** expanded: 전체맵 캔버스. */ expanded={width:1024,height:640,getContext:/** 기록 문맥 사용. */ ()=>model.canvas.getContext('2d')};
 for(const /** rectangular: 전체맵 여부. */ rectangular of [false,true]){
  calls.length=0;
  const /** canvas: 현재 표시 캔버스; pan: 드래그한 중심 거리; scale: 예상 월드 배율. */ canvas=rectangular?expanded:model.canvas,pan={x:rectangular?50:0,y:20},scale=canvas.width/(684*2.5);
  model.draw(map,'ROOM',{x:0,y:0},684,canvas,rectangular,pan,true,[lamp,dead,empty,npc]);
  const /** markers: 귀환등 전용 반지름 표시. */ markers=calls.filter(/** 귀환등 원만 고른다. */ (/** call: 기록. */ call)=>call[0]==='arc'&&call[3]===4.5);
  assert.equal(markers.length,1);assert.ok(Math.abs(markers[0][1]-(canvas.width/2+(100-pan.x)*scale))<1e-7);assert.ok(Math.abs(markers[0][2]-(canvas.height/2-pan.y*scale))<1e-7);
  assert.ok(calls.some(/** 하늘색 지정 검증. */ (/** call: 기록. */ call)=>call[0]==='set'&&call[1]==='fillStyle'&&call[2]==='#87CEEB'));
  assert.ok(calls.findIndex(/** 클리핑 위치 조회. */ (/** call: 기록. */ call)=>call[0]==='clip')<calls.indexOf(markers[0]));
  assert.ok(calls.some(/** 월드 좌표를 탐색 마스크 픽셀로 바꾸는지 검증. */ (/** call: 기록. */ call)=>call[0]==='readPixel'&&call[1]===Math.floor((100-model.left)*model.atlasScale)&&call[2]===Math.floor(-model.top*model.atlasScale)));
  calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,canvas,rectangular,pan,true,[]);
  assert.equal(calls.some(/** 제거된 개체의 잔상 검사. */ (/** call: 기록. */ call)=>call[0]==='arc'&&call[3]===4.5),false);
 }
});
test('unexplored lamps stay hidden even with map hack and out-of-atlas coordinates are rejected',/** 맵핵 지형 공개와 귀환등 탐색 조건이 독립적인지 확인한다. */ ()=>{
 const /** model: 미탐색 마스크 지도; calls: 그리기 호출. */ {model,calls}=setup(/** 미탐색 픽셀을 재현한다. */ ()=>0);
 const /** lamp: 서버가 알려준 미탐색 위치의 생존 사물. */ lamp={x:100,y:0,status:{objectType:'prop',classificationCode:'OBJ0001',state:'alive',currentHealth:50}};
 for(const /** rectangular: 두 지도 표시 여부. */ rectangular of [false,true]){calls.length=0;model.draw(map,'ROOM',{x:0,y:0},684,model.canvas,rectangular,{x:0,y:0},true,[lamp]);assert.equal(calls.some(/** 귀환등 원 검증. */ (/** call: 기록. */ call)=>call[0]==='arc'&&call[3]===4.5),false);}
 assert.equal(model.isExplored({x:-100000,y:0}),false);model.clear();assert.equal(model.isExplored(lamp),false);
});
