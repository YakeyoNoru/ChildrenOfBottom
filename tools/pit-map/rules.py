"""추가 타일의 독립 생성 확률과 번호별 고정 정의를 공유한다."""
# OPTIONAL: 추가 번호별 고정 높이·종류·독립 생성 확률.
# i: 처리 중인 타일 또는 목록 인덱스.
OPTIONAL={**{i:(1,'normal',.8) for i in range(51,56)},**{i:(2,'rich',.5) for i in range(56,59)},59:(3,'normal',.3),60:(3,'rich',.3)}  # 번호별 높이·종류·생성 확률.

class RandomSource:
    """브라우저와 Python에서 같은 시드를 재현하는 32비트 난수 생성기."""
    # 매개변수 · self: 이 난수 생성기 인스턴스; seed: 추첨과 배치를 재현하는 32비트 시드.
    def __init__(self,seed):
        # state: 다음 난수 계산용 내부 32비트 상태.
        self.state=seed&0xffffffff  # 현재 난수 상태.
    # 매개변수 · self: 이 난수 생성기 인스턴스.
    def random(self):
        """0 이상 1 미만의 다음 난수를 반환한다."""
        # state: 다음 난수 계산용 내부 32비트 상태.
        self.state=(self.state+0x6D2B79F5)&0xffffffff
        # value: 이 단계에서 value 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        value=self.state  # 비트 혼합 작업 값.
        # value: 이 단계에서 value 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        value=((value^(value>>15))*(value|1))&0xffffffff
        # value: 이 단계에서 value 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        value^=(value+(((value^(value>>7))*(value|61))&0xffffffff))&0xffffffff
        return ((value^(value>>14))&0xffffffff)/4294967296
    # 매개변수 · self: 이 난수 생성기 인스턴스; values: 순서를 무작위로 섞을 번호 또는 슬롯 목록.
    def shuffle(self,values):
        """목록의 순서를 제자리에서 무작위로 섞는다."""
        # index: 이 단계에서 index 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        for index in range(len(values)-1,0,-1):
            # other: 이 단계에서 other 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            other=int(self.random()*(index+1))  # 교환할 무작위 위치.
            values[index],values[other]=values[other],values[index]

# 매개변수 · number: 높이와 종류를 조회할 고유 타일 번호.
def definition(number):
    """고유 번호에 고정된 높이와 종류를 반환한다."""
    if number in OPTIONAL:return OPTIONAL[number][:2]
    if not 1<=number<=50:raise ValueError('정의되지 않은 타일 번호')
    # height: 해당 타일의 논리 지형 높이.
    height=1 if number<=20 else 2 if number<=35 else 3 if number<=45 else 4  # 기본 타일의 높이.
    # kind: 번호에 고정된 지형 종류.
    kind='start' if number<=5 else 'safe' if number in [18,19,33,49] else 'boss' if number in [20,34,35,44,45,50] else 'rich' if 14<=number<=17 or 27<=number<=32 or 39<=number<=43 or 46<=number<=48 else 'normal'  # 기본 타일의 종류.
    return height,kind

# 매개변수 · seed: 추첨과 배치를 재현하는 32비트 시드.
def select_tiles(seed):
    """추가 타일 열 개를 한 번씩 독립 추첨한다. 배치 재시도와 별개로 결과를 고정한다."""
    # random: 타일 추첨 또는 배치 변형 전용 난수.
    random=RandomSource(seed)  # 타일 추첨 전용 난수. 배치 난수와 상태를 공유하지 않는다.
    # number: 높이와 종류를 조회할 고유 타일 번호.
    # _: 이 단계에서 _ 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # probability: 이 단계에서 probability 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    return [number for number,(_,_,probability) in OPTIONAL.items() if random.random()<probability]

# 매개변수 · selected: 한 번 추첨하여 고정한 추가 타일 번호.
def extra_counts(selected):
    """추첨된 타일을 높이별 개수로 집계한다."""
    # height: 해당 타일의 논리 지형 높이.
    # number: 높이와 종류를 조회할 고유 타일 번호.
    return tuple(sum(OPTIONAL[number][0]==height for number in selected) for height in [1,2,3])

