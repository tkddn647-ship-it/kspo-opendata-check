"""기관용 '강좌 공백 지도' 데이터 만들기.

센터 4곳의 운영 중 강좌(최근 1년 안에 바뀐 기록이 있는 것)를 '누가(연령대) · 언제(요일·시간대)'로 나눠
정원을 더하고, 센터가 있는 시·구의 연령별 주민등록 인구와 나란히 놓는다.

원칙
- 강좌의 대상 연령은 강좌명에 적힌 출생연도·나이('17년~08년생', '20세이상', '초등')를 먼저 읽고,
  없으면 '수강대상' 칸('성인남여', '청소년' 등)으로 정한다. 어느 쪽으로 정했는지 강좌마다 남긴다.
- 올림픽스포츠센터처럼 대상이 비어 있으면 공식 누리집 종목별 대상(OLYMPIC_OFFICIAL)으로 채우고, 거기에도 없으면 성인 강좌로 본다 (테니스 등). 이 가정은 화면에 적는다.
- 수요는 만들지 않는다. 주민 수(행정안전부, 2026-10-31 기준)와 2025 국민생활체육조사 연령별 참여율만 쓴다.
- '공백'은 판단이 아니라 비교: 연령대 주민 비중에 비해 그 연령대를 위한 정원 비중이 얼마나 작은가.

입력: site/courses.js(courses.py 결과), raw/population.csv
출력: out/gap.json, site/gap.js (window.GAP)
"""
import csv
import collections
import json
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
YEAR = 2026

# 센터가 있는 시·구 (주민등록 인구 파일의 시군구명). 올림픽공원 두 센터는 공원이 맞닿은 두 구.
AREA = {
    "올림픽수영장": ["송파구", "강동구"],
    "올림픽스포츠센터": ["송파구", "강동구"],
    "일산": ["고양시 일산동구", "고양시 일산서구"],
    "분당": ["성남시 분당구"],
}
AREA_LABEL = {"올림픽수영장": "송파구·강동구", "올림픽스포츠센터": "송파구·강동구",
              "일산": "고양시 일산동구·일산서구", "분당": "성남시 분당구"}

# 연령대: (이름, 최소, 최대)
BANDS = [("유아", 4, 6), ("초등", 7, 12), ("중고생", 13, 18), ("청년·중년", 19, 64), ("어르신", 65, 120)]
# 2025 국민생활체육조사 연령별 규칙적 체육활동 참여율(주 1회·30분 이상). 10세 미만은 조사 대상 아님.
PART = {"10대": 43.2, "20대": 65.2, "30대": 67.8, "40대": 67.1, "50대": 64.2, "60대": 65.8, "70대 이상": 59.5}

# 시간대: 평일/주말 x 시작 시각
SLOTS = [("평일 새벽·아침", 0, 9 * 60), ("평일 낮", 9 * 60, 15 * 60), ("평일 오후", 15 * 60, 18 * 60),
         ("평일 저녁", 18 * 60, 24 * 60), ("주말", None, None)]
WEEKDAY = set("월화수목금")


def load_courses():
    s = open(os.path.join(ROOT, "site", "courses.js"), encoding="utf-8").read()
    return json.loads(s[s.index("=") + 1:].rstrip().rstrip(";"))


def yy(v):
    v = int(v)
    return 2000 + v if v <= YEAR % 100 else 1900 + v


# 올림픽스포츠센터 강좌정보는 수강대상 칸이 비어 있다. 한국체육산업개발 누리집 '올림픽공원스포츠센터 강좌안내'의
# 종목별 대상(2026-11-25 확인, https://www.ksponco.or.kr/sports/courses/<번호>)으로 채운다.
# 표기를 수강대상 칸과 같은 규칙으로 읽는다: '성인 및 청소년' 13~, '청소년' 8~18, '성인' 19~.
# 검도는 과정마다 '성인 및 청소년'과 '성인'이 섞여 있어 넣지 않았고, 목록에 없는 종목(테니스 등)도 그대로 둔다.
OLYMPIC_OFFICIAL = {s: (13, 120) for s in (
    "로드사이클", "댄스로빅", "배드민턴", "탁구", "당구", "골프", "헬스", "요가", "댄스스포츠",
    "SNPE", "필라테스", "줌바댄스", "실내승마교실")}
OLYMPIC_OFFICIAL.update({"농구": (8, 18), "라인댄스": (19, 120)})


