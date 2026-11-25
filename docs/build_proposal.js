// 기획서(.docx) 생성: node docs/build_proposal.js <findings.json> <출력.docx> [courses_summary.json]
// 표의 숫자와 목록은 점검 결과 파일(findings.json)에서 그대로 가져온다.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType,
  HeadingLevel, WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, Footer, PageNumber,
} = require("docx");

const R = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const OUT = process.argv[3];
const K = JSON.parse(fs.readFileSync(process.argv[4] || path.join(__dirname, "..", "out", "courses_summary.json"), "utf8"));
const IMG = (n) => fs.readFileSync(path.join(__dirname, "img", n));
const SITE = "https://tkddn647-ship-it.github.io/kspo-opendata-check/";
const REPO = "https://github.com/tkddn647-ship-it/kspo-opendata-check";

const FONT = "맑은 고딕";
const W = 9638; // A4 본문 폭 (여백 각 2cm)
const C = { ink: "1B2623", ok: "2F6B4F", warn: "A86A12", bad: "B4321F", head: "EEF3F1", line: "C9D3CF" };

const t = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const P = (runs, o = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [t(runs)], spacing: { after: 100, line: 300 }, ...o });
const H1 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_1, shading: { type: ShadingType.CLEAR, fill: "1F3864", color: "auto" }, children: [t(" " + s, { color: "FFFFFF" })] });
const H2 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_2, shading: { type: ShadingType.CLEAR, fill: "E7E6E6", color: "auto" }, children: [t(" " + s)] });
const H3 = (s) => new Paragraph({ spacing: { before: 180, after: 80 }, keepNext: true, children: [t("○ " + s, { bold: true, size: 21 })] });
const B = (runs, lvl = 0) => new Paragraph({ numbering: { reference: "dot", level: lvl }, children: Array.isArray(runs) ? runs : [t(runs)], spacing: { after: 60, line: 288 } });
const img = (n, w, h, cap) => [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, keepNext: true, keepLines: true,
    children: [new ImageRun({ type: "png", data: IMG(n), transformation: { width: w, height: h } })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [t(cap, { size: 17, color: "5A6A66" })] }),
];
const border = { style: BorderStyle.SINGLE, size: 4, color: C.line };
const borders = { top: border, bottom: border, left: border, right: border };
function table(cols, rows, o = {}) {
  const total = cols.reduce((a, c) => a + c.w, 0);
  const cell = (txt, w, head, color, bold) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders,
    shading: head ? { type: ShadingType.CLEAR, fill: C.head, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: String(txt).split("\n").map((line) => new Paragraph({ spacing: { after: 0, line: 260 },
      children: [t(line, { size: o.size || 18, bold: head || bold, color: color || C.ink })] })),
  });
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: cols.map((c) => c.w),
    rows: [
      new TableRow({ tableHeader: true, children: cols.map((c) => cell(c.h, c.w, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((v, i) => {
        const val = typeof v === "object" ? v : { v };
        return cell(val.v, cols[i].w, false, val.color, val.bold);
      }) })),
    ],
  });
}
const gradeColor = { "점검 필요": C.bad, "주의": C.warn, "양호": C.ok };
const gradeMark = { "점검 필요": "! 점검 필요", "주의": "△ 주의", "양호": "✓ 양호" };

// ---- 숫자 ----
const g = R.grades, N = R.datasets.length;
const files = R.datasets.filter((d) => d.kind === "파일");
const apis = R.datasets.filter((d) => d.kind === "API");
const flagged = R.datasets.filter((d) => d.grade !== "양호");
const typo = R.datasets.reduce((a, d) => a + d.findings.filter((f) => f.rule === "오탈자").length, 0);
const orgMain = R.org.filter((f) => f.level !== "info");
const find = (id, rule) => (R.datasets.find((d) => d.id === id)?.findings || []).find((f) => f.rule === rule);
const lv = { error: "점검 필요", warn: "주의", info: "참고" };

// ---- 강좌 숫자 (out/courses_summary.json) ----
const S = K.summary, KC = S.centers;
const fresh = S.total - S.stale;
const cName = (n) => K.centers.find((c) => c.name === n).full;
const swim = K.centers.filter((c) => KC[c.name].swim_per_median).map((c) => `${c.name} 약 ${KC[c.name].swim_per_median.toLocaleString()}원`).join(", ");
const osc = KC["올림픽스포츠센터"];
const nf = (x) => x.toLocaleString();
const SC = S.scenarios, PK = K.parking;
const P5 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "parking2025.json"), "utf8")), PR5 = P5.profiles, FA5 = P5.forecast.A, FE5 = P5.forecast.E;
const VM = P5.venue_model, VA = VM.accuracy.A, VV = VM.accuracy.V;
const EVS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "raw", "events.json"), "utf8"));
const pk = (k, h) => PK[k][PK.hours.indexOf(h)];
const pkMaxH = (k) => PK.hours[PK[k].indexOf(Math.max(...PK[k]))];
const FAQ = S.faq;
const evePct = Math.round(SC["직장인_4곳_19시이후"] / SC["최근"] * 100);
const AN = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "site", "analysis.js"), "utf8").replace(/^window\.ANALYSIS=/, "").replace(/;\s*$/, ""));
const AQ = Object.fromEntries(AN.queries.map((q) => [q.id, q])), AS = AN.stats;
const stayWd = AQ.stay.rows.find((r) => r[0] === "평일"), seatEve = AQ.seats_by_band.rows.find((r) => r[0].startsWith("5"));
const N_PAGES = 94; // 스포츠센터 강좌 정보(15147992)의 공식 안내 페이지 링크 수

