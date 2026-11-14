using System;
using UnityEngine;
using UnityEngine.UI;

namespace ChildrenOfBottom
{
    // Main 씬에 저장된 UI 오브젝트만 참조하고 버튼 이벤트 및 표시 상태를 관리한다.
    public sealed class PortMainMenuView : MonoBehaviour
    {
        [SerializeField] private Button googleLoginButton; // Google 로그인 버튼 참조다.
        [SerializeField] private Button guestLoginButton; // 게스트 로그인 버튼 참조다.
        [SerializeField] private Button googleRegistrationButton; // Google 회원가입 버튼 참조다.
        [SerializeField] private Button googleCancelButton; // Google 인증 취소 버튼 참조다.
        [SerializeField] private Text statusText; // 인증 및 서버 연결 안내를 표시하는 텍스트 참조다.

        private Action googleAction; // 두 Google 버튼이 공유하는 인증 실행 함수다.
        private Action guestAction; // 게스트 로그인 실행 함수다.
        private Action cancelAction; // 브라우저 인증 취소 실행 함수다.

        // 에디터에서는 버튼 배치를 볼 수 있지만 게임 시작 시 취소 버튼을 숨긴다.
        private void Awake()
        {
            if (googleCancelButton != null)
                googleCancelButton.gameObject.SetActive(false);
        }

        // 연결 관리자의 기존 인증 함수를 정적인 버튼 오브젝트에 등록한다.
        internal void BindCallbacks(
            Action google, // Google 인증 또는 회원가입 동작이다.
            Action guest, // 게스트 로그인 동작이다.
            Action cancel) // Google 인증 취소 동작이다.
        {
            if (googleLoginButton == null || guestLoginButton == null ||
                googleRegistrationButton == null || googleCancelButton == null || statusText == null)
                throw new InvalidOperationException("Main 씬에 연결된 버튼 또는 Status 텍스트가 없습니다.");
            UnbindCallbacks();
            googleAction = google;
            guestAction = guest;
            cancelAction = cancel;
            googleLoginButton.onClick.AddListener(ClickGoogle);
            googleRegistrationButton.onClick.AddListener(ClickGoogle);
            guestLoginButton.onClick.AddListener(ClickGuest);
            googleCancelButton.onClick.AddListener(ClickCancel);
            googleCancelButton.gameObject.SetActive(false);
        }

        // Google 로그인 또는 회원가입을 같은 인증 처리 함수로 전달한다.
        private void ClickGoogle() => googleAction?.Invoke();

        // 게스트 세션을 시작한다.
        private void ClickGuest() => guestAction?.Invoke();

        // 진행 중인 인증을 취소한다.
        private void ClickCancel() => cancelAction?.Invoke();

        // 에디터에서 설정한 UI 위치 및 스타일을 유지하면서 문구만 바꾼다.
        internal void SetNotice(string notice) // notice는 서버 또는 인증 안내 문구다.
        {
            if (statusText != null)
                statusText.text = notice ?? "";
        }

        // 인증 진행 시에만 취소 버튼을 표시한다.
        internal void SetGoogleCancelVisible(bool visible) // visible은 인증 취소 가능 여부다.
        {
            if (googleCancelButton != null)
                googleCancelButton.gameObject.SetActive(visible);
        }

        // 화면 이동 시 버튼 이벤트가 중복으로 남지 않도록 해제한다.
        internal void UnbindCallbacks()
        {
            if (googleLoginButton != null)
                googleLoginButton.onClick.RemoveListener(ClickGoogle);
            if (googleRegistrationButton != null)
                googleRegistrationButton.onClick.RemoveListener(ClickGoogle);
            if (guestLoginButton != null)
                guestLoginButton.onClick.RemoveListener(ClickGuest);
            if (googleCancelButton != null)
                googleCancelButton.onClick.RemoveListener(ClickCancel);
            googleAction = null;
            guestAction = null;
            cancelAction = null;
        }

        // 씬의 UI 오브젝트가 파괴될 때 이벤트를 정리한다.
        private void OnDestroy() => UnbindCallbacks();
    }
}
