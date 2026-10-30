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
  const /** fetcher: 외부 인증 API를 호출하는 함수. */ fetcher = options.fetch ?? fetch;
  const /** credentials: 인증 제공자별 서버 전용 자격 설정. */ credentials = options.providers ?? {
    google:{ clientId:process.env.GOOGLE_CLIENT_ID, clientSecret:process.env.GOOGLE_CLIENT_SECRET },
    kakao:{ clientId:process.env.KAKAO_REST_API_KEY, clientSecret:process.env.KAKAO_CLIENT_SECRET },
  };
  const /** configured: 인증 제공자 설정을 테스트에서 활성화할지 여부. */ configured = /** name: 인증 제공자 또는 쿠키 이름. */ /** configured: 해당 제공자에 필요한 서버 주소·인증키가 있는지 확인한다. */ name => !!(base && credentials[name]?.clientId && credentials[name]?.clientSecret);
  const /** states: 만료 시각을 포함한 OAuth 진행 상태 맵. */ states=new Map(), /** grants: 앱 복귀용 일회성 교환 코드 맵. */ grants=new Map(), /** sessions: 앱 계정의 유효 로그인 세션 맵. */ sessions=new Map();
  const /** secure: HTTPS 환경에서만 붙이는 Secure 쿠키 속성. */ secure=base.startsWith('https://') ? '; Secure' : '';
  const /** cookie: 보안 속성을 포함한 쿠키 문자열 생성 함수. */ cookie=/** cookie: HTTPOnly·SameSite·만료 정책을 포함한 쿠키를 만든다. */ (/** name: 인증 제공자 또는 쿠키 이름. */ name,/** value: 검사하거나 변환할 현재 값. */ value,/** maxAge: 쿠키를 유지할 기간(초). */ maxAge=1800)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  const /** json: 캐시 금지 JSON 응답 전송 함수. */ json=/** json: 캐시를 막은 JSON 응답을 지정한 HTTP 상태로 전송한다. */ (/** res: HTTP 응답 작성 객체. */ res,/** status: HTTP 응답 상태 코드. */ status,/** data: 전달하거나 해석한 데이터. */ data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const /** error: 오류 정보 또는 오류 응답 처리기. */ error=/** error: 요청 실패 내용을 오류 응답으로 전달한다. */ (/** res: HTTP 응답 작성 객체. */ res,/** status: HTTP 응답 상태 코드. */ status,/** message: 사용자나 연결에 전달할 안내 내용. */ message)=>json(res,status,{error:message});
  const /** accountView: 공개 가능한 계정 필드만 선택하는 함수. */ accountView=/** a: 비교할 첫 문자열 또는 공개할 계정. */ /** accountView: 클라이언트에 공개해도 되는 계정 정보만 선택한다. */ a=>({id:a.id,displayName:a.displayName,provider:a.provider});
  /** session: 요청 쿠키로 유효한 앱 로그인 세션을 조회하고 만료 항목을 제거한다. */ function session(/** req: 수신한 HTTP 요청. */ req) {
    const /** token: 세션 또는 인증 응답의 토큰. */ token=cookies(req).subtrpg_app, /** s: 조회한 앱 세션. */ s=sessions.get(token);
    if(!s||s.expires<Date.now()){sessions.delete(token);return null;}return {...s,token};
  }
  /** authorize: 앱 세션·출처·CSRF 토큰을 확인해 계정 변경 요청을 허가한다. */ function authorize(/** req: 수신한 HTTP 요청. */ req,/** res: HTTP 응답 작성 객체. */ res) {
    const /** s: 조회한 앱 세션. */ s=session(req);
    if(!appRequest(req)||!s){error(res,401,'LOGIN_REQUIRED');return null;}
    if(req.headers.origin!==base || !equal(req.headers['x-csrf-token'],s.csrf)){error(res,403,'FORBIDDEN');return null;}
    return s;
  }
  const /** cleanup: 만료된 인증 데이터를 제거하는 주기 타이머. */ cleanup=setInterval(/** 등록한 주기에 맞춰 상태 갱신이나 정리 작업을 반복한다. */ ()=>{
    const /** now: 현재 처리 시각(밀리초). */ now=Date.now();for(const /** map: 정리할 인증 데이터 맵. */ map of [states,grants,sessions])for(const /** key: 현재 항목의 식별 키; value: 검사하거나 변환할 현재 값. */ [key,value]of map)if(value.expires<now)map.delete(key);
  },60000);cleanup.unref();
  return {
    /** identity: 앱 모드의 유효 세션만 계정 신원으로 변환한다. 웹은 게스트를 유지한다. */ identity(/** req: 수신한 HTTP 요청. */ req,/** mode: 웹 게스트와 APK 계정을 구분하는 접속 모드. */ mode) { if(mode!=='app')return null;const /** s: 조회한 앱 세션. */ s=session(req);return s?store.find(s.accountId):null; },
    /** close: 반복 작업이나 연결을 정리하여 사용 중인 자원을 해제한다. */ close(){clearInterval(cleanup);},
    /** handle: 요청 경로에 맞는 인증·계정 API를 처리하고 처리 여부를 반환한다. */ async handle(/** req: 수신한 HTTP 요청. */ req,/** res: HTTP 응답 작성 객체. */ res) {
      const /** url: 해석하거나 접속할 URL. */ url=new URL(req.url,'http://local');const /** path: 요청 또는 파일의 경로. */ path=url.pathname;
      if(!path.startsWith('/auth/')&&!path.startsWith('/api/'))return false;
      try {
        if(path==='/api/session'&&req.method==='GET'){
          const /** s: 조회한 앱 세션. */ s=appRequest(req)?session(req):null, /** a: 비교할 첫 문자열 또는 공개할 계정. */ a=s?store.find(s.accountId):null;
          json(res,200,{mode:appRequest(req)?'app':'web',account:a?accountView(a):null,settings:a?a.settings:defaultSettings(),csrf:a?s.csrf:null,providers:{google:configured('google'),kakao:configured('kakao')}});return true;
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
