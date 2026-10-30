"""생성기와 분리하여 실제 좌표·다리에서 기존 규칙과 묶음 규칙을 재계산한다."""
import json
from pathlib import Path
from collections import deque,Counter
from rules import definition, select_tiles, movement_arcs

# ROOT: 현재 도구의 소스와 결과가 있는 경로.
ROOT=Path(__file__).parent  # 증거 지도·검증 보고서를 저장할 경로.
# DIRECTIONS: 변을 공유하는 여섯 축 좌표 차이.
DIRECTIONS={(1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1)}  # 변을 공유하는 육각형 축 좌표 차이.

# 매개변수 · data: 검증할 타일·다리·방향 간선 데이터; check_draw: 시드의 독립 추첨과 번호 일치 여부도 검사할지 설정.
def validate(data,check_draw=True):
    """모든 필수 규칙을 검사하고 묶음·시작점별 수치와 함께 결과를 반환한다."""
    # tiles: 생성된 전체 타일 데이터.
    # bridges: 물리적으로 연결한 타일 인덱스 쌍.
    tiles=data['tiles'];bridges=data['bridges']  # 실제 생성 결과의 타일과 다리.
    # graph: 물리적 다리 기준 타일별 이웃 목록.
    # _: 이 단계에서 _ 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    graph=[set() for _ in tiles]  # 다리만으로 구성한 이웃 목록.
    # by_id: 이 단계에서 by_id 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    by_id={t['id']:i for i,t in enumerate(tiles)}  # 고유 번호로 내부 타일 인덱스 조회.
    # selected: 한 번 추첨하여 고정한 추가 타일 번호.
    selected=data['selectedOptional']  # 추첨 후 고정된 추가 타일 목록.
    # expected: 이 단계에서 expected 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    expected=set(range(1,51))|set(selected)  # 존재해야 하는 정확한 고유 번호 집합.
    # count: 추첨 결과에 따른 전체 타일 수.
    count=len(expected)  # 추가 타일을 포함한 전체 수량.
    if check_draw:assert selected==select_tiles(data['seed']),'시드별 독립 추첨 결과 보존'
    assert len(tiles)==count and set(by_id)==expected,'기본 50개와 추첨된 타일의 정확한 고유 번호'
    # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    assert len({(t['q'],t['r']) for t in tiles})==count,'중복 슬롯'
    # unique: 이 단계에서 unique 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    unique=set()  # 중복 다리 탐지 집합.
    # a: 다리의 첫 번째 끝 타일 인덱스.
    # b: 다리의 두 번째 끝 타일 인덱스.
    for a,b in bridges:  # 실제 설치한 다리의 양 끝.
        assert 0<=a<count and 0<=b<count and a!=b,'유효 다리 끝점'
        # key: 이 단계에서 key 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        key=tuple(sorted((a,b)))  # 방향을 제외한 다리 식별자.
        assert key not in unique,'다리 중복';unique.add(key)
        assert (tiles[b]['q']-tiles[a]['q'],tiles[b]['r']-tiles[a]['r']) in DIRECTIONS,'실제 인접 슬롯'
        assert abs(tiles[a]['height']-tiles[b]['height'])<=1,'높이 차이'
        graph[a].add(b);graph[b].add(a)
    # 매개변수 · source: 최단 거리 탐색을 시작할 타일 인덱스.
    def distances(source):
        """단일 출발 타일에서 다른 타일까지의 최단 다리 수를 계산한다."""
        # distance: 이 단계에서 distance 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # queue: 이 단계에서 queue 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        distance={source:0};queue=deque([source])  # 거리 표와 탐색 대기열.
        while queue:
            # current: 이 단계에서 current 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            current=queue.popleft()  # 현재 탐색 타일.
            # neighbor: 이 단계에서 neighbor 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            for neighbor in graph[current]:  # 다리로 연결된 다음 타일.
                if neighbor not in distance:distance[neighbor]=distance[current]+1;queue.append(neighbor)
        return distance
    assert len(distances(0))==count,'전체 연결'
    # i: 처리 중인 타일 또는 목록 인덱스.
    # tile: 이 단계에서 tile 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for i,tile in enumerate(tiles):  # 고유 번호·높이·종류·다리·인접면 검사.
        # number: 높이와 종류를 조회할 고유 타일 번호.
        # height: 해당 타일의 논리 지형 높이.
        # kind: 번호에 고정된 지형 종류.
        number=tile['id'];height,kind=definition(number)  # 기본·추가 번호별 고정 높이와 종류.
        assert (tile['height'],tile['kind'])==(height,kind),'번호별 높이·종류'
        assert isinstance(tile['q'],int) and isinstance(tile['r'],int),'정수 격자'
        assert (2 if height==1 else 1)<=len(graph[i])<=4,'다리 최소·최대'
        # n: 이 단계에서 n 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        assert any(tiles[n]['height']==height for n in graph[i]),'같은 높이 다리'
        # other: 이 단계에서 other 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        if height==1:assert sum((other['q']-tile['q'],other['r']-tile['r']) in DIRECTIONS for other in tiles)>=2,'높이1 인접면'
    # components: 이 단계에서 components 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    components={}  # 실제 다리에서 재계산한 높이별 연결 묶음.
    # height: 해당 타일의 논리 지형 높이.
    for height in range(1,5):  # 모든 높이의 같은 높이 묶음 탐색.
        # unseen: 이 단계에서 unseen 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # groups: 이 단계에서 groups 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # i: 처리 중인 타일 또는 목록 인덱스.
        # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        unseen={i for i,t in enumerate(tiles) if t['height']==height};groups=[]  # 아직 방문하지 않은 타일과 찾은 묶음.
        while unseen:
            # source: 최단 거리 탐색을 시작할 타일 인덱스.
            # group: 이 단계에서 group 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # queue: 이 단계에서 queue 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            source=unseen.pop();group={source};queue=deque([source])  # 새 묶음의 출발점과 탐색 대기열.
            while queue:
                # current: 이 단계에서 current 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
                current=queue.popleft()  # 탐색 중인 타일.
                # neighbor: 이 단계에서 neighbor 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
                for neighbor in graph[current]:  # 연결된 같은 높이 타일만 확장.
                    if neighbor in unseen:unseen.remove(neighbor);group.add(neighbor);queue.append(neighbor)
            # i: 처리 중인 타일 또는 목록 인덱스.
            groups.append(sorted(tiles[i]['id'] for i in group))
        components[height]=sorted(groups,key=lambda g:g[0])
        # group: 이 단계에서 group 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # number: 높이와 종류를 조회할 고유 타일 번호.
        if height==1:assert all(any(1<=number<=5 for number in group) for group in groups),'높이 1 묶음의 시작점 누락'
        # g: 같은 높이의 연결 묶음 인덱스.
        if height in [1,2]:assert all(4<=len(g)<=(8 if height==1 else 6) for g in groups),'새 묶음 크기 제한'
    # component_exits: 이 단계에서 component_exits 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    component_exits=[]  # 각 실제 연결 묶음이 가진 위·아래 높이 연결 수.
    # height: 해당 타일의 논리 지형 높이.
    # groups: 이 단계에서 groups 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for height,groups in components.items():
        # numbers: 이 단계에서 numbers 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        for numbers in groups:
            # indices: 이 단계에서 indices 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # number: 높이와 종류를 조회할 고유 타일 번호.
            indices={by_id[number] for number in numbers}  # 해당 묶음의 실제 타일 인덱스.
            # upward: 이 단계에서 upward 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # i: 처리 중인 타일 또는 목록 인덱스.
            # n: 이 단계에서 n 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            upward=sum(tiles[n]['height']==height+1 for i in indices for n in graph[i])  # 한 높이 위로 나가는 다리 수.
            # downward: 이 단계에서 downward 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # i: 처리 중인 타일 또는 목록 인덱스.
            # n: 이 단계에서 n 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            downward=sum(tiles[n]['height']==height-1 for i in indices for n in graph[i])  # 한 높이 아래로 나가는 다리 수.
            if height<=3:assert upward>=1,'연결 묶음의 위쪽 다리 누락'
            if height>=2:assert downward>=1,'연결 묶음의 아래쪽 다리 누락'
            component_exits.append({'height':height,'tiles':numbers,'upward':upward,'downward':downward})
    # transitions: 이 단계에서 transitions 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    transitions=[]  # 낮은 높이에서 높은 높이로 가는 다리 목록.
    # boss_gates: 이 단계에서 boss_gates 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    boss_gates=[]  # 높이별 보스→비보스 필수 연결 목록.
    # height: 해당 타일의 논리 지형 높이.
    # minimum: 이 단계에서 minimum 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # maximum: 이 단계에서 maximum 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for height,minimum,maximum in [(1,3,7),(2,2,5),(3,2,3)]:
        # boundary: 이 단계에서 boundary 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # a: 다리의 첫 번째 끝 타일 인덱스.
        # b: 다리의 두 번째 끝 타일 인덱스.
        boundary=[(a,b) if tiles[a]['height']<tiles[b]['height'] else (b,a) for a,b in bridges if {tiles[a]['height'],tiles[b]['height']}=={height,height+1}]  # 해당 경계 다리.
        assert minimum<=len(boundary)<=maximum,'높이별 다리 수'
        # gates: 이 단계에서 gates 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # a: 다리의 첫 번째 끝 타일 인덱스.
        # b: 다리의 두 번째 끝 타일 인덱스.
        gates=[(tiles[a]['id'],tiles[b]['id']) for a,b in boundary if tiles[a]['kind']=='boss' and tiles[b]['kind']!='boss']  # 낮은 보스에서 높은 비보스로 향하는 다리.
        assert gates,'보스 출발 필수 연결'
        transitions.append(len(boundary));boss_gates.append(gates)
    # starts: 이 단계에서 starts 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    starts=[]  # 시작지점별 보호 거리와 차수 보고.
    # slots: 이 단계에서 slots 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    slots={(t['q'],t['r']) for t in tiles}  # 외곽 여부를 계산할 점유 슬롯.
    # specials: 이 단계에서 specials 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    specials=[i for i,t in enumerate(tiles) if t['kind'] in ['safe','boss']]  # 보호 대상 특수 지형.
    # number: 높이와 종류를 조회할 고유 타일 번호.
    for number in range(1,6):
        # index: 이 단계에서 index 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # tile: 이 단계에서 tile 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # distance: 이 단계에서 distance 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        index=by_id[number];tile=tiles[index];distance=distances(index)  # 해당 시작점의 실제 최단 다리 수.
        # dq: 이 단계에서 dq 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # dr: 이 단계에서 dr 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        assert any((tile['q']+dq,tile['r']+dr) not in slots for dq,dr in DIRECTIONS),'외곽 시작점'
        # n: 이 단계에서 n 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        assert all(tiles[n]['height']==1 and tiles[n]['kind'] in ['normal','rich'] for n in graph[index]),'시작점 직접 연결 종류·높이'
        # other: 이 단계에서 other 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        assert all(distance[by_id[other]]>=2 for other in range(1,6) if other!=number),'시작점 간 거리'
        # other: 이 단계에서 other 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        assert all(distance[other]>=3 for other in specials),'특수 지형 보호 거리'
        # other: 이 단계에서 other 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        starts.append({'id':number,'degree':len(graph[index]),'nearestSpecial':min(distance[other] for other in specials)})
    # expected_arcs: 이 단계에서 expected_arcs 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    expected_arcs=movement_arcs(data)  # 다리의 물리 연결에서 유도한 정확한 이동 방향.
    assert sorted(data.get('movementArcs',[]))==sorted(expected_arcs),'이동 방향: 3→2만 금지'
    # radii: 이 단계에서 radii 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    radii={h:[max(abs(t['q']),abs(t['r']),abs(t['q']+t['r'])) for t in tiles if t['height']==h] for h in range(1,5)}  # 높이별 중앙·외곽 분포.
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    assert all(sum(radii[h])*len(radii[h+1])>sum(radii[h+1])*len(radii[h]) for h in range(1,4)),'높이별 평균 중앙·외곽 순서'
    # g: 같은 높이의 연결 묶음 인덱스.
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # gs: 이 단계에서 gs 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # rs: 이 단계에서 rs 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # a: 다리의 첫 번째 끝 타일 인덱스.
    # b: 다리의 두 번째 끝 타일 인덱스.
    # i: 처리 중인 타일 또는 목록 인덱스.
    # other: 이 단계에서 other 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    return {'valid':True,'tileCount':count,'selectedOptional':selected,'bridgeCount':len(bridges),'oneWayBridgeCount':sum({tiles[a]['height'],tiles[b]['height']}=={2,3} for a,b in bridges),'physicalConnectivity':True,'roundTripRequired':False,'componentSizes':{h:[len(g) for g in gs] for h,gs in components.items()},'components':components,'componentExits':component_exits,'transitionCounts':transitions,'bossGates':boss_gates,'starts':starts,'heightOneMinimumBridges':min(len(graph[i]) for i,t in enumerate(tiles) if t['height']==1),'heightOneMinimumAdjacency':min(sum((other['q']-t['q'],other['r']-t['r']) in DIRECTIONS for other in tiles) for t in tiles if t['height']==1),'radialRanges':{h:[min(rs),max(rs)] for h,rs in radii.items()}}

if __name__=='__main__':
    import sys
    # path: 이 단계에서 path 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    path=Path(sys.argv[1])  # 재검증할 지도 JSON 경로.
    # result: 독립 검증 또는 지도 생성의 반환 결과.
    result=validate(json.loads(path.read_text()))  # 생성기와 독립적으로 계산한 규칙 검사 결과.
    print(json.dumps(result,ensure_ascii=False,indent=2))
