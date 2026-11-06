import { /** test: 시나리오 등록 함수. */ test } from 'node:test';
import /** assert: 결과 검증 도구. */ assert from 'node:assert/strict';
import { /** spawnMonsters: 타일별 몬스터 배치 함수. */ spawnMonsters, /** tickMonsters: 서버 AI 시뮬레이션 함수. */ tickMonsters } from '../game/monster-ai.js';
import { /** createMonster: 프리셋 몬스터 생성 함수. */ createMonster } from '../game/monsters.js';
import { /** createWorldObject: 플레이어·일반 적 생성 함수. */ createWorldObject } from '../game/status.js';
import { /** applySkillDamage: 공통 확정 피해 처리 함수. */ applySkillDamage } from '../game/combat.js';
import { /** generateRoomMap: 실제 지도 생성 함수. */ generateRoomMap } from '../game/map-generator.js';

/** 적 공격으로 사용할 공통 피해 인스턴스를 만들어 마지막 공격자 처리를 실행한다. */
function hit(/** monster: 피해를 받을 유닛. */ monster, /** attacker: 실제 공격자. */ attacker, /** amount: 실제 피해량. */ amount=1) {
  return applySkillDamage({id:'test',casterId:attacker.id,code:'BAS0001',resultSequence:0},monster,amount,0,attacker);
}

/** 체력이 충분한 검증용 플레이어를 지정 위치에 만든다. */
function player(/** x: 월드 가로 좌표. */ x=30, /** id: 고유 개체ID. */ id='player') {
  return createWorldObject({objectType:'player',classificationCode:'P',instanceId:id,x,maxHealth:100,currentHealth:100});
}

test('enemy common fields capture the spawn position independently and validate inputs', /** 프리셋과 일반 적 생성기의 좌표·기본 인식·대상 및 입력 검증을 검사한다. */ () => {
  const /** monster: 임의 생성 좌표를 가진 몬스터. */ monster=createMonster('몬스터A01',{x:12,y:34});
  assert.deepEqual(monster.status.spawnPosition,{x:12,y:34});
  assert.equal(monster.status.awarenessState,'normal');assert.equal(monster.status.attackTargetId,null);
  monster.x=99;assert.equal(monster.status.spawnPosition.x,12);
  assert.equal('spawnPosition' in player().status,false);
  for(const /** values: 거절해야 하는 몬스터 전용 필드. */ values of [{spawnPosition:{x:NaN,y:0}},{awarenessState:'bad'},{attackTargetId:123}]) {
    assert.throws(/** 잘못된 필드로 일반 적 생성을 시도한다. */ ()=>createWorldObject({objectType:'enemy',classificationCode:'E',...values}),TypeError);
  }
});

test('normal tiles spawn only the requested presets and inclusive population bounds', /** 최소·최대 수량과 일반 타일 조건을 실제 히트박스로 검사한다. */ () => {
  for(const /** height: 검증 타일 높이. */ height of [1,2])for(const /** upper: 수량 범위의 최댓값 검사 여부. */ upper of [false,true]) {
    let /** seed: 위치를 재현하는 난수 상태. */ seed=123;
    let /** first: 다음 난수가 수량 선택인지 여부. */ first=true;
    const /** map: 이번 타일만 포함하는 지도. */ map={tileRadius:600,landScale:1,tiles:[{id:1,q:0,r:0,height,kind:'normal'}],bridges:[]};
    const /** monsters: 첫 난수만 경계값으로 고정한 배치 결과. */ monsters=[...spawnMonsters(map,/** 수량 경계값 이후에는 위치용 난수를 반환한다. */ ()=>{
      if(first){first=false;return upper ? .999999 : 0;}
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;
    }).values()];
    assert.equal(monsters.length,height===1?(upper?8:0):(upper?6:2));
    for(const /** monster: 지형 내부와 종류를 검사할 개체. */ monster of monsters){
      assert.equal(monster.presetId,height===1?'몬스터A01':'몬스터A02');
      assert.ok(globalThis.PitMapRules.walkable(map,monster.x,monster.y,13));
      assert.deepEqual(monster.status.spawnPosition,{x:monster.x,y:monster.y});
    }
  }
  const /** map: 일반 이외 종류와 높이도 포함하는 실제 지도. */ map=generateRoomMap(29);
  const /** monsters: 실제 지도 생성 결과. */ monsters=[...spawnMonsters(map).values()];
  for(const /** tile: 종류·높이에 따른 수량을 검증할 타일. */ tile of map.tiles){
    const /** count: 해당 타일 생성 몬스터 수. */ count=monsters.filter(/** 생성 타일을 비교한다. */ (/** monster: 배치 결과. */ monster)=>monster.spawnTileId===tile.id).length;
    if(tile.kind==='boss'&&[1,2].includes(tile.height))assert.equal(count,1);
    else if(tile.kind!=='normal'||![1,2].includes(tile.height))assert.equal(count,0);
    else assert.ok(tile.height===1?count<=8:count>=2&&count<=6);
  }
});

