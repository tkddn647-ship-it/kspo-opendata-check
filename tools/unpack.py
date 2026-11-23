"""collect_in_browser.js 가 내려받은 kspo_opendata.json.gz 를 raw/ 에 푼다.

python tools/unpack.py ~/Downloads/kspo_opendata.json.gz
"""
import gzip
import json
import sys
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "raw"


def main(path: str) -> None:
    d = json.loads(gzip.open(path).read())
    RAW.mkdir(exist_ok=True)
    for k, v in d["csv"].items():
        (RAW / f"{k}.csv").write_text(v["txt"], encoding="utf-8")
    files = {k: {kk: vv for kk, vv in v.items() if kk != "txt"} for k, v in d["csv"].items()}
    (RAW / "_meta.json").write_text(json.dumps({"fetched_at": d["fetched_at"], "meta": d["meta"], "files": files},
                                               ensure_ascii=False, indent=1), encoding="utf-8")
    (RAW / "_catalog.json").write_text(json.dumps({"fetched_at": d["fetched_at"], **d["catalog"]},
                                                  ensure_ascii=False, indent=1), encoding="utf-8")
    (RAW / "_desc.json").write_text(json.dumps({"fetched_at": d["fetched_at"], "desc": d["desc"]},
                                               ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{d['fetched_at']} · 파일 {len(d['csv'])}종 → {RAW}")


if __name__ == "__main__":
    main(sys.argv[1])
