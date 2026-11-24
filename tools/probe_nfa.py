"""국민체력100 공개 API(공공데이터포털, 국민체육진흥공단)를 조금만 불러 항목과 건수를 본다.
키는 환경변수 DATA_GO_KR_KEY (출력에 남기지 않음). python tools/probe_nfa.py
"""
import json, os, sys, urllib.parse, urllib.request, urllib.error

key = (os.environ.get("DATA_GO_KR_KEY") or "").strip()
if not key:
    print("DATA_GO_KR_KEY 없음: 저장소 Secrets에 등록되지 않았습니다")
    sys.exit(0)
APIS = {
    "측정결과(15108938)": "https://apis.data.go.kr/B551014/SRVC_NFA_TEST_RESULT/TODZ_NFA_TEST_RESULT_NEW",
    "동영상(15108846)": "https://apis.data.go.kr/B551014/SRVC_TODZ_VDO_PKG/TODZ_VDO_TRNG_GUIDE_I",
}
for name, url in APIS.items():
    for k in (key, urllib.parse.unquote(key)):  # 인코딩된 키·디코딩된 키 둘 다 시도
        q = urllib.parse.urlencode({"serviceKey": k, "pageNo": 1, "numOfRows": 20, "resultType": "json"})
        try:
            with urllib.request.urlopen(urllib.request.Request(url + "?" + q, headers={"accept": "application/json"}), timeout=60) as f:
                raw = f.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            print(name, "HTTP", e.code, e.read()[:200].decode("utf-8", "replace").replace(k, "***"))
            continue
        except Exception as e:
            print(name, "실패", type(e).__name__)
            continue
        try:
            j = json.loads(raw)
        except ValueError:
            print(name, "JSON 아님:", raw[:300].replace(k, "***"))
            continue
        body = j.get("response", j).get("body", {})
        items = body.get("items") or {}
        items = items.get("item", items) if isinstance(items, dict) else items
        items = [items] if isinstance(items, dict) else (items or [])
        print(f"== {name}: totalCount={body.get('totalCount')} 받은 {len(items)}건 header={json.dumps(j.get('response', j).get('header'), ensure_ascii=False)}")
        if items:
            print("항목:", list(items[0].keys()))
            for it in items[:6]:
                print(json.dumps(it, ensure_ascii=False)[:900])
            break