// ---- 강좌 공백 지도 (out/gap.json) ----
const GP = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "gap.json"), "utf8"));
const AREAS = { "올림픽공원 2곳": ["올림픽수영장", "올림픽스포츠센터"], "일산": ["일산"], "분당": ["분당"] };
function area(a) {
  const cs = GP.centers.filter((c) => AREAS[a].includes(c.center));
  const tot = cs.reduce((t, c) => t + c.seats, 0);
  const band = (name) => {
    const xs = cs.map((c) => c.bands.find((b) => b.band === name));
    const sl = (k) => Object.fromEntries(GP.slots.map((s) => [s, xs.reduce((t, x) => t + x[k][s], 0)]));
    return { pop: xs[0].pop, pop_share: xs[0].pop_share, own: xs.reduce((t, x) => t + x.own, 0), can: xs.reduce((t, x) => t + x.can, 0), own_slots: sl("own_slots"), can_slots: sl("can_slots") };
  };
  return { tot, band, label: cs[0].area };
}
const AR = Object.fromEntries(Object.keys(AREAS).map((a) => [a, area(a)]));
const pct = (x, y) => (x / y * 100).toFixed(1);
const adultSplit = (a) => { const b = AR[a].band("청년·중년"), t = Object.values(b.own_slots).reduce((x, y) => x + y, 0); return { day: Math.round(b.own_slots["평일 낮"] / t * 100), eve: Math.round(b.own_slots["평일 저녁"] / t * 100) }; };
const fromName = Object.entries(GP.basis).filter(([k]) => /강좌명/.test(k)).reduce((a, [, v]) => a + v, 0);
const assumed = Object.entries(GP.basis).filter(([k]) => /가정/.test(k)).reduce((a, [, v]) => a + v, 0);
const SR = (a) => AR[a].band("어르신"), KID = (a) => AR[a].band("유아"), EL = (a) => AR[a].band("초등"), TEEN = (a) => AR[a].band("중고생");
const OP = "올림픽공원 2곳";
const GAPURL = SITE + "gap.html";

// ---- 체력 맞춤 강좌 (out/fit_summary.json) ----
const FT = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "fit_summary.json"), "utf8"));
const FS = (st, key) => (FT.stages[st].linked.find((x) => x[0] === key) || [key, 0, 0])[1];
const SUP = (st, ar, key) => FT.supply.find((x) => x.stage === st && x.area === ar && x.key === key);
const LK = Object.fromEntries(FT.links.map((l) => [l.key, l]));
const man = (n) => (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
const N_EX = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "nfa_agg.json"), "utf8")).exercises).length;
const SPB = (k) => FT.spread.bmi[k];
const FITURL = SITE + "fit.html";
const period = `${FT.months[0].slice(0, 4)}년 ${+FT.months[0].slice(4)}월~${FT.months[1].slice(0, 4)}년 ${+FT.months[1].slice(4)}월`;

