"""추첨된 높이별 수량과 기존·묶음 규칙을 동시에 만족하는 가변 크기 배치를 찾는다."""
import json, math, time
from pathlib import Path
from ortools.sat.python import cp_model

# ROOT: 현재 도구의 소스와 결과가 있는 경로.
ROOT=Path(__file__).parent  # 검증 결과 저장 폴더.
# DIRECTIONS: 변을 공유하는 여섯 축 좌표 차이.
DIRECTIONS=[(1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1)]  # 축 좌표의 여섯 인접 방향.

# 매개변수 · radius: 고리를 구성할 격자 반지름(칸).
def ring(radius):
    """고정 육각형 격자 고리의 모든 좌표를 반환한다."""
    # result: 독립 검증 또는 지도 생성의 반환 결과.
    result=[]  # 순서대로 방문한 슬롯.
    # q: 육각 격자의 첫 축 정수 좌표.
    # r: 육각 격자의 둘째 축 정수 좌표.
    q,r=-radius,radius  # 고리 순회의 현재 축 좌표.
    # dq: 이 단계에서 dq 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # dr: 이 단계에서 dr 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for dq,dr in DIRECTIONS:  # 현재 이동 방향.
        # step: 이 단계에서 step 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        for step in range(radius):  # 한 변의 순회 단계.
            # q: 육각 격자의 첫 축 정수 좌표.
            # r: 육각 격자의 둘째 축 정수 좌표.
            result.append((q,r));q+=dq;r+=dr
    return result