def age_range(r):
    """(최소 나이, 최대 나이, 근거). 나이는 2026년 기준 '연 나이'(2026 - 출생연도)."""
    n = r["n"]
    m = re.search(r"(\d{2,4})\s*년?\s*생?\s*~\s*(\d{2,4})\s*년\s*생", n)
    if m:
        a, b = (int(x) if len(x) == 4 else yy(x) for x in m.groups())
        lo, hi = sorted((YEAR - a, YEAR - b))
        return lo, hi, "강좌명 출생연도"
    m = re.search(r"(\d{1,2})\s*세\s*이상", n)
    if m:
        return int(m.group(1)), 120, "강좌명 나이"
    m = re.search(r"(\d{2})\s*년\s*생\s*(부터|이상)", n)
    if m:
        return YEAR - yy(m.group(1)), 120, "강좌명 출생연도"
    if re.search(r"실버|어르신|시니어", n):
        return 60, 120, "강좌명"
    if re.search(r"유아|키즈", n):
        return 4, 7, "강좌명"
    if re.search(r"초등", n):
        return 7, 12, "강좌명"
    if re.search(r"중고|중등|고등", n):
        return 13, 18, "강좌명"
    tg = r["tg"]
    if "유아" in tg:
        return 4, 7, "수강대상"
    if "어린이" in tg:
        return 5, 12, "수강대상"
    if "청소년" in tg and "성인" not in tg:
        return 8, 18, "수강대상"
    if "청소년" in tg:
        return 13, 120, "수강대상"
    if "실버" in r["g"]:
        return 60, 120, "수강대상"
    if tg.startswith("성인") or tg == "주부":
        return 19, 120, "수강대상"
    if r.get("c") == "올림픽스포츠센터":
        base = re.sub(r"\s*단기속성$", "", r.get("s", ""))
        if base in OLYMPIC_OFFICIAL:
            return (*OLYMPIC_OFFICIAL[base], "공식 누리집 종목 안내")
    return 19, 120, "가정(대상 칸 비어 있음)"


def own_band(lo, hi):
    """강좌가 주로 어느 연령대를 위한 것인지. 겹치는 햇수가 가장 많은 연령대 (성인 이상은 상한을 64로 보고 셈)."""
    if lo >= 55:
        return "어르신"
    top = min(hi, 64) if lo < 65 else hi
    best, bo = None, 0
    for b, a, z in BANDS:
        o = min(top, z) - max(lo, a) + 1
        if o > bo:
            best, bo = b, o
    return best


def covers(lo, hi, band_lo, band_hi):
    """이 강좌를 그 연령대의 가운데 나이 사람이 들을 수 있나."""
    mid = (band_lo + min(band_hi, 80)) // 2
    return lo <= mid <= hi


def slots(r):
    """강좌가 열리는 시간대들. 평일 시간대는 시작 시각으로, 토·일이 끼어 있으면 '주말'도 더한다."""
    d = set(r["d"])
    out = []
    if r["t0"] is None or not d:
        return out
    if d & WEEKDAY:
        for name, a, b in SLOTS[:-1]:
            if a <= r["t0"] < b:
                out.append(name)
    if d & set("토일"):
        out.append("주말")
    return out


def population():
    rows = list(csv.reader(open(os.path.join(ROOT, "raw", "population.csv"), encoding="utf-8")))
    head, body = rows[0], rows[1:]
    idx = {h: i for i, h in enumerate(head)}

    def age_col(a, sex):
        k = f"{a}세{sex}" if a < 110 else f"110세이상 {sex}"
        return idx[k]

    by_area = collections.defaultdict(lambda: [0] * 111)
    base = body[0][idx["기준연월"]]
    for x in body:
        area = x[idx["시군구명"]]
        for a in range(111):
            by_area[area][a] += int(x[age_col(a, "남자")] or 0) + int(x[age_col(a, "여자")] or 0)
    return by_area, base


def band_pop(ages, lo, hi):
    return sum(ages[a] for a in range(lo, min(hi, 110) + 1))


def participation(ages, lo, hi):
    """연령대 주민 중 규칙적으로 운동하는 사람 수 추정(10세 이상만, 조사 참여율 곱)."""
    tot = 0.0
    for a in range(max(lo, 10), min(hi, 110) + 1):
        k = "10대" if a < 20 else ("70대 이상" if a >= 70 else f"{a // 10 * 10}대")
        tot += ages[a] * PART[k] / 100
    return round(tot)


