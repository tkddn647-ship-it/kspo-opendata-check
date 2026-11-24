"""센터 4곳 주변 시군구의 연령별 주민등록 인구를 공공데이터포털 파일에서 받아 필요한 행만 남긴다.

자료: 행정안전부_지역별(행정동) 성별 연령별 주민등록 인구수 (15097972), 안 되면 법정동판(15099158).
포털 화면의 다운로드와 같은 순서로 요청하고, 보안문자가 뜨면 멈춘다 (우회하지 않음).
GitHub Actions에서 실행: python tools/fetch_population.py
"""
import csv
import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import refresh_courses as rc  # noqa: E402

RAW = Path(__file__).resolve().parents[1] / "raw"
KEEP = ("송파구", "강동구", "고양시", "일산동구", "일산서구", "성남시", "분당구")


def fetch(i):
    info = rc.page_info(i)
    print(i, info)
    if not info["uddi"]:
        raise RuntimeError("내려받기 정보 없음")
    _, b = rc.req(f"/tcs/dss/selectFileDataDownload.do?recommendDataYn=Y&publicDataPk={i}&publicDataDetailPk={rc.urllib.parse.quote(info['uddi'])}",
                  accept="application/json")
    j = json.loads(b)
    st, lb = rc.req("/cmm/cmm/check-limit.json", {"atchFileId": j["atchFileId"], "fileDetailSn": j["fileDetailSn"]}, "application/json")
    if st == 403 or json.loads(lb or b"{}").get("needCaptcha"):
        raise PermissionError("포털 내려받기 제한(보안문자) - 멈춤")
    name = j["dataSetFileDetailInfo"]["dataNm"]
    _, buf = rc.req(f"/cmm/cmm/fileDownload.do?atchFileId={j['atchFileId']}&fileDetailSn={j['fileDetailSn']}&dataNm={rc.urllib.parse.quote(name)}")
    print("받음", name, len(buf), "bytes", buf[:4])
    if buf[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(buf))
        print("zip:", z.namelist())
        buf = z.read([n for n in z.namelist() if n.lower().endswith(".csv")][0])
    for enc in ("utf-8-sig", "cp949"):
        try:
            return buf.decode(enc), info, name
        except UnicodeDecodeError:
            continue
    raise RuntimeError("인코딩을 알 수 없음")


def main():
    for i in ("15097972", "15099158"):
        try:
            txt, info, name = fetch(i)
        except PermissionError as e:
            print(e)
            return 1
        except Exception as e:  # 다음 후보로
            print(i, "실패:", e)
            continue
        rows = list(csv.reader(io.StringIO(txt)))
        head, body = rows[0], rows[1:]
        keep = [r for r in body if any(k in "".join(r[:6]) for k in KEEP)]
        print("열", len(head), head[:12], "...", "전체", len(body), "남김", len(keep))
        with (RAW / "population.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(head)
            w.writerows(keep)
        (RAW / "population_meta.json").write_text(json.dumps({"id": i, "name": name, **info, "rows_all": len(body), "rows_kept": len(keep)},
                                                             ensure_ascii=False, indent=1), encoding="utf-8")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
