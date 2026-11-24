"""문화공공데이터광장 API를 한 번만 불러 전체 건수·한 번에 받을 수 있는 건수·첫 항목을 본다 (키는 KCISA_KEY, 출력에 남기지 않음).
python tools/probe_kcisa.py API_CPM_008 1000
"""
import json, os, sys, urllib.parse, urllib.request, urllib.error, time
api, rows = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1000
key = os.environ["KCISA_KEY"].strip()
for n in (rows, 1000, 100):
    q = urllib.parse.urlencode({"serviceKey": key, "numOfRows": n, "pageNo": 1})
    r = urllib.request.Request(f"https://api.kcisa.kr/openapi/{api}/request?{q}", headers={"accept": "application/json"})
    for a in range(6):
        try:
            with urllib.request.urlopen(r, timeout=120) as f:
                j = json.loads(f.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            print(f"numOfRows={n}: HTTP {e.code}"); 
            if e.code != 429: j = None; break
            time.sleep(15)
    else:
        j = None
    if not j:
        continue
    body = j.get("response", j).get("body", {})
    items = body.get("items") or {}
    items = items.get("item", items) if isinstance(items, dict) else items
    items = [items] if isinstance(items, dict) else (items or [])
    print(f"numOfRows={n}: 받은 {len(items)}건, totalCount={body.get('totalCount')}, header={json.dumps(j.get('response', j).get('header'), ensure_ascii=False)}")
    for it in items[:2]:
        print(json.dumps(it, ensure_ascii=False)[:500])
    if items:
        print("마지막 항목 일시:", items[-1].get("ISSUED_DATE"))
        break