test('TEST001 wanders 5 to 50 units after a 1 to 3 second idle interval without acquiring nearby targets', /** 최소 간격·거리 및 비선제 행동을 검사한다. */ () => {
  const /** monster: 배회할 몬스터. */ monster=createMonster('몬스터A01');
  const /** target: 공격하지 않은 주변 플레이어. */ target=player();
  tickMonsters([monster,target],null,0,.05,/** 최소 배회 간격·방향·거리를 선택한다. */ ()=>0);
  tickMonsters([monster,target],null,999,.05,/** 최소값을 선택한다. */ ()=>0);assert.equal(monster.x,0);
  tickMonsters([monster,target],null,1000,.05,/** 최소값을 선택한다. */ ()=>0);assert.equal(monster.x,5);
  assert.equal(monster.status.attackTargetId,null);assert.equal(target.status.currentHealth,100);
  assert.deepEqual(monster.status.spawnPosition,{x:0,y:0});
});

test('last attacker starts a 1.5 second fixed direction windup at 30 then rests for 2.5 seconds', /** 접근·준비 시간·저장 방향과 공격 후 정지 경계를 검사한다. */ () => {
  const /** monster: 반격할 몬스터. */ monster=createMonster('몬스터A01');
  const /** first: 먼저 공격한 개체. */ first=player(-100,'first');
  const /** last: 마지막 공격자이자 추격 대상. */ last=player(41,'last');
  hit(monster,first);hit(monster,last);monster.status.nearestEnemyId=first.id;
  assert.equal(monster.status.attackTargetId,last.id);
  assert.equal(tickMonsters([monster,first,last],null,0,.05).length,0);
  assert.equal(monster.x,11);assert.equal(last.status.currentHealth,100);assert.equal(monster.monsterAI.attackAngle,0);
  // 대상이 옆으로 피하고 자동 타겟이 뒤에 있어도 저장한 오른쪽 방향을 유지한다.
  last.x=11;last.y=100;
  assert.equal(tickMonsters([monster,first,last],null,1499,.05).length,0);assert.equal(monster.x,11);assert.equal(monster.facing,0);
  const /** effects: 정확히 준비가 끝난 시각의 공격 결과. */ effects=tickMonsters([monster,first,last],null,1500,.05);
  assert.equal(effects.length,1);assert.equal(effects[0].angle,0);assert.equal(effects[0].code,'BAS0001');
  assert.equal(last.status.currentHealth,100);assert.equal(first.status.currentHealth,100);
  assert.equal(monster.status.nearestEnemyId,first.id);
  tickMonsters([monster,first,last],null,3999,.05);assert.equal(monster.y,0);
  tickMonsters([monster,first,last],null,4000,.05);assert.equal(monster.y,11);
  last.y=41;assert.equal(tickMonsters([monster,first,last],null,4050,.05).length,0);
  assert.equal(tickMonsters([monster,first,last],null,5550,.05).length,1);assert.equal(last.status.currentHealth,92);
});

