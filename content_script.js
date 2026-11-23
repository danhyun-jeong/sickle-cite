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

// 여러 공백을 하나로 축소하고 앞뒤 공백 제거 (폭 없는 공백 문자 U+200B 등은 지움)
function collapse(s) { return s.replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim(); }

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

// 한글 합성어의 하이픈인지: '한-중 문학 교류', '남-북 관계', '한-일-중', '한국-일본 비교'
//   하이픈 앞 어절이 한 음절이면 합성어로 봄
//   두 음절이면, 뒤 어절도 두 음절 이하이고 제목 첫머리(앞에 많아야 한 어절)일 때만 합성어로 봄
//   (부제를 여는 하이픈은 보통 '…에 관한 연구-개벽을 중심으로'처럼 제목 한 덩어리가 끝난 뒤에 옴)
function isCompoundHyphen(raw, pos) {
  const left = raw.slice(0, pos).match(/(?:^|[^가-힣])([가-힣]+)$/)?.[1];
  const right = raw.slice(pos + 1).match(/^[가-힣]+/)?.[0];
  if (!left || !right) return false;
  if (left.length === 1) return true;
  const wordsBefore = raw.slice(0, pos - left.length).trim().split(/\s+/).filter(Boolean).length;
  return left.length === 2 && right.length <= 2 && wordsBefore <= 1;
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
        // 숫자 사이의 하이픈(1901-1941), 로마자에 붙은 하이픈(Corpus-based, It-분열문, K-팝, 2-D),
        // 한글 합성어의 하이픈(한-중, 남-북)은 구분자로 사용하지 않음
        if (d === '-' && ((/\d/.test(raw.charAt(pos - 1)) && /[\dA-Za-z]/.test(raw.charAt(pos + 1)))
            || /[A-Za-z]/.test(raw.charAt(pos - 1)) || isCompoundHyphen(raw, pos))) {
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
//  - 한국어 키워드가 하나라도 있으면 그 밖의 외국어 키워드는 버림
//  - 한국어 키워드가 없으면 한자·가나로만 된 키워드(한문·일본어 논문의 원어 키워드)를, 그것도 없으면 전부 취함
//  - 국문·영문 키워드 목록에 같은 두문자어가 함께 들어 있는 경우 등, 같은 키워드는 한 번만
// 글자 모양 태그가 글자로 남은 것 떼기: '〈sup〉68〈/sup〉Ga' → '68Ga'
function dropTagText(text) {
  return text.replace(/[〈<]\/?(?:sup|sub|i|b|u|em|strong)\s*[〉>]/gi, '');
}
function pickKeywords(list) {
  const all = [...new Set(list
    .filter(k => typeof k === 'string')
    .map(k => dropTagText(k).replace(/\s+/g, ' ').trim())
    .filter(Boolean))];
  const isKorean = k => /[가-힣]/.test(k);
  const isCJK = k => isKoreanScript(k) && !/[A-Za-z]/.test(k);
  const isAcronym = k => /^[A-Z]{2,}$/.test(k);
  if (all.some(isKorean)) return all.filter(k => isKorean(k) || isAcronym(k));
  return all.some(isCJK) ? all.filter(k => isCJK(k) || isAcronym(k)) : all;
}

// 저자 목록 정리 (모든 DB 공통)
//  - 괄호 속 덧붙임(소속, 로마자·한자 병기, '서평자' 같은 역할)은 뺌: '김귀성(金貴聲)' → '김귀성'
//  - 사회자·토론자·좌장은 저자가 아니므로 제외 (학술대회 토론문 등)
//  - 같은 이름은 한 번만
//  - 국문 이름들 뒤에 같은 사람들의 로마자 표기가 같은 수만큼 이어 붙은 경우 로마자 쪽은 버림
//      '김태국 ; Kim, T.' → '김태국',  '권경희 ; Gwon, Gyeong-Hui' → '권경희'
//    (진짜 외국인 공저자를 지우지 않도록, 짝지은 로마자 이름에 국문 성의 첫 자음과 맞는 머리글자가 있을 때만)
// (이 파일은 여러 번 주입되므로 최상위 const 대신 함수 안에 둠)
function isKoreanScript(name) { return /[가-힣\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(name); }
// 한글 첫소리(초성)별로 로마자 표기에서 성이 시작될 수 있는 글자 (이 Lee/Rhee, 류 Yu, 노 Roh 등 관용 표기 포함)
//   성과 이름 첫 글자가 모두 맞아야 함: '정수진 ; Michael Jung'은 이름(수 ↔ Michael)이 안 맞으므로 다른 사람으로 봄
function looksLikeRomanized(korean, latin) {
  const INITIAL_LATIN = ['KG', 'KG', 'NR', 'DT', 'DT', 'RLNY', 'M', 'BP', 'BP', 'S', 'S', 'AEIOUYWLR', 'JC', 'JC', 'CJ', 'K', 'TD', 'PB', 'H'];
  if (!/^[가-힣]{2,4}$/.test(korean)) return true;  // 한자 이름·기관명 등은 따지지 않음
  const allowed = syllable => INITIAL_LATIN[Math.floor((syllable.charCodeAt(0) - 0xac00) / 588)];
  const initials = latin.split(/[\s,.-]+/).filter(Boolean).map(token => token[0].toUpperCase());
  const surname = initials.findIndex(c => allowed(korean[0]).includes(c));
  return surname >= 0 && initials.some((c, i) => i !== surname && allowed(korean[1]).includes(c));
}
function cleanAuthors(list) {
  const AUTHOR_ROLE = /^(?:사회|사회자|토론|토론자|지정토론|지정토론자|좌장|司會|討論)$/;
  const names = [];
  for (const raw of Array.isArray(list) ? list : [list]) {
    if (typeof raw !== 'string') continue;
    const notes = [...raw.matchAll(/[(（]([^)）]*)[)）]/g)].map(m => collapse(m[1]));
    if (notes.some(note => AUTHOR_ROLE.test(note))) continue;
    const name = collapse(raw.replace(/[(（][^)）]*[)）]/g, ' '));
    if (name && !names.includes(name)) names.push(name);
  }
  const isLatin = name => !isKoreanScript(name);
  const half = names.findIndex(isLatin);
  if (half > 0 && names.length === half * 2 && names.slice(half).every(isLatin)
      && names.slice(0, half).every((korean, i) => looksLikeRomanized(korean, names[half + i]))) {
    return names.slice(0, half);
  }
  return names;
}

// 화면에 보이는 권호 표기(형식이 제각각)에서 권·호 추출
//   단위가 적혀 있으면 단위대로: '권'·'卷'·'Vol.'·'Volume' → 권,  '호'·'號'·'No.'·'Issue'·'Number' → 호
//     '제19권 제3호', 'Vol.12 No.3' → 권·호,  '제21호', 'no.60' → 호
//   '집'·'輯'이나 단위 없는 숫자는 빈 자리에 권 → 호 순으로 넣음
//     '제214집' → 권 214,  '제42집 1호' → 권 42·호 1,  '42(1)', 'vol.23, 2' → 권·호
//   통권 번호는 권·호가 모두 없을 때만 권으로, 권이나 호가 있으면 버림
//     '샘터 2012년 11월호 통권 513호' → 권 513,  'vol.16, no.6, 통권 123호' → 권 16·호 6
//   날짜('2012년 11월호', '2020년도', '2024.11', '가을호')·발행 연도·학술지명 속 숫자('21세기…')는 권호가 아님
function parseVolumeIssue(text, { year = '', journal = '' } = {}) {
  let t = ` ${collapse(text ?? '')} `;
  if (journal) t = t.replace(journal, ' ');
  t = t.replace(/(?:19|20)\d{2}\s*(?:년도?|[./-]\s*\d{1,2}(?:\s*[./-]\s*\d{1,2})?)/g, ' ')
    .replace(/\d{1,2}\s*월호?/g, ' ')
    .replace(/(?:봄|여름|가을|겨울)호?/g, ' ');
  if (/^\d{4}$/.test(year)) t = t.replace(new RegExp(`(?<!\\d)${year}(?!\\d)`, 'g'), ' ');
  const total = t.match(/통권\s*(?:제\s*)?(\d+)/)?.[1] ?? '';
  t = t.replace(/통권\s*(?:제\s*)?\d+\s*호?/g, ' ');
  const result = { volume: '', issue: '' };
  const unlabeled = [];
  const tokens = /\b(vol(?:ume)?|no|issue|number)\.?\s*(\d+)|(?:제|第)?\s*(\d+)\s*(권|卷|호|號|집|輯)?/gi;
  for (const [, word, wordNum, num, unit] of t.matchAll(tokens)) {
    const n = (wordNum ?? num).replace(/^0+(?=\d)/, '');
    if (/^0+$/.test(n)) continue;
    const slot = word ? (/^vol/i.test(word) ? 'volume' : 'issue')
      : /권|卷/.test(unit ?? '') ? 'volume' : /호|號/.test(unit ?? '') ? 'issue' : '';
    if (!slot) unlabeled.push(n);
    else if (!result[slot]) result[slot] = n;
  }
  for (const n of unlabeled) {
    if (!result.volume) result.volume = n;
    else if (!result.issue) result.issue = n;
  }
  if (!result.volume && !result.issue) result.volume = total;
  return result;
}

// 권호 표기에서 단위가 붙은 번호('vol.16', 'no.6', '통권 123호')만 남기기 (KCI·KOAJ)
function labeledVolumeIssue(text) {
  return (text ?? '').match(/\b(?:vol|no)\.\s*\d+|통권\s*\d+/gi)?.join(' ') ?? '';
}

// 학술지명·기관명에 영문 명칭이 이어 붙은 경우 국문 명칭만 (국문 명칭이 있을 때)
//   '비교한국학 Comparative Korean Studies' → '비교한국학'
//   'Comparative Korean Studies 비교한국학' → '비교한국학'
//   '초등교육연구(EER)' → '초등교육연구'   (한글이 없는 괄호는 약어·영문 병기로 보고 뺌)
//   괄호 밖 영문은 두 단어 이상일 때만 떼어 냄: 'E²M-전기 전자와 첨단 소재', '한국 SNS 연구' 등은 그대로
//   옛 이름 병기도 뺌: '한국여성정책연구원(구 한국여성개발원)' → '한국여성정책연구원'
function dropEnglishName(name) {
  name = collapse(name.replace(/\s*\(구[\s.,:][^)]*\)/g, ' '));
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
  // 발행 연도를 권으로 적은 경우(RISS 'Vol.2015 No.2' 등) 권은 버림
  if (volume && String(volume) === String(raw.year ?? '').match(/\d{4}/)?.[0]) volume = '';

  const metadata = {
    authors:      cleanAuthors(raw.authors || []),
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

// 학위 수여 기관에서 일반대학원 떼기 (교육대학원 등 특수대학원은 그대로)
//   '경희대학교 대학원' → '경희대학교',  '韓國外國語大學校 大學院' → '韓國外國語大學校'
function dropGeneralGradSchool(name) {
  return collapse(name.normalize('NFC')).replace(/(\S)(?:\s+(?:일반|一般)?(?:대학원|大學院))+$/, '$1');
}

// 학위논문사항(RISS, 연세대 도서관 등) → '연세대학교 국어국문학과 박사학위논문'
//   RISS      '학위논문(박사) -- 경희대학교 대학원 , 국어국문학과 고전문학전공 , 2024.2'
//   연세대    '학위논문(박사)--부산대학교 대학원 :국어국문학과,1993'
//             '학위논문(석사) --연세대학교 교육대학원 :,국어교육전공,2014.8'
//             '학위논문(박사) - ---연세대학교 대학원 :철학과,2002.6'
//   한자 표기 '學位論文(博士) -- 圓光大學敎 大學院 , 佛敎學科 , 2008.02'
//   일반대학원은 떼고(특수대학원은 그대로), 학과 뒤의 전공명은 뺌, 연도·'[학위년도 미상]'은 버림
function formatThesisInfo(thesisInfo) {
  // 한자 표기는 NFC로 통일(호환용 한자 코드 대비)한 뒤 한글로 바꾸고,
  // 한글이 없는 괄호(영문 병기 등)는 '(博士)'를 '(박사)'로 바꾼 다음에 뺌
  const info = removeNonKoreanParen(thesisInfo.normalize('NFC')
    .replace(/學位論文/g, '학위논문').replace(/博士/g, '박사').replace(/碩士/g, '석사')
    .replace(/一般大學院/g, '일반대학원').replace(/(^|\s)大學院/g, '$1대학원'));
  // 학위 종류와 기관 부분은 '--'(앞뒤에 '-'가 더 붙기도 함)로 나뉨
  const [degreePart = '', restPart = ''] = info.split(/\s*-*\s*--+\s*/);
  const degree = degreePart.match(/박사|석사/)?.[0] ?? info.match(/\((박사|석사)\)/)?.[1] ?? '';
  const degreeType = degree ? `${degree}학위논문` : '학위논문';
  // 기관·학과: 쉼표나 쌍점으로 나뉜 조각 중 연도·미상 표기가 아닌 것
  const [institute = '', department = ''] = restPart.split(/\s*[,:;]\s*/)
    .map(collapse)
    .filter(part => part && !/^\[?[^\]]*미상\]?\.?$/.test(part) && !/^\d{4}(?:[.\s]*\d{1,2})*\.?$/.test(part));
  // 학과 이름 뒤의 전공명은 뺌: '국어국문학과 고전문학전공' → '국어국문학과'
  const dept = department.match(/^(\S*(?:학과|學科)(?:\([^)]*\))?)\s/)?.[1] ?? department;
  return collapse(`${dropGeneralGradSchool(institute)} ${dept} ${degreeType}`);
}

