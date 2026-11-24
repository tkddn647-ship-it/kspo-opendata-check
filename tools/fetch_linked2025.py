"""'올림픽공원 2025 차량입출차, 공연, 날씨정보 등 연계 데이터'(문화공공데이터광장 API_CPM_009)를 전부 받아
raw/linked2025.csv 로 저장한다. 인증키는 환경변수 KCISA_KEY 로만 받는다 (파일·로그에 남기지 않음).

KCISA_KEY=... python tools/fetch_linked2025.py
"""
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

URL = "https://api.kcisa.kr/openapi/API_CPM_009/request"
OUT = Path(__file__).resolve().parents[1] / "raw" / "linked2025.csv"
FIELDS = ["주차대수", "방문객", "기온", "풍향", "강수량", "습도", "휴일", "공연명", "공연관람객수"]


def page(key, no, rows=1000):
    """요청이 잦다(429)거나 일시 오류(5xx)면 기다렸다가 다시 시도 (최대 8번, 10초→최대 2분)."""
    q = urllib.parse.urlencode({"serviceKey": key, "numOfRows": rows, "pageNo": no})
    r = urllib.request.Request(f"{URL}?{q}", headers={"accept": "application/json", "User-Agent": "kspo-course-finder"})
    wait = 10
    for attempt in range(8):
        try:
            with urllib.request.urlopen(r, timeout=90) as f:
                return json.loads(f.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 7:
                raise
            ra = e.headers.get("Retry-After")
            w = int(ra) if ra and ra.isdigit() else wait
            print(f"  {no}쪽: HTTP {e.code}, {w}초 뒤 다시 ({attempt + 1}/8)")
            time.sleep(w)
            wait = min(wait * 2, 120)


def parse_desc(s):
    """'주차대수:19,방문객:57, 기온:-3.4, ... ,공연명:,공연관람객수:0' → dict. 공연명에 쉼표가 있어도 되게 키 이름으로 자른다."""
    out, pat = {}, "|".join(FIELDS)
    for m in re.finditer(rf"({pat})\s*:(.*?)(?=,\s*(?:{pat})\s*:|$)", s or "", flags=re.S):
        out[m.group(1)] = m.group(2).strip()
    return out


def main():
    key = os.environ.get("KCISA_KEY", "").strip()
    if not key:
        print("KCISA_KEY 가 없습니다."); return 1
    items, no, total = [], 1, None
    while True:
        j = page(key, no)
        body = j.get("response", j).get("body", {})
        got = body.get("items") or {}
        got = got.get("item", got) if isinstance(got, dict) else got
        got = [got] if isinstance(got, dict) else (got or [])
        total = int(body.get("totalCount") or 0) or total
        if not got:
            if no == 1:
                print("응답에 자료가 없습니다:", json.dumps(j, ensure_ascii=False)[:300].replace(key, "***"))
                return 1
            break
        items += got
        print(f"{no}쪽 {len(got)}건 (누적 {len(items)} / 전체 {total})")
        if total and len(items) >= total:
            break
        no += 1
        time.sleep(15)
    import gzip
    with gzip.open(OUT.with_suffix(".raw.json.gz"), "wt", encoding="utf-8") as f:  # 응답 원본 (칸 이름 확인용)
        json.dump(items, f, ensure_ascii=False)
    print("첫 항목의 칸 이름:", sorted(items[0].keys()))
    print("첫 항목:", json.dumps(items[0], ensure_ascii=False)[:600])
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ID", "일시", "제목"] + FIELDS + ["설명원문"])
        for it in sorted(items, key=lambda x: str(x.get("ISSUED_DATE") or x.get("issuedDate") or "")):
            g = lambda k: it.get(k) or it.get(k.lower()) or it.get("".join(p.title() if i else p.lower() for i, p in enumerate(k.split("_")))) or ""
            d = parse_desc(g("DESCRIPTION"))
            w.writerow([g("LOCAL_ID"), g("ISSUED_DATE"), str(g("TITLE")).strip()] + [d.get(k, "") for k in FIELDS] + [g("DESCRIPTION")])
    print(f"저장 {OUT} ({len(items)}건)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("실패:", str(e).replace(os.environ.get("KCISA_KEY", "\0"), "***")); sys.exit(1)
