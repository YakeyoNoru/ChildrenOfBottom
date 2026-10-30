package com.subtrpg.game;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/** 서버의 게임 화면을 WebView로 열고 외부 브라우저 로그인과 앱 복귀를 연결한다. 인증 비밀키는 서버에만 둔다. */
public final class MainActivity extends Activity {
    /** view: 게임 서버의 웹 화면을 표시하는 WebView. */ private WebView view;
    /** pending: 로그인 증명과 만료 시각을 임시 저장하는 앱 전용 저장소. */ private SharedPreferences pending;
    /** origin: 앱 빌드에 지정한 HTTPS 게임 서버 출처. */ private final String origin = BuildConfig.GAME_ORIGIN;
    /** 화면과 보안 설정을 초기화하고 앱 복귀 또는 게임 화면 열기를 처리한다. */
    @Override public void onCreate(/** state: Android가 전달한 이전 Activity 복원 상태 */ Bundle state) {
        super.onCreate(state);
        pending = getSharedPreferences("oauth-pending", MODE_PRIVATE);
        view = new WebView(this);
        /** settings: WebView의 스크립트·저장소·보안 정책 설정. */ WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " SubTRPG-Android/1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setWebViewClient(/** 게임 서버 출처 검사와 외부 브라우저 로그인 분기를 담당하는 탐색 처리기. */ new WebViewClient() {
            /** 최상위 페이지 이동만 앱의 출처 검사와 로그인 분기로 전달한다. */
            @Override public boolean shouldOverrideUrlLoading(/** web: 이동 요청을 발생시킨 WebView */ WebView web, /** request: 이동 주소와 최상위 프레임 여부를 담은 요청 */ WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return navigate(request.getUrl());
            }
        });
        setContentView(view);
        if (!consumeCallback(getIntent())) view.loadUrl(origin + "/app");
    }
    /** 주소가 허용된 HTTPS 호스트·포트이며 사용자 정보가 없는지 확인한다. */
    private boolean sameOrigin(/** uri: 검사할 이동 주소 또는 앱 복귀 주소. */ Uri uri) {
        /** trusted: 허용된 서버 출처를 해석한 URI. */ Uri trusted = Uri.parse(origin);
        return "https".equals(uri.getScheme()) && trusted.getHost().equals(uri.getHost())
            && trusted.getPort() == uri.getPort() && uri.getUserInfo() == null;
    }
    /** 신뢰할 수 없는 이동을 차단하고 제공자 로그인은 외부 브라우저로 연결한다. */
    private boolean navigate(/** uri: 검사할 이동 주소 또는 앱 복귀 주소. */ Uri uri) {
        if (!sameOrigin(uri)) { Toast.makeText(this, "허용되지 않은 페이지입니다.", Toast.LENGTH_SHORT).show(); return true; }
        if ("/auth/start/google".equals(uri.getPath())) { startLogin("google"); return true; }
        if ("/auth/start/kakao".equals(uri.getPath())) { startLogin("kakao"); return true; }
        return false;
    }
    /** 일회성 증명과 만료 시각을 저장한 뒤 외부 브라우저로 인증을 시작한다. */
    private void startLogin(/** provider: 인증을 시작할 google 또는 kakao 제공자 */ String provider) {
        try {
            /** bytes: 인증 증명 생성에 사용할 32바이트 난수. */ byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
            /** verifier: 앱 복귀 코드 교환에 사용할 원본 증명 문자열. */ String verifier = Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            /** challenge: 원본 증명의 SHA-256 해시를 URL 안전 형식으로 인코딩한 값. */ String challenge = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            pending.edit().putString("verifier", verifier).putLong("expires", System.currentTimeMillis() + 600000).apply();
            /** target: 외부 브라우저에서 열 제공자 로그인 시작 주소. */ Uri target = Uri.parse(origin + "/auth/start/" + provider).buildUpon().appendQueryParameter("challenge", challenge).build();
            startActivity(new Intent(Intent.ACTION_VIEW, target));
        } catch (/** error: 외부 로그인 시작 중 발생한 예외. */ Exception error) { Toast.makeText(this, "로그인 브라우저를 열 수 없습니다.", Toast.LENGTH_LONG).show(); }
    }
    /** 이미 열린 앱으로 들어온 새 로그인 복귀 Intent를 처리한다. */
    @Override protected void onNewIntent(/** intent: 외부 브라우저에서 앱으로 전달한 복귀 정보 */ Intent intent) { super.onNewIntent(intent); setIntent(intent); consumeCallback(intent); }
    /** 앱 복귀 주소와 증명을 확인하고 일회성 코드를 서버 세션으로 교환한다. */
    private boolean consumeCallback(/** intent: 외부 브라우저에서 앱으로 전달한 복귀 정보 */ Intent intent) {
        /** uri: 검사할 이동 주소 또는 앱 복귀 주소. */ Uri uri = intent == null ? null : intent.getData();
        if (uri == null || !"subtrpg".equals(uri.getScheme()) || !"auth".equals(uri.getHost()) || !"/callback".equals(uri.getPath())) return false;
        /** code: 앱 복귀 주소에서 추출한 일회성 로그인 교환 코드. */ String code = uri.getQueryParameter("code"), /** verifier: 로그인 시작 시 저장한 앱 전용 원본 증명. */ verifier = pending.getString("verifier", null);
        if (code == null || !code.matches("[A-Za-z0-9_-]{43}") || verifier == null || pending.getLong("expires", 0) < System.currentTimeMillis()) {
            Toast.makeText(this, "로그인이 만료되었습니다. 다시 시도해 주세요.", Toast.LENGTH_LONG).show();
            view.loadUrl(origin + "/app"); return true;
        }
        pending.edit().clear().apply();
        // WebView에는 일회성 교환 코드와 증명만 전달하며 제공자 OAuth 토큰은 전달하지 않는다.
        /** form: 교환 코드와 증명을 담은 URL 인코딩 POST 본문. */ String form = "code=" + Uri.encode(code) + "&verifier=" + Uri.encode(verifier);
        view.postUrl(origin + "/auth/app-session", form.getBytes(StandardCharsets.UTF_8));
        return true;
    }
    /** 앱이 뒤로 갈 때 로그인 쿠키를 저장한다. */
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    /** Activity 종료 시 페이지 로딩과 WebView 자원을 해제한다. */
    @Override protected void onDestroy() { if (view != null) { view.stopLoading(); view.destroy(); } super.onDestroy(); }
}
