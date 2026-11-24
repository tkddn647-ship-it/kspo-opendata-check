-- @id evening_share
-- @title 센터마다 '퇴근 후' 강좌는 얼마나 되나
-- @question 평일 19시 이후에 시작하는 강좌와 주말 강좌가 센터별로 몇 개, 몇 %인가
SELECT center AS 센터,
       COUNT(*) AS 최근강좌,
       SUM(start_hour >= 19 AND days GLOB '*[월화수목금]*') AS 평일19시이후,
       ROUND(100.0 * SUM(start_hour >= 19 AND days GLOB '*[월화수목금]*') / COUNT(*), 1) AS 비율_pct,
       SUM(days GLOB '*[토일]*') AS 주말,
       ROUND(100.0 * SUM(days GLOB '*[토일]*') / COUNT(*), 1) AS 주말비율_pct
FROM courses_fresh
GROUP BY center
ORDER BY 비율_pct DESC;

-- @id seats_by_band
-- @title 정원(자리)은 어느 시간대에 몰려 있나
-- @question 시작 시각대별 강좌 수와 정원 합계, 전체 정원에서 차지하는 비율
WITH b AS (
  SELECT CASE WHEN start_hour < 9 THEN '1 새벽·아침 (6~8시)'
              WHEN start_hour < 12 THEN '2 오전 (9~11시)'
              WHEN start_hour < 18 THEN '3 오후 (12~17시)'
              WHEN start_hour < 19 THEN '4 저녁 (18시)'
              ELSE '5 퇴근 후 (19~21시)' END AS 시간대, capacity
  FROM courses_fresh WHERE start_hour IS NOT NULL AND capacity IS NOT NULL)
SELECT 시간대, COUNT(*) AS 강좌수, SUM(capacity) AS 정원합계,
       ROUND(100.0 * SUM(capacity) / SUM(SUM(capacity)) OVER (), 1) AS 정원비율_pct
FROM b GROUP BY 시간대 ORDER BY 시간대;

-- @id fee_median
-- @title 같은 종목, 센터마다 1회 강습비는 얼마나 다른가
-- @question 종목·센터별 1회 환산 강습비(추정)의 중앙값과 사분위 범위 (강좌 10개 이상인 조합)
WITH r AS (
  SELECT sport, center, fee_per_session AS v,
         ROW_NUMBER() OVER (PARTITION BY sport, center ORDER BY fee_per_session) AS rn,
         COUNT(*) OVER (PARTITION BY sport, center) AS n
  FROM courses_fresh WHERE fee_per_session IS NOT NULL)
SELECT sport AS 종목, center AS 센터, n AS 강좌수,
       MAX(CASE WHEN rn = (n + 3) / 4 THEN v END) AS 하위25pct,
       MAX(CASE WHEN rn = (n + 1) / 2 THEN v END) AS 중앙값,
       MAX(CASE WHEN rn = (3 * n + 3) / 4 THEN v END) AS 상위25pct
FROM r WHERE n >= 10
GROUP BY sport, center
HAVING sport IN (SELECT sport FROM r WHERE n >= 10 GROUP BY sport HAVING COUNT(DISTINCT center) >= 2)
ORDER BY sport, 중앙값;

-- @id stay
-- @title 올림픽공원에 온 차는 얼마나 머무나
-- @question 평일·주말별 머문 시간의 중앙값과 구간별 비율 (2024년 7월)
WITH r AS (
  SELECT daytype, stay_min,
         ROW_NUMBER() OVER (PARTITION BY daytype ORDER BY stay_min) AS rn,
         COUNT(*) OVER (PARTITION BY daytype) AS n
  FROM parking)
SELECT daytype AS 구분, n AS 입차건수,
       MAX(CASE WHEN rn = (n + 1) / 2 THEN stay_min END) AS 중앙값_분,
       ROUND(100.0 * SUM(stay_min < 10) / n, 1) AS "10분미만_pct",
       ROUND(100.0 * SUM(stay_min BETWEEN 10 AND 119) / n, 1) AS "10분~2시간_pct",
       ROUND(100.0 * SUM(stay_min BETWEEN 120 AND 359) / n, 1) AS "2~6시간_pct",
       ROUND(100.0 * SUM(stay_min >= 360) / n, 1) AS "6시간이상_pct"
FROM r GROUP BY daytype;

