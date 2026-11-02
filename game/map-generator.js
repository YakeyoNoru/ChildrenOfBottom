import '../public/pit-generator.js';
import { /** readFileSync: 기존 배치 자료를 서버 시작 시 읽는 함수. */ readFileSync } from 'node:fs';
/** layouts: 기존 시제품에서 검증한 높이별 수량 조합의 배치 자료. */
const layouts=JSON.parse(readFileSync(new URL('../tools/pit-map/layout_bank.json',import.meta.url),'utf8'));
/** generator: 원본 규칙을 유지하는 서버용 생성·검증 인터페이스. */
const generator=globalThis.PitGeneratorFactory(layouts);
/** 서버가 게임 시작 시 한 번 생성해 모두에게 공유할 맵을 만든다. */
export function generateRoomMap(/** seed: 서버가 선택한 32비트 지도 시드. */ seed) {
  const /** map: 원본 생성기가 검증을 마친 지도. */ map=generator.generate(seed);
  return {...map,id:map.version+':'+map.seed,tileRadius:600/.89,landScale:.89,bridgeWidth:48};
}
