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
const H1 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(s)] });
const H2 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(s)] });
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
const pk = (k, h) => PK[k][PK.hours.indexOf(h)];
const pkMaxH = (k) => PK.hours[PK[k].indexOf(Math.max(...PK[k]))];
const FAQ = S.faq;
const evePct = Math.round(SC["직장인_4곳_19시이후"] / SC["최근"] * 100);
const AN = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "site", "analysis.js"), "utf8").replace(/^window\.ANALYSIS=/, "").replace(/;\s*$/, ""));
const AQ = Object.fromEntries(AN.queries.map((q) => [q.id, q])), AS = AN.stats;
const stayWd = AQ.stay.rows.find((r) => r[0] === "평일"), seatEve = AQ.seats_by_band.rows.find((r) => r[0].startsWith("5"));
const N_PAGES = 94; // 스포츠센터 강좌 정보(15147992)의 공식 안내 페이지 링크 수

// ---- 요약서 ----
const summary = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t("2026년도 공공데이터 활용 경진대회", { size: 22, color: "5A6A66" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t("기획 요약서", { size: 36, bold: true })] }),
  table([{ h: "항목", w: 2000 }, { h: "내용", w: W - 2000 }], [
    [{ v: "1. 활용사례명", bold: true }, "내 시간에 맞는 공공스포츠 강좌 찾기 — 한국체육산업개발 스포츠센터 4곳의 강좌를 로그인 없이 요일·시간·대상으로 찾고, 자료가 최신인지까지 보여 주는 웹 서비스 (기관용 '공공데이터 건강검진' 포함)"],
    [{ v: "2. 사용한 공공데이터명", bold: true }, `올림픽수영장 강좌정보, 올림픽스포츠센터 강좌정보, 일산스포츠센터 강좌정보, 분당스포츠센터 강좌정보, 스포츠센터 강좌 정보(설명·안내 링크), 올림픽공원 입출차 정보(주차 붐빔 지수), 실시간 주차현황(오픈 API)\n건강검진: 한국체육산업개발(주) 개방 데이터 ${N}종 전체(파일 ${files.length}종 · 오픈 API ${apis.length}종)`],
    [{ v: "3. 요약", bold: true }, `생활체육을 하지 않는 이유 1위는 '시간 부족'(58.4%, 2025 국민생활체육조사)입니다. 그런데 센터 4곳의 강좌 정보는 센터·종목별 페이지에 흩어져 있어 '평일 저녁 7시 이후에 갈 수 있는 강좌'를 한 번에 찾기 어렵습니다. 이 서비스는 강좌정보 파일 4종을 한 형식으로 맞춰 운영 중 강좌 ${nf(S.total)}개를 퇴근 후·주말·아이와·청소년·실버 버튼 한 번으로 찾게 합니다. 강좌마다 자료에서 마지막으로 바뀐 달을 붙이고, 1년 넘게 바뀐 기록이 없거나 시작일이 비어 있는 ${nf(S.stale)}개는 '운영 여부 센터 확인'으로 따로 표시해 오래된 정보로 헛걸음하지 않게 합니다. 올림픽공원은 기관의 실시간 주차 API로 '지금 주차 대수'를, 입출차 기록(21만 건)으로 '그 시각 평소 붐빔'을 보여 줍니다. 강좌는 버튼 하나로 내 캘린더에 넣고, 고른 조건은 링크로 가족에게 보냅니다. 강좌 자료는 매주 자동으로 포털을 확인해 갱신됩니다. 만들면서 찾은 자료 문제(종료 처리 안 된 강좌, 요일 칸에 강습일·자유이용일 섞임 등)와 개방 데이터 ${N}종 점검 결과는 기관용 화면으로 함께 제공합니다.`],
    [{ v: "4. 기대효과", bold: true }, `① 시민: 센터별·종목별 안내 ${N_PAGES}쪽을 열던 일을 한 화면에서 버튼 하나로 (예: 퇴근 후 강좌 ${SC["직장인_4곳_19시이후"]}개)\n② 시민: '최근 변경 ○년 ○월' 표시로 오래된 정보를 걸러 보고, 올림픽공원은 주차 붐빔까지 미리 확인\n③ 기관: 시민 화면을 틀리게 만드는 자료 문제와 고치는 방법을 데이터별로 받음 → 품질관리 수준진단·평가 대응\n④ 매주 자동 갱신·주차 자동 기록이 이미 돌고 있어 운영비 0원으로 2028년까지 유지`],
  ], { size: 19 }),
  ...img("summary_fig.png", 440, 307, "그림 1. 강좌 찾기 첫 화면. 오른쪽 QR을 휴대폰으로 찍으면 서비스가 바로 열립니다 (설치·로그인 없음)"),
];

