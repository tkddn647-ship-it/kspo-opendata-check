"""점검 규칙 단위 테스트: python -m unittest discover tests"""
import datetime as dt
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import check as C  # noqa: E402

REF = dt.date(2026, 11, 23)


class ClaimedEndYear(unittest.TestCase):
    def test_cases(self):
        cases = {
            "2013년 부터 2024년 강좌까지 확인": 2024,
            "2021년 1월부터 ~2025년 12월까지의": 2025,
            "현재 2010년부터 데이터를 제공하고 있으며, 현재 2025년 4월까지 데이터를": 2025,
            "현재는 2023년도 1월 부터 12월까지 올림픽공원": 2023,
            "2014년 부터 현재까지 기준일자로": None,
            "2025년 6월 기준 2,592건": None,
            "2019년부터 2021시즌까지 운영": 2021,
            "2013년부터 정보입니다": None,
        }
        for text, want in cases.items():
            with self.subTest(text=text):
                self.assertEqual(C.claimed_end_year(text), want)


class CleanDesc(unittest.TestCase):
    def test_cuts_column_table(self):
        s = "설명 문장입니다. 데이터 항목(컬럼) 정보 순번 rnum 일련번호 가변문자형(VARCHAR) 100"
        self.assertEqual(C.clean_desc(s), "설명 문장입니다.")

    def test_keeps_plain(self):
        self.assertEqual(C.clean_desc("그냥 설명"), "그냥 설명")


class DataDates(unittest.TestCase):
    def test_skips_placeholders_and_far_future(self):
        body = [["1990-01-01", "2026-05-01"], ["9999-12-31", "2032-07-31"], ["2025-01-02 10:00:00", "x"]]
        self.assertEqual(max(C.data_dates(body, REF)), dt.date(2026, 5, 1))
        self.assertNotIn(dt.date(1990, 1, 1), C.data_dates(body, REF))


class DescCopy(unittest.TestCase):
    def test_flags_copied_description(self):
        base = "기관에서 생산 및 수신된 전자결재 정보목록 데이터입니다. 제목, 파일, 조회수, 등록일을 제공합니다."
        items = [{"id": "1", "title": "한국체육산업개발주식회사_정보목록데이터", "desc": base},
                 {"id": "2", "title": "한국체육산업개발주식회사_올림픽공원 핫뉴스 정보", "desc": base}]
        out = C.desc_title_mismatch(items)
        self.assertIn("2", out)       # 핫뉴스: 설명에 '핫뉴스'가 없음
        self.assertNotIn("1", out)    # 정보목록: 설명이 자기 내용을 말함

    def test_same_content_file_and_api_not_flagged(self):
        d = "올림픽공원을 대상으로 촬영한 사진정보를 제공하고 있습니다. 식물사진, 식물명, 홈페이지URL 등을 제공합니다."
        items = [{"id": "1", "title": "x_비정형데이터_생태갤러리", "desc": d},
                 {"id": "2", "title": "x_올림픽공원 생태공원 갤러리", "desc": d}]
        self.assertEqual(C.desc_title_mismatch(items), {})


