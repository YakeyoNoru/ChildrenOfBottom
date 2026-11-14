using System;
using UnityEngine;

namespace ChildrenOfBottom
{
    // 씬에서 편집한 UI 오브젝트를 이름 변경과 무관하게 기존 화면 동작에 연결한다.
    public sealed class PortSceneUi : MonoBehaviour
    {
        [SerializeField] private string[] keys; // 기존 화면 코드가 사용하는 고정 참조 키다.
        [SerializeField] private RectTransform[] elements; // 키와 같은 순서의 씬 UI 오브젝트다.
        [SerializeField] private RectTransform healthTemplate; // 월드 체력바를 복제할 프리팹이다.
        [SerializeField] private UnityEngine.UI.Button skillTemplate; // 서버 기술 목록 행으로 복제할 프리팹이다.

        internal RectTransform HealthTemplate => healthTemplate; // 월드 체력바 풀에 사용할 프리팹이다.
        internal UnityEngine.UI.Button SkillTemplate => skillTemplate; // 동적 기술 목록이 사용할 버튼이다.

        // 고정 키로 씬 참조를 찾고 누락된 연결의 위치를 알려 준다.
        internal RectTransform Get(string key) // key는 배치 오브젝트의 고정 참조 키다.
        {
            int index = Array.IndexOf(keys, key); // 직렬화된 참조 배열에서 찾은 위치다.
            if (index < 0 || elements[index] == null)
                throw new InvalidOperationException($"씬의 UI 참조가 없습니다: {key}");
            return elements[index];
        }
    }
}
