"""시제품 HTML에 생성기·화면 코드·글꼴을 내장하여 단일 실행 파일을 만든다."""
from pathlib import Path
from fontTools import subset
import base64

# ROOT: 현재 도구의 소스와 결과가 있는 경로.
ROOT = Path(__file__).parent  # 시제품 소스 폴더.
# TEXT: 이 단계에서 TEXT 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
TEXT = (ROOT/'template.html').read_text()+(ROOT/'ui.js').read_text()+'높이 시작지점 일반필드 풍요필드 안전지대 보스 검증 통과 전체 연결망 0123456789⌂♧♨◎'  # 내장할 한글과 기호 목록.
# STYLES: 이 단계에서 STYLES 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
STYLES = []  # 내장 글꼴의 CSS 정의.
# name: 이 단계에서 name 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
# path: 이 단계에서 path 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
for name,path in [('PitKorean',ROOT/'PitKorean_subset.ttf'),('PitSymbols',ROOT/'PitSymbols_subset.ttf')]:  # 한글·기호용 원본 글꼴.
    # font: 이 단계에서 font 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    font = subset.load_font(str(path),subset.Options())  # 부분 집합을 생성할 글꼴.
    # subsetter: 이 단계에서 subsetter 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    subsetter = subset.Subsetter()  # 사용 문자만 남기는 변환기.
    subsetter.populate(text=TEXT)
    subsetter.subset(font)
    # output: 이 단계에서 output 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    output = ROOT/f'{name}_subset.ttf'  # 내장용 부분 글꼴 파일.
    subset.save_font(font,str(output),subset.Options())
    # encoded: 이 단계에서 encoded 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
    encoded = base64.b64encode(output.read_bytes()).decode()  # 외부 요청 없이 읽을 글꼴 바이트.
    STYLES.append(f'@font-face{{font-family:{name};src:url(data:font/ttf;base64,{encoded})}}')
# HTML: 이 단계에서 HTML 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
HTML = (ROOT/'template.html').read_text().replace('<style>','<style>'+''.join(STYLES)+'body{font-family:PitKorean,PitSymbols,system-ui,sans-serif!important}')  # 글꼴을 포함한 화면 틀.
# UI: 이 단계에서 UI 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
UI = (ROOT/'ui.js').read_text().replace('"Segoe UI Symbol",sans-serif','PitKorean,PitSymbols,sans-serif').replace('19px sans-serif','19px PitKorean,PitSymbols,sans-serif').replace('12px sans-serif','12px PitKorean,PitSymbols,sans-serif')  # 캔버스에도 동일 글꼴을 적용한 코드.
# BANK: 이 단계에서 BANK 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
BANK = 'const layoutBank='+ (ROOT/'layout_bank.json').read_text()+';'  # 전체 수량 조합의 유효한 구조 데이터.
# HTML: 이 단계에서 HTML 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
HTML = HTML.replace('/* BANK */',BANK)
# HTML: 이 단계에서 HTML 계산·선택 결과를 보관하고 후속 배치 또는 검사에 사용한다.
HTML = HTML.replace('/* GENERATOR */',(ROOT/'pit.js').read_text()).replace('/* UI */',UI)
(ROOT.parent.parent/'public/pit-map.html').write_text(HTML)
