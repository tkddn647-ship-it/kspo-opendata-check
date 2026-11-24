"""국민체력100 측정결과(국민체육진흥공단, 공공데이터포털 15108938)에서 2024년 이후 기록을 받아
'어떤 사람에게 어떤 운동이 처방됐나'를 집계한다. 원자료는 저장하지 않고 집계만 out/nfa_agg.json에 남긴다.

묶음: 연령 구분(유소년·청소년·성인·어르신 등) | 10세 단위 나이대 | 성별 | 인증 등급
- ex: 그 묶음에서 각 운동을 처방받은 사람 수 (한 사람이 같은 운동을 여러 번 받아도 1)
- items: 측정 항목(item_fNNN)별 값 분포 (0.5 단위로 묶은 도수)
python tools/fetch_nfa.py   (키: DATA_GO_KR_KEY)
"""
import collections, json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

URL = "https://apis.data.go.kr/B551014/SRVC_NFA_TEST_RESULT/TODZ_NFA_TEST_RESULT_NEW"
FROM = "202401"
N = 1000
key = urllib.parse.unquote((os.environ.get("DATA_GO_KR_KEY") or "").strip())
if not key:
    sys.exit("키 없음")


def get(page):
    q = urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": N, "resultType": "json"})
    for a in range(6):
        try:
            with urllib.request.urlopen(URL + "?" + q, timeout=120) as f:
                b = json.loads(f.read().decode("utf-8"))["response"]["body"]
            it = b.get("items") or {}
            it = it.get("item", it) if isinstance(it, dict) else it
            return b.get("totalCount"), ([it] if isinstance(it, dict) else (it or []))
        except Exception as e:
            print("재시도", page, type(e).__name__, flush=True)
            time.sleep(5 + a * 10)
    return None, None


total, first = get(1)
pages = (total + N - 1) // N
lo, hi = 1, pages  # 측정 연월 순으로 쌓여 있다고 보고, FROM 이후가 처음 나오는 쪽을 찾음
while lo < hi:
    mid = (lo + hi) // 2
    _, it = get(mid)
    if it and str(it[-1].get("test_ym", "")) >= FROM:
        hi = mid
    else:
        lo = mid + 1
start = max(lo - 1, 1)
print("전체", total, "쪽", pages, "시작 쪽", start, flush=True)

PRE = re.compile(r"(준비운동|본운동|정리운동|마무리운동)\s*:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from fit import LINK  # 강좌와 잇는 운동 묶음 (한 사람이 묶음 안 운동을 하나라도 받았는지 셈)
except Exception:
    LINK = []
NORM = lambda t: re.sub(r"\s+", "", t)
LK = {NORM(e): L["key"] for L in LINK for e in L["ex"]}
G = collections.defaultdict(lambda: {"n": 0, "note": 0, "ex": collections.Counter(), "link": collections.Counter()})
IT = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
ym = collections.Counter()
used = failed = 0
ROOT = Path(__file__).resolve().parents[1]


def absorb(items):
    global used
    for x in items:
        m = str(x.get("test_ym", ""))
        if m < FROM:
            continue
        used += 1
        ym[m] += 1
        try:
            age = int(float(x.get("age_degree")))
        except (TypeError, ValueError):
            age = -1
        k = "|".join([str(x.get("age_gbn")), str(age // 10 * 10 if age >= 0 else "?"), str(x.get("test_sex")), str(x.get("cert_gbn"))])
        g = G[k]
        g["n"] += 1
        note = x.get("pres_note") or ""
        if note:
            g["note"] += 1
            exs = {t.strip() for t in PRE.sub(",", note).split(",") if t.strip()}
            for e in exs:
                g["ex"][e] += 1
            for key_ in {LK[NORM(e)] for e in exs if NORM(e) in LK}:
                g["link"][key_] += 1
        for c, v in x.items():
            if c.startswith("item_f") and v not in (None, ""):
                try:
                    IT[k][c][round(float(v) * 2) / 2] += 1
                except ValueError:
                    pass


def save(done, final):
    tot_ex = collections.Counter()
    for g in G.values():
        tot_ex.update(g["ex"])
    keep = {e for e, c in tot_ex.items() if c >= 30}
    out = {
        "fetched": datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"), "source": "국민체육진흥공단 국민체력100 체력인증센터 측정결과 정보 (공공데이터포털 15108938)",
        "from": FROM, "total_api": total, "rows_used": used, "pages": [start, done, pages], "complete": final, "pages_failed": failed, "by_month": dict(sorted(ym.items())),
        "exercises": dict(tot_ex.most_common(3000)),
        "groups": {k: {"n": g["n"], "note": g["note"], "link": dict(g["link"]), "ex": {e: c for e, c in g["ex"].most_common() if e in keep}} for k, g in sorted(G.items())},
        "items": {k: {c: {str(b): n for b, n in sorted(h.items())} for c, h in sorted(v.items())} for k, v in sorted(IT.items()) if G[k]["n"] >= 30},
    }
    (ROOT / "out").mkdir(exist_ok=True)
    (ROOT / "out" / "nfa_agg.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    msg = f"국민체력100 처방 집계 {'완료' if final else '중간'} {done}/{pages}"
    subprocess.run("git add out/nfa_agg.json && git commit -qm '%s' && git pull -q --rebase && git push -q" % msg, shell=True, cwd=ROOT)
    print(msg, "쓴 행", used, "실패 쪽", failed, flush=True)


CH = 100
with ThreadPoolExecutor(4) as pool:
    for a in range(start, pages + 1, CH):
        b = min(a + CH - 1, pages)
        for _, items in pool.map(get, range(a, b + 1)):
            if items is None:
                failed += 1
            else:
                absorb(items)
        save(b, b == pages)
