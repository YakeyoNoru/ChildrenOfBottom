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

/** Remote game UI; OAuth credentials stay exclusively on the game server. */
public final class MainActivity extends Activity {
    private WebView view;
    private SharedPreferences pending;
    private final String origin = BuildConfig.GAME_ORIGIN;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        pending = getSharedPreferences("oauth-pending", MODE_PRIVATE);
        view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " SubTRPG-Android/1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return navigate(request.getUrl());
            }
        });
        setContentView(view);
        if (!consumeCallback(getIntent())) view.loadUrl(origin + "/app");
    }
    private boolean sameOrigin(Uri uri) {
        Uri trusted = Uri.parse(origin);
        return "https".equals(uri.getScheme()) && trusted.getHost().equals(uri.getHost())
            && trusted.getPort() == uri.getPort() && uri.getUserInfo() == null;
    }
    private boolean navigate(Uri uri) {
        if (!sameOrigin(uri)) { Toast.makeText(this, "허용되지 않은 페이지입니다.", Toast.LENGTH_SHORT).show(); return true; }
        if ("/auth/start/google".equals(uri.getPath())) { startLogin("google"); return true; }
        if ("/auth/start/kakao".equals(uri.getPath())) { startLogin("kakao"); return true; }
        return false;
    }
    private void startLogin(String provider) {
        try {
            byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
            String verifier = Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            String challenge = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            pending.edit().putString("verifier", verifier).putLong("expires", System.currentTimeMillis() + 600000).apply();
            Uri target = Uri.parse(origin + "/auth/start/" + provider).buildUpon().appendQueryParameter("challenge", challenge).build();
            startActivity(new Intent(Intent.ACTION_VIEW, target));
        } catch (Exception error) { Toast.makeText(this, "로그인 브라우저를 열 수 없습니다.", Toast.LENGTH_LONG).show(); }
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); consumeCallback(intent); }
    private boolean consumeCallback(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null || !"subtrpg".equals(uri.getScheme()) || !"auth".equals(uri.getHost()) || !"/callback".equals(uri.getPath())) return false;
        String code = uri.getQueryParameter("code"), verifier = pending.getString("verifier", null);
        if (code == null || !code.matches("[A-Za-z0-9_-]{43}") || verifier == null || pending.getLong("expires", 0) < System.currentTimeMillis()) {
            Toast.makeText(this, "로그인이 만료되었습니다. 다시 시도해 주세요.", Toast.LENGTH_LONG).show();
            view.loadUrl(origin + "/app"); return true;
        }
        pending.edit().clear().apply();
        // Only a one-use grant and its proof enter the WebView; no OAuth tokens.
        String form = "code=" + Uri.encode(code) + "&verifier=" + Uri.encode(verifier);
        view.postUrl(origin + "/auth/app-session", form.getBytes(StandardCharsets.UTF_8));
        return true;
    }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() { if (view != null) { view.stopLoading(); view.destroy(); } super.onDestroy(); }
}
