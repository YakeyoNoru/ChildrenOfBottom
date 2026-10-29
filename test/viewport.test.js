import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(readFileSync(new URL('../public/viewport.js',import.meta.url),'utf8'),context);
const view=(w,h)=>vm.runInContext(`calculateViewport(${w},${h})`,context);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('baseline camera is 19 by 10 player diameters, independent of resolution',()=>{
  for(const [w,h] of [[1900,1000],[950,500],[380,200]]){
    const v=view(w,h);near(v.worldWidth/36,19);near(v.worldHeight/36,10);
    near(v.pixelWidth,w);near(v.pixelHeight,h);near(v.left,0);near(v.top,0);
    near(36*v.scale/w,1/19);
  }
});
test('height adapts to aspect and clamps to 8..15 without stretching the world',()=>{
  for(const [w,h] of [[1067,480],[657,416],[816,616],[1900,800],[1900,1500],[2400,800],[1200,1000]]){
    const v=view(w,h);near(v.worldWidth,684);
    assert.ok(v.worldHeight>=288&&v.worldHeight<=540);
    assert.ok(v.pixelWidth<=w+1e-7 && v.pixelHeight<=h+1e-7);
    near(v.pixelWidth/v.worldWidth,v.pixelHeight/v.worldHeight);
    near(v.left*2+v.pixelWidth,w);near(v.top*2+v.pixelHeight,h);
  }
  near(view(2400,800).worldHeight/36,8);assert.ok(view(2400,800).left>0);
  near(view(1200,1000).worldHeight/36,15);assert.ok(view(1200,1000).top>0);
});
test('portrait is unsupported while square and landscape viewports remain usable',()=>{
  assert.equal(view(480,1067).portrait,true);assert.equal(view(1067,480).portrait,false);
  assert.equal(view(800,800).portrait,false);
});

test('web portrait keeps baseline 19:10 while app requires landscape',()=>{
 const web=vm.runInContext('calculateViewport(400,900,"web")',context);
 near(web.worldHeight,360);near(web.pixelWidth/web.pixelHeight,1.9);assert.equal(web.blockedPortrait,false);assert.ok(web.top>0);
 const app=vm.runInContext('calculateViewport(400,900,"app")',context);assert.equal(app.blockedPortrait,true);
});