# 매개변수 · extra_counts: 높이 1·2·3의 추가 타일 개수; seed: 추첨과 배치를 재현하는 32비트 시드; limit: 구조 탐색 제한 시간(초).
def solve(extra_counts=(0,0,0), seed=42, limit=12):
    """정수 제약 풀이로 기존·추가 규칙을 만족하는 구체적인 배치를 찾는다."""
    # n1: 이 단계에서 n1 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # n2: 이 단계에서 n2 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # n3: 이 단계에서 n3 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    n1,n2,n3=extra_counts  # 높이별 확정된 추가 타일 수.
    # totals: 이 단계에서 totals 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    totals=[20+n1,15+n2,10+n3,5]  # 추첨 결과를 포함한 높이별 전체 타일 수.
    # group_count: 이 단계에서 group_count 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    group_count=4 if totals[0]>24 else 3  # 높이 1의 4~8개 묶음을 유지하는 묶음 수.
    # 매개변수 · total: 묶음으로 나눌 타일 전체 개수; parts: 같은 높이를 나눌 연결 묶음 수.
    def partition(total,parts):
        """타일 수를 지정된 묶음 수에 고르게 나눈다."""
        # i: 처리 중인 타일 또는 목록 인덱스.
        return [total//parts+(i<total%parts) for i in range(parts)]
    # SIZES: 이 단계에서 SIZES 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    SIZES=partition(totals[0],group_count)+partition(totals[1],3)+[totals[2],5]  # 높이별 연결 묶음 크기.
    # HEIGHTS: 이 단계에서 HEIGHTS 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    HEIGHTS=[1]*group_count+[2]*3+[3,4]  # 각 묶음의 지형 높이.
    # group_total: 이 단계에서 group_total 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    group_total=len(SIZES)  # 이번 지도에 필요한 연결 묶음 수.
    # first_groups: 이 단계에서 first_groups 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    first_groups=range(group_count)  # 높이 1 묶음의 인덱스 범위.
    # outer: 이 단계에서 outer 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    outer=ring(4)  # 최외곽의 후보 슬롯.
    # outer_order: 이 단계에서 outer_order 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    outer_order=[0,1,2,3,8,9,10,11,16,17,18,19,20,4,12,21,5,13,22,6,14,23,7,15]  # 지도 크기에 따라 확장할 외곽 슬롯 순서.
    # slots: 이 단계에서 slots 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    slots=[(0,0)]+ring(1)+ring(2)+ring(3)+[outer[i] for i in outer_order[:sum(totals)-37]]  # 이번 수량에 맞는 불규칙 외곽 슬롯.
    # count: 추첨 결과에 따른 전체 타일 수.
    count=len(slots)  # 배치할 전체 타일 수.
    # distances: 이 단계에서 distances 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # q: 육각 격자의 첫 축 정수 좌표.
    # r: 육각 격자의 둘째 축 정수 좌표.
    distances=[max(abs(q),abs(r),abs(q+r)) for q,r in slots]  # 중심에서의 격자 반지름.
    # edges: 이 단계에서 edges 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    # j: 이 단계에서 j 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    edges=[(i,j) for i in range(count) for j in range(i+1,count) if (slots[j][0]-slots[i][0],slots[j][1]-slots[i][1]) in DIRECTIONS]  # 실제 변을 공유하는 슬롯 쌍.
    # incident: 이 단계에서 incident 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    # e: 검사하거나 설치할 다리 인덱스.
    # a: 다리의 첫 번째 끝 타일 인덱스.
    # b: 다리의 두 번째 끝 타일 인덱스.
    incident=[[e for e,(a,b) in enumerate(edges) if a==i or b==i] for i in range(count)]  # 슬롯별 다리 후보 목록.
    # model: 배치·연결 규칙을 담는 정수 제약 모델.
    model=cp_model.CpModel()  # 생성 규칙을 담는 정수 제약 모델.
    # groups: 이 단계에서 groups 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    groups=[model.NewIntVar(0,group_total-1,f'g{i}') for i in range(count)]  # 슬롯마다 배정할 연결 묶음.
    # member: 각 슬롯의 묶음 소속 여부.
    # i: 처리 중인 타일 또는 목록 인덱스.
    # g: 같은 높이의 연결 묶음 인덱스.
    member=[[model.NewBoolVar(f'x{i}_{g}') for g in range(group_total)] for i in range(count)]  # 슬롯의 묶음 소속 여부.
    # height: 해당 타일의 논리 지형 높이.
    # i: 처리 중인 타일 또는 목록 인덱스.
    height=[model.NewIntVar(1,4,f'h{i}') for i in range(count)]  # 슬롯의 높이.
    # bridge: 후보 인접 슬롯 사이의 실제 다리 선택 여부.
    # e: 검사하거나 설치할 다리 인덱스.
    bridge=[model.NewBoolVar(f'e{e}') for e in range(len(edges))]  # 인접 슬롯 사이의 실제 다리 설치 여부.
    # start: 이 단계에서 start 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    start=[model.NewBoolVar(f'st{i}') for i in range(count)]  # 시작지점 배정 여부.
    # boss: 이 단계에서 boss 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    boss=[model.NewBoolVar(f'bo{i}') for i in range(count)]  # 보스 배정 여부.
    # safe: 이 단계에서 safe 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    safe=[model.NewBoolVar(f'sa{i}') for i in range(count)]  # 안전지대 배정 여부.
    # special: 이 단계에서 special 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    special=[model.NewBoolVar(f'sp{i}') for i in range(count)]  # 시작점에서 세 다리 이상 떨어져야 하는 지형 여부.
    # near: 이 단계에서 near 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # i: 처리 중인 타일 또는 목록 인덱스.
    near=[model.NewBoolVar(f'ne{i}') for i in range(count)]  # 시작점 자신이나 다리 하나 거리의 보호 영역.
    # i: 처리 중인 타일 또는 목록 인덱스.
    for i in range(count):  # 각 슬롯에 걸리는 기본 배치·차수·지형 규칙.
        # g: 같은 높이의 연결 묶음 인덱스.
        model.AddExactlyOne(member[i]);model.Add(groups[i]==sum(g*member[i][g] for g in range(group_total)))
        # g: 같은 높이의 연결 묶음 인덱스.
        model.Add(height[i]==sum(HEIGHTS[g]*member[i][g] for g in range(group_total)))
        # g: 같은 높이의 연결 묶음 인덱스.
        for g in range(group_total):  # 높이에 따른 대략적인 바깥·중앙 배치 허용 범위.
            if not ({1:distances[i]>=3,2:2<=distances[i]<=4,3:1<=distances[i]<=3,4:distances[i]<=1}[HEIGHTS[g]]):model.Add(member[i][g]==0)
        # e: 검사하거나 설치할 다리 인덱스.
        # g: 같은 높이의 연결 묶음 인덱스.
        model.Add(sum(bridge[e] for e in incident[i])>=1+sum(member[i][g] for g in first_groups))
        # e: 검사하거나 설치할 다리 인덱스.
        model.Add(sum(bridge[e] for e in incident[i])<=4)
        # g: 같은 높이의 연결 묶음 인덱스.
        if len(incident[i])<2:model.Add(sum(member[i][g] for g in first_groups)==0)
        # g: 같은 높이의 연결 묶음 인덱스.
        model.Add(start[i]<=sum(member[i][g] for g in first_groups));model.Add(start[i]+boss[i]+safe[i]<=1)
        model.Add(special[i]==boss[i]+safe[i]);model.Add(near[i]>=start[i]);model.Add(near[i]+special[i]<=1)
        # q: 육각 격자의 첫 축 정수 좌표.
        # r: 육각 격자의 둘째 축 정수 좌표.
        q,r=slots[i]  # 현재 슬롯 좌표.
        # dq: 이 단계에서 dq 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # dr: 이 단계에서 dr 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        if all((q+dq,r+dr) in slots for dq,dr in DIRECTIONS):model.Add(start[i]==0)
    model.Add(sum(start)==5)
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for h in range(1,5):  # 각 높이의 보스·안전지대 수.
        # kind: 번호에 고정된 지형 종류.
        # target: 이 단계에서 target 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        for kind,target in [(boss,[1,2,2,1][h-1]),(safe,[2,1,0,1][h-1])]:  # 검사할 지형 종류와 목표 개수.
            # counted: 이 단계에서 counted 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            counted=[]  # 해당 높이에서 선택된 지형 여부.
            # i: 처리 중인 타일 또는 목록 인덱스.
            for i in range(count):  # 집계할 슬롯.
                # value: 이 단계에서 value 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
                value=model.NewBoolVar(f'ct{h}_{id(kind)}_{i}')  # 높이와 지형 종류의 논리곱.
                model.Add(height[i]==h).OnlyEnforceIf(value);model.AddImplication(value,kind[i]);model.Add(height[i]!=h).OnlyEnforceIf([kind[i],value.Not()]);counted.append(value)
            model.Add(sum(counted)==target)
    # cross_records: 이 단계에서 cross_records 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    cross_records=[]  # 경계 다리의 낮은 끝·높은 끝·선택 변수를 묶음별 검사에 재사용한다.
    # crossings: 이 단계에서 crossings 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    crossings={h:[] for h in range(1,4)}  # 높이별 경계 다리 선택 변수.
    # boss_crossings: 이 단계에서 boss_crossings 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    boss_crossings={h:[] for h in range(1,4)}  # 보스에서 비보스로 나가는 필수 경계 다리.
    # e: 검사하거나 설치할 다리 인덱스.
    # a: 다리의 첫 번째 끝 타일 인덱스.
    # b: 다리의 두 번째 끝 타일 인덱스.
    for e,(a,b) in enumerate(edges):  # 모든 후보 다리에 적용할 제한.
        # allowed: 이 단계에서 allowed 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # ga: 이 단계에서 ga 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # gb: 이 단계에서 gb 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        allowed=[(ga,gb,0) for ga in range(group_total) for gb in range(group_total)]  # 다리를 설치하지 않는 조합.
        # allowed: 이 단계에서 allowed 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # ga: 이 단계에서 ga 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # gb: 이 단계에서 gb 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        allowed += [(ga,gb,1) for ga in range(group_total) for gb in range(group_total) if abs(HEIGHTS[ga]-HEIGHTS[gb])<=1 and (HEIGHTS[ga]!=HEIGHTS[gb] or ga==gb)]
        model.AddAllowedAssignments([groups[a],groups[b],bridge[e]],allowed)
        model.Add(start[a]+start[b]+bridge[e]<=2)
        # low: 낮은 높이의 다리 끝점.
        # high: 높은 높이의 다리 끝점.
        for low,high in [(a,b),(b,a)]:  # 양방향의 시작점 보호·높이 연결 검사.
            model.Add(height[high]==1).OnlyEnforceIf([start[low],bridge[e]])
            model.Add(near[high]>=start[low]+bridge[e]-1)
            model.Add(near[low]+special[high]+bridge[e]<=2)
        # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        for h in range(1,4):  # 경계 다리 수와 필수 보스 출발 다리를 집계.
            # low: 낮은 높이의 다리 끝점.
            # high: 높은 높이의 다리 끝점.
            for low,high in [(a,b),(b,a)]:  # 낮은 높이에서 높은 높이로 향하는 후보.
                # cross: 해당 높이 경계 다리의 실제 선택 여부.
                cross=model.NewBoolVar(f'cross{e}_{h}_{low}')  # 실제 경계 다리 여부.
                model.Add(height[low]==h).OnlyEnforceIf(cross);model.Add(height[high]==h+1).OnlyEnforceIf(cross);model.AddImplication(cross,bridge[e])
                model.AddForbiddenAssignments([height[low],height[high]],[(h,h+1)]).OnlyEnforceIf([bridge[e],cross.Not()])
                crossings[h].append(cross);cross_records.append((h,low,high,cross))
                # gate: 이 단계에서 gate 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
                gate=model.NewBoolVar(f'gate{e}_{h}_{low}')  # 보스→비보스 필수 다리 여부.
                model.AddImplication(gate,cross);model.AddImplication(gate,boss[low]);model.AddImplication(gate,boss[high].Not());boss_crossings[h].append(gate)
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # minimum: 이 단계에서 minimum 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # maximum: 이 단계에서 maximum 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for h,minimum,maximum in [(1,3,7),(2,2,5),(3,2,3)]:  # 기존 높이별 경계 다리 개수 제한.
        model.AddLinearConstraint(sum(crossings[h]),minimum,maximum);model.Add(sum(boss_crossings[h])>=1)
    # g: 같은 높이의 연결 묶음 인덱스.
    # size: 이 단계에서 size 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for g,size in enumerate(SIZES):  # 묶음별 연결성과 정확한 크기를 단일 흐름으로 보장.
        # i: 처리 중인 타일 또는 목록 인덱스.
        model.Add(sum(member[i][g] for i in range(count))==size)
        # roots: 연결성을 증명할 묶음별 흐름 시작점.
        # i: 처리 중인 타일 또는 목록 인덱스.
        roots=[model.NewBoolVar(f'root{g}_{i}') for i in range(count)]  # 해당 묶음 흐름의 출발점 후보.
        model.AddExactlyOne(roots)
        # flows: 이 단계에서 flows 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        flows=[]  # 다리별 부호 있는 묶음 내부 흐름.
        # same_edges: 이 단계에서 same_edges 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        same_edges=[]  # 동일 묶음 내부에 설치된 다리 여부.
        # e: 검사하거나 설치할 다리 인덱스.
        # a: 다리의 첫 번째 끝 타일 인덱스.
        # b: 다리의 두 번째 끝 타일 인덱스.
        for e,(a,b) in enumerate(edges):  # 묶음 내부 다리 후보.
            # active: 이 단계에서 active 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            active=model.NewBoolVar(f'active{g}_{e}')  # 다리가 설치되고 두 끝이 해당 묶음인 조건.
            model.Add(active<=bridge[e]);model.Add(active<=member[a][g]);model.Add(active<=member[b][g]);model.Add(active>=bridge[e]+member[a][g]+member[b][g]-2)
            # flow: 이 단계에서 flow 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            flow=model.NewIntVar(-size,size,f'f{g}_{e}')  # 연결성을 증명하는 가상 흐름.
            model.Add(flow<=size*active);model.Add(flow>=-size*active);flows.append(flow);same_edges.append(active)
        # i: 처리 중인 타일 또는 목록 인덱스.
        for i in range(count):  # 묶음 소속 타일은 반드시 흐름을 받아야 한다.
            # e: 검사하거나 설치할 다리 인덱스.
            model.Add(roots[i]<=member[i][g]);model.Add(sum(flows[e] if edges[e][0]==i else -flows[e] for e in incident[i])==size*roots[i]-member[i][g])
            # e: 검사하거나 설치할 다리 인덱스.
            model.Add(sum(same_edges[e] for e in incident[i])>=member[i][g])
    # g: 같은 높이의 연결 묶음 인덱스.
    # height_value: 이 단계에서 height_value 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for g,height_value in enumerate(HEIGHTS):  # 같은 높이의 모든 연결 묶음에 위·아래 출입 다리를 보장한다.
        # direction: 이 단계에서 direction 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        for direction in ['up','down']:
            if direction=='up' and height_value==4:continue
            if direction=='down' and height_value==1:continue
            # exits: 이 단계에서 exits 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            exits=[]  # 해당 묶음에서 바로 위 또는 아래 높이로 이어지는 다리.
            # boundary: 이 단계에서 boundary 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
            # low: 낮은 높이의 다리 끝점.
            # high: 높은 높이의 다리 끝점.
            # cross: 해당 높이 경계 다리의 실제 선택 여부.
            for boundary,low,high,cross in cross_records:
                if boundary!=(height_value if direction=='up' else height_value-1):continue
                # node: 이 단계에서 node 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
                node=low if direction=='up' else high  # 묶음에 속해야 하는 다리의 끝점.
                # active: 이 단계에서 active 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
                active=model.NewBoolVar(f'exit{g}_{direction}_{low}_{high}')  # 경계 다리와 묶음 소속의 논리곱.
                model.Add(active<=cross);model.Add(active<=member[node][g]);model.Add(active>=cross+member[node][g]-1);exits.append(active)
            model.Add(sum(exits)>=1)
    # g: 같은 높이의 연결 묶음 인덱스.
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for g,h in enumerate(HEIGHTS):  # 높이 1의 각 연결 묶음에 시작점을 하나 이상 배정한다.
        if h!=1:continue
        # chosen: 각 묶음에 배정한 시작점 선택 변수.
        chosen=[]  # 해당 묶음에 속한 시작점의 선택 변수.
        # i: 처리 중인 타일 또는 목록 인덱스.
        for i in range(count):
            # marker: 묶음 소속과 시작점 선택의 논리곱.
            marker=model.NewBoolVar(f'start_in_group_{g}_{i}')  # 시작점 여부와 묶음 소속의 논리곱.
            model.Add(marker<=member[i][g]);model.Add(marker<=start[i]);model.Add(marker>=member[i][g]+start[i]-1);chosen.append(marker)
        model.Add(sum(chosen)>=1)
    # global_flows: 이 단계에서 global_flows 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # e: 검사하거나 설치할 다리 인덱스.
    global_flows=[model.NewIntVar(-count,count,f'all{e}') for e in range(len(edges))]  # 전체 지도 연결성 검증용 흐름.
    # e: 검사하거나 설치할 다리 인덱스.
    for e in range(len(edges)):
        model.Add(global_flows[e]<=count*bridge[e]);model.Add(global_flows[e]>=-count*bridge[e])
    # i: 처리 중인 타일 또는 목록 인덱스.
    for i in range(count):
        # e: 검사하거나 설치할 다리 인덱스.
        model.Add(sum(global_flows[e] if edges[e][0]==i else -global_flows[e] for e in incident[i])==(count-1 if i==0 else -1))
    # radial_sums: 이 단계에서 radial_sums 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    radial_sums=[]  # 각 높이 타일의 중심 거리 합.
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for h in range(1,5):
        # i: 처리 중인 타일 또는 목록 인덱스.
        # g: 같은 높이의 연결 묶음 인덱스.
        radial_sums.append(sum(distances[i]*member[i][g] for i in range(count) for g in range(group_total) if HEIGHTS[g]==h))
    # h: 이 단계에서 h 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for h in range(3):
        model.Add(radial_sums[h]*totals[h+1]>=radial_sums[h+1]*totals[h]+1)  # 바깥 높이일수록 평균 반지름이 더 크도록 유지한다.
    # solver: 제약을 만족하는 실제 배치를 탐색하는 풀이기.
    solver=cp_model.CpSolver()  # 제약을 만족하는 실제 해를 찾는 탐색기.
    # max_time_in_seconds: 현재 인스턴스에서 다음 처리에 유지할 상태.
    # num_search_workers: 현재 인스턴스에서 다음 처리에 유지할 상태.
    # random_seed: 현재 인스턴스에서 다음 처리에 유지할 상태.
    solver.parameters.max_time_in_seconds=limit;solver.parameters.num_search_workers=8;solver.parameters.random_seed=seed%2147483647
    # status: 이 단계에서 status 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    status=solver.Solve(model)  # 만족성 탐색 결과.
    print(solver.StatusName(status),solver.WallTime(),flush=True)
    if status not in (cp_model.FEASIBLE,cp_model.OPTIMAL):return {'status':solver.StatusName(status),'seconds':solver.WallTime()}
    # tiles: 생성된 전체 타일 데이터.
    tiles=[]  # 독립 검증기로 넘길 최종 타일 정의.
    # i: 처리 중인 타일 또는 목록 인덱스.
    # q: 육각 격자의 첫 축 정수 좌표.
    # r: 육각 격자의 둘째 축 정수 좌표.
    for i,(q,r) in enumerate(slots):
        tiles.append({'q':q,'r':r,'height':solver.Value(height[i]),'kind':'start' if solver.Value(start[i]) else 'boss' if solver.Value(boss[i]) else 'safe' if solver.Value(safe[i]) else 'normal','group':solver.Value(groups[i]),'id':0})
    # e: 검사하거나 설치할 다리 인덱스.
    # edge: 이 단계에서 edge 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    return {'version':'pit-v2-template','templateSeed':seed,'extraCounts':list(extra_counts),'componentTargets':SIZES,'status':solver.StatusName(status),'seconds':solver.WallTime(),'tiles':tiles,'bridges':[list(edge) for e,edge in enumerate(edges) if solver.Value(bridge[e])]}

if __name__=='__main__':
    import sys
    # extra_counts: 높이 1·2·3의 추가 타일 개수.
    extra_counts=tuple(map(int,sys.argv[1:4])) if len(sys.argv)>=4 else (4,2,0)  # 명령행에서 검사할 높이별 추가 수.
    # result: 독립 검증 또는 지도 생성의 반환 결과.
    result=solve(extra_counts)  # 고정된 추첨 타일 수를 바꾸지 않고 탐색한 배치.
    (ROOT/'template_test.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
