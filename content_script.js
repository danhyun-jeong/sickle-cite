// 현재 페이지가 가리키는 원래 학술 DB 주소를 { host, path, params }로 돌려준다.
// 대학 도서관 프록시로 접속한 경우도 원래 주소로 되돌려 판별할 수 있게 함:
//   - 호스트 변형형: https://www-dbpia-co-kr.proxy.OO.ac.kr/…  → 'www.dbpia.co.kr.proxy.OO.ac.kr'
//                   http://www.riss.kr.libproxy.OO.ac.kr:8080/… (http, 포트 포함)
//   - 경로 삽입형:  https://libproxy.OO.ac.kr/_Lib_Proxy_Url/https://www.kci.go.kr/…
// 경로와 쿼리 파라미터는 프록시를 거쳐도 그대로이므로 그것으로 페이지 종류를 판별한다.
function getTargetLocation() {
  const { hostname, pathname, search } = window.location;
  const embedded = pathname.match(/\/(https?:)?\/*([a-z0-9.-]+\.[a-z]{2,})(\/.*)$/i);
  const isEmbeddedDB = embedded && /riss|kci|kstudy|dbpia|earticle|kyobobook/i.test(embedded[2]);
  return {
    host: (isEmbeddedDB ? embedded[2] : hostname).toLowerCase().replaceAll('-', '.'),
    path: isEmbeddedDB ? embedded[3] : pathname,
    params: new URLSearchParams(search),
  };
}

function getAcademicDBType() {
  const { host, path, params } = getTargetLocation();
  if (host.includes('riss') && path.startsWith('/search/detail/DetailView.do'))
    return 'RISS';
  if (host.includes('kci.go.kr') && path.startsWith('/kciportal/ci/sereArticleSearch/ciSereArtiView'))
    return 'KCI';
  if (host.includes('kci.go.kr') && path.startsWith('/kciportal/landing/article.kci'))
    return 'KOAJ';
  if (/kiss.*kstudy.*com/.test(host) && /^\/Detail[^/]*\/Ar/.test(path) && params.has('key'))
    return 'KISS';
  if (host.includes('dbpia') && getDBpiaPageType())
    return 'DBpia';
  if (/earticle.*net/.test(host) && path.startsWith('/Article/'))
    return 'eArticle';
  if (/scholar.*kyobobook/.test(host) && path.startsWith('/article/detail/'))
    return '스콜라';
  if (host === 'library.yonsei.ac.kr' && /^\/(search|eds)\/detail\//.test(path))
    return '연세대';
  console.log('‼️ 현재 페이지를 인식할 수 없습니다.');
}

// DBpia 페이지 종류: 'thesis'(학위논문 /journal/detail) | 'article'(학술지 논문 등 /journal/articleDetail)
function getDBpiaPageType() {
  const { path, params } = getTargetLocation();
  if (!params.has('nodeId')) return null;
  if (path.startsWith('/journal/detail')) return 'thesis';
  if (path.startsWith('/journal/articleDetail')) return 'article';
  return null;
}

// ----- 공통 헬퍼 함수 -----

// 여러 공백을 하나로 축소하고 앞뒤 공백 제거
function collapse(s) { return s.replace(/\s+/g, ' ').trim(); }

// 인용 및 구분자 기호 교정
function fixTypography(text) {
  let s = text.trim();
  // DB 측 입력 오류로 작은따옴표가 중복된 경우(''…'') 하나로 축소 (작은따옴표 변환보다 먼저)
  s = s.replace(/'{2,}/g, "'");
  s = s.replace(/`([^`]+)`/g, '‘$1’');
  s = s.replace(/′([^′]+)′/g, '‘$1’');
  s = s.replace(/'([^']+)'/g, '‘$1’');
  s = s.replace(/"([^"]+)"/g, '“$1”');
  s = s.replace(/″([^″]+)″/g, '“$1”');
  // 겹화살괄호(<<, >>)를 홑화살괄호(<, >)보다 먼저 변환해야 함
  s = s.replaceAll('<<', '《').replaceAll('>>', '》');
  s = s.replaceAll('<', '〈').replaceAll('>', '〉');
  s = s.replaceAll('｢', '「').replaceAll('｣', '」');
  s = s.replaceAll('≪', '《').replaceAll('≫', '》');
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
// 키워드 선별 (모든 DB 공통)
//  - 한글이 한 글자라도 들어간 키워드 = 한국어 키워드
//  - 대문자 두 글자 이상 두문자어(AI, SNS 등)는 한국어 키워드에 준해 함께 남김
//  - 한국어 키워드가 하나라도 있으면 그 밖의 외국어 키워드는 버리고,
//    없을 때만 외국어 키워드를 그대로 취함
//  - 국문·영문 키워드 목록에 같은 두문자어가 함께 들어 있는 경우 등, 같은 키워드는 한 번만
function pickKeywords(list) {
  const all = [...new Set(list
    .filter(k => typeof k === 'string')
    .map(k => k.replace(/\s+/g, ' ').trim())
    .filter(Boolean))];
  const isKorean = k => /[가-힣]/.test(k);
  const isAcronym = k => /^[A-Z]{2,}$/.test(k);
  return all.some(isKorean) ? all.filter(k => isKorean(k) || isAcronym(k)) : all;
}

// 학술지명·기관명에 영문 명칭이 이어 붙은 경우 국문 명칭만 (국문 명칭이 있을 때)
//   '비교한국학 Comparative Korean Studies' → '비교한국학'
//   'Comparative Korean Studies 비교한국학' → '비교한국학'
//   '초등교육연구(EER)' → '초등교육연구'   (한글이 없는 괄호는 약어·영문 병기로 보고 뺌)
//   괄호 밖 영문은 두 단어 이상일 때만 떼어 냄: 'E²M-전기 전자와 첨단 소재', '한국 SNS 연구' 등은 그대로
function dropEnglishName(name) {
  if (!/[가-힣]/.test(name)) return name;
  const english = String.raw`[A-Za-z][A-Za-z'’.&-]*(?:[\s,:]+[A-Za-z(][A-Za-z'’.&()-]*)+`;
  return collapse(removeNonKoreanParen(name)
    .replace(new RegExp(String.raw`(?:\s+|\s*[(\[]\s*)${english}\s*[)\]]?$`), '')
    .replace(new RegExp(String.raw`^${english}\s+(?=[가-힣])`), ''));
}

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
    journal_name: dropEnglishName(raw.journal_name || ''),
    volume:       volume,
    issue:        issue,
    publisher:    dropEnglishName(raw.publisher || ''),
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
    metadata.keywords = pickKeywords(metadata.keywords);
    if (metadata.keywords.length === 1) {
      metadata.keywords = metadata.keywords[0];
    }
  }
  return metadata;
}

// 학위논문사항(RISS, 연세대 도서관 등): '학위논문(박사) -- 연세대학교 대학원, 국어국문학과 …' → '연세대학교 국어국문학과 박사학위논문'
function formatThesisInfo(thesisInfo) {
  // 1. "--"를 기준으로 앞/뒤 분리
  const [degreePart = '', restPart = ''] = thesisInfo.split('--').map(s => s.trim());
  // 1-1. degreePart에서 괄호 안의 학위 종류 추출 (괄호가 없으면 원본 앞부분 그대로)
  const degreeLabel = degreePart.match(/\(([^)]+)\)/)?.[1] ?? '';
  const degreeType = degreeLabel
    ? `${degreeLabel}학위논문`
    : degreePart.replace(/\s*\(.*\)\s*/, '');
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
  // 3. department: '학과' 포함 시 공백 앞 텍스트만 사용
  let department = restFields[1] || '';
  if (department.includes(' ')) {
    const [pre] = department.split(' ');
    if (pre.includes('학과')) {
      department = pre;
    }
  }
  // 4. 조합
  return `${institute} ${department} ${degreeType}`.trim();
}

