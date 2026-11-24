"""'올림픽공원 2025 입출차정보'(문화공공데이터광장 API_CPM_008) 전체를 받아 raw/inout2025.csv.gz 로 저장.
키: KCISA_KEY_008 (없으면 KCISA_KEY). 키는 출력에 남기지 않는다.
한 행 = 차 한 대: 입차시각, 출차시각, 입구, 출구. 같은 LOCAL_ID는 한 번만.
"""
import csv, gzip, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

URL = "https://api.kcisa.kr/openapi/API_CPM_008/request"
OUT = Path(__file__).resolve().parents[1] / "raw" / "inout2025.csv.gz"
ROWS = 10000
PAT = re.compile(r"입구:\s*([^,]*),\s*입차시간:\s*([\d-]+ [\d:]+)\s*,\s*출구:\s*([^,]*),\s*출차시간:\s*([\d-]* ?[\d:]*)")


def get(key, no):
    q = urllib.parse.urlencode({"serviceKey": key, "numOfRows": ROWS, "pageNo": no})
    r = urllib.request.Request(f"{URL}?{q}", headers={"accept": "application/json", "User-Agent": "kspo-course-finder"})
    wait = 10
    for a in range(12):
        try:
            with urllib.request.urlopen(r, timeout=180) as f:
                j = json.loads(f.read().decode("utf-8"))
            body = j.get("response", j).get("body", {})
            it = body.get("items") or {}
            it = it.get("item", it) if isinstance(it, dict) else it
            return [it] if isinstance(it, dict) else (it or []), int(body.get("totalCount") or 0)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            code = getattr(e, "code", None)
            if code in (401, 403) or a == 11:
                raise
            print(f"  {no}쪽: {code or type(e).__name__}, {wait}초 뒤 다시 ({a + 1}/12)", flush=True)
            time.sleep(wait)
            wait = min(wait * 2, 180)


def main():
    key = (os.environ.get("KCISA_KEY_008") or os.environ.get("KCISA_KEY") or "").strip()
    if not key:
        print("키 없음"); return 1
    seen, bad, no, total, t0 = set(), 0, 1, None, time.time()
    with gzip.open(OUT, "wt", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["in_at", "out_at", "in_gate", "out_gate"])
        while True:
            items, tc = get(key, no)
            total = total or tc
            if not items:
                break
            for x in items:
                lid = x.get("LOCAL_ID")
                if lid in seen:
                    continue
                seen.add(lid)
                m = PAT.search(x.get("DESCRIPTION") or "")
                if not m:
                    bad += 1
                    continue
                w.writerow([m.group(2), m.group(4).strip(), m.group(1).strip(), m.group(3).strip()])
            print(f"{no}쪽 받음 (고유 {len(seen):,} / 전체 {total:,}, 형식 다른 행 {bad}, {int(time.time() - t0)}초)", flush=True)
            if total and no * ROWS >= total:
                break
            no += 1
            time.sleep(12)
    print(f"저장 {OUT.name}: {len(seen) - bad:,}행 (전체 {total:,}, 중복 제외, 형식 다른 행 {bad})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        k = os.environ.get("KCISA_KEY_008") or os.environ.get("KCISA_KEY") or "\0"
        print("실패:", str(e).replace(k, "***")); sys.exit(1)
