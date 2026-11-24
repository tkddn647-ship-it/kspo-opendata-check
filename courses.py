"""시민용 '강좌 찾기' 데이터 만들기.

한국체육산업개발 4개 센터 강좌정보 파일(공공데이터포털)을 같은 형식으로 맞춘다.
- 현재 운영 강좌 = 종료일이 9999-12-31인 행 (설명문: 종료일 9999 = 운영 중). 강좌번호마다 가장 최근 행만.
- 자료에 없는 것은 만들지 않는다. 1회 환산 강습비는 '추정'으로 표시 (월 강습비 / (주 횟수 x 4.345주)).

입력: raw/<id>.csv, raw/15147992.csv(강좌 설명·링크), raw/_meta.json
출력: site/courses.js (window.COURSES), out/courses_summary.json
"""
import csv, json, re, collections, os

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw")

# id: 센터, 시작열, 종료열, 범위열(시작~종료가 한 칸), 종목, 시간, 요일, 대상, 금액, 정원, 강좌번호
SPEC = {
    "15101610": ("올림픽수영장", "시작월", None, "시작일자", "강좌코드명", "시작종료시간", "요일", "강습반", "강좌금액", "정원", "강좌번호"),
    "15110953": ("올림픽스포츠센터", "수강시작일", "수강종료일", None, "종목", "수강시간", "수강요일", "수강대상", "수강금액", "정원", "강좌일련번호"),
    "15114776": ("일산올림픽스포츠센터", "시작월", None, "시작일", "종목", "시작종료시간", "요일", "강습반", "금액", "정원", "강좌번호"),
    "15118652": ("분당올림픽스포츠센터", "기간시작일", "기간종료일", None, "종목", "시작종료시간", "수강요일", "수강대상", "수강료", "정원", "강좌번호"),
}
# 15147992(강좌 설명)의 센터 이름 → 강좌정보 파일의 센터 이름
DESC_CENTER = {"올림픽수영장": "올림픽수영장", "올림픽공원스포츠센터": "올림픽스포츠센터",
               "일산올림픽스포츠센터": "일산올림픽스포츠센터", "분당올림픽스포츠센터": "분당올림픽스포츠센터",
               "올림픽테니스장": "올림픽스포츠센터"}
HOME = {"올림픽수영장": "https://www.ksponco.or.kr/sports/olparkswim",
        "올림픽스포츠센터": "https://www.ksponco.or.kr/sports/olparksports",
        "일산올림픽스포츠센터": "https://www.ksponco.or.kr/sports/ilsansports",
        "분당올림픽스포츠센터": "https://www.ksponco.or.kr/sports/bundangsports"}
SHORT = {"올림픽수영장": "올림픽수영장", "올림픽스포츠센터": "올림픽스포츠센터",
         "일산올림픽스포츠센터": "일산", "분당올림픽스포츠센터": "분당"}
WEEK = "월화수목금토일"
WEEKS_PER_MONTH = 4.345

TIME_RE = re.compile(r"(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})")


