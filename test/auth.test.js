import { /** httpRequest: 운영 Host 헤더를 그대로 보내는 HTTP 테스트 함수. */ request as httpRequest } from 'node:http';
import { /** test: 테스트 시나리오와 비동기 정리 절차를 등록한다. */ test } from 'node:test';
import /** assert: 실제 결과와 기대 조건을 비교해 테스트 실패를 검출한다. */ assert from 'node:assert/strict';
import { /** mkdtemp: 계정 저장 테스트를 위한 독립 임시 폴더를 생성한다. */ mkdtemp, /** rm: 검증 후 임시 계정 파일과 폴더를 제거한다. */ rm } from 'node:fs/promises';
import { /** tmpdir: 운영체제 임시 폴더 위치를 조회한다. */ tmpdir } from 'node:os';
import { /** join: 플랫폼에 맞게 임시 저장 경로를 결합한다. */ join } from 'node:path';
import { /** createHash: 인증 증명의 SHA-256 해시 계산기를 생성한다. */ createHash } from 'node:crypto';
import /** WebSocket: 클라이언트 연결 생성 또는 WebSocket 연결 상태 상수를 제공한다. */ WebSocket from 'ws';
import { /** createGameServer: 방·게임 시뮬레이션·정적 파일·인증을 제공하는 서버를 생성한다. */ createGameServer } from '../server.js';
import { /** createAccountStore: 계정 파일을 읽고 조회·생성·설정 저장 인터페이스를 제공한다. */ createAccountStore } from '../auth/accounts.js';

