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
      // 주제어: 키워드 리스트 분리 및 필터링
      case '주제어':
        tmp.keywords = collapse(content).split(/[;；,]/).map(s => fixTypography(s)).filter(s => /[가-힣]/.test(s) || /^[A-Z]{2,}$/.test(s));
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

  // 학위논문: '학위논문(박사) -- 연세대학교 대학원, 국어국문학과 …' → '연세대학교 국어국문학과 박사학위논문'
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
    'KOAJ': parseKOAJ
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
