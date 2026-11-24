"""국민체력100 동영상 정보(국민체육진흥공단, 공공데이터포털 15108846)의 영상 목록을 받는다.
API는 영상의 장면(프레임)마다 한 행이라, 파일 이름으로 묶어 영상 한 개에 한 줄만 남긴다. → raw/nfa_videos.json
python tools/fetch_nfa_videos.py   (키: DATA_GO_KR_KEY)
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

URL = "https://apis.data.go.kr/B551014/SRVC_TODZ_VDO_PKG/TODZ_VDO_TRNG_GUIDE_I"
key = urllib.parse.unquote((os.environ.get("DATA_GO_KR_KEY") or "").strip())
if not key:
    sys.exit("키 없음")


def get(page, n=1000):
    q = urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": n, "resultType": "json"})
    for a in range(5):
        try:
            with urllib.request.urlopen(URL + "?" + q, timeout=120) as f:
                b = json.loads(f.read().decode("utf-8"))["response"]["body"]
            it = b.get("items") or {}
            it = it.get("item", it) if isinstance(it, dict) else it
            return b.get("totalCount"), ([it] if isinstance(it, dict) else (it or []))
        except Exception as e:
            print("재시도", page, type(e).__name__)
            time.sleep(5 + a * 5)
    sys.exit("받기 실패")


total, _ = get(1, 1)
vids = {}
for p in range(1, (total + 999) // 1000 + 1):
    for x in get(p)[1]:
        f = x.get("file_nm")
        if f and f not in vids:
            vids[f] = {"file": f, "url": (x.get("file_url") or "") + f, "title": x.get("vdo_ttl_nm"), "name": x.get("trng_nm"),
                       "desc": x.get("vdo_desc"), "group": x.get("aggrp_nm"), "factor": x.get("ftns_fctr_nm"), "level": x.get("ftns_lvl_nm"),
                       "place": x.get("trng_plc_nm"), "tool": x.get("tool_nm"), "part": x.get("trng_mscl_part"), "len": x.get("vdo_len"),
                       "thumb": (x.get("img_file_url") or "") + (x.get("img_file_nm") or "")}
out = {"fetched": datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"), "rows_api": total,
       "source": "국민체육진흥공단 국민체력100 동영상 정보 (공공데이터포털 15108846)", "videos": sorted(vids.values(), key=lambda v: v["file"])}
Path(__file__).resolve().parents[1].joinpath("raw", "nfa_videos.json").write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
print("영상", len(vids), "행", total)
print(json.dumps(out["videos"][0], ensure_ascii=False))
