// Mode selects UX, never grants identity. Accounts require a server session.
const CLIENT_MODE = /SubTRPG-Android\/1/.test(navigator.userAgent || '') && location.pathname === '/app' ? 'app' : 'web';
let accountProfile = null;
let userSettings = { controlScale: 1, showNames: true, targetPriority: 'nearest' };
let settingsCsrf = null;
function applyUserSettings() {
  document.documentElement.style.setProperty('--control-scale', String(userSettings.controlScale));
  document.getElementById('control-scale').value = String(userSettings.controlScale);
  document.getElementById('show-names').checked = userSettings.showNames;
  for (const value of ['nearest','lowestHealth','lowestHealthRatio']) document.getElementById('target-' + value).checked = value === (userSettings.targetPriority ?? 'nearest');
}
async function initializeClient() {
  document.getElementById('client-kind').textContent = CLIENT_MODE === 'web' ? '웹 게스트' : 'APK · 로그인 확인 중';
  applyUserSettings();
  syncTargetPriority();
  if (CLIENT_MODE === 'web') { connect(); return; }
  try {
    const response = await fetch('/api/session', { headers: { 'X-Client-Mode': 'app' }, cache: 'no-store' });
    const data = await response.json();
    document.getElementById('account-login').hidden = !!data.account;
    document.getElementById('home').hidden = !data.account;
    if (!data.account) {
      document.getElementById('connection').textContent = '앱 계정으로 로그인해 주세요.';
      for (const provider of ['google','kakao']) {
        const button = document.getElementById('login-' + provider);
        button.setAttribute('aria-disabled', String(!data.providers?.[provider]));
      }
      return;
    }
    accountProfile = data.account; settingsCsrf = data.csrf;
    const cacheKey = 'subtrpg:account:' + data.account.id + ':settings';
    userSettings = data.settings;
    try { localStorage.setItem(cacheKey, JSON.stringify(userSettings)); } catch {}
    applyUserSettings();
    document.getElementById('client-kind').textContent = `APK · ${data.account.displayName}`;
    document.getElementById('name').value = data.account.displayName;
    document.getElementById('logout').hidden = false;
    connect();
  } catch { document.getElementById('connection').textContent = '계정 서버에 연결할 수 없습니다. 앱을 다시 실행해 주세요.'; }
}
async function saveUserSettings() {
  userSettings = { controlScale: Number(document.getElementById('control-scale').value), showNames: document.getElementById('show-names').checked, targetPriority: ['nearest','lowestHealth','lowestHealthRatio'].find(value => document.getElementById('target-' + value).checked) ?? 'nearest' };
  applyUserSettings();
  syncTargetPriority();
  if (CLIENT_MODE === 'web') { document.getElementById('settings-status').textContent = '게스트 설정 · 현재 접속 중에만 적용'; return; }
  if (!accountProfile) return;
  try { localStorage.setItem('subtrpg:account:' + accountProfile.id + ':settings', JSON.stringify(userSettings)); } catch {}
  try {
    const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type':'application/json', 'X-Client-Mode':'app', 'X-CSRF-Token':settingsCsrf }, body: JSON.stringify(userSettings) });
    if (!response.ok) throw Error('Save failed');
    document.getElementById('settings-status').textContent = '계정 설정을 서버와 이 기기에 저장했습니다.';
  } catch { document.getElementById('settings-status').textContent = '기기 저장 완료 · 서버 동기화 실패. 다시 저장해 주세요.'; }
}
document.getElementById('control-scale').onchange = saveUserSettings;
document.getElementById('show-names').onchange = saveUserSettings;
for (const value of ['nearest','lowestHealth','lowestHealthRatio']) document.getElementById('target-' + value).onchange = saveUserSettings;
document.getElementById('logout').onclick = async () => {
  try {
  const response = await fetch('/api/logout', { method:'POST', headers:{ 'X-Client-Mode':'app', 'X-CSRF-Token':settingsCsrf } });
  if (response.ok) location.replace('/app');
  else document.getElementById('settings-status').textContent = '로그아웃을 완료하지 못했습니다.';
  } catch { document.getElementById('settings-status').textContent = '서버 연결을 확인한 뒤 로그아웃을 다시 시도해 주세요.'; }
};
