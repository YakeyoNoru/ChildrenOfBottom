import /** test: 저장소 맵 시제품 검증 시나리오를 등록한다. */ test from 'node:test';
import /** assert: 기대 동작과 실제 결과를 비교한다. */ assert from 'node:assert/strict';
import { /** execFileSync: 브라우저와 공유하는 맵 검증 코드를 독립 프로세스로 실행한다. */ execFileSync } from 'node:child_process';
import { /** fileURLToPath: 실행할 검사 파일의 절대 경로를 계산한다. */ fileURLToPath } from 'node:url';
import { /** createGameServer: 독립 시제품의 정적 경로를 검사할 서버를 만든다. */ createGameServer } from '../server.js';

test('pit map validates 1000 seeds, fixtures and Python parity', /** 맵 검증·오류 지도 거부·동일 시드 재현 결과를 확인한다. */ () => {
  const /** script: 저장소 내 맵 회귀 검증 파일 경로. */ script=fileURLToPath(new URL('../tools/pit-map/test_browser_logic.js',import.meta.url));
  const /** report: 독립 검사 프로세스가 반환한 수량과 구현 일치 여부. */ report=JSON.parse(execFileSync(process.execPath,[script],{encoding:'utf8'}));
  assert.equal(report.validatedSeeds,1000);assert.equal(report.pythonBrowserMatch,true);
});

test('pit map demo is served without exposing generator internals', /** t: 실행 후 서버 종료를 등록하는 테스트 문맥. */ async t => {
  const /** game: HTTP 정적 파일을 제공할 임시 게임 서버. */ game=createGameServer();
  t.after(/** 검사 후 임시 서버의 연결과 타이머를 종료한다. */ () => game.close());
  await new Promise(/** resolve: 서버가 포트를 할당받으면 준비 완료를 알린다. */ resolve=>game.server.listen(0,'127.0.0.1',resolve));
  const /** base: 임시 서버의 HTTP 기준 주소. */ base=`http://127.0.0.1:${game.server.address().port}`;
  const /** response: 공개 시제품 경로에 대한 HTTP 응답. */ response=await fetch(base+'/pit-map.html');
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
  const /** body: 실제 내려받은 독립 시제품 HTML. */ body=await response.text();
  assert.match(body,/구덩이 구현로직/);assert.match(body,/movementArcs/);assert.match(body,/3→2/);
  assert.equal((await fetch(base+'/tools/pit-map/layout_solver.py')).status,404);
});
