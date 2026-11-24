"""올림픽공원 공연·행사 일정을 한국체육산업개발 누리집 '일정안내'에서 받아 raw/events.json 에 저장한다.
(누리집 화면이 쓰는 eventInfoListAjax.es 와 같은 요청: 달마다 POST {"nowYM": "YYYYMM", "plcCd": ""})

python tools/fetch_events.py 2025-01   # 2025년 1월부터 오늘+4개월까지
공연장 코드(누리집 스크립트 주석): 01 올림픽홀, 02 KSPO DOME, 03 핸드볼경기장, 04 우리금융아트홀, 05 K-아트홀, 06 옥외·기타, 07 뮤즈라이브
"""
import datetime as dt
import json
import sys
import time
import urllib.request
from pathlib import Path

URL = "https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoListAjax.es"
OUT = Path(__file__).resolve().parents[1] / "raw" / "events.json"
VENUE = {"01": "올림픽홀", "02": "KSPO DOME", "03": "핸드볼경기장", "04": "우리금융아트홀", "05": "K-아트홀", "06": "옥외·기타", "07": "뮤즈라이브"}


def month(ym):
    r = urllib.request.Request(URL, data=json.dumps({"nowYM": ym, "plcCd": ""}).encode(),
                               headers={"Content-Type": "application/json;charset=UTF-8", "Accept": "application/json",
                                        "User-Agent": "kspo-course-finder (+https://github.com/tkddn647-ship-it/kspo-opendata-check)"})
    with urllib.request.urlopen(r, timeout=60) as f:
        j = json.loads(f.read().decode("utf-8"))
    return [e for part in j for e in (part or [])]


def main(start="2025-01"):
    y, m = map(int, start.split("-"))
    today = dt.date.today()
    end_y, end_m = today.year + (today.month + 4 - 1) // 12, (today.month + 4 - 1) % 12 + 1
    seen = {}
    while (y, m) <= (end_y, end_m):
        for e in month(f"{y}{m:02d}"):
            if e.get("delYn") == "Y":
                continue
            code = (e.get("plcCd") or "").strip()
            seen[e["evtSeq"]] = {"id": e["evtSeq"], "title": " ".join(e["title"].split()), "begin": e["beginDt"], "end": e["endDt"],
                                 "venue_code": code, "venue": VENUE.get(code, (e.get("plc") or "").strip()), "times": " ".join((e.get("tm") or "").split()),
                                 "link": f"https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoView.es?mid=a20301010100&evtSeq={e['evtSeq']}"}
        time.sleep(1)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    ev = sorted(seen.values(), key=lambda e: (e["begin"], e["id"]))
    OUT.write_text(json.dumps({"fetched": dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
                               "source": "한국체육산업개발 올림픽공원 누리집 일정안내", "events": ev}, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(ev)}건 저장 ({ev[0]['begin']} ~ {ev[-1]['end']})")


if __name__ == "__main__":
    main(*(sys.argv[1:2] or ["2025-01"]))
