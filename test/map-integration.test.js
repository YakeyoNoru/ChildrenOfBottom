import { /** test: 맵 통합 검증 등록 함수. */ test } from 'node:test';
import /** assert: 기대 결과 검사. */ assert from 'node:assert/strict';
import { /** generateRoomMap: 기존 생성 규칙으로 지도 생성. */ generateRoomMap } from '../game/map-generator.js';
import '../public/pit-map-rules.js';
import '../public/movement.js';

/** 테스트에서 사용할 이동 가능한 기본 개체를 만든다. */
function actor(/** x: 가로 위치. */ x,/** y: 세로 위치. */ y) {return {x,y,facing:0,status:{moveSpeed:2,bonusMoveSpeed:0,hitboxDiameter:24,state:'alive'}};}

test('existing generation remains deterministic and all five numbered starts are walkable',/** 원본 생성 재현성과 1~5번 시작점의 유효성을 검증한다. */ ()=>{
 for(const /** seed: 검증용 서로 다른 지도 시드. */ seed of [29,56791,20261030,1,2,3]) {
  const /** map: 서버가 생성한 지도. */ map=generateRoomMap(seed);
  assert.equal(map.validation.valid,true);assert.deepEqual(map,generateRoomMap(seed));
  for(let /** id: 플레이어 번호에 대응할 시작 타일 번호. */ id=1;id<=5;id++) {
   const /** tile: 번호로 조회한 타일. */ tile=map.tiles.find(/** 번호를 비교한다. */ (/** candidate: 지형 후보. */ candidate)=>candidate.id===id);
   const /** center: 시작 타일 월드 중심. */ center=globalThis.PitMapRules.center(tile,map);
   assert.equal(globalThis.PitMapRules.walkable(map,center.x,center.y,12),true);
  }
 }
});

test('unconnected adjacent tiles have a blocked gap and rolls cannot tunnel through it',/** 끝점만 유효한 긴 이동도 빈 공간을 넘어갈 수 없음을 검증한다. */ ()=>{
 const /** map: 타일 두 개가 이웃하지만 다리는 없는 지도. */ map={tileRadius:90,landScale:.89,bridgeWidth:48,tiles:[{id:1,q:0,r:0,height:1},{id:2,q:1,r:0,height:1}],bridges:[]};
 const /** start: 첫 지형 중심. */ start=actor(0,0);
 const /** end: 둘째 지형 중심. */ end=globalThis.PitMapRules.center(map.tiles[1],map);
 const /** allowed: 빠른 강제 이동을 시도한 결과. */ allowed=globalThis.PitMapRules.constrain(map,start,end,12,false);
 assert.ok(Math.hypot(allowed.x,allowed.y)<80);assert.equal(globalThis.PitMapRules.walkable(map,allowed.x,allowed.y,12),true);
 start.roll={angle:Math.atan2(end.y,end.x),speed:10000,remaining:200};
 const /** rolled: 한 스텝이 타일 전체를 넘을 정도로 빠른 구르기 결과. */ rolled=globalThis.MovementRules.step(start,{x:1,y:0},start.status,map);
 assert.ok(Math.hypot(rolled.x,rolled.y)<80);
});

test('bridges allow continuous terrain movement and preserve 2-to-3-only direction',/** 연결된 다리 통행과 역방향 차단을 검증한다. */ ()=>{
 const /** map: 높이 2와 3을 잇는 단일 다리 지도. */ map={tileRadius:90,landScale:.89,bridgeWidth:48,tiles:[{id:1,q:0,r:0,height:2},{id:2,q:1,r:0,height:3}],bridges:[[0,1]]};
 const /** low: 낮은 타일 중심. */ low=globalThis.PitMapRules.center(map.tiles[0],map);
 const /** high: 높은 타일 중심. */ high=globalThis.PitMapRules.center(map.tiles[1],map);
 const /** upward: 허용 방향으로 이동한 위치. */ upward=globalThis.PitMapRules.constrain(map,low,high,12,false);
 assert.ok(Math.hypot(upward.x-high.x,upward.y-high.y)<1e-6);
 const /** downward: 금지 방향 이동 결과. */ downward=globalThis.PitMapRules.constrain(map,high,low,12,false);
 assert.ok(Math.hypot(downward.x-low.x,downward.y-low.y)>60);
 assert.equal(globalThis.PitMapRules.walkable(map,(low.x+high.x)/2,(low.y+high.y)/2,12),true);
});


test('600-unit terrain allows movement beyond legacy empty-field bounds',/** 확장된 지도에서 외곽 시작점의 이동·구르기를 검증한다. */ ()=>{
 const /** map: 실제 생성한 큰 지도. */ map=generateRoomMap(29);
 assert.equal(map.tileRadius*map.landScale,600);
 const /** tile: 기존 필드 범위 밖의 지형. */ tile=map.tiles.find(/** 외곽 지형을 선택한다. */ (/** candidate: 검사할 지형. */ candidate)=>Math.abs(globalThis.PitMapRules.center(candidate,map).x)>1700);
 const /** center: 외곽 지형의 중심. */ center=globalThis.PitMapRules.center(tile,map);
 const /** start: 해당 중심에서 이동을 시작할 개체. */ start=actor(center.x,center.y);
 const /** moved: 일반 이동 결과. */ moved=globalThis.MovementRules.step(start,{x:1,y:0},start.status,map);
 assert.equal(moved.x,center.x+11);assert.equal(moved.y,center.y);
 start.roll={angle:0,speed:660,remaining:72};
 const /** rolled: 구르기 한 틱 결과. */ rolled=globalThis.MovementRules.step(start,{x:0,y:0},start.status,map);
 assert.equal(rolled.x,center.x+33);assert.equal(rolled.y,center.y);
});


test('wide bridges leave a 30-unit terrain gap without opening unlinked edges',/** 다리 치수와 연결되지 않은 이웃의 차단을 실제 크기에서 검증한다. */ ()=>{
 const /** map: 실제 게임 치수의 단순 검증 지도. */ map={...generateRoomMap(29),tiles:[{id:1,q:0,r:0,height:1},{id:2,q:1,r:0,height:1}],bridges:[]};
 const /** a: 첫 지형 중심; b: 둘째 지형 중심. */ [a,b]=map.tiles.map(/** 중심을 구한다. */ (/** tile: 변환할 지형. */ tile)=>PitMapRules.center(tile,map));
 const /** length: 두 중심 간 거리. */ length=Math.hypot(b.x-a.x,b.y-a.y);
 assert.ok(Math.abs(length-600*Math.sqrt(3)-30)<1e-8);assert.equal(map.bridgeWidth,500);
 assert.equal(PitMapRules.walkable(map,b.x/2,b.y/2,12),false);
 const /** connected: 같은 치수에서 다리를 연결한 별도 지도. */ connected={...map,bridges:[[0,1]]};
 assert.equal(PitMapRules.walkable(connected,b.x/2,b.y/2,12),true);
 const /** ux: 다리 방향 가로 성분; uy: 세로 성분. */ [ux,uy]=[b.x/length,b.y/length];
 assert.equal(PitMapRules.walkable(connected,b.x/2-uy*237,b.y/2+ux*237,12),true);
 assert.equal(PitMapRules.walkable(connected,b.x/2-uy*251,b.y/2+ux*251,12),false);
});
