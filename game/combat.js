import { /** areEnemies: 적대 관계를 판단한다. */ areEnemies, /** LifeState: 생존·사망 상태 상수. */ LifeState, /** normalizeVitals: 체력과 사망 상태를 정규화한다. */ normalizeVitals } from './status.js';

/** 현재 기술 인스턴스의 판정 영역과 대상의 원형 히트박스가 겹치는지 검사한다. */
export function intersectsSkill(
  /** instance: 서버가 생성한 기술의 현재 위치·방향·판정 영역. */ instance,
  /** target: 접촉 여부를 검사할 월드 개체. */ target,
) {
  const /** dx: 기술 중심에서 대상까지의 가로 거리. */ dx = target.x-instance.x;
  const /** dy: 기술 중심에서 대상까지의 세로 거리. */ dy = target.y-instance.y;
  const /** radius: 대상의 피격 원 반지름(월드 좌표). */ radius = (target.status.hitboxDiameter ?? 24)/2;
  if (instance.shape === 'circle') return Math.hypot(dx,dy) <= instance.radius+radius;
  if (instance.shape !== 'forwardRectangle') return false;
  const /** forward: 시전 방향으로 투영한 전방 거리. */ forward = dx*Math.cos(instance.angle)+dy*Math.sin(instance.angle);
  const /** sideways: 시전 방향에 수직인 좌우 거리. */ sideways = -dx*Math.sin(instance.angle)+dy*Math.cos(instance.angle);
  const /** fx: 전방 좌표에서 사각형의 최근접점까지 거리. */ fx = forward-Math.max(0,Math.min(instance.length,forward));
  const /** sy: 좌우 좌표에서 사각형의 최근접점까지 거리. */ sy = sideways-Math.max(-instance.width/2,Math.min(instance.width/2,sideways));
  return fx*fx+sy*sy <= radius*radius;
}

/** 기술 인스턴스가 가진 공격 수치로 피해를 계산한다. 방어력 차감은 아직 적용하지 않는다. */
export function calculateSkillDamage(
  /** instance: 시전 시 공격 수치가 복사된 기술 인스턴스. */ instance,
  /** target: 향후 대상별 방어·저항 규칙에 사용할 피격 개체. */ target,
) {
  return Math.max(0,instance.attack+instance.bonusAttack+instance.bonusDamage);
}

/** 서버에서 체력을 변경하고 화면·로그가 공통으로 사용할 확정 피해 결과를 만든다. */
export function applySkillDamage(
  /** instance: 공격자와 시전 ID를 보유한 기술 인스턴스. */ instance,
  /** target: 피해를 받을 개체. */ target,
  /** amount: 이 접촉에 대해 계산한 피해량. */ amount,
  /** now: 피해를 확정하는 서버 시각(밀리초). */ now,
) {
  if (!Number.isFinite(amount) || amount<0 || target.status.state===LifeState.DEAD) return null;
  const /** healthBefore: 피해를 적용하기 직전 체력. */ healthBefore = target.status.currentHealth;
  target.status.currentHealth=Math.max(0,healthBefore-amount);
  if(target.status.currentHealth<healthBefore){
    /** lastDamageAt: 즉시 공격·투사체·장판에서 공통으로 기록하는 실제 피격 시각. */ target.status.lastDamageAt=now;
    /** healthRegenNextAt: 재피격 시 5초 회복 대기를 처음부터 다시 시작한다. */ target.status.healthRegenNextAt=now+5000;
  }
  normalizeVitals(target.status);
  // 피해 적용 경로를 공유하므로 즉시 공격·투사체·장판 모두 마지막 실제 공격자를 기록한다.
  if(amount>0&&target.status.objectType==='enemy'&&target.status.state!==LifeState.DEAD&&target.status.awarenessState!=='returning') {
    target.status.attackTargetId=instance.casterId;
    target.status.awarenessState='combat';
    if(target.monsterAI)target.monsterAI.hasAttacked=false;
  }
  return {
    /** id: 반복 스냅샷에서도 중복 표시를 막는 결과 고유 ID. */ id: instance.id+':'+(++instance.resultSequence),
    /** instanceId: 이 피해를 발생시킨 시전 인스턴스 ID. */ instanceId:instance.id,
    /** casterId: 원래 시전자의 개체 ID. */ casterId:instance.casterId,
    /** targetId: 실제 피격 개체 ID. */ targetId:target.id,
    /** code: 피해를 발생시킨 기술 코드. */ code:instance.code,
    /** damage: 계산된 피해량. 초과 피해를 포함할 수 있다. */ damage:amount,
    /** appliedDamage: 실제로 차감한 체력. */ appliedDamage:healthBefore-target.status.currentHealth,
    /** healthBefore: 피격 전 체력. */ healthBefore,
    /** healthAfter: 서버가 확정한 피격 후 체력. */ healthAfter:target.status.currentHealth,
    /** killed: 이 피해로 사망했는지 여부. */ killed:target.status.state===LifeState.DEAD,
    /** occurredAt: 서버 피해 확정 시각(밀리초). */ occurredAt:now,
  };
}

/** 즉시 공격·투사체·장판이 공유하는 접촉→피해 계산→적용→결과 생성 흐름이다. */
export function resolveSkillContacts(
  /** instance: 이번 시전의 현재 위치와 중복 피격 기록. */ instance,
  /** objects: 현재 월드 개체 목록. */ objects,
  /** now: 판정할 서버 시각(밀리초). */ now,
  /** damageRule: 서버 기술별·대상별 피해 공식을 연결할 함수. */ damageRule = calculateSkillDamage,
) {
  const /** results: 이번 판정에서 새로 확정한 피해 결과 목록. */ results=[];
  if (now<instance.activeFrom || now>=instance.activeUntil) return results;
  for (const /** target: 접촉·적대·중복 여부를 검사할 후보. */ target of objects) {
    if(target.id===instance.casterId || target.status.state===LifeState.DEAD || !areEnemies(instance.sourceStatus,target.status)) continue;
    const /** lastHit: 이 기술이 같은 대상에게 마지막으로 피해를 준 시각. */ lastHit=instance.hitTimes.get(target.id);
    if(lastHit!==undefined && (instance.hitIntervalMs===null || now-lastHit<instance.hitIntervalMs)) continue;
    if(!intersectsSkill(instance,target)) continue;
    const /** result: 서버가 확정한 이번 접촉의 피해 결과. */ result=applySkillDamage(instance,target,damageRule(instance,target),now);
    if(!result) continue;
    instance.hitTimes.set(target.id,now);
    if(!instance.hits.includes(target.id)) instance.hits.push(target.id);
    instance.results.push(result);results.push(result);
  }
  return results;
}

/** 내부 판정 기록을 제외하고 네트워크로 전달할 기술 표시·피해 결과를 복사한다. */
export function skillSnapshot(
  /** instance: 서버에서 유지하는 기술 인스턴스. */ instance,
  /** now: 남은 표시 시간을 계산할 현재 시각(밀리초). */ now = Date.now(),
) {
  return {
    id:instance.id,casterId:instance.casterId,code:instance.code,
    x:instance.x,y:instance.y,angle:instance.angle,shape:instance.shape,
    width:instance.width,length:instance.length,radius:instance.radius,
    damage:instance.damage,hits:[...instance.hits],results:instance.results.map(
      /** 결과 객체를 복사해 외부에서 서버 기록을 변경하지 못하게 한다. */
      (/** result: 복사할 확정 피해 결과. */ result)=>({...result})),
    createdAt:instance.createdAt,expiresAt:instance.expiresAt,remainingMs:Math.max(0,instance.expiresAt-now),
  };
}