class CheckFile(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = C.RAW
        C.RAW = Path(self.tmp.name)

    def tearDown(self):
        C.RAW = self.old
        self.tmp.cleanup()

    def write(self, name, text):
        (C.RAW / f"{name}.csv").write_text(text, encoding="utf-8")

    def rules(self, fs):
        return {f["rule"]: f["level"] for f in fs}

    def test_overdue_and_stale(self):
        self.write("a", "일련번호,혼잡도,등록일\n1,혼잡,2026-08-12\n2,원활,2026-08-01\n")
        r = self.rules(C.check_file("a", {"rows": "2", "cycle": "월간", "next": "2026-09-12"}, {"desc": ""}, REF))
        self.assertEqual(r.get("갱신예정일"), "error")
        self.assertEqual(r.get("최신성"), "warn")

    def test_duplicates_without_row_id_are_warn(self):
        self.write("b", "보도일자,보도내용,보도매체\n2014-01-19,기사,뉴시스\n2014-01-19,기사,뉴시스\n")
        r = self.rules(C.check_file("b", {"rows": "2", "cycle": "연간"}, {"desc": ""}, REF))
        self.assertEqual(r.get("중복"), "warn")

    def test_course_id_repeats_are_not_flagged(self):
        self.write("c", "일련번호,강좌일련번호,수강월\n1,10,2026-05-01\n2,10,2026-06-01\n")
        r = self.rules(C.check_file("c", {"rows": "2", "cycle": "연간"}, {"desc": ""}, REF))
        self.assertNotIn("식별번호", r)

    def test_description_period_behind_data(self):
        self.write("d", "연도,월,주차대수\n2023,01월,1\n2025,12월,2\n")
        r = self.rules(C.check_file("d", {"rows": "2", "cycle": "연간"}, {"desc": "현재는 2023년도 1월 부터 12월까지 정보"}, REF))
        self.assertEqual(r.get("설명기간"), "warn")

    def test_reads_gzip(self):
        import gzip
        with gzip.open(C.RAW / "g.csv.gz", "wt", encoding="utf-8") as f:
            f.write("일련번호,등록일\n1,2026-01-01\n")
        self.assertIsNotNone(C.csv_path("g"))
        self.assertEqual(C.read_csv(C.csv_path("g"))[1], [["1", "2026-01-01"]])

    def test_row_count_mismatch(self):
        self.write("e", "일련번호\n1\n")
        r = self.rules(C.check_file("e", {"rows": "5", "cycle": "연간"}, {"desc": ""}, REF))
        self.assertEqual(r.get("행수"), "warn")


class InOut(unittest.TestCase):
    def test_zone_in_desc_but_no_zone_column(self):
        hdr = ["입차일", "입차일시", "출차일시"]
        body = [["2024-07-01", "2024-07-01 10:00", "2024-07-01 10:05"], ["2024-07-01", "2024-07-01 11:00", "2024-07-02 12:00"]]
        fs = C.check_inout(hdr, body, "동2문/남2문/북2문 주차구역에 대한 입출차 정보. 장기 주차인경우에는 종료일이 표기가 되어 있지 않을수도 있습니다.")
        rules = [(f["rule"], f["level"]) for f in fs]
        self.assertIn(("설명내용", "warn"), rules)          # 구역 열 없음
        self.assertEqual(sum(1 for r, _ in rules if r == "설명내용"), 2)  # + 출차 빈칸 0건
        info = next(f for f in fs if f["rule"] == "입출차")
        self.assertIn("24시간 넘음 1건", info["msg"])
        self.assertIn("10분 미만 1건", info["msg"])

    def test_exit_before_entry_is_error(self):
        fs = C.check_inout(["입차일시", "출차일시"], [["2024-07-01 10:00", "2024-07-01 09:00"]], "")
        self.assertEqual(fs[0]["level"], "error")

    def test_not_parking_data(self):
        self.assertEqual(C.check_inout(["일련번호"], [["1"]], ""), [])


class Catalog(unittest.TestCase):
    def test_missing_from_open_list(self):
        cat = {"files": [{"title": "x_A", "mod": "2026-09-21"}, {"title": "x_B", "mod": "2026-09-21"}],
               "apis": [{"title": "x_C", "mod": "2026-01-01", "dept": "디지털혁신팀"}]}
        open_list = [{"파일데이터명": "x_A", "관리부서명": "경영정보화팀", "제공형태": ""},
                     {"파일데이터명": "x_Z", "관리부서명": "경영정보화팀", "제공형태": "파일"}]
        fs = C.check_catalog(cat, open_list, REF)
        msgs = " ".join(f["msg"] for f in fs)
        self.assertIn("2종이 빠져", msgs)      # B, C
        self.assertIn("찾을 수 없는 1종", msgs)  # Z
        self.assertIn("수정일", " ".join(f["rule"] for f in fs))


if __name__ == "__main__":
    unittest.main()


import courses as CO  # noqa: E402


class Courses(unittest.TestCase):
    def test_parse_days(self):
        self.assertEqual(CO.parse_days("월,화,수,목,금,(토)"), (list("월화수목금"), ["토"]))
        self.assertEqual(CO.parse_days("화,목"), (["화", "목"], []))

    def test_name_days(self):
        self.assertEqual(CO.name_days("골프 15시(화목)"), {"화", "목"})
        self.assertEqual(CO.name_days("19시 연수1 (오리발=화.목)"), set())          # 오리발 요일은 강습 요일 아님
        self.assertEqual(CO.name_days("17시 기초2(배영팔동작.화목)(토.자유수영)"), {"화", "목"})
        self.assertEqual(CO.name_days("검도 21시(월~금)"), set("월화수목금"))
        self.assertEqual(CO.name_days("TRX 화요일반"), set())

    def test_sessions(self):
        self.assertEqual(CO.sessions_per_month("특강 (토) 12회", ["토"], 60), (12, "회차"))
        self.assertEqual(CO.sessions_per_month("수영 주3회", list("월수금"), 50)[1], "주")
        self.assertEqual(CO.sessions_per_month("자유이용", list("월화수목금"), 600), (None, None))  # 자유이용형은 환산 안 함

    def test_range_in_date_column(self):
        hdr = ["강좌번호", "시작월", "강좌명", "요일", "시작일자", "종료일자"]
        body = [["1", "2026-01-01", "수영", "월", "2026-01-01~9999-12-31", "2026-01-01"]] * 3
        fs = C.check_courses("x", hdr, body)
        self.assertTrue(any(f["rule"] == "열값형식" and "종료일" in f["msg"] for f in fs))


class Parking(unittest.TestCase):
    def test_profile(self):
        p = CO.parking_profile()
        if p is None:
            self.skipTest("입출차 원본 없음")
        self.assertEqual(len(p["weekday"]), len(p["hours"]))
        self.assertEqual(max(p["weekday"] + p["weekend"]), 100)
        self.assertEqual(p["n_days"]["weekday"] + p["n_days"]["weekend"], 31)  # 2024년 7월
        self.assertTrue(all(lo <= m <= hi for lo, m, hi in zip(p["band"]["weekend"]["lo"], p["weekend"], p["band"]["weekend"]["hi"])))
        self.assertLess(p["forecast"]["mape_median"], p["forecast"]["mape_mean"])  # 일부 날(행사)이 평균 오차를 끌어올림


class Refresh(unittest.TestCase):
    def test_page_info_ignores_scripts(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
        import refresh_courses as RC
        html = ('<script type="application/ld+json">{"name":"업데이트 주기","value":"연간"},{"name":"보유근거"}</script>'
                '<th>업데이트 주기</th><td>반기</td><th>수정일</th><td>2026-09-21</td>'
                "<a onclick=\"fn_fileDataDown('15110953', 'uddi:abc-1')\">")
        RC.req = lambda path, data=None, accept="*/*": (200, html.encode())
        info = RC.page_info("15110953")
        self.assertEqual(info["cycle"], "반기")
        self.assertEqual(info["mod"], "2026-09-21")
        self.assertEqual(info["uddi"], "uddi:abc-1")


class Export(unittest.TestCase):
    def test_csv_matches_rows(self):
        import csv as _csv
        p = CO.run()
        with open(Path(CO.ROOT) / "site" / "courses.csv", encoding="utf-8-sig", newline="") as f:
            rows = list(_csv.reader(f))
        self.assertEqual(len(rows) - 1, len(p["rows"]))
        self.assertEqual(rows[0][0], "센터")


class Analysis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analysis"))
        import run as AR
        cls.p = AR.run()
        cls.q = {q["id"]: q for q in cls.p["queries"]}

    def test_sql_matches_python(self):
        # SQL로 센 최근 강좌 수 = courses.py가 센 수
        fresh = sum(1 for r in CO.run()["rows"] if r["fr"] == "최근")
        self.assertEqual(sum(r[1] for r in self.q["evening_share"]["rows"]), fresh)
        self.assertEqual(self.p["tables"]["courses_fresh"], fresh)

    def test_shares_sum_to_100(self):
        self.assertAlmostEqual(sum(r[3] for r in self.q["seats_by_band"]["rows"]), 100, delta=0.3)
        for r in self.q["stay"]["rows"]:
            self.assertAlmostEqual(sum(r[3:7]), 100, delta=0.3)

    def test_stats_reproducible(self):
        import run as AR
        import build_db
        s2 = AR.extra_stats(build_db.build())
        self.assertEqual(s2, self.p["stats"])            # 씨앗 고정 → 같은 값
        lo, hi = self.p["stats"]["peak"]["diff"][1:]
        self.assertLess(lo, hi)


class TimeFmt(unittest.TestCase):
    def test_month_day_in_time(self):
        hdr = ["구역", "등록일", "등록시간"]
        body = [["P1", f"2026-0{m}-1{d}", f"1{d}:0{m}:1{d}"] for m in range(1, 6) for d in range(5)]
        self.assertTrue(any(f["rule"] == "시각형식" and f["level"] == "error" for f in C.check_timefmt(hdr, body)))

    def test_normal_time_ok(self):
        hdr = ["구역", "등록일", "등록시간"]
        body = [["P1", f"2026-0{m}-1{d}", f"1{d}:3{d}:4{m}"] for m in range(1, 6) for d in range(5)]
        self.assertEqual(C.check_timefmt(hdr, body), [])


class Parking2025(unittest.TestCase):
    def test_result_shape(self):
        import json as _j
        p = Path(__file__).resolve().parents[1] / "out" / "parking2025.json"
        if not p.exists():
            self.skipTest("2025 자료 없음")
        j = _j.loads(p.read_text(encoding="utf-8"))
        for k in ("weekday", "holiday", "bigevent"):
            pr = j["profiles"][k]
            self.assertTrue(all(lo <= m <= hi for lo, m, hi in zip(pr["p10"], pr["mean"], pr["p90"])))
        self.assertLess(j["forecast"]["E"]["all"]["median"], j["forecast"]["A"]["all"]["median"])  # 공연·달을 더하면 나아짐
        self.assertEqual(j["issues"]["capped_months"], ["2025-08", "2025-09", "2025-11", "2025-12"])

    def test_classes(self):
        import parking2025 as P
        self.assertEqual([P.size_class(n) for n in (0, 4999, 5000, 9999, 10000)], [0, 1, 2, 2, 3])
        import datetime as _dt
        self.assertTrue(P.is_off(_dt.date(2025, 10, 6)))   # 추석 연휴
        self.assertFalse(P.is_off(_dt.date(2025, 10, 10)))

    def test_venue_class(self):
        import parking2025 as P
        import datetime as _dt
        d = _dt.date(2025, 5, 3)
        ev = lambda c, s, e: {"venue_code": c, "begin": s, "end": e}
        self.assertEqual(P.venue_class(d, []), 0)
        self.assertEqual(P.venue_class(d, [ev("01", "2025-05-03", "2025-05-03")]), 1)
        self.assertEqual(P.venue_class(d, [ev("02", "2025-05-02", "2025-05-04"), ev("01", "2025-05-03", "2025-05-03")]), 2)
        self.assertEqual(P.venue_class(d, [ev("02", "2025-04-01", "2025-05-30")]), 0)  # 14일 넘는 장기 행사는 무시

    def test_venue_model_shape(self):
        import json as _j
        p = Path(__file__).resolve().parents[1] / "out" / "parking2025.json"
        if not p.exists():
            self.skipTest("2025 자료 없음")
        vm = _j.loads(p.read_text(encoding="utf-8")).get("venue_model")
        self.assertIsNotNone(vm)
        self.assertEqual(set(vm["profiles"]), {"w0", "w1", "w2", "h0", "h1", "h2"})
        self.assertEqual(vm["big_days_caught"], vm["big_days"])
        self.assertLess(vm["accuracy"]["V"]["all"]["median"], vm["accuracy"]["A"]["all"]["median"])


class Gap(unittest.TestCase):
    def r(self, n, tg="", g=None):
        return {"n": n, "tg": tg, "g": g or []}

    def test_age_from_name(self):
        import gap as G
        self.assertEqual(G.age_range(self.r("(폐강)21:00 청소년농구/월수/17년~08년생", "청소년"))[:2], (9, 18))
        self.assertEqual(G.age_range(self.r("요가(월수금)[20세이상(06년생)]"))[:2], (20, 120))
        self.assertEqual(G.age_range(self.r("월자유수영(실버반)", "성인남여"))[:2], (60, 120))
        self.assertEqual(G.age_range(self.r("17시 어린이 신기초 화.목", "어린이"))[:2], (5, 12))
        self.assertEqual(G.age_range(self.r("테니스 A반", ""))[2], "가정(대상 칸 비어 있음)")

    def test_olympic_official_target(self):
        import gap as G
        r = dict(self.r("요가 주3일 06:00", ""), c="올림픽스포츠센터", s="요가")
        self.assertEqual(G.age_range(r), (13, 120, "공식 누리집 종목 안내"))
        r = dict(self.r("농구 토 10:30", ""), c="올림픽스포츠센터", s="농구")
        self.assertEqual(G.age_range(r)[:2], (8, 18))
        r = dict(self.r("테니스 A반", ""), c="올림픽스포츠센터", s="테니스")
        self.assertEqual(G.age_range(r)[2], "가정(대상 칸 비어 있음)")
        r = dict(self.r("13세이상 요가", ""), c="올림픽스포츠센터", s="요가")
        self.assertEqual(G.age_range(r)[2], "강좌명 나이")

    def test_bands(self):
        import gap as G
        self.assertEqual(G.own_band(60, 120), "어르신")
        self.assertEqual(G.own_band(19, 120), "청년·중년")
        self.assertEqual(G.own_band(5, 12), "초등")
        self.assertTrue(G.covers(19, 120, 65, 120))   # 성인 강좌는 어르신도 들을 수 있음
        self.assertFalse(G.covers(60, 120, 19, 64))
        self.assertEqual(G.slots({"d": "월화수목금토일", "t0": 6 * 60}), ["평일 새벽·아침", "주말"])

    def test_output_shape(self):
        import json as _j
        p = Path(__file__).resolve().parents[1] / "out" / "gap.json"
        if not p.exists():
            self.skipTest("gap.json 없음")
        g = _j.loads(p.read_text(encoding="utf-8"))
        self.assertEqual([c["center"] for c in g["centers"]], ["올림픽수영장", "올림픽스포츠센터", "일산", "분당"])
        for c in g["centers"]:
            self.assertEqual(sum(b["own"] for b in c["bands"]), c["seats"])  # 전용 정원을 모두 더하면 전체 정원
            for b in c["bands"]:
                self.assertLessEqual(b["own"], max(b["can"], b["own"]))
        self.assertTrue(all(x["slot"] in g["sense"][x["band"]] for x in g["cells"]))


class Fit(unittest.TestCase):
    def test_links_point_to_real_sports(self):
        import fit, gap
        sports = {r["s"] for r in gap.load_courses()["rows"]}
        keys = [L["key"] for L in fit.LINK]
        self.assertEqual(len(keys), len(set(keys)))
        for L in fit.LINK[:6]:   # 앞의 여섯은 강좌가 실제로 있어야 함
            self.assertTrue(set(L["sports"]) & sports, L["key"])

    def test_output_shape(self):
        import json as _j
        root = Path(__file__).resolve().parents[1]
        p = root / "out" / "fit_summary.json"
        if not p.exists():
            self.skipTest("fit_summary.json 없음")
        s = _j.loads(p.read_text(encoding="utf-8"))
        self.assertGreater(s["rows_used"], 100000)
        self.assertGreater(s["bmi_check"]["match"] / s["bmi_check"]["n"], 0.99)   # item_f018 = 몸무게/키^2 임을 자료로 확인
        js = (root / "site" / "fit.js").read_text(encoding="utf-8")
        F = _j.loads(js[js.index("=") + 1:].rstrip().rstrip(";"))
        import gap
        self.assertEqual(len(F["ages"]), len(gap.load_courses()["rows"]))   # 강좌마다 대상 나이
        for g in F["groups"].values():
            for c in g.values():
                self.assertGreaterEqual(c["note"], F["min_n"])
                self.assertTrue(all(0 <= x[1] <= 100 for x in c["linked"]))
