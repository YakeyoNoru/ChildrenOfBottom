import { /** test: 아이템 검증 등록 함수. */ test } from 'node:test';
import /** assert: 검증 결과 비교 도구. */ assert from 'node:assert/strict';
import { /** generateRoomMap: 실제 지도 생성기. */ generateRoomMap } from '../game/map-generator.js';
import { /** createWorldObject: 검증용 개체 생성기. */ createWorldObject } from '../game/status.js';
import '../public/pit-map-rules.js';
import '../public/items.js';

test('fragment counts match height/rich ranges and positions stay inside land with spacing',/** 실제 지도 전체의 생성 수·지형 내부·전역 간격을 검사한다. */ ()=>{
 const /** map: 실제 게임 지도. */ map=generateRoomMap(29);
 const /** items: 배치된 전체 조각. */ items=[...ItemRules.spawn(map).values()];
 const /** ranges: 높이별 일반·풍요 생성 범위. */ ranges={1:[[10,15],[30,45]],2:[[15,20],[40,50]],3:[[20,25],[60,80]],4:[[20,25],[80,100]]};
 for(const /** tile: 수량을 검사할 지형. */ tile of map.tiles){
  const /** group: 해당 지형의 조각. */ group=items.filter(/** 소속 지형을 검사한다. */ (/** item: 조각. */ item)=>item.tileId===tile.id);
  const /** range: 지형별 최소·최대 수량. */ range=ranges[tile.height][tile.kind==='rich'?1:0];
  assert.ok(group.length>=range[0]&&group.length<=range[1]);
  const /** land: 다리를 제거한 해당 지형만의 판정 자료. */ land={...map,tiles:[tile],bridges:[]};
  for(const /** item: 조각 중심. */ item of group)assert.ok(PitMapRules.walkable(land,item.x,item.y,2.5));
 }
 for(let /** index: 기준 조각 순번. */ index=0;index<items.length;index++)for(let /** other: 비교 조각 순번. */ other=index+1;other<items.length;other++)assert.ok(Math.hypot(items[index].x-items[other].x,items[index].y-items[other].y)>=7);
});

test('pickup reserves closest living player within 20 then grants 10 once and removes',/** 적·범위·중복·비행 완료 지급을 검사한다. */ ()=>{
 const /** player: 적격 플레이어; enemy: 부적격 적. */ player=createWorldObject({objectType:'player',classificationCode:'P',instanceId:'p',x:21}),enemy=createWorldObject({objectType:'enemy',classificationCode:'E',x:0});
 const /** items: 바닥의 조각 한 개. */ items=new Map([['one',{id:'one',code:'illusionFragment',x:0,y:0,state:'ground'}]]);
 ItemRules.tick(items,[enemy,player],0);assert.equal(items.get('one').state,'ground');
 player.x=20;ItemRules.tick(items,[enemy,player],100);assert.equal(items.get('one').targetId,'p');assert.equal(player.status.competitionPoints,0);
 ItemRules.tick(items,[player],299);assert.equal(items.size,1);
 assert.deepEqual(ItemRules.tick(items,[player],300).removed,['one']);assert.equal(player.status.competitionPoints,10);assert.equal(items.size,0);
 ItemRules.tick(items,[player],500);assert.equal(player.status.competitionPoints,10);
});

test('disappearing or dead collector releases the reserved fragment',/** 사망·퇴장 시 미획득 조각이 사라지지 않음을 검증한다. */ ()=>{
 const /** player: 획득을 시작할 개체. */ player=createWorldObject({objectType:'player',classificationCode:'P'});
 const /** items: 조각 한 개. */ items=new Map([['one',{id:'one',code:'illusionFragment',x:0,y:0,state:'ground'}]]);
 ItemRules.tick(items,[player],0);player.status.state='dead';ItemRules.tick(items,[player],200);assert.equal(items.get('one').state,'ground');assert.equal(player.status.competitionPoints,0);
});
