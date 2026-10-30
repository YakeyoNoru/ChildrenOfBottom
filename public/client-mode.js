// 접속 모드는 화면 흐름만 선택한다. 계정 인증에는 서버 세션이 필요하다.
const /** CLIENT_MODE: 앱 표식과 경로로 선택한 접속 화면 모드(인증 권한 아님). */ CLIENT_MODE = /SubTRPG-Android\/1/.test(navigator.userAgent || '') && location.pathname === '/app' ? 'app' : 'web';
let /** accountProfile: 서버가 확인한 로그인 계정의 공개 정보. */ accountProfile = null;
let /** userSettings: 현재 접속자에게 적용할 조작·표시·공격우선 설정. */ userSettings = { controlScale: 1, showNames: true, targetPriority: 'nearest' };
let /** settingsCsrf: 앱 설정 저장 요청의 위조 방지 토큰. */ settingsCsrf = null;
/** applyUserSettings: 현재 사용자 설정을 조작부 크기와 옵션 선택 UI에 적용한다. */ function applyUserSettings() {
  document.documentElement.style.setProperty('--control-scale', String(userSettings.controlScale));
  document.getElementById('control-scale').value = String(userSettings.controlScale);
  document.getElementById('show-names').checked = userSettings.showNames;
  for (const /** value: 검사하거나 변환할 현재 값. */ value of ['nearest','lowestHealth','lowestHealthRatio']) document.getElementById('target-' + value).checked = value === (userSettings.targetPriority ?? 'nearest');
}
/** initializeClient: 웹은 게스트로 연결하고 APK는 계정을 확인한 뒤 로그인 또는 게임을 연다. */ async function initializeClient() {
  document.getElementById('client-kind').textContent = CLIENT_MODE === 'web' ? '웹 게스트' : 'APK · 로그인 확인 중';
  applyUserSettings();
  syncTargetPriority();
  if (CLIENT_MODE === 'web') { connect(); return; }
  try {
    const /** response: HTTP 요청에 대한 응답. */ response = await fetch('/api/session', { headers: { 'X-Client-Mode': 'app' }, cache: 'no-store' });
    const /** data: 전달하거나 해석한 데이터. */ data = await response.json();
    document.getElementById('account-login').hidden = !!data.account;
    document.getElementById('home').hidden = !data.account;
    if (!data.account) {
      document.getElementById('connection').textContent = '앱 계정으로 로그인해 주세요.';
      for (const /** provider: 구글·카카오 로그인 제공자 구분. */ provider of ['google','kakao']) {
        const /** button: 이벤트를 연결하거나 상태를 표시할 버튼 요소. */ button = document.getElementById('login-' + provider);
        button.setAttribute('aria-disabled', String(!data.providers?.[provider]));
      }
      return;
    }
    accountProfile = data.account; settingsCsrf = data.csrf;
    const /** cacheKey: 계정별 로컬 설정 캐시 키. */ cacheKey = 'subtrpg:account:' + data.account.id + ':settings';
    userSettings = data.settings;
    try { localStorage.setItem(cacheKey, JSON.stringify(userSettings)); } catch {}
    applyUserSettings();
    document.getElementById('client-kind').textContent = `APK · ${data.account.displayName}`;
    document.getElementById('name').value = data.account.displayName;
    document.getElementById('logout').hidden = false;
    connect();
  } catch { document.getElementById('connection').textContent = '계정 서버에 연결할 수 없습니다. 앱을 다시 실행해 주세요.'; }
}
/** saveUserSettings: 옵션 변경을 반영하고 앱 계정이면 로컬 캐시와 서버에 저장한다. */ async function saveUserSettings() {
  userSettings = { controlScale: Number(document.getElementById('control-scale').value), showNames: document.getElementById('show-names').checked, targetPriority: ['nearest','lowestHealth','lowestHealthRatio'].find(/** value: 검사하거나 변환할 현재 값. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ value => document.getElementById('target-' + value).checked) ?? 'nearest' };
  applyUserSettings();
  syncTargetPriority();
  if (CLIENT_MODE === 'web') { document.getElementById('settings-status').textContent = '게스트 설정 · 현재 접속 중에만 적용'; return; }
  if (!accountProfile) return;
  try { localStorage.setItem('subtrpg:account:' + accountProfile.id + ':settings', JSON.stringify(userSettings)); } catch {}
  try {
    const /** response: HTTP 요청에 대한 응답. */ response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type':'application/json', 'X-Client-Mode':'app', 'X-CSRF-Token':settingsCsrf }, body: JSON.stringify(userSettings) });
    if (!response.ok) throw Error('Save failed');
    document.getElementById('settings-status').textContent = '계정 설정을 서버와 이 기기에 저장했습니다.';
  } catch { document.getElementById('settings-status').textContent = '기기 저장 완료 · 서버 동기화 실패. 다시 저장해 주세요.'; }
}
document.getElementById('control-scale').onchange = saveUserSettings;
document.getElementById('show-names').onchange = saveUserSettings;
for (const /** value: 검사하거나 변환할 현재 값. */ value of ['nearest','lowestHealth','lowestHealthRatio']) document.getElementById('target-' + value).onchange = saveUserSettings;
document.getElementById('logout').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ async () => {
  try {
  const /** response: HTTP 요청에 대한 응답. */ response = await fetch('/api/logout', { method:'POST', headers:{ 'X-Client-Mode':'app', 'X-CSRF-Token':settingsCsrf } });
  if (response.ok) location.replace('/app');
  else document.getElementById('settings-status').textContent = '로그아웃을 완료하지 못했습니다.';
  } catch { document.getElementById('settings-status').textContent = '서버 연결을 확인한 뒤 로그아웃을 다시 시도해 주세요.'; }
};