// ----- 메타태그·화면 정보 대조 (메타태그가 있는 DB 공통) -----
// 같은 항목을 메타태그(citation_*)와 화면에 보이는 정보 양쪽에서 읽어 대조함
//   - 두 값이 같으면 그대로 채택, 한쪽에만 있으면 그쪽을 채택
//   - 서로 다르면 항목별 기준으로 더 나은 쪽을 채택
//       저자       한쪽이 다른 쪽을 모두 포함하면 포함하는 쪽(공저자 누락 대비), 아니면 한글·한자 이름이 많은 쪽
//       제목       깨진 글자('?')·태그 찌꺼기('〈sup〉')가 적은 쪽 / 한쪽 뒤에 영문 병기 제목이 붙었으면 붙지 않은 쪽 / 부제가 빠졌으면 부제가 있는 쪽
//       학술지명·발행기관  한글 명칭인 쪽 / 한쪽이 다른 쪽을 포함하면 더 온전한 쪽 (영문 명칭 병기는 어느 쪽이든 나중에 뗌)
//       권·호      같은 번호면 화면 표기의 단위를 따름 / 한쪽이 다른 쪽 번호를 모두 포함하면서 더 자세하면 그쪽
//                  (메타태그에 하나만 있는 값은 권으로 봄)
//       연도·면수  형식이 올바른 쪽 / 끝 면수까지 있는 쪽
//       키워드     양쪽을 합침
//       초록       깨진 글자·태그 찌꺼기가 적은 쪽 / 국문 초록인 쪽 / 한쪽이 잘린 것이면 온전한 쪽
//   - 기준으로 가릴 수 없으면 DB별 기본 출처(대개 메타태그)를 따르고, 차이가 있었다는 사실을 콘솔(상세 수준)에 남김
// (메타태그가 거의 없는 RISS, 연세대 도서관은 화면 정보만 사용)