/** setup: 테스트 서버와 정리 작업을 준비해 검증용 인터페이스를 반환한다. */ async function setup(/** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t, /** configured: 인증 제공자 설정을 테스트에서 활성화할지 여부. */ configured=true, /** testLoginEnabled: 로컬 테스트 로그인을 켤지 여부. */ testLoginEnabled=false, /** baseUrl: 운영 호스트를 재현할 기준 주소. */ baseUrl='https://game.test') {
  const /** dir: 테스트가 사용하는 임시 저장 폴더. */ dir=await mkdtemp(join(tmpdir(),'subtrpg-auth-')),/** file: 읽거나 저장할 파일 경로. */ file=join(dir,'accounts.json');
  let /** calls: 대체 인증 API 호출 기록. */ calls=[];
  const /** mockFetch: 실제 제공자 통신을 대신하는 테스트 응답 함수. */ mockFetch=/** mockFetch: 실제 인증 제공자 대신 고정 응답을 반환하고 호출을 기록한다. */ async(/** url: 해석하거나 접속할 URL. */ url,/** options: 기본값을 재정의하는 생성·요청 옵션. */ options)=>{
    calls.push({url,options});
    if(url.endsWith('/token'))return new Response(JSON.stringify({access_token:'provider-access'}));
    if(url.includes('googleapis.com'))return new Response(JSON.stringify({sub:'google-subject',name:'구글유저'}));
    return new Response(JSON.stringify({id:12345,kakao_account:{profile:{nickname:'카카오유저'}}}));
  };
  const /** game: 서버 인스턴스와 방 관리 인터페이스. */ game=createGameServer({auth:{baseUrl,accountsFile:file,testLoginEnabled,testAccountsFile:join(dir,'test-accounts.json'),providers:configured?{google:{clientId:'google-id',clientSecret:'secret'},kakao:{clientId:'kakao-id',clientSecret:'secret'}}:{},fetch:mockFetch}});
  await new Promise(/** r: 비동기 완료 콜백. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ r=>game.server.listen(0,'127.0.0.1',r));const /** base: 계정 서버 또는 테스트 서버의 기준 주소. */ base='http://127.0.0.1:'+game.server.address().port;
  t.after(/** 현재 비동기 작업의 완료 또는 후속 처리를 수행한다. */ async()=>{await game.close();await rm(dir,{recursive:true,force:true});});
  const /** request: 테스트 서버로 HTTP 요청을 보내는 함수. */ request=/** request: 테스트 서버로 요청을 보내고 자동 리디렉션 없이 응답을 받는다. */ (/** path: 요청 또는 파일의 경로. */ path,/** options: 기본값을 재정의하는 생성·요청 옵션. */ options={})=>fetch(base+path,{redirect:'manual',...options});
  /** signIn: 인증 시작부터 앱 세션 교환까지의 테스트 로그인 흐름을 실행한다. */ async function signIn(/** provider: 구글·카카오 로그인 제공자 구분. */ provider='google') {
    const /** verifier: 인증 코드를 안전하게 교환하기 위한 원본 증명. */ verifier='a'.repeat(43),/** challenge: 앱 인증 증명 검증용 해시. */ challenge=createHash('sha256').update(verifier).digest('base64url');
    const /** start: 검증 구간의 시작 상태 또는 로그인 시작 응답. */ start=await request('/auth/start/'+provider+'?challenge='+challenge);
    assert.equal(start.status,302);const /** target: 현재 처리할 대상 또는 이동할 URL. */ target=new URL(start.headers.get('location'));
    const /** binding: 인증 시작 브라우저를 묶는 쿠키 난수. */ binding=start.headers.get('set-cookie').split(';')[0];
    const /** callback: 로그인 콜백 처리 응답. */ callback=await request('/auth/callback/'+provider+'?state='+target.searchParams.get('state')+'&code=provider-code',{headers:{Cookie:binding}});
    assert.equal(callback.status,302);const /** code: 개체·기술·방 또는 오류를 식별하는 코드. */ code=new URL(callback.headers.get('location')).searchParams.get('code');
    const /** exchange: 앱 로그인 증명 교환 응답. */ exchange=await request('/auth/app-session',{method:'POST',body:new URLSearchParams({code,verifier})});
    assert.equal(exchange.status,303);const /** cookie: 보안 속성을 포함한 쿠키 문자열 생성 함수. */ cookie=exchange.headers.get('set-cookie').split(';')[0];
    const /** session: 검증할 앱 로그인 세션. */ session=await (await request('/api/session',{headers:{Cookie:cookie,'X-Client-Mode':'app'}})).json();
    return {cookie,session,code,verifier};
  }
  return {...game,request,signIn,calls,file,base};
}
test('providers require real configuration and APK proof; invalid state is rejected',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t=>{
  const /** request: 테스트 서버로 HTTP 요청을 보내는 함수. */ {request}=await setup(t,false);
  assert.equal((await request('/auth/start/google?challenge='+'a'.repeat(43))).status,503);
  const /** session: 검증할 앱 로그인 세션. */ session=await(await request('/api/session')).json();assert.equal(session.account,null);assert.equal(session.providers.google,false);
  assert.equal((await request('/api/test-login',{method:'POST',body:'{"id":"33dot"}'})).status,404);
});
test('Google/Kakao create separate stable IDs; settings persist; web stays guest even with app cookie',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t=>{
  const /** request: 테스트 서버로 HTTP 요청을 보내는 함수; signIn: 인증 흐름 전체를 실행하는 테스트 보조 함수; calls: 대체 인증 API 호출 기록; file: 읽거나 저장할 파일 경로. */ {request,signIn,calls,file}=await setup(t);
  assert.equal((await request('/auth/start/google')).status,400);
  assert.equal((await request('/auth/callback/google?state=forged&code=fake')).status,400);
  const /** a: 첫 번째 검증용 값·개체·접속 결과. */ a=await signIn(),/** b: 두 번째 검증용 값·개체·접속 결과. */ b=await signIn('kakao'),/** again: 동일 제공자로 다시 로그인한 결과. */ again=await signIn();
  assert.equal(a.session.account.id,again.session.account.id);assert.notEqual(a.session.account.id,b.session.account.id);
  assert.ok(calls.some(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.url==='https://oauth2.googleapis.com/token'&&x.options.body.get('code_verifier')));
  assert.ok(calls.some(/** x: 검증 좌표·비교 항목 또는 위치 조회 함수. */ /** 현재 항목이 조회·검증 조건을 만족하는지 판정한다. */ x=>x.url==='https://kauth.kakao.com/oauth/token'));
  const /** guest: 게스트 접속 결과 또는 게스트 연결. */ guest=await(await request('/api/session',{headers:{Cookie:a.cookie}})).json();assert.equal(guest.mode,'web');assert.equal(guest.account,null);assert.equal(guest.csrf,null);
  const /** put: 앱 설정 변경 요청을 보내는 테스트 함수. */ put=/** body: 응답 또는 요청 본문 데이터. */ /** put: 앱 세션과 CSRF 증명을 붙여 설정 저장 요청을 보낸다. */ body=>request('/api/settings',{method:'PUT',headers:{Cookie:a.cookie,'X-Client-Mode':'app',Origin:'https://game.test','X-CSRF-Token':a.session.csrf,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await put({controlScale:1.25,showNames:false})).status,200);
  const /** persisted: 파일에서 다시 읽은 계정 설정. */ persisted=createAccountStore(file).find(a.session.account.id);assert.equal(persisted.settings.controlScale,1.25);assert.equal(persisted.settings.showNames,false);
  assert.equal((await put({controlScale:100,showNames:true})).status,400);
  assert.equal((await request('/api/settings',{method:'PUT',headers:{Cookie:a.cookie,'X-Client-Mode':'app',Origin:'https://evil.test','X-CSRF-Token':a.session.csrf},body:'{}'})).status,403);
  assert.equal((await request('/api/settings',{method:'PUT',body:'{}'})).status,401);
  assert.equal((await request('/auth/app-session',{method:'POST',body:new URLSearchParams({code:a.code,verifier:a.verifier})})).status,400);
});
test('OAuth state requires its browser binding and grant requires APK verifier',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t=>{
  const /** request: 테스트 서버로 HTTP 요청을 보내는 함수. */ {request}=await setup(t);const /** challenge: 앱 인증 증명 검증용 해시. */ challenge=createHash('sha256').update('b'.repeat(43)).digest('base64url');
  const /** start: 검증 구간의 시작 상태 또는 로그인 시작 응답. */ start=await request('/auth/start/kakao?challenge='+challenge),/** state: 현재 상태 스냅샷. */ state=new URL(start.headers.get('location')).searchParams.get('state');
  assert.equal((await request('/auth/callback/kakao?state='+state+'&code=fake')).status,400);
  const /** callback: 로그인 콜백 처리 응답. */ callback=await request('/auth/callback/kakao?state='+state+'&code=real',{headers:{Cookie:start.headers.get('set-cookie').split(';')[0]}});
  const /** code: 개체·기술·방 또는 오류를 식별하는 코드. */ code=new URL(callback.headers.get('location')).searchParams.get('code');
  assert.equal((await request('/auth/app-session',{method:'POST',body:new URLSearchParams({code,verifier:'x'.repeat(43)})})).status,400);
  assert.equal((await request('/auth/app-session',{method:'POST',body:new URLSearchParams({code,verifier:'b'.repeat(43)})})).status,303);
  assert.equal((await request('/auth/callback/kakao?state='+state+'&code=real',{headers:{Cookie:start.headers.get('set-cookie').split(';')[0]}})).status,400);
});
test('app WebSockets require login; web ignores app identity; logout revokes API session',/** 이 테스트 시나리오의 준비·실행·기대 결과 검증을 수행한다. */ async /** t: 테스트 정리·검증 문맥 또는 프레임 시각. */ t=>{
  const /** base: 계정 서버 또는 테스트 서버의 기준 주소; request: 테스트 서버로 HTTP 요청을 보내는 함수; signIn: 인증 흐름 전체를 실행하는 테스트 보조 함수. */ {base,request,signIn}=await setup(t);const /** cookie: 보안 속성을 포함한 쿠키 문자열 생성 함수; session: 검증할 앱 로그인 세션. */ {cookie,session}=await signIn();
  const /** denied: 접속 거부를 검증할 연결. */ denied=new WebSocket(base.replace('http:','ws:')+'/ws?client=app');
  assert.equal(await new Promise(/** r: 비동기 완료 콜백. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ r=>denied.on('close',r)),1008);
  /** create: 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ async function create(/** mode: 웹 게스트와 APK 계정을 구분하는 접속 모드. */ mode){
    const /** ws: 현재 처리 중인 WebSocket 연결. */ ws=new WebSocket(base.replace('http:','ws:')+'/ws?client='+mode,{headers:{Cookie:cookie}});
    await new Promise(/** r: 비동기 완료 콜백. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ r=>ws.once('message',r));
    const /** state: 현재 상태 스냅샷. */ state=new Promise(/** r: 비동기 완료 콜백. */ /** 테스트 대역이나 검증에 필요한 현재 작업을 수행한다. */ r=>ws.on('message',/** raw: 수신한 원본 메시지. */ /** message 이벤트가 발생하면 해당 상태와 입력을 처리한다. */ raw=>{const /** m: 수신 메시지 또는 문자열 패턴 일치 결과. */ m=JSON.parse(raw);if(m.type==='room.state')r(m.room);}));
    ws.send(JSON.stringify({v:1,type:'room.create',name:'이름'}));const /** room: 현재 처리하는 방의 상태. */ room=await state;ws.close();return room.players[0];
  }
  const /** app: 앱 모드의 결과. */ app=await create('app'),/** web: 웹 모드의 결과. */ web=await create('web');assert.equal(app.status.classificationCode,session.account.id);assert.equal(web.status.classificationCode,web.id);
  assert.equal((await request('/api/logout',{method:'POST',headers:{Cookie:cookie,'X-Client-Mode':'app',Origin:'https://game.test','X-CSRF-Token':session.csrf}})).status,200);
  const /** after: 작업 이후에 조회한 상태. */ after=await(await request('/api/session',{headers:{Cookie:cookie,'X-Client-Mode':'app'}})).json();assert.equal(after.account,null);
});

test('touch control override persists as a boolean and rejects invalid settings',/** 앱 설정 저장이 표시 여부를 보존하고 잘못된 타입을 거절하는지 검증한다. */ async (/** t: 테스트 정리 문맥. */ t)=>{
 const /** file: 테스트 계정 파일 경로. */ {file}=await setup(t);
 const /** store: 독립 설정 저장 인터페이스. */ store=createAccountStore(file);
 const /** account: 설정을 저장할 계정. */ account=store.upsert('google','touch-test','테스트');
 store.saveSettings(account.id,{controlScale:1,showNames:true,showTouchControls:false});
 assert.equal(createAccountStore(file).find(account.id).settings.showTouchControls,false);
 assert.throws(/** 문자열로 전달된 표시 설정은 거절해야 한다. */ ()=>store.saveSettings(account.id,{controlScale:1,showNames:true,showTouchControls:'false'}));
});

test('local test login accepts only seeded accounts and uses the saved nickname in rooms',/** 테스트 로그인 격리, 계정 식별, 서버 닉네임 및 가입 차단을 검증한다. */ async (/** t: 임시 서버 정리 문맥. */ t)=>{
  const /** request: 로컬 로그인 HTTP 요청; base: 테스트 서버 주소. */ {request,base}=await setup(t,false,true);
  /** 회원 아이디를 전송하고 선택적으로 테스트 요청 헤더를 추가한다. */
  function login(/** id: 로그인에 사용할 회원 아이디. */ id,/** headers: 접근 제한을 검증할 추가 헤더. */ headers={}){
    return request('/api/test-login',{method:'POST',headers:{Origin:base,...headers},body:JSON.stringify({id})});
  }
  assert.match(await (await request('/')).text(),/<body data-test-login>/);
  assert.equal((await login('33dot',{'X-Forwarded-For':'192.0.2.10'})).status,404);
  assert.equal((await login('33dot',{Origin:'https://other.test'})).status,403);
  assert.equal((await login('unknown')).status,401);
  assert.equal((await login('abc')).status,400);
  assert.equal((await login('abcd')).status,401);
  assert.equal((await login('33dot!')).status,400);
  assert.equal((await request('/api/register',{method:'POST'})).status,404);
  const /** first: 첫 회원 로그인 응답; second: 두 번째 회원 로그인 응답. */ first=await login('33DOT'),second=await login('noru8294');
  assert.equal(first.status,200);assert.equal(second.status,200);
  const /** cookie: 첫 회원의 HTTP 세션 증명. */ cookie=first.headers.get('set-cookie').split(';')[0];
  const /** account: 첫 회원에게 공개한 계정 정보. */ {account}=await first.json();
  assert.equal(account.displayName,'33');
  assert.equal((await second.json()).account.displayName,'노루');
  assert.deepEqual((await (await login('33dot')).json()).account,account);
  assert.deepEqual((await (await request('/api/session',{headers:{Cookie:cookie}})).json()).account,account);
  const /** ws: 로그인 쿠키를 전달하는 게임 연결. */ ws=new WebSocket(base.replace('http:','ws:')+'/ws?client=web',{headers:{Cookie:cookie}});
  t.after(/** 검증용 게임 소켓을 닫는다. */ ()=>ws.terminate());
  await new Promise(/** 첫 서버 메시지가 오면 요청을 시작한다. */ (/** resolve: 접속 완료 콜백. */ resolve)=>ws.once('message',resolve));
  const /** state: 방 생성 이후 수신할 참가자 상태. */ state=new Promise(/** 방 상태 메시지를 선택한다. */ (/** resolve: 방 상태 수신 콜백. */ resolve)=>ws.on('message',/** 서버 응답을 읽는다. */ (/** raw: 수신 원본 메시지. */ raw)=>{
    const /** message: 해석한 서버 응답. */ message=JSON.parse(raw);
    if(message.type==='room.state')resolve(message.room);
  }));
  ws.send(JSON.stringify({v:1,type:'room.create',name:'다른이름'}));
  const /** player: 서버가 만든 첫 참가자. */ [player]=(await state).players;
  assert.equal(player.name,'33');assert.equal(player.status.classificationCode,account.id);
});

test('public member login allows only the two registered IDs over the configured origin', /** 운영 회원 로그인과 쿠키 정책을 검증한다. */ async (/** t: 서버 정리 문맥. */ t)=>{
  const /** origin: 운영 회원 로그인의 HTTPS 출처. */ origin='https://childrenofbottoms.duckdns.org';
  const /** base: 격리 서버의 실제 접속 주소. */ {base}=await setup(t,false,false,origin);
  /** 운영 호스트 헤더를 보존하면서 격리 서버로 요청을 보낸다. */
  function request(/** path: 테스트할 API 경로. */ path, /** options: HTTP 메서드·헤더·본문. */ options) {
    return new Promise(/** HTTP 응답을 테스트용 Response로 변환한다. */ (/** resolve: 결과를 전달한다. */ resolve, /** reject: 네트워크 오류를 전달한다. */ reject)=>{
      const /** req: 운영 호스트를 흉내 내는 요청. */ req=httpRequest(base+path,options,/** 응답 데이터를 모은다. */ (/** res: 격리 서버 응답. */ res)=>{
        const /** chunks: 응답 본문 바이트 목록. */ chunks=[];
        res.on('data',/** 응답 조각을 모은다. */ (/** chunk: 수신한 응답 바이트. */ chunk)=>chunks.push(chunk));
        res.on('end',/** 응답 조각을 합친다. */ ()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
      });
      req.on('error',reject);
      req.end(options.body);
    });
  }
  const /** headers: 운영 호스트와 동일 출처 요청을 재현하는 헤더. */ headers={Host:new URL(origin).host,Origin:origin};
  assert.match(await (await request('/',{headers})).text(),/<body data-test-login>/);
  for(const /** id: 사전 등록한 두 회원 아이디. */ id of ['33dot','noru8294']){
    const /** response: 비밀번호 입력 없이 발급된 로그인 응답. */ response=await request('/api/test-login',{method:'POST',headers,body:JSON.stringify({id})});
    assert.equal(response.status,200);
    assert.match(response.headers.get('set-cookie'),/; Secure/);
    const /** cookie: 세션 확인에 사용할 쿠키 헤더 값. */ cookie=response.headers.get('set-cookie').split(';')[0];
    const /** session: 운영 회원 세션을 조회한 결과. */ session=await (await request('/api/session',{headers:{...headers,Cookie:cookie}})).json();
    assert.equal(session.account.displayName,id==='33dot'?'33':'노루');
  }
  assert.equal((await request('/api/test-login',{method:'POST',headers,body:'{"id":"unknown"}'})).status,401);
  assert.equal((await request('/api/test-login',{method:'POST',headers:{...headers,Origin:'https://other.test'},body:'{"id":"33dot"}'})).status,403);
});
