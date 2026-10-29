import { randomUUID } from 'node:crypto';

export const ObjectType = Object.freeze({ PLAYER: 'player', NPC: 'npc', ENEMY: 'enemy' });
export const LifeState = Object.freeze({ ALIVE: 'alive', DEAD: 'dead' });

const defaults = Object.freeze({
  level: 1,
  maxHealth: 10, currentHealth: 10,
  maxSkillResource: 0, currentSkillResource: 0,
  attack: 1, defense: 0,
  healthRegen: 1, skillResourceRegen: 1, moveSpeed: 2,
  bonusHealth: 0, bonusAttack: 0, bonusDefense: 0,
  bonusHealthRegen: 0, bonusMoveSpeed: 0,
  bonusSkillResource: 0, bonusSkillResourceRegen: 0,
  bountyPoints: 1,
});

/** Server-owned data shared by players, NPCs and enemies. Booleans use false=N. */
export function createStatus({ objectType, classificationCode, instanceId = randomUUID(), ...values }) {
  if (!Object.values(ObjectType).includes(objectType)) throw new TypeError('Invalid objectType');
  if (typeof classificationCode !== 'string' || !classificationCode.trim()) throw new TypeError('classificationCode is required');
  if (typeof instanceId !== 'string' || !instanceId) throw new TypeError('instanceId is required');
  const status = { objectType, classificationCode, instanceId };
  for (const [field, fallback] of Object.entries(defaults)) {
    const value = values[field] ?? fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || (!field.startsWith('bonus') && value < 0)) throw new TypeError(`Invalid ${field}`);
    status[field] = value;
  }
  if (!Number.isInteger(status.level) || status.level < 1) throw new TypeError('level must be an integer >= 1');
  for (const field of ['concealed', 'stunned']) {
    status[field] = values[field] ?? false;
    if (typeof status[field] !== 'boolean') throw new TypeError(`Invalid ${field}`);
  }
  status.state = values.state ?? LifeState.ALIVE;
  if (!Object.values(LifeState).includes(status.state)) throw new TypeError('Invalid state');
  status.nearestEnemyId = null;
  status.nearestObjectId = null;
  if (objectType === ObjectType.PLAYER) {
    status.skillDeckCode = values.skillDeckCode ?? '';
    status.availableSkills = [...(values.availableSkills ?? [])];
    if (typeof status.skillDeckCode !== 'string' || !Array.isArray(values.availableSkills ?? []) || !status.availableSkills.every(code => typeof code === 'string')) throw new TypeError('Invalid player skills');
  }
  normalizeVitals(status);
  return status;
}

/** Bonuses affect effective stats without overwriting the base values. */
export function effectiveStats(s) {
  return {
    maxHealth: Math.max(0, s.maxHealth + s.bonusHealth),
    maxSkillResource: Math.max(0, s.maxSkillResource + s.bonusSkillResource),
    attack: Math.max(0, s.attack + s.bonusAttack),
    defense: Math.max(0, s.defense + s.bonusDefense),
    healthRegen: Math.max(0, s.healthRegen + s.bonusHealthRegen),
    skillResourceRegen: Math.max(0, s.skillResourceRegen + s.bonusSkillResourceRegen),
    moveSpeed: Math.max(0, s.moveSpeed + s.bonusMoveSpeed),
  };
}
export function normalizeVitals(s) {
  const effective = effectiveStats(s);
  s.currentHealth = Math.max(0, Math.min(s.currentHealth, effective.maxHealth));
  s.currentSkillResource = Math.max(0, Math.min(s.currentSkillResource, effective.maxSkillResource));
  if (s.currentHealth === 0) s.state = LifeState.DEAD;
  if (s.state === LifeState.DEAD) s.currentHealth = 0;
  return effective;
}
export function regenerate(s, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError('Invalid elapsed time');
  const effective = normalizeVitals(s);
  if (s.state === LifeState.DEAD) return;
  s.currentHealth = Math.min(effective.maxHealth, s.currentHealth + effective.healthRegen * seconds);
  s.currentSkillResource = Math.min(effective.maxSkillResource, s.currentSkillResource + effective.skillResourceRegen * seconds);
}

/** Default hostility: enemies versus players/NPCs. Other players are not PvP targets. */
export function areEnemies(a, b) {
  return (a.objectType === ObjectType.ENEMY) !== (b.objectType === ObjectType.ENEMY);
}
export const TargetPriority = Object.freeze(['nearest', 'lowestHealth', 'lowestHealthRatio']);
export function updateNearestObjects(objects, hostile = areEnemies) {
  for (const object of objects) {
    const s = object.status;
    s.nearestEnemyId = null; s.nearestObjectId = null;
    if (s.state === LifeState.DEAD) continue;
    let closest = Infinity, enemy = Infinity, bestScore = Infinity;
    const priority = object.targetPriority ?? 'nearest';
    const rangeSquared = (object.targetRange ?? Infinity) ** 2;
    for (const candidate of objects) {
      if (candidate.id === object.id || candidate.status.state === LifeState.DEAD) continue;
      const distance = (candidate.x - object.x) ** 2 + (candidate.y - object.y) ** 2;
      if (distance < closest) { closest = distance; s.nearestObjectId = candidate.status.instanceId; }
      if (!hostile(s, candidate.status) || distance > rangeSquared) continue;
      const maxHealth = effectiveStats(candidate.status).maxHealth;
      const score = priority === 'lowestHealth' ? candidate.status.currentHealth : priority === 'lowestHealthRatio' ? (maxHealth > 0 ? candidate.status.currentHealth / maxHealth : Infinity) : distance;
      if (score < bestScore || (score === bestScore && distance < enemy)) { bestScore = score; enemy = distance; s.nearestEnemyId = candidate.status.instanceId; }
    }
  }
}

/** NPC/enemy factory for future spawning systems. Player connections use their issued ID. */
export function createWorldObject({ objectType, classificationCode, instanceId, name = '', x = 0, y = 0, ...stats }) {
  if (![x,y].every(Number.isFinite)) throw new TypeError('Invalid position');
  const status = createStatus({ objectType, classificationCode, instanceId, ...stats });
  return { id: status.instanceId, name, x, y, action: null, facing: -Math.PI / 2, status };
}
