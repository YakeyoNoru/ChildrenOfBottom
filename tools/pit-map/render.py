"""실제 생성된 JSON의 좌표와 다리만 사용해 검토용 맵 구조도를 렌더링한다."""
import json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ROOT: 현재 도구의 소스와 결과가 있는 경로.
ROOT = Path(__file__).parent  # 시제품과 샘플이 있는 폴더.
# FONT: 구조도 한글과 번호에 사용할 포함 글꼴 경로.
FONT = str(ROOT / 'PitKorean_subset.ttf')  # 한글 표시용 글꼴.
# SYMBOL_FONT: 명세 지형 기호에 사용할 포함 글꼴 경로.
SYMBOL_FONT = str(ROOT / 'PitSymbols_subset.ttf')  # 명세 아이콘 글꼴.
# COLORS: 높이별 명세 지형 색상.
COLORS = ['#D7FFD0', '#AAC9A4', '#839C7F', '#5C6E59']  # 높이 순서의 지형 색상.
# ICONS: 지형 종류별 명세 기호.
ICONS = {'start':'⌂','normal':'','rich':'♧','safe':'♨','boss':'◎'}  # 지형 종류별 아이콘.


# 매개변수 · seed: 추첨과 배치를 재현하는 32비트 시드.
def render(seed):
    """지정 시드의 검증 완료 JSON을 읽고 고해상도 구조도 PNG를 만든다."""
    # data: 검증할 타일·다리·방향 간선 데이터.
    data = json.loads((ROOT / f'sample_{seed}.json').read_text())  # 원본 지도 데이터.
    # size: 이 단계에서 size 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # margin: 이 단계에서 margin 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # header: 이 단계에서 header 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    size, margin, header = 80, 90, 170  # 타일 격자 반지름, 여백, 상단 설명 영역.
    # points: 이 단계에서 points 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    points = [(1.5*size*t['q'], math.sqrt(3)*size*(t['r']+t['q']/2)) for t in data['tiles']]  # 실제 슬롯 중심.
    # min_x: 이 단계에서 min_x 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # max_x: 이 단계에서 max_x 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # x: 이 단계에서 x 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # y: 이 단계에서 y 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    min_x, max_x = min(x for x,y in points)-size, max(x for x,y in points)+size  # 지도 좌우 경계.
    # min_y: 이 단계에서 min_y 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # max_y: 이 단계에서 max_y 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # x: 이 단계에서 x 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # y: 이 단계에서 y 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    min_y, max_y = min(y for x,y in points)-size, max(y for x,y in points)+size  # 지도 상하 경계.
    # width: 이 단계에서 width 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # height: 해당 타일의 논리 지형 높이.
    width, height = int(max_x-min_x+margin*2), int(max_y-min_y+header+160)  # 최종 이미지 크기.
    # image: 이 단계에서 image 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    image = Image.new('RGB', (width,height),'#F3F6F2')  # 렌더링 결과 이미지.
    # draw: 이 단계에서 draw 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    draw = ImageDraw.Draw(image)  # 이미지 그리기 도구.
    # title_font: 이 단계에서 title_font 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    title_font = ImageFont.truetype(FONT,34)  # 제목 글꼴.
    # body_font: 이 단계에서 body_font 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    body_font = ImageFont.truetype(FONT,20)  # 설명 글꼴.
    # number_font: 이 단계에서 number_font 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    number_font = ImageFont.truetype(FONT,23)  # 타일 번호 글꼴.
    # symbol_font: 이 단계에서 symbol_font 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    symbol_font = ImageFont.truetype(SYMBOL_FONT,37)  # 지형 아이콘 글꼴.
    # font: 이 단계에서 font 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for font in [title_font, body_font, number_font]:  # 가독성을 위한 글꼴 굵기.
        font.set_variation_by_axes([500])
    # centers: 이 단계에서 centers 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # x: 이 단계에서 x 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # y: 이 단계에서 y 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    centers = [(x-min_x+margin,y-min_y+header) for x,y in points]  # 이미지 기준 타일 중심.
    draw.text((margin,28),'구덩이 구현로직 · 단방향 통행 적용',font=title_font,fill='#173623')
    draw.text((margin,82),f"시드 {seed}   |   {len(data['tiles'])}개 타일   |   {len(data['bridges'])}개 다리   |   모든 규칙 검증 통과",font=body_font,fill='#385341')
    draw.text((margin,116),'추가 타일: '+(', '.join(map(str,data['selectedOptional'])) or '없음'),font=body_font,fill='#385341')
    draw.text((margin,145),'주황 화살표: 2→3만 통행 가능 · 높이 1의 모든 묶음에 시작점 배치',font=body_font,fill='#A45400')
    # index: 이 단계에서 index 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # tile: 이 단계에서 tile 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for index,tile in enumerate(data['tiles']):  # 현재 그릴 타일 인덱스와 정의.
        # x: 이 단계에서 x 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # y: 이 단계에서 y 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        x,y = centers[index]  # 타일 중심.
        # vertices: 이 단계에서 vertices 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # c: 이 단계에서 c 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        vertices = [(x+size*.90*math.cos(c*math.pi/3),y+size*.90*math.sin(c*math.pi/3)) for c in range(6)]  # 정육각형 꼭짓점.
        draw.polygon(vertices,fill=COLORS[tile['height']-1],outline='white',width=4)
        # ink: 이 단계에서 ink 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        ink = '#FFFFFF' if tile['height']==4 else '#182B1E'  # 배경 대비 글자 색.
        draw.text((x,y-5),ICONS[tile['kind']],font=symbol_font,fill=ink,anchor='mm')
        draw.text((x,y+size*.43),str(tile['id']),font=number_font,fill=ink,anchor='mm')
    # a: 다리의 첫 번째 끝 타일 인덱스.
    # b: 다리의 두 번째 끝 타일 인덱스.
    for a,b in data['bridges']:  # 실제 존재하는 다리의 양 끝.
        # ax: 이 단계에서 ax 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # ay: 이 단계에서 ay 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        ax,ay = centers[a]  # 낮은 인덱스 타일 중심.
        # bx: 이 단계에서 bx 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # by: 이 단계에서 by 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        bx,by = centers[b]  # 높은 인덱스 타일 중심.
        # dx: 이 단계에서 dx 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # dy: 이 단계에서 dy 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        dx,dy = bx-ax,by-ay  # 다리 진행 방향.
        # length: 이 단계에서 length 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        length = math.hypot(dx,dy)  # 중심 사이의 거리.
        # ux: 이 단계에서 ux 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # uy: 이 단계에서 uy 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        ux,uy = dx/length,dy/length  # 다리의 단위 방향.
        # mx: 이 단계에서 mx 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # my: 이 단계에서 my 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        mx,my = (ax+bx)/2,(ay+by)/2  # 두 변 사이의 다리 중심.
        # offset: 이 단계에서 offset 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        for offset in [-7,7]:  # 검은 평행 난간의 양쪽 위치.
            # endpoints: 이 단계에서 endpoints 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # part: 이 단계에서 part 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            endpoints = [(mx+ux*part-uy*offset,my+uy*part+ux*offset) for part in [-20,20]]  # 난간의 시작·끝 좌표.
            draw.line(endpoints,fill='white',width=9)
            draw.line(endpoints,fill='#080C09',width=5)
        if {data['tiles'][a]['height'],data['tiles'][b]['height']}=={2,3}:
            # direction: 이 단계에서 direction 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            direction=1 if data['tiles'][a]['height']==2 else -1  # 표시할 2→3 허용 방향.
            # vx: 이 단계에서 vx 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # vy: 이 단계에서 vy 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            vx,vy=ux*direction,uy*direction  # 허용 방향의 단위 벡터.
            draw.line([(mx-vx*14,my-vy*14),(mx+vx*6,my+vy*6)],fill='#EC8500',width=4)
            draw.polygon([(mx+vx*15,my+vy*15),(mx+vx*2-vy*7,my+vy*2+vx*7),(mx+vx*2+vy*7,my+vy*2-vx*7)],fill='#EC8500')
    # legend_y: 이 단계에서 legend_y 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    legend_y = height-100  # 범례 표시 높이.
    # index: 이 단계에서 index 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # label: 이 단계에서 label 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for index,label in enumerate(['높이 1','높이 2','높이 3','높이 4']):  # 높이 색상 범례.
        # x: 이 단계에서 x 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        x = margin+index*180  # 각 범례의 가로 위치.
        draw.rectangle((x,legend_y,x+30,legend_y+22),fill=COLORS[index],outline='white',width=2)
        draw.text((x+40,legend_y-2),label,font=body_font,fill='#24402C')
    # index: 이 단계에서 index 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # symbol: 이 단계에서 symbol 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # label: 이 단계에서 label 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for index,(symbol,label) in enumerate([('⌂','시작지점'),('♧','풍요필드'),('♨','안전지대'),('◎','보스')]):  # 지형 종류별 범례.
        # x: 이 단계에서 x 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        x = margin+index*155  # 범례 항목 위치.
        draw.text((x,legend_y+35),symbol,font=ImageFont.truetype(SYMBOL_FONT,23),fill='#24402C')
        draw.text((x+28,legend_y+38),label,font=body_font,fill='#24402C')
    draw.text((margin+630,legend_y+38),'일반필드: 아이콘 없음',font=body_font,fill='#24402C')
    image.save(ROOT/f'map_{seed}.png')


if __name__ == '__main__':
    import sys
    # seed: 추첨과 배치를 재현하는 32비트 시드.
    for seed in map(int,sys.argv[1:]):  # 사용자가 지정한 샘플 시드.
        render(seed)
