import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the real client with browser API doubles to verify UI state and input
// without making browser binaries a prerequisite of npm test.
function client(mode='web') {
  class Element extends EventTarget {
    hidden=false; open=false; value=''; style={setProperty(){}}; disabled=false; checked=true;
    setAttribute(name,value){this[name]=value;}
    classList={toggle(){},add(){},remove(){}};
    append(){} replaceChildren(){} focus(){} setPointerCapture(){}
    getBoundingClientRect(){return {left:0,top:0,width:132,height:132};}
    showModal(){this.open=true;} close(){this.open=false;this.dispatchEvent(new Event('close'));}
    click(){this.onclick?.();}
    getContext(){return {};}
  }
  const ids=[...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const elements=new Map(ids.map(id=>[id,new Element()]));
  elements.get('game').hidden=true;
  class Socket {
    static OPEN=1;
    readyState=1; sent=[];
    send(raw){this.sent.push(JSON.parse(raw));}
    close(){this.readyState=3;this.onclose();}
  }
  const document=new EventTarget(); document.hidden=false;document.body=new Element();document.documentElement=new Element();
  document.getElementById=id=>elements.get(id);document.createElement=()=>new Element();
  const window=new EventTarget(), timers=[];
  const context=vm.createContext({document,window,WebSocket:Socket,matchMedia:()=>({matches:false,addEventListener(){}}),location:{protocol:'http:',host:'localhost'},crypto:{randomUUID:()=>String(Math.random())},navigator:{userAgent:''},innerWidth:950,innerHeight:500,setTimeout:()=>1,clearTimeout(){},setInterval:fn=>timers.push(fn),requestAnimationFrame(){}});
  vm.runInContext(readFileSync(new URL('../public/client-mode.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/viewport.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/motion.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
  const run=script=>vm.runInContext(script,context);
  const receive=message=>run(`socket.onmessage({data:${JSON.stringify(JSON.stringify({v:1,...message}))}})`);
  receive({type:'welcome',playerId:'me'});
  const state={code:'ABC123',hostId:'me',phase:'started',players:[{id:'me',name:'나',x:0,y:0},{id:'other',name:'동료',x:10,y:10}]};
  return {elements,run,receive,state,window,timers};
}
function key(target,type,code){const e=new Event(type,{cancelable:true});Object.defineProperty(e,'code',{value:code});target.dispatchEvent(e);}

test('client enters own game, hides touch on keyboard, sends input and stops for menu',()=>{
  const {elements:e,receive,state,window,run}=client();
  receive({type:'room.state',room:state});
  assert.equal(e.get('game').hidden,false);assert.equal(e.get('home').hidden,true);assert.equal(e.get('lobby').hidden,true);
  assert.equal(e.get('touch-controls').hidden,false);
  key(window,'keydown','KeyD');run('inputPacket()');
  assert.equal(e.get('touch-controls').hidden,true);assert.equal(run('socket.sent.at(-1).x'),1);
  e.get('game-menu').click();assert.equal(e.get('game-dialog').open,true);
  run('inputPacket()');assert.equal(run('socket.sent.at(-1).x'),0);
  e.get('resume').click();assert.equal(e.get('game-dialog').open,false);
  receive({type:'game.state',room:{...state,players:[{...state.players[0],x:40}]}});
  assert.equal(run('room.players[0].x'),40);
  e.get('game-menu').click();e.get('game-leave').click();assert.equal(run('socket.sent.at(-1).type'),'room.leave');
  receive({type:'room.left'});assert.equal(e.get('home').hidden,false);assert.equal(e.get('game').hidden,true);assert.equal(e.get('game-dialog').open,false);
  receive({type:'game.state',room:state});assert.equal(run('room'),null);
});
test('touch joystick and A can be held together; cancellation and disconnect clear them',()=>{
  const {elements:e,receive,state,run}=client();receive({type:'room.state',room:state});
  const touch={pointerId:1,clientX:120,clientY:66};
  e.get('joystick').onpointerdown(touch);e.get('action-a').onpointerdown({pointerId:2});run('inputPacket()');
  assert.equal(run('socket.sent.at(-1).x'),1);assert.equal(run('socket.sent.at(-1).action'),'A');
  const cancel=new Event('pointercancel');Object.defineProperty(cancel,'pointerId',{value:1});e.get('joystick').dispatchEvent(cancel);
  assert.equal(run('socket.sent.at(-1).x'),0);
  run('socket.close()');assert.equal(e.get('home').hidden,false);assert.equal(run('action'),null);assert.equal(run('axis.x'),0);
});

test('object HUD colors, left level, effective health ratio and conditional skill resource',()=>{
  const {run}=client();
  run(`globalThis.draws=[];globalThis.hud={fillRect(x,y,w,h){draws.push({kind:'bar',color:this.fillStyle,x,y,w,h});},strokeRect(){},fillText(text,x,y){draws.push({kind:'text',text,x,y,align:this.textAlign});}}`);
  for (const [objectType,id,color] of [['player','me','#63d4d2'],['player','other','#e76060'],['npc','npc','#68cd84'],['enemy','enemy','#e76060']]) {
    run(`draws=[];drawObjectHud(hud,${JSON.stringify({id,status:{objectType,level:3,currentHealth:5,maxHealth:10,bonusHealth:10,maxSkillResource:0,bonusSkillResource:0,currentSkillResource:0}})},100,100,'me')`);
    assert.equal(run('draws[1].color'),color);assert.equal(run('draws[1].w'),16);
    assert.equal(run('draws[2].text'),'Lv.3');assert.equal(run('draws[2].align'),'right');assert.ok(run('draws[2].x')<68);
    assert.equal(run('draws.length'),3);
  }
  run(`draws=[];drawObjectHud(hud,{id:'me',status:{objectType:'player',level:1,currentHealth:10,effective:{maxHealth:10,maxSkillResource:5},currentSkillResource:2.5}},100,100,'me')`);
  assert.equal(run('draws.at(-1).text'),'2.5 / 5');assert.ok(run('draws.at(-1).y')>100);
});

test('web portrait resize shrinks fixed 19:10 frame, keeps input active and restores landscape',()=>{
  const {elements:e,receive,state,window,run}=client();receive({type:'room.state',room:state});
  key(window,'keydown','KeyD');run('inputPacket()');assert.equal(run('socket.sent.at(-1).x'),1);
  e.get('game-menu').click();
  run('innerWidth=400;innerHeight=900');window.dispatchEvent(new Event('resize'));
  assert.equal(e.get('rotate-notice').hidden,true);assert.equal(e.get('game-viewport').hidden,false);assert.equal(run('viewport.worldHeight'),360);
  e.get('resume').click();
  key(window,'keydown','KeyD');run('inputPacket()');assert.equal(run('socket.sent.at(-1).x'),1);
  run('innerWidth=950;innerHeight=500');window.dispatchEvent(new Event('resize'));
  assert.equal(e.get('rotate-notice').hidden,true);assert.equal(e.get('game-viewport').hidden,false);
  assert.equal(run('viewport.worldWidth'),684);assert.equal(run('viewport.worldHeight'),360);
});

test('player triangle apex follows facing including diagonals, with default up and radius 18',()=>{
  const {run}=client();
  run(`globalThis.vertices=[];globalThis.triangleContext={beginPath(){},moveTo(x,y){vertices.push([x,y]);},lineTo(x,y){vertices.push([x,y]);},closePath(){},fill(){}}`);
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4]){
    run(`vertices=[];drawPlayerTriangle(triangleContext,{facing:${angle}},100,100)`);
    assert.ok(Math.abs(run('vertices[0][0]')-(100+Math.cos(angle)*18))<1e-7);
    assert.ok(Math.abs(run('vertices[0][1]')-(100+Math.sin(angle)*18))<1e-7);
    assert.equal(run('vertices.length'),3);
    assert.ok(run('vertices.every(([x,y])=>Math.abs(Math.hypot(x-100,y-100)-18)<1e-7)'));
  }
  run('vertices=[];drawPlayerTriangle(triangleContext,{},100,100)');assert.equal(run('vertices[0][1]'),82);
});

test('menu separates test settings and options; radio option syncs to server',()=>{
  const {elements:e,receive,state,run}=client();receive({type:'room.state',room:state});
  e.get('game-menu').click();assert.equal(e.get('menu-main').hidden,false);assert.equal(e.get('menu-options').hidden,true);
  e.get('open-test-settings').click();assert.equal(e.get('menu-test').hidden,false);assert.equal(e.get('menu-main').hidden,true);
  e.get('test-back').click();e.get('open-options').click();assert.equal(e.get('menu-options').hidden,false);assert.equal(e.get('menu-test').hidden,true);
  for(const mode of ['nearest','lowestHealth','lowestHealthRatio'])e.get('target-'+mode).checked=mode==='lowestHealthRatio';
  e.get('target-lowestHealthRatio').onchange();assert.equal(run('userSettings.targetPriority'),'lowestHealthRatio');assert.equal(run('socket.sent.at(-1).type'),'game.options');assert.equal(run('socket.sent.at(-1).targetPriority'),'lowestHealthRatio');
  e.get('options-back').click();assert.equal(e.get('menu-main').hidden,false);e.get('resume').click();e.get('game-menu').click();assert.equal(e.get('menu-main').hidden,false);
});

test('desktop maps left/right mouse and either Shift, blocks UI casts and suppresses game context menu',()=>{
 const {elements:e,receive,state,window,run}=client();receive({type:'room.state',room:state});
 const mouse=(target,type,button)=>{const event=new Event(type,{cancelable:true});Object.defineProperty(event,'button',{value:button});target.dispatchEvent(event);return event;};
 const casts=()=>run('socket.sent.filter(m=>m.type==="game.cast").map(m=>m.slot).join(",")');
 mouse(e.get('game-viewport'),'mousedown',0);mouse(window,'mouseup',0);
 mouse(e.get('game-viewport'),'mousedown',2);mouse(window,'mouseup',2);
 key(window,'keydown','ShiftLeft');key(window,'keydown','ShiftLeft');key(window,'keydown','ShiftRight');key(window,'keyup','ShiftLeft');key(window,'keyup','ShiftRight');
 assert.equal(casts(),'A,B,C');
 key(window,'keydown','KeyJ');key(window,'keydown','KeyK');key(window,'keydown','KeyL');assert.equal(casts(),'A,B,C');
 const context=new Event('contextmenu',{cancelable:true});e.get('game-viewport').dispatchEvent(context);assert.equal(context.defaultPrevented,true);
 e.get('game-menu').click();mouse(e.get('game-viewport'),'mousedown',0);key(window,'keydown','ShiftLeft');assert.equal(casts(),'A,B,C');
});
