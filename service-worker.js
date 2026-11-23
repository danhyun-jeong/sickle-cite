// =============================================================================
// 업데이트 직후 한 번: 서지정보 추출 내역 전체를 현재 기준으로 다시 묶음
// (같은 논문 판별 기준이 바뀌었을 수 있으므로. 판별 결과는 같은 내역이면 항상 같으므로
//  기준이 그대로여도 다시 묶어서 생기는 문제는 없다.)
// =============================================================================

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'update') return;
  try {
    const { history = [] } = await chrome.storage.local.get('history');
    if (history.length) {
      assignArticleIds(history, { regroup: true });
      // 이전 버전에서 저장된 키워드에도 '한국어 키워드 우선' 규칙을 한 번만 적용
      const { keywordRuleApplied } = await chrome.storage.local.get('keywordRuleApplied');
      if (!keywordRuleApplied) {
        for (const item of history) {
          if (!Array.isArray(item.metadata?.keywords)) continue;
          const picked = pickKeywords(item.metadata.keywords);
          item.metadata.keywords = picked.length === 1 ? picked[0] : picked;
        }
      }
      await chrome.storage.local.set({ history, keywordRuleApplied: true });
    }
    // 2.0 개발 중에 잠시 쓰였던 표시값 정리
    await chrome.storage.local.remove('articleGroupingVersion');
  } catch (err) {
    console.error('내역 다시 묶기 실패:', err);
  }
});

// content_script.js의 pickKeywords와 같은 규칙: 한국어 키워드(와 두문자어)가 있으면 그것만
function pickKeywords(list) {
  const all = [...new Set(list
    .filter(k => typeof k === 'string')
    .map(k => k.replace(/\s+/g, ' ').trim())
    .filter(Boolean))];
  const isKorean = k => /[가-힣]/.test(k);
  const isAcronym = k => /^[A-Z]{2,}$/.test(k);
  return all.some(isKorean) ? all.filter(k => isKorean(k) || isAcronym(k)) : all;
}

// ----- 같은 논문 판별 (popup.js '1-1. 같은 논문 판별'과 같은 코드. 고칠 때 함께 고칠 것) -----

const toArray = value => Array.isArray(value) ? value : (value ? [value] : []);

// 비교용 정규화: 대소문자, 공백, 문장부호·기호(따옴표, 괄호, 쌍점 등) 차이를 무시
const normalizeForMatch = text => String(text ?? '').normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

// URL에서 DB별 논문 고유번호를 뽑아 비교용 키로 만든다.
// 대학 도서관 프록시로 접속하면 호스트가 'www-dbpia-co-kr.proxy.OO.ac.kr',
// 'www.riss.kr.libproxy.OO.ac.kr' 처럼 바뀌지만 경로와 파라미터는 그대로이므로,
// 호스트가 아니라 내역에 기록된 학술 DB 이름으로 규칙을 고르고 경로·파라미터에서만 번호를 찾는다.
// (2026-11 실제 페이지 주소로 확인한 형식)
//   RISS     …/search/detail/DetailView.do?…&control_no=e3b0c44298fc1c14…
//   DBpia    …/journal/detail?nodeId=T16810405, …/journal/articleDetail?nodeId=NODE11234567
//   KCI      …/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART003002677
//   KOAJ     …/landing/article.kci?arti_id=ART003002677   (KCI와 같은 번호 → 같은 논문)
//   KISS     …/Detail/Ar?key=4012345
//   eArticle …/Article/A283769
//   스콜라    …/article/detail/4010063029533
//   연세대   library.yonsei.ac.kr/search/detail/CATTOT000002162902, …/eds/detail/edskst_edskst.article.57253
const URL_ID_RULES = {
  RISS: { prefix: 'riss', key: url => url.searchParams.get('control_no') },
  DBpia: { prefix: 'dbpia', key: url => url.searchParams.get('nodeId') },
  KCI: { prefix: 'kci', key: url => url.searchParams.get('sereArticleSearchBean.artiId') },
  KOAJ: { prefix: 'kci', key: url => url.searchParams.get('arti_id') },
  KISS: { prefix: 'kiss', key: url => url.searchParams.get('key') },
  eArticle: { prefix: 'earticle', key: url => url.pathname.match(/\/Article\/(\w+)/i)?.[1] },
  스콜라: { prefix: 'scholar', key: url => url.pathname.match(/\/article\/detail\/(\w+)/i)?.[1] },
  '연세대': { prefix: 'yonsei', key: url => url.pathname.match(/\/detail\/([^/]+)/)?.[1] },
};

