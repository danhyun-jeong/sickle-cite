const runtimeApi = globalThis.browser?.runtime ?? globalThis.chrome?.runtime;
const storageApi = globalThis.browser?.storage ?? globalThis.chrome?.storage;
const fileNamingApi = globalThis.SickleCiteFileNaming;
let pdfFilenameFeatureEnabled = true;
let lastDownloadContextSentAt = 0;
const DOWNLOAD_CONTEXT_DEBOUNCE_MS = 300;
const forcedDownloadControls = new WeakSet();

function getAcademicDBType() {
  const url = window.location.href;
  if (/^https:\/\/[^\/]*riss[^\/]*\/search\/detail\/DetailView\.do\?/.test(url))
    return 'RISS';
  if (/^https:\/\/www\.kci\.go\.kr\/kciportal\/ci\/sereArticleSearch\/ciSereArtiView/.test(url))
    return 'KCI';
  if (/^https:\/\/[^/]*kiss[^/]*kstudy[^/]*com[^/]*\/Detail[^/]*\/Ar\?key=/.test(url))
    return 'KISS';
  if (/^https:\/\/[^/]*dbpia[^/]*\/journal\/articleDetail\?nodeId=/.test(url))
    return 'DBpia';
  if (/^https:\/\/[^/]*dbpia[^/]*\/journal\/detail\?nodeId=/.test(url))
    return 'DBpia';
  if (/^https:\/\/[^/]*earticle[^/]*net[^/]*\/Article\//.test(url))
    return 'eArticle';
  if (/^https:\/\/[^/]*scholar[^/]*kyobobook[^/]*\/article\/detail\//.test(url))
    return '스콜라';
  if (/^https:\/\/www\.kci\.go\.kr\/kciportal\/landing\/article.kci/.test(url))
    return 'KOAJ';
  console.log ("‼️ 현재 페이지를 인식할 수 없습니다.");
}
  
// ----- 공통 헬퍼 함수 -----

// 여러 공백을 하나로 축소하고 앞뒤 공백 제거
function collapse(s) { return s.replace(/\s+/g, ' ').trim(); }

// 인용 및 구분자 기호 교정
function fixTypography(text) {
  let s = text.trim();
  s = s.replace(/`([^`]+)`/g, '‘$1’');
  s = s.replace(/′([^`]+)′/g, '‘$1’');
  s = s.replace(/'([^']+)'/g, '‘$1’');
  s = s.replace(/"([^\"]+)"/g, '“$1”');
  s = s.replace(/''([^\"]+)''/g, '“$1”');
  s = s.replace(/″([^\"]+)″/g, '“$1”');
  s = s.replace(/<</g, '《').replace(/>>/g, '》');
  s = s.replace(/≪/g, '《').replace(/≫/g, '》');
  s = s.replace(/</g, '〈').replace(/>/g, '〉');
  s = s.replace(/｢/g, '「').replace(/｣/g, '」');
  s = s.replace(/\.{3}/g, '…');
  s = s.replace(/[•ㆍᆞ・･‧⋅]/g, '·');
  s = s.replace(/[᠆‐‑⁃⁻₋﹣]/g, '-');
  s = s.replace(/[－―̶⸺⸻─━]/g, '—');
  return s;
}

// 병기 괄호가(한글이 전혀 없는 괄호) 제거 (저자, 발행기관, 학술지명 전용)
function removeNonKoreanParen(text) {
  return text.replace(/\([^가-힣]*\)/g, '');
}

// 제목 분리 함수: 본제목과 부제목을 구분자로 나누고 후처리 적용
function splitTitle(raw) {
  raw = raw.split('=')[0];
  raw = collapse(raw);

  // 우선순위별 구분 기호 목록
  const delims = [':', '—', '–', raw.includes(' - ') ? ' - ' : '-'];

  // 낫표 범위 계산
  const openDouble = raw.indexOf('『'), closeDouble  = raw.indexOf('』');
  const openSingle = raw.indexOf('「'), closeSingle = raw.indexOf('」');
  const openSingleQuote = raw.indexOf('‘'), closeSingleQuote = raw.indexOf('’');
  const openDoubleQuote = raw.indexOf('“'), closeDoubleQuote = raw.indexOf('”');
  const ranges = [];
  if (openDouble >= 0 && closeDouble > openDouble) ranges.push([openDouble, closeDouble]);
  if (openSingle >= 0 && closeSingle > openSingle) ranges.push([openSingle, closeSingle]);
  if (openSingleQuote >= 0 && closeSingleQuote > openSingleQuote) ranges.push([openSingleQuote, closeSingleQuote]);
  if (openDoubleQuote >= 0 && closeDoubleQuote > openDoubleQuote) ranges.push([openDoubleQuote, closeDoubleQuote]);
  // 유효한 분리 위치 찾기
  let chosen = null, chosenLen = 1;
  for (const d of delims) {
    if (!d || !raw.includes(d)) continue;
    let idx = 0;
    while (true) {
      const pos = raw.indexOf(d, idx);
      if (pos < 0) break;
      // 이 위치가 낫표 내부인지 검사
      const inside = ranges.some(([s, e]) => pos > s && pos < e);
      if (!inside) {
        // 숫자 사이의 하이픈(-)은 구분자로 사용하지 않음
        if (d === '-' && /\d/.test(raw.charAt(pos - 1)) && /\d/.test(raw.charAt(pos + 1))) {
          idx = pos + d.length;
          continue;
        }
        chosen = pos;
        chosenLen = d.length;
        break;
      }
      idx = pos + d.length;
    }
    if (chosen !== null) break;
  }

  // 분리 실패 시 전체를 본제목으로
  if (chosen === null) return { main: raw, sub: '' };

  // 본·부제 분리
  const main = collapse(raw.slice(0, chosen));
  let sub   = collapse(raw.slice(chosen + chosenLen));
  // 끝에 남은 구분 기호 및 공백 제거
  sub = sub.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '');

  return { main, sub };
}

// 메타데이터 유효성 확인 함수: 메타데이터의 각 속성이 undefined일 경우 빈 값 반환을 보장
function verifyMetadata(raw) {
  // volume 또는 issue 값이 0(숫자)이거나 '0'(스트링)일 경우, 빈 값으로 통일
  let volume = raw.volume || '';
  if (volume === '0' || volume === 0) volume = '';
  let issue = raw.issue || '';
  if (issue === '0' || issue === 0) issue = '';

  const metadata = {
    authors:      raw.authors       || [],
    title_main:   raw.title_main    || '',
    title_sub:    raw.title_sub     || '',
    journal_name: raw.journal_name  || '',
    volume:       volume,
    issue:        issue,
    publisher:    raw.publisher     || '',
    year:         raw.year          || '',
    page_first:   raw.page_first    || '',
    page_last:    raw.page_last     || '',
    keywords:     raw.keywords      || [],
    abstract:     raw.abstract      || ''
  };

  // metadata.authors와 metadata.keywords에서 빈 문자열 제거
  if (Array.isArray(metadata.authors)) {
    metadata.authors = metadata.authors
      .filter(a => typeof a === 'string' && a.trim() !== '');
    if (metadata.authors.length === 1) {
      metadata.authors = metadata.authors[0];
    }
  }
  if (Array.isArray(metadata.keywords)) {
    metadata.keywords = metadata.keywords
      .filter(k => typeof k === 'string' && k.trim() !== '');
    if (metadata.keywords.length === 1) {
      metadata.keywords = metadata.keywords[0];
    }
  }
  return metadata;
}

// ----- RISS 페이지 처리 함수: RISS 사이트의 DOM에서 메타데이터 추출 -----
function parseRISS() {
  // 문서의 <title> 태그를 확인 (2025. 09. 기준 레거시)
  const pageTitle = document.title || '';
  // "국내학술지" 링크가 있는지 확인
  const isArticle = document.querySelector('.locationW')?.textContent?.includes('국내학술논문');
  const isThesis = document.querySelector('.locationW')?.textContent?.includes('학위논문');
  // title에 "학술지논문"이 포함되어 있거나 국내학술논문 링크가 있는지 판별
  if (pageTitle.includes('학술지논문') || isArticle) {
    console.log('학술지논문으로 확인됨');
    // 1. 서지사항 리스트 수집: .infoDetailL ul li 항목
    const items = document.querySelectorAll('#thesisInfoDiv .infoDetailL ul li');
    if (!items.length) return;
    const tmp = {};
    // 2. 각 li 요소에서 레이블과 콘텐츠 분리
    items.forEach(li => {
      const label = collapse(li.querySelector('span.strong')?.textContent || '');
      let content = li.querySelector('span.strong')
        ? li.textContent.replace(li.querySelector('span.strong').textContent, '')
        : li.textContent;
      content = fixTypography(content);
      switch (label) {
        //   - 저자
        case '저자':
          tmp.authors = Array.from(li.querySelectorAll('a')).map(a => collapse(removeNonKoreanParen(fixTypography(a.textContent))));
          break;
        //   - 발행기관
        case '발행기관': tmp.publisher = collapse(removeNonKoreanParen(fixTypography(content))); break;
        //   - 학술지명
        case '학술지명': case '학술지':
          tmp.journal_name = collapse(removeNonKoreanParen(fixTypography(li.querySelector('a')?.textContent || content)));
          break;
        //   - 권호사항: Vol. 및 No. 형식에서 volume과 issue 추출
        case '권호사항':
          let volMatch = content.match(/Vol\. *(\d+)/i);
          tmp.volume = volMatch ? volMatch[1] : '';
          // No.- 인 경우 빈 문자열 유지
          let issueMatch = content.match(/No\. *(\d+)/i);
          tmp.issue = (issueMatch && issueMatch[1] !== '-') ? issueMatch[1] : '';
          break;
        //   - 발행연도: 4자리 숫자로 연도 추출
        case '발행연도': tmp.year = (content.match(/\d{4}/)||[''])[0]; break;
        //   - 주제어: 키워드 리스트 분리 및 필터링
        case '주제어':
          tmp.keywords = collapse(content).split(/[;；,]/).map(s => fixTypography(s)).filter(s => /[가-힣]/.test(s) || /^[A-Z]{2,}$/.test(s));
          break;
        //   - 수록면: 페이지 범위(first-last) 추출
        case '수록면':
          const pg = content.match(/(\d+)-(\d+)/);
          if (pg) { tmp.page_first = pg[1]; tmp.page_last = pg[2]; }
          break;
      }
    });
    // 3. 국문 초록 추출: '국문 초록' 레이블 위치 기준으로 텍스트 노드 수집
    const abstractTitleP = Array.from(document.querySelectorAll('p.title')).find(p => p.textContent.includes('국문 초록'));
    if (abstractTitleP) {
      const abstractDiv = abstractTitleP.parentElement.querySelector('div.text.off');
      if (abstractDiv) {
        const paras = Array.from(abstractDiv.querySelectorAll('p')).map(p => fixTypography(p.textContent));
        tmp.abstract = collapse(paras.join('\n\n'));
      }
    }
    // 4. 제목 분리: rawTitle을 splitTitle 함수로 처리
    const rawTitle = document.querySelector('#thesisInfoDiv .title')?.textContent || '';
    const {main, sub} = splitTitle(fixTypography(rawTitle.split('=')[0]));
    const rawMetadata = {
      authors: tmp.authors,
      title_main: main,
      title_sub: sub,
      journal_name: tmp.journal_name,
      volume: tmp.volume,
      issue: tmp.issue,
      publisher: tmp.publisher,
      year: tmp.year,
      page_first: tmp.page_first,
      page_last: tmp.page_last,
      keywords: tmp.keywords,
      abstract: tmp.abstract
    };
    return verifyMetadata(rawMetadata);
  }
  // title에 "학위논문"을 포함하고 있을 경우 또는 학위논문 링크가 있는지 판별
  if (pageTitle.includes('학위논문') || isThesis) {
    console.log('학위논문으로 확인됨');
    // 1. 서지사항 리스트 수집: .infoDetailL ul li 항목
    const items = document.querySelectorAll('#thesisInfoDiv .infoDetailL ul li');
    if (!items.length) return;
    const tmp = {};
    // 2. 각 li 요소에서 레이블과 콘텐츠 분리
    items.forEach(li => {
      const label = collapse(li.querySelector('span.strong')?.textContent || '');
      let content = li.querySelector('span.strong')
        ? li.textContent.replace(li.querySelector('span.strong').textContent, '')
        : li.textContent;
      content = fixTypography(content);
      switch (label) {
        //   - 저자
        case '저자':
          tmp.authors = Array.from(li.querySelectorAll('a')).map(a => collapse(removeNonKoreanParen(fixTypography(a.textContent))));
          break;
        //   - 학위논문사항 전체부분을 스트링으로
        case '학위논문사항': tmp.thesisInfoRaw = collapse(removeNonKoreanParen(fixTypography(content))); break;
        //   - 학술지명
        case '학술지명': case '학술지':
          tmp.journal_name = collapse(removeNonKoreanParen(fixTypography(li.querySelector('a')?.textContent || content)));
          break;
        //   - 권호사항: Vol. 및 No. 형식에서 volume과 issue 추출
        case '권호사항':
          let volMatch = content.match(/Vol\. *(\d+)/i);
          tmp.volume = volMatch ? volMatch[1] : '';
          // No.- 인 경우 빈 문자열 유지
          let issueMatch = content.match(/No\. *(\d+)/i);
          tmp.issue = (issueMatch && issueMatch[1] !== '-') ? issueMatch[1] : '';
          break;
        //   - 발행연도: 4자리 숫자로 연도 추출
        case '발행연도': tmp.year = (content.match(/\d{4}/)||[''])[0]; break;
        //   - 주제어: 키워드 리스트 분리 및 필터링
        case '주제어':
          tmp.keywords = collapse(content).split(/[;；,]/).map(s => fixTypography(s)).filter(s => /[가-힣]/.test(s) || /^[A-Z]{2,}$/.test(s));
          break;
        //   - 수록면: 페이지 범위(first-last) 추출
        case '수록면':
          const pg = content.match(/(\d+)-(\d+)/);
          if (pg) { tmp.page_first = pg[1]; tmp.page_last = pg[2]; }
          break;
      }
    });
    // 3. 국문 초록 추출: '국문 초록' 레이블 위치 기준으로 텍스트 노드 수집
    const krTitleP = Array.from(document.querySelectorAll('p.title')).find(p => p.textContent.includes('국문 초록'));
    if (krTitleP) {
      const divText = krTitleP.parentElement.querySelector('div.text.off');
      if (divText) {
        const paras = Array.from(divText.querySelectorAll('p')).map(p => fixTypography(p.textContent));
        tmp.abstract = collapse(paras.join('\n\n'));
      }
    }
    // 4. 제목 분리: rawTitle을 splitTitle 함수로 처리
    const rawTitle = document.querySelector('#thesisInfoDiv .title')?.textContent || '';
    const {main, sub} = splitTitle(fixTypography(rawTitle.split('=')[0]));
    // 5. 
    function formatThesisInfo(thesisInfo) {
      // 1. "--"를 기준으로 앞/뒤 분리
      const [degreePart = '', restPart = ''] = thesisInfo.split('--').map(s => s.trim());
      // 1-1. degreePart에서 괄호 안의 학위 종류 추출
      const m = degreePart.match(/\(([^)]+)\)/);
      const degreeLabel = m ? m[1] : '';
      const degreeType = degreeLabel
        ? `${degreeLabel}학위논문`
        : degreePart.replace(/\s*\(.*\)\s*/, ''); // 괄호가 없으면 원본 앞부분 그대로
      // 2. restPart에서 institute와 department 추출
      const restFields = restPart.split(',').map(s => collapse(s));
      let institute = restFields[0] || '';
      // 2-1. '대학교 대학원' 처리: 공백 앞뒤로 세분화
      if (institute.includes(' ')) {
        const [pre, post] = institute.split(' ');
        if (pre.includes('대학교') && (post === '대학원' || post === '일반대학원')) {
          institute = pre;
        }
      }
      // 3. department
      let department = restFields[1] || '';
      // 3-1. '학과' 포함 시 공백 앞 텍스트만 사용
      if (department.includes(' ')) {
        const [pre, post] = department.split(' ');
        if (pre.includes('학과')) {
          department = pre;
        }
      }
      // 4. 조합
      return `${institute} ${department} ${degreeType}`.trim();
    }
    const thesisInfo = formatThesisInfo(tmp.thesisInfoRaw)
    // 최종 메타데이터 구성
    const rawMetadata = {
      authors: tmp.authors,
      title_main: main,
      title_sub: sub,
      journal_name: '',
      volume: '',
      issue: '',
      publisher: thesisInfo,
      year: tmp.year,
      page_first: '',
      page_last: '',
      keywords: tmp.keywords,
      abstract: tmp.abstract
    };
    return verifyMetadata(rawMetadata);
  }
  else {
    console.error ('학술지논문/학위논문 여부를 확인할 수 없습니다.');
    const emptyMetadata ={}
    return emptyMetadata
  }
}

//----- KCI 페이지 처리 함수: KCI 사이트의 DOM에서 메타데이터 추출 -----
function parseKCI() {
  // 1) 저자 추출
  const authors = Array.from(document.querySelectorAll('.author a'))
    .map(a => {
      const text = a.textContent || '';
      const [kor] = text.split('/');
      return collapse(removeNonKoreanParen(fixTypography(kor)));
    })
    .filter(s => s && !/\d/.test(s));
  // 중복 제거: 동일한 저자 이름이 여러 번 추출되는 경우 하나만 남김
  const uniqueAuthors = [...new Set(authors)];
  // 2) 제목 분리
  const titleText = fixTypography(document.getElementById('artiTitle')?.textContent || document.title);
  const { main: title_main, sub: title_sub } = splitTitle(titleText);
  // 3) 학술지명 추출
  let journal_name = collapse(removeNonKoreanParen(fixTypography(document.querySelector('.journalInfo .jounal a')?.textContent || '')));
  // 4) 권/호/연도 파싱
  const volText = document.querySelector('.journalInfo .vol')?.textContent || '';
  const volume = (volText.match(/vol\.\s*(\d+)/i)||[])[1] || '';
  const issue = (volText.match(/no\.\s*(\d+)/i)||[])[1] || '';
  const year = (volText.match(/(\d{4})/)||[])[1] || '';
  // 5) 페이지 정보(pp.) 파싱
  let page_first = '', page_last = '';
  const ppIdx = volText.indexOf('pp.');
  if (ppIdx !== -1) {
    let part = volText.slice(ppIdx + 3).trim();
    const pi = part.indexOf('(');
    if (pi !== -1) part = part.slice(0, pi).trim();
    const parts = part.split('-').map(s => s.trim());
    if (parts.length >= 2) { page_first = parts[0]; page_last = parts[1]; }
  }
  // 6) 발행기관 추출
  let publisher = collapse(removeNonKoreanParen(fixTypography(document.querySelector('.journalInfo .pub a')?.textContent || '')));
  // 7) 키워드 추출
  const kwBox = Array.from(document.querySelectorAll('.box')).find(b => b.querySelector('h2')?.textContent.includes('키워드'));
  const keywords = kwBox
    ? Array.from(kwBox.querySelectorAll('a[id="keywd"]'))
        .map(a => collapse(fixTypography(a.textContent)))
    : [];
  // 8) 초록 추출
  const abstract = fixTypography(document.getElementById('korAbst')?.textContent || '');
  const rawMetadata = {
    authors: uniqueAuthors,
    title_main,
    title_sub,
    journal_name,
    volume,
    issue,
    publisher,
    year,
    page_first,
    page_last,
    keywords,
    abstract
  };
  return verifyMetadata(rawMetadata);
}

function kciResultContainer(control) {
  let node = control;
  while (node && node !== document.body) {
    if (node.querySelector?.('input[name="R_INDE_TITL"], input[name="a"]')) return node;
    node = node.parentElement;
  }
  return null;
}

function kciHiddenValue(container, name) {
  return container?.querySelector?.(`input[name="${name}"]`)?.getAttribute('value') || '';
}

function stripKciLabel(value, label) {
  return collapse(fixTypography(String(value || '').replace(new RegExp(`^\\s*${label}\\s*[:：]\\s*`), '')));
}

function splitKciResultAuthors(value) {
  const clean = stripKciLabel(value, '저자')
    .replace(/\s*외\s*\d+\s*명\s*$/g, '')
    .replace(/\t+/g, ' ');
  return clean.split(/\s*[|;,]\s*/).map(name => collapse(removeNonKoreanParen(name))).filter(Boolean);
}

function parseKciResultVolumeIssue(value) {
  const text = stripKciLabel(value, '권\\(호\\)');
  const match = text.match(/([^()\s]+)\s*\(([^)]+)\)/);
  if (match) return { volume: match[1], issue: match[2] };
  return { volume: text, issue: '' };
}

function parseKciResultPages(value) {
  const text = stripKciLabel(value, '페이지').replace(/^pp\.?\s*/i, '');
  const parts = text.split(/[~-]/).map(part => collapse(part)).filter(Boolean);
  return {
    page_first: parts[0] || '',
    page_last: parts[1] || ''
  };
}

function parseKciSearchResultMetadata(control) {
  const container = kciResultContainer(control);
  if (!container) return null;

  const titleText = kciHiddenValue(container, 'R_INDE_TITL') || stripKciLabel(kciHiddenValue(container, 'a'), '논문명');
  const { main: title_main, sub: title_sub } = splitTitle(fixTypography(titleText));
  const { volume, issue } = parseKciResultVolumeIssue(kciHiddenValue(container, 'e'));
  const pages = parseKciResultPages(kciHiddenValue(container, 'f'));
  const pubDate = kciHiddenValue(container, 'R_PUBI_DT') || kciHiddenValue(container, 'g');
  const rawMetadata = {
    authors: splitKciResultAuthors(kciHiddenValue(container, 'b')),
    title_main,
    title_sub,
    journal_name: kciHiddenValue(container, 'R_SERE_NM') || stripKciLabel(kciHiddenValue(container, 'd'), '학술지명'),
    volume: kciHiddenValue(container, 'R_VOL') || volume,
    issue: kciHiddenValue(container, 'R_ISSE') || issue,
    publisher: kciHiddenValue(container, 'R_PUBI_INSI_NM') || stripKciLabel(kciHiddenValue(container, 'c'), '학회명'),
    year: (String(pubDate).match(/(?:19|20)\d{2}/) || [''])[0],
    page_first: kciHiddenValue(container, 'R_ST_PG') || pages.page_first,
    page_last: kciHiddenValue(container, 'R_END_PG') || pages.page_last,
    keywords: [],
    abstract: ''
  };

  return verifyMetadata(rawMetadata);
}

//----- KISS 페이지 처리 함수: KISS 사이트 메타 태그와 DOM에서 메타데이터 추출 -----
function parseKISS() {
  const meta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
  const cleanVal = key => collapse(fixTypography(meta(key)));
  // 1) 저자(meta)
  const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]'))
    .map(m => collapse(removeNonKoreanParen(fixTypography(m.getAttribute('content') || '')))) .filter(s => s);
  // 2) 제목 분리(DOM .title)
  const rawTitle = fixTypography(document.querySelector('.wrap_journal_index .title')?.textContent || '');
  const { main: title_main, sub: title_sub } = splitTitle(rawTitle);
  // 3) 학술지명, 권, 호, 연도, 페이지, 발행기관(meta)
  const journal_name = removeNonKoreanParen(cleanVal('citation_journal_title'));
  const volume = meta('citation_volume');
  const issue = meta('citation_issue');
  const year = meta('citation_year') || meta('citation_publication_date');
  const page_first = meta('citation_firstpage');
  const page_last = meta('citation_lastpage');
  const publisher = removeNonKoreanParen(cleanVal('citation_publisher'));
  // 4) 키워드(meta) 필터링
  // 키워드: 한국어가 포함된 키워드만 필터
  const keywords = meta('citation_keywords')
    .split(/[;,]/)
    .map(s => fixTypography(s))
    .filter(s => /[가-힣]/.test(s));
  // 5) 초록(meta)
  const abstract = fixTypography(meta('citation_abstract'));
  // 메타데이터 객체 생성
  const rawMetadata = {
    authors,
    title_main,
    title_sub,
    journal_name,
    volume,
    issue,
    publisher,
    year,
    page_first,
    page_last,
    keywords,
    abstract
  };
  return verifyMetadata(rawMetadata);
}

//----- DBpia 페이지 처리 함수: DBpia 사이트의 메타 태그에서 메타데이터 추출 -----
function parseDBpia() {
  const url = window.location.href;
  // 학위논문인 경우
  if (/^https:\/\/[^/]*dbpia[^/]*\/journal\/detail\?nodeId=/.test(url)) {
    const meta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
    const cleanVal = key => collapse(fixTypography(meta(key)));

    // 1) 저자 추출 (중복 및 숫자 제거)
    const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]'))
      .map(m => {
        const text = m.getAttribute('content') || '';
        return collapse(removeNonKoreanParen(fixTypography(text)));
      })
      .filter(s => s && !/\d/.test(s));
    const uniqueAuthors = [...new Set(authors)];

    // 2) 제목 분리: 콜론 뒤에 문자열에 한글이 없으면 콜론 앞까지 취함
    let rawTitle = cleanVal('citation_title');
    const positions = [];
    let idx = rawTitle.indexOf(':');
    while (idx !== -1) {
      positions.push(idx);
      idx = rawTitle.indexOf(':', idx + 1);
    }
    for (const pos of positions) {
      const rest = rawTitle.slice(pos + 1);
      if (!/[가-힣]/.test(rest)) {
        rawTitle = rawTitle.slice(0, pos);
        break;
      }
    }
    const { main: title_main, sub: title_sub } = splitTitle(rawTitle);

    // 3) 키워드 추출
    const keywords = meta('citation_keywords')
      .split(/[;；,]/)
      .map(s => collapse(fixTypography(s)))
      .filter(s => s && (/[가-힣]/.test(s) || /^[A-Za-z]/.test(s)));

    // 4) 초록
    const abstract = cleanVal('citation_abstract');

    // 5) 발행기관
    let institute = cleanVal('citation_publisher');
    if (institute.includes(' ')) {
      const [pre, post] = institute.split(' ');
      if ( post === '대학원' || post === '일반대학원') {
        institute = pre;
      }
    }
    institute = institute.replace(/[,]+$/, '');
    // meta에서 institute 추출 실패 시 DOM에서 '저자정보' 하위 span 내용으로 대체
    if (!institute) {
      const dt = Array.from(document.querySelectorAll('dt')).find(el => el.textContent.includes('저자정보'));
      if (dt && dt.nextElementSibling) {
        const dd = dt.nextElementSibling;
        const p = dd.querySelector('p');
        if (p) {
          const spans = p.querySelectorAll('span');
          if (spans.length >= 2) {
            const spanText = spans[1].textContent;
            const m = spanText.match(/\(([^)]+)\)/);
            if (m) {
              let inner = m[1];
              if (!inner.includes(',')) {
                institute = inner.trim();
              } else {
                const [pre, post] = inner.split(',');
                const postTrim = post.trim();
                const tokens = postTrim.split(/\s+/);
                const last = tokens[tokens.length - 1];
                console.log(last);
                if (last !== '대학원' && last !== '일반대학원') {
                  institute = postTrim;
                } else {
                  institute = pre.trim();
                }
              }
            }
            institute = collapse(removeNonKoreanParen(institute));
          }
        }
      }
    }
    // 학위 논문 종류 감지
    let thesisType = '';
    const sliderImg = document.querySelector('.thesisDetail__upper__slider img');
    if (sliderImg) {
      const src = sliderImg.getAttribute('src') || '';
      if (src.includes('master')) thesisType = '석사학위논문';
      else if (src.includes('doctor')) thesisType = '박사학위논문';
    }
    let publisher = institute;
    if (thesisType) {
      publisher = `${institute} ${thesisType}`;
    }

    // 6) 연도
    const year = meta('citation_publication_date') || '';

    const rawMetadata = {
      authors: uniqueAuthors.length === 1 ? uniqueAuthors[0] : uniqueAuthors,
      title_main,
      title_sub,
      journal_name: '',
      volume: '',
      issue: '',
      publisher,
      year,
      page_first: '',
      page_last: '',
      keywords,
      abstract
    };
    return verifyMetadata(rawMetadata);
  } // 그 외의 경우 (학술지 논문 등)
  if (/^https:\/\/[^/]*dbpia[^/]*\/journal\/articleDetail\?nodeId=/.test(url)) {
    const meta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
    const cleanVal = key => collapse(fixTypography(meta(key)));
    // 1) 저자(meta)
    const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]'))
      .map(m => collapse(removeNonKoreanParen(fixTypography(m.getAttribute('content'))))) .filter(s => s);
    // 2) 제목 분리(meta)
    const rawTitle = cleanVal('citation_title');
    const { main: title_main, sub: title_sub } = splitTitle(rawTitle);
    // 3) 학술지명, 권, 호, 연도(meta)
    const journal_name = collapse(removeNonKoreanParen(cleanVal('citation_journal_title')));
    let volume = meta('citation_volume');
    let issue = meta('citation_issue');
    // 권호 정보가 메타에서 없을 경우 대체 파싱
    if (!volume && !issue) {
      const dt = Array.from(document.querySelectorAll('dt')).find(dt => dt.textContent.includes('저널정보'));
      if (dt && dt.nextElementSibling) {
        const aElem = Array.from(dt.nextElementSibling.querySelectorAll('a'))
          .find(a => {
            const oc = a.getAttribute('onclick') || '';
            return /'type'\s*:\s*'권호'/.test(oc);
          });
        if (aElem) {
          const oc = aElem.getAttribute('onclick') || '';
          const m = oc.match(/'type_value'\s*:\s*'([^']+)'/);
          const kv = m ? m[1] : '';
          const nums = kv.match(/\d+/g) || [];
          if (nums.length === 1) {
            issue = nums[0];
          } else if (nums.length >= 2) {
            volume = nums[0];
            issue = nums[1];
          }
        }
      }
    }
    const year = (meta('citation_publication_date').match(/\d{4}/) || [''])[0];
    // 4) 페이지(meta)
    const page_first = meta('citation_firstpage');
    const page_last = meta('citation_lastpage');
    // 5) 키워드(meta)
    const keywords = meta('citation_keywords')
      .split(';')
      .map(s => collapse(fixTypography(s)))
      .filter(s => /[가-힣]/.test(s));
    // 6) 초록(meta)
    const abstract = cleanVal('citation_abstract');
    // 7) 발행기관 추출: <dd class="dd text-depth"> 내 첫 번째 <a> onclick에서 'type_value'
    let publisher = '';
    const ddElem = document.querySelector('.dd.text-depth');
    if (ddElem) {
      const a = ddElem.querySelector('a[onclick*="type_value"]');
      if (a) {
        const onclick = a.getAttribute('onclick') || '';
        const match = onclick.match(/'type_value'\s*:\s*'([^']+)'/);
        if (match) publisher = collapse(removeNonKoreanParen(fixTypography(match[1])));
      }
    }
    // 메타데이터 객체 생성
    const rawMetadata = {
      authors,
      title_main,
      title_sub,
      journal_name,
      volume,
      issue,
      publisher,
      year,
      page_first,
      page_last,
      keywords,
      abstract
    };
    return verifyMetadata(rawMetadata);
  }
}