def read(i):
    with open(os.path.join(RAW, f"{i}.csv"), encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def parse_days(s):
    """'월,수,금,(토)' → (['월','수','금'], ['토']). 괄호 안 요일은 '선택·자유' 등 뜻이 자료에 없어 따로 둔다."""
    base, opt = [], []
    for tok in s.split(","):
        tok = tok.strip()
        m = re.fullmatch(r"\(?([월화수목금토일])\)?(\(.\))?", tok)
        if not m:
            continue
        d = m.group(1)
        (opt if tok.startswith("(") else base).append(d)
    key = WEEK.index
    return sorted(set(base), key=key), sorted(set(opt) - set(base), key=key)


def parse_time(s):
    m = TIME_RE.search(s or "")
    if not m:
        return None, None
    a = int(m.group(1)) * 60 + int(m.group(2))
    b = int(m.group(3)) * 60 + int(m.group(4))
    return a, b


KID = re.compile(r"어린이|유아|초등|키즈|생존수영|\d세\b|\(\d세\)|\d학년|유치")
TEEN = re.compile(r"청소년|중고등|중·고|중학|고등")
SENIOR = re.compile(r"실버|어르신|시니어|효도|(5[05]|6[05]|70)세\s*이상|노인")
WOMEN = re.compile(r"여성|주부|\(여\)")


def groups(target, name):
    t = f"{target} {name}"
    g = []
    if KID.search(t): g.append("어린이")
    if TEEN.search(t): g.append("청소년")
    if SENIOR.search(t): g.append("실버")
    if WOMEN.search(t): g.append("여성")
    if "성인" in target or "전체" in target or (not g and target == ""):
        g.append("성인")
    return g


def sessions_per_month(name, base_days, dur):
    m = re.search(r"(?<!주)(\d{1,2})회", name)
    if m and not re.search(r"주\s*\d회", name):
        return int(m.group(1)), "회차"
    if dur is None or dur > 180 or not base_days:
        return None, None
    return len(base_days) * WEEKS_PER_MONTH, "주"


def name_days(n):
    """강좌명에 적힌 요일 (예: '골프 15시(화목)' → {'화','목'}). 오리발 요일 표기는 뺀다."""
    n = re.sub(r"오리발\s*=?\s*[월화수목금토일/.,·\s]+", "", n)
    n = re.sub(r"[.,(]\s*[월화수목금토일.·]+\s*자유", "", n)  # '(토.자유수영)', '.토일자유'
    s = set()
    for a, b in re.findall(r"([월화수목금토일])\s*~\s*([월화수목금토일])", n):
        i, j = WEEK.index(a), WEEK.index(b)
        s |= set(WEEK[i:j + 1])
    n = re.sub(r"[월화수목금토일]\s*~\s*[월화수목금토일]", "", n)
    for g in re.findall(r"(?<![가-힣])([월화수목금토일](?:[/.,·]?[월화수목금토일])+)(?![가-힣])", n):
        s |= {c for c in g if c in WEEK}
    return s


def month_key(s):
    return s[:7] if s and re.match(r"\d{4}-\d{2}", s) else ""


def build():
    meta = json.load(open(os.path.join(RAW, "_meta.json"), encoding="utf-8"))
    files = {m["id"]: m for m in meta.get("meta", [])}
    desc = collections.defaultdict(dict)
    for x in read("15147992"):
        c = DESC_CENTER.get(x["스포츠센터"])
        if c:
            desc[c][x["강좌명"].replace(" ", "")] = x["링크주소"]

    out, centers, notes = [], [], collections.Counter()
    for i, s in SPEC.items():
        center, c_start, c_end, c_range, c_sport, c_time, c_day, c_tgt, c_fee, c_cap, c_id = s
        rows = read(i)
        end = (lambda x: x[c_end]) if c_end else (lambda x: x[c_range].split("~")[-1])
        months = sorted(m for m in (month_key(x[c_start]) for x in rows) if "2000" < m < "3000")
        data_month = months[-1]
        best = {}
        for x in rows:
            if not end(x).startswith("9999"):
                continue
            k = x[c_id]
            if k not in best or x[c_start] > best[k][c_start]:
                best[k] = x
        n_school = 0
        for x in best.values():
            name = re.sub(r"\s+", " ", x["강좌명"]).strip()
            if "학교단체" in name:
                n_school += 1
                continue
            sport = (x[c_sport] or "").strip() or "기타"
            base, opt = parse_days(x[c_day])
            a, b = parse_time(x[c_time])
            dur = (b - a) if a is not None and b is not None and b > a else None
            fee = int(x[c_fee]) if x[c_fee].strip().isdigit() else None
            spm, how = sessions_per_month(name, base, dur)
            per = round(fee / spm / 100) * 100 if fee and spm else None
            last = month_key(x[c_start])
            if not ("2000" < last < "3000"):
                fresh, last = "미입력", ""
                notes[f"{center}: 시작일 미입력·잘못된 연도"] += 1
            else:
                gap = (int(data_month[:4]) - int(last[:4])) * 12 + int(data_month[5:7]) - int(last[5:7])
                fresh = "오래됨" if gap >= 12 else "최근"
            nd = name_days(name)
            nd = "".join(sorted(nd, key=WEEK.index)) if len(nd) >= 2 and nd != set(base) else ""
            link = ""
            key = sport.replace(" ", "")
            for dk, url in desc.get(center, {}).items():
                if dk == key or (len(dk) >= 2 and (dk in key or key in dk)):
                    link = url
                    break
            out.append({
                "c": SHORT[center], "s": sport, "n": name,
                "d": "".join(base), "o": "".join(opt),
                "t0": a, "t1": b, "tt": x[c_time].strip(),
                "g": groups(x[c_tgt].strip(), name), "tg": x[c_tgt].strip(),
                "fee": fee, "per": per, "how": how,
                "cap": int(x[c_cap]) if x[c_cap].strip().isdigit() else None,
                "nd": nd, "last": last, "fr": fresh, "link": link or HOME[center],
            })
        centers.append({"name": SHORT[center], "full": center, "id": i, "data_month": data_month,
                        "mod": files.get(i, {}).get("mod") if isinstance(files.get(i), dict) else None,
                        "home": HOME[center], "n_current": sum(1 for r in out if r["c"] == SHORT[center]),
                        "n_school": n_school,
                        "url": f"https://www.data.go.kr/data/{i}/fileData.do"})
    return out, centers, notes


def summarize(rows, centers):
    def is_evening(r):  # 평일 19시 이후 시작
        return r["t0"] is not None and r["t0"] >= 19 * 60 and any(d in "월화수목금" for d in r["d"])
    def is_weekend(r):
        return any(d in "토일" for d in r["d"])
    by = collections.defaultdict(list)
    for r in rows:
        by[r["c"]].append(r)
    summ = {"centers": {}, "total": len(rows)}
    for c, rs in by.items():
        swim = sorted(r["per"] for r in rs if r["s"] == "수영" and r["per"] and r["how"] == "주")
        summ["centers"][c] = {
            "n": len(rs),
            "evening": sum(map(is_evening, rs)),
            "weekend": sum(map(is_weekend, rs)),
            "kids": sum("어린이" in r["g"] for r in rs),
            "senior": sum("실버" in r["g"] for r in rs),
            "stale": sum(r["fr"] != "최근" for r in rs),
            "daymis": sum(bool(r["nd"]) for r in rs),
            "swim_per_median": swim[len(swim) // 2] if swim else None,
            "swim_n": len(swim),
        }
    summ["evening"] = sum(v["evening"] for v in summ["centers"].values())
    summ["weekend"] = sum(v["weekend"] for v in summ["centers"].values())
    summ["kids"] = sum(v["kids"] for v in summ["centers"].values())
    summ["senior"] = sum(v["senior"] for v in summ["centers"].values())
    summ["stale"] = sum(v["stale"] for v in summ["centers"].values())
    return summ


PARK_CENTERS = {"올림픽수영장", "올림픽스포츠센터"}


def parking_profile():
    """올림픽공원 입출차 정보(15138735, 2024년 7월)로 시각별 주차 차량 수를 세고, 가장 많은 시각을 100으로 둔 지수.
    같은 행 반복은 실제 중복인지 알 수 없어 한 번만 센다 (빼고 세도 모양은 같음)."""
    import gzip, io, datetime as dt
    path = os.path.join(RAW, "15138735.csv.gz")
    if not os.path.exists(path):
        return None
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        rows = set(tuple(r) for r in list(csv.reader(f))[1:])
    fmt = "%Y-%m-%d %H:%M"
    occ = collections.Counter()
    for r in rows:
        try:
            ti, to = dt.datetime.strptime(r[1][:16], fmt), dt.datetime.strptime(r[2][:16], fmt)
        except (ValueError, IndexError):
            continue
        if to <= ti:
            continue
        t = ti.replace(minute=30)
        if t < ti:
            t += dt.timedelta(hours=1)
        while t < to and (t - ti).days < 2:
            occ[(t.date(), t.hour)] += 1
            t += dt.timedelta(hours=1)
    month = collections.Counter(r[0][:7] for r in rows).most_common(1)[0][0]  # 파일이 담은 달 (2024-07)
    days = sorted({d for d, _ in occ if f"{d:%Y-%m}" == month})
    hours = list(range(6, 23))
    prof = {}
    for k, wk in (("weekday", True), ("weekend", False)):
        sel = [d for d in days if (d.weekday() < 5) == wk]
        prof[k] = [sum(occ[(d, h)] for d in sel) / len(sel) for h in hours]
    top = max(max(prof["weekday"]), max(prof["weekend"]))
    # 예측 검증: 하루를 빼고 나머지 같은 종류(평일/주말) 날의 평균으로 그 하루를 맞혀 본 오차 (100대 이상인 시각만)
    import statistics as stt
    V = {d: [occ[(d, h)] for h in hours] for d in days}
    errs, band = {}, {}
    for d in days:
        grp = [x for x in days if x != d and (x.weekday() < 5) == (d.weekday() < 5)]
        pred = [sum(V[x][i] for x in grp) / len(grp) for i in range(len(hours))]
        e = [abs(pr - a) / a for pr, a in zip(pred, V[d]) if a >= 100]
        errs[d] = sum(e) / len(e)
    for k, wk in (("weekday", True), ("weekend", False)):
        sel = [d for d in days if (d.weekday() < 5) == wk]
        lo, hi = [], []
        for i in range(len(hours)):
            v = sorted(V[d][i] for d in sel)
            lo.append(round(v[0] / top * 100)); hi.append(round(v[-1] / top * 100))
        band[k] = {"lo": lo, "hi": hi}
    peaks = {d: max(V[d]) for d in days}
    busiest = max(peaks, key=peaks.get)
    fc = {"mape_median": round(stt.median(errs.values()) * 100, 1), "mape_mean": round(stt.mean(errs.values()) * 100, 1),
          "worst_day": str(max(errs, key=errs.get)), "worst_mape": round(max(errs.values()) * 100),
          "busiest_day": str(busiest), "busiest_peak": peaks[busiest], "median_peak": int(stt.median(peaks.values())),
          "n_within_15": sum(e <= 0.15 for e in errs.values()), "n_days": len(days)}
    return {"band": band, "forecast": fc, "hours": hours, "month": month, "n_days": {"weekday": sum(d.weekday() < 5 for d in days), "weekend": sum(d.weekday() >= 5 for d in days)},
            "weekday": [round(v / top * 100) for v in prof["weekday"]], "weekend": [round(v / top * 100) for v in prof["weekend"]]}


def scenarios(rows):
    """기획서에 쓰는 사용 장면. 모두 최근 1년 안에 바뀐 기록이 있는 강좌만 센다."""
    fr = [r for r in rows if r["fr"] == "최근"]
    wk = lambda r: any(d in "월화수목금" for d in r["d"])
    sc = {
        "직장인_올림픽공원_19시이후": sum(1 for r in fr if r["c"] in PARK_CENTERS and wk(r) and r["t0"] is not None and r["t0"] >= 19 * 60),
        "직장인_4곳_19시이후": sum(1 for r in fr if wk(r) and r["t0"] is not None and r["t0"] >= 19 * 60),
        "직장인_4곳_19시이후_수영": sum(1 for r in fr if r["s"] == "수영" and wk(r) and r["t0"] is not None and r["t0"] >= 19 * 60),
        "어린이_4곳": sum(1 for r in fr if "어린이" in r["g"]),
        "어린이_수영_4곳": sum(1 for r in fr if "어린이" in r["g"] and "수영" in r["s"]),
        "실버_4곳": sum(1 for r in fr if "실버" in r["g"]),
        "청소년_4곳": sum(1 for r in fr if "청소년" in r["g"]),
        "주말_4곳": sum(1 for r in fr if any(d in "토일" for d in r["d"])),
        "최근": len(fr),
    }
    return sc


def export_csv(rows):
    """센터 4곳 강좌를 한 형식으로 맞춘 결과를 누구나 다시 쓸 수 있게 CSV로 내놓는다 (엑셀에서 열리게 BOM 포함)."""
    hm = lambda m: "" if m is None else f"{m // 60:02d}:{m % 60:02d}"
    with open(os.path.join(ROOT, "site", "courses.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["센터", "종목", "강좌명", "요일", "괄호표기요일", "시작", "종료", "대상(원문)", "대상분류", "월강습비", "1회환산강습비(추정)", "정원", "최근변경월", "자료상태", "안내링크"])
        for r in rows:
            w.writerow([r["c"], r["s"], r["n"], r["d"], r["o"], hm(r["t0"]), hm(r["t1"]), r["tg"], "·".join(r["g"]), r["fee"] or "", r["per"] or "",
                        r["cap"] or "", r["last"], r["fr"], r["link"]])


def run():
    rows, centers, notes = build()
    summ = summarize(rows, centers)
    summ["scenarios"] = scenarios(rows)
    faq = read("15089962") if os.path.exists(os.path.join(RAW, "15089962.csv")) else []
    summ["faq"] = {"total": len(faq), "parking": sum("주차" in " ".join(x.values()) for x in faq)}
    export_csv(rows)
    park = parking_profile()
    chk = os.path.join(RAW, "_courses_checked.txt")
    meta = json.load(open(os.path.join(RAW, "_meta.json"), encoding="utf-8"))
    checked = open(chk, encoding="utf-8").read().strip() if os.path.exists(chk) else meta["fetched_at"][:10]
    p25 = None
    p25_path = os.path.join(ROOT, "out", "parking2025.json")
    if os.path.exists(p25_path):  # parking2025.py 결과 (2025년 1년치 입출차 + 공연)
        j = json.load(open(p25_path, encoding="utf-8"))
        p25 = {k: j[k] for k in ("hours", "months", "n_days", "n_event_days", "n_big_event_days", "n_performances", "profiles", "forecast")}
        p25["issues"] = {k: v for k, v in j["issues"].items() if k != "per_month"}
        if j.get("venue_model"):
            vm = j["venue_model"]
            p25["vm"] = {k: vm[k] for k in ("profiles", "month_factor", "accuracy", "big_days", "big_days_caught")}
        ev_path = os.path.join(RAW, "events.json")
        if os.path.exists(ev_path):  # 누리집 일정안내: 오늘 이후 일정만 화면에 넣음
            evj = json.load(open(ev_path, encoding="utf-8"))
            import datetime as _dt
            today = str(_dt.date.fromisoformat(evj["fetched"][:10]) - _dt.timedelta(days=1))  # 실행한 날이 아니라 수집한 날 기준 (결과 재현)
            p25["events"] = [{k: e[k] for k in ("title", "begin", "end", "venue_code", "venue", "times", "link")} for e in evj["events"] if e["end"] >= today]
            p25["events_fetched"] = evj["fetched"]
    summ["p25"] = {"forecast": p25["forecast"], "n_days": p25["n_days"], "peaks": {k: v["peak_mean"] for k, v in p25["profiles"].items()}} if p25 else None
    payload = {"centers": centers, "rows": rows, "summary": summ, "notes": dict(notes), "parking": park, "p25": p25, "checked": checked}
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    with open(os.path.join(ROOT, "out", "courses_summary.json"), "w", encoding="utf-8") as f:
        json.dump({"centers": centers, "summary": summ, "notes": dict(notes), "parking": park, "checked": checked}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "site", "courses.js"), "w", encoding="utf-8") as f:
        f.write("window.COURSES=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    return payload


if __name__ == "__main__":
    p = run()
    print(json.dumps(p["summary"], ensure_ascii=False, indent=1))
    print(p["notes"])
    for c in p["centers"]:
        print(c)
