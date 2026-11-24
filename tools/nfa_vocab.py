"""국민체력100 측정결과의 운동처방(pres_note)에 어떤 운동이 얼마나 나오는지 표본으로 본다 (가능성 확인용).
python tools/nfa_vocab.py   (키: DATA_GO_KR_KEY)
"""
import collections, json, os, sys, time, urllib.parse, urllib.request

key = urllib.parse.unquote((os.environ.get("DATA_GO_KR_KEY") or "").strip())
if not key:
    sys.exit("키 없음")


def get(url, page, n):
    q = urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": n, "resultType": "json"})
    for a in range(4):
        try:
            with urllib.request.urlopen(url + "?" + q, timeout=90) as f:
                b = json.loads(f.read().decode("utf-8"))["response"]["body"]
            it = b.get("items") or {}
            it = it.get("item", it) if isinstance(it, dict) else it
            return b.get("totalCount"), ([it] if isinstance(it, dict) else (it or []))
        except Exception as e:
            print("재시도", page, type(e).__name__)
            time.sleep(5)
    return None, []


R = "https://apis.data.go.kr/B551014/SRVC_NFA_TEST_RESULT/TODZ_NFA_TEST_RESULT_NEW"
tot, _ = get(R, 1, 1)
pages = tot // 1000
voc, ym, grp, n, with_note = collections.Counter(), collections.Counter(), collections.Counter(), 0, 0
for p in [int(pages * f) for f in (0.3, 0.5, 0.7, 0.8, 0.85, 0.9, 0.93, 0.95, 0.96, 0.97, 0.98, 0.985, 0.99, 0.995, 0.999)] + [pages, pages + 1]:
    _, items = get(R, max(p, 1), 1000)
    for x in items:
        n += 1
        ym[str(x.get("test_ym"))[:4]] += 1
        grp[(x.get("age_gbn"), x.get("cert_gbn"))] += 1
        note = x.get("pres_note") or ""
        if note:
            with_note += 1
        for part in note.replace("준비운동:", ",").replace("본운동:", ",").replace("마무리운동:", ",").replace("/", ",").split(","):
            if part.strip():
                voc[part.strip()] += 1
print("표본", n, "처방 있음", with_note, "연도", sorted(ym.items()))
print("구분", grp.most_common(20))
print("운동 종류 수", len(voc))
print("상위:", voc.most_common(120))
SP = ["수영", "아쿠아", "요가", "필라테스", "자전거", "테니스", "배드민턴", "탁구", "골프", "댄스", "에어로빅", "줄넘기", "등산", "달리기", "걷기", "스케이트", "농구", "축구", "태권도", "검도", "스쿼시", "헬스", "웨이트", "체조"]
print("종목 낱말:", {s: sum(v for k, v in voc.items() if s in k) for s in SP})

V = "https://apis.data.go.kr/B551014/SRVC_TODZ_VDO_PKG/TODZ_VDO_TRNG_GUIDE_I"
vt, _ = get(V, 1, 1)
vids = {}
for p in range(1, vt // 1000 + 2):
    for x in get(V, p, 1000)[1]:
        vids[x.get("file_nm")] = (x.get("aggrp_nm"), x.get("ftns_fctr_nm"), x.get("trng_nm"), x.get("vdo_ttl_nm"), x.get("ftns_lvl_nm"))
print("동영상 수", len(vids), collections.Counter((v[0], v[1]) for v in vids.values()).most_common(30))
