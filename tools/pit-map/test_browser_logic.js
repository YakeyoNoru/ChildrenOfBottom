/* 브라우저 생성·검증 코드의 시드와 Python 구현 일치 여부를 Node에서 검사한다. */
const /** fs: 현재 지도 생성·표시·검사 단계에서 사용하는 fs 처리 자료. */ fs=require('fs'),/** assert: 현재 지도 생성·표시·검사 단계에서 사용하는 assert 처리 자료. */ assert=require('node:assert/strict'); // 파일 읽기와 표준 검증 도구.
global.layoutBank=JSON.parse(fs.readFileSync(__dirname+'/layout_bank.json')); // 모든 수량 조합에 대한 배치 자료.
const /** generate: 현재 지도 생성·표시·검사 단계에서 사용하는 generate 처리 자료; validate: 현재 지도 생성·표시·검사 단계에서 사용하는 validate 처리 자료; selectTiles: 현재 지도 생성·표시·검사 단계에서 사용하는 selectTiles 처리 자료. */ {generate,validate,selectTiles}=require('./pit.js'); // 브라우저와 공유할 생성·검증 함수.
for(let /** seed: 같은 지도와 추첨을 재현하는 32비트 시드. */ seed=0;seed<1000;seed++){ // 검사할 게임 시드.
  const /** result: 현재 계산 또는 검증 후 반환할 결과. */ result=generate(seed); // 독립 추첨부터 시작한 실제 생성 결과.
  assert.equal(validate(result).valid,true);
}
const /** invalidPrevious: 현재 지도 생성·표시·검사 단계에서 사용하는 invalidPrevious 처리 자료. */ invalidPrevious=JSON.parse(fs.readFileSync(__dirname+'/invalid_previous_map.json')); // 묶음 출입 다리가 누락된 이전 지도.
assert.throws(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>validate(invalidPrevious),/연결 묶음의/);
const /** invalidUp: 현재 지도 생성·표시·검사 단계에서 사용하는 invalidUp 처리 자료. */ invalidUp=JSON.parse(fs.readFileSync(__dirname+'/invalid_previous_map_up.json')); // 위쪽 다리가 없는 묶음의 회귀 표본.
assert.throws(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>validate(invalidUp),/위쪽 다리/);
const /** missingStart: 현재 지도 생성·표시·검사 단계에서 사용하는 missingStart 처리 자료. */ missingStart=JSON.parse(fs.readFileSync(__dirname+'/invalid_missing_start.json')); // 시작점이 없는 연결 묶음.
assert.throws(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>validate(missingStart),/시작점 누락/);
const /** directionError: 현재 지도 생성·표시·검사 단계에서 사용하는 directionError 처리 자료. */ directionError=generate(20261030); // 금지된 역방향 간선을 시험할 정상 원본.
const /** pair: 현재 지도 생성·표시·검사 단계에서 사용하는 pair 처리 자료. */ pair=directionError.bridges.find(/** 조건에 맞는 첫 타일 또는 다리를 조회한다 · a: 비교하거나 연결할 첫 타일 인덱스 또는 좌표; b: 비교하거나 연결할 두 번째 타일 인덱스 또는 좌표. */ ([a,b])=>new Set([directionError.tiles[a].height,directionError.tiles[b].height]).has(2)&&new Set([directionError.tiles[a].height,directionError.tiles[b].height]).has(3)); // 2↔3 다리 한 개.
directionError.movementArcs.push(directionError.tiles[pair[0]].height===3?[pair[0],pair[1]]:[pair[1],pair[0]]);
assert.throws(/** 현재 항목의 생성·변환·판정 또는 입력 이벤트를 처리한다. */ ()=>validate(directionError),/이동 방향/);
const /** pythonMap: 현재 지도 생성·표시·검사 단계에서 사용하는 pythonMap 처리 자료. */ pythonMap=JSON.parse(fs.readFileSync(__dirname+'/sample_20261030.json')); // 같은 시드의 Python 생성 결과.
const /** browserMap: 현재 지도 생성·표시·검사 단계에서 사용하는 browserMap 처리 자료. */ browserMap=generate(20261030); // 브라우저 구현의 동일 시드 결과.
assert.deepEqual(browserMap.tiles,pythonMap.tiles);assert.deepEqual(browserMap.bridges,pythonMap.bridges);assert.deepEqual(browserMap.selectedOptional,pythonMap.selectedOptional);
console.log(JSON.stringify({validatedSeeds:1000,pythonBrowserMatch:true,selectedOptional:browserMap.selectedOptional,/** tileCount: 추첨 결과를 포함한 전체 타일 수. */ tileCount:browserMap.tiles.length}));
