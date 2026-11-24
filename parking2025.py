"""올림픽공원 2025 입출차정보(문화공공데이터광장 API_CPM_008, 약 241만 건)와
2025 공연 연계 데이터(API_CPM_009)로 시각별 주차 대수와 예측 검증 결과를 만든다.

입력: raw/inout2025.csv.gz (tools/fetch_inout2025.py), raw/linked2025.raw.json.gz (tools/fetch_linked2025.py)
출력: out/parking2025.json  (courses.py 가 읽어 화면에 넣음)

- 매시 30분에 주차장에 있던 차 수를 센다. 10분 미만 통과 차량, 출차가 입차보다 앞선 기록은 뺀다. 48시간 넘게 머문 차는 48시간까지만 센다.
- 기록이 온전한 달(1~7월, 10월)만 쓴다. 8·9·11·12월은 월마다 65,534건에서 잘려 있다(자료 문제로 따로 보고).
- 그 달 기록 수 중앙값의 절반이 안 되는 날(잘린 날)은 뺀다.
- 휴일 = 토·일 + 2025년 관공서 공휴일(대체공휴일 포함).
- 예측 검증: 하루를 빼고 나머지 날로 그 하루의 시각별 대수를 맞혀 본다 (100대 이상인 시각의 평균 오차율).
  A: 평일/휴일 평균, E: 평일/휴일 × 공연 규모(없음·5천 미만·1만 미만·1만 이상) 평균에 그 달 보정.
"""
import collections
import csv
import datetime as dt
import gzip
import json
import re
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
FULL = {"2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-10"}
HOURS = list(range(6, 23))
HOL = {dt.date(2025, m, d) for m, d in [(1, 1), (1, 27), (1, 28), (1, 29), (1, 30), (3, 3), (5, 5), (5, 6), (6, 3), (6, 6),
                                        (10, 3), (10, 6), (10, 7), (10, 8), (10, 9)]}
FMT = "%Y-%m-%d %H:%M:%S"


def is_off(d):
    return d.weekday() >= 5 or d in HOL


def size_class(n):
    return 0 if n == 0 else 1 if n < 5000 else 2 if n < 10000 else 3


def load():
    with gzip.open(RAW / "inout2025.csv.gz", "rt", encoding="utf-8", newline="") as f:
        rows = list(csv.reader(f))[1:]
    with gzip.open(RAW / "linked2025.raw.json.gz", "rt", encoding="utf-8") as f:
        linked = json.load(f)
    return rows, linked


def data_issues(rows, linked):
    uniq = set(map(tuple, rows))
    per_month = collections.Counter(r[0][:7] for r in rows)
    per_day = collections.Counter(r[0][:10] for r in rows)
    capped = sorted(m for m, n in per_month.items() if n == 65534)
    last_missing = []
    for m in sorted(per_month):
        y, mo = int(m[:4]), int(m[5:7])
        last = (dt.date(y + (mo == 12), mo % 12 + 1, 1) - dt.timedelta(days=1))
        if str(last) not in per_day:
            last_missing.append(m)
    neg = 0
    for r in uniq:
        try:
            if dt.datetime.strptime(r[1], FMT) <= dt.datetime.strptime(r[0], FMT):
                neg += 1
        except ValueError:
            pass
    desc_null = sum(1 for x in linked if not x.get("DESCRIPTION"))
    return {"rows": len(rows), "dup_rows": len(rows) - len(uniq), "out_before_in": neg,
            "per_month": dict(sorted(per_month.items())), "capped_months": capped, "last_day_missing": last_missing,
            "linked_rows": len(linked), "linked_desc_null": desc_null}


def occupancy(rows):
    per_day = collections.Counter(r[0][:10] for r in rows)
    occ = collections.Counter()
    for r in set(map(tuple, rows)):
        if r[0][:7] not in FULL:
            continue
        try:
            a, b = dt.datetime.strptime(r[0], FMT), dt.datetime.strptime(r[1], FMT)
        except ValueError:
            continue
        if b <= a or (b - a).total_seconds() < 600:
            continue
        b = min(b, a + dt.timedelta(days=2))
        t = a.replace(minute=30, second=0)
        if t < a:
            t += dt.timedelta(hours=1)
        while t < b:
            if 6 <= t.hour <= 22:
                occ[(t.date(), t.hour)] += 1
            t += dt.timedelta(hours=1)
    med = {m: st.median([n for d, n in per_day.items() if d[:7] == m]) for m in FULL}
    days = sorted(d for d in {d for d, _ in occ} if f"{d:%Y-%m}" in FULL and per_day[str(d)] >= 0.5 * med[f"{d:%Y-%m}"])
    return days, {d: [occ[(d, h)] for h in HOURS] for d in days}