//----- eArticle 페이지 처리 함수: eArticle 사이트의 메타 태그에서 메타데이터 추출 -----
function parseEArticle() {
  const meta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
  const cleanVal = key => collapse(fixTypography(meta(key)));
  // 1) 저자(meta)
  const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]'))
    .map(m => collapse(removeNonKoreanParen(fixTypography(m.getAttribute('content'))))) .filter(s => s);
  // 2) 제목 분리(meta)
  const rawTitle = cleanVal('citation_title');
  const { main: title_main, sub: title_sub } = splitTitle(rawTitle);
  // 3) 학술지명, 권, 호, 연도(meta)
  const journal_name = collapse(removeNonKoreanParen(cleanVal('citation_journal_title')));
  const volume = meta('citation_volume');
  const issue = meta('citation_issue');
  const year = (meta('citation_publication_date').match(/\d{4}/) || [''])[0];
  // 4) 페이지(meta)
  const page_first = meta('citation_firstpage');
  const page_last = meta('citation_lastpage');
  // 5) 키워드(meta)
  const keywords = meta('citation_keywords')
    .split(/[;；,]/)
    .map(s => collapse(fixTypography(s)))
    .filter(s => /[가-힣]/.test(s));
  // 6) 초록(meta)
  const abstract = cleanVal('citation_abstract');
  // 7) 발행기관 추출: <dt> '발행기관' 다음 <dd>
  let publisher = '';
  const pubDt = Array.from(document.querySelectorAll('dt')).find(dt => dt.textContent.includes('발행기관'));
  if (pubDt && pubDt.nextElementSibling) {
    const dd = pubDt.nextElementSibling;
    const textContents = Array.from(dd.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent);
    publisher = collapse(removeNonKoreanParen(fixTypography(textContents.join(' '))));
  }
  // 메타데이터 객체 생성
  const rawMetadata = {
    authors,
    title_main,
    title_sub,
    journal_name,
    volume,
    issue,
    publisher,
    year,
    page_first,
    page_last,
    keywords,
    abstract
  };
  return verifyMetadata(rawMetadata);
}