function articleKeyFromUrl(rawUrl, academicDB) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    const rule = URL_ID_RULES[academicDB];
    const id = rule?.key(url)?.trim();
    if (id) return `${rule.prefix}:${id.toUpperCase()}`;
    url.hash = '';
    return url.href;
  } catch {
    return rawUrl;
  }
}

// 글자 길이에 따라 허용하는 오타·오기 글자 수: 아주 짧으면 0, 보통 1, 긴 제목은 2
const allowedTypos = length => length <= 5 ? 0 : length <= 15 ? 1 : 2;

// 편집 거리(한 글자 추가·삭제·바꿈 횟수)가 max 이하인지. max를 넘는 순간 계산을 멈춘다.
function withinEditDistance(a, b, max) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, row[j]);
    }
    if (rowMin > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

// 띄어쓰기·기호를 무시하고 비교, 길이에 맞는 만큼만 오타 허용
const nearlyEqual = (a, b) => withinEditDistance(a, b, allowedTypos(Math.max(a.length, b.length)));

// 항목별 비교용 정보 (같은 객체를 여러 번 비교하므로 캐시)
const featureCache = new WeakMap();
function articleFeatures(entry) {
  if (featureCache.has(entry)) return featureCache.get(entry);
  const meta = entry.metadata ?? {};
  // DB마다 본제목/부제목을 나누는 방식이 달라('본제목 : 부제목'을 본제목에 통째로 넣는 등)
  // 둘을 이어 붙인 전체 제목으로 비교한다
  const title = normalizeForMatch(`${meta.title_main ?? ''}${meta.title_sub ?? ''}`);
  const features = {
    urlKey: articleKeyFromUrl(entry.url, entry.academicDB),
    authors: new Set(toArray(meta.authors).map(normalizeForMatch).filter(Boolean)),
    title,
    journal: normalizeForMatch(meta.journal_name),
    digits: title.match(/\d+/g)?.join(',') ?? '',
  };
  featureCache.set(entry, features);
  return features;
}

// 서지정보로 같은 논문인지
function isLikelySameArticle(a, b) {
  const fa = articleFeatures(a);
  const fb = articleFeatures(b);
  return Boolean(fa.title) && Boolean(fb.title)
    && !fa.authors.isDisjointFrom(fb.authors)   // 저자 한 명 이상 일치 (저자 정보가 없으면 불일치)
    && fa.digits === fb.digits                  // '(1)'과 '(2)'처럼 숫자만 다른 연속 논문은 다른 논문
    && nearlyEqual(fa.title, fb.title)
    && nearlyEqual(fa.journal, fb.journal);     // 학위논문은 양쪽 모두 비어 있어 일치
}

// 내역에서 같은 논문을 찾는 색인. 저자가 겹치는 항목만 서지정보를 비교한다.
function createArticleIndex(entries = []) {
  const byUrlKey = new Map();
  const byAuthor = new Map();

  const add = entry => {
    const { urlKey, authors } = articleFeatures(entry);
    if (urlKey && !byUrlKey.has(urlKey)) byUrlKey.set(urlKey, entry);
    for (const author of authors) {
      if (!byAuthor.has(author)) byAuthor.set(author, []);
      byAuthor.get(author).push(entry);
    }
  };

  const findMatch = entry => {
    const { urlKey, authors } = articleFeatures(entry);
    const sameUrl = urlKey && byUrlKey.get(urlKey);
    if (sameUrl) return sameUrl;
    const candidates = new Set([...authors].flatMap(author => byAuthor.get(author) ?? []));
    for (const candidate of candidates) {
      if (isLikelySameArticle(entry, candidate)) return candidate;
    }
    return null;
  };

  entries.forEach(add);
  return { add, findMatch };
}

// 묶음 번호가 없는 내역(이전 버전에서 쌓인 것)에 번호를 붙인다. 오래된 것부터 차례로 판별.
// regroup이 true면 기존 번호를 버리고 처음부터 다시 묶는다 (업데이트로 판별 기준이 바뀌었을 수 있을 때).
function assignArticleIds(history, { regroup = false } = {}) {
  const index = createArticleIndex();
  for (const entry of [...history].sort((a, b) => (a.timestampId ?? 0) - (b.timestampId ?? 0))) {
    if (regroup) delete entry.articleId;
    entry.articleId ||= index.findMatch(entry)?.articleId ?? crypto.randomUUID();
    index.add(entry);
  }
}