test('after rest, targets within exactly 150 repeat while farther, dead or missing targets end combat', /** 150 포함 경계와 사망·퇴장 조건을 각각 검사한다. */ () => {
  for(const /** reason: 이번 종료 또는 지속 조건. */ reason of ['boundary','distance','dead','removed']) {
    const /** monster: 공격 후 대기 중인 몬스터. */ monster=createMonster('몬스터A01');
    const /** target: 종료 조건을 적용할 공격자. */ target=player();
    hit(monster,target);tickMonsters([monster,target],null,0,.05);
    tickMonsters([monster,target],null,1500,.05);
    if(reason==='boundary')target.x=150;
    if(reason==='distance')target.x=150.01;
    if(reason==='dead')target.status.state='dead';
    tickMonsters(reason==='removed'?[monster]:[monster,target],null,4000,.05);
    assert.equal(monster.status.attackTargetId,reason==='boundary'?target.id:null);
    assert.equal(monster.status.awarenessState,reason==='boundary'?'combat':'normal');
  }
});

test('400 distance takes priority over attack pause, heals fully, clears target and walks back home', /** 복귀 임계값과 체력·대상 초기화 및 원점 도착을 검사한다. */ () => {
  const /** monster: 생성점에서 정확히 400만큼 벗어난 몬스터. */ monster=createMonster('몬스터A01');
  const /** target: 추격 중이던 공격자. */ target=player(430);
  hit(monster,target);tickMonsters([monster,target],null,0,0);
  monster.x=400;monster.status.currentHealth=2;monster.monsterAI.pauseUntil=99999;
  assert.equal(tickMonsters([monster,target],null,50,.05).length,0);
  assert.equal(monster.status.awarenessState,'returning');assert.equal(monster.status.attackTargetId,null);assert.equal(monster.status.currentHealth,20);
  assert.ok(monster.x<400);
  hit(monster,target);assert.equal(monster.status.awarenessState,'returning');assert.equal(monster.status.attackTargetId,null);
  for(let /** tick: 도착까지 실행할 50ms 틱 순번. */ tick=2;tick<50;tick++)tickMonsters([monster,target],null,tick*50,.05);
  assert.equal(monster.x,0);assert.equal(monster.y,0);assert.equal(monster.status.currentHealth,20);assert.equal(monster.status.awarenessState,'normal');
});

test('stun and death stop AI and terrain blocks wandering off a tile', /** 상태 제약과 지도 경계에서의 배회·복귀를 검사한다. */ () => {
  const /** map: 다리가 없는 지형 하나. */ map={tileRadius:600,landScale:1,tiles:[{id:1,q:0,r:0,height:1,kind:'normal'}],bridges:[]};
  const /** monster: 지형 경계 근처의 몬스터. */ monster=createMonster('몬스터A02',{x:580});
  monster.status.stunned=true;tickMonsters([monster],map,0,.05,/** 최소 배회값을 선택한다. */ ()=>0);
  tickMonsters([monster],map,1000,.05,/** 최소 배회값을 선택한다. */ ()=>0);assert.equal(monster.x,580);
  monster.status.stunned=false;
  for(let /** tick: 경계에서 배회를 반복할 틱 순번. */ tick=0;tick<20;tick++){
    tickMonsters([monster],map,1000+tick*1000,.05,/** 바깥 방향으로 최대 거리를 선택한다. */ ()=>0);
    assert.ok(globalThis.PitMapRules.walkable(map,monster.x,monster.y,13));
  }
  monster.status.state='dead';monster.status.attackTargetId='player';
  const /** x: 사망 직전 위치. */ x=monster.x;
  tickMonsters([monster],map,30000,.05);assert.equal(monster.x,x);assert.equal(monster.status.attackTargetId,null);
});

