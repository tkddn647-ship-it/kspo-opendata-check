"""강좌 찾기에 쓰는 파일 5종이 공공데이터포털에서 바뀌었으면 새로 받는다 (GitHub Actions에서 주 1회).

포털 화면의 '다운로드' 버튼과 같은 순서로 요청한다. 포털의 내려받기 제한(보안문자)이 뜨면 거기서 멈추고
기존 자료를 그대로 둔다. 보안문자를 우회하지 않는다.

python tools/refresh_courses.py          # 바뀐 것만 받음
python tools/refresh_courses.py --force  # 수정일이 같아도 받음
종료 코드: 0 = 바뀐 것 없음, 10 = 새로 받은 파일 있음, 1 = 실패
"""
import http.cookiejar
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "raw"
BASE = "https://www.data.go.kr"
IDS = ["15101610", "15110953", "15114776", "15118652", "15147992"]
UA = "Mozilla/5.0 (kspo-course-finder; +https://github.com/tkddn647-ship-it/kspo-opendata-check)"

jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def req(path, data=None, accept="*/*"):
    r = urllib.request.Request(BASE + path, data=urllib.parse.urlencode(data).encode() if data else None,
                               headers={"User-Agent": UA, "Accept": accept, "Referer": BASE + "/"})
    with op.open(r, timeout=60) as f:
        return f.status, f.read()


def field(text, key, pat):
    m = re.search(key + r"\s*" + pat, text)
    return m.group(1) if m else ""


def page_info(i):
    _, b = req(f"/data/{i}/fileData.do", accept="text/html")
    h = b.decode("utf-8", "replace")
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", h, flags=re.S | re.I)  # JSON-LD 등 스크립트 안의 같은 낱말 제외
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    u = re.search(r"fn_fileDataDown\('(\d+)',\s*'(uddi:[^']+)'", h)
    return {"uddi": u.group(2) if u else "", "mod": field(t, "수정일", r"([\d-]{10})"),
            "next": field(t, "차기 등록 예정일", r"([\d-]{10})"), "rows": field(t, "전체 행", r"([\d,]+)"),
            "cycle": field(t, "업데이트 주기", r"(실시간|일간|주간|월간|분기|반기|연간|수시)")}


def download(i, uddi):
    _, b = req(f"/tcs/dss/selectFileDataDownload.do?recommendDataYn=Y&publicDataPk={i}&publicDataDetailPk={urllib.parse.quote(uddi)}",
               accept="application/json")
    j = json.loads(b)
    if not j.get("status"):
        raise RuntimeError(f"{i}: 내려받기 정보 없음")
    st, lb = req("/cmm/cmm/check-limit.json", {"atchFileId": j["atchFileId"], "fileDetailSn": j["fileDetailSn"]}, "application/json")
    if st == 403 or json.loads(lb or b"{}").get("needCaptcha"):
        raise PermissionError("포털 내려받기 제한(보안문자) — 멈춤")
    name = j["dataSetFileDetailInfo"]["dataNm"]
    _, buf = req(f"/cmm/cmm/fileDownload.do?atchFileId={j['atchFileId']}&fileDetailSn={j['fileDetailSn']}&dataNm={urllib.parse.quote(name)}")
    txt = buf.decode("utf-8", "replace")
    enc = "utf-8"
    if txt.count("�") > 5:
        txt, enc = buf.decode("euc-kr", "replace"), "euc-kr"
    if not txt.lstrip("﻿").strip() or "<html" in txt[:200].lower():
        raise RuntimeError(f"{i}: CSV가 아닌 응답")
    return txt.lstrip("﻿"), enc, len(buf), name


def main(force=False):
    meta = json.loads((RAW / "_meta.json").read_text(encoding="utf-8"))
    byid = {m["id"]: m for m in meta["meta"]}
    changed = []
    for i in IDS:
        info = page_info(i)
        old = byid.get(i, {})
        print(f"{i} 포털 수정일 {info['mod'] or '?'} (가진 자료 {old.get('mod', '?')})")
        if not info["uddi"]:
            print(f"  {i}: 내려받기 정보를 찾지 못해 건너뜀")
            continue
        if not force and info["mod"] and info["mod"] == old.get("mod"):
            continue
        try:
            txt, enc, n, name = download(i, info["uddi"])
        except PermissionError as e:
            print("  " + str(e))
            break
        (RAW / f"{i}.csv").write_text(txt, encoding="utf-8")
        byid.setdefault(i, {"id": i}).update({k: v for k, v in info.items() if v})
        meta["files"][i] = {"enc": enc, "bytes": n, "name": name}
        changed.append(i)
        print(f"  받음 {name} ({enc}, {n:,} bytes)")
        time.sleep(3)
    if changed:
        meta["meta"] = list(byid.values())
        (RAW / "_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    kst = datetime.now(timezone(timedelta(hours=9)))
    (RAW / "_courses_checked.txt").write_text(kst.strftime("%Y-%m-%d %H:%M") + "\n", encoding="utf-8")
    return 10 if changed else 0


if __name__ == "__main__":
    try:
        sys.exit(main("--force" in sys.argv))
    except Exception as e:  # 네트워크·형식 오류: 기존 자료 유지
        print("실패:", e)
        sys.exit(1)
