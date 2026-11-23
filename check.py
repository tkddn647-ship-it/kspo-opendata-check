"""한국체육산업개발 개방 공공데이터 건강검진.

입력  raw/_meta.json      파일데이터 상세 메타 (업데이트 주기, 차기 등록 예정일, 전체 행, 항목)
      raw/_catalog.json   포털 목록 (파일 30 + API 28, 설명·수정일)
      raw/<id>.csv        내려받은 파일데이터 (UTF-8로 변환해 둔 것)
      ai_review.json      설명문 오탈자 후보 (AI가 찾고 사람이 확인한 것만)
출력  out/findings.json   데이터셋별 발견 사항 + 기관 전체 발견 사항
      out/summary.csv     데이터셋별 한 줄 요약

판정은 전부 규칙으로 한다. AI는 설명문 수정 문장 초안에만 쓴다 (ai_review.json).
"""
from __future__ import annotations

import csv
import datetime as dt
import difflib
import gzip
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW, OUT = ROOT / "raw", ROOT / "out"

# 마지막 자료 날짜로부터 이만큼 넘게 새 자료가 없으면 주의: 갱신 주기의 두 배 (주기를 두 번 건너뜀)
CYCLE_DAYS = {"월간": 60, "분기": 180, "반기": 365, "연간": 730}
PLACEHOLDER = re.compile(r"^(1900-01-01|1990-01-01|9999-12-31)")
DATE = re.compile(r"(?<!\d)((?:19|20)\d\d)-(\d\d)-(\d\d)(?!\d)")
ROW_ID = {"일련번호", "순번", "번호", "순서"}  # 행마다 하나씩인 번호 열 (강좌일련번호·종목코드처럼 기간별로 반복되는 번호는 제외)
LEVELS = {"error": "점검 필요", "warn": "주의", "info": "참고"}


def short(title: str) -> str:
    return re.sub(r"^한국체육산업개발주식회사_", "", title).strip()


def F(level: str, rule: str, msg: str, fix: str = "", evidence: str = "") -> dict:
    return {"level": level, "rule": rule, "msg": msg, "fix": fix, "evidence": evidence}


def read_csv(path: Path) -> tuple[list[str], list[list[str]]]:
    opener = (lambda: gzip.open(path, "rt", encoding="utf-8", newline="")) if path.suffix == ".gz" else (lambda: path.open(encoding="utf-8", newline=""))
    with opener() as f:
        rows = list(csv.reader(f))
    return rows[0], rows[1:]


def parse_date(s: str) -> dt.date | None:
    try:
        return dt.date.fromisoformat(s)
    except ValueError:
        return None


def data_dates(body: list[list[str]], ref: dt.date) -> list[dt.date]:
    """자리표시 날짜와 기준일보다 30일 넘게 뒤인 날짜(종료 예정일 등)는 뺀다."""
    out = []
    for r in body:
        for c in r:
            if PLACEHOLDER.match(c):
                continue
            for y, m, d in DATE.findall(c):
                x = parse_date(f"{y}-{m}-{d}")
                if x and x <= ref + dt.timedelta(days=30):
                    out.append(x)
    return out


def claimed_end_year(desc: str) -> int | None:
    """설명이 말하는 자료의 마지막 해.
    잡는 것:  '2013년 부터 2024년 강좌까지', '2021년 1월부터 ~2025년', '현재 2025년 4월까지', '현재는 2023년도 1월 부터 12월까지'
    안 잡는 것: '2010년부터 데이터를'(계속 쌓이는 중), '2014년 부터 현재까지', '2025년 6월 기준 N건'(건수 기준일)"""
    Y = r"((?:19|20)\d\d)"
    cands = [int(m.group(1)) for m in re.finditer(r"부터\s*~?\s*" + Y + r"(?:년|시즌)", desc)]
    cands += [int(m.group(1)) for m in re.finditer(r"현재(?:는)?\s*" + Y + r"년도?(?:\s*\d{1,2}월)?(?!\S*\s*부터\s*(?:데이터|정보|현재))", desc)
              if "부터" not in desc[m.end():m.end() + 3] or re.match(r"\s*\d{1,2}월\s*부터\s*\d{1,2}월", desc[m.end() - 3:m.end() + 12])]
    cands += [int(m.group(1)) for m in re.finditer(Y + r"년(?:\s*\d{1,2}월)?\s*(?:강좌)?까지", desc)]
    return max(cands) if cands else None