//----- 스콜라 페이지 처리 함수: 교보 스콜라 메타태그에서 정보 추출 -----
function parseSCHOLAR() {
  const meta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
  const cleanVal = key => collapse(fixTypography(meta(key)));
  // 1) 저자
  const authors = meta('citation_author')
    ? meta('citation_author')
        .split(';')
        .map(s => collapse(removeNonKoreanParen(fixTypography(s))))
    : [];
  // 2) 제목 분리
  const rawTitle = cleanVal('citation_title');
  const { main: title_main, sub: title_sub } = splitTitle(rawTitle);
  // 3) 학술지명·권·호·연도
  const journal_name = collapse(removeNonKoreanParen(cleanVal('citation_journal_title')));
  let volume = meta('citation_volume');
  let issue = meta('citation_issue');
  // 메타에서 권·호 정보가 없으면 DOM에서 추출
  if (!volume && !issue) {
    const volLink = document.querySelector('.info_list a#volumeLink');
    if (volLink) {
      const text = volLink.textContent.trim();
      const m = text.match(/^(\d+)(?:\((\d+)\))?/);
      if (m) {
        volume = (m[1] && m[1] !== '0') ? m[1] : '';
        issue  = (m[2] && m[2] !== '0') ? m[2] : '';
      }
    }
  }
  const year = (meta('citation_publication_date').match(/\d{4}/) || [''])[0];
  // 4) 페이지
  const page_first = meta('citation_firstpage');
  const page_last   = meta('citation_lastpage');
  // 5) 키워드
  const keywords = meta('citation_keywords')
    .split(/[;；,]/)
    .map(s => collapse(fixTypography(s)))
    .filter(s => /[가-힣]/.test(s));
  // 6) 발행기관 (첫 번째 info_list li a)
  let publisher = '';
  const pubElem = document.querySelector('.info_list li a');
  if (pubElem) {
    publisher = collapse(removeNonKoreanParen(fixTypography(pubElem.textContent)));
  }
  // 7) 초록
  const abstract = cleanVal('citation_abstract');
  // 메타데이터 조립
  const rawMetadata = {
    authors,
    title_main,
    title_sub,
    journal_name,
    volume,
    issue,
    publisher,
    year,
    page_first,
    page_last,
    keywords,
    abstract
  };
  return verifyMetadata(rawMetadata);
}

