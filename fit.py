"""'내 체력에 맞는 강좌' 데이터 만들기.

국민체력100 체력인증센터에서 2024년 이후 측정한 사람들에게 건강운동관리사가 실제로 내린 운동처방(out/nfa_agg.json,
tools/fetch_nfa.py가 집계)을 나이대·성별·인증 등급별로 정리하고, 처방된 운동 가운데 한국체육산업개발 센터 4곳에
강좌가 있는 것을 강좌와 잇는다. 나머지 운동은 국민체력100 동영상(raw/nfa_videos.json)과 잇는다.

원칙
- 운동과 강좌 종목의 연결은 아래 LINK 표가 전부다. 이름이 같은 것만 잇고 추정으로 넓히지 않는다.
- 비율은 '그 묶음에서 처방 기록이 있는 사람 가운데 그 운동을 처방받은 사람'의 비율이다.
- 사람 수가 MIN_N보다 적은 묶음은 등급을 합친 값을 쓰게 하고, 화면에 표본 수를 항상 보여 준다.

입력: out/nfa_agg.json, raw/nfa_videos.json, site/courses.js
출력: site/fit.js (window.FIT), out/fit_summary.json
"""
import collections
import json
import os
import re

import gap

ROOT = os.path.dirname(os.path.abspath(__file__))
MIN_N = 100
TOP = 14

# 처방 운동 → 센터 강좌 종목. ex는 처방 기록에 적힌 운동 이름 그대로(공백 차이는 무시).
LINK = [
    {"key": "수영", "ex": ["수영"], "sports": ["수영", "수영단기속성", "수영소수정예"]},
    {"key": "아쿠아로빅", "ex": ["아쿠아로빅", "아쿠아로빅 운동 프로그램 루틴", "물속에서 걷기"],
     "sports": ["아쿠아로빅", "아쿠아워킹", "아쿠아워킹&조깅", "아쿠아테크"]},
    {"key": "요가·필라테스", "ex": ["요가 및 필라테스 루틴프로그램"],
     "sports": ["요가", "필라테스", "기구필라테스", "기구필라테스(서킷 1:6)", "기구필라테스(1:1)"]},
    {"key": "자전거", "ex": ["실내 자전거타기", "고정식 자전거 타기", "자전거타기", "실외 자전거타기"], "sports": ["스피닝바이크", "로드사이클"]},
    {"key": "웨이트 트레이닝", "ex": ["웨이트 트레이닝 루틴프로그램"], "sports": ["헬스", "헬스PT"]},
    {"key": "달리기", "ex": ["달리기", "조깅"], "sports": ["러닝크루"]},
]
norm = lambda s: re.sub(r"\s+", "", s or "")
STAGE_ORDER = ["유아기", "유소년", "청소년", "성인", "어르신"]


def grade_key(g):
    m = re.match(r"(\d)등급", g or "")
    return (0, int(m.group(1))) if m else (1, 0)