ENDED = re.compile(r"운영하였|운영했던|운영 종료|운영종료|종료되")


def clean_desc(s: str) -> str:
    """상세 화면 설명 뒤에 붙어 온 항목(열) 표를 잘라 냄: 첫 '가변문자형'·'숫자형' 앞의 마지막 문장까지."""
    m = re.search(r"데이터 항목\(컬럼\)|(가변문자형|숫자형|날짜형)\(", s)
    if not m:
        return s.strip()
    head = s[:m.start()]
    end = max(head.rfind("다."), head.rfind("다 "), head.rfind("."))
    return (head[:end + 2] if end > 0 else head).strip()


def csv_path(i: str) -> Path | None:
    """raw/<id>.csv 또는 큰 파일은 raw/<id>.csv.gz"""
    for p in (RAW / f"{i}.csv", RAW / f"{i}.csv.gz"):
        if p.exists():
            return p
    return None


def check_inout(hdr: list[str], body: list[list[str]], desc: str) -> list[dict]:
    """입차·출차 시각이 있는 데이터: 출차 빈칸, 출차<입차, 체류시간 분포, 설명이 말하는 구역 열."""
    if not {"입차일시", "출차일시"} <= set(hdr):
        return []
    ji, jo = hdr.index("입차일시"), hdr.index("출차일시")
    fmt = "%Y-%m-%d %H:%M"
    blank = neg = zero = over = short = 0
    for r in body:
        if not r[jo].strip():
            blank += 1
            continue
        try:
            m = (dt.datetime.strptime(r[jo][:16], fmt) - dt.datetime.strptime(r[ji][:16], fmt)).total_seconds() / 60
        except ValueError:
            continue
        neg += m < 0; zero += m == 0; over += m > 24 * 60; short += 0 <= m < 10
    fs = []
    if neg:
        fs.append(F("error", "입출차", f"출차가 입차보다 앞선 기록 {neg}건", "입·출차 시각을 바로잡음"))
    fs.append(F("info", "입출차", f"체류 0분 {zero}건, 10분 미만 {short}건({short / max(1, len(body)):.1%}), 24시간 넘음 {over}건, 출차 빈칸 {blank}건",
                "10분 미만은 회차·승하차일 수 있어 오류로 보지 않음. 이용자가 걸러 쓸 수 있게 설명에 적어 두면 좋음"))
    if re.search(r"출차.{0,30}(종료일|표기).{0,20}않|종료일이 표기가 되어 있지 않", desc) and blank == 0:
        fs.append(F("info", "설명내용", "설명은 장기 주차면 출차 시각이 비어 있을 수 있다고 하지만 실제로 빈칸은 0건",
                    "설명을 실제 자료에 맞게 고침"))
    zones = re.findall(r"(동\d문|남\d문|북\d문|서\d문)", desc)
    if zones and not any(re.search(r"구역|출입문|주차장", h) for h in hdr):
        fs.append(F("warn", "설명내용", f"설명은 주차구역({'·'.join(dict.fromkeys(zones))})별 자료라고 하지만 파일에 구역 열이 없음",
                    "주차구역(출입문) 열을 추가하거나 설명에서 구역 언급을 뺌"))
    return fs


