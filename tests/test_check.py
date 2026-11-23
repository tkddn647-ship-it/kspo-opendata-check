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