function parseKOAJ() {
  const meta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
  const cleanVal = key => collapse(fixTypography(meta(key)));
  // 1) 저자
  const authors = Array.from(document.querySelectorAll('meta[property="citation_author"]'))
    .map(m => collapse(removeNonKoreanParen(fixTypography(m.getAttribute('content')))))
    .filter(s => s);
  // 2) 제목 분리
  const rawTitle = cleanVal('citation_title');
  const { main: title_main, sub: title_sub } = splitTitle(rawTitle);
  // 3) 학술지명·권·호·연도
  const journal_name = removeNonKoreanParen(cleanVal('citation_journal_title'));
  const volume = meta('citation_volume');
  const issue = meta('citation_issue');
  const year = (meta('citation_publication_date').match(/\d{4}/) || [''])[0];
  // 4) 페이지
  const page_first = meta('citation_firstpage');
  const page_last   = meta('citation_lastpage');
  // 5) 키워드
  const keywords = meta('citation_keywords')
    .split(/[;；,]/)
    .map(s => collapse(fixTypography(s)))
    .filter(s => /[가-힣]/.test(s));
  // 6) 발행기관 (첫 번째 info_list li a)
  const publisher = removeNonKoreanParen(cleanVal('citation_publisher'));
  // 7) 초록
  const abstract = cleanVal('citation_abstract');
  // 메타데이터 조립
  const rawMetadata = {
    authors,
    title_main,
    title_sub,
    journal_name,
    volume,
    issue,
    publisher,
    year,
    page_first,
    page_last,
    keywords,
    abstract
  };
  return verifyMetadata(rawMetadata);
}