def check_file(i: str, meta: dict, cat: dict, ref: dt.date) -> list[dict]:
    fs: list[dict] = []
    path = csv_path(i)
    if not path:
        return [F("info", "미수집", "파일을 내려받지 않아 내용 점검을 하지 않음 (이미지 또는 대용량)")]
    hdr, body = read_csv(path)

    # 1. 행 수: 포털에 적힌 '전체 행'과 실제
    want = int(meta.get("rows", "0").replace(",", "") or 0)
    if want and want != len(body):
        fs.append(F("warn", "행수", f"포털 표기 {want}행, 실제 {len(body)}행",
                    "포털 '전체 행' 값을 실제 파일에 맞게 고침"))

    # 2. 갱신 예정일 경과
    nxt = parse_date(meta.get("next", ""))
    if nxt and nxt < ref:
        fs.append(F("error", "갱신예정일", f"차기 등록 예정일 {nxt}이 지났는데 새 파일이 없음 (업데이트 주기 {meta.get('cycle')})",
                    "새 자료를 올리거나, 운영이 멈췄다면 업데이트 주기를 '수시'로 바꾸고 설명에 사유 명시",
                    f"차기 등록 예정일 {nxt}, 점검일 {ref}"))

    # 3. 자료 최신성: 마지막 자료 날짜가 갱신 주기보다 오래됨
    dates = data_dates(body, ref)
    last = max(dates) if dates else None
    cyc = meta.get("cycle", "")
    if last and cyc in CYCLE_DAYS and (ref - last).days > CYCLE_DAYS[cyc]:
        fs.append(F("warn", "최신성", f"마지막 자료 날짜 {last} — {(ref - last).days}일째 새 자료 없음 ('{cyc}' 갱신인데 주기를 두 번 넘게 건너뜀)",
                    "최근 자료를 추가하거나, 더 이상 생기지 않는 자료라면 설명에 '○○년 운영 종료' 명시",
                    f"자료 날짜 범위 {min(dates)} ~ {last}"))
    elif last and cyc == "수시" and (ref - last).days > 365 * 5:
        fs.append(F("info", "최신성", f"마지막 자료 날짜 {last} (5년 넘게 새 자료 없음, 업데이트 주기 '수시')",
                    "운영이 끝난 시설·행사라면 설명에 종료 시점을 적어 이용자가 헷갈리지 않게 함"))

    # 4. 설명이 말하는 기간 < 실제 자료 기간 (날짜 열이 없으면 '연도' 열로)
    desc = cat.get("desc", "")
    ce = claimed_end_year(desc)
    last_year = last.year if last else None
    yc = [j for j, h in enumerate(hdr) if h.strip() in ("연도", "년도")]
    if not last_year and yc:
        ys = [int(r[yc[0]]) for r in body if yc[0] < len(r) and r[yc[0]].isdigit()]
        last_year = max(ys) if ys else None
    if ce and last_year and last_year > ce:
        fs.append(F("warn", "설명기간", f"설명은 자료가 {ce}년까지라고 하지만 실제 자료는 {last_year}년" + (f"({last})" if last else "") + "까지 있음",
                    "설명문의 기간 표기를 실제 자료에 맞게 고침", f"설명: …{_around(desc, str(ce))}…"))

    # 5. 같은 내용 행
    cnt = Counter(tuple(r) for r in body)
    dup = sum(v - 1 for v in cnt.values() if v > 1)
    if dup:
        has_id = any(h.strip() in ROW_ID for h in hdr)
        worst = max(cnt.values())
        if has_id:
            fs.append(F("error", "중복", f"식별번호까지 똑같은 행 {dup}개", "중복 행 삭제"))
        else:
            fs.append(F("warn", "중복", f"모든 칸이 똑같은 행 {dup}개 (같은 행 최대 {worst}번). 식별번호 열이 없어 실제 중복인지 판단 불가",
                        "실제 중복이면 삭제, 서로 다른 건이면 식별번호 열 추가",
                        "예: " + " / ".join(next(k for k, v in cnt.items() if v == worst))[:120]))

    # 6. 식별번호 열 중복
    for j, h in enumerate(hdr):
        if h.strip() in ROW_ID:
            ids = Counter(r[j] for r in body if j < len(r))
            d = sum(v - 1 for v in ids.values() if v > 1)
            if d:
                fs.append(F("warn", "식별번호", f"'{h}' 값이 겹치는 행 {d}개", "식별번호가 유일하도록 정리"))

    # 7. 자리표시 날짜
    ph = Counter()
    for r in body:
        for j, c in enumerate(r):
            m = PLACEHOLDER.match(c)
            if m and j < len(hdr):
                ph[(hdr[j], m.group(1))] += 1
    for (h, v), n in sorted(ph.items()):
        documented = v in desc
        fs.append(F("info", "자리표시날짜", f"'{h}'에 {v} {n}건" + (" (설명에 뜻이 적혀 있음)" if documented else " — 설명에 뜻이 없음"),
                    "" if documented else f"{v}가 '기간 없음'인지 '미입력'인지 설명에 적거나 빈칸으로 바꿈"))
    far = [c for r in body for c in r for y, m, d in DATE.findall(c)
           if (x := parse_date(f"{y}-{m}-{d}")) and x > ref + dt.timedelta(days=365 * 3) and not c.startswith("9999")]
    if far:
        fs.append(F("info", "먼미래날짜", f"3년 넘게 뒤인 날짜 {len(far)}건 (예: {far[0][:10]})",
                    "'상시'를 뜻한다면 다른 상시 항목과 같은 표기로 통일"))

    fs += check_inout(hdr, body, desc)

    # 8. 빈칸이 절반 넘는 열
    for j, h in enumerate(hdr):
        empty = sum(1 for r in body if j >= len(r) or not r[j].strip())
        if body and empty / len(body) > 0.5:
            fs.append(F("info", "빈열", f"'{h}' 열의 {empty}/{len(body)}행이 비어 있음",
                        "쓰지 않는 열이면 빼고, 쓰는 열이면 채움"))

    # 9. 열 이름 중복 (파일 / 포털 항목 정보)
    for name, cols in (("파일", hdr), ("포털 항목 정보", [c for c in meta.get("cols", "").split(",") if c])):
        d = [c for c, n in Counter(cols).items() if n > 1]
        if d:
            fs.append(F("warn", "열이름중복", f"{name}에 같은 열 이름이 두 번 이상 있음: {', '.join(d)}",
                        "항목 정보를 실제 파일 열과 같게 한 번씩만 등록"))
    return fs


