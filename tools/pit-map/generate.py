"""게임 시작에 독립 추첨한 타일로만 규칙을 만족하는 맵을 생성한다."""
import argparse,json
from pathlib import Path
from rules import select_tiles,extra_counts,instantiate
from verify import validate

# ROOT: 현재 도구의 소스와 결과가 있는 경로.
ROOT=Path(__file__).parent  # 소스와 배치 뱅크가 있는 폴더.

# 매개변수 · seed: 추첨과 배치를 재현하는 32비트 시드; live: 미리 확보한 구조 대신 실시간 제약 탐색을 사용할지 설정.
def generate(seed,live=False):
    """확정된 추첨 목록을 유지한 채 미리 검증한 구조 또는 실시간 풀이로 지도를 생성한다."""
    # selected: 한 번 추첨하여 고정한 추가 타일 번호.
    selected=select_tiles(seed)  # 배치 시도 전에 단 한 번 확정한 추가 타일.
    # counts: 이 단계에서 counts 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    counts=extra_counts(selected)  # 이번 게임에 실제로 존재하는 추가 타일의 높이별 수량.
    # key: 이 단계에서 key 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    key=','.join(map(str,counts))  # 배치 뱅크에서 찾을 수량 키.
    if live:
        from layout_solver import solve
        # template: 해당 높이별 수량에 대해 검증한 배치 구조.
        template=solve(counts,seed,limit=30)  # 실시간 탐색에서도 타일 추첨을 반복하지 않는다.
        if 'tiles' not in template:raise RuntimeError('타일 추첨은 유지했으나 제한 시간 내 배치를 찾지 못했습니다.')
    else:
        # bank: 이 단계에서 bank 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
        bank=json.loads((ROOT/'layout_bank.json').read_text())  # 전체 수량 조합의 유효한 배치 목록.
        # template: 해당 높이별 수량에 대해 검증한 배치 구조.
        template=bank[key]  # 타일을 추가하거나 누락하지 않고 같은 수량의 구조를 선택.
    # result: 독립 검증 또는 지도 생성의 반환 결과.
    result=instantiate(template,seed)  # 번호·지형 종류 배정과 격자 변형을 적용한 지도.
    result['validation']=validate(result)  # 독립 검사에 통과한 지도만 반환한다.
    return result

if __name__=='__main__':
    # parser: 이 단계에서 parser 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    parser=argparse.ArgumentParser(description='추가 타일 확률을 반영한 구덩이 맵 생성')  # 실행 인자 해석기.
    parser.add_argument('--seed',type=int,default=20261030)
    parser.add_argument('--out',default='map.json')
    parser.add_argument('--live',action='store_true')
    # args: 이 단계에서 args 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    args=parser.parse_args()  # 사용자가 지정한 게임 시드와 출력 경로.
    # result: 독립 검증 또는 지도 생성의 반환 결과.
    result=generate(args.seed,args.live)  # 실제 게임에 사용할 생성 결과.
    Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print('검증 통과:',len(result['tiles']),'개 / 추가 타일:',result['selectedOptional'])
