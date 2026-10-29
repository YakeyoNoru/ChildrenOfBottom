import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatus, createWorldObject, effectiveStats, regenerate, normalizeVitals, updateNearestObjects } from '../game/status.js';

const status = (objectType = 'player', values = {}) => createStatus({objectType,classificationCode:'TEST',...values});
test('all object kinds share defaults; skills belong only to players and arrays are independent',()=>{
  for (const kind of ['player','npc','enemy']) {
    const s=status(kind);
    assert.equal(s.objectType,kind);assert.equal(s.classificationCode,'TEST');assert.ok(s.instanceId);
    assert.equal(s.level,1);assert.equal(s.maxHealth,10);assert.equal(s.currentHealth,10);
    assert.equal(s.maxSkillResource,0);assert.equal(s.currentSkillResource,0);
    assert.equal(s.attack,1);assert.equal(s.defense,0);assert.equal(s.healthRegen,1);assert.equal(s.skillResourceRegen,1);assert.equal(s.moveSpeed,2);
    assert.equal(s.concealed,false);assert.equal(s.stunned,false);assert.equal(s.state,'alive');assert.equal(s.bountyPoints,1);
    assert.equal(s.nearestEnemyId,null);assert.equal(s.nearestObjectId,null);
    for(const key of ['bonusHealth','bonusAttack','bonusDefense','bonusHealthRegen','bonusMoveSpeed','bonusSkillResource','bonusSkillResourceRegen'])assert.equal(s[key],0);
    assert.equal('skillDeckCode' in s,kind==='player');assert.equal('availableSkills' in s,kind==='player');
  }
  const skills=['SK001'],a=status('player',{availableSkills:skills}),b=status();
  a.availableSkills.push('SK002');assert.deepEqual(skills,['SK001']);assert.deepEqual(b.availableSkills,[]);
  assert.notEqual(a.instanceId,b.instanceId);
});
test('bonuses add to effective values; regen respects caps, zero resources and death',()=>{
  const s=status('npc',{currentHealth:5,maxSkillResource:4,currentSkillResource:1,bonusHealth:5,bonusAttack:2,bonusDefense:3,bonusHealthRegen:1,bonusMoveSpeed:1,bonusSkillResource:2,bonusSkillResourceRegen:2});
  assert.deepEqual(effectiveStats(s),{maxHealth:15,maxSkillResource:6,attack:3,defense:3,healthRegen:2,moveSpeed:3,skillResourceRegen:3});
  regenerate(s,.5);assert.equal(s.currentHealth,6);assert.equal(s.currentSkillResource,2.5);
  regenerate(s,100);assert.equal(s.currentHealth,15);assert.equal(s.currentSkillResource,6);assert.equal(s.maxHealth,10);
  s.bonusHealth=-8;s.bonusSkillResource=-10;normalizeVitals(s);assert.equal(s.currentHealth,2);assert.equal(s.currentSkillResource,0);
  s.currentHealth=0;regenerate(s,10);assert.equal(s.state,'dead');assert.equal(s.currentHealth,0);
  const zero=status();regenerate(zero,20);assert.equal(zero.currentSkillResource,0);
});
test('nearest references exclude self/dead, distinguish enemy, and clear when a target disappears',()=>{
  const make=(objectType,x)=>createWorldObject({objectType,classificationCode:'TEST',x});
  const p=make('player',0),npc=make('npc',2),enemy=make('enemy',5),dead=make('enemy',1);
  dead.status.currentHealth=0;normalizeVitals(dead.status);
  updateNearestObjects([p,npc,enemy,dead]);
  assert.equal(p.status.nearestObjectId,npc.id);assert.equal(p.status.nearestEnemyId,enemy.id);
  assert.equal(enemy.status.nearestEnemyId,npc.id);assert.equal(dead.status.nearestEnemyId,null);
  updateNearestObjects([p]);assert.equal(p.status.nearestObjectId,null);assert.equal(p.status.nearestEnemyId,null);
});
test('invalid statuses are rejected rather than leaking NaN, invalid levels or string flags',()=>{
  for(const values of [{attack:NaN},{maxHealth:-1},{level:0},{level:1.5},{moveSpeed:Infinity},{concealed:'N'},{stunned:1},{state:'unknown'},{availableSkills:'skill'}])assert.throws(()=>status('player',values),TypeError);
  assert.throws(()=>status('unknown'),TypeError);assert.throws(()=>regenerate(status(),-1),TypeError);
});

test('attack priorities use distance, current health, effective health ratio, range and distance ties',()=>{
  const make=(id,x,hp,max=10,bonus=0)=>createWorldObject({objectType:id==='p'?'player':'enemy',classificationCode:id,instanceId:id,x,currentHealth:hp,maxHealth:max,bonusHealth:bonus});
  const p=make('p',0,10),near=make('near',2,7),low=make('low',5,3),ratio=make('ratio',8,4,10,30),dead=make('dead',1,0);
  const objects=[p,near,low,ratio,dead];
  for (const [mode,id] of [['nearest','near'],['lowestHealth','low'],['lowestHealthRatio','ratio']]) { p.targetPriority=mode;updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,id);assert.equal(p.status.nearestObjectId,'near'); }
  p.targetRange=5;updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,'low');
  p.targetRange=1;updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,null);
  p.targetRange=Infinity;p.targetPriority='lowestHealth';near.status.currentHealth=3;updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,'near');
  low.status.state='dead';near.status.state='dead';ratio.status.state='dead';updateNearestObjects(objects);assert.equal(p.status.nearestEnemyId,null);
});