//----- 실행 함수 -----
function getMetadata() {
  const academicDB = getAcademicDBType();
  if (!academicDB) {
    console.log('‼️ 추출할 수 있는 메타데이터를 발견하지 못했습니다');
    return {
      authors: '',
      title_main: '',
      title_sub: '',
      journal_name: '',
      volume: '',
      issue: '',
      publisher: '',
      year: '',
      page_first: '',
      page_last: '',
      keywords: '',
      abstract: ''
    };
  }
  let metadata;
  if (academicDB === 'RISS') metadata = parseRISS();
  else if (academicDB === 'KCI') metadata = parseKCI();
  else if (academicDB === 'KISS') metadata = parseKISS();
  else if (academicDB === 'DBpia') metadata = parseDBpia();
  else if (academicDB === 'eArticle') metadata = parseEArticle();
  else if (academicDB === '스콜라') metadata = parseSCHOLAR();
  else if (academicDB === 'KOAJ') metadata = parseKOAJ();

  console.log(`${academicDB}에서 메타데이터가 추출됨`);
  return metadata;
}

// ----- PDF 파일명 자동 변경 -----

function storageSyncGetForContent(query, callback) {
  const area = storageApi?.sync ?? storageApi?.local;
  if (!area) {
    callback(query && typeof query === 'object' && !Array.isArray(query) ? { ...query } : {});
    return;
  }

  if (globalThis.browser?.storage && area.get) {
    area.get(query)
      .then(callback)
      .catch(() => callback(query && typeof query === 'object' && !Array.isArray(query) ? { ...query } : {}));
    return;
  }

  area.get(query, items => callback(items || {}));
}

function storageSyncGetForContentAsync(query) {
  return new Promise(resolve => {
    storageSyncGetForContent(query, resolve);
  });
}

function initPdfFilenameSetting() {
  if (!fileNamingApi) return;
  storageSyncGetForContent({ [fileNamingApi.PDF_FILENAME_ENABLED_KEY]: true }, items => {
    pdfFilenameFeatureEnabled = items[fileNamingApi.PDF_FILENAME_ENABLED_KEY] !== false;
  });

  if (storageApi?.onChanged?.addListener) {
    storageApi.onChanged.addListener((changes, areaName) => {
      if ((areaName === 'sync' || areaName === 'local') && changes[fileNamingApi.PDF_FILENAME_ENABLED_KEY]) {
        pdfFilenameFeatureEnabled = changes[fileNamingApi.PDF_FILENAME_ENABLED_KEY].newValue !== false;
      }
    });
  }
}

function isPdfFilenameSupportedPage() {
  return Boolean(fileNamingApi && fileNamingApi.isAllowedUrl(location.href));
}

function pdfNormalize(value) {
  return fileNamingApi?.normalizeSpaces
    ? fileNamingApi.normalizeSpaces(value)
    : collapse(String(value || ''));
}

function safeClosest(target, selector) {
  try {
    return target?.closest ? target.closest(selector) : null;
  } catch (_error) {
    return null;
  }
}

function absolutizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /^javascript:/i.test(raw) || raw === '#') return '';
  try {
    return new URL(raw, location.href).href;
  } catch (_error) {
    return raw;
  }
}

function controlText(control) {
  if (!control) return '';
  let text = [
    control.textContent,
    control.value,
    control.getAttribute?.('title'),
    control.getAttribute?.('alt'),
    control.getAttribute?.('aria-label'),
    control.getAttribute?.('download'),
    control.getAttribute?.('class'),
    control.getAttribute?.('id')
  ].join(' ');

  if (control.querySelectorAll) {
    Array.from(control.querySelectorAll('img')).forEach(img => {
      text += ' ' + [
        img.getAttribute('alt'),
        img.getAttribute('title'),
        img.getAttribute('src')
      ].join(' ');
    });
  }

  return pdfNormalize(text);
}

function sourceText(control) {
  if (!control?.getAttribute) return '';
  return pdfNormalize([
    control.getAttribute('href'),
    control.getAttribute('onclick'),
    control.getAttribute('data-url'),
    control.getAttribute('data-href'),
    control.getAttribute('data-file'),
    control.getAttribute('data-filename'),
    control.getAttribute('data-imgdownurl'),
    control.getAttribute('data-oridownurl'),
    control.getAttribute('download')
  ].join(' '));
}

function currentNrichViewerImage() {
  const rendered = document.querySelector('.viewer-container .viewer-canvas img[id], .viewer-canvas img[id], .viewer-image[id]');
  const renderedId = rendered?.getAttribute?.('id') || '';
  if (renderedId) {
    const byDataIdx = Array.from(document.querySelectorAll('img[data-idx]'))
      .find(img => img.getAttribute('data-idx') === renderedId);
    if (byDataIdx) return byDataIdx;
  }

  const renderedSrc = rendered?.getAttribute?.('src') || '';
  if (renderedSrc) {
    return Array.from(document.querySelectorAll('img[data-imgdownurl], img[data-oridownurl]'))
      .find(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-original') || img.getAttribute('data-src') || '';
        return src && (src === renderedSrc || absolutizeUrl(src) === absolutizeUrl(renderedSrc));
      }) || null;
  }

  return null;
}

function nrichViewerDownloadSource(control) {
  const className = control?.getAttribute?.('class') || '';
  if (!/\bviewer-download\b/i.test(className)) return '';
  const image = currentNrichViewerImage();
  if (!image?.getAttribute) return '';

  if (/\bviewer-download-ori\b/i.test(className)) {
    return image.getAttribute('data-oridownurl') || image.dataset?.oridownurl || '';
  }
  return image.getAttribute('data-imgdownurl') || image.dataset?.imgdownurl || '';
}

function downloadSourceText(control) {
  return pdfNormalize(`${sourceText(control)} ${nrichViewerDownloadSource(control)}`);
}

