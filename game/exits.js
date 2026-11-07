import { /** createWorldObject: 피해 면역 NPC를 생성한다. */ createWorldObject } from './status.js';
import '../public/pit-map-rules.js';

/** 정해진 시간에 한 번씩 탈출구를 생성한다. 시각은 방 생성이 아닌 실제 게임 시작 기준이다. */
export function tickExits(/** room: 지도·참가자·개체·생성 이력을 가진 게임 방. */ room,/** now: 서버 게임 시각(ms). */ now,/** random: 출현 타일을 추첨할 0 이상 1 미만 난수 함수. */ random=Math.random){
  if(room.phase!=='started'||!room.map||!Number.isFinite(room.gameStartedAt))return;
  /** exitSpawnChecks: 생성 기회를 이미 처리한 단계 목록. 사용·소멸 후 재생성하지 않는다. */ room.exitSpawnChecks??=new Set();
  for(const /** stage: 게임 시작 후 대기시간·층·필요 생존자 수. */ stage of [
    {/** delay: 첫 생성까지 6분(ms). */ delay:360000,/** height: 첫 탈출구 층. */ height:3,/** minimumPlayers: 첫 생성에는 별도 인원 조건이 없다. */ minimumPlayers:1},
    {/** delay: 두 번째 생성까지 8분(ms). */ delay:480000,/** height: 두 번째 탈출구 층. */ height:4,/** minimumPlayers: 연결이 끊긴 생존자를 포함한 잔여 인원. */ minimumPlayers:2},
  ]){
    if(now-room.gameStartedAt<stage.delay||room.exitSpawnChecks.has(stage.delay))continue;
    room.exitSpawnChecks.add(stage.delay);
    const /** living: 사망·탈출·퇴장한 플레이어를 제외한 잔여 인원. */ living=[...room.players.values()].filter(/** 생존 참가자만 센다. */ (/** player: 방 참가자. */ player)=>player.status.state==='alive').length;
    if(living<stage.minimumPlayers)continue;
    const /** tiles: 해당 높이의 출현 후보 지형. */ tiles=room.map.tiles.filter(/** 지정 층만 고른다. */ (/** tile: 지형 후보. */ tile)=>tile.height===stage.height);
    if(!tiles.length)continue;
    const /** tile: 무작위로 선택한 출현 타일. */ tile=tiles[Math.floor(random()*tiles.length)];
    const /** center: 해당 타일 중앙의 확정 월드 좌표. */ center=globalThis.PitMapRules.center(tile,room.map);
    spawnExit(room,center,tile.id);
  }
}


/** 동일한 상호작용 규칙을 사용하는 일회용 탈출구를 생성한다. */
export function spawnExit(/** room: 탈출구를 등록할 방. */ room,/** center: 탈출구 월드 좌표. */ center,/** tileId: 지도에서 출현한 타일 번호. */ tileId=null){
    const /** exit: 모든 피해에 면역이며 공격·구르기 기술이 없는 탈출구 NPC. */ exit=createWorldObject({objectType:'npc',classificationCode:'NPC_EXIT',name:'탈출구',...center,damageImmune:true,healthRegen:0,moveSpeed:0,skillA:'',skillB:''});
    /** interactionEnabled: 모든 생존 플레이어가 확인 대화를 요청할 수 있는지 여부. */ exit.interactionEnabled=true;
    /** spawnTileId: 실제 출현한 지형 타일 번호. */ exit.spawnTileId=tileId;
    room.objects.set(exit.id,exit);
}
