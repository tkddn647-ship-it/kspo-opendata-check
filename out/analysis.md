# 분석 결과 (자동 생성: python analysis/run.py)

## 센터마다 '퇴근 후' 강좌는 얼마나 되나

질문: 평일 19시 이후에 시작하는 강좌와 주말 강좌가 센터별로 몇 개, 몇 %인가

```sql
SELECT center AS 센터,
       COUNT(*) AS 최근강좌,
       SUM(start_hour >= 19 AND days GLOB '*[월화수목금]*') AS 평일19시이후,
       ROUND(100.0 * SUM(start_hour >= 19 AND days GLOB '*[월화수목금]*') / COUNT(*), 1) AS 비율_pct,
       SUM(days GLOB '*[토일]*') AS 주말,
       ROUND(100.0 * SUM(days GLOB '*[토일]*') / COUNT(*), 1) AS 주말비율_pct
FROM courses_fresh
GROUP BY center
ORDER BY 비율_pct DESC;
```

| 센터 | 최근강좌 | 평일19시이후 | 비율_pct | 주말 | 주말비율_pct |
|---|---|---|---|---|---|
| 올림픽수영장 | 283 | 75 | 26.5 | 4 | 1.4 |
| 일산 | 373 | 71 | 19.0 | 178 | 47.7 |
| 분당 | 255 | 34 | 13.3 | 47 | 18.4 |
| 올림픽스포츠센터 | 380 | 48 | 12.6 | 137 | 36.1 |

## 정원(자리)은 어느 시간대에 몰려 있나

질문: 시작 시각대별 강좌 수와 정원 합계, 전체 정원에서 차지하는 비율

```sql
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
```

| 시간대 | 강좌수 | 정원합계 | 정원비율_pct |
|---|---|---|---|
| 1 새벽·아침 (6~8시) | 202 | 7337 | 23.9 |
| 2 오전 (9~11시) | 388 | 8392 | 27.4 |
| 3 오후 (12~17시) | 407 | 8337 | 27.2 |
| 4 저녁 (18시) | 62 | 1271 | 4.1 |
| 5 퇴근 후 (19~21시) | 232 | 5318 | 17.3 |

## 같은 종목, 센터마다 1회 강습비는 얼마나 다른가

질문: 종목·센터별 1회 환산 강습비(추정)의 중앙값과 사분위 범위 (강좌 10개 이상인 조합)

```sql
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
```

| 종목 | 센터 | 강좌수 | 하위25pct | 중앙값 | 상위25pct |
|---|---|---|---|---|---|
| TRX | 일산 | 12 | 11500 | 11500 | 12300 |
| TRX | 올림픽수영장 | 12 | 12300 | 12300 | 12700 |
| 골프 | 일산 | 41 | 5900 | 6600 | 19900 |
| 골프 | 올림픽스포츠센터 | 67 | 9600 | 11500 | 16100 |
| 수영 | 올림픽수영장 | 152 | 4200 | 4400 | 4400 |
| 수영 | 일산 | 97 | 3300 | 4600 | 5100 |
| 수영 | 분당 | 83 | 4100 | 5000 | 6000 |

## 올림픽공원에 온 차는 얼마나 머무나

질문: 평일·주말별 머문 시간의 중앙값과 구간별 비율 (2024년 7월)

```sql
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
```

| 구분 | 입차건수 | 중앙값_분 | 10분미만_pct | 10분~2시간_pct | 2~6시간_pct | 6시간이상_pct |
|---|---|---|---|---|---|---|
| 주말 | 49292 | 68 | 27.8 | 39.9 | 26.8 | 5.6 |
| 평일 | 144285 | 87 | 24.1 | 44.9 | 28.4 | 2.6 |

## 차는 몇 시에 들어오나

질문: 평일·주말별 시각당 하루 평균 입차 대수 (10분 미만 통과 차량 제외)

```sql
WITH days AS (SELECT daytype, COUNT(DISTINCT d) AS nd FROM parking GROUP BY daytype)
SELECT p.in_hour AS 시,
       ROUND(1.0 * SUM(p.daytype = '평일') / (SELECT nd FROM days WHERE daytype = '평일')) AS 평일_평균입차,
       ROUND(1.0 * SUM(p.daytype = '주말') / (SELECT nd FROM days WHERE daytype = '주말')) AS 주말_평균입차
FROM parking p WHERE p.stay_min >= 10 AND p.in_hour BETWEEN 6 AND 21
GROUP BY p.in_hour ORDER BY p.in_hour;
```