// ---- 요약서 ----
const summary = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t("2026년도 공공데이터 활용 경진대회", { size: 22, color: "5A6A66" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t("기획 요약서", { size: 36, bold: true })] }),
  table([{ h: "항목", w: 2000 }, { h: "내용", w: W - 2000 }], [
    [{ v: "1. 활용사례명", bold: true }, "내 체력에 맞는 강좌: 국민체력100 운동처방 기록을 한국체육산업개발 스포츠센터 4곳의 강좌로 잇는 서비스"],
    [{ v: "2. 사용한 공공데이터명", bold: true }, `한국체육산업개발: 올림픽수영장·올림픽스포츠센터·일산스포츠센터·분당스포츠센터 강좌정보, 스포츠센터 강좌 정보(안내 링크)\n국민체육진흥공단: 국민체력100 체력인증센터 측정결과 정보(운동처방 포함), 국민체력100 동영상 정보\n행정안전부: 지역별(행정동) 성별 연령별 주민등록 인구수 / 그 밖: 2025 국민생활체육조사, 기관 개방 데이터 ${N}종 점검`],
    [{ v: "3. 요약", bold: true }, `[문제] 국민체력100에서 체력을 재면 건강운동관리사가 운동을 처방해 주지만, 그 운동을 어디서 배울지는 각자 찾아야 합니다. 스포츠센터 강좌는 센터·종목별로 흩어져 있고, 내 나이가 들을 수 있는 강좌인지는 강좌명을 하나씩 읽어야 압니다.\n[해결] ① ${period}에 측정한 ${nf(FT.rows_used)}명의 처방 기록을 나이대·성별·등급별로 모아, 나와 같은 조건의 사람들이 실제로 처방받은 운동을 비율로 보여 줍니다  ② 그 운동 가운데 센터 4곳에 강좌가 있는 것은 내 나이가 들을 수 있는 강좌만 골라 시간·센터별로 보여 주고, 강좌가 없는 운동은 국민체력100 영상으로 잇습니다  ③ 같은 자료를 기관용으로 돌려, 처방은 많은데 강좌 정원이 적은 연령대·시간대·종목을 '강좌 공백 지도'로 보여 줍니다\n[발견] 어르신 측정자의 ${FS("어르신", "아쿠아로빅")}%가 아쿠아로빅(물속 걷기 포함)을, ${FS("어르신", "자전거")}%가 자전거 운동을 처방받았습니다. 일산 센터에는 자전거 강좌가 없고, 달리기는 성인의 ${FS("성인", "달리기")}%가 처방받았지만 강좌는 올림픽수영장의 러닝크루 ${LK["달리기"].courses}개뿐입니다.`],
    [{ v: "4. 기대효과", bold: true }, `① 시민: 측정으로 끝나던 체력 관리가 가까운 공공 강좌 등록으로 이어짐. 측정을 안 해 본 사람은 같은 나이대의 처방을 보고 체력인증센터(올림픽공원 안 송파 센터 포함) 예약으로 연결\n② 기관: 국민체력100 측정자를 센터 강좌로 끌어오는 경로가 생기고, 처방 수요에 비해 강좌가 적은 칸을 편성 회의 자료(CSV)로 받음\n③ 모회사인 국민체육진흥공단의 데이터와 기관 데이터를 이은 첫 활용 사례\n④ 서버 없는 웹페이지라 운영비 0원, 수상 시 기관 계정으로 이관해 2028년까지 운영`],
  ], { size: 19 }),
  ...img("summary_fit.png", 600, 358, "그림 1. 68세 여성을 넣은 화면. 같은 조건 측정자의 처방 비율과 그 나이가 들을 수 있는 강좌. QR은 서비스 첫 화면(위쪽 메뉴의 '체력 맞춤 강좌')"),
];

// ---- 상세 ----
const centerRows = K.centers.map((c) => { const v = KC[c.name]; return [c.full, nf(v.n), { v: nf(v.stale), color: v.stale / v.n > 0.2 ? C.warn : C.ink, bold: v.stale / v.n > 0.2 }, String(v.evening), String(v.weekend), String(v.kids), String(v.senior), v.swim_per_median ? `${nf(v.swim_per_median)}원` : "-", c.data_month]; });

const problemRows = [
  ["종료 처리가 안 된 강좌", `올림픽스포츠센터 운영 중 강좌 ${nf(osc.n)}개 중 ${nf(osc.stale)}개가 1년 넘게 바뀐 기록이 없거나 시작일이 1990-01-01 (대부분 2022~2025년 테니스 강좌)`, "기본으로 숨기고, 보이게 하면 '○년 ○월 이후 변경 없음 · 운영 여부 센터 확인' 표시", "끝난 강좌에 종료일 입력"],
  ["요일 칸에 강습일·자유이용일이 섞임", "일산 49개, 분당 1개: 강좌명은 '골프 15시(화목)'인데 요일 칸은 '월~일'", "강좌명 요일이 다르면 '강좌명에는 화목 · 강습 요일은 센터 확인' 표시", "강습 요일과 자유이용 요일을 다른 열로"],
  ["뜻이 없는 괄호 요일", "올림픽수영장 '월,화,수,목,금,(토)'처럼 괄호를 쓴 요일의 뜻이 설명에 없음", "요일로 찾을 때 괄호 요일은 넣지 않고 테두리로만 표시", "설명에 괄호 뜻을 적음"],
  ["날짜 열에 기간이 들어 있음", "올림픽수영장·일산: '시작일자' 열에 '2026-01-01~9999-12-31', '종료일자' 열에는 시작일", "기간을 직접 나눠 읽음", "시작일·종료일을 각각의 열로"],
  ["학교 단체 강좌가 섞임", "분당 '생존수영(학교단체) ○○초' 12개", "일반 신청이 아니므로 목록에서 뺌", "대상 열에 '단체' 구분"],
];

const ruleRows = [
  ["갱신예정일 · 설명복사 · 시각형식", "점검 필요", "차기 등록 예정일이 지났는데 새 파일 없음 / 설명이 다른 데이터 설명을 복사 / 시각의 분·초 자리에 월·일이 들어감"],
  ["최신성 · 설명기간", "주의", "마지막 날짜가 갱신 주기의 두 배보다 오래됨 / 설명의 기간보다 실제 자료가 더 최근"],
  ["중복 · 설명내용 · 입출차", "주의 등", "같은 행 반복, 설명이 말하는 열이 없음, 출차가 입차보다 앞섬"],
  ["운영중강좌 · 열값형식 · 요일", "주의 · 참고", "강좌 찾기를 만들며 찾은 문제를 규칙으로 (위 표)"],
  ["시민 서비스 (기관 전체)", "주의", "강좌정보에 남은 자리·신청 기간·선착순/추첨·대상별 요금 열이 없음"],
  ["개방목록 대조 · 오탈자", "기관 전체 · 참고", "개방목록 파일과 포털 목록 비교 / AI 후보를 원문과 글자 그대로 대조한 것만"],
];

