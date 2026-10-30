/** 카메라 단위: 현재 플레이어 표시 지름 하나는 월드 좌표 36이다.
 * 가로 시야는 19로 고정하고 세로는 8~15 사이에서 조정한다(기본 10).
 * 남는 화면은 여백으로 처리하며 시야를 추가로 넓히지 않는다.
 */
/** calculateViewport: 가로 시야 19를 유지하면서 화면비·웹 세로 정책에 맞는 시야와 여백을 계산한다. */ function calculateViewport(/** width: 표시 영역 또는 공격 범위의 가로 폭. */ width, /** height: 표시 영역의 세로 높이. */ height, /** mode: 웹 게스트와 APK 계정을 구분하는 접속 모드. */ mode = 'web') {
  const /** worldWidth: 카메라에 표시할 고정 가로 월드 길이. */ worldWidth = 19 * 36;
  const /** portrait: 화면 높이가 너비보다 큰지 여부. */ portrait = height > width;
  const /** worldHeight: 화면비에 맞춰 조정한 세로 월드 길이. */ worldHeight = portrait && mode === 'web' ? 10 * 36 : Math.max(8 * 36, Math.min(15 * 36, worldWidth * height / width));
  const /** scale: 월드 좌표를 화면 픽셀로 바꾸는 배율. */ scale = Math.min(width / worldWidth, height / worldHeight);
  const /** pixelWidth: 실제 렌더링 영역의 가로 픽셀 수. */ pixelWidth = worldWidth * scale, /** pixelHeight: 실제 렌더링 영역의 세로 픽셀 수. */ pixelHeight = worldHeight * scale;
  return { worldWidth, worldHeight, scale, pixelWidth, pixelHeight,
    left: (width - pixelWidth) / 2, top: (height - pixelHeight) / 2,
    portrait, blockedPortrait: portrait && mode === 'app' };
}