def build():
    A = json.load(open(os.environ.get("NFA_AGG") or os.path.join(ROOT, "out", "nfa_agg.json"), encoding="utf-8"))
    V = json.load(open(os.path.join(ROOT, "raw", "nfa_videos.json"), encoding="utf-8"))
    K = gap.load_courses()

    # 영상: 운동 이름(공백 무시)으로 찾기
    vid = collections.defaultdict(list)
    for v in V["videos"]:
        for nm in {norm(v["title"]), norm(v["name"])}:
            if nm:
                vid[nm].append({"u": v["url"], "t": v["title"], "g": v["group"], "f": v["factor"], "s": v["len"]})

    link_of = {}
    for L in LINK:
        for e in L["ex"]:
            link_of[norm(e)] = L["key"]

    # 묶음을 (구분, 나이대, 성별)로 다시 모으고 등급별·전체를 만든다
    cells = collections.defaultdict(lambda: collections.defaultdict(lambda: {"n": 0, "note": 0, "ex": collections.Counter(), "link": collections.Counter()}))
    for k, g in A["groups"].items():
        stage, band, sex, grade = k.split("|")
        if stage not in STAGE_ORDER or sex not in ("M", "F") or band == "?":
            continue
        for gr in (grade, "전체"):
            c = cells[(stage, int(band), sex)][gr]
            c["n"] += g["n"]
            c["note"] += g["note"]
            for e, n in g["ex"].items():
                c["ex"][norm(e)] += n
            c["link"].update(g.get("link", {}))
    names = {}
    for e in A["exercises"]:
        names.setdefault(norm(e), e.strip())

    def pack(c):
        base = c["note"] or 1
        linked = []
        for L in LINK:
            n = c["link"].get(L["key"], 0)
            if n:
                best = max(L["ex"], key=lambda e: c["ex"].get(norm(e), 0))
                linked.append([L["key"], round(n / base * 100, 1), n, best])
        linked.sort(key=lambda x: -x[1])
        other = [[names.get(e, e), round(n / base * 100, 1)] for e, n in c["ex"].most_common(60) if e not in link_of][:TOP]
        return {"n": c["n"], "note": c["note"], "linked": linked, "top": other}

    groups = {}
    for (stage, band, sex), gs in sorted(cells.items(), key=lambda x: (STAGE_ORDER.index(x[0][0]), x[0][1], x[0][2])):
        if gs["전체"]["note"] < MIN_N:
            continue
        out = {"전체": pack(gs["전체"])}
        for gr in sorted((g for g in gs if g != "전체"), key=grade_key):
            if gs[gr]["note"] >= MIN_N:
                out[gr] = pack(gs[gr])
        groups[f"{stage}|{band}|{sex}"] = out

    # 강좌마다 대상 나이 (courses.js의 rows와 같은 순서)
    ages = [list(gap.age_range(r)[:2]) for r in K["rows"]]
    sport_link = {s: L["key"] for L in LINK for s in L["sports"]}
    n_link = collections.Counter(sport_link[r["s"]] for r in K["rows"] if r["fr"] == "최근" and r["s"] in sport_link)

    used_ex = {x[0] for g in groups.values() for c in g.values() for x in c["top"]}
    videos = {e: vid[norm(e)][:3] for e in sorted(used_ex) if norm(e) in vid}

    # 단계별 요약 (기획서·기관 화면용): 처방 기록이 있는 사람 중 강좌로 이어지는 운동을 받은 비율
    stage_sum = {}
    for st in STAGE_ORDER:
        tot = {"n": 0, "note": 0, "ex": collections.Counter(), "link": collections.Counter()}
        for (s2, band, sex), gs in cells.items():
            if s2 == st:
                tot["n"] += gs["전체"]["n"]
                tot["note"] += gs["전체"]["note"]
                tot["ex"].update(gs["전체"]["ex"])
                tot["link"].update(gs["전체"]["link"])
        if tot["note"]:
            stage_sum[st] = pack(tot)

    F = {
        "source": A["source"], "fetched": A["fetched"], "from": A["from"], "rows_used": A["rows_used"], "total_api": A["total_api"],
        "months": [min(A["by_month"]), max(A["by_month"])], "video_source": V["source"], "n_videos": len(V["videos"]),
        "min_n": MIN_N, "links": [{"key": L["key"], "ex": L["ex"], "sports": L["sports"], "courses": n_link[L["key"]]} for L in LINK],
        "groups": groups, "ages": ages, "videos": videos, "stages": stage_sum,
    }
    return F


def run():
    F = build()
    with open(os.path.join(ROOT, "site", "fit.js"), "w", encoding="utf-8") as f:
        f.write("window.FIT=" + json.dumps(F, ensure_ascii=False, separators=(",", ":")) + ";\n")
    S = {k: F[k] for k in ("source", "fetched", "from", "rows_used", "total_api", "months", "n_videos", "links", "stages")}
    S["n_groups"] = len(F["groups"])
    S["n_video_matched"] = len(F["videos"])
    json.dump(S, open(os.path.join(ROOT, "out", "fit_summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return F


if __name__ == "__main__":
    F = run()
    print("쓴 기록", F["rows_used"], "기간", F["months"], "묶음", len(F["groups"]), "영상 연결", len(F["videos"]))
    for st, c in F["stages"].items():
        print(st, "n", c["n"], "처방", c["note"], "강좌 연결:", c["linked"][:6])
        print("   그 밖:", c["top"][:8])