// 메타태그 읽기: 같은 이름의 태그가 여러 개면(공저자, 키워드 등) 모두 읽음
//   글자 모양 태그가 글자로 남은 것('〈sup〉68〈/sup〉Ga')은 뗌
function readCitationMeta() {
  const values = name => [...document.querySelectorAll(`meta[name="${name}"], meta[property="${name}"]`)]
    .map(m => collapse(fixTypography(dropTagText(m.getAttribute('content') ?? ''))))
    .filter(Boolean);
  const first = name => values(name)[0] ?? '';
  const date = first('citation_publication_date') || first('citation_date') || first('citation_year');
  return {
    authors: values('citation_author').flatMap(s => s.split(';')),
    title: first('citation_title'),
    journal_name: first('citation_journal_title'),
    volume: first('citation_volume'),
    issue: first('citation_issue'),
    year: date.match(/\d{4}/)?.[0] ?? '',
    page_first: first('citation_firstpage'),
    page_last: first('citation_lastpage'),
    publisher: first('citation_publisher'),
    keywords: values('citation_keywords').flatMap(s => s.split(/[;；,]/)),
    abstract: first('citation_abstract')
  };
}

// 화면 정보 읽기 도우미
function pageText(selector, root = document) {
  return collapse(fixTypography(root.querySelector(selector)?.textContent ?? ''));
}
function pageTexts(selector, root = document) {
  return [...root.querySelectorAll(selector)].map(el => collapse(fixTypography(el.textContent))).filter(Boolean);
}
// 자식 요소('바로가기' 버튼, 각주 번호 등)를 뺀 요소 자체의 글자만
function ownText(el) {
  return collapse(fixTypography([...(el?.childNodes ?? [])]
    .filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' ')));
}
// 'dt 항목명 / dd 값' 목록에서 항목명이 일치하는 dd
function ddAfter(label, root = document) {
  return [...root.querySelectorAll('dt')].find(dt => collapse(dt.textContent) === label)?.nextElementSibling ?? null;
}
// 괄호 밖의 쉼표·쌍반점으로 이름 나누기: '조성준 ( Jo Sung-jun ) , 한천구 ( Han, C. )' → ['조성준 ( Jo Sung-jun )', '한천구 ( Han, C. )']
function splitNames(text) {
  const names = [];
  let depth = 0, current = '';
  for (const c of text ?? '') {
    if ('(（[［'.includes(c)) depth++;
    if (')）]］'.includes(c)) depth = Math.max(0, depth - 1);
    if (!depth && (c === ',' || c === ';')) { names.push(current); current = ''; } else current += c;
  }
  return [...names, current].map(collapse).filter(Boolean);
}
// 면수 표기: 'pp.389 - 406', '209 - 216 (8page)', '1-186(186pages)', 'p.12'
function parsePages(text) {
  const t = collapse(text ?? '');
  const range = t.match(/(\d+)\s*[-–~]\s*(\d+)/);
  if (range) return { page_first: range[1], page_last: range[2] };
  return { page_first: t.match(/pp?\.\s*(\d+)/i)?.[1] ?? '', page_last: '' };
}
// 줄바꿈(<br>)으로 나뉜 글 덩어리들: 한 칸에 영문·국문 초록이 '<br><br>'로 이어진 경우
function textBlocks(el) {
  const blocks = [''];
  for (const node of el?.childNodes ?? []) {
    if (node.nodeName === 'BR') blocks.push('');
    else blocks[blocks.length - 1] += node.textContent;
  }
  return blocks.map(collapse).filter(Boolean);
}
// 국문 초록이 있으면 국문 초록, 없으면 첫 초록
function pickAbstract(texts) {
  const list = texts.map(t => collapse(fixTypography(t ?? ''))).filter(Boolean);
  return list.find(t => hangulShare(t) >= 0.3) ?? list[0] ?? '';
}