const GO = { "점검 필요": 0, "주의": 1, "양호": 2 };
const flaggedRows = flagged.slice().sort((a, b) => GO[a.grade] - GO[b.grade]).map((d) => {
  const main = d.findings.filter((f) => f.level !== "info").map((f) => f.msg);
  return [{ v: gradeMark[d.grade], color: gradeColor[d.grade], bold: true }, `${d.title} (${d.kind})`, main.join("\n")];
});
const c1 = R.datasets.find((d) => d.id === "15164156");

const detail = [
  new Paragraph({ pageBreakBefore: true, spacing: { after: 160 }, children: [t("ο 상세 기획서(10장 이내)", { size: 28, bold: true })] }),

  H1("1. 활용사례 개요"),
  H2("1-1. 활용사례 명"),
  P("내 체력에 맞는 강좌: 국민체력100 운동처방 기록을 한국체육산업개발 스포츠센터 4곳의 강좌로 잇는 서비스"),
  H2("1-2. 활용사례 기능, 특징 등 세부내용"),
  P("한국체육산업개발이 운영하는 스포츠센터 4곳(올림픽수영장, 올림픽공원스포츠센터, 일산·분당 올림픽스포츠센터)의 강좌정보와 국민체육진흥공단의 국민체력100 측정·처방 기록을 이었습니다. 시민 화면 둘과 기관 화면 하나, 근거 화면 둘이 같은 자료와 같은 코드에서 만들어집니다."),
  P([t("① 체력 맞춤 강좌 (시민용, 이 사례의 중심)", { bold: true })]),
  B([t("같은 조건의 처방 보기: ", { bold: true }), t(`나이·성별과 국민체력100 등급을 넣으면, 같은 조건으로 측정한 사람들이 건강운동관리사에게 실제로 처방받은 운동을 비율로 보여 줍니다. 입력값은 기기 밖으로 나가지 않습니다.`)]),
  B([t("등급을 몰라도 키·몸무게로: ", { bold: true }), t(`측정한 적이 없는 사람은 키와 몸무게를 넣으면 체질량지수 다섯 구간 가운데 같은 구간 측정자의 처방을 봅니다(19세 이상). 성인의 자전거 처방은 18.5 미만 구간 ${SPB("자전거").min[1]}%에서 30 이상 구간 ${SPB("자전거").max[1]}%로, 달리기는 ${SPB("달리기").min[1]}%에서 ${SPB("달리기").max[1]}%로 달라져 조건을 넣는 의미가 있습니다. 화면은 체격을 평가하지 않고 숫자 구간만 보여 줍니다.`)]),
  B([t("처방 운동을 강좌로: ", { bold: true }), t(`처방 기록의 운동 이름과 강좌 종목이 같은 것만 잇습니다(${FT.links.map((l) => l.key).join(", ")}). 버튼을 누르면 입력한 나이가 들을 수 있는 강좌만 시작 시각 순으로 나오고, 갈 수 있는 시간대와 센터로 거릅니다. 강좌마다 센터 안내·수강신청으로 이어집니다.`)]),
  B([t("집에서 하는 운동은 영상으로: ", { bold: true }), t(`스트레칭·맨몸 근력처럼 강좌가 없는 처방 운동은 국민체력100 운동 영상 ${FT.n_videos}개 가운데 이름이 같은 것으로 잇습니다.`)]),
  B([t("어르신을 위한 글자 크게: ", { bold: true }), t("버튼 하나로 전체 글자를 키우고 다음 방문에도 유지합니다.")]),
  B([t("측정으로 안내: ", { bold: true }), t("측정한 적이 없는 사람에게는 체력인증센터 예약(올림픽공원 안 송파 체력인증센터 포함)을 안내하고, 측정한 사람에게는 이 화면이 진단이 아니라 다른 사람들의 처방 통계임을 밝힙니다.")]),
  P([t("② 강좌 찾기 (시민용)", { bold: true })]),
  B(`센터 4곳 강좌 ${nf(fresh)}개를 '퇴근 후·주말·아이와·청소년·실버' 버튼, 요일×시각 시간표, 이름 검색으로 찾습니다. 로그인·설치 없이 휴대폰에서 되고, 강좌마다 수강신청·캘린더 넣기·길찾기와 가까운 주차장을 붙였습니다.`),
  P([t("③ 강좌 공백 지도 (기관 편성 담당자용)", { bold: true })]),
  B(`연령대 5개와 시간대 5개로 강좌 정원을 나눠 센터가 있는 시·구의 연령별 주민 수와 비교하고, 연령 구분별 처방 비율과 그 연령대가 들을 수 있는 해당 종목 강좌 정원을 나란히 보여 줍니다. 전체 칸은 CSV로 내려받아 편성 회의 자료로 씁니다.`),
  P([t("④ 데이터 분석·데이터 건강검진 (근거 화면)", { bold: true })]),
  B(`원본을 SQLite에 넣어 SQL 질의 ${AN.queries.length}개로 낸 분석과, 기관 개방 데이터 ${N}종을 같은 규칙으로 점검한 결과입니다.`),
  H2("1-3. 활용사례 서비스 확인 방법"),
  table([{ h: "구분", w: 2400 }, { h: "주소", w: W - 2400 }], [
    ["체력 맞춤 강좌 (시민용)", FITURL],
    ["강좌 찾기 (시민용)", SITE],
    ["강좌 공백 지도 (기관용)", GAPURL],
    ["데이터 분석 · 건강검진", SITE + "analysis.html  /  " + SITE + "check.html"],
    ["소스 코드 · 원본 자료", REPO],
  ], { size: 18 }),

  H1("2. 활용사례의 독창성"),
  H2("2-1. 활용 공공데이터"),
  table([{ h: "공공데이터", w: 3300 }, { h: "제공기관·번호", w: 1700 }, { h: "쓰는 곳", w: W - 5000 }], [
    ...K.centers.map((c) => [`${c.full} 강좌정보`, `한국체육산업개발 ${c.id}`, `운영 중 강좌 ${nf(KC[c.name].n)}개의 종목, 강좌명(대상 연령), 시간, 요일, 대상, 금액, 정원`]),
    ["스포츠센터 강좌 정보", "한국체육산업개발 15147992", "강좌 설명과 공식 안내 페이지 링크"],
    ["국민체력100 체력인증센터 측정결과 정보", "국민체육진흥공단 15108938", `전체 ${nf(FT.total_api)}건 가운데 ${period} ${nf(FT.rows_used)}건. 나이·성별·등급과 운동처방 목록. 원자료는 저장하지 않고 집계만 사용`],
    ["국민체력100 동영상 정보", "국민체육진흥공단 15108846", `운동 영상 ${FT.n_videos}개(체력 요소·연령층별). 처방 운동과 이름이 같은 영상 연결`],
    ["지역별(행정동) 성별 연령별 주민등록 인구수", "행정안전부 15097972", `${GP.base_month} 기준. 센터가 있는 시·구의 연령대별 주민 수 (공백 지도)`],
    ["올림픽공원 입출차 정보, 주차장 혼잡도 정보, 실시간 주차현황", "한국체육산업개발", "강좌 찾기 화면의 강좌별 주차 붐빔과 가까운 주차장 안내"],
    [`한국체육산업개발 개방 데이터 ${N}종`, "전체", `데이터 건강검진. 파일 ${R.n_csv_checked}종은 내용 ${nf(R.rows_checked)}행까지 점검`],
  ], { size: 16 }),
  P([t(`가공 내용: 강좌정보 4종은 센터마다 열 이름과 형식이 달라 한 형식으로 맞췄고, 강좌명에 적힌 출생연도·나이('17년~08년생', '20세이상')와 수강대상 칸으로 강좌마다 대상 나이를 정했습니다. 처방 기록은 한 사람의 처방 목록을 운동 이름으로 나눠 '그 운동을 처방받은 사람 수'로 셌습니다(운동 이름 ${nf(N_EX)}가지). 모든 규칙은 공개 코드와 테스트 37개로 고정했습니다.`, { size: 19 })], { spacing: { before: 80, after: 100 } }),
  H2("2-2. 사례를 활용하게 된 배경 및 활용 우수성"),
  P([t("[배경] ", { bold: true }), t("2025 국민생활체육조사에서 규칙적으로 운동하지 않는 이유는 '시간 부족'(61.3%) 다음이 '관심 부족'(50.8%)이었고, 70세 이상은 건강 문제를 가장 많이 꼽았습니다. 무엇을 해야 할지 모르거나 내 몸에 맞는지 걱정되는 사람에게는 '나와 비슷한 사람에게 전문가가 권한 운동'이 출발점이 됩니다. 국민체력100은 이 처방을 무료로 해 주지만, 처방받은 운동을 가르치는 곳을 찾는 일은 개인 몫으로 남아 있습니다. 한국체육산업개발은 국민체육진흥공단의 자회사로 올림픽공원에 체력인증센터와 스포츠센터가 함께 있는데도, 두 데이터는 이어져 있지 않았습니다.")]),
  P([t("[다른 서비스와의 차이] ", { bold: true }), t("공공체육 강좌 서비스는 대부분 요일·시간·종목으로 찾는 검색입니다. 이 사례는 '어떤 운동을 해야 하나'에서 출발합니다. 근거는 설문이나 추정이 아니라 건강운동관리사가 실제로 내린 처방 100만 건이고, 운동과 강좌의 연결은 이름이 같은 것만 잇는 표 하나로 공개했습니다.")]),
  P([t("[시민 화면과 기관 화면이 한 고리] ", { bold: true }), t(`같은 처방 자료를 기관 쪽으로 돌리면 편성 근거가 됩니다. 예를 들어 어르신의 ${FS("어르신", "자전거")}%가 자전거 운동을 처방받는데 일산 센터에는 자전거 강좌가 없고, 성인의 ${FS("성인", "달리기")}%가 달리기를 처방받는데 달리기 강좌는 4곳 중 올림픽수영장의 러닝크루 ${LK["달리기"].courses}개(정원 ${nf(SUP("성인", "올림픽공원 2곳", "달리기").seats)}명)뿐입니다. 시민에게는 '이 운동을 여기서', 기관에는 '이 운동이 모자람'을 같은 숫자로 보여 줍니다.`)]),
  P([t("[AI 활용 범위] ", { bold: true }), t("판정과 변환은 전부 공개된 규칙으로 합니다. 생성형 AI(Claude)는 코드 작성과 설명문 오탈자 후보 찾기에 썼고, 결과는 원본 자료와 대조해 확인했습니다. 화면은 개인에게 운동을 처방하지 않고 통계만 보여 줍니다.")]),

  H1("3 활용사례의 구체성"),
  H3("사용 장면"),
  table([{ h: "누가", w: 2100 }, { h: "화면에서 하는 일", w: 3200 }, { h: "얻는 것", w: W - 5300 }], [
    ["체력 측정에서 3등급을 받은 40대 직장인", "나이·성별·등급을 넣고 '평일 저녁'을 고름", `성인 측정자의 ${FS("성인", "달리기")}%가 달리기, ${FS("성인", "자전거")}%가 자전거, ${FS("성인", "수영")}%가 수영을 처방받음. 수영 강좌 가운데 내 나이가 들을 수 있는 평일 저녁반을 바로 봄`],
    ["무릎이 걱정인 68세, 측정은 안 해 봄", "나이·성별만 넣음", `어르신 측정자의 ${FS("어르신", "아쿠아로빅")}%가 아쿠아로빅·물속 걷기를 처방받음. 아쿠아 강좌 ${LK["아쿠아로빅"].courses}개와 체력인증센터 예약 안내`],
    ["센터 프로그램 담당자", "공백 지도에서 지역을 고르고 '처방은 많은데 강좌가 적은 운동' 표를 봄", `일산: 어르신 자전거 처방 ${FS("어르신", "자전거")}%에 강좌 ${SUP("어르신", "일산", "자전거").courses}개. 분당: 어르신 아쿠아로빅 처방 ${FS("어르신", "아쿠아로빅")}%에 정원 ${nf(SUP("어르신", "분당", "아쿠아로빅").seats)}명`],
  ], { size: 17 }),
  H3("처방 기록이 보여 주는 것"),
  P(`${period}에 체력인증센터에서 측정한 ${nf(FT.rows_used)}명의 기록입니다(받는 중 실패한 구간 없음). 비율은 처방 기록이 있는 사람 가운데 그 운동을 한 번이라도 처방받은 사람의 비율입니다.`),
  table([{ h: "연령 구분", w: 1500 }, { h: "측정자", w: 1300 }, ...FT.links.map((l) => ({ h: l.key, w: Math.floor((W - 2800) / FT.links.length) }))],
    ["청소년", "성인", "어르신"].map((st) => [st, `${nf(FT.stages[st].n)}명`, ...FT.links.map((l) => { const v = FS(st, l.key); return v >= 10 ? { v: v + "%", bold: true } : v + "%"; })]), { size: 16 }),
  P([t(`읽는 법: 연령에 따라 처방이 뚜렷이 다릅니다. 아쿠아로빅은 어르신에게 ${FS("어르신", "아쿠아로빅")}%인데 성인에게는 ${FS("성인", "아쿠아로빅")}%이고, 요가·필라테스와 웨이트 트레이닝은 청소년에게 많습니다. 유아·유소년은 처방이 놀이형 동작 위주라 강좌와 거의 이어지지 않아, 화면은 청소년 이상에서 쓸모가 큽니다. 테니스·골프처럼 처방 기록에 나오지 않는 종목은 이 화면에 나오지 않고 강좌 찾기에서 봅니다.`, { size: 18 })], { spacing: { before: 80, after: 100 } }),
  H3("처방과 강좌 정원 비교 (기관용 공백 지도)"),
  P(`연령 구분별 처방 비율 옆에, 그 연령대가 들을 수 있는 해당 종목 강좌와 정원을 지역별로 놓았습니다. 주민 수는 ${GP.base_month} 주민등록 인구입니다.`),
  ...img("gap_rx.png", 520, 304, "그림 2. 공백 지도의 '처방은 많은데 강좌가 적은 운동' 표 (일산). 강좌가 0개인 칸은 색으로 표시"),
  P([t(`공백 지도는 이 표와 함께 연령대×시간대 표를 보여 줍니다. 예를 들어 올림픽공원 두 센터 주변(송파·강동) 주민의 ${SR(OP).pop_share}%가 65세 이상인데 어르신만을 위해 연 강좌 정원은 ${pct(SR(OP).own, AR[OP].tot)}%이고, 일산은 유아(4~6세)가 들을 수 있는 정원이 ${nf(KID("일산").can)}명입니다. 자전거·달리기는 헬스장 기구나 야외에서 혼자 할 수도 있으므로, 표는 '그 이름으로 연 강좌'가 있는지만 말합니다.`, { size: 19 })], { spacing: { before: 60, after: 100 } }),
  H3("강좌 자료의 문제와 처리"),
  table([{ h: "문제", w: 1900 }, { h: "실제 자료", w: 3300 }, { h: "화면 처리", w: 2500 }, { h: "기관이 고칠 것", w: W - 7700 }], [
    ...problemRows.slice(0, 2), problemRows[3],
    ["대상 연령이 센터마다 다른 곳에", "분당은 강좌명 출생연도, 올림픽수영장·일산은 수강대상 칸, 올림픽스포츠센터는 대부분 빈칸", `강좌명을 먼저 읽고 없으면 대상 칸, 빈칸 ${assumed}개는 성인으로 보고 표시`, "대상 최소·최대 나이를 열로"],
  ], { size: 16 }),
  P([t(`그 밖에 기관 개방 데이터 ${N}종을 같은 규칙으로 점검한 결과(점검 필요 ${g["점검 필요"] || 0}종, 주의 ${g["주의"] || 0}종, 양호 ${g["양호"] || 0}종. 공고문에는 57종이나 점검일 포털 목록의 58종 전부)와 SQL 질의 ${AN.queries.length}개의 분석은 서비스의 건강검진·데이터 분석 화면에 근거와 함께 공개했습니다.`, { size: 19 })], { spacing: { before: 80 } }),

  H1("4. 사례의 활용 적절성"),
  P("기대되는 사회적 가치를 공공성·경제성·기술성으로 나눠 근거와 한계를 함께 적었습니다."),
  table([{ h: "관점", w: 1300 }, { h: "근거 (모두 자료에서 다시 계산됨)", w: 5000 }, { h: "한계와 대응", w: W - 6300 }], [
    [{ v: "공공성", bold: true }, `- 운동을 시작하지 못하는 사람에게 '나와 비슷한 사람이 전문가에게 처방받은 운동'과 그 운동을 배울 가까운 공공 강좌를 한 화면에서 제시\n- 참여율이 낮은 70대 이상(59.5%)에게 관절 부담이 적은 아쿠아로빅·자전거 처방과 강좌를 바로 연결\n- 로그인·설치·광고 없음, 입력값을 서버로 보내지 않음`, "통계이지 개인 진단이 아님. 화면에 이를 밝히고 측정·상담은 체력인증센터로 안내"],
    [{ v: "경제성", bold: true }, `- 운영비 0원: 서버 없는 정적 페이지, 무료 자동 실행으로 갱신\n- 기관: 한 해 수십만 명인 국민체력100 측정자가 센터 강좌로 들어오는 경로. 편성 담당자가 처방 수요와 정원을 손으로 맞춰 보는 일을 자동화`, "등록 증가 효과는 아직 측정값이 없음. 기관 협조로 화면을 거친 수강신청 유입을 재면 확인 가능"],
    [{ v: "기술성", bold: true }, `- 측정결과 API ${nf(FT.total_api)}건 중 ${nf(FT.rows_used)}건을 나눠 받아 집계(중간 저장, 실패 구간 0)\n- 센터마다 다른 4개 형식과 강좌명 속 출생연도를 공개 규칙으로 해석, 테스트 37개\n- 올릴 때마다 모든 결과 파일을 다시 만들어 같은지 확인한 뒤에만 배포`, `처방 기록에 이름이 나오는 종목만 연결됨(${FT.links.length}개 묶음). 측정 항목은 코드로만 제공되어, 산식으로 확인되는 체질량지수(${nf(FT.bmi_check.n)}건 중 ${(FT.bmi_check.match / FT.bmi_check.n * 100).toFixed(2)}% 일치)만 사용`],
  ], { size: 16 }),
  H3("심사 기준별 요약"),
  table([{ h: "기준", w: 1500 }, { h: "이 사례의 근거", w: W - 1500 }], [
    [{ v: "우수성", bold: true }, `기관 강좌정보 5종에 국민체육진흥공단 처방 기록 ${man(FT.rows_used)} 건, 행정안전부 인구를 결합해 실제로 돌아가는 서비스로 만듦`],
    [{ v: "구체성", bold: true }, `연령·성별·등급별 처방 비율과 강좌 수가 화면과 기획서에서 같은 숫자로 나오고, 누구나 같은 명령으로 다시 계산`],
    [{ v: "독창성", bold: true }, "강좌를 '찾는' 서비스가 아니라 '무슨 운동을 할지'에서 출발해 강좌로 잇는 서비스. 같은 자료로 기관의 편성 근거까지 제공"],
    [{ v: "실현가능성", bold: true }, "이미 운영 중이며 강좌 자료는 매주 자동 갱신. 서버 없는 웹페이지·Python 표준 라이브러리라 운영비 0원, 기관 계정으로 이관 가능"],
    [{ v: "공익성", bold: true }, "측정으로 끝나던 국가 체력 관리 사업을 생활권 공공 강좌로 이어 운동 시작의 문턱을 낮춤. 어르신·운동 초보자에게 특히 유용"],
  ], { size: 17 }),

  H1("5. 실현가능성 및 기타"),
  H3("추진 일정 및 개발·운영 계획"),
  table([{ h: "시기", w: 2200 }, { h: "내용", w: W - 2200 }], [
    ["2026.11 (완료)", "체력 맞춤 강좌, 강좌 찾기, 강좌 공백 지도, 데이터 분석, 건강검진 화면 공개. 강좌 파일 매주 자동 갱신, 처방 집계·인구 받기 자동화, 테스트 37개."],
    ["2026.12", "심사 의견 반영. 올림픽공원 체력인증센터·센터 담당자 의견을 받아 운동과 강좌 연결 표 보완."],
    ["2027 상반기 (제안)", "체력인증센터 결과지와 센터 안내문에 이 화면의 QR 한 줄 넣기. 측정 직후 '처방받은 운동을 가까운 센터 강좌로' 바로 이어지는 경로가 되며 추가 개발이 필요 없음."],
    ["2027 ~ 2028", "처방 집계를 분기마다 다시 받아 갱신, 분기 편성 전에 공백 지도 제공. 등록·대기 인원이 개방되면 실제 수요 칸 추가."],
  ], { size: 18 }),
  H3("서비스 유지 계획 (2028년까지 운영 가능 여부)"),
  P("2028년까지 운영할 수 있습니다. 화면은 정적 웹페이지(GitHub Pages)라 서버·유지 비용이 없고, 코드는 Python 표준 라이브러리만 씁니다. 매주 월요일 포털의 강좌 파일 수정일을 확인해 바뀌면 내려받고, 테스트를 통과한 경우에만 화면을 다시 만들어 배포합니다. 처방 집계는 버튼 한 번으로 다시 받습니다(약 1시간). 수상 시 원천 소스는 저장소 전체를 그대로 제공합니다."),
  P([t("[기관 이관 절차] ", { bold: true }), t("① 저장소를 기관 GitHub 계정으로 이전 또는 복제 ② 공공데이터포털 인증키를 기관 명의로 발급해 저장소 비밀값에 등록 ③ 웹페이지 주소를 기관 누리집에 연결 ④ 자동 갱신 실행 기록으로 첫 갱신 확인. 참가자는 2028년까지 수정·문의에 협조합니다.")]),
  P([t("[한계] ", { bold: true }), t("처방 비율은 전국 측정자 기준이고, 측정하러 온 사람들의 기록이라 전체 국민을 대표하지는 않습니다. 운동과 강좌의 연결은 이름이 같은 것만이라 좁게 잡혀 있습니다. 1년 넘게 바뀐 기록이 없는 강좌는 뺐습니다.")]),
  H3("향후 추가 개방이 필요한 공공데이터 (의견)"),
  B([t("강좌별 등록 인원·대기 인원: ", { bold: true }), t("처방 수요와 정원 옆에 실제 수요를 채울 수 있습니다. 같은 강좌번호로 월별 개방되면 '처방도 많고 대기도 긴 강좌'를 바로 찾습니다.")]),
  B([t("강좌의 대상 최소·최대 나이, 운동 강도·수준 열: ", { bold: true }), t("지금은 강좌명 글자를 해석해야 합니다. 숫자 열로 있으면 체력 등급에 맞는 강좌까지 정확히 이을 수 있습니다.")]),
  B([t("강좌별 남은 자리·신청 기간: ", { bold: true }), t("시민이 신청 전에 가장 먼저 찾는 정보입니다. 개방되면 '지금 신청할 수 있는 처방 운동 강좌'를 보여 줄 수 있습니다.")]),
  B([t("(국민체육진흥공단) 측정결과 API의 항목 설명: ", { bold: true }), t("측정 항목이 item_f001 같은 코드로만 제공됩니다. 항목 이름과 단위가 함께 개방되면 약한 체력 요소별 안내로 넓힐 수 있습니다.")]),
  P([t("개발 과정에서 AI 코딩 도구(Claude Code)를 활용했으며, 규칙과 판정 기준은 참가자가 정하고 결과를 원본 자료와 대조해 검증했습니다.", { size: 17, color: "5A6A66" })], { spacing: { before: 200 } }),
];
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: "FFFFFF" }, paragraph: { spacing: { before: 280, after: 0 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 22, bold: true, color: "000000" }, paragraph: { spacing: { before: 0, after: 120 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "dot", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [t("내 체력에 맞는 강좌  ", { size: 16, color: "7A8884" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "7A8884" })] })] }) },
    children: [...summary, ...detail],
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log("wrote", OUT, b.length); });
