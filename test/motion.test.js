import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const create=()=>{const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../public/motion.js',import.meta.url),'utf8')+';globalThis.view=new MotionView()',ctx);return ctx.view;};
const object=(id,x,y=0)=>({id,x,y,facing:0,status:{state:'alive',moveSpeed:2,bonusMoveSpeed:0}});
const room=objects=>({code:'ONE',phase:'started',objects});
test('remote snapshots interpolate on a shared timeline without mutating authoritative objects',()=>{
 const v=create(),a=room([object('me',0),object('enemy',0)]),b=room([object('me',0),object('enemy',50)]);
 v.receive(a,'me',0);v.receive(b,'me',50);
 const x=time=>v.sample('me',{x:0,y:0},time).find(o=>o.id==='enemy').x;
 assert.equal(x(75),0);assert.equal(x(100),25);assert.equal(x(125),50);assert.equal(a.objects[1].x,0);assert.equal(b.objects[1].x,50);
});
test('local movement and camera position change each frame, prediction stays bounded through loss and stun',()=>{
 const v=create();v.receive(room([object('me',0),object('npc',100)]),'me',0);
 const pos=t=>v.sample('me',{x:1,y:1},t).find(o=>o.id==='me');
 pos(0);const p=pos(16),q=pos(32);assert.ok(p.x>0&&q.x>p.x);assert.ok(Math.abs(q.x-q.y)<1e-7);
 for(let t=48;t<1000;t+=16) pos(t);
 assert.ok(Math.hypot(v.local.x,v.local.y)<60,'packet loss must not cause unbounded motion');
 const frozen=object('me',10);frozen.status.stunned=true;v.receive(room([frozen]),'me',1000);
 const start=v.local.x;const end=pos(1050).x;assert.ok(Math.abs(end-10)<Math.abs(start-10));
});
test('new rooms and teleports snap, disappeared objects are removed and new objects appear immediately',()=>{
 const v=create();v.receive(room([object('me',0),object('old',0)]),'me',0);
 v.receive(room([object('me',500),object('new',10)]),'me',50);
 const result=v.sample('me',{x:0,y:0},50);assert.equal(result.find(o=>o.id==='me').x,500);assert.ok(!result.some(o=>o.id==='old'));assert.equal(result.find(o=>o.id==='new').x,10);
 v.receive({code:'TWO',phase:'started',objects:[object('me',100)]},'me',60);assert.equal(v.frames.length,1);assert.equal(v.local.x,100);
 v.clear();assert.equal(v.sample('me',{x:1,y:0},100).length,0);
});
