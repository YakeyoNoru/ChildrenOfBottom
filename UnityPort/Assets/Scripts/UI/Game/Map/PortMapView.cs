using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace ChildrenOfBottom
{
    // 작은 지도와 전체맵이 동일한 로컬 탐색 이력을 공유하게 한다.
    internal sealed class PortMapView
    {
        // 웹 지도 기준 화면 너비와 두 지도의 서버 월드 표시 폭이다.
        private const float MiniWidth = 1710f;
        private const float ExpandedWidth = 6840f;

        // 램프·탐지 플레이어·본인 방향의 지도 표식 색이다.
        private static readonly Color32 LampColor = new(135, 206, 235, 255);
        private static readonly Color32 PlayerColor = new(255, 153, 102, 255);
        private static readonly Color32 ArrowColor = new(87, 232, 241, 255);
        private static readonly Color32 BorderColor = new(185, 207, 169, 255);

        // 지도 번호 라벨을 만들 때 재사용하는 게임 Canvas 구성이다.
        private readonly PortHud hud;
        // 두 지도를 표시할 입력 버튼과 전체 지도 오브젝트다.
        private readonly UnityEngine.UI.Button miniButton;
        private readonly RectTransform expanded;

        // 작은 지도와 전체 지도의 출력 텍스처 및 픽셀 작업 영역이다.
        private readonly Texture2D miniTexture = MakeTexture(256, 256);
        private readonly Texture2D expandedTexture = MakeTexture(512, 320);
        private readonly Color32[] miniPixels = new Color32[256 * 256];
        private readonly Color32[] expandedPixels = new Color32[512 * 320];

        // 전체 지도에 표시할 타일 번호와 실제 귀환등 위치 목록이다.
        private readonly List<UnityEngine.UI.Text> numbers = new();
        private readonly List<Vector2> lamps = new();

        // 실제로 이동해 공개한 지형과 서버 원본 상태다.
        private PortMapRaster raster;
        private PortProtocol.Entity me;
        private PortProtocol.Entity[] players;
        private long serverTime;
        private string mapKey;

        // 지도를 드래그해서 바뀐 중심 오프셋이며 단위는 서버 월드 단위다.
        private Vector2 pan;
        // 전체맵을 드래그하는 하나의 마우스 또는 터치 포인터 ID다.
        private int? dragPointer;
        // 최근 전체 지도 출력의 월드 단위당 출력 픽셀 배율이다.
        private float expandedScale = 512f / ExpandedWidth;

        // 다음 렌더링과 지도 닫기 직후 클릭 보호가 끝나는 시각(로컬 초)이다.
        private double drawAt;
        private double pointerBlockedUntil;

        // 플레이 상태를 공유하는 두 지도와 클릭·드래그를 배치한다.
        internal PortMapView(PortHud hud, PortSceneUi ui, Action open) // hud는 게임 Canvas, ui는 씬 참조, open은 작은 지도 클릭 동작이다.
        {
            this.hud = hud;
            // 원형 텍스처를 넣어 투명한 모서리를 가진 우측 상단 버튼을 만든다.
            RectTransform mini = ui.Get("Minimap"); // 씬에서 배치한 작은 지도다.
            var smallImage = mini.GetComponent<UnityEngine.UI.RawImage>(); // 작은 지도 픽셀을 표시한다.
            smallImage.texture = miniTexture;
            miniButton = mini.GetComponent<UnityEngine.UI.Button>();
            miniButton.targetGraphic = smallImage;
            miniButton.onClick.AddListener(() => open()); // 작은 지도 클릭 시 전체 지도를 연다.

            expanded = ui.Get("Expanded Map");
            var largeImage = expanded.GetComponent<UnityEngine.UI.RawImage>(); // 불투명한 8:5 전체 지도 픽셀을 표시한다.
            largeImage.texture = expandedTexture;
            // UI의 마우스·터치 드래그를 지도 중심 이동으로 전달한다.
            var trigger = expanded.GetComponent<EventTrigger>();
            var begin = new EventTrigger.Entry { eventID = EventTriggerType.BeginDrag }; // 처음 지도 이동을 시작한 포인터 이벤트다.
            begin.callback.AddListener(data => BeginPan((PointerEventData)data)); // data는 드래그를 시작한 포인터다.
            trigger.triggers.Add(begin);
            var drag = new EventTrigger.Entry { eventID = EventTriggerType.Drag }; // 드래그의 프레임별 이동 이벤트다.
            drag.callback.AddListener(data => Pan((PointerEventData)data)); // data는 이동한 포인터 좌표다.
            trigger.triggers.Add(drag);
            var end = new EventTrigger.Entry { eventID = EventTriggerType.EndDrag }; // 추적 중인 지도 포인터가 끝나는 이벤트다.
            end.callback.AddListener(data => EndPan((PointerEventData)data)); // data는 드래그를 끝낸 포인터다.
            trigger.triggers.Add(end);
            // 확장 지도를 닫고 이후 합성 클릭을 잠시 차단하는 버튼이다.
            var close = ui.Get("Expanded Map/Close Map").GetComponent<UnityEngine.UI.Button>(); // 전체 지도 닫기 버튼이다.
            close.onClick.AddListener(() => Close(true)); // 클릭으로 닫을 때만 추가 클릭을 보호한다.
            Reset();
        }

        // 전체맵이 열린 동안 이동과 기술 입력을 멈춘다.
        internal bool IsOpen => expanded.gameObject.activeSelf;
        // 지도 닫기 직후 남은 포인터 이벤트가 게임을 조작하지 않게 한다.
        internal bool BlocksPointer => Time.unscaledTimeAsDouble < pointerBlockedUntil;

        // 새 방 또는 새 맵의 지형과 타일 번호를 준비한다.
        internal void Prepare(string roomCode, PortProtocol.Map map) // roomCode와 map.id가 실제 서버 지도를 식별한다.
        {
            if (map == null)
                return;
            string key = roomCode + ":" + map.id; // 탐색 기록을 공유할 방과 지도 조합이다.
            if (mapKey == key)
                return;
            Reset();
            mapKey = key;
            raster = new PortMapRaster(map);
            foreach (PortProtocol.Tile tile in map.tiles) // tile은 전체맵에서 번호를 붙일 서버 지형이다.
            {
                // 실제 탐색 여부와 뷰포트 위치에 따라 토글하는 타일 번호다.
                UnityEngine.UI.Text label = hud.Label(expanded, "Tile number", Vector2.one * 0.5f, Vector2.zero, new Vector2(30, 22), 14);
                label.text = tile.id.ToString();
                label.gameObject.AddComponent<UnityEngine.UI.Outline>().effectColor = new Color(0.09f, 0.17f, 0.15f);
                label.gameObject.SetActive(false);
                numbers.Add(label);
            }
            miniButton.gameObject.SetActive(true);
        }

        // 지도 표식의 기준이 되는 본인과 서버 참가자 자료를 갱신한다.
        internal void Receive(PortProtocol.Room room, PortProtocol.Entity player) // room은 현재 상태, player는 본인 서버 상태다.
        {
            players = room.players;
            me = player;
            serverTime = room.serverTime;
        }

        // 다음 전체맵은 본인 위치를 중앙으로 삼는다.
        internal void Open()
        {
            if (raster == null || me == null || BlocksPointer)
                return;
            pan = Vector2.zero;
            expanded.gameObject.SetActive(true);
            drawAt = 0;
        }

        // 현재 전체 지도를 닫는다.
        internal void Close(bool pointer = false) // pointer가 true이면 닫기 버튼 직후 클릭을 막는다.
        {
            expanded.gameObject.SetActive(false);
            dragPointer = null;
            if (pointer)
                pointerBlockedUntil = Time.unscaledTimeAsDouble + 0.3;
        }

        // 이전 방, 연결 또는 결과의 지도 탐색 기록을 모두 비운다.
        internal void Reset()
        {
            Close();
            miniButton.gameObject.SetActive(false);
            raster = null;
            mapKey = null;
            me = null;
            players = null;
            pointerBlockedUntil = 0;
            drawAt = 0;
            foreach (UnityEngine.UI.Text number in numbers) // number는 이전 지도용 타일 번호다.
            {
                number.gameObject.SetActive(false);
                UnityEngine.Object.Destroy(number.gameObject);
            }
            numbers.Clear();
        }

        // 매 화면 프레임 탐색을 갱신하고 지도 텍스처 출력은 초당 최대 약 15회로 제한한다.
        internal void Draw(Vector2 position, float facing, PortWorldView world, double now) // position은 표시 월드 위치, facing은 표시 라디안, world는 개체 조회, now는 로컬 초다.
        {
            if (raster == null || me == null)
                return;
            raster.Reveal(position);
            if (now < drawAt)
                return;
            drawAt = now + 1d / 15d;

            world.CopyLampPositions(lamps);
            Render(miniTexture, miniPixels, position, Vector2.zero, facing, false);
            if (IsOpen)
                Render(expandedTexture, expandedPixels, position, pan, facing, true);
        }

        // 스냅샷과 실제 탐색 마스크를 작은 지도 또는 전체 지도 텍스처로 그린다.
        private void Render(Texture2D texture, Color32[] pixels, Vector2 position, Vector2 offset, float facing, bool full) // texture/pixels는 출력, position/offset은 서버 단위, facing은 표시 라디안, full은 전체맵이다.
        {
            int width = texture.width; // 출력 가로 픽셀 수다.
            int height = texture.height; // 출력 세로 픽셀 수다.
            Vector2 center = position + offset; // 지도 중심의 서버 월드 위치다.
            float scale = width / (full ? ExpandedWidth : MiniWidth); // 월드 단위당 출력 픽셀 수다.
            bool showAll = full && me.name == "열쇠" && me.testOptions?.mapHack == true; // 전체맵 지형만 강제로 공개한다.
            bool revealPlayers = me.status.playerRevealUntil > serverTime; // 서버 탐지 기술이 활성 상태다.
            if (revealPlayers)
            {
                foreach (PortProtocol.Entity other in players) // other는 탐지 효과로 표시 가능한 서버 참가자다.
                {
                    if (!IsRevealedPlayer(other))
                        continue;
                    Vector2 delta = new Vector2(other.x, other.y) - center; // 표시 중심에서 대상까지의 서버 단위 거리다.
                    scale = full
                        ? Mathf.Min(scale, (width * 0.5f - 8) / Mathf.Max(1, Mathf.Abs(delta.x)), (height * 0.5f - 8) / Mathf.Max(1, Mathf.Abs(delta.y)))
                        : Mathf.Min(scale, (width * 0.5f - 8) / Mathf.Max(1, delta.magnitude));
                }
            }
            if (full)
                expandedScale = scale;

            float step = 1f / scale; // 출력 한 픽셀에 해당하는 서버 월드 거리다.
            float half = width * 0.5f; // 원형 작은 지도의 반지름(픽셀)이다.
            for (int y = 0; y < height; y++) // y는 아래쪽부터 세는 출력 픽셀 행이다.
            {
                float v = y + 0.5f - height * 0.5f; // 화면 중심에서 위로 떨어진 픽셀 거리다.
                float worldY = center.y - v * step; // 이 행에 대응하는 서버 세로 위치다.
                for (int x = 0; x < width; x++) // x는 왼쪽부터 세는 출력 픽셀 열이다.
                {
                    float u = x + 0.5f - half; // 화면 중심에서 오른쪽으로 떨어진 픽셀 거리다.
                    float r2 = u * u + v * v; // 작은 지도 원형 클리핑에 쓰는 픽셀 거리 제곱이다.
                    int index = y * width + x; // 텍스처 픽셀 배열의 순번이다.
                    if (!full && r2 >= half * half)
                        pixels[index] = default;
                    else if (full ? x < 2 || y < 2 || x >= width - 2 || y >= height - 2 : r2 >= (half - 3) * (half - 3))
                        pixels[index] = BorderColor;
                    else
                        pixels[index] = raster.Sample(center.x + u * step, worldY, showAll);
                }
            }

            foreach (Vector2 lamp in lamps) // lamp는 서버에서 생존이 확인된 귀환등 위치다.
                if (raster.IsExplored(lamp))
                    Stamp(pixels, width, height, ToPixel(lamp, center, scale, width, height), LampColor, 5);
            if (revealPlayers)
                foreach (PortProtocol.Entity other in players) // other는 탐지 효과로 표시할 상대 참가자다.
                    if (IsRevealedPlayer(other))
                        Stamp(pixels, width, height, ToPixel(new Vector2(other.x, other.y), center, scale, width, height), PlayerColor, 4);
            DrawArrow(pixels, width, height, ToPixel(position, center, scale, width, height), facing);
            if (full)
                DrawNumbers(center, scale, showAll);
            texture.SetPixels32(pixels);
            texture.Apply(false);
        }

        // 현재 탐지 대상으로 표시할 살아 있는 상대 플레이어인지 확인한다.
        private bool IsRevealedPlayer(PortProtocol.Entity other) // 서버 참가자 상태다.
        {
            return other.id != me.id && other.status.state == "alive";
        }

        // 탐색된 타일 중심의 서버 번호를 전체 지도 안에 표시한다.
        private void DrawNumbers(Vector2 center, float scale, bool showAll) // center는 서버 월드 중심, scale은 월드당 픽셀, showAll은 맵핵이다.
        {
            for (int index = 0; index < numbers.Count; index++) // index는 서버 타일 배열과 번호 라벨의 순번이다.
            {
                Vector2 point = raster.Centers[index]; // 타일 번호를 놓을 서버 월드 중심이다.
                Vector2 pixel = ToPixel(point, center, scale, 512, 320); // 전체 지도의 출력 픽셀 좌표다.
                bool visible = (showAll || raster.IsExplored(point)) && pixel.x > 12 && pixel.x < 500 && pixel.y > 11 && pixel.y < 309; // 번호가 화면 밖으로 잘리지 않는지 확인한다.
                numbers[index].gameObject.SetActive(visible);
                if (visible)
                    numbers[index].rectTransform.anchoredPosition = (pixel - new Vector2(256, 160)) * 1.25f;
            }
        }

        // 첫 왼쪽 마우스 또는 터치 포인터만 드래그를 시작하게 한다.
        private void BeginPan(PointerEventData pointer) // 지도 위에서 드래그를 시작한 포인터다.
        {
            if (IsOpen && !dragPointer.HasValue && pointer.button == PointerEventData.InputButton.Left)
                dragPointer = pointer.pointerId;
        }

        // 추적하던 포인터가 드래그를 끝내면 다음 포인터를 받을 수 있게 한다.
        private void EndPan(PointerEventData pointer) // 지도 위 드래그가 끝난 포인터다.
        {
            if (dragPointer == pointer.pointerId)
                dragPointer = null;
        }

        // 포인터의 화면 이동을 전체 지도 출력 범위에 맞춘 서버 월드 이동으로 바꾼다.
        private void Pan(PointerEventData pointer) // 현재 마우스 또는 터치 드래그 이벤트다.
        {
            if (!IsOpen || dragPointer != pointer.pointerId)
                return;
            // 드래그 시작점과 현재점의 지도 로컬 좌표이며 기준 Canvas 픽셀이다.
            if (RectTransformUtility.ScreenPointToLocalPointInRectangle(expanded, pointer.position, pointer.pressEventCamera, out Vector2 current) &&
                RectTransformUtility.ScreenPointToLocalPointInRectangle(expanded, pointer.position - pointer.delta, pointer.pressEventCamera, out Vector2 previous))
            {
                Vector2 delta = (current - previous) * (512f / expanded.rect.width / expandedScale); // 서버 월드 단위의 드래그 거리다.
                pan -= new Vector2(delta.x, -delta.y);
                drawAt = 0;
            }
        }

        // 월드 위치를 왼쪽 아래 원점의 지도 출력 픽셀로 바꾼다.
        private static Vector2 ToPixel(Vector2 point, Vector2 center, float scale, int width, int height) // point/center는 서버 좌표, scale과 width/height는 출력 픽셀 기준이다.
        {
            return new Vector2(width * 0.5f + (point.x - center.x) * scale, height * 0.5f - (point.y - center.y) * scale);
        }

        // 작은 원형 표식을 지도 안의 픽셀에 그린다.
        private static void Stamp(Color32[] pixels, int width, int height, Vector2 center, Color32 color, int radius) // pixels와 크기는 출력, center/radius는 픽셀, color는 표식 색이다.
        {
            int cx = Mathf.RoundToInt(center.x); // 표식 중심 열이다.
            int cy = Mathf.RoundToInt(center.y); // 표식 중심 행이다.
            for (int y = -radius; y <= radius; y++) // y는 표식 중심 기준 세로 픽셀이다.
            for (int x = -radius; x <= radius; x++) // x는 표식 중심 기준 가로 픽셀이다.
                if (x * x + y * y <= radius * radius)
                    Put(pixels, width, height, cx + x, cy + y, color);
        }

        // 서버의 주시 방향에 맞게 본인 화살표만 회전시킨다.
        private static void DrawArrow(Color32[] pixels, int width, int height, Vector2 center, float angle) // center는 픽셀 위치, angle은 서버 라디안 방향이다.
        {
            Vector2 forward = new(Mathf.Cos(angle), -Mathf.Sin(angle)); // 출력 좌표에서 향하는 단위 벡터다.
            Vector2 across = Vector2.Perpendicular(forward); // 화살표 좌우를 만드는 단위 벡터다.
            for (int x = -6; x <= 10; x++) // x는 화살표 앞쪽으로의 픽셀 거리다.
            {
                int span = (10 - x) / 3; // 이 행의 화살표 반폭(픽셀)이다.
                for (int y = -span; y <= span; y++) // y는 화살표 중심선에서 가로로 벗어난 픽셀이다.
                {
                    Vector2 point = center + forward * x + across * y; // 화살표를 회전한 최종 픽셀 위치다.
                    Put(pixels, width, height, Mathf.RoundToInt(point.x), Mathf.RoundToInt(point.y), ArrowColor);
                }
            }
        }

        // 지도 안에서만 표식 색을 덮어써 원형 모서리의 투명도를 보존한다.
        private static void Put(Color32[] pixels, int width, int height, int x, int y, Color32 color) // pixels/width/height는 출력, x/y는 픽셀, color는 표식 색이다.
        {
            if (x < 0 || y < 0 || x >= width || y >= height)
                return;
            int index = y * width + x; // 바꿀 출력 픽셀의 배열 순번이다.
            if (pixels[index].a != 0)
                pixels[index] = color;
        }

        // 지도 표시에 쓸 독립적인 RGBA 텍스처를 만든다.
        private static Texture2D MakeTexture(int width, int height) // 출력 가로·세로 픽셀 수다.
        {
            return new Texture2D(width, height, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        }

        // Play 세션에서 생성한 지도 텍스처를 해제한다.
        internal void Dispose()
        {
            UnityEngine.Object.Destroy(miniTexture);
            UnityEngine.Object.Destroy(expandedTexture);
        }
    }
}
