/* 실제 브라우저에서 확률 추첨·지도·필드 통로·모바일 화면을 확인한다. */
const /** chromium: 현재 지도 생성·표시·검사 단계에서 사용하는 chromium 처리 자료. */ {chromium}=require('playwright'),/** fs: 현재 지도 생성·표시·검사 단계에서 사용하는 fs 처리 자료. */ fs=require('fs'); // 브라우저 자동 검사와 결과 파일 저장 도구.
(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ async()=>{
  const /** browser: 현재 지도 생성·표시·검사 단계에서 사용하는 browser 처리 자료. */ browser=await chromium.launch({executablePath:process.env.PIT_CHROMIUM||'/tmp/pit-chromium',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true}); // 이번 검사 전용 브라우저.
  const /** page: 현재 지도 생성·표시·검사 단계에서 사용하는 page 처리 자료. */ page=await browser.newPage({viewport:{width:1440,/** height: 번호에 고정된 논리 지형 높이. */ height:1080}}),/** errors: 현재 지도 생성·표시·검사 단계에서 사용하는 errors 처리 자료. */ errors=[]; // 실행 화면과 브라우저 오류 목록.
  page.on('pageerror',/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · error: 현재 검증 또는 실행 중 발생한 오류. */ error=>errors.push(error.message));
  await page.goto('file://'+require('node:path').resolve(__dirname,'../../public/pit-map.html'));await page.evaluate(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>document.fonts.ready);
  const /** results: 현재 지도 생성·표시·검사 단계에서 사용하는 results 처리 자료. */ results=[]; // 샘플별 실제 이동 통로 검사 결과.
  for(const /** seed: 같은 지도와 추첨을 재현하는 32비트 시드. */ seed of [20261030,29,56791]){ // 일반 추첨·최대 60개·최소 50개 샘플.
    await page.locator('#seed').fill(String(seed));await page.click('#start');
    results.push(await page.evaluate(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>{
      let /** connected: 현재 지도 생성·표시·검사 단계에서 사용하는 connected 처리 자료. */ connected=0,/** blocked: 현재 지도 생성·표시·검사 단계에서 사용하는 blocked 처리 자료. */ blocked=0; // 이동 가능 다리와 차단된 비연결 인접면 수.
      for(const /** a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ [a,b] of currentMap.bridges){ // 실제 다리의 모든 통로를 연속 표본 검사.
        const /** p: 현재 지도 생성·표시·검사 단계에서 사용하는 p 처리 자료. */ p=center(currentMap.tiles[a]),/** q: 육각형 격자의 첫 축 정수 좌표. */ q=center(currentMap.tiles[b]); // 다리 양 끝의 필드 좌표.
        for(let /** step: 경로 검사 또는 60도 회전의 진행 횟수. */ step=0;step<=100;step++){/* 통로 안의 검사 위치. */if(!walkable(p.x+(q.x-p.x)*step/100,p.y+(q.y-p.y)*step/100))throw Error('다리 통로 단절');}connected++;
      }
      for(let /** a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표. */ a=0;a<currentMap.tiles.length;a++)for(let /** b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ b=a+1;b<currentMap.tiles.length;b++){ // 다리가 없는 인접면의 차단 검사.
        if(adjacent(currentMap.tiles[a],currentMap.tiles[b])&&!currentMap.bridges.some(/** 요구 조건을 만족하는 이웃 또는 번호가 있는지 판정한다 · x: 필드의 가로 좌표(픽셀); y: 필드의 세로 좌표(픽셀). */ ([x,y])=>(a===x&&b===y)||(a===y&&b===x))){
          const /** p: 현재 지도 생성·표시·검사 단계에서 사용하는 p 처리 자료. */ p=center(currentMap.tiles[a]),/** q: 육각형 격자의 첫 축 정수 좌표. */ q=center(currentMap.tiles[b]); // 인접 슬롯의 중심.
          if(walkable((p.x+q.x)/2,(p.y+q.y)/2))throw Error('없는 다리 통과');blocked++;
        }
      }
      let /** oneWay: 현재 지도 생성·표시·검사 단계에서 사용하는 oneWay 처리 자료. */ oneWay=0,/** bidirectional: 현재 지도 생성·표시·검사 단계에서 사용하는 bidirectional 처리 자료. */ bidirectional=0; // 예외 다리와 일반 다리의 실제 이동 판정 검사 수.
      for(const /** a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ [a,b] of currentMap.bridges){
        const /** p: 현재 지도 생성·표시·검사 단계에서 사용하는 p 처리 자료. */ p=center(currentMap.tiles[a]),/** q: 육각형 격자의 첫 축 정수 좌표. */ q=center(currentMap.tiles[b]),/** ha: 현재 지도 생성·표시·검사 단계에서 사용하는 ha 처리 자료. */ ha=currentMap.tiles[a].height,/** hb: 현재 지도 생성·표시·검사 단계에서 사용하는 hb 처리 자료. */ hb=currentMap.tiles[b].height; // 양 끝의 필드 좌표와 높이.
        if(Math.min(ha,hb)===2&&Math.max(ha,hb)===3){
          const /** low: 다리의 낮은 높이 끝점. */ low=ha===2?p:q,/** high: 다리의 높은 높이 끝점. */ high=ha===3?p:q; // 허용 방향의 낮은 끝과 높은 끝.
          if(!canMove(low.x,low.y,high.x,high.y)||canMove(high.x,high.y,low.x,low.y))throw Error('단방향 통행 오류');
          let /** x: 필드의 가로 좌표(픽셀). */ x=low.x,/** y: 필드의 세로 좌표(픽셀). */ y=low.y; // 실제 프레임 크기로 따라갈 전진 위치.
          for(let /** step: 경로 검사 또는 60도 회전의 진행 횟수. */ step=1;step<=100;step++){const /** nx: 현재 지도 생성·표시·검사 단계에서 사용하는 nx 처리 자료. */ nx=low.x+(high.x-low.x)*step/100,/** ny: 현재 지도 생성·표시·검사 단계에서 사용하는 ny 처리 자료. */ ny=low.y+(high.y-low.y)*step/100;/* 다음 통로 위치. */if(!canMove(x,y,nx,ny))throw Error('허용 방향 통로 단절');x=nx;y=ny;}
          oneWay++;
        }else{if(!canMove(p.x,p.y,q.x,q.y)||!canMove(q.x,q.y,p.x,p.y))throw Error('일반 다리 양방향 오류');bidirectional++;}
      }
      return {oneWayBridgesChecked:oneWay,bidirectionalBridgesChecked:bidirectional,/** seed: 같은 지도와 추첨을 재현하는 32비트 시드. */ seed:currentMap.seed,/** tileCount: 추첨 결과를 포함한 전체 타일 수. */ tileCount:currentMap.tiles.length,selectedOptional:currentMap.selectedOptional,connectedBridges:connected,blockedSides:blocked};
    }));
  }
  await page.locator('#seed').fill('20261030');await page.click('#start');
  await page.screenshot({path:__dirname+'/field_preview.png',fullPage:true});await page.click('#toggle');await page.screenshot({path:__dirname+'/map_screen.png',fullPage:true});await page.click('#toggle');
  const /** before: 이동 전 단방향 경계의 어느 쪽인지 나타내는 부호. */ before=await page.evaluate(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>player.x); // 키 입력 전 플레이어 위치.
  await page.keyboard.down('d');await page.waitForTimeout(100);await page.keyboard.up('d');if(await page.evaluate(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>player.x)<=before)throw Error('이동 입력 실패');
  await page.setViewportSize({width:390,/** height: 번호에 고정된 논리 지형 높이. */ height:844});if(await page.evaluate(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>document.body.scrollWidth>innerWidth))throw Error('모바일 가로 넘침');
  fs.writeFileSync(__dirname+'/browser_qa_results.json',JSON.stringify({results,keyboardMovement:true,mobileWidth:390,consoleErrors:errors},null,2));await browser.close();if(errors.length)throw Error(errors.join(','));console.log(results);
})().catch(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다 · error: 현재 검증 또는 실행 중 발생한 오류. */ error=>{console.error(error);process.exit(1);});
