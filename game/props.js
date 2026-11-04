import { /** createWorldObject: 사물의 공통 체력·좌표를 생성한다. */ createWorldObject } from './status.js';
/** 각 플레이어의 시작 위치에 소유자가 있는 귀환전등을 생성한다. */
export function createReturnLamp(/** player: 시작 위치 배치가 끝난 플레이어. */ player){
  const /** lamp: 공격받을 수 있는 체력 50 사물. */ lamp=createWorldObject({objectType:'prop',classificationCode:'OBJ0001',name:'귀환전등',x:player.x,y:player.y,maxHealth:50,currentHealth:50,healthRegen:0,skillA:'',skillB:''});
  /** ownerCode: 함께 생성한 플레이어의 분류코드. */ lamp.ownerCode=player.status.classificationCode;
  /** ownerId: 같은 코드의 중복 접속도 구별하는 소유 개체 ID. */ lamp.ownerId=player.id;
  /** interactionEnabled: 공통 상호작용 대상 여부. */ lamp.interactionEnabled=true;
  /** rewardGranted: 처치 보상의 중복 지급 방지 기록. */ lamp.rewardGranted=false;
  return lamp;
}
