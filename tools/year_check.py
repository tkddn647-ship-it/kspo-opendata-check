"""국민체력100 처방 경향의 연도별 안정성. 2024~2025년 기록과 2026년 기록을 묶음별로 비교한다.
입력 out/nfa_year.json (fetch_nfa.py, OUT=out/nfa_year.json END_PAGE=3047). 출력: 표준출력 + out/year_check.json
묶음 = 나이 구분·10세 나이대·성별·인증 등급. 두 기간 모두 처방 기록 100건 이상인 묶음만.
"""
import collections, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
A = json.load(open(ROOT / "out" / "nfa_year.json", encoding="utf-8"))
KEYS = ["달리기", "자전거", "수영", "아쿠아로빅", "웨이트 트레이닝", "요가·필라테스"]
MIN = 100

def merge(items):
    n, c = 0, collections.Counter()
    for g in items:
        n += g["note"]; c.update(g["link"])
    return n, c

def rank(v):
    o = sorted(range(len(v)), key=lambda i: -v[i]); r = [0] * len(v)
    i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]: j += 1
        for k in range(i, j + 1): r[o[k]] = (i + j) / 2 + 1
        i = j + 1
    return r

def spearman(a, b):
    ra, rb = rank(a), rank(b); n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** .5
    return num / den if den else 1.0

by = collections.defaultdict(dict)
for k, g in A["year_groups"].items():
    *grp, y = k.split("|"); by["|".join(grp)][y] = g
stage = collections.defaultdict(lambda: collections.defaultdict(list))
for grp, ys in by.items():
    for y, g in ys.items(): stage[grp.split("|")[0]][y].append(g)

out = {"stage_year": {}, "groups": []}
print("나이 구분별 연도별 처방 비율(%)")
for st in ("청소년", "성인", "어르신"):
    out["stage_year"][st] = {}
    for y in ("2024", "2025", "2026"):
        n, c = merge(stage[st][y]); p = {k: round(100 * c[k] / n, 1) for k in KEYS}
        out["stage_year"][st][y] = {"n": n, **p}
        print(st, y, n, p)
top_same = top1_same = 0; rhos = []; diffs = []
for grp, ys in sorted(by.items()):
    if grp.split("|")[0] not in ("청소년", "성인", "어르신"): continue
    n0, c0 = merge([ys[y] for y in ("2024", "2025") if y in ys]); n1, c1 = merge([ys[y] for y in ("2026",) if y in ys])
    if n0 < MIN or n1 < MIN: continue
    p0 = [c0[k] / n0 for k in KEYS]; p1 = [c1[k] / n1 for k in KEYS]
    t0 = sorted(KEYS, key=lambda k: -c0[k] / n0)[:3]; t1 = sorted(KEYS, key=lambda k: -c1[k] / n1)[:3]
    top_same += set(t0) == set(t1); top1_same += t0[0] == t1[0]
    rho = spearman(p0, p1); rhos.append(rho)
    d = max(abs(a - b) for a, b in zip(p0, p1)) * 100; diffs.append(d)
    out["groups"].append({"group": grp, "n_2024_25": n0, "n_2026": n1, "top3_2024_25": t0, "top3_2026": t1, "rho": round(rho, 3), "max_diff_pp": round(d, 1)})
G = len(rhos); rs = sorted(rhos); ds = sorted(diffs)
out["summary"] = {"groups": G, "top3_set_same": top_same, "top1_same": top1_same, "rho_median": round(rs[G // 2], 3),
                  "max_diff_median_pp": round(ds[G // 2], 1), "max_diff_p90_pp": round(ds[int(G * .9)], 1), "rows_used": A["rows_used"], "fields": A.get("fields")}
print(json.dumps(out["summary"], ensure_ascii=False))
json.dump(out, open(ROOT / "out" / "year_check.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
