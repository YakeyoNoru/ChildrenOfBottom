import { /** test: 탈출구 생성·면역 검증을 등록한다. */ test } from 'node:test';
import /** assert: 기대 결과를 비교한다. */ assert from 'node:assert/strict';
import { /** tickExits: 시간·인원 조건으로 탈출구를 생성한다. */ tickExits } from '../game/exits.js';
import { /** createWorldObject: 검증용 플레이어를 생성한다. */ createWorldObject } from '../game/status.js';
import { /** applySkillDamage: 모든 기술의 공통 피해 적용 함수. */ applySkillDamage } from '../game/combat.js';
import '../public/interactions.js';

/** 방 생성 시각과 게임 시작 시각이 다른 검증용 방을 만든다. */
function fixture(){
  const /** player: 게임에 남아 있는 생존자. */ player=createWorldObject({objectType:'player',classificationCode:'P'});
  return {phase:'started',createdAt:0,gameStartedAt:100000,players:new Map([[player.id,player]]),objects:new Map(),map:{tileRadius:600,landScale:1,tiles:[{id:1,q:0,r:0,height:3},{id:2,q:1,r:0,height:3},{id:3,q:2,r:0,height:4}],bridges:[]}};
}

test('exits appear once at six and eight minutes from game start on their exact heights',/** 경계 시각·무작위 후보·중복 생성·사용 후 재생성 방지를 검증한다. */ ()=>{
 const /** room: 시간 검증용 방; player: 잔여 플레이어. */ room=fixture(),player=room.players.values().next().value;
 tickExits(room,room.gameStartedAt+359999);assert.equal(room.objects.size,0);
 tickExits(room,room.gameStartedAt+360000,/** 마지막 높이 3 후보를 고른다. */ ()=>.99);
 const /** first: 첫 탈출구. */ first=[...room.objects.values()][0];assert.equal(first.spawnTileId,2);assert.equal(first.status.objectType,'npc');assert.equal(first.status.damageImmune,true);
 const /** secondPlayer: 연결이 끊겼지만 게임에 남은 생존자. */ secondPlayer=createWorldObject({objectType:'player',classificationCode:'Q'});secondPlayer.disconnectedUntil=999999;room.players.set(secondPlayer.id,secondPlayer);
 tickExits(room,room.gameStartedAt+479999);assert.equal(room.objects.size,1);
 tickExits(room,room.gameStartedAt+480000);assert.equal(room.objects.size,2);
 assert.equal([...room.objects.values()].filter(/** 높이 4 출현 개체를 센다. */ (/** exit: 출현한 탈출구. */ exit)=>exit.spawnTileId===3).length,1);
 room.objects.delete(first.id);tickExits(room,room.gameStartedAt+500000);assert.equal(room.objects.size,1);
 player.x=first.x;player.y=first.y;
 assert.equal(InteractionRules.invoke(player,first).type,'escapePrompt');
 assert.equal(applySkillDamage({id:'hit',casterId:player.id,resultSequence:0},first,1000000,1,player),null);
 assert.equal(first.status.currentHealth,10);assert.equal(first.status.state,'alive');assert.equal(first.status.lastDamageAt,null);
 player.x+=60.01;assert.equal(InteractionRules.available(player,first),false);
});

test('second exit is skipped permanently with fewer than two living remaining players',/** 사망자를 제외한 인원 조건과 없는 층에서의 안전한 처리를 검사한다. */ ()=>{
 const /** room: 생존자가 한 명인 방; dead: 인원 조건에 포함하면 안 되는 사망자. */ room=fixture(),dead=createWorldObject({objectType:'player',classificationCode:'dead',currentHealth:0});room.players.set(dead.id,dead);
 tickExits(room,room.gameStartedAt+480000);assert.equal(room.objects.size,1);
 dead.status.currentHealth=10;dead.status.state='alive';tickExits(room,room.gameStartedAt+490000);assert.equal(room.objects.size,1);
 const /** empty: 출현 후보 층이 없는 지도. */ empty=fixture();empty.map.tiles=[];tickExits(empty,empty.gameStartedAt+480000);assert.equal(empty.objects.size,0);
});
