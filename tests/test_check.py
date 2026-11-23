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

    def test_row_count_mismatch(self):
        self.write("e", "일련번호\n1\n")
        r = self.rules(C.check_file("e", {"rows": "5", "cycle": "연간"}, {"desc": ""}, REF))
        self.assertEqual(r.get("행수"), "warn")


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