// ----- RISS 페이지 처리 함수: RISS 사이트의 DOM에서 메타데이터 추출 -----
function parseRISS() {
  // 학술지논문/학위논문 판별: <title> 태그(2025. 09. 기준 레거시) 또는 상단 위치 표시(.locationW)
  const pageTitle = document.title || '';
  const breadcrumb = document.querySelector('.locationW')?.textContent ?? '';
  const isArticle = pageTitle.includes('학술지논문') || breadcrumb.includes('국내학술논문');
  const isThesis = !isArticle && (pageTitle.includes('학위논문') || breadcrumb.includes('학위논문'));
  if (!isArticle && !isThesis) {
    console.error('학술지논문/학위논문 여부를 확인할 수 없습니다.');
    return {};
  }
  console.log(isArticle ? '학술지논문으로 확인됨' : '학위논문으로 확인됨');

  // 1. 서지사항 리스트 수집: .infoDetailL ul li 항목
  const items = document.querySelectorAll('#thesisInfoDiv .infoDetailL ul li');
  if (!items.length) return;
  const tmp = {};
  // 2. 각 li 요소에서 레이블과 콘텐츠 분리
  items.forEach(li => {
    const labelEl = li.querySelector('span.strong');
    const label = collapse(labelEl?.textContent || '');
    const content = fixTypography(labelEl ? li.textContent.replace(labelEl.textContent, '') : li.textContent);
    switch (label) {
      case '저자':
        tmp.authors = Array.from(li.querySelectorAll('a')).map(a => collapse(removeNonKoreanParen(fixTypography(a.textContent))));
        break;
      case '발행기관':
        tmp.publisher = collapse(removeNonKoreanParen(fixTypography(content)));
        break;
      // 학위논문사항: 전체를 문자열로 보관했다가 아래 formatThesisInfo로 가공
      case '학위논문사항':
        tmp.thesisInfoRaw = collapse(removeNonKoreanParen(fixTypography(content)));
        break;
      case '학술지명': case '학술지':
        tmp.journal_name = collapse(removeNonKoreanParen(fixTypography(li.querySelector('a')?.textContent || content)));
        break;
      // 권호사항: Vol. 및 No. 형식에서 volume과 issue 추출 (No.- 인 경우 빈 문자열)
      case '권호사항':
        tmp.volume = content.match(/Vol\. *(\d+)/i)?.[1] ?? '';
        tmp.issue = content.match(/No\. *(\d+)/i)?.[1] ?? '';
        break;
      // 발행연도: 4자리 숫자로 연도 추출
      case '발행연도':
        tmp.year = content.match(/\d{4}/)?.[0] ?? '';
        break;
      // 주제어: 키워드 리스트 분리 (한국어/외국어 선별은 pickKeywords에서)
      case '주제어':
        tmp.keywords = collapse(content).split(/[;；,]/).map(s => fixTypography(s));
        break;
      // 수록면: 페이지 범위(first-last) 추출
      case '수록면': {
        const pg = content.match(/(\d+)-(\d+)/);
        if (pg) { tmp.page_first = pg[1]; tmp.page_last = pg[2]; }
        break;
      }
    }
  });
  // 3. 국문 초록 추출: '국문 초록' 레이블 위치 기준으로 텍스트 노드 수집
  const abstractTitleP = Array.from(document.querySelectorAll('p.title')).find(p => p.textContent.includes('국문 초록'));
  const abstractDiv = abstractTitleP?.parentElement.querySelector('div.text.off');
  if (abstractDiv) {
    const paras = Array.from(abstractDiv.querySelectorAll('p')).map(p => fixTypography(p.textContent));
    tmp.abstract = collapse(paras.join('\n\n'));
  }
  // 4. 제목 분리: rawTitle을 splitTitle 함수로 처리
  const rawTitle = document.querySelector('#thesisInfoDiv .title')?.textContent || '';
  const { main, sub } = splitTitle(fixTypography(rawTitle.split('=')[0]));

  if (isArticle) {
    return verifyMetadata({
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
    });
  }

  return verifyMetadata({
    authors: tmp.authors,
    title_main: main,
    title_sub: sub,
    journal_name: '',
    volume: '',
    issue: '',
    // '학위논문사항' 항목이 없는 페이지에서도 오류 없이 빈 값으로 처리
    publisher: formatThesisInfo(tmp.thesisInfoRaw ?? ''),
    year: tmp.year,
    page_first: '',
    page_last: '',
    keywords: tmp.keywords,
    abstract: tmp.abstract
  });
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
  // 4) 키워드(meta)
  const keywords = meta('citation_keywords')
    .split(/[;,]/)
    .map(s => fixTypography(s));
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
  const pageType = getDBpiaPageType();
  // 학위논문인 경우
  if (pageType === 'thesis') {
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
      .map(s => collapse(fixTypography(s)));

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
    // 학위 논문 종류 감지: 표지 이미지 파일명(.../service/cover/master_K.png, doctor_K.png)으로 판별
    // 1순위 og:image 메타 태그, 2순위 본문의 표지 <img> (메타 태그가 없을 경우 대비)
    const coverSrc =
      document.querySelector('meta[property="og:image"]')?.content ||
      document.querySelector('img[src*="/service/cover/"]')?.getAttribute('src') ||
      '';
    const degree = coverSrc.match(/\/cover\/(master|doctor)_/)?.[1];
    const thesisType = { master: '석사학위논문', doctor: '박사학위논문' }[degree] ?? '';
    // 학위 종류를 판별하지 못해도 기관명은 유지
    const publisher = thesisType ? `${institute} ${thesisType}` : institute;

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
  if (pageType === 'article') {
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
      .map(s => collapse(fixTypography(s)));
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
    .map(s => collapse(fixTypography(s)));
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
    .map(s => collapse(fixTypography(s)));
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
    .map(s => collapse(fixTypography(s)));
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

//----- 연세대학교 도서관: 소장자료 상세 페이지(/search/detail/…) -----
// 상세정보 표(table#moreInfo)의 각 행 'th: 항목명 / td: 값'에서 추출 (2026-11 기준)
//   서명/저자사항  개발독재 체제의 '조국 근대화'와 남성성 : 황석영, 최인호의 중단편 소설을 중심으로 / 정재훈
//   개인저자       <a>정재훈</a>
//   발행사항       서울 : 연세대학교 대학원, 2023
//   학위논문주기   학위논문(석사) --연세대학교 대학원,국어국문학과,2023.8
//   비통제주제어   <a>남성성</a>,<a>개발독재</a>,…,<a>masculinity</a>,…
function parseYonseiCatalog() {
  const rows = new Map([...document.querySelectorAll('#moreInfo tr')]
    .map(tr => [collapse(tr.querySelector('th')?.textContent ?? ''), tr.querySelector('td')]));
  const text = label => collapse(fixTypography(rows.get(label)?.textContent ?? ''));
  const links = label => [...(rows.get(label)?.querySelectorAll('a') ?? [])]
    .map(a => collapse(fixTypography(a.textContent)));

  // 제목: '본제목 : 부제목 / 저자사항'에서 ' / ' 앞부분
  const statement = text('서명/저자사항');
  const slash = statement.lastIndexOf(' / ');
  const { main, sub } = splitTitle(slash >= 0 ? statement.slice(0, slash) : statement);

  // 저자: '개인저자' 링크 (생몰년 '홍길동, 1970-' 등은 떼어 냄). 없으면 저자사항에서
  let authors = links('개인저자').map(a => collapse(removeNonKoreanParen(a.replace(/,?\s*\d{4}-(\d{4})?\.?$/, ''))));
  if (!authors.length && slash >= 0) authors = statement.slice(slash + 3).split(/[,，]/).map(collapse);

  // 발행사항: '발행지 : 발행처, 연도'
  const imprint = text('발행사항');
  const year = imprint.match(/\d{4}/)?.[0] ?? text('학위논문주기').match(/\d{4}/)?.[0] ?? '';
  const thesisInfo = text('학위논문주기');
  const publisher = thesisInfo
    ? formatThesisInfo(thesisInfo)
    : collapse(imprint.replace(/^[^:]*:/, '').replace(/,\s*[^,]*\d{4}.*$/, ''));

  // 키워드: 주제어 행들의 링크 (한국어/외국어 선별은 pickKeywords에서)
  const keywords = [...rows.keys()].filter(label => label.includes('주제')).flatMap(links);
  // 초록: 초록(요약) 행이 있는 자료만
  const abstractLabel = [...rows.keys()].find(label => /초록|요약/.test(label));

  return verifyMetadata({
    authors,
    title_main: main,
    title_sub: sub,
    publisher,
    year,
    keywords,
    abstract: abstractLabel ? text(abstractLabel) : ''
  });
}

//----- 연세대학교 도서관: 학술논문 검색(EDS) 상세 페이지(/eds/detail/…) -----
// 로그인해야 열림. 제목·학술지 정보는 .profileHeader, 나머지는 table#moreInfo 행에서 추출 (2026-11 기준)
//   h3   국문 제목<br>영문 제목   또는   국문 제목 / 영문 제목
//   p    학술지 논문만. 학술지명·권·호·쪽 (형식은 아래 parseEDSSource 참고)
//   저자                 <a><searchlink>정재훈</searchlink> (연세대학교)</a>, 학위논문은 '정재훈 / Jaehoon Jeong'
//   단체 / Degree        연세대학교 / 일반대학원 국어국문학과, 현대문학전공, Dissertation   (학위논문만)
//   Publisher Information 한국여성문학학회, The Academy Society of …, 2025.
//   Publication Year     2025
//   주제어 / 초록         주제어는 링크 목록, 초록은 국문<br>영문
// EDS 제목 아래 줄(학술지 정보) 풀이. 자료 제공처마다 형식이 제각각이라(2026-11 실제 사례),
//   DBpia     <i>현대소설연구</i>. 2025-12 (100):201-244   /  <i>한국여성학</i>. 2026-09 42(3):103-137
//   KISS      <i>민족문학사연구 / Journal of Korean Literary History</i>. Dec 31, 2025 89:367  (시작 쪽만)
//   AccessOn  <i>여성문학연구, Feminism and Korean Literature</i>. 2025-08-01 0(65):110-139
//   KCI       한국여성학, 40(4), pp.53-57 Dec, 2024   /  행정판례연구, 22(2), 2, pp.169-208 Dec, 2017 (뒤 2는 통권)
//   스콜라    여성학논집 42. 1 (2025): 3-71.   /  여성연구 127 (2025): 57-78.
//   기타      지속가능경영융합(구 아유르베다 융합 연구) 제18권 4호 p. 57-69
//             한국이민정책학보, 12/31/2025, Vol. 8, Issue 3, p. 45-62   (eArticle)
//   Atla      <searchlink>신약연구</searchlink>, 83 no 3 Jun 2026, p 525-559  /  …, 229 2025, p 72-120
//   EBSCO     <searchlink>Journal of …</searchlink>. Apr2025, Vol. 30 Issue 2, p124-130. 7p.
//   스콜라    융합영어영문학(구.English Reading and Teaching) 10. 1 (2025): 231-258.   ('(구 …)' 옛 이름은 뺌)
// 형식을 하나하나 맞추는 대신, 확실한 것부터 지워 나간다:
//   ① 학술지명(<i>·<searchlink> 안, 없으면 첫 숫자 앞) → ② 날짜·연도(표의 발행연도 이용) → ③ 쪽(맨 뒤) → ④ 남은 것에서 권·호
function parseEDSSource(p, year) {
  const source = collapse(p?.textContent ?? '');
  const italic = p?.querySelector('i, searchlink')?.textContent;

  // ① 학술지명: 국문·영문 병기('A / B', 'A, B')면 한글이 든 쪽. '(구 옛 이름)'은 뺌
  // (학술지명 없이 '7. 3 (2025): 179-203.'처럼 숫자로 시작하면 학술지명은 비움)
  const rawJournal = italic
    ? collapse(italic)
    : /^\d/.test(source) ? '' : source.split(/[,.]?\s+(?=제\s*\d|\d|vol\.|\(\d)/i)[0];
  //   (쉼표는 학술지명 안에도 쓰이므로 'Journal of Physical, Multiple …', 한글이 든 쪽을 고를 때만 나눔)
  const parts = rawJournal.split(/\s+[\/=]\s+|\s*,\s*/);
  const journal = collapse((parts.find(t => /[가-힣]/.test(t)) ?? rawJournal.split(/\s+[\/=]\s+/)[0] ?? '')
    .replace(/\(구[\s.][^)]*\)/g, '').replace(/[.,\s]+$/, ''));
  let rest = ` ${italic ? source.replace(collapse(italic), '') : source.slice(rawJournal.length)} `;

  // ② 날짜: 2025-12, 2025-08-01, Dec 31, 2025, Dec, 2024, Apr2025, 12/31/2025, (2025), 그리고 발행연도 숫자
  rest = rest
    .replace(/\d{4}-\d{1,2}(-\d{1,2})?/g, ' ')
    .replace(/\b(?!(?:Vol|No|Issue)\b)[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}/g, ' ')
    .replace(/\b(?!(?:Vol|No|Issue)\b)[A-Z][a-z]{2,8}\.?,?\s*\d{4}/g, ' ')
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ')
    .replace(/\(\s*\d{4}\s*\)/g, ' ');
  if (year) rest = rest.replace(new RegExp(`(?<!\\d)${year}(?!\\d)`, 'g'), ' ');

  // ③ 쪽: 'pp.189-214', 'p. 57-69', 'p 525-559', 'p124-130', ':201-244', ':367'(시작 쪽만) 중 맨 뒤의 것
  let pageFirst = '', pageLast = '';
  const pageMatches = [...rest.matchAll(/(?:\bpp?\.?\s*|:\s*)(\d+)(?:\s*[-–~]\s*(\d+))?/gi)];
  const pageMatch = pageMatches.at(-1);
  if (pageMatch) {
    [, pageFirst, pageLast = ''] = pageMatch;
    rest = rest.slice(0, pageMatch.index) + ' ' + rest.slice(pageMatch.index + pageMatch[0].length);
  }

  // ④ 권·호: 먼저 맞는 형식 하나만 (그 뒤의 통권 번호 등은 무시)
  let volume = '', issue = '';
  const m =
    rest.match(/vol\.?\s*(\d+)(?:\D+?(?:no|issue)\.?\s*(\d+))?/i) ??
    rest.match(/(?:제\s*)?(\d+)\s*권(?:\D*?(?:제\s*)?(\d+)\s*호)?/) ??
    rest.match(/()(?:제\s*)?(\d+)\s*호/) ??
    rest.match(/(\d+)\s+no\.?\s*(\d+)/i) ??
    rest.match(/(\d*)\s*\(\s*[^()\d]*(\d+)\s*\)/) ??   // 42(3), (100), 46(특별호1)
    rest.match(/(\d+)\.\s+(\d+)/);
  if (m) [, volume = '', issue = ''] = m;
  else issue = rest.match(/\d+/)?.[0] ?? '';   // 숫자 하나뿐이면 호수로 (권·호 구분 없음)
  // DBpia '2016(4)'처럼 발행연도를 권 자리에 적은 경우는 권으로 보지 않음
  if (volume && volume === year) volume = '';

  return { journal, volume, issue, pageFirst, pageLast };
}

function parseYonseiEDS() {
  const rows = new Map([...document.querySelectorAll('#moreInfo tr')]
    .map(tr => [collapse(tr.querySelector('th')?.textContent ?? ''), tr.querySelector('td')]));
  const text = label => collapse(fixTypography(rows.get(label)?.textContent ?? ''));
  const hasKorean = t => /[가-힣]/.test(t);
  // <br>로 나뉜 줄들
  const lines = el => (el?.innerHTML ?? '').split(/<br\s*\/?>/i)
    .map(html => collapse(new DOMParser().parseFromString(html, 'text/html').body.textContent));
  // 'A, B, C' 중 한글이 든 첫 부분 (없으면 첫 부분)
  const koreanPart = t => { const parts = t.split(/\s*,\s*/); return parts.find(hasKorean) ?? parts[0] ?? ''; };

  // 제목: 국문·영문 제목이 <br> 또는 ' / '로 이어져 있음 → 한글이 든 쪽
  const header = document.querySelector('.profileHeader');
  const titles = lines(header?.querySelector('h3')).flatMap(t => t.split(' / '));
  const { main, sub } = splitTitle(fixTypography(titles.find(hasKorean) ?? titles[0] ?? ''));

  // 저자: 링크마다 첫 이름 (영문 병기·소속 괄호 제외)
  const authors = [...(rows.get('저자')?.querySelectorAll('a') ?? [])]
    .map(a => a.querySelector('searchlink')?.textContent ?? a.textContent.split(' / ')[0])
    .map(name => collapse(removeNonKoreanParen(fixTypography(name).replace(/\([^)]*\)/g, ''))))
    .filter(Boolean);

  const year = text('Publication Year').match(/\d{4}/)?.[0] ?? text('Publisher Information').match(/\d{4}/)?.[0] ?? '';
  const keywords = [...(rows.get('주제어')?.querySelectorAll('a') ?? [])].map(a => collapse(fixTypography(a.textContent)));
  const abstract = lines(rows.get('초록')).filter(hasKorean).map(fixTypography).join('\n\n');

  // 학위논문: 대학 + (특수대학원) + 학과 + 학위 종류 → '연세대학교 국어국문학과 석사학위논문'
  //   Degree  '일반대학원 국어국문학과, 현대문학전공, Dissertation', '정책대학원 경제정책학과, …',
  //           '6W5|교육대학원 화학교육전공, …', '경기대2025(박)0037, 대학원 공연예술학과, …' (앞에 코드가 붙기도 함)
  //   단체    '연세대학교', '경성대학교 일반대학원', '정책대학원 경제정책학과'(대학명 없음) 등 제각각
  //   → 대학명은 단체·Publisher Information에서 '…대학교/…학교'를 찾고,
  //     대학원은 RISS(formatThesisInfo)처럼 (일반)대학원이면 빼고 특수대학원이면 남김
  //   석사·박사 구분이 없으면('Dissertation' 등) '학위논문'까지만
  if (rows.has('Degree')) {
    const degree = text('Degree').replace(/^[^|]*\|/, '');
    // '○○대학원 ○○학과'로 시작하는 부분 (없으면 첫 부분)
    const segments = degree.split(',').map(collapse);
    const program = segments.find(seg => /^\S*원(\([^)]*\))?\s/.test(seg)) ?? segments[0];
    const [graduate = '', ...deptWords] = program.split(' ');
    const school = `${text('단체')} ${text('Publisher Information')}`.match(/\S+학교/)?.[0] ?? '';
    const special = /^(일반)?대학원$/.test(graduate) ? '' : graduate.replace(/\([^)]*\)/g, '');
    const department = deptWords.find(w => /(과|부)$/.test(w)) ?? deptWords.join(' ');
    const level = /박사|\(박\)|doctor|ph\.?\s?d/i.test(degree) ? '박사' : /석사|\(석\)|master/i.test(degree) ? '석사' : '';
    return verifyMetadata({
      authors, title_main: main, title_sub: sub, year, keywords, abstract,
      publisher: collapse(`${school} ${special} ${department} ${level}학위논문`)
    });
  }

  // 학술지 논문
  const { journal, volume, issue, pageFirst, pageLast } = parseEDSSource(header?.querySelector('p'), year);
  return verifyMetadata({
    authors, title_main: main, title_sub: sub,
    journal_name: removeNonKoreanParen(fixTypography(journal)),
    volume, issue,
    publisher: removeNonKoreanParen(fixTypography(koreanPart(text('Publisher Information')))),
    year,
    page_first: pageFirst, page_last: pageLast,
    keywords, abstract
  });
}