function isLikelyDownloadControl(control) {
  if (!control) return false;
  const text = controlText(control);
  const source = downloadSourceText(control);
  const combined = `${text} ${source}`;
  return /\.pdf(?:[?#]|$|\s)/i.test(combined) ||
    /(?:PDF|원문|본문|다운로드|내려받기|파일|Full\s*Text|Download|View\s*PDF)/i.test(text) ||
    /(?:pdf|download|down|file|fulltext|original|원문|다운로드|fncDown|KCI_FI|ciSereArtiOrteServHistIFrame|fnFile|fileDown|downloadFile|fnOriFileDownload|fnFileDownload)/i.test(source);
}

function isHeritageDownloadControl(control) {
  const text = controlText(control);
  const source = downloadSourceText(control);
  const combined = `${text} ${source}`;
  if (/바로보기|fnPdfViewer|fnSatisfaction2/i.test(combined)) return false;
  return /다운로드|내려받기|fnOriFileDownload|fnFileDownload|includeFileDownLoad|download/i.test(combined);
}

function firstUrlFromJs(source) {
  const text = String(source || '');
  const direct = text.match(/https?:\/\/[^'")\s]+/i);
  if (direct) return direct[0];
  const quoted = text.match(/['"]([^'"]*(?:pdf|download|file|down|original|satisfactionPopup|fileDown)[^'"]*)['"]/i);
  return quoted ? absolutizeUrl(quoted[1]) : '';
}

function splitJsArguments(argsText) {
  const args = [];
  let current = '';
  let quote = '';
  let escaped = false;
  const text = String(argsText || '');

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
      continue;
    }
    if (char === ',') {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  args.push(current.trim());
  return args.map(arg => arg.replace(/^['"]|['"]$/g, ''));
}

function jsCallArguments(source, functionName) {
  const text = String(source || '');
  const match = text.match(new RegExp(`${functionName}\\s*\\(([^)]*)\\)`, 'i'));
  return match ? splitJsArguments(match[1]) : null;
}

function nrichMenuName() {
  const path = location.pathname || '';
  const href = location.href || '';
  if (/\/kor\/mokgan/i.test(path)) return 'mokgan';
  if (/\/kor\/remains/i.test(path)) return 'remains';
  if (/\/kor\/originalUsr/i.test(path) || /[?&]menuIdx=1046\b/i.test(href)) return 'origin';
  return '';
}

function nrichTableName() {
  const menuName = nrichMenuName();
  if (menuName === 'mokgan') return 'mokgan_file';
  if (menuName === 'remains') return 'jungwon_file';
  return 'report_attachfile';
}

function normalizeNrichDownloadArgs(source, context) {
  const satisfactionArgs = jsCallArguments(source, 'fnSatisfaction');
  if (satisfactionArgs) return satisfactionArgs;

  const fileDownloadArgs = jsCallArguments(source, 'fnFileDownload');
  if (fileDownloadArgs) {
    return [
      fileDownloadArgs[5] || context?.downloadUrl || '',
      fileDownloadArgs[0] || '',
      fileDownloadArgs[1] || '',
      fileDownloadArgs[2] || '',
      fileDownloadArgs[3] || '',
      fileDownloadArgs[4] || ''
    ];
  }

  const oriDownloadArgs = jsCallArguments(source, 'fnOriFileDownload');
  if (oriDownloadArgs) {
    return [
      oriDownloadArgs[0] || context?.downloadUrl || '',
      oriDownloadArgs[1] || '',
      oriDownloadArgs[2] || '',
      oriDownloadArgs[4] || '',
      oriDownloadArgs[5] || '',
      oriDownloadArgs[6] || ''
    ];
  }

  return null;
}

function nrichPostBodyFromArgs(args) {
  const fileIdx = args[1] || args[0] || '';
  const menuIdx = args[2] || args[1] || '';
  const fileType = args[3] || '';
  const gubun = args[4] || '';
  const filetype = args[5] || '';
  const body = new URLSearchParams();
  [
    ['file_idx', fileIdx],
    ['menuidx', menuIdx],
    ['menuIdx', menuIdx],
    ['file_type', fileType],
    ['gubun', gubun],
    ['filetype', filetype],
    ['mcidx', fileIdx],
    ['idx', fileIdx],
    ['file_gubun', gubun],
    ['a_number', fileIdx],
    ['add_seq', fileIdx],
    ['make_no', gubun],
    ['filetype_cd', fileType],
    ['table_nm', nrichTableName()],
    ['title', document.title || '']
  ].forEach(([key, value]) => body.set(key, value || ''));
  return body;
}

function downloadRequestFromControl(control, context) {
  const source = downloadSourceText(control);
  const kciDownload = fileNamingApi?.getKciDownloadInfo?.(source, location.href);
  if (kciDownload?.url) {
    return {
      url: kciDownload.url,
      options: {
        method: 'GET',
        credentials: 'include'
      }
    };
  }

  const args = normalizeNrichDownloadArgs(source, context);

  if (fileNamingApi?.isHeritageUrl(location.href) && args && args.length >= 3) {
    return {
      url: absolutizeUrl(args[0] || context?.downloadUrl || ''),
      options: {
        method: 'POST',
        credentials: 'include',
        body: nrichPostBodyFromArgs(args)
      }
    };
  }

  if ((context?.directDownload || context?.report?.directDownload) && context?.downloadUrl) {
    return {
      url: context.downloadUrl,
      options: {
        method: 'GET',
        credentials: 'include'
      }
    };
  }

  return null;
}

function downloadUrlFromControl(control) {
  if (!control?.getAttribute) return '';
  const href = control.getAttribute('href') || '';
  const dataUrl = control.getAttribute('data-url') ||
    control.getAttribute('data-href') ||
    control.getAttribute('data-file') || '';
  const direct = absolutizeUrl(dataUrl || href);
  if (direct) return direct;
  const kciDownload = fileNamingApi?.getKciDownloadInfo?.(`${href.startsWith('javascript:') ? href : ''} ${control.getAttribute('onclick') || ''}`, location.href);
  if (kciDownload?.url) return kciDownload.url;
  return firstUrlFromJs(`${href.startsWith('javascript:') ? href : ''} ${control.getAttribute('onclick') || ''} ${nrichViewerDownloadSource(control)}`);
}

function isDirectDownloadControl(control, downloadUrl) {
  if (!downloadUrl || !control?.getAttribute) return false;
  const href = control.getAttribute('href') || '';
  const dataUrl = control.getAttribute('data-url') ||
    control.getAttribute('data-href') ||
    control.getAttribute('data-file') || '';
  const source = sourceText(control);
  if (/fnOriFileDownload|fnFileDownload|fnFileDown|fnSatisfaction|javascript:/i.test(`${href} ${source}`)) {
    return false;
  }
  return Boolean(dataUrl || (href && !/^javascript:/i.test(href)));
}

function originalFilenameFromControl(control, downloadUrl) {
  if (!control?.getAttribute) return fileNamingApi.filenameFromUrl(downloadUrl);
  const direct = control.getAttribute('download') ||
    control.getAttribute('data-filename') ||
    control.getAttribute('data-file-name') ||
    control.getAttribute('title') ||
    '';
  const directPdf = String(direct).match(/([^\\/:"?*<>|]+\.pdf)\b/i);
  if (directPdf) return directPdf[1];
  const textPdf = controlText(control).match(/([^\\/:"?*<>|]+\.pdf)\b/i);
  if (textPdf) return textPdf[1];
  return fileNamingApi.filenameFromUrl(downloadUrl);
}

function nearbyContainer(control) {
  if (!control?.closest) return control;
  const selectors = [
    '.info-file li',
    '.info-file',
    '.detail_tech',
    '.detail_view',
    '.item',
    '.listCont',
    '.cont',
    '.box',
    '.card',
    'article',
    'tr',
    'dl',
    'li',
    'section',
    '.srchResultListW',
    '.search-result',
    '.result-list',
    '.result',
    "[class*='result']"
  ];

  for (const selector of selectors) {
    const found = safeClosest(control, selector);
    if (found && found.textContent && found.textContent.length >= Math.max((control.textContent || '').length + 20, 40)) {
      return found;
    }
  }
  return control;
}

function valueAfterLabelElement(labelElement) {
  if (!labelElement) return '';
  let sibling = labelElement.nextElementSibling;
  while (sibling) {
    if (/^(dd|td)$/i.test(sibling.tagName)) return pdfNormalize(sibling.textContent);
    sibling = sibling.nextElementSibling;
  }
  return '';
}

function extractReportFacts() {
  const facts = {};
  const labelMap = {
    발행년도: 'year',
    발행연도: 'year',
    제작년도: 'year',
    발간년도: 'year',
    발간연도: 'year',
    저작권자: 'agency',
    발행기관: 'agency',
    발간기관: 'agency',
    조사기관: 'agency',
    생산자: 'agency',
    보고서명: 'reportTitle'
  };

  Array.from(document.querySelectorAll('dt, th')).forEach(labelElement => {
    const label = pdfNormalize(labelElement.textContent).replace(/[:：]\s*$/g, '');
    const key = labelMap[label];
    if (!key) return;
    const value = valueAfterLabelElement(labelElement);
    if (!value) return;
    facts[key] = value;
  });

  const text = pdfNormalize(document.body?.innerText || document.body?.textContent || '');
  if (!facts.year) {
    const yearMatch = text.match(/(?:발행년도|발행연도|제작년도|발간년도|발간연도)\s*[:：]?\s*((?:19|20)\d{2})\s*년?/);
    if (yearMatch) facts.year = yearMatch[1];
  }
  if (!facts.agency) {
    const agencyMatch = text.match(/(?:저작권자|발행기관|발간기관|조사기관|생산자)\s*[:：]?\s*([^|•\n\r]+?)(?=\s+(?:발행년도|발행연도|형태사항|초록|목차|보고서|첨부파일|등록일|조회수)\b|$)/);
    if (agencyMatch) facts.agency = pdfNormalize(agencyMatch[1]);
  }

  return facts;
}

function cleanupReportTitleCandidate(value) {
  return pdfNormalize(String(value || '')
    .replace(/\.pdf$/i, '')
    .replace(/\s*\|\s*국가유산.*$/g, '')
    .replace(/\s*-\s*(국가유산청|국가유산 지식이음|국립문화유산연구원).*$/g, '')
    .replace(/^(발굴조사 보고서|보고서|발간자료|원문정보)\s*$/g, ''));
}

function extractReportTitle() {
  const facts = extractReportFacts();
  if (facts.reportTitle) return cleanupReportTitleCandidate(facts.reportTitle);

  const selectors = [
    '.detail_tech h3.tit',
    '.detail_view h3.tit',
    'main h1',
    'main h2',
    'main h3',
    '#contents h1',
    '#contents h2',
    '#contents h3',
    '#content h1',
    '#content h2',
    '#content h3',
    '.detail h3',
    '.view h3',
    'h1',
    'h2',
    'h3'
  ];
  const rejectExact = new Set(['국가유산 간행물', '보고서', '발굴조사 보고서', '발굴조사보고서', '행정정보', '발간자료', '본문', '연구성과', '국가유산 지식이음']);

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const title = cleanupReportTitleCandidate(el?.textContent || '');
    if (title && !rejectExact.has(title) && !/조사\s*시도.*제출\s*년도/.test(title)) {
      return title;
    }
  }

  return cleanupReportTitleCandidate(document.title || '');
}

function reportMetadataFromPage() {
  const facts = extractReportFacts();
  const reportTitle = extractReportTitle();
  return {
    reportTitle,
    year: (pdfNormalize(facts.year).match(/(?:19|20)\d{2}/) || [''])[0],
    agency: pdfNormalize(facts.agency),
    pageUrl: location.href
  };
}

function reportFileTitleFromControl(control, downloadUrl) {
  const container = nearbyContainer(control);
  const text = pdfNormalize(container?.textContent || controlText(control));
  const pdfMatch = text.match(/([^()\n\r]+?\.pdf)\b/i);
  if (pdfMatch) return pdfNormalize(pdfMatch[1]);
  return originalFilenameFromControl(control, downloadUrl);
}

function downloadControlKey(control) {
  const url = downloadUrlFromControl(control);
  const source = downloadSourceText(control);
  const text = controlText(control)
    .replace(/\b\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b/gi, '')
    .replace(/\b(?:PDF|Download|Full\s*Text)\b/gi, '')
    .replace(/(?:다운로드|내려받기|원문|파일|바로보기)/g, '')
    .trim();
  return `${url || source}|${text}`;
}

function downloadControls() {
  const seen = new Set();
  return Array.from(document.querySelectorAll('a, button, input, [role="button"], [onclick], [data-url], [data-href], [data-file], [data-imgdownurl], [data-oridownurl]'))
    .filter(control => {
      if (!isLikelyDownloadControl(control)) return false;
      if (fileNamingApi?.isHeritageUrl(location.href)) return isHeritageDownloadControl(control);
      return true;
    })
    .filter(control => {
      const key = downloadControlKey(control);
      if (!key || key === '|') return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildAcademicContext(control) {
  let metadata;
  try {
    metadata = getMetadata();
  } catch (_error) {
    metadata = null;
  }

  if (!metadata || Object.values(metadata).every(v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0))) {
    metadata = parseKciSearchResultMetadata(control);
  }

  if (!metadata || Object.values(metadata).every(v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0))) {
    return null;
  }

  const downloadUrl = downloadUrlFromControl(control);
  const directDownload = isDirectDownloadControl(control, downloadUrl);
  return {
    kind: 'academic',
    metadata,
    pageUrl: location.href,
    downloadUrl,
    directDownload,
    originalFilename: originalFilenameFromControl(control, downloadUrl),
    capturedAt: Date.now()
  };
}

function buildReportContext(control, allControls = downloadControls()) {
  const report = reportMetadataFromPage();
  const downloadUrl = downloadUrlFromControl(control);
  const directDownload = isDirectDownloadControl(control, downloadUrl);
  const originalFilename = originalFilenameFromControl(control, downloadUrl);
  const fileTitle = reportFileTitleFromControl(control, downloadUrl);
  const optionIndex = Math.max(0, allControls.indexOf(control));
  const multipleFiles = allControls.length > 1;
  const attachmentTitle = fileNamingApi.deriveAttachmentTitle(report.reportTitle, fileTitle, originalFilename);
  const reportContext = {
    ...report,
    downloadUrl,
    directDownload,
    originalFilename,
    fileTitle,
    attachmentTitle,
    multipleFiles,
    sequenceNumber: multipleFiles && !attachmentTitle ? String(optionIndex + 1) : ''
  };

  return {
    kind: 'report',
    report: reportContext,
    pageUrl: location.href,
    downloadUrl,
    directDownload,
    originalFilename,
    capturedAt: Date.now()
  };
}

function buildDownloadContext(control, allControls = downloadControls()) {
  if (!fileNamingApi?.isAllowedUrl(location.href)) return null;
  if (fileNamingApi.isHeritageUrl(location.href)) return buildReportContext(control, allControls);
  return buildAcademicContext(control);
}

async function filenameForContext(context) {
  const settings = await storageSyncGetForContentAsync(null);
  return fileNamingApi.renderFilename(context, settings);
}

function sendDownloadContext(context) {
  if (!context || !runtimeApi?.sendMessage) return;
  try {
    const message = {
      type: fileNamingApi.DOWNLOAD_CONTEXT_MESSAGE,
      context
    };
    if (globalThis.browser?.runtime?.sendMessage) {
      globalThis.browser.runtime.sendMessage(message).catch(() => {});
      return;
    }
    runtimeApi.sendMessage(message, () => {
      try {
        void globalThis.chrome?.runtime?.lastError;
      } catch (_error) {}
    });
  } catch (_error) {}
}

async function handlePossibleDownload(event) {
  if (!pdfFilenameFeatureEnabled || !isPdfFilenameSupportedPage()) return;
  const control = safeClosest(event.target, 'a, button, input, [role="button"], [tabindex], [onclick], [data-url], [data-href], [data-file], [data-imgdownurl], [data-oridownurl], [class*="down"], [class*="file"], [class*="full"]');
  if (!isLikelyDownloadControl(control)) return;
  if (forcedDownloadControls.has(control)) {
    forcedDownloadControls.delete(control);
    return;
  }

  const now = Date.now();
  const controls = downloadControls();
  const context = buildDownloadContext(control, controls);
  if (now - lastDownloadContextSentAt >= DOWNLOAD_CONTEXT_DEBOUNCE_MS) {
    lastDownloadContextSentAt = now;
    sendDownloadContext(context);
  }

  if (event.type === 'pointerdown' || event.type === 'change') return;

  const request = downloadRequestFromControl(control, context);
  if (!request) return;

  event.preventDefault();
  event.stopPropagation();
  if (event.stopImmediatePropagation) event.stopImmediatePropagation();

  const filename = await filenameForContext(context);
  if (await downloadRequestWithFilename(request, filename)) return;

  forcedDownloadControls.add(control);
  control.click();
}

function optionLabelFromContext(context, index) {
  if (context.kind === 'report') {
    const report = context.report || {};
    return pdfNormalize(report.fileTitle || report.attachmentTitle || report.originalFilename || `PDF ${index + 1}`);
  }
  return pdfNormalize(context.originalFilename || `PDF ${index + 1}`);
}

function getDownloadOptions() {
  if (!pdfFilenameFeatureEnabled || !isPdfFilenameSupportedPage()) return [];
  const controls = downloadControls();
  return controls
    .map((control, index) => {
      const context = buildDownloadContext(control, controls);
      if (!context) return null;
      return {
        optionId: String(index),
        label: optionLabelFromContext(context, index),
        url: context.downloadUrl || '',
        directDownload: Boolean(context.directDownload || context.report?.directDownload),
        kind: context.kind,
        context
      };
    })
    .filter(Boolean);
}

async function downloadRequestWithFilename(request, filename) {
  if (!request?.url || /^javascript:/i.test(request.url)) return false;
  try {
    const response = await fetch(request.url, request.options || { credentials: 'include' });
    if (!response.ok) return false;
    const contentType = response.headers.get('content-type') || '';
    if (/text\/html|application\/json/i.test(contentType)) return false;
    const blob = await response.blob();
    if (!blob.size) return false;
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return true;
  } catch (_error) {
    return false;
  }
}

async function downloadDirectUrlWithFilename(url, filename) {
  return downloadRequestWithFilename({
    url,
    options: {
      method: 'GET',
      credentials: 'include'
    }
  }, filename);
}

async function startNamedDownload(optionId, filename) {
  const controls = downloadControls();
  const index = Number(optionId);
  const control = controls[index];
  if (!control) return { success: false, error: '다운로드 후보를 찾지 못했습니다' };

  const context = buildDownloadContext(control, controls);
  sendDownloadContext(context);
  const request = downloadRequestFromControl(control, context);

  if (request && await downloadRequestWithFilename(request, filename)) {
    return { success: true, method: 'fetch' };
  }

  if ((context?.directDownload || context?.report?.directDownload) &&
      context?.downloadUrl &&
      await downloadDirectUrlWithFilename(context.downloadUrl, filename)) {
    return { success: true, method: 'fetch' };
  }

  const href = control.getAttribute?.('href');
  if ((context?.directDownload || context?.report?.directDownload) && context?.downloadUrl && href && !/^javascript:/i.test(href)) {
    const a = document.createElement('a');
    a.href = context.downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { success: true, method: 'anchor' };
  }

  control.click();
  return { success: true, method: 'click' };
}

function installDownloadContextListeners() {
  if (!fileNamingApi) return;
  initPdfFilenameSetting();
  document.addEventListener('pointerdown', handlePossibleDownload, true);
  document.addEventListener('click', handlePossibleDownload, true);
  document.addEventListener('change', handlePossibleDownload, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') handlePossibleDownload(event);
  }, true);
}

// popup.js로부터 메시지를 listen
function getPageInfo() {
  const metadata   = getMetadata();
  const academicDB = getAcademicDBType();
  const url        = window.location.href;
  const now        = new Date();
  const year2    = String(now.getFullYear()).slice(-2);
  const month2   = String(now.getMonth() + 1).padStart(2, '0');
  const day2     = String(now.getDate()).padStart(2, '0');
  const hours2   = String(now.getHours()).padStart(2, '0');
  const minutes2 = String(now.getMinutes()).padStart(2, '0');
  const seconds2 = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year2}.${month2}.${day2}. ${hours2}:${minutes2}:${seconds2}`;
  const timestampId = Date.now();
  return { metadata, academicDB, url, timestamp, timestampId };
}

if (runtimeApi && !globalThis.__SICKLE_CITE_MESSAGE_LISTENER__) {
  globalThis.__SICKLE_CITE_MESSAGE_LISTENER__ = true;

  runtimeApi.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_INFO') {
      try {
        sendResponse({ success: true, pageInfo: getPageInfo() });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
    if (fileNamingApi && request.action === fileNamingApi.GET_DOWNLOAD_OPTIONS_ACTION) {
      try {
        sendResponse({ success: true, options: getDownloadOptions(), enabled: pdfFilenameFeatureEnabled });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
    if (fileNamingApi && request.action === fileNamingApi.START_NAMED_DOWNLOAD_ACTION) {
      startNamedDownload(request.optionId, request.filename)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
    // sendResponse를 위해 메시지 채널을 열린 상태로 유지
    return true;
  });
}

installDownloadContextListeners();
