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
  if (/^https:\/\/[^/]*scholar.kyobobook[^/]*\/article\/detail\//.test(url))
    return 'SCHOLAR';
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
  s = s.replace(/</g, '〈').replace(/>/g, '〉');
  s = s.replace(/｢/g, '「').replace(/｣/g, '」');
  s = s.replace(/<</g, '《').replace(/>>/g, '》');
  s = s.replace(/≪/g, '《').replace(/≫/g, '》');
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
  const openDouble  = raw.indexOf('『'), closeDouble  = raw.indexOf('』');
  const openSingle = raw.indexOf('「'), closeSingle = raw.indexOf('」');
  const ranges = [];
  if (openDouble >= 0 && closeDouble > openDouble) ranges.push([openDouble, closeDouble]);
  if (openSingle >= 0 && closeSingle > openSingle) ranges.push([openSingle, closeSingle]);

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
  // 문서의 <title> 태그를 확인
  const pageTitle = document.title || '';
  // "학술지논문"을 포함하고 있을 경우 메타데이터 추출
  if (pageTitle.includes('학술지논문')) {
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
  // "학위논문"을 포함하고 있을 경우 메타데이터 추출
  if (pageTitle.includes('학위논문')) {
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

//----- SCHOLAR 페이지 처리 함수: Scholar(교보 스콜라) 메타태그에서 정보 추출 -----
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
  else if (academicDB === 'SCHOLAR') metadata = parseSCHOLAR();
  else if (academicDB === 'KOAJ') metadata = parseKOAJ();

  console.log(`${academicDB}에서 메타데이터가 추출됨`);
  return metadata;
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_INFO') {
    try {
      sendResponse({ success: true, pageInfo: getPageInfo() });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }
  // sendResponse를 위해 메시지 채널을 열린 상태로 유지
  return true;
});