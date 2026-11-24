"""analysis/queries.sql 의 질의를 SQLite에서 실행하고, 통계 검정을 더해 site/analysis.js · out/analysis.md 를 만든다.

python analysis/run.py
통계는 표준 라이브러리만 사용: 순열 검정(상관), 부트스트랩 신뢰구간(평균 차이). 난수 씨앗을 고정해 결과가 재현된다.
"""
import json, random, re, statistics as st, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_db  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def load_queries():
    txt = (ROOT / "analysis" / "queries.sql").read_text(encoding="utf-8")
    out = []
    for blk in re.split(r"(?m)^(?=-- @id )", txt):
        if not blk.strip():
            continue
        meta = dict(re.findall(r"-- @(\w+) (.+)", blk))
        meta["sql"] = "\n".join(l for l in blk.splitlines() if not l.startswith("-- @")).strip()
        out.append(meta)
    return out


def pearson(a, b):
    ma, mb = st.mean(a), st.mean(b)
    den = (sum((p - ma) ** 2 for p in a) * sum((q - mb) ** 2 for q in b)) ** 0.5
    return sum((p - ma) * (q - mb) for p, q in zip(a, b)) / den if den else 0.0


def perm_p(a, b, n=20000, seed=1):
    rnd, obs, hit, z = random.Random(seed), abs(pearson(a, b)), 0, list(b)
    for _ in range(n):
        rnd.shuffle(z)
        hit += abs(pearson(a, z)) >= obs
    return hit / n


def boot_diff(a, b, n=20000, seed=1):
    """평균(a) - 평균(b) 의 부트스트랩 95% 신뢰구간."""
    rnd, ds = random.Random(seed), []
    for _ in range(n):
        ds.append(st.mean(rnd.choices(a, k=len(a))) - st.mean(rnd.choices(b, k=len(b))))
    ds.sort()
    return round(st.mean(a) - st.mean(b)), round(ds[int(n * 0.025)]), round(ds[int(n * 0.975)])


def extra_stats(con):
    """SQL 결과 위에 얹는 통계 두 가지."""
    hours = list(range(6, 22))
    nd = con.execute("SELECT COUNT(DISTINCT d) FROM parking WHERE daytype='평일'").fetchone()[0]
    cap = dict(con.execute("""SELECT start_hour, SUM(capacity) FROM courses_fresh
        WHERE center IN ('올림픽수영장','올림픽스포츠센터') AND days GLOB '*[월화수목금]*'
          AND capacity IS NOT NULL AND start_hour IS NOT NULL GROUP BY 1"""))
    arr = [con.execute("""SELECT COUNT(*) * 1.0 / ? FROM parking WHERE daytype='평일' AND stay_min >= 10
        AND time(in_at) >= time(?) AND time(in_at) < time(?)""", (nd, f"{h - 1:02d}:30", f"{h:02d}:10")).fetchone()[0] for h in hours]
    x = [cap.get(h, 0) for h in hours]
    corr = {"hours": hours, "seats": x, "arrivals": [round(v) for v in arr], "r": round(pearson(x, arr), 2), "p": round(perm_p(x, arr), 3), "n": len(hours),
            # 6시(종일 자유이용권 정원 포함)를 빼도 유지되는지
            "r_excl6": round(pearson(x[1:], arr[1:]), 2), "p_excl6": round(perm_p(x[1:], arr[1:]), 3)}

    peaks = con.execute("""
      WITH RECURSIVE slot(t) AS (SELECT '2024-07-01 06:00' UNION ALL
        SELECT strftime('%Y-%m-%d %H:%M', t, '+30 minutes') FROM slot WHERE t < '2024-07-31 22:00'),
      occ AS (SELECT s.t, COUNT(p.in_at) AS cars FROM slot s LEFT JOIN parking p
        ON p.in_at <= s.t AND p.out_at > s.t AND p.in_at >= strftime('%Y-%m-%d %H:%M', s.t, '-2 days')
        WHERE CAST(substr(s.t, 12, 2) AS INTEGER) BETWEEN 6 AND 22 GROUP BY s.t)
      SELECT date(t), strftime('%w', t) IN ('0','6'), MAX(cars) FROM occ GROUP BY date(t)""").fetchall()
    we = [c for d, w, c in peaks if w]
    wd = [c for d, w, c in peaks if not w]
    we_no = [c for d, w, c in peaks if w and d not in ("2024-07-20", "2024-07-21")]
    d1, d2 = boot_diff(we, wd), boot_diff(we_no, wd)
    peak = {"weekday_mean": round(st.mean(wd)), "weekday_sd": round(st.stdev(wd)), "n_weekday": len(wd),
            "weekend_mean": round(st.mean(we)), "weekend_sd": round(st.stdev(we)), "n_weekend": len(we),
            "diff": d1, "diff_excl_event": d2, "weekend_mean_excl": round(st.mean(we_no)), "n_weekend_excl": len(we_no)}
    return {"corr": corr, "peak": peak}


def run():
    con = build_db.build()
    res = []
    for q in load_queries():
        cur = con.execute(q["sql"])
        res.append({**q, "cols": [d[0] for d in cur.description], "rows": cur.fetchall()})
    payload = {"queries": res, "stats": extra_stats(con),
               "tables": {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("courses", "courses_fresh", "parking_inout", "parking", "faq", "parking_zone", "inout2025")}}
    (ROOT / "site" / "analysis.js").write_text("window.ANALYSIS=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    md = ["# 분석 결과 (자동 생성: python analysis/run.py)\n"]
    for q in res:
        md += [f"## {q['title']}\n", f"질문: {q['question']}\n", "```sql", q["sql"], "```\n", "| " + " | ".join(q["cols"]) + " |", "|" + "---|" * len(q["cols"])]
        md += ["| " + " | ".join("" if v is None else str(v) for v in r) + " |" for r in q["rows"]] + [""]
    md += ["## 통계\n", "```json", json.dumps(payload["stats"], ensure_ascii=False, indent=1), "```"]
    (ROOT / "out" / "analysis.md").write_text("\n".join(md), encoding="utf-8")
    return payload


if __name__ == "__main__":
    p = run()
    print(json.dumps(p["stats"], ensure_ascii=False, indent=1)); print(p["tables"])