// 메타태그 제목 끝에 붙은 병기 제목(화면에 따로 표시되는 영문·국문 대역 제목) 떼기
//   'Chinatown narratives … perspective :문화기억의 관점에서 본 …' → 'Chinatown narratives … perspective'
function dropParallelTitle(title, parallel) {
  const target = normText(parallel);
  if (!target) return title;
  for (const { index } of [...title.matchAll(/[:=/]/g)].reverse()) {
    if (normText(title.slice(index + 1)) === target) return collapse(title.slice(0, index));
  }
  return title;
}

function normText(s) {
  return collapse(String(s ?? '')).normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}
function hangulShare(s) {
  const letters = String(s ?? '').match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter(c => /[가-힣]/.test(c)).length / letters.length : 0;
}
// 깨진 글자('?', '\ufffd')와 태그 찌꺼기('〈sup〉', '<i>', '&lt;' 등)의 수
function brokenChars(s) {
  return (String(s ?? '').match(/[?\ufffd]|[〈<]\/?[a-z]+[〉>]|&[a-z]+;/gi) ?? []).length;
}

// 두 값 중 더 나은 쪽: 'meta' | 'page' | '' (기준으로 가릴 수 없음)
function betterTitle(meta, page) {
  if (brokenChars(meta) !== brokenChars(page)) return brokenChars(meta) < brokenChars(page) ? 'meta' : 'page';
  const m = normText(meta), p = normText(page);
  const [shorter, longer, longerSide] = m.length < p.length ? [m, p, 'page'] : [p, m, 'meta'];
  if (longer.startsWith(shorter)) {
    // 더 붙은 부분에 한글이 있으면 부제가 빠진 것(긴 쪽), 없으면 영문 병기 제목이 붙은 것(짧은 쪽)
    if (/[가-힣]/.test(longer.slice(shorter.length))) return longerSide;
    return longerSide === 'meta' ? 'page' : 'meta';
  }
  const hm = /[가-힣]/.test(meta), hp = /[가-힣]/.test(page);
  return hm === hp ? '' : (hm ? 'meta' : 'page');
}
function betterName(meta, page) {
  const hm = /[가-힣]/.test(meta), hp = /[가-힣]/.test(page);
  if (hm !== hp) return hm ? 'meta' : 'page';
  // 한쪽이 다른 쪽을 포함하면 더 온전한 이름: '아시아여성학센터' < '이화여자대학교 아시아여성학센터'
  const m = normText(dropEnglishName(meta)), p = normText(dropEnglishName(page));
  if (p.length > m.length && p.includes(m)) return 'page';
  if (m.length > p.length && m.includes(p)) return 'meta';
  return '';
}
function betterAuthors(meta, page) {
  const m = cleanAuthors(meta).map(normText), p = cleanAuthors(page).map(normText);
  if (m.every(a => p.includes(a))) return 'page';
  if (p.every(a => m.includes(a))) return 'meta';
  const native = list => cleanAuthors(list).filter(isKoreanScript).length;
  return native(meta) === native(page) ? '' : (native(meta) > native(page) ? 'meta' : 'page');
}
function betterVolumeIssue(meta, page) {
  const nums = x => [x.volume, x.issue].filter(Boolean);
  const [m, p] = [nums(meta), nums(page)];
  // 같은 번호를 다른 칸에 넣은 것이면, 단위('권'·'호' 등)가 보이는 화면 쪽을 따름
  if (m.length === p.length && [...m].sort().join() === [...p].sort().join()) return 'page';
  if (p.length > m.length && m.every(n => p.includes(n))) return 'page';
  if (m.length > p.length && p.every(n => m.includes(n))) return 'meta';
  return '';
}
function betterPages(meta, page) {
  const valid = x => /^\d+$/.test(x.page_first) ? (!/^\d+$/.test(x.page_last) || +x.page_last >= +x.page_first) : !!x.page_first;
  if (valid(meta) !== valid(page)) return valid(meta) ? 'meta' : 'page';
  if (meta.page_first === page.page_first && !!meta.page_last !== !!page.page_last) return meta.page_last ? 'meta' : 'page';
  return '';
}
function betterAbstract(meta, page) {
  if (brokenChars(meta) !== brokenChars(page)) return brokenChars(meta) < brokenChars(page) ? 'meta' : 'page';
  const km = hangulShare(meta) >= 0.3, kp = hangulShare(page) >= 0.3;
  if (km !== kp) return km ? 'meta' : 'page';
  const m = normText(meta), p = normText(page);
  if (p.length > m.length && p.startsWith(m)) return 'page';
  if (m.length > p.length && m.startsWith(p)) return 'meta';
  return '';
}

