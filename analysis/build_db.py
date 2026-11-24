"""원본 파일을 SQLite DB(out/kspo.db)로 옮긴다. 표준 라이브러리만 사용.

courses      : 센터 4곳 강좌를 한 형식으로 맞춘 결과 (site/courses.csv, courses.py가 만듦)
parking_inout: 올림픽공원 입출차 정보 2024-07 (같은 행 반복은 한 번만)
faq          : 자주 묻는 질문정보
"""
import csv, gzip, sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "out" / "kspo.db"


def build():
    DB.parent.mkdir(exist_ok=True)
    DB.unlink(missing_ok=True)
    con = sqlite3.connect(DB)
    con.executescript("""
    CREATE TABLE courses(center TEXT, sport TEXT, name TEXT, days TEXT, opt_days TEXT, start_hm TEXT, end_hm TEXT,
        target_raw TEXT, target_group TEXT, fee INTEGER, fee_per_session INTEGER, capacity INTEGER,
        last_changed TEXT, freshness TEXT, link TEXT);
    CREATE TABLE parking_inout(base_date TEXT, in_at TEXT, out_at TEXT);
    CREATE TABLE faq(category TEXT, title TEXT, body TEXT);
    """)
    with open(ROOT / "site" / "courses.csv", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))[1:]
    nz = lambda v: int(v) if v not in ("", None) else None
    con.executemany("INSERT INTO courses VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    [(r[0], r[1], r[2], r[3], r[4], r[5] or None, r[6] or None, r[7], r[8], nz(r[9]), nz(r[10]), nz(r[11]), r[12], r[13], r[14]) for r in rows])
    with gzip.open(ROOT / "raw" / "15138735.csv.gz", "rt", encoding="utf-8", newline="") as f:
        pk = {tuple(r[:3]) for r in list(csv.reader(f))[1:] if len(r) >= 3}
    con.executemany("INSERT INTO parking_inout VALUES(?,?,?)", sorted(pk))
    with open(ROOT / "raw" / "15089962.csv", encoding="utf-8", newline="") as f:
        con.executemany("INSERT INTO faq VALUES(?,?,?)", [(r["카테고리"].strip(), r["제목"], r["내용"]) for r in csv.DictReader(f)])
    con.executescript("""
    CREATE INDEX ix_pk_in ON parking_inout(in_at);
    -- 분석용 뷰: 머문 시간(분), 요일 종류. 출차가 입차보다 앞서거나 같은 행은 뺀다.
    CREATE VIEW parking AS
      SELECT in_at, out_at, date(in_at) AS d, CAST(strftime('%H', in_at) AS INTEGER) AS in_hour,
             CASE WHEN strftime('%w', in_at) IN ('0','6') THEN '주말' ELSE '평일' END AS daytype,
             CAST(ROUND((julianday(out_at) - julianday(in_at)) * 1440) AS INTEGER) AS stay_min
      FROM parking_inout
      WHERE julianday(out_at) > julianday(in_at) AND strftime('%Y-%m', in_at) = '2024-07';
    -- 최근 1년 안에 바뀐 기록이 있는 강좌만
    CREATE VIEW courses_fresh AS
      SELECT *, CAST(substr(start_hm, 1, 2) AS INTEGER) AS start_hour FROM courses WHERE freshness = '최근';
    """)
    con.commit()
    return con


if __name__ == "__main__":
    c = build()
    for t in ("courses", "courses_fresh", "parking_inout", "parking", "faq"):
        print(t, c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
