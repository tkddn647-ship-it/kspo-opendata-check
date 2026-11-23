// 기획서(.docx) 생성: node docs/build_proposal.js <findings.json> <출력.docx>
// 표의 숫자와 목록은 점검 결과 파일(findings.json)에서 그대로 가져온다.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType,
  HeadingLevel, WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, Footer, PageNumber,
} = require("docx");

const R = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const OUT = process.argv[3];
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

// ---- 요약서 ----
const summary = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t("2026년도 공공데이터 활용 경진대회", { size: 22, color: "5A6A66" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t("기획 요약서", { size: 36, bold: true })] }),
  table([{ h: "항목", w: 2000 }, { h: "내용", w: W - 2000 }], [
    [{ v: "1. 활용사례명", bold: true }, "공공데이터 건강검진표 — 한국체육산업개발 개방 데이터 58종을 같은 규칙으로 점검하고, 데이터마다 고치는 방법을 알려 주는 웹 서비스"],
    [{ v: "2. 사용한 공공데이터명", bold: true }, `한국체육산업개발(주) 개방 데이터 ${N}종 전체(파일 ${files.length}종, 오픈 API ${apis.length}종)의 포털 등록 정보\n그중 파일데이터 ${R.n_csv_checked}종(${R.rows_checked.toLocaleString()}행)은 내용까지 점검\n핵심: 공공데이터 개방목록, 주차장 혼잡도 정보, 올림픽공원 핫뉴스 정보, 스포츠센터 강좌정보 4종, 월별주차현황, 언론보도현황 등`],
    [{ v: "3. 요약", bold: true }, `공공데이터포털의 기관 데이터 ${N}종을 모아 갱신 예정일 경과, 갱신 주기의 두 배 넘게 새 자료 없음, 설명과 실제 기간 불일치, 다른 데이터 설명 복사, 같은 행 반복, 개방목록 누락을 규칙으로 판정했습니다. ${R.ref_date} 점검 결과 점검 필요 ${g["점검 필요"] || 0}종, 주의 ${g["주의"] || 0}종, 양호 ${g["양호"] || 0}종이며, 기관 전체에 걸친 문제 ${orgMain.length}건(예: 개방목록 파일에 포털 데이터 17종 누락)을 찾았습니다. 결과는 한 페이지에서 데이터별 판정·근거·고치는 방법으로 보여 주고, 이용자 화면에 붙일 '자료 기준일' 표시도 함께 만듭니다. 판정은 전부 규칙으로 하고, 생성형 AI는 설명문 오탈자 후보를 찾는 데만 써서 원문과 대조해 확인된 것만 남겼습니다.`],
    [{ v: "4. 기대효과", bold: true }, "① 갱신이 멈춘 데이터를 다음 등록 예정일 전에 바로 찾음\n② 이용자는 포털 수정일이 아닌 '자료가 언제까지인지'를 보고 판단\n③ 행정안전부 공공데이터 품질관리 수준진단·평가의 '데이터 품질진단·진단결과 조치' 근거 자료로 활용\n④ 같은 점검을 다음 갱신 때 그대로 다시 돌려 고쳐졌는지 확인 (비용 0원, 2028년까지 운영 가능)"],
  ], { size: 19 }),
  ...img("hero.png", 600, 256, "그림 1. 점검 결과 페이지 첫 화면 — 한 칸이 데이터 하나, 색과 기호로 판정 표시"),
];

// ---- 상세 기획서 ----
const ruleRows = [
  ["갱신예정일", "점검 필요", "포털 '차기 등록 예정일'이 점검일보다 앞인데 새 파일이 없음"],
  ["설명복사", "점검 필요", "설명이 다른 데이터 설명과 거의 같고, 이 데이터 제목의 낱말이 설명에 없음"],
  ["최신성", "주의", "파일 안 마지막 날짜가 갱신 주기의 두 배보다 오래됨 (월간 60일 · 반기 365일 · 연간 730일)"],
  ["설명기간", "주의", "설명이 말하는 자료 마지막 해보다 실제 자료가 더 최근까지 있음 (예: '2013년 부터 2024년 강좌까지')"],
  ["중복", "주의", "모든 칸이 같은 행. 행 번호 열이 없으면 '판단 불가'로 표시해 담당자 확인 요청"],
  ["열이름중복 · 행수", "주의", "포털 항목 정보에 같은 열이 두 번 / 포털 '전체 행'과 실제 행 수 차이"],
  ["자리표시날짜 · 빈 열 · 먼 미래 날짜", "참고", "1990-01-01·9999-12-31, 절반 넘게 빈 열, 3년 넘게 뒤 날짜"],
  ["오탈자", "참고", "AI가 찾은 후보 중 포털 원문과 글자 그대로 대조해 확인한 것만"],
  ["개방목록 대조", "기관 전체", "기관의 '공공데이터 개방목록' 파일과 포털 실제 목록 비교 (누락·잔존·부서명)"],
];