test('wandering across the leash boundary immediately enters return without a stale destination', /** 배회 이동 중 400경계를 넘는 순간 회복·복귀가 실행되는지 검사한다. */ () => {
  const /** monster: 원점 생성 후 임계점 근처로 이동시킨 몬스터. */ monster=createMonster('몬스터A01');
  tickMonsters([monster],null,0,.05,/** 최소 배회 시간을 고른다. */ ()=>0);
  monster.x=399;monster.status.currentHealth=1;
  tickMonsters([monster],null,1000,.05,/** 오른쪽으로 5거리 이동하도록 고른다. */ ()=>0);
  assert.equal(monster.status.awarenessState,'returning');assert.equal(monster.status.currentHealth,20);
  assert.equal(monster.monsterAI.destination,null);assert.equal(monster.status.attackTargetId,null);
});

test('zero damage never acquires a target and new attacks during the pause do not shorten it', /** 무효 피해와 대기 중 새 공격자 갱신을 검사한다. */ () => {
  const /** monster: 반격을 검사할 몬스터. */ monster=createMonster('몬스터A02');
  const /** first: 최초 공격자. */ first=player(30,'first');
  const /** second: 대기 중 마지막 공격자. */ second=player(60,'second');
  hit(monster,first,0);assert.equal(monster.status.attackTargetId,null);
  hit(monster,first);tickMonsters([monster,first,second],null,0,.05);
  tickMonsters([monster,first,second],null,1500,.05);
  hit(monster,second);assert.equal(monster.status.attackTargetId,second.id);
  tickMonsters([monster,first,second],null,3999,.05);assert.equal(monster.x,0);
  tickMonsters([monster,first,second],null,4000,.05);assert.equal(monster.x,11);
});

test('return follows recorded bridge waypoints instead of crossing an unconnected gap', /** 직선 귀환이 막힌 지형에서 저장 경로를 따라 복귀하는지 검사한다. */ () => {
  const /** map: 첫째·셋째 타일은 인접하지만 직접 다리가 없는 삼각 배치. */ map={tileRadius:90,landScale:.89,bridgeWidth:48,tiles:[{id:1,q:0,r:0,height:1},{id:2,q:1,r:0,height:1},{id:3,q:1,r:-1,height:1}],bridges:[[0,1],[1,2]]};
  const /** centers: 지형별 중심 좌표 목록. */ centers=map.tiles.map(/** 지형 중심을 구한다. */ (/** tile: 현재 지형. */ tile)=>globalThis.PitMapRules.center(tile,map));
  const /** monster: 원점에서 생성된 후 세 번째 지형에 도착한 몬스터. */ monster=createMonster('몬스터A01');
  tickMonsters([monster],map,0,.05);
  Object.assign(monster,centers[2]);monster.status.awarenessState='returning';monster.monsterAI.returnPath=[centers[0],centers[1]];
  assert.notDeepEqual(globalThis.PitMapRules.constrain(map,monster,centers[0],13,false),centers[0]);
  for(let /** step: 도착 여부를 확인할 서버 틱 순번. */ step=1;step<=100&&monster.status.awarenessState==='returning';step++){
    tickMonsters([monster],map,step*50,.05);
    assert.ok(globalThis.PitMapRules.walkable(map,monster.x,monster.y,13));
  }
  assert.deepEqual({x:monster.x,y:monster.y},centers[0]);assert.equal(monster.status.awarenessState,'normal');
});

test('a new attacker during windup changes the next target but cannot rotate or accelerate the committed attack', /** 준비 중 피격에도 저장 방향과 준비 시간이 유지되는지 검사한다. */ () => {
  const /** monster: 공격을 준비할 몬스터. */ monster=createMonster('몬스터A01');
  const /** first: 준비 시작 시 오른쪽 대상. */ first=player(30,'first');
  const /** second: 준비 중 뒤에서 공격하는 새 대상. */ second=player(-30,'second');
  hit(monster,first);tickMonsters([monster,first,second],null,0,.05);
  hit(monster,second);assert.equal(monster.status.attackTargetId,second.id);
  assert.equal(tickMonsters([monster,first,second],null,1499,.05).length,0);
  const /** effects: 준비 종료 시 저장 방향으로 시전한 결과. */ effects=tickMonsters([monster,first,second],null,1500,.05);
  assert.equal(effects[0].angle,0);assert.equal(first.status.currentHealth,92);assert.equal(second.status.currentHealth,100);
  assert.equal(monster.monsterAI.pauseUntil,4000);
});

