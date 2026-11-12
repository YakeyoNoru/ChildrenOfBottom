using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace ChildrenOfBottom
{
    // WebSocket 종료 프레임의 코드로 정상 종료와 세션 인계를 구분한다.
    internal sealed class GameSocketClosedException : IOException
    {
        internal WebSocketCloseStatus? Status { get; } // 서버가 종료 프레임에 넣은 상태 코드다.

        // 민감한 서버 메시지 대신 종료 코드만 예외에 남긴다.
        internal GameSocketClosedException(WebSocketCloseStatus? status) // 수신한 서버 종료 코드다.
            : base($"게임 서버가 WebSocket을 닫았습니다 ({status}).")
        {
            Status = status;
        }
    }

    // Unity 네이티브 클라이언트와 게임 서버 사이의 JSON WebSocket 전송을 담당한다.
    public sealed class GameSocket : IDisposable
    {
        // 이 연결의 TCP 및 WebSocket 수명을 관리하는 네이티브 소켓이다.
        private readonly ClientWebSocket socket = new();

        // 분할된 메시지를 수신할 때 재사용하는 바이트 버퍼다. 수신 루프 하나에서만 사용한다.
        private readonly byte[] buffer = new byte[16 * 1024];

        // 서버의 게스트 또는 앱 계정 WebSocket에 접속한다.
        public Task ConnectAsync(
            Uri endpoint, // 접속할 ws 또는 wss 주소이며 쿼리에 접속 모드와 상태 형식을 지정한다.
            CancellationToken cancellationToken, // 접속 중단 또는 제한 시간 신호다.
            string cookieHeader = null) // 검증된 동일 서버에만 보낼 메모리 회원 세션이다.
        {
            if (!string.IsNullOrEmpty(cookieHeader))
                socket.Options.SetRequestHeader("Cookie", cookieHeader);
            return socket.ConnectAsync(endpoint, cancellationToken);
        }

        // 호출자가 직렬화한 프로토콜 명령 하나를 서버에 보낸다. 명령 송신은 한 번에 하나만 진행한다.
        public Task SendAsync(
            string json, // 프로토콜 버전과 메시지 유형이 포함된 명령 JSON이다.
            CancellationToken cancellationToken) // 송신 중단 또는 제한 시간 신호다.
        {
            // 한 WebSocket 텍스트 메시지로 보낼 UTF-8 바이트다.
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            return socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancellationToken);
        }

        // 여러 조각으로 도착할 수 있는 서버 메시지 하나를 완성한 뒤 UTF-8로 해석한다.
        public async Task<string> ReceiveAsync(CancellationToken cancellationToken) // 수신 중단 또는 제한 시간 신호다.
        {
            // 현재 메시지의 바이트를 모아 조각 경계에 걸친 한글도 한 번에 해석한다.
            using var message = new MemoryStream();

            while (true)
            {
                // 이번 수신 조각의 크기와 메시지 종료 여부를 담는다.
                WebSocketReceiveResult frame = await socket.ReceiveAsync(
                    new ArraySegment<byte>(buffer), cancellationToken).ConfigureAwait(false);

                if (frame.MessageType == WebSocketMessageType.Close)
                    throw new GameSocketClosedException(frame.CloseStatus);
                if (frame.MessageType != WebSocketMessageType.Text)
                    throw new IOException("게임 서버의 WebSocket 메시지는 JSON 텍스트여야 합니다.");

                message.Write(buffer, 0, frame.Count);
                if (frame.EndOfMessage)
                    return Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
            }
        }

        // 방을 나간 뒤 서버와 정상 종료 프레임을 교환한다.
        public Task CloseAsync(CancellationToken cancellationToken) // 종료 응답을 기다리는 제한 시간 신호다.
        {
            return socket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, cancellationToken);
        }

        // 소켓과 연결에 할당한 네이티브 리소스를 해제한다.
        public void Dispose()
        {
            socket.Dispose();
        }
    }
}
