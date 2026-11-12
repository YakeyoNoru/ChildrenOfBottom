using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace ChildrenOfBottom
{
    // Unity에서 로컬 서버로 실제 접속해 게임 시작과 이동 입력 확인까지 검증한다.
    internal static class GameConnectionSmoke
    {
        // 수동 확인과 배치 검증에서 동일한 로컬 게스트 주소를 사용한다.
        private static readonly Uri Endpoint = new("ws://127.0.0.1:3000/ws?client=web&objects=delta1");

        // 확인에 필요한 프로토콜 필드만 읽는 수신 봉투다.
        [Serializable]
        private sealed class Message
        {
            public int v = 0; // 서버가 응답에 붙이는 프로토콜 버전이다.
            public string type = null; // 메시지의 종류를 구분한다.
            public string playerId = null; // welcome에서 부여한 본인 식별자다.
            public string code = null; // error가 발생했을 때 표시할 오류 코드다.
            public Room room = null; // 방 상태 이벤트에 들어 있는 검증 대상이다.
        }

        // 초기 상태와 변경 전송의 구분에 필요한 방 필드다.
        [Serializable]
        private sealed class Room
        {
            public string phase = null; // 대기실인지 진행 중인지 구분한다.
            public long snapshotSequence = 0; // 서버에서 증가시키는 방 스냅샷 순번이다.
            public Player[] players = null; // 현재 서버가 확인한 플레이어 목록이다.
            public Player[] objects = null; // 전체 스냅샷에 포함되는 개체 목록이다. 검증에서는 개수만 읽는다.
            public ObjectChanges objectChanges = null; // 변경 스냅샷의 비플레이어 개체 변경분이다.
        }

        // 서버에서 부여한 플레이어와 입력 처리 위치를 대조하는 필드다.
        [Serializable]
        private sealed class Player
        {
            public string id = null; // welcome의 본인 식별자와 비교한다.
            public int lastProcessedInput = 0; // 서버가 처리한 마지막 이동 명령 순번이다.
        }

        // 변경 스냅샷이 배열을 포함하는지 검증할 최소 자료형이다.
        [Serializable]
        private sealed class ObjectChanges
        {
            public string[] removed = null; // 이번 스냅샷에서 제거된 비플레이어 개체 식별자다.
        }

        // 에디터 메뉴에서 로컬 서버 접속을 검증하고 결과를 콘솔에 표시한다.
        [MenuItem("ChildrenOfBottom/로컬 서버 연결 확인")]
        private static async void RunFromMenu()
        {
            try
            {
                await VerifyAsync();
                Debug.Log("ChildrenOfBottom 연결 확인 성공: 게임 시작, 변경 스냅샷, 이동 입력 확인.");
            }
            catch (Exception error) // Unity 콘솔에 남길 검증 실패 원인이다.
            {
                Debug.LogException(error);
            }
        }

        // Unity 배치 모드에서 검증을 실행하고 실패 시 예외를 전달한다.
        public static void RunInBatch()
        {
            VerifyAsync().GetAwaiter().GetResult();
            Debug.Log("ChildrenOfBottom connection smoke passed.");
        }

        // 게스트 방을 하나 열고 서버가 이동 순번 1을 처리한 변경 스냅샷을 확인한다.
        private static async Task VerifyAsync()
        {
            // 서버가 응답하지 않을 때 전체 확인을 15초 후에 끝낸다.
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            // 접속부터 종료까지 사용할 검증 전용 소켓이다.
            using var socket = new GameSocket();
            // 소켓의 모든 작업에 공유하는 제한 시간 신호다.
            CancellationToken cancellationToken = timeout.Token;

            await socket.ConnectAsync(Endpoint, cancellationToken).ConfigureAwait(false);
            // 연결 직후 서버가 발급한 본인 식별자다.
            Message welcome = await ReceiveAsync(socket, cancellationToken).ConfigureAwait(false);
            if (welcome.type != "welcome" || string.IsNullOrEmpty(welcome.playerId))
                throw new InvalidOperationException("서버의 welcome과 플레이어 식별자를 받지 못했습니다.");

            await socket.SendAsync("{\"v\":1,\"type\":\"room.create\",\"requestId\":\"1\",\"name\":\"Unity 연결 확인\"}", cancellationToken).ConfigureAwait(false);
            // 방을 생성한 뒤 서버에서 수신한 초기 상태다.
            Message lobby = await ReceiveAsync(socket, cancellationToken).ConfigureAwait(false);
            if (lobby.type != "room.state" || lobby.room?.phase != "lobby")
                throw new InvalidOperationException("방을 생성한 뒤 대기실 상태를 받지 못했습니다.");

            await socket.SendAsync("{\"v\":1,\"type\":\"room.start\",\"requestId\":\"2\"}", cancellationToken).ConfigureAwait(false);
            // 서버에서 초기 전체 상태를 받은 스냅샷 순번이다.
            long baselineSequence = 0;
            while (baselineSequence == 0)
            {
                // 시작 승인과 함께 도착하는 초기 전체 상태를 찾는다.
                Message state = await ReceiveAsync(socket, cancellationToken).ConfigureAwait(false);
                if (state.type == "room.state" && state.room?.phase == "started" && state.room.objects?.Length > 1)
                    baselineSequence = state.room.snapshotSequence;
            }

            await socket.SendAsync("{\"v\":1,\"type\":\"game.input\",\"seq\":1,\"x\":1,\"y\":0}", cancellationToken).ConfigureAwait(false);
            while (true)
            {
                // 초기 상태 이후 본인 입력 순번을 확인한 변경 스냅샷을 찾는다.
                Message state = await ReceiveAsync(socket, cancellationToken).ConfigureAwait(false);
                if (state.type != "game.state" || state.room.snapshotSequence <= baselineSequence ||
                    state.room.objectChanges?.removed == null)
                    continue;

                // 본인 플레이어의 서버 처리 순번이 갱신됐는지 확인한다.
                Player player = Array.Find(state.room.players, candidate => // candidate는 비교할 서버 플레이어다.
                    candidate.id == welcome.playerId);
                if (player?.lastProcessedInput == 1)
                    break;
            }

            await socket.SendAsync("{\"v\":1,\"type\":\"room.leave\",\"requestId\":\"3\"}", cancellationToken).ConfigureAwait(false);
            // 방 퇴장 이벤트를 확인해 서버에 검증 캐릭터가 남지 않게 한다.
            Message reply;
            do
            {
                reply = await ReceiveAsync(socket, cancellationToken).ConfigureAwait(false);
            } while (reply.type != "room.left");
            await socket.CloseAsync(cancellationToken).ConfigureAwait(false);
        }

        // 메시지 형식을 확인하고 서버가 오류를 반환하면 검증을 즉시 끝낸다.
        private static async Task<Message> ReceiveAsync(
            GameSocket socket, // 다음 메시지를 읽을 검증 전용 연결이다.
            CancellationToken cancellationToken) // 전체 검증의 제한 시간 신호다.
        {
            // 메시지 유형과 검증에 필요한 서버 필드를 읽은 결과다.
            Message message = JsonUtility.FromJson<Message>(await socket.ReceiveAsync(cancellationToken).ConfigureAwait(false));
            if (message?.v != 1 || string.IsNullOrEmpty(message.type))
                throw new InvalidOperationException("프로토콜 v1 메시지를 받지 못했습니다.");
            if (message.type == "error")
                throw new InvalidOperationException($"게임 서버 오류 {message.code}");
            return message;
        }
    }
}