test('stun, caster death and the 400 leash cancel a pending windup without releasing a delayed shot', /** 준비 중 기절·사망·복귀가 예약 공격을 취소하는지 각각 검사한다. */ () => {
  for(const /** reason: 공격 준비를 취소할 조건. */ reason of ['stunned','dead','returning']){
    const /** monster: 취소할 공격을 준비하는 몬스터. */ monster=createMonster('몬스터A01');
    const /** target: 공격 준비의 대상. */ target=player();
    hit(monster,target);tickMonsters([monster,target],null,0,.05);
    if(reason==='stunned')monster.status.stunned=true;
    if(reason==='dead')monster.status.state='dead';
    if(reason==='returning')monster.x=400;
    assert.equal(tickMonsters([monster,target],null,1500,.05).length,0);
    assert.equal(monster.monsterAI.attackAngle,null);assert.equal(monster.monsterAI.windupUntil,0);
    assert.equal(target.status.currentHealth,100);
    if(reason==='stunned'){
      monster.status.stunned=false;
      assert.equal(tickMonsters([monster,target],null,2000,.05).length,0);
      assert.equal(monster.monsterAI.windupUntil,3500);
    }
  }
});

test('TEST003 boss preset, center spawn and player threat accumulation', /** 보스 기본 능력치·생성 위치·피격 위협수치 누적을 검증한다. */ ()=>{
  const /** map: 보스 하나만 배치할 검증 지도. */ map={tileRadius:600,landScale:1,tiles:[{id:20,q:0,r:0,height:2,kind:'boss'}],bridges:[]};
  const /** boss: 중앙에 생성된 보스 몬스터. */ boss=[...spawnMonsters(map).values()][0];
  assert.equal(boss.presetId,'몬스터C01');assert.equal(boss.x,0);assert.equal(boss.y,0);
  assert.equal(boss.status.classificationCode,'TEST003');assert.equal(boss.status.level,8);
  assert.equal(boss.status.maxHealth,250);assert.equal(boss.status.currentHealth,250);
  assert.equal(boss.status.attack,30);assert.equal(boss.status.defense,2);
  assert.equal(boss.status.moveSpeed,2.5);assert.equal(boss.status.experience,400);
  assert.deepEqual({...boss.status.threatTable},{});
  const /** attacker: 보스에게 실제 피해를 줄 플레이어. */ attacker=player(50,'threat-player');
  hit(boss,attacker,10);assert.equal(boss.status.threatTable[attacker.id],60);
  hit(boss,attacker,5);assert.equal(boss.status.threatTable[attacker.id],115);
  tickMonsters([boss,attacker],null,0,.05,/** 구르기를 선택하지 않는다. */ ()=>.9);
  assert.equal(boss.status.awarenessState,'combat');
});

test('TEST003 boss resets at 800 distance and clears threat after returning', /** 보스 이탈 거리와 귀환 후 상태·체력·위협 초기화를 검사한다. */ ()=>{
  const /** boss: 생성점에서 이탈시킬 보스. */ boss=createMonster('몬스터C01');
  const /** attacker: 공격대상 플레이어. */ attacker=player(800,'attacker');
  hit(boss,attacker,20);
  boss.x=800;
  tickMonsters([boss,attacker],null,0,.05);
  assert.equal(boss.status.awarenessState,'returning');
  for(let /** index: 귀환 완료까지의 틱 순번. */ index=1;index<100;index++)tickMonsters([boss,attacker],null,index*50,.05);
  assert.equal(boss.x,0);assert.equal(boss.status.currentHealth,250);
  assert.equal(boss.status.awarenessState,'normal');assert.deepEqual({...boss.status.threatTable},{});
});
