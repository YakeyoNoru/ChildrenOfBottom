"""추가 타일 수의 모든 조합을 만족하는 배치 후보를 미리 검증해 보관한다."""
import itertools,json,time
from pathlib import Path
from layout_solver import solve

# ROOT: 현재 도구의 소스와 결과가 있는 경로.
ROOT=Path(__file__).parent  # 배치 뱅크와 진행 기록 저장 위치.
if __name__=='__main__':
    # path: 이 단계에서 path 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    path=ROOT/'layout_bank.json'  # 높이별 추가 개수에 대응하는 배치 뱅크.
    # bank: 이 단계에서 bank 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    bank=json.loads(path.read_text()) if path.exists() else {}  # 이미 구한 해는 재사용한다.
    # failures: 이 단계에서 failures 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    failures=[]  # 제한 시간 안에 해를 찾지 못한 수량 조합.
    # started: 이 단계에서 started 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    started=time.monotonic()  # 전체 구축 시간의 시작점.
    # n1: 이 단계에서 n1 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # n2: 이 단계에서 n2 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    # n3: 이 단계에서 n3 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    for n1,n2,n3 in itertools.product(range(6),range(4),range(3)):
        # key: 이 단계에서 key 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        key=f'{n1},{n2},{n3}'  # 추첨 번호와 독립적인 높이별 수량 식별자.
        if key in bank:continue
        # seed: 추첨과 배치를 재현하는 32비트 시드.
        seed=4242+n1*100+n2*10+n3  # 해당 수량 조합을 탐색할 시드.
        # result: 독립 검증 또는 지도 생성의 반환 결과.
        result=solve((n1,n2,n3),seed=seed,limit=10)  # 추첨 결과를 바꾸지 않고 배치를 찾는다.
        # result: 독립 검증 또는 지도 생성의 반환 결과.
        if 'tiles' not in result:result=solve((n1,n2,n3),seed=seed+1,limit=35)
        if 'tiles' not in result:failures.append(key);print('MISSING',key,flush=True);continue
        bank[key]=result;path.write_text(json.dumps(bank,ensure_ascii=False,separators=(',',':')))
        print('BANK',len(bank),'/72',key,round(time.monotonic()-started,1),flush=True)
    (ROOT/'bank_build_status.json').write_text(json.dumps({'built':len(bank),'required':72,'missing':failures,'seconds':time.monotonic()-started},indent=2))
