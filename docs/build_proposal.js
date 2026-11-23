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

// ---- 요약서 ----
const summary = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t("2026년도 공공데이터 활용 경진대회", { size: 22, color: "5A6A66" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t("기획 요약서", { size: 36, bold: true })] }),
  table([{ h: "항목", w: 2000 }, { h: "내용", w: W - 2000 }], [
    [{ v: "1. 활용사례명", bold: true }, "내 시간에 맞는 공공스포츠 강좌 찾기 — 한국체육산업개발 스포츠센터 4곳의 강좌를 로그인 없이 요일·시간·대상으로 찾고, 자료가 최신인지까지 보여 주는 웹 서비스 (기관용 '공공데이터 건강검진' 포함)"],
    [{ v: "2. 사용한 공공데이터명", bold: true }, `올림픽수영장 강좌정보, 올림픽스포츠센터 강좌정보, 일산스포츠센터 강좌정보, 분당스포츠센터 강좌정보, 스포츠센터 강좌 정보(설명·안내 링크)\n건강검진: 한국체육산업개발(주) 개방 데이터 ${N}종 전체(파일 ${files.length}종 · 오픈 API ${apis.length}종)`],
    [{ v: "3. 요약", bold: true }, `생활체육을 하지 않는 이유 1위는 '시간 부족'(58.4%, 2025 국민생활체육조사)입니다. 그런데 센터 4곳의 강좌 정보는 센터·종목별 페이지에 흩어져 있어 '평일 저녁 7시 이후에 갈 수 있는 강좌'를 한 번에 찾기 어렵습니다. 이 서비스는 강좌정보 파일 4종을 한 형식으로 맞춰 운영 중 강좌 ${nf(S.total)}개를 퇴근 후·주말·아이와·청소년·실버 버튼 한 번으로 찾게 합니다. 강좌마다 자료에서 마지막으로 바뀐 달을 붙이고, 1년 넘게 바뀐 기록이 없거나 시작일이 비어 있는 ${nf(S.stale)}개는 '운영 여부 센터 확인'으로 따로 표시해 오래된 정보로 헛걸음하지 않게 합니다. 이 과정에서 찾은 자료 문제(종료 처리 안 된 강좌, 날짜 열에 기간이 든 것, 요일 칸에 강습일·자유이용일이 섞인 것)와 개방 데이터 ${N}종의 점검 결과를 기관용 화면으로 함께 제공합니다.`],
    [{ v: "4. 기대효과", bold: true }, `① 시민: 센터 4곳 강좌를 한 화면에서 내 시간 기준으로 비교 (평일 19시 이후 시작 ${S.evening}개, 주말 ${S.weekend}개)\n② 시민: 강좌마다 '최근 변경 ○년 ○월' 표시로 오래된 정보를 걸러 봄\n③ 기관: 시민 화면을 틀리게 만드는 자료 문제와 고치는 방법을 데이터별로 받음 → 품질관리 수준진단·평가 대응\n④ 정적 웹페이지·공개 코드라 운영비 0원, 같은 스크립트로 2028년까지 재갱신`],
  ], { size: 19 }),
  ...img("find_top.png", 480, 358, "그림 1. 강좌 찾기 — '퇴근 후' 버튼 하나로 센터 4곳의 평일 19시 이후 강좌를 시작 시각 순으로"),
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
  ["갱신예정일 · 설명복사", "점검 필요", "차기 등록 예정일이 지났는데 새 파일 없음 / 설명이 다른 데이터 설명을 복사"],
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
  P("한국체육산업개발이 운영하는 스포츠센터 4곳(올림픽수영장, 올림픽스포츠센터, 일산·분당 올림픽스포츠센터)의 강좌를 한 화면에서 찾는 시민용 웹 서비스입니다. 화면은 두 개이고 같은 데이터·같은 코드에서 만들어집니다."),
  P([t("① 강좌 찾기 (시민용)", { bold: true })]),
  B([t("빠르게 고르기: ", { bold: true }), t(`'퇴근 후(평일 19시부터)', '주말', '아이와', '청소년', '실버' 버튼을 누르면 해당 강좌만 남습니다. 버튼마다 지금 조건에서 몇 개가 나오는지 함께 보입니다.`)]),
  B([t("자세히 거르기: ", { bold: true }), t("센터, 종목, 요일, 시작 시각대, 대상으로 거르고 시작 시각 순 또는 1회 환산 강습비 순으로 정렬합니다. 로그인·설치 없이 휴대폰에서도 됩니다.")]),
  B([t("자료 신선도 표시: ", { bold: true }), t("강좌마다 자료에서 마지막으로 바뀐 달('최근 변경 2026.8')을 붙입니다. 1년 넘게 바뀐 기록이 없는 강좌는 기본으로 숨기고, 보이게 하면 '운영 여부 센터 확인'이라고 표시합니다.")]),
  B([t("요일 띠와 센터 비교: ", { bold: true }), t("강좌마다 월~일 일곱 칸으로 요일을 보여 주고, 센터 4곳의 퇴근 후·주말·어린이·실버 강좌 수와 수영 1회 환산 강습비를 표로 비교합니다. 신청은 '센터 안내 보기' 링크로 공식 누리집에서 합니다.")]),
  P([t("② 데이터 건강검진 (기관용)", { bold: true })]),
  B(`기관 개방 데이터 ${N}종을 같은 규칙으로 점검해 '점검 필요·주의·양호'와 근거, 고치는 방법을 보여 줍니다. 강좌 찾기를 만들며 걸린 자료 문제도 규칙으로 넣어, 시민 화면을 틀리게 만드는 원인을 기관이 바로 고칠 수 있게 했습니다.`),
  H2("1-3. 활용사례 서비스 확인 방법"),
  table([{ h: "구분", w: 2000 }, { h: "주소", w: W - 2000 }], [
    ["강좌 찾기", SITE],
    ["데이터 건강검진", SITE + "check.html"],
    ["소스 코드 · 규칙 · 원본 자료", REPO],
  ], { size: 19 }),

  H1("2. 활용사례의 독창성"),
  H2("2-1. 활용 공공데이터"),
  table([{ h: "공공데이터", w: 3300 }, { h: "포털 번호", w: 1200 }, { h: "쓰는 곳", w: W - 4500 }], [
    ...K.centers.map((c) => [`${c.full} 강좌정보`, c.id, `운영 중 강좌 ${nf(KC[c.name].n)}개 (종목, 강좌명, 시간, 요일, 대상, 금액, 정원, 시작·종료일)`]),
    ["스포츠센터 강좌 정보", "15147992", "강좌 설명과 공식 안내 페이지 링크 (94개)"],
    [`한국체육산업개발 개방 데이터 ${N}종`, "전체", `건강검진. 파일 ${R.n_csv_checked}종은 내용 ${nf(R.rows_checked)}행까지, 오픈 API는 등록 정보`],
  ], { size: 17 }),
  P([t(`강좌정보 파일 4종은 센터마다 열 이름과 형식이 다릅니다(예: '강좌금액'·'수강금액'·'금액'·'수강료', 날짜 열에 기간이 든 파일과 아닌 파일). 이를 한 형식으로 맞추는 변환 규칙을 공개 코드로 만들어, 파일이 갱신되면 명령 한 줄로 화면이 다시 만들어집니다.`, { size: 19 })], { spacing: { before: 80, after: 100 } }),
  H2("2-2. 사례를 활용하게 된 배경 및 활용 우수성"),
  P([t("배경 — 시간이 없는 사람에게 필요한 것은 '시간으로 찾기'. ", { bold: true }), t("2025 국민생활체육조사(문화체육관광부, 만 10세 이상 9,000명)에서 체육활동을 전혀 하지 않은 이유 1위는 '체육활동 가능 시간이 부족해서'(58.4%)였습니다. 이용 시설은 공공체육시설이 34.0%로 가장 많았고, 이유는 '집이나 직장과 가까워서'(38.7%), '무료이거나 저렴해서'(33.2%)였습니다. 시간 여유가 생기면 하고 싶은 종목 1위는 수영(16.2%)입니다. 연령별 참여율은 10대(43.2%)와 70대 이상(59.5%)이 다른 연령대보다 낮았습니다.")]),
  P([t("지금은 어떻게 찾나. ", { bold: true }), t("확인한 범위(2026-11-23)에서 공식 누리집의 프로그램 안내는 센터별·종목별 페이지로 되어 있어, 한 페이지에서는 한 센터의 한 종목만 보입니다. 온라인 수강신청은 센터 가입(최초 1회 약관 동의·기본정보 입력)을 거쳐야 합니다. '분당이든 일산이든 평일 저녁 8시에 할 수 있는 운동'을 찾으려면 센터 4곳 × 종목 수만큼 페이지를 열어야 합니다.")]),
  P([t("차별점 1 — 시간·대상 기준으로 다시 묶음. ", { bold: true }), t("센터 단위로 흩어진 정보를 '내가 갈 수 있는 시간'과 '누구를 위한 강좌인가'로 다시 묶었습니다. 사회적으로 참여가 낮은 집단(직장인의 시간 부족, 10대, 70대 이상)을 위한 버튼을 첫 화면에 둔 것도 이 때문입니다.")]),
  P([t("차별점 2 — 정보가 오래됐을 수 있음을 숨기지 않음. ", { bold: true }), t(`공공데이터로 만든 서비스는 원천 자료가 멈추면 함께 틀려집니다. 실제로 운영 중으로 적힌 강좌 ${nf(S.total)}개 중 ${nf(S.stale)}개(${Math.round(S.stale / S.total * 100)}%)는 1년 넘게 바뀐 기록이 없습니다. 이 서비스는 그런 강좌를 그대로 보여 주지 않고 '운영 여부 센터 확인'으로 구분합니다. 그리고 같은 문제를 기관용 건강검진으로 넘겨 원천에서 고치게 합니다. 시민 서비스와 데이터 품질 관리를 한 고리로 묶은 것이 이 사례의 핵심입니다.`)]),
  P([t("AI 활용 방식. ", { bold: true }), t("판정과 변환은 전부 공개된 규칙으로 합니다. 생성형 AI(Claude)는 설명문 오탈자 후보를 찾는 데만 썼고, 포털 원문에 그 글자가 그대로 있는지 대조해 확인된 11건만 남겼습니다.")]),

  H1("3. 활용사례의 구체성"),
  H2("3-1. 강좌 찾기가 보여 주는 것"),
  P(`2026-11-23에 공공데이터포털에서 받은 파일로 만든 결과입니다. 운영 중 강좌는 종료일이 9999-12-31로 적힌 강좌(파일 설명의 정의)이고, 강좌번호마다 가장 최근 행만 씁니다. 최근 1년 안에 바뀐 기록이 있는 강좌는 ${nf(fresh)}개입니다.`),
  table([{ h: "센터", w: 2000 }, { h: "운영 중", w: 850 }, { h: "1년 넘게 변경 없음", w: 1250 }, { h: "평일 19시 이후", w: 1050 }, { h: "주말", w: 750 }, { h: "어린이", w: 800 }, { h: "실버", w: 700 }, { h: "수영 1회 환산", w: 1188 }, { h: "마지막 달", w: 1050 }], centerRows, { size: 16 }),
  P([t(`수영 1회 환산 강습비(중앙값)는 ${swim}입니다. 월 강습비를 주당 횟수×4.345주로 나눈 추정값이며, 자료의 금액은 할인 전 기본 금액입니다(공식 안내의 중고생·실버 요금은 자료에 없음). 실버는 강좌명·대상에 '실버·어르신·65세 이상' 등이 적힌 강좌만 셌습니다. 성인 강좌에 어르신이 참여할 수 있으므로 어르신 강좌가 ${S.senior}개뿐이라는 뜻은 아니고, 자료에서 어르신 강좌로 찾을 수 있는 것이 ${S.senior}개라는 뜻입니다. 기관이 대상 연령을 열로 적어 주면 고령 이용자도 바로 찾을 수 있습니다.`, { size: 18 })], { spacing: { before: 80, after: 100 } }),
  H2("3-2. 만들면서 찾은 자료 문제와 처리"),
  P("강좌 정보를 시민에게 그대로 보여 주면 틀리는 지점이 있었습니다. 각 문제를 화면에서는 어떻게 처리했고, 기관은 무엇을 고치면 되는지 나눴습니다."),
  table([{ h: "문제", w: 1900 }, { h: "실제 자료", w: 3300 }, { h: "시민 화면 처리", w: 2500 }, { h: "기관이 고칠 것", w: W - 7700 }], problemRows, { size: 16 }),
  ...img("centers.png", 600, 241, "그림 2. 센터 4곳 한눈에 — 같은 기준으로 센터별 강좌 수와 자료 상태 비교"),
  H2("3-3. 기관용 건강검진 결과"),
  P(`같은 날 개방 데이터 ${N}종을 점검한 결과 점검 필요 ${g["점검 필요"] || 0}종, 주의 ${g["주의"] || 0}종, 양호 ${g["양호"] || 0}종이고 기관 전체에 걸친 문제가 ${orgMain.length}건입니다. 예를 들어 주차장 혼잡도 정보는 월간 갱신인데 차기 등록 예정일(${c1 ? c1.next : ""})이 지나도록 새 파일이 없고, 올림픽공원 핫뉴스 정보의 설명은 다른 데이터(정보목록) 설명이 복사되어 있습니다. 기관의 개방목록 파일(42종)에는 포털에 있는 17종이 빠져 있습니다.`),
  table([{ h: "규칙", w: 2700 }, { h: "판정", w: 1400 }, { h: "내용", w: W - 4100 }], ruleRows, { size: 16 }),
  P([t("판정이 필요한 데이터 전체", { bold: true, size: 19 })], { spacing: { before: 160, after: 60 }, keepNext: true }),
  table([{ h: "판정", w: 1300 }, { h: "데이터", w: 2700 }, { h: "발견 사항", w: W - 4000 }], flaggedRows, { size: 15 }),
  ...img("org.png", 520, 342, "그림 3. 건강검진 — 기관 전체에서 보이는 문제 (개방목록 누락, 신청 필요 항목 미개방 등)"),

  H1("4. 사례의 활용 적절성"),
  B([t("시민: ", { bold: true }), t("퇴근이 늦는 직장인, 방과 후 시간이 정해진 청소년, 낮 시간에 다니는 어르신이 각자의 시간으로 센터 4곳 강좌를 한 번에 비교합니다. 정보가 오래됐을 수 있는 강좌는 표시로 구분해 헛걸음을 줄입니다.")]),
  B([t("기관: ", { bold: true }), t("시민 화면이 틀리는 원인이 데이터별 '고칠 것'으로 정리되어 옵니다. 결과 파일(summary.csv)은 조치 기록으로 쓸 수 있고, 행정안전부 공공데이터 품질관리 수준진단·평가의 '데이터 품질진단·진단결과 조치' 근거가 됩니다.")]),
  B([t("다른 데이터 서비스: ", { bold: true }), t("변환된 강좌 자료(courses.js)와 규칙이 공개되어 있어, 지도·챗봇 등 다른 서비스가 같은 형식의 자료를 그대로 가져다 쓸 수 있습니다.")]),
  B([t("확장: ", { bold: true }), t("건강검진 규칙은 공공데이터포털 공통 등록 정보를 쓰므로 다른 기관 데이터에도 적용할 수 있습니다. 강좌 변환 규칙은 열 이름 대응표만 바꾸면 다른 공공체육시설 강좌 파일에도 쓸 수 있습니다(대상 파일마다 확인 필요).")]),

  H1("5. 실현가능성 및 기타"),
  H2("5-1. 추진 일정 및 개발·운영 계획"),
  table([{ h: "시기", w: 2200 }, { h: "내용", w: W - 2200 }], [
    ["2026.11 (완료)", `강좌 찾기·건강검진 화면, 변환·점검 규칙, 단위 테스트 20개 완성. 2026-11-23 자료로 1차 공개.`],
    ["2026.12", "심사 의견 반영. 화면 글자 크기·대비 등 고령 이용자 접근성 점검."],
    ["2027 ~ 2028 (분기마다)", "강좌 파일 갱신 때 같은 스크립트로 다시 만들고, 이전 점검과 비교해 고쳐진 항목 표시. 기관 협조 시 오픈 API 응답까지 점검."],
  ], { size: 18 }),
  H2("5-2. 서비스 유지 계획 (2028년까지 운영 가능 여부)"),
  P("2028년까지 운영할 수 있습니다. 화면은 정적 웹페이지(GitHub Pages)라 서버·유지 비용이 없고, 코드는 Python 표준 라이브러리만 씁니다. 저장소에 올라가면 테스트를 돌린 뒤 같은 결과가 다시 나오는지 확인하고 배포합니다. 수상 시 원천 소스는 저장소 전체를 그대로 제공하며, 기관이 직접 운영할 경우 같은 절차를 내부에서 돌리면 됩니다."),
  P([t("한계. ", { bold: true }), t("남은 자리와 신청 기간은 공개 자료에 없어 '지금 신청할 수 있는지'는 보여 주지 못합니다. 1회 환산 강습비는 추정이고, 1년 넘게 바뀐 기록이 없는 강좌가 실제로 끝났는지는 자료로 알 수 없어 '확인'으로만 표시합니다. 대상은 한국체육산업개발 센터 4곳(서울 송파, 경기 고양·성남)입니다.")]),
  H2("5-3. 추가 개방이 필요한 공공데이터 (의견)"),
  B([t("강좌별 남은 자리·신청 기간·선착순/추첨 여부: ", { bold: true }), t("시민이 신청 전에 가장 먼저 찾는 정보입니다. 같은 강좌번호로 이어 붙일 수 있게 개방되면 '지금 신청 가능한 퇴근 후 수영'까지 바로 보여 줄 수 있습니다.")]),
  B([t("대상별 요금과 대상 연령 열: ", { bold: true }), t("공식 안내에는 중고생·실버 요금이 있지만 자료에는 기본 금액 하나뿐입니다. 대상 연령이 열로 있으면 어르신·청소년 강좌를 정확히 찾을 수 있습니다.")]),
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