// 메타태그 값(meta)과 화면 값(page)을 항목별로 대조해 하나로 합침
//   prefer: 기준으로 가릴 수 없을 때 따를 기본 출처 { 항목명: 'meta' | 'page', default: … }
//   제목은 기본적으로 화면 값(사용자가 보는 제목)을, 나머지는 메타태그 값을 기본으로 함
function reconcile(meta, page, prefer = {}) {
  const isEmpty = v => Array.isArray(v) ? !v.length : !v;
  const pick = (field, m, p, same, better) => {
    if (isEmpty(m)) return p;
    if (isEmpty(p) || same(m, p)) return isEmpty(p) ? m : p;
    const side = better(m, p) || (prefer[field] ?? prefer.default ?? (field === 'title' ? 'page' : 'meta'));
    console.debug(`[Sickle-Cite] ${field}: 메타태그와 화면 정보가 다름 → ${side === 'meta' ? '메타태그' : '화면'} 값 채택`, { meta: m, page: p });
    return side === 'meta' ? m : p;
  };
  const sameText = (a, b) => normText(a) === normText(b);
  const sameName = (a, b) => normText(dropEnglishName(a)) === normText(dropEnglishName(b));
  const sameAuthors = (a, b) => {
    const [x, y] = [cleanAuthors(a).map(normText), cleanAuthors(b).map(normText)];
    return x.length === y.length && x.every(n => y.includes(n));
  };
  const field = (key, source) => ({
    volume: '', issue: '', page_first: '', page_last: '', ...Object.fromEntries(
      Object.entries(source).filter(([k]) => key.includes(k)).map(([k, v]) => [k, collapse(String(v ?? ''))]))
  });

  const year = pick('year', /^\d{4}$/.test(meta.year) ? meta.year : '', /^\d{4}$/.test(page.year) ? page.year : '', (a, b) => a === b, () => '');
  // 권·호: '0'과 발행 연도를 권으로 적은 것은 없는 값으로 보고 대조
  //   메타태그에 권·호 중 하나만 있으면 어느 칸에 들어 있든 단위를 알 수 없는 값으로 보고 권에 넣음
  const volumeIssue = (source, fromMeta) => {
    const clean = v => (/^0*$/.test(v) ? '' : v);
    let { volume, issue } = field(['volume', 'issue'], source);
    [volume, issue] = [clean(volume) === year ? '' : clean(volume), clean(issue)];
    return fromMeta && !volume && issue ? { volume: issue, issue: '' } : { volume, issue };
  };
  const vi = [volumeIssue(meta, true), volumeIssue(page, false)];
  const { volume, issue } = pick('volume/issue', vi[0].volume || vi[0].issue ? vi[0] : null, vi[1].volume || vi[1].issue ? vi[1] : null,
    (a, b) => a.volume === b.volume && a.issue === b.issue, betterVolumeIssue) ?? { volume: '', issue: '' };
  const pages = [field(['page_first', 'page_last'], meta), field(['page_first', 'page_last'], page)];
  const { page_first, page_last } = pick('pages', pages[0].page_first ? pages[0] : null, pages[1].page_first ? pages[1] : null,
    (a, b) => a.page_first === b.page_first && a.page_last === b.page_last, betterPages) ?? { page_first: '', page_last: '' };

  return {
    authors: pick('authors', cleanAuthors(meta.authors ?? []), cleanAuthors(page.authors ?? []), sameAuthors, betterAuthors),
    title: pick('title', meta.title ?? '', page.title ?? '', sameText, betterTitle),
    // 학술지명·발행기관의 영문 약어 괄호('(JNFCWT)' 등)는 대조 전에 뗌
    journal_name: pick('journal_name', collapse(removeNonKoreanParen(meta.journal_name ?? '')), collapse(removeNonKoreanParen(page.journal_name ?? '')), sameName, betterName),
    volume, issue,
    publisher: pick('publisher', collapse(removeNonKoreanParen(meta.publisher ?? '')), collapse(removeNonKoreanParen(page.publisher ?? '')), sameName, betterName),
    year, page_first, page_last,
    // 키워드: 화면 키워드(없으면 메타태그 키워드)를 기준으로, 다른 쪽에만 있는 국문(한글·한자·가나) 키워드를 보탬
    keywords: (() => {
      const [base, other] = page.keywords?.length ? [page.keywords, meta.keywords ?? []] : [meta.keywords ?? [], []];
      const seen = new Set(base.map(normText));
      return [...base, ...other.filter(k => isKoreanScript(k) && !seen.has(normText(k)))];
    })(),
    abstract: pick('abstract', meta.abstract ?? '', page.abstract ?? '', sameText, betterAbstract)
  };
}