def events(linked):
    ev = {}
    for x in linked:
        title = x.get("TITLE") or ""
        name = re.sub(r"\s+", " ", title.split(",공연관람객수")[0].replace("공연명:", "")).strip()
        m = re.search(r"관람객수:(\d+)", title)
        if name and m:
            d = dt.date.fromisoformat(x["ISSUED_DATE"][:10])
            ev[d] = max(ev.get(d, 0), int(m.group(1)))
    return ev


def evaluate(days, V, ev):
    cls = lambda d: size_class(ev.get(d, 0))
    avg = lambda ds: [sum(V[x][i] for x in ds) / len(ds) for i in range(len(HOURS))]

    def err(p, a):
        e = [abs(x - y) / y for x, y in zip(p, a) if y >= 100]
        return sum(e) / len(e)

    res = collections.defaultdict(list)
    for d in days:
        o = [x for x in days if x != d]
        A = avg([x for x in o if is_off(x) == is_off(d)])
        g = [x for x in o if is_off(x) == is_off(d) and cls(x) == cls(d)]
        D = avg(g) if len(g) >= 3 else A
        nm = [x for x in o if is_off(x) == is_off(d) and cls(x) == 0 and x.month == d.month]
        na = [x for x in o if is_off(x) == is_off(d) and cls(x) == 0]
        fac = (sum(sum(V[x]) for x in nm) / len(nm)) / (sum(sum(V[x]) for x in na) / len(na)) if len(nm) >= 3 and na else 1
        E = [v * fac for v in D]
        kind = "event" if cls(d) else "normal"
        for k, p in (("A", A), ("E", E)):
            e = err(p, V[d])
            res[(k, kind)].append(e)
            res[(k, "all")].append(e)
    out = {}
    for (k, kind), v in res.items():
        out.setdefault(k, {})[kind] = {"n": len(v), "median": round(st.median(v) * 100, 1), "mean": round(st.mean(v) * 100, 1),
                                       "within15": sum(x <= 0.15 for x in v)}
    return out


def profiles(days, V, ev):
    def prof(sel):
        ds = [d for d in days if sel(d)]
        cols = [sorted(V[d][i] for d in ds) for i in range(len(HOURS))]
        q = lambda c, p: c[min(len(c) - 1, int(p * (len(c) - 1) + 0.5))]
        return {"n": len(ds), "mean": [round(st.mean(c)) for c in cols], "p10": [q(c, 0.1) for c in cols], "p90": [q(c, 0.9) for c in cols],
                "peak_mean": round(st.mean(max(V[d]) for d in ds))}
    return {"weekday": prof(lambda d: not is_off(d) and size_class(ev.get(d, 0)) < 3),
            "holiday": prof(lambda d: is_off(d) and size_class(ev.get(d, 0)) < 3),
            "bigevent": prof(lambda d: size_class(ev.get(d, 0)) == 3)}


def run():
    rows, linked = load()
    issues = data_issues(rows, linked)
    days, V = occupancy(rows)
    ev = events(linked)
    payload = {
        "source": "올림픽공원 2025 입출차정보 · 2025 차량입출차·공연·날씨 연계 데이터 (문화공공데이터광장)",
        "hours": HOURS, "months": sorted(FULL), "n_days": len(days),
        "n_event_days": sum(1 for d in days if d in ev), "n_big_event_days": sum(1 for d in days if size_class(ev.get(d, 0)) == 3),
        "n_performances": len({re.sub(r"\s+", " ", x["TITLE"].split(",공연관람객수")[0]) for x in linked if "공연명:," not in x["TITLE"]}),
        "profiles": profiles(days, V, ev), "forecast": evaluate(days, V, ev), "issues": issues,
    }
    (ROOT / "out").mkdir(exist_ok=True)
    (ROOT / "out" / "parking2025.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return payload


if __name__ == "__main__":
    p = run()
    print(json.dumps({k: p[k] for k in ("n_days", "n_event_days", "n_big_event_days", "n_performances", "forecast")}, ensure_ascii=False, indent=1))
    print({k: (v["n"], v["peak_mean"]) for k, v in p["profiles"].items()})
    print({k: v for k, v in p["issues"].items() if k != "per_month"})