const GO = { "점검 필요": 0, "주의": 1, "양호": 2 };
const flaggedRows = flagged.slice().sort((a, b) => GO[a.grade] - GO[b.grade]).map((d) => {
  const main = d.findings.filter((f) => f.level !== "info").map((f) => f.msg);
  return [{ v: gradeMark[d.grade], color: gradeColor[d.grade], bold: true }, `${d.title} (${d.kind})`, d.last_data || "—", main.join("\n")];
});

const usedFiles = files.map((d) => [d.title, d.id, d.cycle || "—", d.last_data || (R.n_csv_checked && d.findings.some((f) => f.rule === "미수집") ? "내려받지 않음" : "날짜 열 없음"), { v: d.grade, color: gradeColor[d.grade] }]);

const c1 = find("15164156", "갱신예정일"), c1b = find("15164156", "최신성");
const c2 = find("15090715", "설명복사");
const c3 = find("15131671", "설명기간"), c3b = find("15101610", "설명기간");
const c4 = find("15137825", "중복");

const detail = [
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t("상세 기획서", { size: 36, bold: true })] }),

  H1("1. 활용사례 개요"),
  H2("1-1. 활용사례 명"),
  P("공공데이터 건강검진표 — 한국체육산업개발 개방 데이터 점검과 고치는 방법 안내"),
  H2("1-2. 활용사례 기능, 특징 등 세부내용"),
  P("한국체육산업개발이 공공데이터포털에 개방한 데이터 전체를 한 번에 점검해, 담당자에게는 '무엇을 어떻게 고칠지'를, 이용자에게는 '이 자료가 언제까지의 자료인지'를 보여 주는 웹 서비스입니다. 화면은 네 부분입니다."),
  B([t("판정 한눈에 보기: ", { bold: true }), t(`데이터 ${N}종을 한 칸씩 띠로 늘어놓고 '점검 필요·주의·양호'를 색과 기호(!, △, ✓)로 표시합니다. 칸을 누르면 그 데이터의 결과로 이동합니다.`)]),
  B([t("기관 전체에서 보이는 문제: ", { bold: true }), t("데이터 한 개가 아니라 개방목록·관리 방식 전체에 걸친 문제를 모아 보여 줍니다.")]),
  B([t("데이터별 결과: ", { bold: true }), t("판정·자료 기준일·갱신 주기를 표로 보여 주고, 줄을 누르면 발견 사항과 근거(실제 값), 고치는 방법, 포털 원본 링크가 열립니다. 판정으로 거르기와 이름 검색을 지원합니다.")]),
  B([t("이용자에게 보여 줄 최신성 표시: ", { bold: true }), t("파일 안 가장 최근 날짜로 '○○년 ○월까지의 자료'를 붙이고, 갱신 예정일이 지났거나 오래된 자료는 따로 알립니다.")]),
  ...img("detail.png", 600, 305, "그림 2. 데이터별 결과 — 줄을 누르면 발견 사항·근거·고치는 방법이 열림 (주차장 혼잡도 정보)"),
  P("특징은 세 가지입니다. 첫째, 판정은 전부 공개된 규칙으로 해서 같은 자료를 넣으면 같은 결과가 나옵니다. 둘째, 모든 발견 사항에 근거 값(날짜, 행 수, 원문 문장)을 붙여 담당자가 바로 확인할 수 있습니다. 셋째, 수집·점검·화면 생성이 스크립트로 되어 있어 다음 갱신 때 그대로 다시 돌릴 수 있습니다."),
  H2("1-3. 활용사례 서비스 확인 방법"),
  table([{ h: "구분", w: 2000 }, { h: "주소", w: W - 2000 }], [
    ["점검 결과 페이지", SITE],
    ["소스 코드 · 점검 규칙 · 원본 자료", REPO],
  ], { size: 19 }),
  P([t("PC·휴대폰 웹 브라우저에서 바로 열 수 있고 설치가 필요 없습니다. 저장소의 README에 다시 돌리는 방법(명령 3줄)과 규칙 표가 있습니다.", { size: 19 })], { spacing: { before: 80, after: 100 } }),

  H1("2. 활용사례의 독창성"),
  H2("2-1. 활용 공공데이터"),
  P(`기관 개방 데이터 ${N}종 전체를 씁니다. 모든 데이터의 포털 등록 정보(설명, 업데이트 주기, 차기 등록 예정일, 전체 행, 항목 정보, 수정일)를 읽고, 파일데이터 ${R.n_csv_checked}종은 파일 내용(${R.rows_checked.toLocaleString()}행)까지 점검했습니다. 대용량 입출차 파일(21만 행)과 이미지 파일 1종은 내용 점검에서 뺐습니다. 아래 표는 파일데이터 ${files.length}종입니다(오픈 API ${apis.length}종은 인증키가 필요해 등록 정보만 점검).`),
  table([{ h: "파일데이터", w: 3600 }, { h: "포털 번호", w: 1300 }, { h: "업데이트 주기", w: 1300 }, { h: "자료 기준일", w: 1900 }, { h: "판정", w: W - 8100 }], usedFiles, { size: 16 }),
  H2("2-2. 사례를 활용하게 된 배경 및 활용 우수성"),
  P([t("배경. ", { bold: true }), t("공공데이터법 제22조에 따라 행정안전부는 공공기관의 품질관리 활동을 점검하는 '공공데이터 품질관리 수준진단·평가'를 2016년부터 하고 있고, 2020년에 공공기관까지 대상을 넓혔습니다. 평가지표에는 '데이터 품질진단', '데이터 오류율', '진단결과 조치'가 들어 있습니다(행정안전부 누리집). 그런데 포털에 올라간 데이터는 수십 종이고 주기도 제각각이라, 담당자가 하나씩 열어 확인하기 어렵습니다. 실제로 이번 점검에서 58종 중 44종의 포털 수정일이 2026-09-21 하루에 몰려 있어, 수정일만으로는 어떤 자료가 최신인지 알 수 없었습니다.")]),
  P([t("활용 빈도·비중. ", { bold: true }), t(`기관 개방 데이터 ${N}종 전체(100%)를 씁니다. 한두 종을 골라 서비스를 만드는 대신, 기관이 개방한 모든 데이터를 같은 기준으로 다룹니다. 규칙이 포털 공통 등록 정보(업데이트 주기, 차기 등록 예정일, 항목 정보)를 쓰므로 새 데이터가 추가되어도 코드 수정 없이 점검 대상에 들어갑니다.`)]),
  P([t("차별점. ", { bold: true }), t("대부분의 활용 사례는 공공데이터를 '써서' 새 서비스를 만듭니다. 이 사례는 그 서비스들이 기대는 원천, 즉 개방 데이터 자체가 최신이고 설명이 맞는지를 지키는 쪽입니다. 주차 예보든 공연 알림이든 원천 데이터가 멈추면 함께 틀려지기 때문에, 기관이 개방 데이터를 관리하는 데 직접 쓸 수 있는 도구가 필요하다고 봤습니다.")]),
  P([t("AI 활용 방식. ", { bold: true }), t("판정은 규칙으로만 합니다. 생성형 AI(Claude)는 설명문 58건을 읽고 오탈자·깨진 문장 후보를 찾는 데만 썼고, 후보마다 포털 원문에 그 글자가 그대로 있는지 대조해 확인된 11건만 남겼습니다. AI가 잘못 짚어도 판정이 바뀌지 않게 하려는 설계입니다.")]),

  H1("3. 활용사례의 구체성"),
  P(`${R.ref_date}에 공공데이터포털에서 모은 자료로 점검한 결과입니다. 숫자는 저장소의 점검 코드를 다시 돌리면 그대로 나옵니다.`),
  table([{ h: "판정", w: 2400 }, { h: "데이터 수", w: 1600 }, { h: "뜻", w: W - 4000 }], [
    [{ v: "! 점검 필요", color: C.bad, bold: true }, `${g["점검 필요"] || 0}종`, "갱신 예정일이 지났거나 설명이 다른 데이터 것 — 바로 고칠 것"],
    [{ v: "△ 주의", color: C.warn, bold: true }, `${g["주의"] || 0}종`, "설명과 실제 기간 불일치, 오래된 자료, 반복 행 등 — 확인 후 고칠 것"],
    [{ v: "✓ 양호", color: C.ok, bold: true }, `${g["양호"] || 0}종`, "규칙상 문제 없음 (참고 사항·오탈자 후보는 있을 수 있음)"],
  ], { size: 18 }),
  H2("3-1. 점검 규칙"),
  table([{ h: "규칙", w: 2300 }, { h: "판정", w: 1200 }, { h: "내용", w: W - 3500 }], ruleRows, { size: 17 }),
  H2("3-2. 발견 사례"),
  P([t("① 갱신이 멈춘 데이터 — 주차장 혼잡도 정보. ", { bold: true }), t(`업데이트 주기는 '월간'이고 차기 등록 예정일은 ${R.datasets.find((d) => d.id === "15164156").next}였지만, 점검일(${R.ref_date})까지 새 파일이 없습니다. 마지막 자료는 ${c1b ? c1b.evidence.split("~ ")[1] : ""}로, 점검일까지 ${c1b ? c1b.msg.match(/(\d+)일째/)[1] : ""}일째 새 자료가 없습니다. 이 데이터로 혼잡도를 안내하는 서비스는 모두 오래된 값을 보여 주게 됩니다.`)]),
  P([t("② 다른 데이터의 설명 — 올림픽공원 핫뉴스 정보. ", { bold: true }), t(`설명이 '정보목록데이터' 설명과 같아 '한국체육산업개발에서 생산 및 수신된 전자결재 정보목록 데이터입니다'로 되어 있습니다. 파일 항목(제목·시작일·종료일·홈페이지 주소)과 맞지 않아 이용자가 무슨 데이터인지 알 수 없습니다.`)]),
  P([t("③ 설명이 실제보다 오래됨 — 월별주차현황, 강좌정보 4종. ", { bold: true }), t(`월별주차현황 설명은 '현재는 2023년도'라고 하지만 파일에는 ${c3 ? c3.msg.match(/실제 자료는 (\d+)년/)[1] : ""}년 자료까지 있습니다. 올림픽수영장 강좌정보도 설명은 '2024년 강좌까지'인데 실제로는 ${c3b ? c3b.msg.match(/\((.+?)\)/)[1] : ""}까지 있습니다. 자료는 갱신했는데 설명을 고치지 않은 경우입니다.`)]),
  P([t("④ 같은 행 반복 — 언론보도현황. ", { bold: true }), t(`${c4 ? c4.msg.replace(". 식별번호 열이 없어 실제 중복인지 판단 불가", "") : ""}. 예: ${c4 ? c4.evidence.replace("예: ", "") : ""}. 행 번호 열이 없어 실제 중복인지는 담당자 확인이 필요하다고 표시했습니다.`)]),
  P([t("⑤ 기관 전체 — 개방목록 누락. ", { bold: true }), t(`기관의 '공공데이터 개방목록' 파일(42종)에는 포털에 있는 17종(주차장 혼잡도 정보, 영문 공연정보, 올림픽공원 입출차 정보 등)이 빠져 있고, 포털에 없는 2종(테니스장 예약현황 등)이 남아 있으며, 관리부서가 '경영정보화팀'으로 적혀 있습니다.`)]),
  ...img("org.png", 600, 284, "그림 3. 기관 전체에서 보이는 문제 — 개방목록과 포털 목록 대조 결과"),
  H2("3-3. 판정이 필요한 데이터 전체"),
  table([{ h: "판정", w: 1300 }, { h: "데이터", w: 2600 }, { h: "자료 기준일", w: 1300 }, { h: "발견 사항", w: W - 5200 }], flaggedRows, { size: 15 }),
  P([t(`이 밖에 오탈자 후보 ${typo}건(예: '온라인 깅습 동영상' → '강습', '미사경원' → '미사경정공원'), 자리표시 날짜(1990-01-01 등)와 빈 열 같은 참고 사항을 데이터별 결과에 함께 적었습니다.`, { size: 19 })], { spacing: { before: 80 } }),

  H1("4. 사례의 활용 적절성"),
  B([t("이용자 신뢰: ", { bold: true }), t("멈춘 데이터나 틀린 설명을 이용자가 먼저 겪기 전에 기관이 찾아 고칠 수 있습니다. 공원 방문객, 데이터를 가져다 서비스를 만드는 개발자 모두 '이 자료가 언제까지인지'를 화면에서 바로 압니다.")]),
  B([t("기관 업무: ", { bold: true }), t(`담당자가 ${N}종을 하나씩 열지 않아도, 고칠 데이터와 고치는 방법이 한 페이지에 모입니다. 결과 파일(summary.csv)은 엑셀로 열어 조치 기록으로 쓸 수 있습니다.`)]),
  B([t("품질관리 평가 대응: ", { bold: true }), t("품질진단 결과와 조치 전후 비교를 같은 규칙으로 남길 수 있어, 품질관리 수준진단·평가의 '데이터 품질진단·진단결과 조치' 근거로 쓸 수 있습니다.")]),
  B([t("다른 기관으로 확장: ", { bold: true }), t("대부분의 규칙이 공공데이터포털 공통 등록 정보(업데이트 주기, 차기 등록 예정일, 항목 정보)를 쓰므로, 수집 스크립트의 기관 이름을 바꾸면 다른 공공기관 데이터도 같은 규칙으로 점검할 수 있습니다. 개방목록 대조처럼 기관 고유 파일을 쓰는 규칙만 기관별로 맞추면 됩니다.")]),
  ...img("cards.png", 600, 256, "그림 4. 이용자에게 보여 줄 최신성 표시 — 파일 안 마지막 날짜 기준"),

  H1("5. 실현가능성 및 기타"),
  H2("5-1. 추진 일정 및 개발·운영 계획"),
  table([{ h: "시기", w: 2200 }, { h: "내용", w: W - 2200 }], [
    ["2026.11 (완료)", `자료 수집 스크립트, 점검 규칙 9종, 결과 페이지, 규칙 단위 테스트 12개 완성. ${R.ref_date} 1차 점검.`],
    ["2026.12", "결과 공개. 심사 의견 반영. 대용량 입출차 파일을 나눠 읽는 점검 추가."],
    ["2027 ~ 2028 (분기마다)", "같은 스크립트로 재점검해 결과 페이지 갱신, 이전 점검과 비교해 고쳐진 항목 표시. 기관 협조 시 오픈 API 응답(인증키 필요)까지 점검 범위 확대."],
  ], { size: 18 }),
  H2("5-2. 서비스 유지 계획 (2028년까지 운영 가능 여부)"),
  P("2028년까지 운영할 수 있습니다. 결과 페이지는 정적 웹페이지(GitHub Pages)라 서버·유지 비용이 없고, 점검 코드는 Python 표준 라이브러리만 써서 설치할 것이 없습니다. 재점검은 ① 브라우저에서 수집 스크립트 실행 ② 명령 한 줄로 점검 ③ 결과 올리기 순서입니다. 수상 시 원천 소스는 저장소 전체를 그대로 제공하며, 기관이 직접 운영할 경우 같은 절차를 내부에서 돌리면 됩니다."),
  P([t("한계와 대응. ", { bold: true }), t("오픈 API는 인증키가 필요해 이번에는 등록 정보만 봤습니다(기관 협조 시 확장). 행 번호 열이 없는 데이터의 반복 행은 실제 중복인지 확정할 수 없어 '확인 필요'로 표시합니다. 설명문의 기간 표현은 규칙으로 읽기 때문에 규칙이 모르는 표현은 놓칠 수 있습니다.")]),
  H2("5-3. 추가 개방이 필요한 공공데이터 (의견)"),
  B([t("데이터마다 '데이터 기준일'(자료의 마지막 날짜) 항목: ", { bold: true }), t("포털 수정일과 별도로 있으면 이용자가 최신성을 바로 알 수 있습니다.")]),
  B([t("주차장 혼잡도 정보 갱신 재개와 실시간 주차현황의 갱신 시각: ", { bold: true }), t("월간 갱신이 멈춰 있어, 혼잡 안내 서비스들이 오래된 값을 쓰게 됩니다.")]),
  B([t("공공데이터 개방목록을 포털 목록과 같게: ", { bold: true }), t("등록·폐기 때 함께 갱신하면 이용자가 기관 데이터 전체를 한 파일로 파악할 수 있습니다.")]),
  P([t("개발 과정에서 AI 코딩 도구(Claude Code)를 활용했으며, 점검 규칙과 판정 기준은 참가자가 정하고 결과를 원본 자료와 대조해 검증했습니다.", { size: 17, color: "5A6A66" })], { spacing: { before: 200 } }),
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
      children: [t("공공데이터 건강검진표  ", { size: 16, color: "7A8884" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "7A8884" })] })] }) },
    children: [...summary, ...detail],
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log("wrote", OUT, b.length); });
