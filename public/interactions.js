/** NPC·사물의 상호작용을 분류코드로 조회하는 공통 규칙. */
globalThis.InteractionRules={
  /** handlers: 분류코드별 조건·실행 함수를 보관한다. */ handlers:new Map(),
  /** 새 NPC·사물 상호작용을 같은 호출 경로에 등록한다. */
  register(/** code: 오브젝트 분류코드. */ code,/** handler: canInteract·run 처리기. */ handler){this.handlers.set(code,handler);},
  /** 거리·생존·개별 조건을 함께 확인한다. */
  available(/** player: 상호작용할 플레이어. */ player,/** target: NPC 또는 사물. */ target){
    if(player?.status?.objectType!=='player'||player.status.state!=='alive'||!target?.interactionEnabled||target.status?.state!=='alive'||!['npc','prop'].includes(target.status.objectType)||Math.hypot(player.x-target.x,player.y-target.y)>60)return false;
    const /** handler: 분류코드에 등록한 공통 처리기. */ handler=this.handlers.get(target.status.classificationCode);
    return !!handler&&(!handler.canInteract||handler.canInteract(player,target));
  },
  /** 서버에서 검증한 뒤 분류코드별 실행 함수를 호출한다. */
  invoke(/** player: 요청자. */ player,/** target: 요청한 대상. */ target){
    if(!this.available(player,target))return null;
    return this.handlers.get(target.status.classificationCode).run(player,target);
  },
};
InteractionRules.register('OBJ0001',{
  /** 귀환등은 같은 생성 플레이어와 소유 코드일 때만 사용할 수 있다. */
  canInteract(/** player: 요청자. */ player,/** target: 귀환등. */ target){return target.ownerId===player.id&&target.ownerCode===player.status.classificationCode;},
  /** 실제 탈출 전 Y/N 확인을 요청한다. */
  run(){return {type:'escapePrompt',message:'탈출하시겠습니까? Y/N'};},
});
InteractionRules.register('NPC_EXIT',{
  /** 탈출구는 소유자 제한 없이 생존 플레이어 누구나 같은 거리·확인 절차로 이용한다. */
  run(){return {type:'escapePrompt',message:'탈출하시겠습니까? Y/N'};},
});
