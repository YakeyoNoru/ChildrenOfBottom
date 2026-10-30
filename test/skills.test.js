import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorldObject} from '../game/status.js';
import {castSkill,skills,circleIntersectsSkill} from '../game/skills.js';
const obj=(id,kind,x,y,stats={})=>createWorldObject({objectType:kind,classificationCode:id,instanceId:id,x,y,healthRegen:0,...stats});
test('24 diameter hitboxes intersect forward rectangle including edges, corners and rotations',()=>{
 const p=obj('p','player',0,0);assert.equal(p.status.hitboxDiameter,24);
 for(const [x,y,hit] of [[84,0,true],[84.01,0,false],[-12,0,true],[-12.01,0,false],[30,37,true],[30,37.01,false],[80,33,true],[82,35,false]]) assert.equal(circleIntersectsSkill(p,obj('e','enemy',x,y),0,skills.BAS0001),hit,`${x},${y}`);
 assert.equal(circleIntersectsSkill(p,obj('e','enemy',0,80),Math.PI/2,skills.BAS0001),true);
});
test('A targets selected enemy, damages all intersecting hostiles once, ignores defense and allies, persists 4 seconds',()=>{
 const p=obj('p','player',0,0,{attack:2,bonusAttack:3}),e=obj('e','enemy',0,50,{maxHealth:30,currentHealth:30,defense:100}),ally=obj('n','npc',0,30),out=obj('o','enemy',100,0);
 p.status.nearestEnemyId=e.id;
 const effect=castSkill(p,[p,e,ally,out],'A',1000);assert.equal(effect.angle,Math.PI/2);assert.equal(e.status.currentHealth,20);assert.equal(ally.status.currentHealth,10);assert.equal(out.status.currentHealth,10);assert.deepEqual(effect.hits,['e']);assert.equal(effect.expiresAt,5000);
 assert.equal(p.status.skillA,'BAS0001');assert.equal(p.status.skillP,'');assert.equal(castSkill(p,[p,e],'B'),null);
 p.status.stunned=true;assert.equal(castSkill(p,[p,e],'A'),null);
});
test('no target uses last facing; death normalizes and T1 N does not retain debug box',()=>{
 const p=obj('p','player',0,0),e=obj('e','enemy',30,0,{currentHealth:1});p.facing=0;
 const effect=castSkill(p,[p,e],'A',1000,{BAS0001:{...skills.BAS0001,T1:'N'}});assert.equal(e.status.state,'dead');assert.equal(effect.expiresAt,1150);
});