# 매개변수 · template: 해당 높이별 수량에 대해 검증한 배치 구조; seed: 추첨과 배치를 재현하는 32비트 시드; selected: 한 번 추첨하여 고정한 추가 타일 번호.
def instantiate(template,seed,selected=None):
    """검증된 구조에 확정한 추가 타일 번호를 배정하고 격자를 회전·반사한다."""
    import copy
    # selected: 한 번 추첨하여 고정한 추가 타일 번호.
    selected=select_tiles(seed) if selected is None else selected  # 이번 게임에 실제로 존재할 추가 타일 번호.
    if list(extra_counts(selected))!=template['extraCounts']:raise ValueError('타일 추첨과 배치 수량 불일치')
    # result: 독립 검증 또는 지도 생성의 반환 결과.
    result=copy.deepcopy(template)  # 템플릿을 훼손하지 않을 이번 게임 데이터.
    # random: 타일 추첨 또는 배치 변형 전용 난수.
    random=RandomSource(seed^0xA5A5A5A5)  # 배치 변형 전용 난수.
    # tiles: 생성된 전체 타일 데이터.
    # numbers: 이 단계에서 numbers 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    tiles=result['tiles'];numbers=list(range(1,51))+selected  # 타일 슬롯과 이번 게임의 전체 번호 목록.
    # height: 해당 타일의 논리 지형 높이.
    for height in range(1,5):
        # neutral: 이 단계에서 neutral 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # i: 처리 중인 타일 또는 목록 인덱스.
        # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        neutral=[i for i,t in enumerate(tiles) if t['height']==height and t['kind']=='normal']  # 일반·풍요필드 배정 후보.
        random.shuffle(neutral)
        # rich_ids: 이 단계에서 rich_ids 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # n: 이 단계에서 n 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        rich_ids=[n for n in numbers if definition(n)==(height,'rich')]  # 해당 높이의 풍요필드 고유 번호.
        # index: 이 단계에서 index 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        for index in neutral[:len(rich_ids)]:tiles[index]['kind']='rich'
        # kind: 번호에 고정된 지형 종류.
        for kind in ['start','normal','rich','safe','boss']:
            # matches: 이 단계에서 matches 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # i: 처리 중인 타일 또는 목록 인덱스.
            # t: 이 단계에서 t 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            matches=[i for i,t in enumerate(tiles) if (t['height'],t['kind'])==(height,kind)]  # 같은 종류의 슬롯.
            # ids: 이 단계에서 ids 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # n: 이 단계에서 n 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            ids=[n for n in numbers if definition(n)==(height,kind)]  # 배정할 번호.
            if len(matches)!=len(ids):raise ValueError('번호별 종류 개수 불일치')
            random.shuffle(ids)
            # index: 이 단계에서 index 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # number: 높이와 종류를 조회할 고유 타일 번호.
            for index,number in zip(matches,ids):tiles[index]['id']=number
    # rotation: 이 단계에서 rotation 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # reflect: 이 단계에서 reflect 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    rotation=int(random.random()*6);reflect=random.random()<.5  # 격자를 유지하는 회전 횟수와 반사 여부.
    # tile: 이 단계에서 tile 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for tile in tiles:
        # q: 육각 격자의 첫 축 정수 좌표.
        # r: 육각 격자의 둘째 축 정수 좌표.
        q,r=tile['q'],tile['r']  # 변환 전 축 좌표.
        # q: 육각 격자의 첫 축 정수 좌표.
        # r: 육각 격자의 둘째 축 정수 좌표.
        if reflect:q,r=r,q
        # step: 이 단계에서 step 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # q: 육각 격자의 첫 축 정수 좌표.
        # r: 육각 격자의 둘째 축 정수 좌표.
        for step in range(rotation):q,r=-r,q+r
        tile['q'],tile['r']=q,r
    result.update({'version':'pit-4.0','seed':seed&0xffffffff,'selectedOptional':selected,'selectionPolicy':'independent-once','transform':{'rotation':rotation,'reflected':reflect}})
    result['movementArcs']=movement_arcs(result)  # 물리적 다리와 별도로 실제 통행 방향을 기록한다.
    return result

# 매개변수 · data: 검증할 타일·다리·방향 간선 데이터.
def movement_arcs(data):
    """모든 다리는 양방향으로 두되 높이 3→2 통행만 제외한 방향 간선을 만든다."""
    # arcs: 실제 통행 가능한 방향별 인덱스 쌍.
    arcs=[]  # 실제 통행 가능한 방향별 타일 인덱스 쌍.
    # tiles: 생성된 전체 타일 데이터.
    tiles=data['tiles']  # 각 다리 끝의 높이를 조회할 타일 목록.
    # a: 다리의 첫 번째 끝 타일 인덱스.
    # b: 다리의 두 번째 끝 타일 인덱스.
    for a,b in data['bridges']:
        if not (tiles[a]['height']==3 and tiles[b]['height']==2):arcs.append([a,b])
        if not (tiles[b]['height']==3 and tiles[a]['height']==2):arcs.append([b,a])
    return arcs