// 대조를 마친 값에서 제목을 본제목·부제로 나누고 공통 후처리
function finishMetadata({ title, ...rest }) {
  const { main: title_main, sub: title_sub } = splitTitle(title ?? '');
  return verifyMetadata({ ...rest, title_main, title_sub });
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
        tmp.thesisInfoRaw = collapse(fixTypography(content));
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
  //    '국문 초록'이 없으면 '다국어 초록' 중 실제로 한국어인 것 (한글이 글자의 절반 이상)
  const abstractTexts = Array.from(document.querySelectorAll('p.title'))
    .filter(p => /초록/.test(p.textContent))
    .map(p => {
      // div.text.off: 펼친 전문 (div.text.on은 앞부분만 보여 주는 미리보기)
      const div = p.parentElement.querySelector('div.text.off') ?? p.parentElement.querySelector('div.text');
      const text = div ? collapse(Array.from(div.querySelectorAll('p')).map(q => fixTypography(q.textContent)).join('\n\n') || fixTypography(div.textContent)) : '';
      return { korean: p.textContent.includes('국문 초록'), text };
    })
    .filter(a => a.text);
  const isMostlyHangul = text => (text.match(/[가-힣]/g)?.length ?? 0) * 2 >= (text.match(/[^\s\d\p{P}]/gu)?.length ?? 1);
  tmp.abstract = (abstractTexts.find(a => a.korean) ?? abstractTexts.find(a => isMostlyHangul(a.text)))?.text ?? '';
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

//----- KCI 페이지 처리 함수: 화면 정보와 메타태그 대조 -----
// KCI 메타태그는 학술지명·발행기관이 영문인 경우가 많아, 가릴 수 없는 차이는 화면 값을 따름
function parseKCI() {
  // 1) 저자: 저자 정보 페이지 링크만 (ORCID 아이콘 링크 'orcid 바로가기' 등은 제외), '국문 / 영문' 표기는 국문만
  const authorLinks = document.querySelectorAll('.author a[href*="poCretDetail"]');
  const authors = Array.from(authorLinks.length ? authorLinks : document.querySelectorAll('.author a:not([href*="orcid"])'))
    .map(a => collapse(removeNonKoreanParen(fixTypography(a.textContent.split('/')[0]))))
    .filter(s => s && !/\d/.test(s));
  // 2) 권/호/연도/면수: '2009, vol.16, no.6, 통권 123호 pp. 473-480 (8 pages)', '2007, vol., no.60, pp. …' 형식
  const volText = document.querySelector('.journalInfo .vol')?.textContent ?? '';
  const ppIdx = volText.indexOf('pp.');
  // 3) 키워드
  const kwBox = Array.from(document.querySelectorAll('.box')).find(b => b.querySelector('h2')?.textContent.includes('키워드'));
  const page = {
    authors,
    title: fixTypography(document.getElementById('artiTitle')?.textContent || document.title),
    journal_name: pageText('.journalInfo .jounal a'),
    // KCI는 권·호에 늘 'vol.'·'no.'를 붙이므로 그것만 읽음 ('vol.23, 2'의 '2'처럼 단위 없는 숫자는 호가 아님)
    ...parseVolumeIssue(labeledVolumeIssue(volText)),
    year: volText.match(/\d{4}/)?.[0] ?? '',
    ...(ppIdx === -1 ? {} : parsePages(volText.slice(ppIdx))),
    publisher: pageText('.journalInfo .pub a'),
    keywords: kwBox ? pageTexts('a[id="keywd"]', kwBox) : [],
    abstract: fixTypography(document.getElementById('korAbst')?.textContent || '')
  };
  return finishMetadata(reconcile(readCitationMeta(), page, { default: 'page' }));
}

//----- KISS 페이지 처리 함수: 메타태그와 화면 정보 대조 -----
//   화면 상단: 제목(h1.title) / 저자 / 발행기관 · 2017.02 / 학술지 · 17권 1호 · 1-8(8pages)
function parseKISS() {
  const top = document.querySelector('.wrap_journal_index') ?? document;
  const year = pageTexts('.mb-1 > span.value', top).map(s => s.match(/^\d{4}/)?.[0]).find(Boolean) ?? '';
  const journal_name = pageText('a[href*="/Detail/Jr"]:not([href*="Vol="])', top);
  const page = {
    authors: splitNames(pageText('.author', top)),
    title: pageText('h1.title', top),
    journal_name,
    ...parseVolumeIssue(pageText('a[href*="/Detail/Jr"][href*="Vol="]', top), { year, journal: journal_name }),
    year,
    ...parsePages(pageText('#articlePages')),
    publisher: pageText('a[href*="/Detail/In"]', top),
    keywords: pageTexts('.wrap_keyword .keyword'),
    abstract: pickAbstract(pageTexts('#collapse-part1 .wrap_part_body p'))
  };
  const meta = readCitationMeta();
  meta.title = dropParallelTitle(meta.title, pageText('.title_sub', top));
  return finishMetadata(reconcile(meta, page));
}

//----- DBpia 페이지 처리 함수: 메타태그와 화면 정보 대조 -----
function parseDBpia() {
  const pageType = getDBpiaPageType();
  const meta = readCitationMeta();
  // 화면 공통: 제목, 저자, 발행연도, 키워드('#키워드'), 초록(국문·영문이 따로 있으면 국문)
  const common = {
    title: pageText('.thesisDetail__tit'),
    authors: pageTexts('.thesisDetail__authorList .authorName'),
    year: pageText('[itemprop="datePublished"]').match(/\d{4}/)?.[0] ?? '',
    keywords: pageTexts('.keywordWrap__keyword').map(k => k.replace(/^#\s*/, '')),
    // 초록 칸 하나에 국문 초록과, 숨겨진 다른 언어 초록(span[lang])이 함께 들어 있음
    abstract: pickAbstract([...document.querySelectorAll('.abstractTxt')].flatMap(box => {
      const own = box.cloneNode(true);
      own.querySelectorAll('[lang]').forEach(el => el.remove());
      return [own.textContent, ...[...box.querySelectorAll('[lang]')].map(el => el.textContent)];
    }))
  };
  // 메타태그 제목에 이어 붙은 병기 제목은 떼고 대조
  meta.title = dropParallelTitle(meta.title, pageText('.thesisDetail__equalTit'));
  // 학위논문인 경우
  if (pageType === 'thesis') {
    // 학위 수여 기관: 화면의 저자 소속 '(한국외국어대학교, 한국외국어대학교 대학원)'에서
    //   앞쪽(한글 대학명) + 특수대학원(교육대학원 등)이면 그 대학원명, 일반대학원은 뗌
    //   메타태그는 '韓國外國語大學校 大學院'처럼 한자로만 적힌 경우가 있어 대조함
    const affiliation = document.querySelector('.thesisDetail__authorList .authorName + span')?.textContent.match(/\(([^)]+)\)/)?.[1] ?? '';
    const [university = '', school = ''] = affiliation.split(',').map(s => collapse(s.normalize('NFC')));
    const special = dropGeneralGradSchool(school).match(/\S*대학원$/)?.[0];
    const pageInstitute = university && special ? `${university} ${special}` : university;
    const raw = reconcile(
      { ...meta, publisher: dropGeneralGradSchool(meta.publisher.replace(/,+$/, '')) },
      { ...common, publisher: pageInstitute || collapse(pageText('[itemprop="publisher"]')) }
    );
    // 화면에 병기 제목이 없어 떼지 못한 경우 대비: 콜론 뒤에 한글이 없으면(영문 병기) 콜론 앞까지 취함
    const colon = [...raw.title.matchAll(/:/g)].find(m => !/[가-힣]/.test(raw.title.slice(m.index + 1)));
    if (colon) raw.title = raw.title.slice(0, colon.index);
    // 학위 논문 종류: 표지 이미지 파일명(.../service/cover/master_K.png, doctor_K.png)으로 판별
    // 1순위 og:image 메타 태그, 2순위 본문의 표지 <img> (메타 태그가 없을 경우 대비)
    const coverSrc =
      document.querySelector('meta[property="og:image"]')?.content ||
      document.querySelector('img[src*="/service/cover/"]')?.getAttribute('src') ||
      '';
    const degree = coverSrc.match(/\/cover\/(master|doctor)_/)?.[1];
    const thesisType = { master: '석사학위논문', doctor: '박사학위논문' }[degree] ?? '';
    // 학위 종류를 판별하지 못해도 기관명은 유지
    return finishMetadata({
      ...raw,
      publisher: thesisType ? `${raw.publisher} ${thesisType}` : raw.publisher,
      journal_name: '', volume: '', issue: '', page_first: '', page_last: ''
    });
  }
  // 학술지 논문 등: 저널정보 '발행기관 · 간행물 · 권호', 수록면 '209 - 216 (8page)'
  if (pageType === 'article') {
    const info = document.querySelector('.dd.text-depth') ?? document;
    const journal_name = pageText('a[href*="publicationDetail"]', info);
    const page = {
      ...common,
      journal_name,
      ...parseVolumeIssue(pageText('a[href*="voisDetail"]', info), { year: common.year, journal: journal_name }),
      ...parsePages(ddAfter('수록면')?.textContent),
      publisher: pageText('a[href*="iprdDetail"]', info)
    };
    return finishMetadata(reconcile(meta, page));
  }
}

//----- eArticle 페이지 처리 함수: 메타태그와 화면 정보 대조 -----
//   화면: 제목(h2, 병기 제목은 span.tran) / 발행기관 / 간행물 / 통권 '제52집 (2025.02)' / 페이지 'pp.9-9' / 저자 / 키워드 / 초록
function parseEArticle() {
  const detail = document.querySelector('.art-detail') ?? document;
  const volumeText = ownText(ddAfter('통권', detail));
  const year = volumeText.match(/\((\d{4})[.)]/)?.[1] ?? '';
  const journal_name = ownText(ddAfter('간행물', detail));
  const page = {
    title: ownText(detail.querySelector(':scope > h2')),
    authors: pageTexts('dd.authors span', detail),
    journal_name,
    ...parseVolumeIssue(volumeText, { year, journal: journal_name }),
    year,
    ...parsePages(ddAfter('페이지', detail)?.textContent),
    publisher: ownText(ddAfter('발행기관', detail)),
    keywords: pageTexts('a.keyword', detail),
    abstract: pickAbstract(pageTexts('dl.abs dd', detail))
  };
  // 제목 아래 병기 제목(span.tran)이 메타태그 제목에 이어 붙은 경우 떼고 대조
  const meta = readCitationMeta();
  meta.title = dropParallelTitle(meta.title, pageText(':scope > h2 .tran', detail));
  return finishMetadata(reconcile(meta, page));
}

//----- 스콜라 페이지 처리 함수: 메타태그와 화면 정보 대조 -----
//   화면 상단: 제목 / 발행기관 / 간행물 / 권호 'Vol.12 No.3', '제214집' / 2014.09 / 191 - 198 (8 pages)
//   저자·키워드·초록은 페이지가 열린 뒤 그려짐 (그려지기 전이면 메타태그 값만 쓰게 됨)
function parseSCHOLAR() {
  const items = pageTexts('.info_list .item');
  const year = items.map(s => s.match(/^(\d{4})[.\s]/)?.[1]).find(Boolean) ?? '';
  const journal_name = pageText('#pubcLink');
  const page = {
    title: pageText('.prdTitle'),
    authors: pageTexts('#AUTR_NAME_ID dt.name'),
    journal_name,
    ...parseVolumeIssue(pageText('#volumeLink'), { year, journal: journal_name }),
    year,
    ...parsePages(items.find(s => /pages?\)?$/i.test(s))),
    publisher: pageText('#academyLink'),
    keywords: pageTexts('#KEYWORD_BEST_ID a').map(k => k.replace(/^#\s*/, '')),
    abstract: pickAbstract(pageTexts('section.abstract .cont_txt'))
  };
  const meta = readCitationMeta();
  meta.title = dropParallelTitle(meta.title, pageText('.subTitle'));
  return finishMetadata(reconcile(meta, page));
}

//----- KOAJ 페이지 처리 함수: 메타태그와 화면 정보 대조 -----
//   화면 상단: 제목(h2, 영문 병기는 p.small) / 학술지 / '2011 vol.29, no.5, pp.389 - 406' / 발행기관 / 저자(각주 번호·ORCID 제외)
function parseKOAJ() {
  const info = document.querySelector('.articles-top-info') ?? document;
  const [journal_name = '', volText = ''] = pageTexts('.ati-left > b.semi', info);
  const page = {
    title: ownText(document.querySelector('.articles-journals-top h2')),
    authors: splitNames(ownText(document.querySelector('.article-author-name'))),
    journal_name,
    ...parseVolumeIssue(labeledVolumeIssue(volText)),
    year: volText.match(/^\d{4}/)?.[0] ?? '',
    ...parsePages(volText.match(/pp\..*/)?.[0]),
    publisher: pageText('.ati-left a b.semi', info),
    // 키워드 칸: 국문 목록과 영문 목록이 '<br>'로 나뉨
    keywords: textBlocks(document.querySelector('#articleKeyword')).flatMap(line => line.split(/\s*[,;]\s*/)),
    // 한 칸에 영문·국문 초록이 '<br><br>'로 이어져 있음
    abstract: pickAbstract(textBlocks(document.querySelector('#articleAbstract')))
  };
  const meta = readCitationMeta();
  meta.title = dropParallelTitle(meta.title, pageText('.articles-journals-top h2 p.small'));
  return finishMetadata(reconcile(meta, page));
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
  //   관제 '(조선 후기) 한문학의 전변과 양상' → '조선 후기 한문학의 전변과 양상' (괄호만 뺌)
  //   대등표제 뒤에 국문 부제가 오는 경우 '식민지 검열 = Colonial censorship : institution-text-practice : 제도 텍스트 실천'
  //   → '식민지 검열 : 제도 텍스트 실천'
  const statement = text('서명/저자사항');
  const slash = statement.lastIndexOf(' / ');
  const titlePart = (slash >= 0 ? statement.slice(0, slash) : statement)
    .replace(/^\(([^)]*[가-힣\u4e00-\u9fff][^)]*)\)\s*/, '$1 ');
  const [ownTitle, parallelTitle = ''] = titlePart.split(' = ');
  const laterSub = ownTitle.includes(' : ') ? undefined
    : parallelTitle.split(' : ').slice(1).find(t => /[가-힣]/.test(t));
  const { main, sub } = splitTitle(laterSub ? `${ownTitle} : ${laterSub}` : titlePart);

  // 저자: '개인저자' 링크 (생몰년 '홍길동, 1970-'과 끝의 마침표 '김석득.'은 떼어 냄). 없으면 저자사항에서
  //   학위논문은 지도교수도 '개인저자'에 올라 있으므로('조현아 ; 노대규' + 일반주기 '지도교수: 노대규')
  //   지도교수를 빼고, 학위논문의 저자는 한 사람이므로 첫 번째만
  const advisors = text('일반주기').match(/지도\s*교수\s*[:：]\s*([^,;.]+)/)?.[1].split(/\s*[,·]\s*/).map(collapse) ?? [];
  let authors = links('개인저자')
    .map(a => collapse(removeNonKoreanParen(a.replace(/,?\s*\d{4}-(\d{4})?\.?$/, '').replace(/[.,]+$/, ''))))
    .filter(a => !advisors.includes(a));
  //   저자사항의 이름: '검열연구회 지음', '金學成 編', '류수열 [지음].', '신익철 외 지음' → 역할어·'외' 떼기
  const role = /\s+(?:지음|엮음|옮김|편저|편역|역주|공저|공편|共著|共編|著|編|譯|저|편|역|외|등)\.?$/;
  const stated = (slash >= 0 ? statement.slice(slash + 3) : '').split(/\s*[;,，]\s*/)
    .map(name => { let n = collapse(name.replace(/\[[^\]]*\]/g, ' ')); while (role.test(n)) n = n.replace(role, ''); return n.replace(/[.,]+$/, ''); })
    .filter(Boolean);
  if (!authors.length) authors = stated;
  //   학위논문 저자는 한 사람. 저자사항(표제지 그대로)이 한글이면 그쪽을 믿음
  //   (개인저자가 저자사항과 다른 사람으로 잘못 올라간 목록이 있음: '안국선 문학 연구 / 임승준 저.' + 개인저자 '이주엽')
  if (text('학위논문주기')) authors = /[가-힣]/.test(stated[0] ?? '') ? stated.slice(0, 1) : authors.slice(0, 1);

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
    .replace(/\(구[\s.][^)]*\)/g, '').replace(/;.*$/, '').replace(/[.,\s]+$/, ''));
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
  const pageMatch = pageMatches.at(-1) ?? rest.match(/,\s*(\d+)\s*[-–]\s*(\d+)[.\s]*$/);
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
    rest.match(/()\b(?:no|issue)\.?\s*(\d+)/i) ??
    rest.match(/(\d*)\s*\(\s*[^()\d]*(\d+)\s*\)/) ??   // 42(3), (100), 46(특별호1)
    rest.match(/(\d+)\.\s+(\d+)/);
  if (m) [, volume = '', issue = ''] = m;
  else volume = rest.match(/\d+/)?.[0] ?? '';   // 단위 없는 숫자 하나뿐이면 권으로 (권·호 구분 없음)
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
  //   EBSCO 제목 끝의 언어 표시 '… 为中心. (Chinese)'는 뺌
  const title = (titles.find(hasKorean) ?? titles[0] ?? '').replace(/\.?\s*\((?:Chinese|Japanese|Korean|English)\)$/, '');
  const { main, sub } = splitTitle(fixTypography(title));

  // 저자: 링크마다 첫 이름 (영문 병기·소속 괄호 제외)
  //   한 링크에 여러 명이 ';'로 이어진 경우('嚴 明; 王 正海')는 모두,
  //   '박동욱(朴東昱 / Pak Dong-uk'처럼 괄호가 ' / ' 앞에서 끊긴 경우도 괄호째 뺌
  const authors = [...(rows.get('저자')?.querySelectorAll('a') ?? [])]
    .flatMap(a => a.textContent.includes(';')
      ? a.textContent.split(';')
      : [a.querySelector('searchlink')?.textContent ?? a.textContent])
    .map(name => name.split(' / ')[0])
    .map(name => collapse(removeNonKoreanParen(fixTypography(name).replace(/\([^)]*(\)|$)/g, ''))))
    .filter(Boolean);

  // 발행연도: 표에 없으면(일본 잡지기사색인 등) 제목 아래 학술지 정보에서
  const year = [text('Publication Year'), text('Publisher Information'), collapse(header?.querySelector('p')?.textContent ?? '')]
    .map(t => t.match(/(?<!\d)(?:1[89]|20)\d{2}(?!\d)/)?.[0]).find(Boolean) ?? '';
  // 주제어: KCI 제공 자료는 주제어 칸에 키워드가 아니라 학문 분류('한국어와문학', '기타인문학')가 들어 있으므로 버림
  const fromKCI = text('컨텐츠 제공자') === 'Korea Citation Index';
  const keywords = fromKCI ? [] : [...(rows.get('주제어')?.querySelectorAll('a') ?? [])].map(a => collapse(fixTypography(a.textContent)));
  // 초록: 국문 줄들, 국문이 없으면(영문 초록뿐) 첫 줄
  const abstractLines = lines(rows.get('초록')).filter(Boolean).map(fixTypography);
  const abstract = abstractLines.some(hasKorean) ? abstractLines.filter(hasKorean).join('\n\n') : abstractLines[0] ?? '';

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
    //   (한자 표기 '忠南大學校 大學院'도 그대로 대학명으로)
    const school = `${text('단체')} ${text('Publisher Information')}`.match(/\S+(?:학교|學校)/)?.[0] ?? '';
    //   '북한대학원대학교 사회문화언론전공'처럼 대학원대학교면 대학명과 겹치므로 뺌
    const special = /^(일반)?대학원$|학교$/.test(graduate) ? '' : graduate.replace(/\([^)]*\)/g, '');
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