| 시 | 평일_평균입차 | 주말_평균입차 |
|---|---|---|
| 6 | 302.0 | 77.0 |
| 7 | 175.0 | 118.0 |
| 8 | 466.0 | 315.0 |
| 9 | 393.0 | 379.0 |
| 10 | 372.0 | 442.0 |
| 11 | 189.0 | 312.0 |
| 12 | 227.0 | 295.0 |
| 13 | 349.0 | 436.0 |
| 14 | 259.0 | 391.0 |
| 15 | 243.0 | 446.0 |
| 16 | 222.0 | 441.0 |
| 17 | 276.0 | 221.0 |
| 18 | 276.0 | 159.0 |
| 19 | 309.0 | 138.0 |
| 20 | 269.0 | 126.0 |
| 21 | 59.0 | 62.0 |

## 날마다 가장 붐빈 순간은 몇 대였나

질문: 30분 간격으로 주차장에 있던 차량 수를 세어, 날짜별 최고값 상위 5일과 하위 5일

```sql
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
```

| 날짜 | 요일 | 최고대수 | 평균대비 |
|---|---|---|---|
| 2024-07-21 | 일 | 2109 | 2.06 |
| 2024-07-20 | 토 | 1882 | 1.84 |
| 2024-07-28 | 일 | 1133 | 1.11 |
| 2024-07-13 | 토 | 1053 | 1.03 |
| 2024-07-31 | 수 | 1042 | 1.02 |
| 2024-07-23 | 화 | 887 | 0.87 |
| 2024-07-18 | 목 | 884 | 0.86 |
| 2024-07-07 | 일 | 876 | 0.86 |
| 2024-07-29 | 월 | 874 | 0.85 |
| 2024-07-14 | 일 | 851 | 0.83 |

## 시민은 무엇을 가장 많이 묻나

질문: 기관 '자주 묻는 질문' 49건을 주제어로 나눈 건수

```sql
SELECT 주제, COUNT(*) AS 건수, ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM faq), 1) AS 비율_pct FROM (
  SELECT CASE WHEN title || body LIKE '%주차%' THEN '주차'
              WHEN title || body LIKE '%대관%' OR title || body LIKE '%예약%' THEN '대관·예약'
              WHEN title || body LIKE '%수강%' OR title || body LIKE '%강좌%' OR title || body LIKE '%강습%' THEN '강좌·수강'
              ELSE '그 밖(시설·행사·이용 안내 등)' END AS 주제 FROM faq)
GROUP BY 주제 ORDER BY 건수 DESC;
```

| 주제 | 건수 | 비율_pct |
|---|---|---|
| 그 밖(시설·행사·이용 안내 등) | 34 | 69.4 |
| 주차 | 10 | 20.4 |
| 대관·예약 | 5 | 10.2 |

## 붐비는 날, 어느 주차구역이 먼저 차나

질문: 혼잡도 기록이 있는 날 가운데 구역별로 '만차'가 된 날의 비율과, 그날 처음 만차가 된 시(時)의 중앙값

```sql
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
```

| 구역 | 기록있는날 | 만차된날 | 만차비율_pct | 처음만차_시_중앙값 |
|---|---|---|---|---|
| P1B | 53 | 21 | 39.6 | 14 |
| P1A | 45 | 18 | 40.0 | 14 |
| P10 | 28 | 12 | 42.9 | 14 |
| P9 | 41 | 19 | 46.3 | 14 |
| P2 | 55 | 26 | 47.3 | 14 |
| P4 | 57 | 31 | 54.4 | 13 |
| P8 | 45 | 25 | 55.6 | 14 |
| P5 | 57 | 32 | 56.1 | 13 |
| P6 | 61 | 35 | 57.4 | 13 |
| P7 | 28 | 17 | 60.7 | 13 |
| P11 | 44 | 27 | 61.4 | 14 |

## 2025 입출차 기록은 1년치가 다 있나

질문: 달별 기록 수, 기록이 있는 날 수, 하루 평균 기록 수, 그 달 마지막 날 기록 유무

```sql
WITH m AS (
  SELECT substr(in_at, 1, 7) AS 월, COUNT(*) AS 기록수, COUNT(DISTINCT substr(in_at, 1, 10)) AS 기록있는날,
         MAX(substr(in_at, 1, 10)) AS 마지막기록일
  FROM inout2025 WHERE in_at LIKE '2025-%' GROUP BY 1)
SELECT 월, 기록수, 기록있는날, CAST(ROUND(1.0 * 기록수 / 기록있는날) AS INTEGER) AS 하루평균,
       마지막기록일,
       CASE WHEN 마지막기록일 = date(월 || '-01', '+1 month', '-1 day') THEN '있음' ELSE '없음' END AS 말일기록
FROM m ORDER BY 월;
```

