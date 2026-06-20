const assert = require("assert");
const tools = require("../filename_tools.js");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("allowlist accepts academic and heritage URLs only", () => {
  assert.ok(tools.isAllowedUrl("https://www.riss.kr/search/detail/DetailView.do?p_mat_type=1"));
  assert.ok(tools.isAllowedUrl("https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do"));
  assert.ok(tools.isAllowedUrl("https://portal.nrich.go.kr/kor/originalUsrView.do?info_idx=7829"));
  assert.ok(tools.isAllowedUrl("https://www.e-minwon.go.kr/ge/ee/getListEcexmRptp.do"));
  assert.ok(!tools.isAllowedUrl("https://www.naver.com/search?q=pdf"));
  assert.ok(!tools.isAllowedUrl("https://example.com/riss.kr/download.pdf"));
  assert.ok(!tools.isAllowedUrl("https://notdbpia.example.com/download.pdf"));
});

test("toggle helper treats only explicit false as disabled", () => {
  assert.strictEqual(tools.isPdfFilenameEnabled({}), true);
  assert.strictEqual(tools.isPdfFilenameEnabled({ pdfFilenameEnabled: true }), true);
  assert.strictEqual(tools.isPdfFilenameEnabled({ pdfFilenameEnabled: false }), false);
});

test("academic filename follows citation settings", () => {
  const filename = tools.renderAcademicFilename({
    authors: ["김철수", "이영희"],
    title_main: "신라 토기 연구",
    title_sub: "월성 출토품을 중심으로",
    journal_name: "한국고고학보",
    volume: "57",
    issue: "2",
    publisher: "한국고고학회",
    year: "2025",
    page_first: "1",
    page_last: "20"
  }, {
    pageRangeInclude: true
  });

  assert.strictEqual(
    filename,
    "김철수·이영희, 「신라 토기 연구 — 월성 출토품을 중심으로」, 『한국고고학보』 57(2), 한국고고학회, 2025, 1–20쪽.pdf"
  );
});

test("report filename uses agency year and double title brackets", () => {
  const filename = tools.renderReportFilename({
    agency: "국립나주문화유산연구소",
    year: "2023",
    reportTitle: "나주 대안리 구영유적 발굴조사 보고서"
  });

  assert.strictEqual(
    filename,
    "국립나주문화유산연구소, 2023, 『나주 대안리 구영유적 발굴조사 보고서』.pdf"
  );
});

test("multi-file report filename adds attachment suffix", () => {
  const filename = tools.renderReportFilename({
    agency: "국립부여문화유산연구소",
    year: "1996",
    reportTitle: "미륵사 유적발굴조사보고서Ⅱ",
    fileTitle: "미륵사 유적발굴조사보고서Ⅱ(도판편).pdf",
    multipleFiles: true
  });

  assert.strictEqual(
    filename,
    "국립부여문화유산연구소, 1996, 『미륵사 유적발굴조사보고서Ⅱ』 도판편.pdf"
  );
});

test("report attachment helper ignores generic download labels", () => {
  assert.strictEqual(
    tools.deriveAttachmentTitle("나주 대안리 구영유적 발굴조사 보고서", "원본 다운로드", ""),
    ""
  );
  assert.strictEqual(
    tools.deriveAttachmentTitle("나주 대안리 구영유적 발굴조사 보고서", "이미지 내려받기", ""),
    ""
  );
});

test("KCI fncDown source becomes iframe download URL", () => {
  const info = tools.getKciDownloadInfo(
    "fncDown('ART003342986','KCI_FI003342986');",
    "https://www.kci.go.kr/kciportal/po/search/poArtiSearList.kci"
  );

  assert.deepStrictEqual(info, {
    articleId: "ART003342986",
    fileId: "KCI_FI003342986",
    url: "https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiOrteServHistIFrame.kci?sereArticleSearchBean.artiId=ART003342986&sereArticleSearchBean.orteFileId=KCI_FI003342986"
  });
});

test("filename sanitizer removes forbidden characters and trailing dots", () => {
  assert.strictEqual(
    tools.withPdfExtension('A/B:C* "보고서".'),
    "A B C 보고서.pdf"
  );
});