def _around(text: str, key: str, w: int = 22) -> str:
    k = text.find(key)
    return text[max(0, k - w): k + len(key) + w] if k >= 0 else ""


def check_api(x: dict, ref: dt.date) -> list[dict]:
    fs = [F("info", "API", "API는 인증키가 있어야 응답을 받을 수 있어, 이번 점검은 포털 설명·메타데이터만 봄")]
    ce = claimed_end_year(x.get("desc", ""))
    if ce and ref.year - ce >= 3 and ENDED.search(x.get("desc", "")):
        fs.append(F("info", "설명기간", f"설명상 {ce}년에 운영이 끝난 자료 (설명에 종료가 적혀 있음)"))
    elif ce and ref.year - ce >= 3:
        fs.append(F("warn", "설명기간", f"설명상 자료가 {ce}년에서 끝남 (수정일은 {x.get('mod')})",
                    "운영 종료라면 설명에 명시, 아니면 최신 자료 반영", f"설명: …{_around(x['desc'], str(ce))}…"))
    return fs


GENERIC = {"올림픽공원", "정보", "데이터", "비정형데이터", "한국체육산업개발주식회사"}


def _title_bigrams(title: str) -> set[str]:
    words = [w for w in re.split(r"[\s_()·,]+", short(title)) if w and w not in GENERIC]
    return {w[k:k + 2] for w in words for k in range(len(w) - 1)}


