import { /** isIP: 프록시에서 전달한 주소가 실제 IP 형식인지 검사한다. */ isIP } from 'node:net';
import { /** randomBytes: 방 코드와 인증 증명에 사용할 암호학적 난수를 생성한다. */ randomBytes, /** createHash: 인증 증명의 SHA-256 해시 계산기를 생성한다. */ createHash, /** timingSafeEqual: 인증 문자열을 타이밍 공격에 강한 방식으로 비교한다. */ timingSafeEqual } from 'node:crypto';
import { /** createAccountStore: 계정 파일을 읽고 조회·생성·설정 저장 인터페이스를 제공한다. */ createAccountStore, /** defaultSettings: 새 계정에 사용할 기본 설정 생성 함수. */ defaultSettings, /** validateSettings: 설정값이 허용 범위에 있는지 검사하고 저장용 값만 반환한다. */ validateSettings } from './accounts.js';
const /** random: 인증용 난수 문자열 생성 함수. */ random = /** random: 인증 상태·토큰·코드에 사용할 예측하기 어려운 난수를 만든다. */ () => randomBytes(32).toString('base64url');
const /** hash: 인증 증명 문자열의 SHA-256 해시 생성 함수. */ hash = /** text: 해시나 표시 변환의 원본 문자열. */ /** hash: PKCE 증명 검증용 SHA-256 해시를 만든다. */ text => createHash('sha256').update(text).digest('base64url');
const /** equal: 인증 문자열을 일정 시간 비교하는 함수. */ equal = /** equal: 길이와 타입을 검사한 뒤 인증 문자열을 일정 시간 방식으로 비교한다. */ (/** a: 비교할 첫 문자열 또는 공개할 계정. */ a,/** b: 비교할 두 번째 문자열. */ b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const /** cookies: 요청 쿠키를 이름별로 읽는 함수. */ cookies = /** req: 수신한 HTTP 요청. */ /** cookies: 요청의 쿠키 문자열을 이름별 값으로 분리한다. */ req => Object.fromEntries((req.headers.cookie || '').split(';').map(/** x: 분리·정리할 쿠키 항목. */ /** 각 항목을 현재 계산에 필요한 값으로 변환한다. */ x=>x.trim().split('=')).filter(/** x: 분리·정리할 쿠키 항목. */ /** 조건에 맞는 항목만 다음 처리 대상으로 남긴다. */ x=>x.length===2));
const /** appRequest: 앱 접속 표식이 있는지 확인하는 함수. */ appRequest = /** req: 수신한 HTTP 요청. */ /** appRequest: 앱 사용자 에이전트 또는 요청 헤더를 확인하되 인증 권한은 부여하지 않는다. */ req => req.headers['x-client-mode'] === 'app' || /SubTRPG-Android\/1/.test(req.headers['user-agent'] || '');
const /** providers: 인증 제공자별 공식 요청 주소와 권한 범위. */ providers = {
  google: { authorize:'https://accounts.google.com/o/oauth2/v2/auth', token:'https://oauth2.googleapis.com/token', user:'https://openidconnect.googleapis.com/v1/userinfo', scope:'openid profile' },
  kakao: { authorize:'https://kauth.kakao.com/oauth/authorize', token:'https://kauth.kakao.com/oauth/token', user:'https://kapi.kakao.com/v2/user/me' },
};
/** body: 크기를 제한하면서 HTTP 요청 본문을 끝까지 읽는다. */ async function body(/** req: 수신한 HTTP 요청. */ req) {
  let /** data: 전달하거나 해석한 데이터. */ data='';for await (const /** chunk: 순차 수신한 요청 본문 조각. */ chunk of req) { data+=chunk; if(data.length>4096)throw Error('BODY_TOO_LARGE'); }return data;
}

export /** createAuthService: 제공자 로그인·앱 세션·계정 설정 API와 만료 정리를 구성한다. */ function createAuthService(/** options: 기본값을 재정의하는 생성·요청 옵션. */ options = {}) {
  const /** base: 계정 서버 또는 테스트 서버의 기준 주소. */ base = options.baseUrl ?? process.env.PUBLIC_BASE_URL ?? '';
  if (base && new URL(base).origin !== base) throw Error('PUBLIC_BASE_URL must be an origin without trailing slash');
  const /** store: 게임 계정 조회와 저장 인터페이스. */ store = options.store ?? createAccountStore(options.accountsFile ?? process.env.ACCOUNTS_FILE ?? '.data/accounts.json');
  const /** testLoginEnabled: 로컬 테스트 서버에서만 임시 계정 로그인을 켜는 설정. */ testLoginEnabled=options.testLoginEnabled??(process.env.TEST_ACCOUNT_LOGIN==='1');
  const /** publicMemberOrigin: 사전 등록 회원 로그인을 제공하는 운영 HTTPS 주소. */ publicMemberOrigin=base==='https://arena.childrenofbottoms.duckdns.org'?base:null;
  const /** testStore: 실제 계정과 분리해 테스트 계정을 저장하는 인터페이스. */ testStore=(testLoginEnabled||publicMemberOrigin)?createAccountStore(options.testAccountsFile??'.data/test-accounts.json'):null;
  const /** testAccounts: 가입을 열기 전 서버가 등록하는 두 테스트 계정. */ testAccounts=new Map([
    ['33dot',testStore?.upsert('test','33dot','33')],
    ['noru8294',testStore?.upsert('test','noru8294','노루')],
  ]);
  /** 운영 도메인 또는 직접 연결한 로컬 테스트 주소에서 사전 등록 회원을 허용한다. */
  function allowsTestLogin(/** req: 주소와 호스트를 검사할 요청. */ req) {
    if(publicMemberOrigin&&req.headers.host===new URL(publicMemberOrigin).host)return true;
    return testLoginEnabled&&!!testStore&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&
      /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i.test(req.headers.host??'')&&
      !Object.keys(req.headers).some(/** 프록시가 덧붙인 전달 헤더를 찾는다. */ (/** name: 수신 헤더 이름. */ name)=>name==='forwarded'||name.startsWith('x-forwarded-'));
  }
  /** 회원 로그인 요청을 보낸 페이지의 허용 출처를 반환한다. */
  function memberOrigin(/** req: 호스트가 포함된 로그인 또는 로그아웃 요청. */ req) {
    return publicMemberOrigin&&req.headers.host===new URL(publicMemberOrigin).host?publicMemberOrigin:'http://'+req.headers.host;
  }
  const /** fetcher: 외부 인증 API를 호출하는 함수. */ fetcher = options.fetch ?? fetch;
  const /** credentials: 인증 제공자별 서버 전용 자격 설정. */ credentials = options.providers ?? {
    google:{ clientId:process.env.GOOGLE_CLIENT_ID, clientSecret:process.env.GOOGLE_CLIENT_SECRET },
    kakao:{ clientId:process.env.KAKAO_REST_API_KEY, clientSecret:process.env.KAKAO_CLIENT_SECRET },
  };
  const /** configured: 인증 제공자 설정을 테스트에서 활성화할지 여부. */ configured = /** name: 인증 제공자 또는 쿠키 이름. */ /** configured: 해당 제공자에 필요한 서버 주소·인증키가 있는지 확인한다. */ name => !!(base && credentials[name]?.clientId && credentials[name]?.clientSecret);
  const /** states: 만료 시각을 포함한 OAuth 진행 상태 맵. */ states=new Map(), /** grants: 앱 복귀용 일회성 교환 코드 맵. */ grants=new Map(), /** sessions: 앱 계정의 유효 로그인 세션 맵. */ sessions=new Map();
  const /** secure: HTTPS 환경에서만 붙이는 Secure 쿠키 속성. */ secure=base.startsWith('https://') ? '; Secure' : '';
  const /** cookie: 보안 속성을 포함한 쿠키 문자열 생성 함수. */ cookie=/** cookie: HTTPOnly·SameSite·만료 정책을 포함한 쿠키를 만든다. */ (/** name: 인증 제공자 또는 쿠키 이름. */ name,/** value: 검사하거나 변환할 현재 값. */ value,/** maxAge: 쿠키를 유지할 기간(초). */ maxAge=1800)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${name==='subtrpg_test'?'':secure}`;
  const /** json: 캐시 금지 JSON 응답 전송 함수. */ json=/** json: 캐시를 막은 JSON 응답을 지정한 HTTP 상태로 전송한다. */ (/** res: HTTP 응답 작성 객체. */ res,/** status: HTTP 응답 상태 코드. */ status,/** data: 전달하거나 해석한 데이터. */ data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const /** error: 오류 정보 또는 오류 응답 처리기. */ error=/** error: 요청 실패 내용을 오류 응답으로 전달한다. */ (/** res: HTTP 응답 작성 객체. */ res,/** status: HTTP 응답 상태 코드. */ status,/** message: 사용자나 연결에 전달할 안내 내용. */ message)=>json(res,status,{error:message});
  const /** accountView: 공개 가능한 계정 필드만 선택하는 함수. */ accountView=/** a: 비교할 첫 문자열 또는 공개할 계정. */ /** accountView: 클라이언트에 공개해도 되는 계정 정보만 선택한다. */ a=>({id:a.id,displayName:a.displayName,provider:a.provider});
  /** 요청 쿠키로 접속 모드에 맞는 세션을 조회하고 만료 항목을 제거한다. */ function session(/** req: 수신한 HTTP 요청. */ req,/** mode: 인증 세션의 접속 구분. */ mode='app') {
    const /** token: 세션 또는 인증 응답의 토큰. */ token=cookies(req)[mode==='web'?'subtrpg_test':'subtrpg_app'], /** s: 조회한 앱 세션. */ s=sessions.get(token);
    if(!s||s.expires<Date.now()){sessions.delete(token);return null;}return (s.mode??'app')===mode?{...s,token}:null;
  }
  /** authorize: 앱 세션·출처·CSRF 토큰을 확인해 계정 변경 요청을 허가한다. */ function authorize(/** req: 수신한 HTTP 요청. */ req,/** res: HTTP 응답 작성 객체. */ res) {
    const /** s: 조회한 앱 세션. */ s=session(req);
    if(!appRequest(req)||!s){error(res,401,'LOGIN_REQUIRED');return null;}
    if(req.headers.origin!==base || !equal(req.headers['x-csrf-token'],s.csrf)){error(res,403,'FORBIDDEN');return null;}
    return s;
  }
  const /** loginClock: 실패 횟수와 잠금 만료를 확인할 시계(밀리초). */ loginClock=options.loginClock??Date.now;
  const /** loginAttempts: IP별 연속 실패 수와 만료 시각을 보관한다. */ loginAttempts=new Map();
  /** 운영 프록시의 직접 연결에서만 전달된 접속 IP를 사용한다. */
  function loginAddress(/** req: 소켓 주소와 프록시 헤더를 검사할 요청. */ req) {
    const /** peer: 서버에 직접 연결된 주소. */ peer=req.socket.remoteAddress;
    const /** forwarded: Caddy가 마지막에 붙인 접속 주소. */ forwarded=req.headers['x-forwarded-for']?.split(',').at(-1)?.trim();
    return publicMemberOrigin&&memberOrigin(req)===publicMemberOrigin&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)&&isIP(forwarded??'')?forwarded:peer;
  }
  /** 잠금 응답에 남은 시간을 초 단위로 안내한다. */
  function rejectLocked(/** res: HTTP 잠금 응답. */ res, /** remainingMs: 잠금 해제까지 남은 밀리초. */ remainingMs) {
    res.setHeader('Retry-After',String(Math.ceil(remainingMs/1000)));
    error(res,429,'LOGIN_LOCKED');
  }
  const /** cleanup: 만료된 인증 데이터를 제거하는 주기 타이머. */ cleanup=setInterval(/** 등록한 주기에 맞춰 상태 갱신이나 정리 작업을 반복한다. */ ()=>{
    const /** now: 현재 처리 시각(밀리초). */ now=Date.now();for(const /** map: 정리할 인증 데이터 맵. */ map of [states,grants,sessions])for(const /** key: 현재 항목의 식별 키; value: 검사하거나 변환할 현재 값. */ [key,value]of map)if(value.expires<now)map.delete(key);
    for(const /** address: 접속 IP; entry: 해당 IP의 실패 기록. */ [address,entry] of loginAttempts)if(entry.expiresAt<=loginClock())loginAttempts.delete(address);
  },60000);cleanup.unref();
  return {
    allowsTestLogin,
    /** identity: 앱 또는 허용된 로컬 웹 세션을 계정 신원으로 변환한다. */ identity(/** req: 수신한 HTTP 요청. */ req,/** mode: 웹 게스트와 APK 계정을 구분하는 접속 모드. */ mode) { if(mode==='web'&&!allowsTestLogin(req))return null;const /** s: 해당 접속 모드의 로그인 세션. */ s=session(req,mode);return s?(mode==='web'?testStore:store).find(s.accountId):null; },
    /** close: 반복 작업이나 연결을 정리하여 사용 중인 자원을 해제한다. */ close(){clearInterval(cleanup);},
    /** handle: 요청 경로에 맞는 인증·계정 API를 처리하고 처리 여부를 반환한다. */ async handle(/** req: 수신한 HTTP 요청. */ req,/** res: HTTP 응답 작성 객체. */ res) {
      const /** url: 해석하거나 접속할 URL. */ url=new URL(req.url,'http://local');const /** path: 요청 또는 파일의 경로. */ path=url.pathname;
      if(!path.startsWith('/auth/')&&!path.startsWith('/api/'))return false;
      try {
        if(path==='/api/test-login'&&req.method==='POST'){
          if(!allowsTestLogin(req))return error(res,404,'NOT_FOUND'),true;
          if(req.headers.origin!==memberOrigin(req))return error(res,403,'FORBIDDEN'),true;
          let /** data: 아이디 입력을 담은 요청 본문. */ data;
          try{data=JSON.parse(await body(req));}catch{data=null;}
          const /** address: 연속 실패를 묶을 접속 IP. */ address=loginAddress(req);
          const /** now: 본문 수신을 마친 시각(밀리초). */ now=loginClock();
          const /** previous: 만료 전인 경우에만 적용할 직전 실패 기록. */ previous=loginAttempts.get(address);
          if(previous?.locked&&previous.expiresAt>now){rejectLocked(res,previous.expiresAt-now);return true;}
          const /** valid: 비밀번호 없이 허용된 형식의 아이디만 제출했는지 나타낸다. */ valid=data&&Object.keys(data).length===1&&typeof data.id==='string'&&/^[a-z0-9@.]{4,20}$/i.test(data.id);
          const /** account: 사전 등록 목록과 일치한 회원. */ account=valid?testAccounts.get(data.id.toLowerCase()):null;
          if(!account){
            const /** failures: 성공이나 만료 없이 이어진 로그인 실패 수. */ failures=(previous?.expiresAt>now?previous.failures:0)+1;
            const /** locked: 세 번째 실패부터 적용할 잠금 여부. */ locked=failures>=3;
            loginAttempts.set(address,{failures,locked,expiresAt:now+(locked?300000:1800000)});
            if(locked)rejectLocked(res,300000);
            else error(res,valid?401:400,'INVALID_LOGIN');
            return true;
          }
          loginAttempts.delete(address);
          sessions.delete(session(req,'web')?.token);
          const /** token: 계정 ID에 연결할 테스트 세션 난수. */ token=random();
          sessions.set(token,{mode:'web',accountId:account.id,csrf:random(),expires:Date.now()+1800000});
          res.setHeader('Set-Cookie',cookie('subtrpg_test',token,1800)+(memberOrigin(req)===publicMemberOrigin?'; Secure':''));
          json(res,200,{account:accountView(account)});return true;
        }
        if(path==='/api/test-logout'&&req.method==='POST'){
          if(!allowsTestLogin(req))return error(res,404,'NOT_FOUND'),true;
          const /** s: 종료할 테스트 세션. */ s=session(req,'web');
          if(req.headers.origin!==memberOrigin(req)||!s||!equal(req.headers['x-csrf-token'],s.csrf))return error(res,403,'FORBIDDEN'),true;
          sessions.delete(s.token);res.setHeader('Set-Cookie',cookie('subtrpg_test','',0)+(memberOrigin(req)===publicMemberOrigin?'; Secure':''));json(res,200,{ok:true});return true;
        }
        if(path==='/api/session'&&req.method==='GET'){
          const /** mode: 요청이 사용하는 계정 세션 구분. */ mode=appRequest(req)?'app':'web';
          const /** s: 로그인 세션. */ s=mode==='app'||allowsTestLogin(req)?session(req,mode):null, /** a: 공개 필드만 응답할 계정. */ a=s?(mode==='app'?store:testStore).find(s.accountId):null;
          json(res,200,{mode,account:a?accountView(a):null,settings:a?a.settings:defaultSettings(),csrf:a?s.csrf:null,providers:{google:configured('google'),kakao:configured('kakao')}});return true;
        }
        if(path==='/api/settings'&&req.method==='PUT'){
          const /** s: 조회한 앱 세션. */ s=authorize(req,res);if(!s)return true;
          let /** settings: 사용자 조작·표시 설정. */ settings;try{settings=validateSettings(JSON.parse(await body(req)));}catch{return error(res,400,'INVALID_SETTINGS'),true;}
          json(res,200,{settings:store.saveSettings(s.accountId,settings)});return true;
        }
        if(path==='/api/logout'&&req.method==='POST'){
          const /** s: 조회한 앱 세션. */ s=authorize(req,res);if(!s)return true;sessions.delete(s.token);
          res.setHeader('Set-Cookie',cookie('subtrpg_app','',0));json(res,200,{ok:true});return true;
        }
        if(path==='/auth/app-session'&&req.method==='POST'){
          const /** data: 전달하거나 해석한 데이터. */ data=new URLSearchParams(await body(req));const /** grant: 앱 세션으로 교환할 일회성 로그인 증명. */ grant=grants.get(data.get('code'));
          if(!grant||grant.expires<Date.now()||!/^[A-Za-z0-9_-]{43,128}$/.test(data.get('verifier')||'')||!equal(hash(data.get('verifier')),grant.challenge))return error(res,400,'INVALID_APP_GRANT'),true;
          grants.delete(data.get('code'));
          const /** token: 세션 또는 인증 응답의 토큰. */ token=random();sessions.set(token,{accountId:grant.accountId,csrf:random(),expires:Date.now()+30*86400000});
          res.writeHead(303,{'Set-Cookie':cookie('subtrpg_app',token,30*86400),Location:'/app','Cache-Control':'no-store'});res.end();return true;
        }
        const /** match: 요청 경로의 인증 작업·제공자 일치 결과. */ match=path.match(/^\/auth\/(start|callback)\/(google|kakao)$/);
        if(!match)return error(res,404,'NOT_FOUND'),true;
        const /** action: 현재 기술 입력 또는 인증 작업 종류; name: 인증 제공자 또는 쿠키 이름. */ [,action,name]=match,/** p: 현재 인증 제공자의 API 주소 설정. */ p=providers[name],/** c: 현재 인증 제공자의 서버 자격 설정. */ c=credentials[name];
        if(!configured(name))return error(res,503,'PROVIDER_NOT_CONFIGURED'),true;
        const /** redirectUri: 인증 제공자에서 돌아올 서버 콜백 주소. */ redirectUri=base+'/auth/callback/'+name;
        if(action==='start'&&req.method==='GET'){
          const /** challenge: 앱 인증 증명 검증용 해시. */ challenge=url.searchParams.get('challenge');
          if(!/^[A-Za-z0-9_-]{43}$/.test(challenge||''))return error(res,400,'OPEN_LOGIN_FROM_APK'),true;
          if(states.size>=1000)return error(res,429,'TRY_LATER'),true;
          const /** state: 요청 위조를 막는 OAuth 상태 난수. */ state=random(),/** binding: 인증 시작 브라우저를 묶는 쿠키 난수. */ binding=random(),/** verifier: 인증 코드를 안전하게 교환하기 위한 원본 증명. */ verifier=random();
          states.set(state,{provider:name,binding,challenge,verifier,expires:Date.now()+10*60000});
          const /** target: 현재 처리할 대상 또는 이동할 URL. */ target=new URL(p.authorize);
          for(const /** k: 인증 URL에 추가할 매개변수 이름; v: 인증 URL에 추가할 매개변수 값. */ [k,v]of Object.entries({client_id:c.clientId,redirect_uri:redirectUri,response_type:'code',state,...(p.scope?{scope:p.scope}:{})}))target.searchParams.set(k,v);
          if(name==='google'){target.searchParams.set('code_challenge',hash(verifier));target.searchParams.set('code_challenge_method','S256');}
          res.writeHead(302,{Location:target.toString(),'Set-Cookie':cookie('oauth_binding',binding,600),'Cache-Control':'no-store'});res.end();return true;
        }
        if(action==='callback'&&req.method==='GET'){
          const /** state: 요청 위조를 막는 OAuth 상태 난수. */ state=url.searchParams.get('state'), /** flow: 서버에 보관한 OAuth 진행 정보. */ flow=states.get(state);
          if(!flow||flow.provider!==name||flow.expires<Date.now()||!equal(flow.binding,cookies(req).oauth_binding))return error(res,400,'INVALID_OAUTH_STATE'),true;
          states.delete(state);
          if(url.searchParams.has('error')||!url.searchParams.get('code'))return error(res,400,'LOGIN_CANCELLED'),true;
          const /** response: HTTP 요청에 대한 응답. */ response=await fetcher(p.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:redirectUri,code:url.searchParams.get('code'),...(name==='google'?{code_verifier:flow.verifier}:{})}),signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw Error('PROVIDER_FAILED');
          const /** token: 세션 또는 인증 응답의 토큰. */ token=await response.json();if(!token.access_token)throw Error('PROVIDER_FAILED');
          const /** userResponse: 인증 제공자의 사용자 정보 응답. */ userResponse=await fetcher(p.user,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});
          if(!userResponse.ok)throw Error('PROVIDER_FAILED');const /** user: 인증 제공자가 반환한 사용자 정보. */ user=await userResponse.json();
          const /** subject: 인증 제공자가 발급한 사용자 고유 식별자. */ subject=name==='google'?user.sub:user.id;
          if(!subject||!['string','number'].includes(typeof subject))throw Error('INVALID_IDENTITY');
          const /** displayName: 게임에서 표시할 계정 이름. */ displayName=name==='google'?user.name:user.kakao_account?.profile?.nickname;
          const /** account: 현재 처리하는 게임 계정. */ account=store.upsert(name,String(subject),displayName);
          const /** code: 앱 복귀 시 교환할 일회성 코드. */ code=random();grants.set(code,{accountId:account.id,challenge:flow.challenge,expires:Date.now()+60000});
          res.writeHead(302,{Location:'subtrpg://auth/callback?code='+code,'Cache-Control':'no-store','Set-Cookie':cookie('oauth_binding','',0)});res.end();return true;
        }
        error(res,405,'METHOD_NOT_ALLOWED');return true;
      }catch{if(!res.headersSent)error(res,502,'LOGIN_OR_STORAGE_FAILED');else res.end();return true;}
    },
  };
}
