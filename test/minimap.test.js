import { /** test: 검증 등록. */ test } from 'node:test';
import /** assert: 기대 결과 비교. */ assert from 'node:assert/strict';
import /** vm: 표시 코드 격리 문맥. */ vm from 'node:vm';
import { /** readFileSync: 실제 소스 조회. */ readFileSync } from 'node:fs';
/** 캔버스 호출을 기록하는 미니맵을 준비한다. */
function setup(){
 const /** calls: 그리기 동작 기록. */ calls=[];
 const /** ctx: 캔버스 문맥 대역. */ ctx=new Proxy({},{/** 요청한 캔버스 동작을 기록한다. */ get(/** target: 문맥 속성. */ target,/** key: API 이름. */ key){return target[key]??((/** args: 그리기 인자. */ ...args)=>calls.push([key,...args]));},/** 색상·합성 설정도 기록한다. */ set(/** target: 속성 보관 객체. */ target,/** key: 속성 이름. */ key,/** value: 새 속성값. */ value){target[key]=value;calls.push(['set',key,value]);return true;}});
 const /** canvas: 화면 캔버스. */ canvas={width:256,height:256,getContext:/** 기록 문맥을 반환한다. */ ()=>ctx};
 const /** context: 독립 브라우저 문맥. */ context=vm.createContext({document:{createElement:/** 지도 캐시 캔버스를 생성한다. */ ()=>({...canvas})},canvas});
 for(const /** file: 검증할 스크립트. */ file of ['pit-map-rules.js','minimap.js'])vm.runInContext(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),context);
 return {model:vm.runInContext('new MiniMap(canvas)',context),calls};
}
const /** map: 표시용 지도. */ map={id:'test',tileRadius:600,landScale:1,bridgeWidth:500,tiles:[{id:1,q:0,r:0,height:1}],bridges:[]};
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