def desc_title_mismatch(items: list[dict]) -> dict[str, dict]:
    """설명이 다른 데이터셋 설명을 그대로 옮긴 경우: 두 설명의 앞부분이 90% 넘게 같고, 제목은 서로 다른 자료이며,
    이 데이터 제목의 핵심 낱말이 설명에 없을 때."""
    out = {}
    for a in items:
        da = a.get("desc", "")
        if len(da) < 30:
            continue
        for b in items:
            db = b.get("desc", "")
            if a is b or len(db) < 30:
                continue
            n = min(len(da), len(db))
            same_desc = difflib.SequenceMatcher(None, da[:n], db[:n]).ratio() >= 0.9
            ta, tb = _title_bigrams(a["title"]), _title_bigrams(b["title"])
            diff_title = len(ta & tb) / max(1, len(ta | tb)) < 0.3
            if same_desc and diff_title:
                words = [re.sub(r"(데이터|정보)$", "", w) for w in re.split(r"[\s_()·,]+", short(a["title"]))]
                words = [w for w in words if len(w) >= 2 and w not in GENERIC]
                if words and not any(w in da for w in words):
                    out[a["id"]] = F("error", "설명복사", f"설명이 '{short(b['title'])}' 설명과 같음 — 이 데이터('{short(a['title'])}')를 설명하지 않음",
                                     f"'{short(a['title'])}' 내용(항목: 제목·시작일·종료일 등)에 맞는 설명으로 새로 씀",
                                     f"설명 첫머리: {da[:60]}…")
    return out


def check_catalog(cat: dict, open_list: list[dict], ref: dt.date) -> list[dict]:
    fs = []
    portal = {short(x["title"]): x for x in cat["files"] + cat["apis"]}
    listed = {short(r["파일데이터명"]): r for r in open_list}
    only_portal = sorted(set(portal) - set(listed) - {"공공데이터 개방목록"})
    only_list = sorted(set(listed) - set(portal))
    if only_portal:
        fs.append(F("error", "개방목록", f"기관의 '공공데이터 개방목록' 파일({len(listed)}종)에 포털에 있는 {len(only_portal)}종이 빠져 있음",
                    "개방목록을 포털 목록과 맞춰 다시 만듦 (매 등록·폐기 때 함께 갱신)", ", ".join(only_portal)))
    if only_list:
        fs.append(F("warn", "개방목록", f"개방목록에는 있지만 포털에서 찾을 수 없는 {len(only_list)}종",
                    "폐기했다면 목록에서 빼고, 이름이 바뀌었다면 새 이름으로", ", ".join(only_list)))
    dept = Counter(r["관리부서명"] for r in open_list)
    pdept = Counter(x.get("dept", "") for x in cat["apis"] if x.get("dept"))
    if dept and pdept and dept.most_common(1)[0][0] != pdept.most_common(1)[0][0]:
        fs.append(F("warn", "개방목록", f"개방목록의 관리부서는 '{dept.most_common(1)[0][0]}'({dept.most_common(1)[0][1]}종), 포털은 대부분 '{pdept.most_common(1)[0][0]}'",
                    "관리부서를 현재 부서로 통일"))
    blank = sum(1 for r in open_list if not r.get("제공형태", "").strip())
    if blank:
        fs.append(F("info", "개방목록", f"개방목록 {len(open_list)}행 중 {blank}행의 '제공형태'가 빈칸", "제공형태(파일/API/링크)를 채움"))
    mods = Counter(x.get("mod") for x in cat["files"] + cat["apis"] if x.get("mod"))
    d, n = mods.most_common(1)[0]
    total = sum(mods.values())
    if n / total >= 0.5:
        fs.append(F("warn", "수정일", f"{total}종 중 {n}종의 수정일이 {d} 하루에 몰려 있음 — 수정일만 보고는 자료가 언제 바뀌었는지 알 수 없음",
                    "설명에 '데이터 기준일'(자료의 마지막 날짜)을 따로 적음 (이 점검표의 '자료 기준일' 칸처럼)"))
    return fs


