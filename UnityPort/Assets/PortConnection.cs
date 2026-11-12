using System;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 운영 HTTPS 또는 이 PC의 로컬 테스트 서버에 연결할 설정을 읽는다.
    internal sealed class PortConnection
    {
        // Android 및 배포 빌드가 읽을 설정 파일의 필드다.
        [Serializable]
        private sealed class Settings
        {
            public string serverOrigin; // 서버의 HTTP(S) 출처이며 경로와 인증 정보는 포함하지 않는다.
        }

        // 서버가 현재 활성화한 로그인 제공자를 읽는 공개 응답이다.
        [Serializable]
        private sealed class LoginAvailability
        {
            public Providers providers; // 운영 서버에서 사용할 수 있는 소셜 로그인 목록이다.
        }

        // Unity 메인 화면에서 지원하는 제공자의 활성 상태다.
        [Serializable]
        private sealed class Providers
        {
            public bool google; // 서버에 Google OAuth 설정이 있는지 나타낸다.
        }

        // HTTP API와 소켓의 동일 출처다.
        internal Uri Origin { get; }
        // 검증된 출처에서만 WebSocket 주소를 파생한다.
        private PortConnection(Uri origin) // origin은 검증된 HTTP(S) 출처다.
        {
            Origin = origin;
        }

        // 게스트는 기존 웹 모드, Google 계정은 앱 모드로 연결한다.
        internal Uri Endpoint(bool member) // member는 앱 계정 쿠키의 발급 여부다.
        {
            return new UriBuilder(Origin)
            {
                Scheme = Origin.Scheme == "https" ? "wss" : "ws",
                Port = Origin.IsDefaultPort ? -1 : Origin.Port,
                Path = "/ws",
                Query = member ? "client=app&objects=delta1" : "client=web&objects=delta1"
            }.Uri;
        }

        // 빌드 리소스와 선택적인 실행 인자를 읽고 서버 주소의 신뢰 범위를 검사한다.
        internal static PortConnection Load()
        {
            TextAsset resource = Resources.Load<TextAsset>("ConnectionSettings"); // 배포자가 지정할 선택적 설정 파일이다.
#if UNITY_ANDROID && !UNITY_EDITOR
            // Android 기기에서는 같은 PC의 루프백 주소 대신 앱의 배포 서버 설정을 우선 읽는다.
            resource = Resources.Load<TextAsset>("AndroidConnectionSettings") ?? resource;
#endif
            Settings settings = resource == null ? new Settings() : JsonUtility.FromJson<Settings>(resource.text); // 출처를 읽을 배포 설정이다.
            string address = settings?.serverOrigin; // 빌드에 지정한 기본 출처다.
            string[] arguments = Environment.GetCommandLineArgs(); // Windows 실행 시 넘긴 선택적 접속 인자다.
            for (int index = 1; index < arguments.Length; index++) // index는 현재 확인할 실행 인자다.
            {
                if (arguments[index] == "--cob-server")
                {
                    if (++index >= arguments.Length)
                        throw new InvalidOperationException("--cob-server 뒤에 서버 주소가 필요합니다.");
                    address = arguments[index];
                }
            }
            if (string.IsNullOrWhiteSpace(address))
                address = "http://127.0.0.1:3000";
            if (!Uri.TryCreate(address.Trim(), UriKind.Absolute, out Uri origin) || // origin은 검증할 서버 출처다.
                (origin.Scheme != "https" && !(origin.Scheme == "http" && origin.IsLoopback)) ||
                origin.UserInfo.Length > 0 || origin.AbsolutePath != "/" || origin.Query.Length > 0 || origin.Fragment.Length > 0)
                throw new InvalidOperationException("서버 주소는 HTTPS 출처 또는 이 PC의 로컬 HTTP 출처여야 합니다.");
            return new PortConnection(origin);
        }

        // 외부 브라우저로 Google 인증을 진행하고 같은 서버에서 앱 로그인 쿠키를 받는다.
        internal async Task<CookieContainer> SignInGoogleAsync(CancellationToken cancellationToken) // 인증 취소 또는 앱 종료 신호다.
        {
            var cookies = new CookieContainer(); // 현재 Unity 실행 중에만 보관하는 앱 로그인 쿠키다.
            using var handler = new HttpClientHandler { CookieContainer = cookies, AllowAutoRedirect = false }; // 증명을 다른 출처로 보내지 않는다.
            using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(12) }; // 개별 서버 요청의 제한 시간은 12초다.
            using HttpResponseMessage availability = await client.GetAsync(new Uri(Origin, "/api/session"), cancellationToken); // Google 설정 여부를 읽는다.
            if (!availability.IsSuccessStatusCode ||
                JsonUtility.FromJson<LoginAvailability>(await availability.Content.ReadAsStringAsync())?.providers?.google != true)
                throw new InvalidOperationException("이 서버에서 Google 로그인을 아직 사용할 수 없습니다.");

            byte[] random = new byte[32]; // 이 인증 실행에만 사용할 32바이트 난수다.
            using (RandomNumberGenerator generator = RandomNumberGenerator.Create()) // 인증 증명의 원본을 생성한다.
                generator.GetBytes(random);
            string verifier = Base64Url(random); // 브라우저에 보내지 않고 HTTPS 세션 교환에만 쓰는 증명이다.
            using SHA256 sha = SHA256.Create(); // 원본을 노출하지 않고 브라우저 흐름을 연결할 해시 계산기다.
            string challenge = Base64Url(sha.ComputeHash(Encoding.ASCII.GetBytes(verifier))); // 브라우저가 서버에 전달할 공개 해시다.
            Uri exchange = new(Origin, "/auth/unity-session"); // Unity가 인증 완료를 확인할 서버 주소다.
            using HttpResponseMessage initial = await ExchangeGoogleAsync(client, exchange, verifier, cancellationToken); // 운영 서버가 Unity 인증을 지원하는지 먼저 확인한다.
            if (initial.StatusCode != HttpStatusCode.Accepted)
                throw new InvalidOperationException("이 서버에 Unity Google 로그인이 아직 배포되지 않았습니다.");

            Application.OpenURL(new Uri(Origin, "/auth/start/google?return=unity&challenge=" + challenge).AbsoluteUri);
            while (true)
            {
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
                using HttpResponseMessage response = await ExchangeGoogleAsync(client, exchange, verifier, cancellationToken); // 브라우저 인증 대기 또는 앱 세션 발급 결과다.
                if (response.StatusCode == HttpStatusCode.Accepted)
                    continue;
                if (response.StatusCode != HttpStatusCode.OK || cookies.GetCookies(Origin)["subtrpg_app"] == null)
                    throw new InvalidOperationException("Google 인증을 완료하지 못했습니다. 다시 시도해 주세요.");
                return cookies;
            }
        }

        // 인증 증명을 URL에 넣지 않고 폼 본문으로 전송한다.
        private static async Task<HttpResponseMessage> ExchangeGoogleAsync(
            HttpClient client, // 동일 출처의 앱 쿠키를 받는 HTTP 클라이언트다.
            Uri endpoint, // Unity 인증 결과를 교환하는 서버 주소다.
            string verifier, // 현재 인증 실행의 비공개 증명이다.
            CancellationToken cancellationToken) // 인증 취소 또는 앱 종료 신호다.
        {
            using var form = new StringContent("verifier=" + verifier, Encoding.UTF8, "application/x-www-form-urlencoded"); // URL 안전한 난수를 담은 폼 본문이다.
            return await client.PostAsync(endpoint, form, cancellationToken);
        }

        // 난수와 해시를 서버가 기대하는 패딩 없는 Base64 URL 문자열로 변환한다.
        private static string Base64Url(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_'); // data는 인코딩할 난수 또는 해시다.
    }
}