// ---- 상세 ----
const centerRows = K.centers.map((c) => { const v = KC[c.name]; return [c.full, nf(v.n), { v: nf(v.stale), color: v.stale / v.n > 0.2 ? C.warn : C.ink, bold: v.stale / v.n > 0.2 }, String(v.evening), String(v.weekend), String(v.kids), String(v.senior), v.swim_per_median ? `${nf(v.swim_per_median)}원` : "—", c.data_month]; });

const problemRows = [
  ["종료 처리가 안 된 강좌", `올림픽스포츠센터 운영 중 강좌 ${nf(osc.n)}개 중 ${nf(osc.stale)}개가 1년 넘게 바뀐 기록이 없거나 시작일이 1990-01-01 (대부분 2022~2025년 테니스 강좌)`, "기본으로 숨기고, 보이게 하면 '○년 ○월 이후 변경 없음 · 운영 여부 센터 확인' 표시", "끝난 강좌에 종료일 입력"],
  ["요일 칸에 강습일·자유이용일이 섞임", "일산 49개, 분당 1개: 강좌명은 '골프 15시(화목)'인데 요일 칸은 '월~일'", "강좌명 요일이 다르면 '강좌명에는 화목 · 강습 요일은 센터 확인' 표시", "강습 요일과 자유이용 요일을 다른 열로"],
  ["뜻이 없는 괄호 요일", "올림픽수영장 '월,화,수,목,금,(토)' — 괄호의 뜻이 설명에 없음", "요일로 찾을 때 괄호 요일은 넣지 않고 테두리로만 표시", "설명에 괄호 뜻을 적음"],
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
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t("상세 기획서", { size: 36, bold: true })] }),

  H1("1. 활용사례 개요"),
  H2("1-1. 활용사례 명"),
  P("내 시간에 맞는 공공스포츠 강좌 찾기 (기관용: 공공데이터 건강검진)"),
  H2("1-2. 활용사례 기능, 특징 등 세부내용"),
  P("한국체육산업개발이 운영하는 스포츠센터 4곳(올림픽수영장, 올림픽스포츠센터, 일산·분당 올림픽스포츠센터)의 강좌를 한 화면에서 찾는 시민용 웹 서비스입니다. 화면은 세 개(강좌 찾기, 데이터 분석, 데이터 건강검진)이고 같은 데이터·같은 코드에서 만들어집니다."),
  P([t("① 강좌 찾기 (시민용)", { bold: true })]),
  B([t("빠르게 고르기: ", { bold: true }), t(`'퇴근 후(평일 19시부터)', '주말', '아이와', '청소년', '실버' 버튼을 누르면 해당 강좌만 남습니다. 버튼마다 지금 조건에서 몇 개가 나오는지 함께 보입니다.`)]),
  B([t("자세히 거르기: ", { bold: true }), t("센터, 종목, 요일, 시작 시각대, 대상으로 거르고 시작 시각 순 또는 1회 환산 강습비 순으로 정렬합니다. 로그인·설치 없이 휴대폰에서도 됩니다.")]),
  B([t("자료 신선도 표시: ", { bold: true }), t("강좌마다 자료에서 마지막으로 바뀐 달('최근 변경 2026.8')을 붙입니다. 1년 넘게 바뀐 기록이 없는 강좌는 기본으로 숨기고, 보이게 하면 '운영 여부 센터 확인'이라고 표시합니다.")]),
  B([t("주차 붐빔: ", { bold: true }), t(`올림픽수영장·올림픽스포츠센터 강좌에는 올림픽공원 입출차 정보(${PK.month.slice(0, 4)}년 ${+PK.month.slice(5)}월, 21만 건)로 계산한 '그 시각 주차장 붐빔(한산·보통·붐빔)'을 붙이고, 평일·주말 시각별 그래프를 보여 줍니다.`)]),
  B([t("지금 주차: ", { bold: true }), t("한국체육산업개발이 누리집에 공개한 실시간 주차 API(동2·남2·북2문 주차대수)를 화면에서 바로 불러 '지금 ○○대'를 보여 줍니다. 같은 API를 예약 실행으로 자동 기록해 두고, 같은 요일 종류·시각 기록이 쌓이면 '평소보다 많음·비슷·적음'을 함께 표시합니다.")]),
  B([t("바로 신청·일정 넣기: ", { bold: true }), t("강좌 이름 검색(예: '자유수영', '초급'), 강좌마다 '센터 안내'·'온라인 수강신청' 링크와 '내 캘린더에 넣기'(휴대폰·구글·아웃룩 캘린더용 파일, 매주 반복)를 둡니다. 휴대폰 홈 화면에 앱처럼 추가할 수 있고, 인터넷이 끊겨도 마지막으로 본 목록이 열립니다.")]),
  B([t("추천 순·수준 고르기: ", { bold: true }), t("강좌명에서 입문·중급·상급을 읽어 수준으로 거르고, '추천 순'은 자료 최신 여부·같은 종목 대비 1회 강습비·그 시각 주차 붐빔으로 정렬하며 이유를 강좌마다 표시합니다. 수강 후기·평점은 공개 데이터에 없어 쓰지 않았습니다. 붐비는 날 덜 차는 주차구역도 혼잡도 기록으로 안내합니다.")]),
  B([t("시간표로 고르기: ", { bold: true }), t("요일 × 시작 시각 표에 칸마다 강좌 수를 적어, 내가 비는 시간 칸을 누르면 그 시간 강좌만 남습니다. 센터·종목·대상 조건이 표에 바로 반영됩니다.")]),
  B([t("가족에게 보내기·글자 크게: ", { bold: true }), t("고른 조건이 주소에 담겨 '이 조건으로 링크 복사'로 부모님·친구에게 그대로 보낼 수 있고, '글자 크게' 버튼으로 어르신도 읽기 쉽게 키웁니다.")]),
  B([t("요일 띠와 센터 비교: ", { bold: true }), t("강좌마다 월~일 일곱 칸으로 요일을 보여 주고, 센터 4곳의 퇴근 후·주말·어린이·실버 강좌 수와 수영 1회 환산 강습비를 표로 비교합니다. 신청은 '센터 안내 보기' 링크로 공식 누리집에서 합니다.")]),
  P([t("② 데이터 건강검진 (기관용)", { bold: true })]),
  B(`기관 개방 데이터 ${N}종을 같은 규칙으로 점검해 '점검 필요·주의·양호'와 근거, 고치는 방법을 보여 줍니다. 강좌 찾기를 만들며 걸린 자료 문제도 규칙으로 넣어, 시민 화면을 틀리게 만드는 원인을 기관이 바로 고칠 수 있게 했습니다.`),
  H2("1-3. 활용사례 서비스 확인 방법"),
  table([{ h: "구분", w: 2000 }, { h: "주소", w: W - 2000 }], [
    ["강좌 찾기", SITE],
    ["데이터 분석 (SQL·통계)", SITE + "analysis.html"],
    ["데이터 건강검진", SITE + "check.html"],
    ["소스 코드 · 규칙 · 원본 자료", REPO],
  ], { size: 19 }),

  H2("1-4. 심사 기준별 요약"),
  table([{ h: "기준", w: 1500 }, { h: "이 사례의 근거", w: W - 1500 }], [
    [{ v: "우수성", bold: true }, `실제로 돌아가는 서비스. 강좌 ${nf(S.total)}개, 개방 데이터 ${N}종을 같은 날 자료로 처리하고 테스트 28개가 저장소에 올라갈 때마다 결과를 다시 확인`],
    [{ v: "구체성", bold: true }, `숫자가 전부 재현됨 (퇴근 후 ${SC["직장인_4곳_19시이후"]}개, 어린이 수영 ${SC["어린이_수영_4곳"]}개, 1년 넘게 변경 없는 강좌 ${nf(S.stale)}개 등). 자료 문제 5가지를 실제 값과 함께 제시`],
    [{ v: "독창성", bold: true }, "흩어진 강좌를 '시간·대상'으로 다시 묶고, 다른 데이터(입출차)로 주차 붐빔을 더함. 자료가 오래됐을 수 있음을 화면에 표시하고 그 원인을 기관용 점검으로 넘기는 구조"],
    [{ v: "실현가능성", bold: true }, "이미 자동으로 운영 중: 매주 포털 확인·갱신, 주차 자동 기록 (2026-11-23 GitHub에서 실제 실행 확인). 정적 웹페이지·표준 라이브러리라 운영비 0원, 원천 소스 전체 공개"],
    [{ v: "공익성", bold: true }, "체육활동을 못 하는 이유 1위인 시간 부족(58.4%)과 참여율이 낮은 10대·70대 이상을 첫 화면 버튼으로. 로그인 없이, 글자 크게, 가족에게 링크로"],
  ], { size: 17 }),

  H1("2. 활용사례의 독창성"),
  H2("2-1. 활용 공공데이터"),
  table([{ h: "공공데이터", w: 3300 }, { h: "포털 번호", w: 1200 }, { h: "쓰는 곳", w: W - 4500 }], [
    ...K.centers.map((c) => [`${c.full} 강좌정보`, c.id, `운영 중 강좌 ${nf(KC[c.name].n)}개 (종목, 강좌명, 시간, 요일, 대상, 금액, 정원, 시작·종료일)`]),
    ["스포츠센터 강좌 정보", "15147992", "강좌 설명과 공식 안내 페이지 링크 (94개)"],
    ["실시간 주차현황 (오픈 API)", "15168686", "기관 누리집에 공개된 키로 화면에서 바로 호출 → '지금 주차 대수'. 자동 기록해 평소 값과 비교"],
    ["올림픽공원 입출차 정보", "15138735", `${PK.month.slice(0, 4)}년 ${+PK.month.slice(5)}월 입·출차 21만 5,528건 → 매시 30분 주차 차량 수 → 시각별 붐빔 지수`],
    [`한국체육산업개발 개방 데이터 ${N}종`, "전체", `건강검진. 파일 ${R.n_csv_checked}종은 내용 ${nf(R.rows_checked)}행까지, 오픈 API는 등록 정보`],
  ], { size: 17 }),
  P([t(`강좌정보 파일 4종은 센터마다 열 이름과 형식이 다릅니다(예: '강좌금액'·'수강금액'·'금액'·'수강료', 날짜 열에 기간이 든 파일과 아닌 파일). 이를 한 형식으로 맞추는 변환 규칙을 공개 코드로 만들어, 파일이 갱신되면 명령 한 줄로 화면이 다시 만들어집니다.`, { size: 19 })], { spacing: { before: 80, after: 100 } }),
  H2("2-2. 사례를 활용하게 된 배경 및 활용 우수성"),
  P([t("배경 — 시간이 없는 사람에게 필요한 것은 '시간으로 찾기'. ", { bold: true }), t("2025 국민생활체육조사(문화체육관광부, 만 10세 이상 9,000명)에서 체육활동을 전혀 하지 않은 이유 1위는 '체육활동 가능 시간이 부족해서'(58.4%)였습니다. 이용 시설은 공공체육시설이 34.0%로 가장 많았고, 이유는 '집이나 직장과 가까워서'(38.7%), '무료이거나 저렴해서'(33.2%)였습니다. 시간 여유가 생기면 하고 싶은 종목 1위는 수영(16.2%)입니다. 연령별 참여율은 10대(43.2%)와 70대 이상(59.5%)이 다른 연령대보다 낮았습니다.")]),
  P([t("지금은 어떻게 찾나. ", { bold: true }), t(`확인한 범위(2026-11-23)에서 공식 누리집의 프로그램 안내는 센터별·종목별 페이지로 되어 있어, 한 페이지에서는 한 센터의 한 종목만 보입니다. 온라인 수강신청은 센터 가입(최초 1회 약관 동의·기본정보 입력)을 거쳐야 합니다. '분당이든 일산이든 평일 저녁 8시에 할 수 있는 운동'을 찾으려면 센터별 프로그램 안내 페이지를 하나씩 열어야 합니다. 기관이 개방한 '스포츠센터 강좌 정보'에 실린 안내 페이지 링크만 ${N_PAGES}개입니다.`)]),
  P([t("차별점 1 — 시간·대상 기준으로 다시 묶음. ", { bold: true }), t("센터 단위로 흩어진 정보를 '내가 갈 수 있는 시간'과 '누구를 위한 강좌인가'로 다시 묶었습니다. 사회적으로 참여가 낮은 집단(직장인의 시간 부족, 10대, 70대 이상)을 위한 버튼을 첫 화면에 둔 것도 이 때문입니다.")]),
  P([t("차별점 2 — 정보가 오래됐을 수 있음을 숨기지 않음. ", { bold: true }), t(`공공데이터로 만든 서비스는 원천 자료가 멈추면 함께 틀려집니다. 실제로 운영 중으로 적힌 강좌 ${nf(S.total)}개 중 ${nf(S.stale)}개(${Math.round(S.stale / S.total * 100)}%)는 1년 넘게 바뀐 기록이 없습니다. 이 서비스는 그런 강좌를 그대로 보여 주지 않고 '운영 여부 센터 확인'으로 구분합니다. 그리고 같은 문제를 기관용 건강검진으로 넘겨 원천에서 고치게 합니다. 시민 서비스와 데이터 품질 관리를 한 고리로 묶은 것이 이 사례의 핵심입니다.`)]),
  P([t("AI 활용 방식. ", { bold: true }), t("판정과 변환은 전부 공개된 규칙으로 합니다. 생성형 AI(Claude)는 설명문 오탈자 후보를 찾는 데만 썼고, 포털 원문에 그 글자가 그대로 있는지 대조해 확인된 11건만 남겼습니다.")]),

  H1("3. 활용사례의 구체성"),
  H2("3-1. 사용 장면 세 가지"),
  P("아래 숫자는 모두 최근 1년 안에 바뀐 기록이 있는 강좌만 센 것입니다."),
  table([{ h: "누가", w: 2100 }, { h: "화면에서 하는 일", w: 3300 }, { h: "결과", w: W - 5400 }], [
    ["송파에서 일하는 직장인, 퇴근 후 운동", "'퇴근 후' 버튼 → 센터에서 올림픽수영장·올림픽스포츠센터", `평일 19시 이후 강좌 ${SC["직장인_올림픽공원_19시이후"]}개 (4곳 전체 ${SC["직장인_4곳_19시이후"]}개, 그중 수영 ${SC["직장인_4곳_19시이후_수영"]}개). 평일 19~20시 주차 지수 ${pk("weekday", 19)}(보통)`],
    ["일산·분당에 사는 초등학생 부모", "'아이와' 버튼 → 종목 수영", `어린이 대상 강좌 ${SC["어린이_4곳"]}개, 그중 수영 ${SC["어린이_수영_4곳"]}개를 시작 시각 순으로`],
    ["부모님 운동을 찾아 드리는 자녀", "'실버' 버튼 → '이 조건으로 링크 복사' → 메시지로 전송", `어르신 대상으로 적힌 강좌 ${SC["실버_4곳"]}개. 부모님은 링크를 열고 '글자 크게'로 봄`],
  ], { size: 17 }),
  H2("3-2. 강좌 찾기가 보여 주는 것"),
  P(`2026-11-23에 공공데이터포털에서 받은 파일로 만든 결과입니다. 운영 중 강좌는 종료일이 9999-12-31로 적힌 강좌(파일 설명의 정의)이고, 강좌번호마다 가장 최근 행만 씁니다. 최근 1년 안에 바뀐 기록이 있는 강좌는 ${nf(fresh)}개입니다.`),
  table([{ h: "센터", w: 2000 }, { h: "운영 중", w: 850 }, { h: "1년 넘게 변경 없음", w: 1250 }, { h: "평일 19시 이후", w: 1050 }, { h: "주말", w: 750 }, { h: "어린이", w: 800 }, { h: "실버", w: 700 }, { h: "수영 1회 환산", w: 1188 }, { h: "마지막 달", w: 1050 }], centerRows, { size: 16 }),
  P([t(`수영 1회 환산 강습비(중앙값)는 ${swim}입니다. 월 강습비를 주당 횟수×4.345주로 나눈 추정값이며, 자료의 금액은 할인 전 기본 금액입니다(공식 안내의 중고생·실버 요금은 자료에 없음). 실버는 강좌명·대상에 '실버·어르신·65세 이상' 등이 적힌 강좌만 셌습니다. 성인 강좌에 어르신이 참여할 수 있으므로 어르신 강좌가 ${S.senior}개뿐이라는 뜻은 아니고, 자료에서 어르신 강좌로 찾을 수 있는 것이 ${S.senior}개라는 뜻입니다. 기관이 대상 연령을 열로 적어 주면 고령 이용자도 바로 찾을 수 있습니다.`, { size: 18 })], { spacing: { before: 80, after: 100 } }),
  ...img("grid.png", 600, 185, "그림 2. 시간표로 고르기 — 요일 × 시작 시각별 강좌 수 (짙을수록 많음). 칸을 누르면 그 시간 강좌만 표시"),
  H2("3-3. 다른 데이터와 결합: 올림픽공원 주차 붐빔"),
  P(`올림픽공원 입출차 정보는 입차·출차 시각만 있는 21만 건의 기록입니다. 이를 매시 30분에 주차장에 있던 차량 수로 바꾸고, 가장 많은 시각을 100으로 둔 지수로 만들었습니다(같은 행 반복은 한 번만 셈. 빼지 않아도 모양은 같음). 평일은 ${pkMaxH("weekday")}시(${Math.max(...PK.weekday)}), 주말은 ${pkMaxH("weekend")}시(100)가 가장 붐볐고, 퇴근 후 강좌 시간인 평일 19~20시는 ${pk("weekday", 19)} 안팎입니다. 주말 오후에 차를 가져가려는 사람에게는 오전 강좌나 대중교통을 고려할 근거가 됩니다.`),
  P([t("예측으로 쓸 수 있는가 — 직접 검증. ", { bold: true }), t(`하루를 빼고 나머지 같은 종류(평일·주말) 날의 평균으로 그 하루를 맞혀 보는 방식으로 31일을 모두 검증했습니다. ${PK.forecast.n_days}일 중 ${PK.forecast.n_within_15}일은 시각별 오차가 평균 15% 안이었고 오차 중앙값은 ${PK.forecast.mape_median}%입니다. 즉 보통 날은 요일과 시각만으로 꽤 맞습니다. 반면 가장 붐빈 ${+PK.forecast.busiest_day.slice(5, 7)}월 ${+PK.forecast.busiest_day.slice(8)}일은 최고 ${nf(PK.forecast.busiest_peak)}대로 보통 날 최고(${nf(PK.forecast.median_peak)}대)의 ${(PK.forecast.busiest_peak / PK.forecast.median_peak).toFixed(1)}배였고, 기관의 영문 공연정보에는 그 주말(7월 20일) 날짜의 공연이 2건 올라 있습니다. 공연·행사 날은 요일만으로 예측할 수 없다는 뜻입니다. 그래서 화면은 평균선에 '가장 적었던 날~가장 많았던 날' 띠를 함께 그리고, 그런 날은 실시간 주차 값을 보도록 안내합니다. 한 달 기록(${PK.month.slice(0, 4)}년 ${+PK.month.slice(5)}월)이라 계절 차이는 담지 못합니다.`)]),
  ...img("parking.png", 560, 224, "그림 3. 올림픽공원 주차장 시각별 붐빔 지수 — 선은 평균, 옅은 띠는 가장 적었던 날~많았던 날"),
  H2("3-4. SQL·통계 분석 (서비스의 '데이터 분석' 화면)"),
  P(`원본 파일을 SQLite 데이터베이스에 넣고(강좌 ${nf(AN.tables.courses)}행, 입출차 ${nf(AN.tables.parking)}행), 질문마다 SQL 한 개로 답을 냈습니다. 질의 ${AN.queries.length}개와 결과·해석·한계를 서비스의 '데이터 분석' 화면에 그대로 공개했고, 명령 한 줄(python analysis/run.py)로 같은 숫자가 다시 나옵니다. 중앙값은 창 함수로, 30분 간격 주차 대수는 재귀 CTE로 만든 시간 격자와의 조인으로 구했습니다.`),
  table([{ h: "질문", w: 2500 }, { h: "방법", w: 2300 }, { h: "결과", w: W - 4800 }], [
    ["퇴근 후에 쓸 수 있는 자리는 얼마나 되나", "시간대별 정원 합계 (GROUP BY, 창 함수 비율)", `정원의 ${seatEve[3]}%(${nf(seatEve[2])}자리)만 19시 이후 시작. 낮 시간대에 몰려 있음`],
    ["들어온 차는 얼마나 머무나", "머문 시간 중앙값·구간 비율 (ROW_NUMBER)", `평일 입차의 ${stayWd[3]}%는 10분 안에 나감(통과·하차). 중앙값 ${stayWd[2]}분. 통과 차량을 빼야 주차 수요가 맞음`],
    ["강좌 시작 전에 차가 몰리나", "시각별 강좌 정원 ↔ 시작 전후 입차, 상관계수와 순열 검정(2만 번)", `r = ${AS.corr.r} (p = ${AS.corr.p}), 6시를 빼도 r = ${AS.corr.r_excl6}. 강좌 시간표가 주차 수요를 일부 설명 → 강좌 화면에 주차 정보를 붙인 근거`],
    ["붐비는 날 어느 주차구역이 덜 차나", "구역별 만차가 된 날의 비율·처음 만차 시각 (CTE, 창 함수)", `${AQ.zone_full.rows.slice(0, 3).map((r) => r[0]).join("·")}는 만차 비율 ${AQ.zone_full.rows[0][3]}~${AQ.zone_full.rows[2][3]}%로 가장 낮고 ${AQ.zone_full.rows.slice(-1)[0][0]}은 ${AQ.zone_full.rows.slice(-1)[0][3]}%. 만차는 13~14시에 시작 → 화면에서 구역·도착 시각 안내`],
    ["주말이 평일보다 더 붐비나", "날짜별 최고 대수 평균 차이, 부트스트랩 95% 신뢰구간", `평일 ${nf(AS.peak.weekday_mean)}±${AS.peak.weekday_sd}대로 일정. 주말과의 차이 +${AS.peak.diff[0]}대(구간 ${AS.peak.diff[1]}~${AS.peak.diff[2]}, 0 포함). 행사 주말을 빼면 +${AS.peak.diff_excl_event[0]}대 → 붐빔은 요일이 아니라 행사가 가름`],
  ], { size: 16 }),
  P([t("한계: 강좌는 2026년, 입출차는 2024년 7월 자료로 시점이 다르고, 상관은 인과가 아닙니다. 주말은 8일뿐이라 신뢰구간이 넓습니다. 이 결과가 5-3의 '공연·날씨를 넣은 예측' 계획의 근거입니다.", { size: 17, color: "5A6A66" })], { spacing: { before: 60, after: 100 } }),
  H2("3-5. 만들면서 찾은 자료 문제와 처리"),
  P("강좌 정보를 시민에게 그대로 보여 주면 틀리는 지점이 있었습니다. 각 문제를 화면에서는 어떻게 처리했고, 기관은 무엇을 고치면 되는지 나눴습니다."),
  table([{ h: "문제", w: 1900 }, { h: "실제 자료", w: 3300 }, { h: "시민 화면 처리", w: 2500 }, { h: "기관이 고칠 것", w: W - 7700 }], problemRows, { size: 16 }),
  H2("3-6. 기관용 건강검진 결과"),
  P(`같은 날 개방 데이터 ${N}종을 점검한 결과 점검 필요 ${g["점검 필요"] || 0}종, 주의 ${g["주의"] || 0}종, 양호 ${g["양호"] || 0}종이고 기관 전체에 걸친 문제가 ${orgMain.length}건입니다. 잘 되어 있는 점도 분명합니다. 42종은 규칙상 문제가 없고, 실시간 주차 API는 키와 호출 허용 설정이 열려 있어 별도 신청 없이 서비스에 바로 붙일 수 있었습니다. 고칠 곳의 예로, 주차장 혼잡도 정보는 월간 갱신인데 차기 등록 예정일(${c1 ? c1.next : ""})이 지나도록 새 파일이 없고, 올림픽공원 핫뉴스 정보의 설명은 다른 데이터(정보목록) 설명이 복사되어 있습니다. 기관의 개방목록 파일(42종)에는 포털에 있는 17종이 빠져 있습니다.`),
  table([{ h: "규칙", w: 2700 }, { h: "판정", w: 1400 }, { h: "내용", w: W - 4100 }], ruleRows, { size: 16 }),
  P([t("판정이 필요한 데이터 전체", { bold: true, size: 19 })], { spacing: { before: 160, after: 60 }, keepNext: true }),
  table([{ h: "판정", w: 1300 }, { h: "데이터", w: 2700 }, { h: "발견 사항", w: W - 4000 }], flaggedRows, { size: 15 }),
  ...img("org.png", 520, 342, "그림 4. 건강검진 — 기관 전체에서 보이는 문제 (개방목록 누락, 신청 필요 항목 미개방 등)"),

  H1("4. 사례의 활용 적절성"),
  P("심사 관점에서 공공성·경제성·기술성을 근거와 한계로 나눠 스스로 점검했습니다. 한계는 숨기지 않고 대응 방법과 함께 적었습니다."),
  table([{ h: "관점", w: 1300 }, { h: "근거 (모두 자료에서 다시 계산됨)", w: 5000 }, { h: "한계와 대응", w: W - 6300 }], [
    [{ v: "공공성\n(시민)", bold: true }, `· 체육활동을 못 하는 이유 1위 '시간 부족'(58.4%)에 맞춰 시간으로 찾기. 평일 19시 이후 강좌는 최근 강좌의 ${evePct}%(${SC["직장인_4곳_19시이후"]}개)뿐이라 직접 찾기 어려움\n· 참여율이 낮은 10대·70대 이상을 위한 버튼, 글자 크게, 가족에게 링크 보내기\n· 기관 '자주 묻는 질문' ${FAQ.total}건 중 ${FAQ.parking}건이 주차 → 지금 주차 대수와 시각별 붐빔 제공\n· 로그인·설치·광고 없음, 개인정보를 받지 않음`, "대상이 센터 4곳(송파·고양·성남). 변환 규칙의 열 이름 대응표를 바꾸면 다른 공공체육시설 강좌 파일로 넓힐 수 있음(파일마다 확인 필요)"],
    [{ v: "경제성\n(기관·시민)", bold: true }, `· 운영비 0원: 서버 없는 정적 페이지, 무료 자동 실행으로 매주 갱신\n· 기관: 강좌 안내가 '온라인 수강신청'으로 바로 이어져 등록 경로가 짧아짐. 품질 점검을 사람이 ${N}종 열어 보는 대신 자동 결과로 받음\n· 시민: 센터 간 1회 환산 강습비 비교(수영 약 4,400~5,000원, 추정)로 가까운 곳·싼 곳을 고름`, "등록 증가·문의 감소 효과는 아직 측정값이 없음. 공개 후 기관 협조로 수강신청 유입 수를 재면 확인 가능"],
    [{ v: "기술성", bold: true }, `· 센터마다 다른 4개 형식을 한 형식으로 맞추는 공개 규칙 + 테스트 28개, 올릴 때마다 결과 재현 확인\n· 실시간 API·기록 파일 3종 결합(강좌, 입출차 21만 건, 실시간 주차)\n· 정리된 강좌 자료를 CSV로 다시 공개 → 지도·챗봇 등 다른 서비스가 그대로 사용\n· 휴대폰 홈 화면 설치, 오프라인 열람, 키보드 조작·화면낭독 표기`, "남은 자리·신청 기간이 공개 자료에 없어 '지금 신청 가능'은 못 보여 줌 → 5-3에 개방 제안. 주차 붐빔은 2024년 7월 한 달 기록 → 자동으로 쌓는 기록으로 보강 중"],
  ], { size: 16 }),

  H1("5. 실현가능성 및 기타"),
  H2("5-1. 추진 일정 및 개발·운영 계획"),
  table([{ h: "시기", w: 2200 }, { h: "내용", w: W - 2200 }], [
    ["2026.11 (완료)", `강좌 찾기(실시간 주차·주차 붐빔·검색·캘린더·링크 공유·글자 크게·홈 화면 설치)·건강검진 화면, 변환·점검 규칙, 테스트 28개. 매주 자료 자동 갱신·주차 자동 기록 가동.`],
    ["2026.12", "심사 의견 반영. 화면 글자 크기·대비 등 고령 이용자 접근성 점검."],
    ["2027 ~ 2028 (분기마다)", "자동 갱신 유지, 쌓인 주차 기록으로 요일·계절별 붐빔 보강. 분기마다 건강검진 재점검해 고쳐진 항목 표시. 기관 협조 시 남은 자리 등 신청 정보 연동."],
  ], { size: 18 }),
  H2("5-2. 서비스 유지 계획 (2028년까지 운영 가능 여부)"),
  P("2028년까지 운영할 수 있습니다. 화면은 정적 웹페이지(GitHub Pages)라 서버·유지 비용이 없고, 코드는 Python 표준 라이브러리만 씁니다. 사람이 손대지 않아도 매주 월요일 포털의 강좌 파일 수정일을 확인해 바뀌면 내려받고, 테스트를 통과한 경우에만 화면을 다시 만들어 배포합니다. 포털의 내려받기 제한이 뜨면 멈추고 기존 자료를 유지합니다. 주차 기록은 예약 실행으로 자동으로 쌓입니다. 수상 시 원천 소스는 저장소 전체를 그대로 제공하며, 기관이 직접 운영할 경우 같은 절차를 내부에서 돌리면 됩니다."),
  P([t("한계. ", { bold: true }), t("남은 자리와 신청 기간은 공개 자료에 없어 '지금 신청할 수 있는지'는 보여 주지 못합니다. 1회 환산 강습비는 추정이고, 1년 넘게 바뀐 기록이 없는 강좌가 실제로 끝났는지는 자료로 알 수 없어 '확인'으로만 표시합니다. 대상은 한국체육산업개발 센터 4곳(서울 송파, 경기 고양·성남)입니다.")]),
  H2("5-3. 추가 개방이 필요한 공공데이터 (의견)"),
  B([t("강좌별 남은 자리·신청 기간·선착순/추첨 여부: ", { bold: true }), t("시민이 신청 전에 가장 먼저 찾는 정보입니다. 같은 강좌번호로 이어 붙일 수 있게 개방되면 '지금 신청 가능한 퇴근 후 수영'까지 바로 보여 줄 수 있습니다.")]),
  B([t("수강 만족도·후기: ", { bold: true }), t("강좌별 만족도 조사 결과가 개방되면 '평이 좋은 강좌' 추천까지 넓힐 수 있습니다. 지금 추천은 자료로 확인되는 조건만 씁니다.")]),
  B([t("대상별 요금과 대상 연령 열: ", { bold: true }), t("공식 안내에는 중고생·실버 요금이 있지만 자료에는 기본 금액 하나뿐입니다. 대상 연령이 열로 있으면 어르신·청소년 강좌를 정확히 찾을 수 있습니다.")]),
  B([t("주차 예측 고도화 계획: ", { bold: true }), t("기관이 문화공공데이터광장에 연 '올림픽공원 2025 차량입출차·공연·날씨 연계 데이터'(1년치)와 자동으로 쌓고 있는 실시간 기록을 더하면, 요일·시각에 공연 유무·날씨·계절을 넣은 예측으로 넓힐 수 있습니다. 같은 검증 방식(하루 빼고 맞혀 보기)으로 오차를 공개하겠습니다. 주차면 수가 함께 개방되면 '남은 자리'로 바꿔 보여 줄 수 있습니다.")]),
  B([t("올림픽공원 입출차 정보의 다른 달과 주차구역 열: ", { bold: true }), t("설명대로 다른 연월이 개방되고 구역 열이 생기면, 계절별·구역별 붐빔으로 바로 넓힐 수 있습니다.")]),
  B([t("데이터마다 '데이터 기준일' 항목: ", { bold: true }), t("포털 수정일과 별도로 있으면 이용자가 자료의 최신성을 바로 압니다 (이번 점검에서 58종 중 44종의 수정일이 같은 날에 몰려 있었음).")]),
  P([t("개발 과정에서 AI 코딩 도구(Claude Code)를 활용했으며, 규칙과 판정 기준은 참가자가 정하고 결과를 원본 자료와 대조해 검증했습니다.", { size: 17, color: "5A6A66" })], { spacing: { before: 200 } }),
];
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: C.ink }, paragraph: { spacing: { before: 320, after: 140 }, keepNext: true, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.ink, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 23, bold: true, color: C.ok }, paragraph: { spacing: { before: 220, after: 100 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "dot", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [t("공공스포츠 강좌 찾기  ", { size: 16, color: "7A8884" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "7A8884" })] })] }) },
    children: [...summary, ...detail],
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log("wrote", OUT, b.length); });