//----- 실행 함수 -----
function getMetadata(academicDB) {
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
  const parsers = {
    'RISS': parseRISS,
    'KCI': parseKCI,
    'KISS': parseKISS,
    'DBpia': parseDBpia,
    'eArticle': parseEArticle,
    '스콜라': parseSCHOLAR,
    'KOAJ': parseKOAJ,
    '연세대': location.pathname.startsWith('/eds/') ? parseYonseiEDS : parseYonseiCatalog
  };
  const metadata = parsers[academicDB]();
  console.log(`${academicDB}에서 메타데이터가 추출됨`);
  return metadata;
}

// 추출 일시: 'YY.MM.DD. HH:MM:SS' 형식
function formatTimestamp(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getFullYear() % 100)}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}. `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getPageInfo() {
  const academicDB = getAcademicDBType();
  const metadata = getMetadata(academicDB);
  const now = new Date();
  return {
    metadata,
    academicDB,
    url: window.location.href,
    timestamp: formatTimestamp(now),
    timestampId: now.getTime()
  };
}

// ----- 팝업으로 결과 전달 -----
// 이 파일은 팝업이 열릴 때마다 chrome.scripting.executeScript({ files })로 주입되며,
// 파일의 마지막 표현식 값이 executeScript의 result로 팝업에 그대로 전달된다.
// (메시지 리스너를 쓰지 않으므로, 같은 탭에 여러 번 주입되어도 리스너가 쌓이지 않음)
// ※ 재주입 시 '이미 선언됨' 오류를 피하려면 최상위에 let/const/class 선언을 두지 말 것.
(() => {
  try {
    return { success: true, pageInfo: getPageInfo() };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
})();
