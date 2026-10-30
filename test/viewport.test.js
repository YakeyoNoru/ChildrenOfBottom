import { /** test: 테스트 시나리오와 비동기 정리 절차를 등록한다. */ test } from 'node:test';
import /** assert: 실제 결과와 기대 조건을 비교해 테스트 실패를 검출한다. */ assert from 'node:assert/strict';
import { /** readFileSync: 설정·계정·테스트 소스 파일을 동기적으로 읽는다. */ readFileSync } from 'node:fs';
import /** vm: 브라우저·표시 코드를 격리 문맥에서 실행한다. */ vm from 'node:vm';
const /** context: 그리기 또는 테스트용 격리 실행 문맥. */ context=vm.createContext({});
vm.runInContext(readFileSync(new URL('../public/viewport.js',import.meta.url),'utf8'),context);
const /** view: 주어진 화면 크기의 카메라 설정 조회 함수. */ view=/** view: 지정한 화면 크기에 대한 카메라 계산을 테스트 문맥에서 호출한다. */ (/** w: 화면 너비 또는 메시지 대기자. */ w,/** h: 검증할 화면 높이. */ h)=>vm.runInContext(`calculateViewport(${w},${h})`,context);
const /** near: 거리 우선순위 검증 대상 또는 근사값 비교 함수. */ near=/** near: 부동소수점 오차 범위 안에서 두 계산값이 같은지 확인한다. */ (/** a: 첫 번째 검증용 값·개체·접속 결과. */ a,/** b: 두 번째 검증용 값·개체·접속 결과. */ b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('baseline camera is 19 by 10 player diameters, independent of resolution',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  for(const /** w: 화면 너비 또는 메시지 대기자; h: 검증할 화면 높이. */ [w,h] of [[1900,1000],[950,500],[380,200]]){
    const /** v: 검증 중인 카메라 결과 또는 표시 이동기. */ v=view(w,h);near(v.worldWidth/36,19);near(v.worldHeight/36,10);
    near(v.pixelWidth,w);near(v.pixelHeight,h);near(v.left,0);near(v.top,0);
    near(36*v.scale/w,1/19);
  }
});
test('height adapts to aspect and clamps to 8..15 without stretching the world',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  for(const /** w: 화면 너비 또는 메시지 대기자; h: 검증할 화면 높이. */ [w,h] of [[1067,480],[657,416],[816,616],[1900,800],[1900,1500],[2400,800],[1200,1000]]){
    const /** v: 검증 중인 카메라 결과 또는 표시 이동기. */ v=view(w,h);near(v.worldWidth,684);
    assert.ok(v.worldHeight>=288&&v.worldHeight<=540);
    assert.ok(v.pixelWidth<=w+1e-7 && v.pixelHeight<=h+1e-7);
    near(v.pixelWidth/v.worldWidth,v.pixelHeight/v.worldHeight);
    near(v.left*2+v.pixelWidth,w);near(v.top*2+v.pixelHeight,h);
  }
  near(view(2400,800).worldHeight/36,8);assert.ok(view(2400,800).left>0);
  near(view(1200,1000).worldHeight/36,15);assert.ok(view(1200,1000).top>0);
});
test('portrait is unsupported while square and landscape viewports remain usable',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
  assert.equal(view(480,1067).portrait,true);assert.equal(view(1067,480).portrait,false);
  assert.equal(view(800,800).portrait,false);
});

test('web portrait keeps baseline 19:10 while app requires landscape',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ ()=>{
 const /** web: 웹 모드의 결과. */ web=vm.runInContext('calculateViewport(400,900,"web")',context);
 near(web.worldHeight,360);near(web.pixelWidth/web.pixelHeight,1.9);assert.equal(web.blockedPortrait,false);assert.ok(web.top>0);
 const /** app: 앱 모드의 결과. */ app=vm.runInContext('calculateViewport(400,900,"app")',context);assert.equal(app.blockedPortrait,true);
});
