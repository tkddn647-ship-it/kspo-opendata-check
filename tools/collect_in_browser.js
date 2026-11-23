// 공공데이터포털(data.go.kr)에서 한국체육산업개발 개방 데이터를 모으는 스크립트.
// 쓰는 법: 브라우저로 https://www.data.go.kr 아무 페이지를 연 뒤 개발자 도구 콘솔에 붙여 넣고 실행.
//          끝나면 kspo_opendata.json.gz 하나가 내려받아진다 → tools/unpack.py 로 raw/ 에 푼다.
// 포털의 내려받기 횟수 제한(보안문자)이 뜨면 거기서 멈춘다. 보안문자를 우회하지 않는다.
// 2026-11-23 파일데이터 30종 중 이미지 1종을 뺀 29종을 받았다 (21만 행 입출차 파일 포함, 약 10MB).
(async () => {
  const ORG = "한국체육산업개발주식회사";
  const SKIP = new Set(["15160326"]); // 이미지(JPG)
  const MAX = window.KSPO_MAX ?? Infinity; // 시험용: window.KSPO_MAX = 2 로 두면 파일 2개만 받음
  const text = (u) => fetch(u).then((r) => r.text());
  const doc = (h) => new DOMParser().parseFromString(h, "text/html");

  // 1) 목록: 파일 + API
  async function list(dType) {
    const h = await text(`/tcs/dss/selectDataSetList.do?dType=${dType}&keyword=${encodeURIComponent(ORG)}&perPage=100`);
    const d = doc(h), out = [], seen = new Set();
    d.querySelectorAll('a[href*="/data/"]').forEach((a) => {
      const m = a.getAttribute("href").match(/\/data\/(\d+)\/(fileData|openapi)/);
      const title = a.textContent.replace(/\s+/g, " ").trim();
      if (!m || seen.has(m[1]) || title.length < 5) return;
      let box = a; while (box && !(box.textContent || "").includes("수정일")) box = box.parentElement;
      const rest = (box ? box.textContent : "").replace(/\s+/g, " ").split(title).slice(1).join(title);
      seen.add(m[1]);
      out.push({ id: m[1], kind: m[2], title, mod: (rest.match(/수정일\s*([\d-]+)/) || [])[1] || "",
                 desc: rest.split("제공기관")[0].trim() });
    });
    return out;
  }
  const files = await list("FILE"), apis = await list("API");

  // 2) 상세: 메타데이터, 전체 설명
  const g = (t, k, re) => (t.match(new RegExp(k + "\\s*" + re)) || [])[1] || "";
  const meta = [], desc = {};
  for (const x of [...files, ...apis]) {
    const h = await text(`/data/${x.id}/${x.kind}.do`), d = doc(h), t = d.body.textContent.replace(/\s+/g, " ");
    const dm = t.match(/설명\s+(.{20,1500}?)\s+(?:API 유형|매체유형|키워드|데이터 포맷|확장자)/);
    desc[x.id] = dm ? dm[1] : "";
    if (x.kind === "openapi") { x.dept = g(t, "관리부서명", "(\\S+)"); x.cycle = g(t, "업데이트 주기", "(\\S+)"); continue; }
    const u = h.match(/fn_fileDataDown\('(\d+)',\s*'(uddi:[^']+)'/);
    const colTable = [...d.querySelectorAll("table")].find((tb) => tb.textContent.includes("항목명(영문명)"));
    meta.push({ id: x.id, name: g(t, "파일데이터명", "(\\S+)"), dept: g(t, "관리부서명", "(\\S+)"), cycle: g(t, "업데이트 주기", "(\\S+)"),
                next: g(t, "차기 등록 예정일", "([\\d-]+)"), rows: g(t, "전체 행", "([\\d,]+)"), reg: g(t, "등록일", "([\\d-]+)"),
                mod: g(t, "수정일", "([\\d-]+)"), uddi: u ? u[2] : "",
                cols: colTable ? [...colTable.querySelectorAll("tr")].slice(2).map((tr) => tr.children[0]?.textContent.trim()).filter(Boolean).join(",") : "" });
  }

  // 3) 파일 내려받기 (포털 화면의 '다운로드' 버튼과 같은 절차)
  const csv = {};
  for (const m of meta) {
    if (SKIP.has(m.id) || !m.uddi) continue;
    if (Object.keys(csv).length >= MAX) break;
    const j = JSON.parse(await text(`/tcs/dss/selectFileDataDownload.do?recommendDataYn=Y&publicDataPk=${m.id}&publicDataDetailPk=${encodeURIComponent(m.uddi)}`));
    if (!j.status) continue;
    const lim = await fetch("/cmm/cmm/check-limit.json", { method: "POST", body: new URLSearchParams({ atchFileId: j.atchFileId, fileDetailSn: j.fileDetailSn }) });
    if (lim.status === 403 || (await lim.json()).needCaptcha) { console.warn("내려받기 제한 — 여기서 멈춤", m.id); break; }
    const buf = await fetch(`/cmm/cmm/fileDownload.do?atchFileId=${j.atchFileId}&fileDetailSn=${j.fileDetailSn}&dataNm=${encodeURI(j.dataSetFileDetailInfo.dataNm)}`).then((r) => r.arrayBuffer());
    let txt = new TextDecoder("utf-8").decode(buf), enc = "utf-8";
    if ((txt.match(/�/g) || []).length > 5) { txt = new TextDecoder("euc-kr").decode(buf); enc = "euc-kr"; }
    csv[m.id] = { enc, bytes: buf.byteLength, name: j.dataSetFileDetailInfo.dataNm, txt };
    console.log("받음", m.id, enc, buf.byteLength);
  }

  // 4) 하나로 묶어 내려받기
  const payload = JSON.stringify({ fetched_at: new Date().toISOString(), catalog: { files, apis }, meta, desc, csv });
  const gz = await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(gz), download: window.KSPO_OUT || "kspo_opendata.json.gz" });
  document.body.appendChild(a); a.click(); a.remove();
  console.log("완료: 파일", Object.keys(csv).length, "종");
})();
