"""운영 중 강좌에서 무작위 100개를 뽑아, 프로그램이 정한 '대상 나이'와 '처방 운동 연결'을 사람이 대조할 표를 만든다.

seed 를 고정해 같은 표본이 다시 나온다. 판정 결과는 docs/검증_표본100.md 에 사람이 적는다.
실행: python tools/sample_check.py  →  out/sample_check.csv
"""
import csv
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import fit  # noqa: E402
import gap  # noqa: E402

SEED = 20261125


def main():
    K = gap.load_courses()
    R = [r for r in K["rows"] if r["fr"] == "최근"]
    link = {s: L["key"] for L in fit.LINK for s in L["sports"]}
    random.seed(SEED)
    pick = random.sample(range(len(R)), 100)
    path = os.path.join(ROOT, "out", "sample_check.csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["번호", "센터", "종목", "강좌명", "수강대상", "판별 최소나이", "판별 최대나이", "판별 근거", "연결된 처방 운동"])
        for i, k in enumerate(pick, 1):
            r = R[k]
            lo, hi, why = gap.age_range(r)
            w.writerow([i, r["c"], r["s"], r["n"], r["tg"], lo, hi, why, link.get(r["s"], "")])
    print(f"운영 중 {len(R)}개 중 100개 → {path}")


if __name__ == "__main__":
    main()
