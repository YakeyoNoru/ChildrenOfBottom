// 접속 모드는 화면 흐름만 선택한다. 계정 인증에는 서버 세션이 필요하다.
const /** CLIENT_MODE: 앱 표식과 경로로 선택한 접속 화면 모드(인증 권한 아님). */ CLIENT_MODE = /SubTRPG-Android\/1/.test(navigator.userAgent || '') && location.pathname === '/app' ? 'app' : 'web';
let /** accountProfile: 서버가 확인한 로그인 계정의 공개 정보. */ accountProfile = null;
let /** userSettings: 현재 접속자에게 적용할 조작·표시·공격우선 설정. */ userSettings = { controlScale: 1, showNames: true, targetPriority: 'nearest' };
let /** settingsCsrf: 앱 설정 저장 요청의 위조 방지 토큰. */ settingsCsrf = null;
/** applyUserSettings: 현재 사용자 설정을 조작부 크기와 옵션 선택 UI에 적용한다. */ function applyUserSettings() {
  document.documentElement.style.setProperty('--control-scale', String(userSettings.controlScale));
  document.getElementById('control-scale').value = String(userSettings.controlScale);
  document.getElementById('show-names').checked = userSettings.showNames;
  updateControls();
  for (const /** value: 검사하거나 변환할 현재 값. */ value of ['nearest','lowestHealth','lowestHealthRatio']) document.getElementById('target-' + value).checked = value === (userSettings.targetPriority ?? 'nearest');
}
/** initializeClient: 웹은 게스트로 연결하고 APK는 계정을 확인한 뒤 로그인 또는 게임을 연다. */ async function initializeClient() {
  document.getElementById('client-kind').textContent = CLIENT_MODE === 'web' ? '웹 게스트' : 'APK · 로그인 확인 중';
  applyUserSettings();
  syncTargetPriority();
  if (CLIENT_MODE === 'web') {
    if(document.body.hasAttribute?.('data-test-login')) await initializeTestLogin();
    else connect();
    return;
  }
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
/** 로컬 테스트 계정의 로그인 화면과 기존 게스트 로비를 연결한다. */
async function initializeTestLogin() {
  const /** login: 테스트 로그인 화면. */ login=document.getElementById('test-login');
  const /** home: 방을 만들거나 참여하는 화면. */ home=document.getElementById('home');
  const /** feedback: 로그인 요청의 결과를 표시하는 요소. */ feedback=document.getElementById('test-login-error');
  home.hidden=true;
  try {
    const /** response: 기존 테스트 세션을 조회한 응답. */ response=await fetch('/api/session',{cache:'no-store'});
    if(!response.ok)throw Error('Session lookup failed');
    const /** data: 서버가 확인한 계정과 설정. */ data=await response.json();
    if(data.account) {
      accountProfile=data.account;settingsCsrf=data.csrf;userSettings=data.settings;applyUserSettings();
      document.getElementById('client-kind').textContent=data.account.displayName;
      document.getElementById('guest-name').hidden=true;
      const /** logout: 테스트 계정을 종료하고 로그인 화면으로 복귀하는 버튼. */ logout=document.getElementById('test-logout');
      logout.hidden=false;
      logout.onclick=/** 현재 테스트 세션을 서버에서 종료한다. */ async ()=>{
        try {
          const /** result: 로그아웃 요청 응답. */ result=await fetch('/api/test-logout',{method:'POST',headers:{'X-CSRF-Token':settingsCsrf}});
          if(!result.ok)throw Error('Logout failed');
          location.replace('/');
        }catch{notice('로그아웃을 완료하지 못했습니다.');}
      };
      connect();return;
    }
  }catch{feedback.textContent='계정 서버에 연결할 수 없습니다.';}
  if(readResumeToken()){connect();return;}
  login.hidden=false;
  document.getElementById('connection').textContent='로그인 방법을 선택해 주세요.';
  document.getElementById('test-login-guest').onclick=/** 닉네임을 입력하는 기존 게스트 흐름으로 진행한다. */ ()=>{
    login.hidden=true;connect();
  };
  document.getElementById('test-login-form').onsubmit=/** 입력한 아이디로 테스트 세션을 요청한다. */ async (/** event: 폼의 기본 이동을 막을 제출 이벤트. */ event)=>{
    event.preventDefault();
    const /** buttons: 로그인 중 중복 요청과 게스트 전환을 막을 버튼. */ buttons=[event.submitter,document.getElementById('test-login-guest')].filter(Boolean);
    for(const /** button: 요청 처리 중 잠글 조작 버튼. */ button of buttons)button.disabled=true;
    try {
      const /** id: 로그인할 테스트 계정 아이디. */ id=document.getElementById('test-login-id').value;
      const /** response: 테스트 세션 발급 결과. */ response=await fetch('/api/test-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      if(response.ok)location.replace('/');
      else feedback.textContent='등록된 아이디를 확인해 주세요.';
    }catch{feedback.textContent='계정 서버에 연결할 수 없습니다.';}
    finally{for(const /** button: 요청이 끝나 다시 사용할 조작 버튼. */ button of buttons)button.disabled=false;}
  };
}

/** 일반 이름 입력에서는 허용한 문자만 남긴다. */
document.getElementById('name').oninput=/** 키보드·붙여넣기로 입력한 이름의 허용 문자를 확인한다. */ (/** event: 닉네임 입력 이벤트. */ event)=>{
  if(!event.isComposing)event.target.value=event.target.value.replace(/[^\p{L}\p{M}\p{N}@. ]/gu,'');
};
document.getElementById('code-input').oninput=/** 방 접속코드의 입력 형식을 유지한다. */ (/** event: 접속코드 입력 이벤트. */ event)=>{
  if(!event.isComposing)event.target.value=event.target.value.replace(/[^a-f0-9]/gi,'');
};
document.getElementById('test-login-id').oninput=/** 입력한 테스트 계정 아이디에서 허용하지 않는 문자를 제거한다. */ (/** event: 아이디 입력 이벤트. */ event)=>{
  if(!event.isComposing)event.target.value=event.target.value.replace(/[^a-z0-9@.]/gi,'');
};

/** saveUserSettings: 옵션 변경을 반영하고 앱 계정이면 로컬 캐시와 서버에 저장한다. */ async function saveUserSettings() {
  userSettings = { ...(userSettings.showTouchControls!==undefined?{showTouchControls:userSettings.showTouchControls}:{}), controlScale: Number(document.getElementById('control-scale').value), showNames: document.getElementById('show-names').checked, targetPriority: ['nearest','lowestHealth','lowestHealthRatio'].find(/** value: 검사하거나 변환할 현재 값. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ value => document.getElementById('target-' + value).checked) ?? 'nearest' };
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
/** 사용자가 터치 조작부를 직접 선택하면 이후 장치 감지보다 그 선택을 우선한다. */
document.getElementById('show-touch-controls').onchange = () => {
  userSettings.showTouchControls=document.getElementById('show-touch-controls').checked;
  resetInput();inputPacket();saveUserSettings();
};
for (const /** value: 검사하거나 변환할 현재 값. */ value of ['nearest','lowestHealth','lowestHealthRatio']) document.getElementById('target-' + value).onchange = saveUserSettings;
document.getElementById('logout').onclick = /** onclick: 해당 브라우저 이벤트에서 화면 상태와 입력을 갱신한다. */ async () => {
  try {
  const /** response: HTTP 요청에 대한 응답. */ response = await fetch('/api/logout', { method:'POST', headers:{ 'X-Client-Mode':'app', 'X-CSRF-Token':settingsCsrf } });
  if (response.ok) location.replace('/app');
  else document.getElementById('settings-status').textContent = '로그아웃을 완료하지 못했습니다.';
  } catch { document.getElementById('settings-status').textContent = '서버 연결을 확인한 뒤 로그아웃을 다시 시도해 주세요.'; }
};
