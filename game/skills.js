import { areEnemies, LifeState, normalizeVitals } from './status.js';

// Skill definitions are server-owned. T1 controls only the debug range lifetime.
export const skills = Object.freeze({
  BAS0001: Object.freeze({ code: 'BAS0001', name: '기본공격', T1: 'Y', shape: 'forwardRectangle', width: 50, length: 72, bonusDamage: 5, debugDurationMs: 4000 }),
});
export function circleIntersectsSkill(caster, target, angle, skill) {
  const dx = target.x-caster.x, dy = target.y-caster.y;
  const forward = dx*Math.cos(angle)+dy*Math.sin(angle);
  const sideways = -dx*Math.sin(angle)+dy*Math.cos(angle);
  const radius = (target.status.hitboxDiameter ?? 24)/2;
  const fx = forward-Math.max(0,Math.min(skill.length,forward));
  const sy = sideways-Math.max(-skill.width/2,Math.min(skill.width/2,sideways));
  return fx*fx+sy*sy <= radius*radius;
}
export function castSkill(caster, objects, slot, now = Date.now(), definitions = skills) {
  if (!['A','B','C'].includes(slot) || caster.status.stunned || caster.status.state === LifeState.DEAD) return null;
  const skill = definitions[caster.status['skill'+slot]];
  if (!skill) return null;
  const target = objects.find(o=>o.id===caster.status.nearestEnemyId && o.status.state!==LifeState.DEAD && areEnemies(caster.status,o.status));
  const angle = target ? Math.atan2(target.y-caster.y,target.x-caster.x) : caster.facing ?? -Math.PI/2;
  const damage = Math.max(0,caster.status.attack+caster.status.bonusAttack+skill.bonusDamage);
  const hits=[];
  for (const object of objects) {
    if (object.id===caster.id || object.status.state===LifeState.DEAD || !areEnemies(caster.status,object.status) || !circleIntersectsSkill(caster,object,angle,skill)) continue;
    object.status.currentHealth=Math.max(0,object.status.currentHealth-damage); normalizeVitals(object.status); hits.push(object.id);
  }
  return { casterId:caster.id,code:skill.code,x:caster.x,y:caster.y,angle,width:skill.width,length:skill.length,damage,hits,createdAt:now,expiresAt:now+(skill.T1==='Y'?skill.debugDurationMs:150) };
}
