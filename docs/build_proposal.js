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

// ---- 요약서 ----
const summary = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t("2026년도 공공데이터 활용 경진대회", { size: 22, color: "5A6A66" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t("기획 요약서", { size: 36, bold: true })] }),
  table([{ h: "항목", w: 2000 }, { h: "내용", w: W - 2000 }], [
    [{ v: "1. 활용사례명", bold: true }, "강좌 공백 지도: 스포츠센터 4곳의 강좌 정원을 주변 주민의 나이와 생활 시간에 맞춰 보는 편성 진단 (시민용 강좌 찾기 포함)"],
    [{ v: "2. 사용한 공공데이터명", bold: true }, `올림픽수영장·올림픽스포츠센터·일산스포츠센터·분당스포츠센터 강좌정보, 스포츠센터 강좌 정보(안내 링크)\n결합: 행정안전부 지역별(행정동) 성별 연령별 주민등록 인구수(${GP.base_month} 기준), 2025 국민생활체육조사 연령별 참여율\n시민 화면 보조: 올림픽공원 입출차 정보, 주차장 혼잡도 정보, 실시간 주차현황 / 근거 자료: 한국체육산업개발 개방 데이터 ${N}종 점검`],
    [{ v: "3. 요약", bold: true }, `[문제] 어느 센터에서 누구를 위해 언제 강좌를 여는지는 기관이 정합니다. 그런데 그 결과를 주변 주민의 나이 구성이나 생활 시간과 견줘 볼 도구가 없습니다. 강좌의 대상 연령도 '17년~08년생'처럼 강좌명 글자 안에 흩어져 있습니다.\n[해결] ① 강좌명의 출생연도·나이와 수강대상 칸을 읽어 운영 중 강좌 ${nf(GP.n_courses)}개(정원 ${nf(GP.n_seats)}명)의 대상 연령을 정했습니다  ② 연령대 5개와 시간대 5개로 정원을 나눠 센터가 있는 구의 주민 수와 나란히 놓고, 주민 1,000명당 정원이 가장 적은 칸을 '검토할 칸'으로 보여 줍니다  ③ 같은 자료로 시민용 강좌 찾기와 개방 데이터 점검 화면을 함께 운영합니다\n[발견] 올림픽공원 두 센터 주변(송파·강동) 주민의 ${SR(OP).pop_share}%가 65세 이상인데 어르신만을 위해 연 강좌 정원은 ${pct(SR(OP).own, AR[OP].tot)}%입니다. 일산은 ${SR("일산").pop_share}% 대 ${pct(SR("일산").own, AR["일산"].tot)}%, 유아(4~6세)가 들을 수 있는 정원은 ${nf(KID("일산").can)}명입니다.`],
    [{ v: "4. 기대효과", bold: true }, `① 기관: 분기 강좌 편성 회의에서 바로 쓰는 '검토할 칸' 목록과 CSV. 강좌 파일이 바뀌면 매주 자동으로 다시 계산\n② 시민: 비어 있던 연령대·시간대에 강좌가 열리면 가까운 공공 센터에서 운동할 기회가 생김. 지금 있는 강좌는 강좌 찾기 화면에서 시간·대상으로 바로 찾음\n③ 데이터: 등록·대기 인원이 개방되면 같은 표에 실제 수요를 채워 넣을 수 있음(5번 의견)\n④ 서버 없는 웹페이지라 운영비 0원, 수상 시 기관 계정으로 이관해 2028년까지 운영`],
  ], { size: 19 }),
  ...img("summary_gap.png", 600, 381, "그림 1. 강좌 공백 지도(올림픽공원 두 센터). 칸은 주민 1,000명당 들을 수 있는 정원, 빨간 테두리는 0인 칸. QR은 서비스 첫 화면"),
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
  P("강좌 공백 지도: 스포츠센터 4곳의 강좌 정원을 주변 주민의 나이와 생활 시간에 맞춰 보는 편성 진단"),
  H2("1-2. 활용사례 기능, 특징 등 세부내용"),
  P("한국체육산업개발이 운영하는 스포츠센터 4곳(올림픽수영장, 올림픽공원스포츠센터, 일산·분당 올림픽스포츠센터)의 강좌정보를 한 형식으로 맞춘 뒤, 기관에는 편성을 점검하는 화면을, 시민에게는 강좌를 찾는 화면을 줍니다. 네 화면 모두 같은 자료와 같은 코드에서 만들어집니다."),
  P([t("① 강좌 공백 지도 (기관 편성 담당자용, 이 사례의 중심)", { bold: true })]),
  B([t("대상 연령 읽기: ", { bold: true }), t(`강좌명에 적힌 출생연도('17년~08년생'), 나이('20세이상'), '초등'·'실버' 같은 말을 먼저 읽고, 없으면 수강대상 칸('성인남여', '청소년')으로 정합니다. 강좌마다 어느 근거로 정했는지 남기고, 대상 칸이 빈 ${assumed}개(대부분 올림픽스포츠센터 테니스)는 성인 강좌로 본다고 화면에 밝힙니다.`)]),
  B([t("누가·언제 표: ", { bold: true }), t("유아·초등·중고생·청년·중년·어르신 5개 연령대와 평일 새벽·아침, 낮, 오후, 저녁, 주말 5개 시간대로 정원을 나눕니다. 칸마다 '그 연령대가 들을 수 있는 정원'을 주민 1,000명당으로, '그 연령대만을 위해 연 정원'을 함께 적습니다. 학교·직장에 있을 시간은 빗금으로 비교에서 빼고, 정원이 0인 칸은 빨간 테두리로 표시합니다.")]),
  B([t("주민 구성과 강좌 구성: ", { bold: true }), t("지역 주민 중 각 연령대의 비중과, 그 연령대만을 위해 연 정원의 비중을 막대 두 개로 나란히 보여 줍니다.")]),
  B([t("먼저 검토할 칸과 근거 문장: ", { bold: true }), t("연령대마다 가장 비어 있는 칸을 골라 정원·주민 수와 국민생활체육조사의 관련 수치를 한 문장으로 붙입니다. 전체 칸은 CSV로 내려받아 편성 회의 자료로 씁니다.")]),
  B([t("기준과 한계 공개: ", { bold: true }), t("지역 범위, 시간대 정의, 참여율 출처, '정원이 적다'가 곧 '수요가 넘친다'는 뜻은 아니라는 점을 화면 아래에 모두 적습니다.")]),
  P([t("② 강좌 찾기 (시민용)", { bold: true })]),
  B(`센터 4곳 강좌 ${nf(fresh)}개를 '퇴근 후·주말·아이와·청소년·실버' 버튼, 요일×시각 시간표, 이름 검색으로 찾습니다. 로그인·설치 없이 휴대폰에서 되고, 강좌마다 온라인 수강신청·캘린더 넣기·길찾기 링크와 가까운 주차장을 붙였습니다. 1년 넘게 바뀐 기록이 없는 강좌 ${nf(S.stale)}개와 강좌명에 폐강·일시중지가 적힌 강좌는 따로 처리합니다.`),
  P([t("③ 데이터 분석·데이터 건강검진 (근거 화면)", { bold: true })]),
  B(`원본을 SQLite에 넣어 SQL 질의 ${AN.queries.length}개로 낸 분석과, 기관 개방 데이터 ${N}종을 같은 규칙으로 점검한 결과입니다. 공백 지도의 숫자가 어떤 자료에서 나왔는지 따라가 볼 수 있게 했습니다.`),
  H2("1-3. 활용사례 서비스 확인 방법"),
  table([{ h: "구분", w: 2200 }, { h: "주소", w: W - 2200 }], [
    ["강좌 공백 지도 (기관용)", GAPURL],
    ["강좌 찾기 (시민용)", SITE],
    ["데이터 분석 · 건강검진", SITE + "analysis.html  /  " + SITE + "check.html"],
    ["소스 코드 · 원본 자료", REPO],
  ], { size: 18 }),

  H1("2. 활용사례의 독창성"),
  H2("2-1. 활용 공공데이터"),
  table([{ h: "공공데이터", w: 3300 }, { h: "번호·출처", w: 1300 }, { h: "쓰는 곳", w: W - 4600 }], [
    ...K.centers.map((c) => [`${c.full} 강좌정보`, c.id, `운영 중 강좌 ${nf(KC[c.name].n)}개의 종목, 강좌명(대상 연령), 시간, 요일, 대상, 금액, 정원`]),
    ["스포츠센터 강좌 정보", "15147992", "강좌 설명과 공식 안내 페이지 링크"],
    ["행정안전부 지역별(행정동) 성별 연령별 주민등록 인구수", "15097972", `${GP.base_month} 기준. 송파·강동, 일산동·서구, 분당구 동별 나이별 인구를 더해 연령대 인구를 계산. 월간 갱신 자료라 같은 명령으로 다시 받음`],
    ["2025 국민생활체육조사", "문화체육관광부", "연령별 규칙적 체육활동 참여율(10대 43.2% ~ 70대 이상 59.5%)로 연령대별 '규칙적으로 운동하는 주민' 추정"],
    ["올림픽공원 입출차 정보, 주차장 혼잡도 정보, 실시간 주차현황", "15138735 등", "시민 화면의 강좌별 주차 붐빔과 가까운 주차장 안내"],
    [`한국체육산업개발 개방 데이터 ${N}종`, "전체", `데이터 건강검진. 파일 ${R.n_csv_checked}종은 내용 ${nf(R.rows_checked)}행까지 점검`],
  ], { size: 17 }),
  P([t(`강좌정보 4종은 센터마다 열 이름과 형식이 다르고(예: '강좌금액'·'수강금액'·'금액'·'수강료'), 대상 연령은 분당은 강좌명에 출생연도로, 올림픽수영장·일산은 수강대상 칸에, 올림픽스포츠센터는 대부분 비어 있습니다. 이를 한 형식으로 맞추는 규칙을 공개 코드로 만들었습니다. 운영 중 강좌의 ${Math.round(fromName / GP.n_courses * 100)}%는 강좌명에서 대상 연령을 읽었습니다.`, { size: 19 })], { spacing: { before: 80, after: 100 } }),
  H2("2-2. 사례를 활용하게 된 배경 및 활용 우수성"),
  P([t("[추진 배경] ", { bold: true }), t("2025 국민생활체육조사(문화체육관광부, 만 10세 이상 9,000명)에서 규칙적 체육활동 참여율은 20~60대가 65% 안팎인 반면 10대는 43.2%, 70대 이상은 59.5%로 낮았습니다. 규칙적으로 참여하지 않는 이유는 '시간 부족'이 61.3%로 가장 많았고, 50대 이하는 시간 부족, 70세 이상은 건강 문제를 가장 많이 꼽았습니다. 이용 시설은 공공체육시설이 가장 많았습니다. 공공 스포츠센터가 이 격차를 줄이려면 '누구를 위해 언제 강좌를 여는가'가 핵심인데, 지금은 강좌 수와 정원을 센터·종목별로만 볼 수 있습니다.")]),
  P([t("[다른 접근과의 차이] ", { bold: true }), t("공공데이터로 만든 체육 서비스는 대부분 시민이 강좌나 시설을 찾는 화면입니다. 이 사례는 같은 자료를 기관 쪽으로 돌려, 편성 결과가 지역 주민 구성과 얼마나 맞는지를 칸 단위로 보여 줍니다. 판단을 대신하지 않고 비교만 보여 주며, 기준을 바꿔 다시 계산할 수 있게 코드와 가정을 공개했습니다.")]),
  P([t("[강좌명에서 대상 연령 읽기] ", { bold: true }), t(`분당 강좌명의 '[18년~10년생]', '20세이상(06년생)' 같은 표기를 나이 범위로 바꾸고, 범위가 어느 연령대와 가장 많이 겹치는지로 '그 연령대를 위한 강좌'를 정합니다. 성인 강좌는 어르신도 들을 수 있으므로 '들을 수 있는 정원'과 '그 연령대만을 위한 정원'을 따로 셉니다. 판정 규칙은 테스트로 고정했습니다.`)]),
  P([t("[AI 활용 범위] ", { bold: true }), t("판정과 변환은 전부 공개된 규칙으로 합니다. 생성형 AI(Claude)는 코드 작성과 설명문 오탈자 후보 찾기에 썼고, 결과는 원본 자료와 대조해 확인했습니다.")]),

  H1("3 활용사례의 구체성"),
  H3("사용 장면"),
  table([{ h: "누가", w: 2100 }, { h: "화면에서 하는 일", w: 3300 }, { h: "얻는 것", w: W - 5400 }], [
    ["센터 프로그램 담당자, 다음 분기 편성 회의 전", "공백 지도에서 자기 센터 지역을 고르고 '먼저 검토할 칸'과 CSV를 받음", `빈 칸 목록. 예: ${OP} 초등 평일 저녁 정원 ${nf(EL(OP).can_slots["평일 저녁"])}명(주민 ${nf(EL(OP).pop)}명), 일산 유아 정원 ${nf(KID("일산").can)}명`],
    ["어르신 프로그램을 기획하는 담당자", "어르신 줄과 주민 구성 막대를 봄", `${OP}: 주민 ${SR(OP).pop_share}%가 65세 이상, 어르신 전용 정원 ${pct(SR(OP).own, AR[OP].tot)}%(${nf(SR(OP).own)}명). 성인 강좌까지 세면 평일 낮 ${nf(SR(OP).can_slots["평일 낮"])}명`],
    ["퇴근 후 운동할 곳을 찾는 직장인", "강좌 찾기에서 '퇴근 후' 버튼", `평일 19시 이후 강좌 ${SC["직장인_4곳_19시이후"]}개(4곳). 공백 지도에서 청년·중년 정원은 ${OP} 평일 낮 ${adultSplit(OP).day}%, 평일 저녁 ${adultSplit(OP).eve}%`],
  ], { size: 17 }),
  H3("공백 지도가 보여 주는 것"),
  P(`2026-11-23에 공공데이터포털에서 받은 강좌 파일과 ${GP.base_month} 기준 주민등록 인구로 계산했습니다. 운영 중 강좌는 종료일이 9999-12-31이고 최근 1년 안에 바뀐 기록이 있는 ${nf(GP.n_courses)}개(정원 ${nf(GP.n_seats)}명)입니다.`),
  table([{ h: "지역 (주민 기준 시·구)", w: 2500 }, { h: "65세 이상 주민 비중", w: 1500 }, { h: "어르신 전용 정원 비중", w: 1600 }, { h: "유아가 들을 수 있는 정원", w: 1700 }, { h: "청년·중년 정원 중 평일 낮 / 저녁", w: W - 7300 }],
    Object.keys(AREAS).map((a) => [`${a} (${AR[a].label})`, `${SR(a).pop_share}%`, { v: `${pct(SR(a).own, AR[a].tot)}% (${nf(SR(a).own)}명)`, color: C.bad, bold: true }, `${nf(KID(a).can)}명 / 주민 ${nf(KID(a).pop)}명`, `${adultSplit(a).day}% / ${adultSplit(a).eve}%`]), { size: 16 }),
  P([t("읽는 법: 어르신은 성인 강좌에도 다닐 수 있으므로 '어르신 전용 정원'이 적다는 것은 '어르신에 맞춘 강도·시간의 강좌가 적다'는 뜻입니다. 70세 이상이 운동하지 않는 가장 큰 이유가 건강 문제라는 점에서 검토할 만한 칸입니다. 시간대 비중은 평일과 주말에 모두 열리는 강좌를 양쪽에 함께 센 값입니다.", { size: 18 })], { spacing: { before: 80, after: 100 } }),
  ...img("gap.png", 560, 475, "그림 2. 공백 지도의 '누가, 언제 들을 수 있나' 표 (올림픽공원 두 센터, 송파·강동 주민 기준)"),
  H3("같은 자료로 만든 시민 화면: 강좌 찾기"),
  P(`최근 1년 안에 바뀐 기록이 있는 강좌는 ${nf(fresh)}개입니다. 센터별 운영 현황은 아래와 같고, 수영 1회 환산 강습비(중앙값)는 ${swim}입니다(월 강습비를 주당 횟수×4.345주로 나눈 추정값).`),
  table([{ h: "센터", w: 2000 }, { h: "운영 중", w: 850 }, { h: "1년 넘게 변경 없음", w: 1250 }, { h: "평일 19시 이후", w: 1050 }, { h: "주말", w: 750 }, { h: "어린이", w: 800 }, { h: "실버", w: 700 }, { h: "수영 1회 환산", w: 1188 }, { h: "마지막 달", w: 1050 }], centerRows, { size: 16 }),
  H3("만들면서 찾은 자료 문제와 처리"),
  P("강좌정보를 그대로 쓰면 틀리는 지점이 있었습니다. 화면에서 어떻게 처리했고, 기관은 무엇을 고치면 되는지 나눴습니다."),
  table([{ h: "문제", w: 1900 }, { h: "실제 자료", w: 3300 }, { h: "화면 처리", w: 2500 }, { h: "기관이 고칠 것", w: W - 7700 }], [
    ...problemRows,
    ["대상 연령이 센터마다 다른 곳에", "분당은 강좌명 출생연도, 올림픽수영장·일산은 수강대상 칸, 올림픽스포츠센터는 대상 칸 대부분 빈칸", "강좌명을 먼저 읽고 없으면 대상 칸, 빈칸은 성인으로 보고 표시", "대상 최소·최대 나이를 열로"],
  ], { size: 16 }),
  H3("SQL 분석과 데이터 건강검진 (근거 화면)"),
  P(`원본을 SQLite에 넣고 질문마다 SQL 한 개로 답을 냈습니다(질의 ${AN.queries.length}개, python analysis/run.py로 재현). 예를 들어 정원의 ${seatEve[3]}%(${nf(seatEve[2])}자리)만 19시 이후에 시작하고, 시각별 강좌 정원과 그 시각 입차 수는 상관계수 ${AS.corr.r}(순열 검정 p = ${AS.corr.p})로 함께 움직였습니다. 기관 개방 데이터 ${N}종 점검 결과는 점검 필요 ${g["점검 필요"] || 0}종, 주의 ${g["주의"] || 0}종, 양호 ${g["양호"] || 0}종입니다(공고문에는 57종으로 안내되었으나 점검일 포털 목록의 58종 전부를 봄). 강좌 파일과 관련된 보완 항목은 '자료 문제와 처리' 표에 넣었고, 나머지는 건강검진 화면에 데이터별 근거와 함께 공개했습니다.`),

  H1("4. 사례의 활용 적절성"),
  P("기대되는 사회적 가치를 공공성·경제성·기술성으로 나눠 근거와 한계를 함께 적었습니다."),
  table([{ h: "관점", w: 1300 }, { h: "근거 (모두 자료에서 다시 계산됨)", w: 5000 }, { h: "한계와 대응", w: W - 6300 }], [
    [{ v: "공공성", bold: true }, `- 참여율이 낮은 10대·70대 이상과 시간이 부족한 직장인이 다닐 수 있는 시간에 공공 강좌가 얼마나 있는지를 지역 주민 수와 함께 보여 줌\n- 편성이 바뀌면 시민은 강좌 찾기에서 바로 찾을 수 있음(로그인·설치·광고 없음, 개인정보를 받지 않음)`, "정원은 최대 인원일 뿐 실제 등록·대기 인원이 아님. 등록 인원이 개방되면 같은 표에 수요를 채움(5번 의견)"],
    [{ v: "경제성", bold: true }, `- 운영비 0원: 서버 없는 정적 페이지, 무료 자동 실행으로 매주 갱신\n- 편성 담당자가 4개 센터 강좌를 엑셀로 모아 연령·시간별로 세는 일을 자동으로 대신함`, "편성 변경 효과(등록 증가)는 아직 측정값이 없음. 기관 협조로 변경 전후 등록 수를 비교하면 확인 가능"],
    [{ v: "기술성", bold: true }, `- 센터마다 다른 4개 형식과 강좌명 속 출생연도를 공개 규칙으로 해석, 테스트 35개로 고정\n- 행정동 연령별 인구(111개 나이 x 140개 동)를 시·구 단위로 합산, 2025 국민생활체육조사 참여율 결합\n- 올릴 때마다 모든 결과 파일을 다시 만들어 같은지 확인한 뒤에만 배포`, `지역을 시·구로 잡아 실제 이용자 거주지와 다를 수 있음. 대상 칸이 빈 강좌 ${assumed}개는 성인으로 가정(화면에 표시)`],
  ], { size: 16 }),

  H3("심사 기준별 요약"),
  table([{ h: "기준", w: 1500 }, { h: "이 사례의 근거", w: W - 1500 }], [
    [{ v: "우수성", bold: true }, `실제로 돌아가는 서비스. 강좌정보 4종과 주민등록 인구를 결합하고, 테스트 35개가 저장소에 올라갈 때마다 결과를 다시 계산해 같은지 확인`],
    [{ v: "구체성", bold: true }, `칸마다 정원·주민 수가 나옴. 예: 일산 유아 정원 ${nf(KID("일산").can)}명(주민 ${nf(KID("일산").pop)}명), 올림픽공원 어르신 전용 정원 ${nf(SR(OP).own)}명(주민 ${nf(SR(OP).pop)}명)`],
    [{ v: "독창성", bold: true }, "시민 화면이 아니라 기관의 강좌 편성 결정을 돕는 도구. 강좌명 글자 속 출생연도로 대상 연령을 읽어 주민 나이 구성과 맞댄 사례"],
    [{ v: "실현가능성", bold: true }, "이미 운영 중이며 매주 포털을 확인해 자동 갱신. 서버 없는 웹페이지·Python 표준 라이브러리라 운영비 0원, 기관 계정으로 30분 안에 이관 가능(5번 유지 계획)"],
    [{ v: "공익성", bold: true }, "규칙적 운동 참여율이 낮은 10대(43.2%)와 70대 이상(59.5%), 시간이 부족한 직장인이 다닐 수 있는 시간에 공공 강좌가 얼마나 있는지를 숫자로 보여 줌"],
  ], { size: 17 }),

  H1("5. 실현가능성 및 기타"),
  H3("추진 일정 및 개발·운영 계획"),
  table([{ h: "시기", w: 2200 }, { h: "내용", w: W - 2200 }], [
    ["2026.11 (완료)", "강좌 공백 지도, 강좌 찾기, 데이터 분석, 건강검진 화면. 강좌 파일 매주 자동 갱신, 주민등록 인구 받기 자동화, 테스트 35개."],
    ["2026.12", "심사 의견 반영. 기관 담당자 의견을 받아 연령대·시간대 기준과 지역 범위를 조정할 수 있게 화면에 설정 추가."],
    ["2027 ~ 2028 (분기마다)", "분기 편성 전에 공백 지도 갱신본 제공, 지난 분기와 바뀐 칸 표시. 등록·대기 인원이 개방되면 수요 칸 추가."],
  ], { size: 18 }),
  H3("서비스 유지 계획 (2028년까지 운영 가능 여부)"),
  P("2028년까지 운영할 수 있습니다. 화면은 정적 웹페이지(GitHub Pages)라 서버·유지 비용이 없고, 코드는 Python 표준 라이브러리만 씁니다. 매주 월요일 포털의 강좌 파일 수정일을 확인해 바뀌면 내려받고, 테스트를 통과한 경우에만 화면을 다시 만들어 배포합니다. 포털의 내려받기 제한이 뜨면 멈추고 기존 자료를 유지합니다. 수상 시 원천 소스는 저장소 전체를 그대로 제공합니다."),
  P([t("[기관 이관 절차] ", { bold: true }), t("① 저장소를 기관 GitHub 계정으로 이전 또는 복제 ② 필요한 인증키를 기관 명의로 발급해 저장소 비밀값에 등록 ③ 웹페이지 주소를 기관 누리집에 연결하거나 내부망 정적 서버에 복사 ④ 자동 갱신 실행 기록으로 첫 갱신 확인. 참가자는 2028년까지 수정·문의에 협조합니다.")]),
  P([t("[한계] ", { bold: true }), t("공백 지도는 정원과 주민 수의 비교이지 수요 측정이 아닙니다. 주민 범위는 센터가 있는 시·구로 잡았고, 시간대별 '다닐 수 있는 시간'은 학교·직장 시간을 뺀 기본값입니다. 1년 넘게 바뀐 기록이 없는 강좌는 계산에서 뺐는데, 그중 실제로 운영 중인 강좌가 있으면 정원이 적게 잡힙니다.")]),
  H3("향후 추가 개방이 필요한 공공데이터 (의견)"),
  B([t("강좌별 등록 인원·대기 인원: ", { bold: true }), t("공백 지도의 정원 옆에 실제 수요를 채울 수 있는 자료입니다. 같은 강좌번호로 이어 붙일 수 있게 월별로 개방되면 '정원이 적고 대기도 긴 칸'을 바로 찾을 수 있습니다.")]),
  B([t("대상 최소·최대 나이 열: ", { bold: true }), t("지금은 대상 연령이 강좌명 글자나 '성인남여및청소년' 같은 말로만 있어 해석이 필요합니다. 숫자 열로 있으면 누구나 같은 결과를 얻습니다.")]),
  B([t("강좌별 남은 자리·신청 기간·선착순/추첨 여부: ", { bold: true }), t("시민이 신청 전에 가장 먼저 찾는 정보입니다. 개방되면 강좌 찾기에서 '지금 신청 가능한 강좌'까지 보여 줄 수 있습니다.")]),
  B([t("데이터마다 '데이터 기준일' 항목: ", { bold: true }), t("포털 수정일과 별도로 있으면 자료의 최신성을 바로 알 수 있습니다(이번 점검에서 58종 중 44종의 수정일이 같은 날에 몰려 있었음).")]),
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
      children: [t("강좌 공백 지도  ", { size: 16, color: "7A8884" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "7A8884" })] })] }) },
    children: [...summary, ...detail],
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log("wrote", OUT, b.length); });