-- @id inflow
-- @title 차는 몇 시에 들어오나
-- @question 평일·주말별 시각당 하루 평균 입차 대수 (10분 미만 통과 차량 제외)
WITH days AS (SELECT daytype, COUNT(DISTINCT d) AS nd FROM parking GROUP BY daytype)
SELECT p.in_hour AS 시,
       ROUND(1.0 * SUM(p.daytype = '평일') / (SELECT nd FROM days WHERE daytype = '평일')) AS 평일_평균입차,
       ROUND(1.0 * SUM(p.daytype = '주말') / (SELECT nd FROM days WHERE daytype = '주말')) AS 주말_평균입차
FROM parking p WHERE p.stay_min >= 10 AND p.in_hour BETWEEN 6 AND 21
GROUP BY p.in_hour ORDER BY p.in_hour;

-- @id daily_peak
-- @title 날마다 가장 붐빈 순간은 몇 대였나
-- @question 30분 간격으로 주차장에 있던 차량 수를 세어, 날짜별 최고값 상위 5일과 하위 5일
WITH RECURSIVE slot(t) AS (
  SELECT '2024-07-01 06:00' UNION ALL
  SELECT strftime('%Y-%m-%d %H:%M', t, '+30 minutes') FROM slot WHERE t < '2024-07-31 22:00'),
occ AS (
  SELECT s.t, COUNT(p.in_at) AS cars
  FROM slot s LEFT JOIN parking p ON p.in_at <= s.t AND p.out_at > s.t AND p.in_at >= strftime('%Y-%m-%d %H:%M', s.t, '-2 days')
  WHERE CAST(substr(s.t, 12, 2) AS INTEGER) BETWEEN 6 AND 22
  GROUP BY s.t),
peak AS (
  SELECT date(t) AS 날짜, MAX(cars) AS 최고대수 FROM occ GROUP BY date(t)),
ranked AS (
  SELECT *, RANK() OVER (ORDER BY 최고대수 DESC) AS hi, RANK() OVER (ORDER BY 최고대수) AS lo FROM peak)
SELECT 날짜, substr('일월화수목금토', strftime('%w', 날짜) + 1, 1) AS 요일, 최고대수,
       ROUND(1.0 * 최고대수 / (SELECT AVG(최고대수) FROM peak), 2) AS 평균대비
FROM ranked WHERE hi <= 5 OR lo <= 5 ORDER BY 최고대수 DESC;

-- @id faq
-- @title 시민은 무엇을 가장 많이 묻나
-- @question 기관 '자주 묻는 질문' 49건을 주제어로 나눈 건수
SELECT 주제, COUNT(*) AS 건수, ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM faq), 1) AS 비율_pct FROM (
  SELECT CASE WHEN title || body LIKE '%주차%' THEN '주차'
              WHEN title || body LIKE '%대관%' OR title || body LIKE '%예약%' THEN '대관·예약'
              WHEN title || body LIKE '%수강%' OR title || body LIKE '%강좌%' OR title || body LIKE '%강습%' THEN '강좌·수강'
              ELSE '그 밖(시설·행사·이용 안내 등)' END AS 주제 FROM faq)
GROUP BY 주제 ORDER BY 건수 DESC;

-- @id zone_full
-- @title 붐비는 날, 어느 주차구역이 먼저 차나
-- @question 혼잡도 기록이 있는 날 가운데 구역별로 '만차'가 된 날의 비율과, 그날 처음 만차가 된 시(時)의 중앙값
WITH daily AS (
  SELECT zone, d, MIN(CASE WHEN status = '만차' THEN hour END) AS first_full FROM parking_zone GROUP BY zone, d),
tot AS (SELECT zone, COUNT(*) AS n_days, COUNT(first_full) AS n_full FROM daily GROUP BY zone),
r AS (
  SELECT zone, first_full, ROW_NUMBER() OVER (PARTITION BY zone ORDER BY first_full) AS rn
  FROM daily WHERE first_full IS NOT NULL)
SELECT t.zone AS 구역, t.n_days AS 기록있는날, t.n_full AS 만차된날,
       ROUND(100.0 * t.n_full / t.n_days, 1) AS 만차비율_pct,
       MAX(CASE WHEN r.rn = (t.n_full + 1) / 2 THEN r.first_full END) AS 처음만차_시_중앙값
FROM tot t JOIN r ON r.zone = t.zone
WHERE t.n_days >= 20
GROUP BY t.zone
ORDER BY 만차비율_pct, 처음만차_시_중앙값 DESC;
