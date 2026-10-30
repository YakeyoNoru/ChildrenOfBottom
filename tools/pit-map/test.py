"""추가 타일 전체 경우의 수, 확률, 같은 시드 재현과 잘못된 데이터 거부를 검사한다."""
import copy,itertools,json
from collections import Counter
from pathlib import Path
from rules import OPTIONAL,select_tiles,extra_counts,instantiate
from verify import validate

# ROOT: 현재 도구의 소스와 결과가 있는 경로.
ROOT=Path(__file__).parent  # 시험 데이터와 결과 저장 위치.

def run():
    """1024개 추첨 조합과 실제 시드 표본을 독립 검증한다."""
    # bank: 이 단계에서 bank 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    bank=json.loads((ROOT/'layout_bank.json').read_text())  # 가능한 높이별 수량 조합의 구조 목록.
    assert len(bank)==72,'모든 수량 조합에 대한 배치 확보'
    # checked: 이 단계에서 checked 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    checked=0  # 구조와 종류 배정까지 검사한 추첨 조합 수.
    # mask: 이 단계에서 mask 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for mask in range(1024):  # 추가 타일 열 개의 모든 생성·미생성 조합.
        # selected: 한 번 추첨하여 고정한 추가 타일 번호.
        # bit: 이 단계에서 bit 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        # number: 높이와 종류를 조회할 고유 타일 번호.
        selected=[number for bit,number in enumerate(OPTIONAL) if mask&(1<<bit)]  # 해당 조합의 정확한 추가 번호.
        # key: 이 단계에서 key 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        key=','.join(map(str,extra_counts(selected)))  # 구조 조회에 사용할 높이별 수량.
        # result: 독립 검증 또는 지도 생성의 반환 결과.
        result=instantiate(bank[key],mask,selected)  # 선택 결과를 바꾸지 않고 만든 지도.
        validate(result,check_draw=False)  # 확률 추첨을 생략한 완전 열거 시험에서는 구조·종류만 검사.
        # checked: 이 단계에서 checked 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        checked+=1
    # frequencies: 이 단계에서 frequencies 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # observed_totals: 이 단계에서 observed_totals 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    frequencies=Counter();observed_totals=set()  # 실제 추첨 빈도와 전체 타일 수의 범위.
    # seed: 추첨과 배치를 재현하는 32비트 시드.
    for seed in range(100000):  # 확률 추첨을 재현 가능한 대규모 시드로 검사.
        # selected: 한 번 추첨하여 고정한 추가 타일 번호.
        selected=select_tiles(seed);frequencies.update(selected);observed_totals.add(50+len(selected))
    # rates: 이 단계에서 rates 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # number: 높이와 종류를 조회할 고유 타일 번호.
    rates={number:frequencies[number]/100000 for number in OPTIONAL}  # 번호별 관측 생성률.
    # number: 높이와 종류를 조회할 고유 타일 번호.
    # _: 이 단계에서 _ 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # probability: 이 단계에서 probability 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    assert all(abs(rates[number]-probability)<.01 for number,(_,_,probability) in OPTIONAL.items()),'관측 확률 편차'
    # fixtures: 이 단계에서 fixtures 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    fixtures=[]  # 실제 추첨부터 독립 검증까지 통과한 게임 샘플.
    # seed: 추첨과 배치를 재현하는 32비트 시드.
    for seed in range(1000):  # 실제 게임 시드 표본의 전체 생성 과정 검사.
        # selected: 한 번 추첨하여 고정한 추가 타일 번호.
        # key: 이 단계에서 key 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        selected=select_tiles(seed);key=','.join(map(str,extra_counts(selected)))
        # result: 독립 검증 또는 지도 생성의 반환 결과.
        result=instantiate(bank[key],seed);validate(result);fixtures.append(result)
    assert instantiate(bank[','.join(map(str,extra_counts(select_tiles(123))))],123)==instantiate(bank[','.join(map(str,extra_counts(select_tiles(123))))],123),'시드 재현'
    # invalid_previous: 이 단계에서 invalid_previous 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    invalid_previous=json.loads((ROOT/'invalid_previous_map.json').read_text())  # 전체 연결은 있지만 묶음 출입 조건을 위반하는 이전 구조.
    try:validate(invalid_previous)
    except AssertionError as error:assert '연결 묶음의' in str(error)
    else:raise AssertionError('묶음 위·아래 출입 누락 거부 실패')
    # invalid_up: 이 단계에서 invalid_up 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    invalid_up=json.loads((ROOT/'invalid_previous_map_up.json').read_text())  # 위쪽 다리가 없는 묶음을 가진 이전 지도.
    try:validate(invalid_up)
    except AssertionError as error:assert '위쪽 다리' in str(error)
    else:raise AssertionError('묶음 위쪽 출입 누락 거부 실패')
    # invalid_start: 이 단계에서 invalid_start 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    invalid_start=json.loads((ROOT/'invalid_missing_start.json').read_text())  # 시작점이 없는 높이 1 묶음의 오류 표본.
    try:validate(invalid_start)
    except AssertionError as error:assert '시작점 누락' in str(error)
    else:raise AssertionError('묶음 시작점 누락 거부 실패')
    # reversed_map: 이 단계에서 reversed_map 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    reversed_map=copy.deepcopy(fixtures[0])  # 금지된 3→2 통행을 추가한 오류 지도.
    # a: 다리의 첫 번째 끝 타일 인덱스.
    # b: 다리의 두 번째 끝 타일 인덱스.
    for a,b in reversed_map['bridges']:
        if {reversed_map['tiles'][a]['height'],reversed_map['tiles'][b]['height']}=={2,3}:
            reversed_map['movementArcs'].append([a,b] if reversed_map['tiles'][a]['height']==3 else [b,a]);break
    try:validate(reversed_map)
    except AssertionError as error:assert '이동 방향' in str(error)
    else:raise AssertionError('3→2 금지 누락 거부 실패')
    # broken: 이 단계에서 broken 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    broken=copy.deepcopy(fixtures[0]);broken['selectedOptional']=[]  # 추첨 결과를 임의 삭제한 오류 지도.
    try:validate(broken)
    except AssertionError:pass
    else:raise AssertionError('추첨 결과 변조 거부 실패')
    return {'allOptionalCombinations':checked,'allCountCombinations':len(bank),'realGameSeedsValidated':1000,'selectionSeedsTested':100000,'observedGenerationRates':rates,'observedTotalCounts':sorted(observed_totals),'expectedTileCount':56.1,'reproducible':True,'selectionMutationRejected':True,'missingComponentExitRejected':True,'missingStartRejected':True,'forbiddenReverseArcRejected':True,'physicalConnectivity':True,'roundTripRequired':False}

if __name__=='__main__':
    # result: 독립 검증 또는 지도 생성의 반환 결과.
    result=run()  # 전체 회귀 시험 결과.
    (ROOT/'test_results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False,indent=2))