def run(ref: dt.date | None = None) -> dict:
    meta_all = json.loads((RAW / "_meta.json").read_text(encoding="utf-8"))
    cat = json.loads((RAW / "_catalog.json").read_text(encoding="utf-8"))
    ref = ref or dt.date.fromisoformat(cat["fetched_at"][:10])
    meta = {m["id"]: m for m in meta_all["meta"]}
    cats = {x["id"]: x for x in cat["files"] + cat["apis"]}
    full = json.loads((RAW / "_desc.json").read_text(encoding="utf-8"))["desc"] if (RAW / "_desc.json").exists() else {}
    for x in cat["files"] + cat["apis"]:  # 목록 화면 설명은 잘려 있어 상세 화면 설명으로 바꿈
        if full.get(x["id"]):
            x["desc"] = clean_desc(full[x["id"]])
    ai = json.loads((ROOT / "ai_review.json").read_text(encoding="utf-8")) if (ROOT / "ai_review.json").exists() else {}
    copied = desc_title_mismatch(cat["files"] + cat["apis"])

    datasets = []
    for x in cat["files"] + cat["apis"]:
        i = x["id"]
        kind = "파일" if x["kind"] == "fileData" else "API"
        fs = check_file(i, meta.get(i, {}), x, ref) if kind == "파일" else check_api(x, ref)
        if i in copied:
            fs = [copied[i]] + [f for f in fs if f["rule"] != "설명기간"]
        for t in ai.get(i, []):
            if t["found"] in x.get("desc", "") or t.get("in") == "data":
                fs.append(F("info", "오탈자", f"'{t['found']}' → '{t['fix']}' ({t.get('note', '설명문')})",
                            "설명문 수정", "AI가 찾은 후보를 사람이 원문과 대조해 확인한 것"))
        last = None
        if kind == "파일" and csv_path(i):
            ds = data_dates(read_csv(csv_path(i))[1], ref)
            last = str(max(ds)) if ds else None
        worst = min((f["level"] for f in fs), key=["error", "warn", "info"].index, default="info")
        grade = {"error": "점검 필요", "warn": "주의"}.get(worst, "양호")
        datasets.append({"id": i, "kind": kind, "title": short(x["title"]), "mod": x.get("mod"),
                         "cycle": meta.get(i, {}).get("cycle", x.get("cycle", "")), "next": meta.get(i, {}).get("next", ""),
                         "rows": meta.get(i, {}).get("rows", ""), "last_data": last, "grade": grade,
                         "url": f"https://www.data.go.kr/data/{i}/{x['kind']}.do", "findings": fs})

    with (RAW / "15147873.csv").open(encoding="utf-8", newline="") as f:
        open_list = list(csv.DictReader(f))
    org = check_catalog(cat, open_list, ref)
    grades = Counter(d["grade"] for d in datasets)
    rules = Counter(f["rule"] for d in datasets for f in d["findings"] if f["level"] != "info" or f["rule"] == "오탈자")
    result = {"ref_date": str(ref), "fetched_at": cat["fetched_at"], "n_files": len(cat["files"]), "n_apis": len(cat["apis"]),
              "n_csv_checked": sum(1 for d in datasets if d["kind"] == "파일" and csv_path(d["id"])),
              "grades": dict(grades), "rules": dict(rules), "org": org, "datasets": datasets}
    OUT.mkdir(exist_ok=True)
    (OUT / "findings.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    site = ROOT / "site"
    if site.exists():  # 정적 페이지용 (file:// 로 열어도 보이게 JS로)
        (site / "data.js").write_text("window.FINDINGS = " + json.dumps(result, ensure_ascii=False) + ";\n", encoding="utf-8")
    with (OUT / "summary.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "구분", "데이터명", "등급", "자료 기준일", "업데이트 주기", "차기 등록 예정일", "발견 사항"])
        for d in datasets:
            w.writerow([d["id"], d["kind"], d["title"], d["grade"], d["last_data"] or "", d["cycle"], d["next"],
                        " / ".join(f"[{LEVELS[x['level']]}] {x['msg']}" for x in d["findings"])])
    return result


if __name__ == "__main__":
    r = run()
    print(f"점검일 {r['ref_date']} · 파일 {r['n_files']}종(내용 점검 {r['n_csv_checked']}종) · API {r['n_apis']}종")
    print("등급:", r["grades"])
    print("규칙별:", r["rules"])
    for f in r["org"]:
        print(f"[기관] [{LEVELS[f['level']]}] {f['msg']}")
