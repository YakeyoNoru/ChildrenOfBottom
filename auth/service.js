import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createAccountStore, defaultSettings, validateSettings } from './accounts.js';
const random = () => randomBytes(32).toString('base64url');
const hash = text => createHash('sha256').update(text).digest('base64url');
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
const appRequest = req => req.headers['x-client-mode'] === 'app' || /SubTRPG-Android\/1/.test(req.headers['user-agent'] || '');
const providers = {
  google: { authorize:'https://accounts.google.com/o/oauth2/v2/auth', token:'https://oauth2.googleapis.com/token', user:'https://openidconnect.googleapis.com/v1/userinfo', scope:'openid profile' },
  kakao: { authorize:'https://kauth.kakao.com/oauth/authorize', token:'https://kauth.kakao.com/oauth/token', user:'https://kapi.kakao.com/v2/user/me' },
};
async function body(req) {
  let data='';for await (const chunk of req) { data+=chunk; if(data.length>4096)throw Error('BODY_TOO_LARGE'); }return data;
}

export function createAuthService(options = {}) {
  const base = options.baseUrl ?? process.env.PUBLIC_BASE_URL ?? '';
  if (base && new URL(base).origin !== base) throw Error('PUBLIC_BASE_URL must be an origin without trailing slash');
  const store = options.store ?? createAccountStore(options.accountsFile ?? process.env.ACCOUNTS_FILE ?? '.data/accounts.json');
  const fetcher = options.fetch ?? fetch;
  const credentials = options.providers ?? {
    google:{ clientId:process.env.GOOGLE_CLIENT_ID, clientSecret:process.env.GOOGLE_CLIENT_SECRET },
    kakao:{ clientId:process.env.KAKAO_REST_API_KEY, clientSecret:process.env.KAKAO_CLIENT_SECRET },
  };
  const configured = name => !!(base && credentials[name]?.clientId && credentials[name]?.clientSecret);
  const states=new Map(), grants=new Map(), sessions=new Map();
  const secure=base.startsWith('https://') ? '; Secure' : '';
  const cookie=(name,value,maxAge=1800)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const error=(res,status,message)=>json(res,status,{error:message});
  const accountView=a=>({id:a.id,displayName:a.displayName,provider:a.provider});
  function session(req) {
    const token=cookies(req).subtrpg_app, s=sessions.get(token);
    if(!s||s.expires<Date.now()){sessions.delete(token);return null;}return {...s,token};
  }
  function authorize(req,res) {
    const s=session(req);
    if(!appRequest(req)||!s){error(res,401,'LOGIN_REQUIRED');return null;}
    if(req.headers.origin!==base || !equal(req.headers['x-csrf-token'],s.csrf)){error(res,403,'FORBIDDEN');return null;}
    return s;
  }
  const cleanup=setInterval(()=>{
    const now=Date.now();for(const map of [states,grants,sessions])for(const [key,value]of map)if(value.expires<now)map.delete(key);
  },60000);cleanup.unref();
  return {
    identity(req,mode) { if(mode!=='app')return null;const s=session(req);return s?store.find(s.accountId):null; },
    close(){clearInterval(cleanup);},
    async handle(req,res) {
      const url=new URL(req.url,'http://local');const path=url.pathname;
      if(!path.startsWith('/auth/')&&!path.startsWith('/api/'))return false;
      try {
        if(path==='/api/session'&&req.method==='GET'){
          const s=appRequest(req)?session(req):null, a=s?store.find(s.accountId):null;
          json(res,200,{mode:appRequest(req)?'app':'web',account:a?accountView(a):null,settings:a?a.settings:defaultSettings(),csrf:a?s.csrf:null,providers:{google:configured('google'),kakao:configured('kakao')}});return true;
        }
        if(path==='/api/settings'&&req.method==='PUT'){
          const s=authorize(req,res);if(!s)return true;
          let settings;try{settings=validateSettings(JSON.parse(await body(req)));}catch{return error(res,400,'INVALID_SETTINGS'),true;}
          json(res,200,{settings:store.saveSettings(s.accountId,settings)});return true;
        }
        if(path==='/api/logout'&&req.method==='POST'){
          const s=authorize(req,res);if(!s)return true;sessions.delete(s.token);
          res.setHeader('Set-Cookie',cookie('subtrpg_app','',0));json(res,200,{ok:true});return true;
        }
        if(path==='/auth/app-session'&&req.method==='POST'){
          const data=new URLSearchParams(await body(req));const grant=grants.get(data.get('code'));
          if(!grant||grant.expires<Date.now()||!/^[A-Za-z0-9_-]{43,128}$/.test(data.get('verifier')||'')||!equal(hash(data.get('verifier')),grant.challenge))return error(res,400,'INVALID_APP_GRANT'),true;
          grants.delete(data.get('code'));
          const token=random();sessions.set(token,{accountId:grant.accountId,csrf:random(),expires:Date.now()+30*86400000});
          res.writeHead(303,{'Set-Cookie':cookie('subtrpg_app',token,30*86400),Location:'/app','Cache-Control':'no-store'});res.end();return true;
        }
        const match=path.match(/^\/auth\/(start|callback)\/(google|kakao)$/);
        if(!match)return error(res,404,'NOT_FOUND'),true;
        const [,action,name]=match,p=providers[name],c=credentials[name];
        if(!configured(name))return error(res,503,'PROVIDER_NOT_CONFIGURED'),true;
        const redirectUri=base+'/auth/callback/'+name;
        if(action==='start'&&req.method==='GET'){
          const challenge=url.searchParams.get('challenge');
          if(!/^[A-Za-z0-9_-]{43}$/.test(challenge||''))return error(res,400,'OPEN_LOGIN_FROM_APK'),true;
          if(states.size>=1000)return error(res,429,'TRY_LATER'),true;
          const state=random(),binding=random(),verifier=random();
          states.set(state,{provider:name,binding,challenge,verifier,expires:Date.now()+10*60000});
          const target=new URL(p.authorize);
          for(const [k,v]of Object.entries({client_id:c.clientId,redirect_uri:redirectUri,response_type:'code',state,...(p.scope?{scope:p.scope}:{})}))target.searchParams.set(k,v);
          if(name==='google'){target.searchParams.set('code_challenge',hash(verifier));target.searchParams.set('code_challenge_method','S256');}
          res.writeHead(302,{Location:target.toString(),'Set-Cookie':cookie('oauth_binding',binding,600),'Cache-Control':'no-store'});res.end();return true;
        }
        if(action==='callback'&&req.method==='GET'){
          const state=url.searchParams.get('state'), flow=states.get(state);
          if(!flow||flow.provider!==name||flow.expires<Date.now()||!equal(flow.binding,cookies(req).oauth_binding))return error(res,400,'INVALID_OAUTH_STATE'),true;
          states.delete(state);
          if(url.searchParams.has('error')||!url.searchParams.get('code'))return error(res,400,'LOGIN_CANCELLED'),true;
          const response=await fetcher(p.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:redirectUri,code:url.searchParams.get('code'),...(name==='google'?{code_verifier:flow.verifier}:{})}),signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw Error('PROVIDER_FAILED');
          const token=await response.json();if(!token.access_token)throw Error('PROVIDER_FAILED');
          const userResponse=await fetcher(p.user,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});
          if(!userResponse.ok)throw Error('PROVIDER_FAILED');const user=await userResponse.json();
          const subject=name==='google'?user.sub:user.id;
          if(!subject||!['string','number'].includes(typeof subject))throw Error('INVALID_IDENTITY');
          const displayName=name==='google'?user.name:user.kakao_account?.profile?.nickname;
          const account=store.upsert(name,String(subject),displayName);
          const code=random();grants.set(code,{accountId:account.id,challenge:flow.challenge,expires:Date.now()+60000});
          res.writeHead(302,{Location:'subtrpg://auth/callback?code='+code,'Cache-Control':'no-store','Set-Cookie':cookie('oauth_binding','',0)});res.end();return true;
        }
        error(res,405,'METHOD_NOT_ALLOWED');return true;
      }catch{if(!res.headersSent)error(res,502,'LOGIN_OR_STORAGE_FAILED');else res.end();return true;}
    },
  };
}
