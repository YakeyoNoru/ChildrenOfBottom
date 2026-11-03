import { /** test: 검증 등록. */ test } from 'node:test';
import /** assert: 기대값 비교. */ assert from 'node:assert/strict';
import '../public/pit-map-rules.js';
import '../public/poison.js';
import { /** createWorldObject: 검증용 개체 생성. */ createWorldObject } from '../game/status.js';

test('poison starts at 3/5/7 minutes with integer-minute formulas',/** 활성 경계와 층별 증가식을 검사한다. */ ()=>{
 for(const /** height: 검사 층; minute: 활성 분; first: 최초 차감; next: 다음 분 차감. */ [height,minute,first,next] of [[1,3,3,5],[2,5,10,12],[3,7,13,16]]){
  assert.equal(PoisonRules.damage(height,minute*60000-1),0);assert.equal(PoisonRules.damage(height,minute*60000),first);
  assert.equal(PoisonRules.damage(height,(minute+1)*60000-1),first);assert.equal(PoisonRules.damage(height,(minute+1)*60000),next);
 }
 assert.equal(PoisonRules.damage(4,600000),0);assert.equal(PoisonRules.damage(null,600000),0);
});
test('poison uses game start, current height, fixed pulses and direct HP subtraction',/** 방 대기 시간·중복 틱·방어력 우회·이동한 층·사망을 검사한다. */ ()=>{
 const /** map: 높이가 다른 두 지형 지도. */ map={tileRadius:600,landScale:1,bridgeWidth:500,heightBridgeWidth:100,tiles:[{q:0,r:0,height:1},{q:1,r:0,height:2}],bridges:[[0,1]]};
 const /** player: 높은 방어력 플레이어. */ player=createWorldObject({objectType:'player',classificationCode:'P',maxHealth:100,currentHealth:100,defense:999,bonusDefense:999});
 const /** room: 방 생성 후 한참 기다려 시작한 게임. */ room={phase:'started',map,gameStartedAt:600000,poisonPulse:0,players:new Map([[player.id,player]])};
 PoisonRules.tick(room,779999);assert.equal(player.status.currentHealth,100);
 PoisonRules.tick(room,780000);assert.equal(player.status.currentHealth,97);
 PoisonRules.tick(room,780001);assert.equal(player.status.currentHealth,97);
 PoisonRules.tick(room,783000);assert.equal(player.status.currentHealth,94);
 Object.assign(player,PitMapRules.center(map.tiles[1],map));PoisonRules.tick(room,786000);assert.equal(player.status.currentHealth,94);
 PoisonRules.tick(room,900000);assert.equal(player.status.currentHealth,84);
 player.status.currentHealth=2;PoisonRules.tick(room,903000);assert.equal(player.status.currentHealth,0);assert.equal(player.status.state,'dead');
 PoisonRules.tick(room,906000);assert.equal(player.status.currentHealth,0);
});
test('bridge height switches at midpoint and non-player objects are unaffected',/** 다리의 층 전환과 대상 종류 제한을 검증한다. */ ()=>{
 const /** map: 2층·3층을 연결한 지도. */ map={tileRadius:600+30/Math.sqrt(3),landScale:600/(600+30/Math.sqrt(3)),heightBridgeWidth:100,tiles:[{q:0,r:0,height:2},{q:1,r:0,height:3}],bridges:[[0,1]]};
 const /** bridge: 좌표 자료. */ bridge=PitMapRules.geometry(map).bridges[0];
 assert.equal(PitMapRules.heightAt(map,bridge.end.x*.499,bridge.end.y*.499),2);assert.equal(PitMapRules.heightAt(map,bridge.end.x*.501,bridge.end.y*.501),3);
 const /** enemy: 독기 제외 대상. */ enemy=createWorldObject({objectType:'enemy',classificationCode:'E'});
 PoisonRules.tick({phase:'started',map,gameStartedAt:0,players:new Map([[enemy.id,enemy]])},420000);assert.equal(enemy.status.currentHealth,10);
});