| 월 | 기록수 | 기록있는날 | 하루평균 | 마지막기록일 | 말일기록 |
|---|---|---|---|---|---|
| 2025-01 | 188895 | 30 | 6297 | 2025-01-30 | 없음 |
| 2025-02 | 239885 | 27 | 8885 | 2025-02-27 | 없음 |
| 2025-03 | 268051 | 30 | 8935 | 2025-03-30 | 없음 |
| 2025-04 | 291217 | 29 | 10042 | 2025-04-29 | 없음 |
| 2025-05 | 304213 | 30 | 10140 | 2025-05-30 | 없음 |
| 2025-06 | 280427 | 29 | 9670 | 2025-06-29 | 없음 |
| 2025-07 | 297554 | 30 | 9918 | 2025-07-30 | 없음 |
| 2025-08 | 65534 | 30 | 2184 | 2025-08-30 | 없음 |
| 2025-09 | 65534 | 29 | 2260 | 2025-09-29 | 없음 |
| 2025-10 | 278847 | 30 | 9295 | 2025-10-30 | 없음 |
| 2025-11 | 65534 | 7 | 9362 | 2025-11-07 | 없음 |
| 2025-12 | 65534 | 7 | 9362 | 2025-12-07 | 없음 |

## 어느 문으로 들어오나 — 평일과 휴일

질문: 2025년 기록이 온전한 달의 입구별 입차 비율 (10분 미만 통과 차량 제외), 토·일 기준

```sql
WITH c AS (
  SELECT substr(in_gate, 1, instr(in_gate, '입구') - 1) AS 입구,
         CASE WHEN strftime('%w', in_at) IN ('0','6') THEN '토·일' ELSE '평일' END AS 구분
  FROM inout2025
  WHERE substr(in_at, 1, 7) IN ('2025-01','2025-02','2025-03','2025-04','2025-05','2025-06','2025-07','2025-10')
    AND julianday(out_at) - julianday(in_at) >= 10.0 / 1440)
SELECT 입구,
       ROUND(100.0 * SUM(구분 = '평일') / (SELECT COUNT(*) FROM c WHERE 구분 = '평일'), 1) AS 평일_pct,
       ROUND(100.0 * SUM(구분 = '토·일') / (SELECT COUNT(*) FROM c WHERE 구분 = '토·일'), 1) AS 토일_pct,
       COUNT(*) AS 입차수
FROM c GROUP BY 입구 ORDER BY 입차수 DESC;
```

| 입구 | 평일_pct | 토일_pct | 입차수 |
|---|---|---|---|
| 북2문 | 33.3 | 31.6 | 526649 |
| 동2문 | 27.2 | 30.1 | 448682 |
| 남2문 | 16.8 | 18.5 | 276294 |
| 서2문 | 12.5 | 6.5 | 173172 |
| 남4문 | 4.6 | 6.4 | 81572 |
| 서1문 | 2.6 | 3.3 | 45226 |
| 남3문 | 2.6 | 3.0 | 43740 |
|  | 0.4 | 0.5 | 6974 |
| 회관 임원  | 0.0 | 0.0 | 21 |

## 통계

```json
{
 "corr": {
  "hours": [
   6,
   7,
   8,
   9,
   10,
   11,
   12,
   13,
   14,
   15,
   16,
   17,
   18,
   19,
   20,
   21
  ],
  "seats": [
   2956,
   800,
   157,
   1224,
   1273,
   1261,
   390,
   505,
   963,
   449,
   874,
   648,
   544,
   919,
   1029,
   905
  ],
  "arrivals": [
   279,
   221,
   127,
   353,
   249,
   243,
   121,
   166,
   224,
   155,
   170,
   161,
   194,
   194,
   200,
   163
  ],
  "r": 0.68,
  "p": 0.011,
  "n": 16,
  "r_excl6": 0.79,
  "p_excl6": 0.0
 },
 "peak": {
  "weekday_mean": 952,
  "weekday_sd": 44,
  "n_weekday": 23,
  "weekend_mean": 1228,
  "weekend_sd": 487,
  "n_weekend": 8,
  "diff": [
   275,
   -7,
   626
  ],
  "diff_excl_event": [
   19,
   -59,
   104
  ],
  "weekend_mean_excl": 972,
  "n_weekend_excl": 6
 }
}
```