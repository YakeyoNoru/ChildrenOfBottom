import { /** TargetPriority: 허용하는 공격 우선대상 선택 방식. */ TargetPriority } from '../game/status.js';
import { /** randomUUID: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ randomUUID } from 'node:crypto';
import { /** readFileSync: 설정·계정·테스트 소스 파일을 동기적으로 읽는다. */ readFileSync, /** mkdirSync: 계정 데이터를 저장할 폴더를 준비한다. */ mkdirSync, /** writeFileSync: 계정 임시 파일을 제한된 권한으로 기록한다. */ writeFileSync, /** renameSync: 임시 파일을 실제 계정 파일로 교체한다. */ renameSync } from 'node:fs';
import { /** dirname: 계정 파일이 속한 상위 폴더 경로를 구한다. */ dirname } from 'node:path';

export const /** defaultSettings: 새 계정에 사용할 기본 설정 생성 함수. */ defaultSettings = /** defaultSettings: 새 계정에 적용할 기본 조작·표시 설정을 만든다. */ () => ({ controlScale: 1, showNames: true });
export /** validateSettings: 설정값이 허용 범위에 있는지 검사하고 저장용 값만 반환한다. */ function validateSettings(/** value: 검사하거나 변환할 현재 값. */ value) {
  if (!value || ![.75,1,1.25,1.5].includes(value.controlScale) || typeof value.showNames !== 'boolean') throw Error('INVALID_SETTINGS');
  if (value.targetPriority !== undefined && !TargetPriority.includes(value.targetPriority)) throw Error('INVALID_SETTINGS');
  return { controlScale: value.controlScale, showNames: value.showNames, ...(value.targetPriority !== undefined ? {targetPriority:value.targetPriority} : {}) };
}
export /** createAccountStore: 계정 파일을 읽고 조회·생성·설정 저장 인터페이스를 제공한다. */ function createAccountStore(/** file: 읽거나 저장할 파일 경로. */ file = '.data/accounts.json') {
  let /** accounts: 영구 게임 계정 목록. */ accounts = [];
  try { accounts = JSON.parse(readFileSync(file, 'utf8')); if (!Array.isArray(accounts)) throw Error('Invalid account file'); }
  catch (/** error: 오류 정보 또는 오류 응답 처리기. */ error) { if (error.code !== 'ENOENT') throw error; }
  const /** persist: 계정 파일을 교체 저장하는 함수. */ persist = /** next: 다음에 저장하거나 처리할 데이터. */ /** persist: 임시 파일을 교체하는 방식으로 계정 목록을 저장한다. */ next => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 }); renameSync(file + '.tmp', file); accounts = next; };
  return {
    /** find: 식별자가 일치하는 계정을 조회한다. */ find(/** id: 대상 개체 또는 요소의 식별자. */ id) { return accounts.find(/** a: 첫 번째 비교 값 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ a => a.id === id); },
    /** upsert: 제공자와 사용자 ID에 대응하는 계정을 재사용하거나 새로 저장한다. */ upsert(/** provider: 구글·카카오 로그인 제공자 구분. */ provider, /** subject: 인증 제공자가 발급한 사용자 고유 식별자. */ subject, /** displayName: 게임에서 표시할 계정 이름. */ displayName) {
      let /** account: 현재 처리하는 게임 계정. */ account = accounts.find(/** a: 첫 번째 비교 값 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ a => a.provider === provider && a.subject === subject);
      if (!account) { account = { id: 'acct_' + randomUUID(), provider, subject, displayName: String(displayName || '플레이어').slice(0,20), settings: defaultSettings() }; persist([...accounts, account]); }
      return account;
    },
    /** saveSettings: 해당 계정의 검증된 설정을 영구 저장하고 결과를 반환한다. */ saveSettings(/** id: 대상 개체 또는 요소의 식별자. */ id, /** settings: 사용자 조작·표시 설정. */ settings) {
      const /** account: 현재 처리하는 게임 계정. */ account = accounts.find(/** a: 첫 번째 비교 값 또는 검증 개체. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ a => a.id === id); if (!account) throw Error('ACCOUNT_NOT_FOUND');
      const /** saved: 검증을 마친 저장 대상 설정. */ saved = validateSettings(settings); persist(accounts.map(/** a: 첫 번째 비교 값 또는 검증 개체. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ a => a.id === id ? { ...a, settings: saved } : a)); return saved;
    },
  };
}