def build():
    K = load_courses()
    pop, base = population()
    rows = [r for r in K["rows"] if r["fr"] == "최근" and r["cap"]]
    centers = [c["name"] for c in K["centers"]]
    seasonal = re.compile(r"방학|특강|\d{1,2}\.\d{1,2}\s*~\s*\d{1,2}\.\d{1,2}")

    slot_names = [x[0] for x in SLOTS]
    out_c = []
    basis = collections.Counter()
    for c in centers:
        ages = [sum(pop[a][i] for a in AREA[c]) for i in range(111)]
        rs = [r for r in rows if r["c"] == c]
        own = collections.defaultdict(collections.Counter)   # 그 연령대를 위해 연 강좌의 정원
        can = collections.defaultdict(collections.Counter)   # 그 연령대가 들을 수 있는 강좌의 정원
        for r in rs:
            lo, hi, why = age_range(r)
            basis[(c, why)] += 1
            for s_ in slots(r):
                own[own_band(lo, hi)][s_] += r["cap"]
                for b, a, z in BANDS:
                    if covers(lo, hi, a, z):
                        can[b][s_] += r["cap"]
        pop_all = band_pop(ages, 4, 120)
        total = sum(r["cap"] for r in rs)
        bands = []
        for b, lo, hi in BANDS:
            p = band_pop(ages, lo, hi)
            o = sum(r["cap"] for r in rs if own_band(*age_range(r)[:2]) == b)
            k = sum(r["cap"] for r in rs if covers(*age_range(r)[:2], lo, hi))
            bands.append({
                "band": b, "lo": lo, "hi": hi, "pop": p, "pop_share": round(p / pop_all * 100, 1),
                "active": participation(ages, lo, hi) if hi >= 10 else None,
                "own": o, "own_share": round(o / total * 100, 1) if total else 0, "can": k,
                "own_slots": {x: own[b][x] for x in slot_names}, "can_slots": {x: can[b][x] for x in slot_names},
            })
        out_c.append({"center": c, "area": AREA_LABEL[c], "courses": len(rs), "seats": total, "bands": bands})

    # 공백 후보: 그 연령대가 다닐 수 있는 시간대에, 들을 수 있는 정원이 주민 1천 명당 얼마인가.
    # 올림픽공원 두 센터는 같은 지역이라 합쳐서 본다.
    sense = {  # 학교·직장 시간을 뺀 시간대 (화면에 근거와 함께 표시)
        "유아": ["평일 낮", "평일 오후", "주말"],
        "초등": ["평일 오후", "평일 저녁", "주말"],
        "중고생": ["평일 저녁", "주말"],
        "청년·중년": ["평일 새벽·아침", "평일 저녁", "주말"],
        "어르신": ["평일 새벽·아침", "평일 낮", "평일 오후"],
    }
    groups = {"올림픽공원 2곳": ["올림픽수영장", "올림픽스포츠센터"], "일산": ["일산"], "분당": ["분당"]}
    cells = []
    for g, cs in groups.items():
        for b, lo, hi in BANDS:
            ent = [next(x for x in C["bands"] if x["band"] == b) for C in out_c if C["center"] in cs]
            p = ent[0]["pop"]
            for sl in sense[b]:
                k = sum(e["can_slots"][sl] for e in ent)
                o = sum(e["own_slots"][sl] for e in ent)
                cells.append({"where": g, "area": AREA_LABEL[cs[0]], "band": b, "slot": sl, "can": k, "own": o,
                              "pop": p, "per1000": round(k / p * 1000, 2) if p else None})
    cells.sort(key=lambda x: (x["per1000"], -x["pop"]))
    gaps = cells

    # 학교 시간에 열리는 학생 강좌 (방학·단기 특강 제외)
    school = []
    for r in rows:
        lo, hi, _ = age_range(r)
        if own_band(lo, hi) in ("초등", "중고생") and slots(r) == ["평일 낮"] and not seasonal.search(r["n"]) and r["s"] != "방학특강":
            school.append({"c": r["c"], "s": r["s"], "n": r["n"], "tt": r["tt"], "d": r["d"], "cap": r["cap"]})

    return {
        "base_month": base, "pop_source": "행정안전부_지역별(행정동) 성별 연령별 주민등록 인구수 (공공데이터포털 15097972)",
        "part_source": "2025 국민생활체육조사(문화체육관광부) 연령별 규칙적 체육활동 참여율", "part": PART,
        "bands": [{"band": b, "lo": lo, "hi": hi} for b, lo, hi in BANDS],
        "slots": slot_names, "sense": sense,
        "centers": out_c, "cells": cells, "gaps": gaps[:12], "school_hours": school,
        "basis": {f"{c}|{w}": n for (c, w), n in sorted(basis.items())},
        "n_courses": len(rows), "n_seats": sum(r["cap"] for r in rows),
    }


def run():
    G = build()
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    json.dump(G, open(os.path.join(ROOT, "out", "gap.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "site", "gap.js"), "w", encoding="utf-8") as f:
        f.write("window.GAP=" + json.dumps(G, ensure_ascii=False, separators=(",", ":")) + ";\n")
    return G


if __name__ == "__main__":
    G = run()
    for c in G["centers"]:
        print(f"\n{c['center']} ({c['area']}) 강좌 {c['courses']} 정원 {c['seats']}")
        for b in c["bands"]:
            print(f"  {b['band']:6} 주민 {b['pop']:>8,} ({b['pop_share']:>4}%) 전용 {b['own']:>5} ({b['own_share']:>4}%) 가능 {b['can']:>5}  전용칸 {b['own_slots']}")
    print("\n칸")
    for x in G["cells"]:
        print(f"  {x['where']:8} {x['band']:6} {x['slot']:8} 가능 {x['can']:>5} 전용 {x['own']:>5} 주민 {x['pop']:>7,} 1천명당 {x['per1000']}")
    print("학교 시간 학생 강좌", len(G["school_hours"]), G["school_hours"][:5])
