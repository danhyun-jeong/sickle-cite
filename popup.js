// =============================================================================
// Sickle-Cite 팝업 스크립트
//
// 구성
//   0. 상수·상태·공통 헬퍼
//   1. 저장소(chrome.storage) 접근
//   2. 인용 양식 설정 (탭3)
//   3. 인용 표기 조합
//   4. 탭1: 서지정보 필드, 복사·저장 버튼
//   5. 탭1: 프로젝트 태그
//   6. 탭2: 내역 표, 선택 항목 삭제·복사·내보내기
//   7. 시작 (팝업이 열릴 때 한 번 실행)
// =============================================================================


// ===== 0. 상수·상태·공통 헬퍼 =================================================

const METADATA_KEYS = [
  'authors', 'title_main', 'title_sub', 'journal_name', 'volume', 'issue',
  'publisher', 'year', 'page_first', 'page_last', 'keywords', 'abstract'
];
// 이 중 하나라도 비어 있으면 '불완전 추출' 경고
const REQUIRED_METADATA_KEYS = ['authors', 'title_main', 'publisher', 'year'];
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 15;
const MAX_TAG_SUGGESTIONS = 4;
const ABSTRACT_COLLAPSED_LINES = 4;

// 팝업 전체가 공유하는 상태. 화면은 항상 이 값을 기준으로 그린다.
const state = {
  metadata: {},              // 탭1에 표시 중인 서지정보 (사용자의 직접 수정이 즉시 반영됨)
  timestampId: null,         // 탭1에 표시 중인 내역 항목의 id
  tags: [],                  // 탭1에 표시 중인 프로젝트 태그
  settings: null,            // 인용 양식 설정 (2. 참고)
  selectedIds: new Set(),    // 탭2에서 체크된 항목의 timestampId (문자열)
  pendingCitations: ''       // '인용 표기 복사' 모달에서 복사할 텍스트
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const toArray = value => Array.isArray(value) ? value : (value ? [value] : []);
const isEmptyValue = value => value == null || value === '' || (Array.isArray(value) && value.length === 0);
const isMetadataEmpty = meta => !meta || Object.values(meta).every(isEmptyValue);
const joinList = (value, separator = ', ') => toArray(value).join(separator);

// '26.11.22. 22:00:00' → '26.11.22. 22:00' (초 단위 제거)
const withoutSeconds = timestamp => timestamp.slice(0, timestamp.lastIndexOf(':'));

// 파일명용 오늘 날짜 'YY.MM.DD'
function todayStamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(now.getFullYear() % 100)}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
}

// 같은 논문인지는 내역에 추가될 때 한 번만 판별해(아래 '1-1. 같은 논문 판별') 묶음 번호(articleId)로 기록해 둔다.
// 이후로는 이 번호만 비교하므로, 서지정보를 고쳐 저장해도 묶음이 갈라지지 않는다.
const isSameArticle = (a, b) => Boolean(a.articleId) && a.articleId === b.articleId;

// 사용자에게 잠깐 보이는 알림
//   type 'info'  : 화면 아래, 어두운 배경 (기본 1초)
//   type 'error' : 화면 가운데, 붉은 배경 (기본 1.5초)
function showToast(message, { type = 'info', duration } = {}) {
  const isError = type === 'error';
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    ...(isError
      ? { top: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(179, 73, 73, 0.8)' }
      : { bottom: '20px', transform: 'translateX(-50%)', background: 'rgba(37, 37, 37, 0.8)' }),
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '6px',
    zIndex: '1200',
    opacity: '0',
    transition: 'opacity 0.5s ease',
    whiteSpace: 'pre-line'
  });
  document.body.append(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration ?? (isError ? 1500 : 1000));
}
const showError = (message, options) => showToast(message, { ...options, type: 'error' });

async function copyToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
    return true;
  } catch (err) {
    console.error('복사 실패:', err);
    showError('복사에 실패했습니다');
    return false;
  }
}

// 텍스트 영역 높이를 내용에 맞춤
function fitTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function activateTab(tabId) {
  $$('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
  $$('.tab-content').forEach(content => content.classList.toggle('active', content.id === tabId));
}


// ===== 1. 저장소(chrome.storage) 접근 =========================================

async function getHistory() {
  const { history } = await chrome.storage.local.get({ history: [] });
  return history;
}

// 내역을 고치는 모든 작업은 이 함수를 거친다.
// 읽기 → 수정 → 쓰기가 한 번에 하나씩 순서대로 실행되므로,
// 여러 저장이 겹쳐도 한쪽 변경이 다른 쪽에 덮어써지지 않는다.
let historyQueue = Promise.resolve();
function updateHistory(mutate) {
  const task = historyQueue.then(async () => {
    const history = await getHistory();
    const next = mutate(history) ?? history;
    await chrome.storage.local.set({ history: next });
    return next;
  });
  historyQueue = task.catch(err => console.error('내역 저장 실패:', err));
  return task;
}

// 새로 추출한 pageInfo를 내역에 추가 (완전히 같은 항목이 이미 있으면 건너뜀)
function addToHistory(entry) {
  const sameEntry = item => item.academicDB === entry.academicDB
    && item.url === entry.url
    && item.timestamp === entry.timestamp
    && JSON.stringify(item.metadata) === JSON.stringify(entry.metadata);
  return updateHistory(history => history.some(sameEntry) ? history : [...history, entry]);
}


/* ==========================================================================
   1-1. 같은 논문 판별
   ① 추출한 URL이 가리키는 논문 고유번호가 같으면 무조건 같은 논문
   ② 아니면 서지정보를 느슨하게(퍼지) 비교: 제목이 충분히 비슷하고, 저자가 겹치고,
      연도가 거의 같고, 논문 종류(학술지/학위)가 같고, 제목 속 숫자가 같아야 함
   ========================================================================== */

// URL에서 DB별 논문 고유번호를 뽑아 비교용 키로 만든다.
// 기관 프록시 주소나 검색어 등 덧붙은 파라미터가 달라도 같은 키가 나오도록 함.
const URL_ID_RULES = [
  { pattern: /riss/, key: url => url.searchParams.get('control_no'), prefix: 'riss' },
  { pattern: /dbpia/, key: url => url.searchParams.get('nodeId'), prefix: 'dbpia' },
  // KCI 상세 페이지와 KOAJ(KCI 랜딩) 페이지는 같은 논문 번호(ART...)를 쓴다
  { pattern: /kci\.go\.kr/, key: url => url.searchParams.get('sereArticleSearchBean.artiId') ?? url.searchParams.get('arti_id'), prefix: 'kci' },
  { pattern: /kiss/, key: url => url.searchParams.get('key'), prefix: 'kiss' },
  { pattern: /earticle/, key: url => url.pathname.match(/\/Article\/(\w+)/)?.[1], prefix: 'earticle' },
  { pattern: /scholar/, key: url => url.pathname.match(/\/article\/detail\/(\w+)/)?.[1], prefix: 'scholar' },
];

function articleKeyFromUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    const rule = URL_ID_RULES.find(({ pattern }) => pattern.test(url.hostname));
    const id = rule?.key(url);
    if (id) return `${rule.prefix}:${id.toUpperCase()}`;
    url.hash = '';
    return url.href;
  } catch {
    return rawUrl;
  }
}

// 비교용 정규화: 대소문자, 공백, 문장부호·기호(따옴표, 괄호, 쌍점 등) 차이를 무시
const normalizeForMatch = text => String(text ?? '').normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

// 두 글자씩 끊은 조각(bigram)이 얼마나 겹치는지(Dice 계수, 0~1)
function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = text => {
    const counts = new Map();
    for (let i = 0; i < text.length - 1; i++) {
      const pair = text.slice(i, i + 2);
      counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
    return counts;
  };
  const countsA = bigrams(a);
  let overlap = 0;
  for (const [pair, count] of bigrams(b)) overlap += Math.min(count, countsA.get(pair) ?? 0);
  return (2 * overlap) / (a.length + b.length - 2);
}

const TITLE_SIMILARITY_THRESHOLD = 0.85;

// 항목별 비교용 정보 (같은 객체를 여러 번 비교하므로 캐시)
const featureCache = new WeakMap();
function articleFeatures(entry) {
  if (featureCache.has(entry)) return featureCache.get(entry);
  const meta = entry.metadata ?? {};
  const main = normalizeForMatch(meta.title_main);
  const sub = normalizeForMatch(meta.title_sub);
  const year = parseInt(meta.year, 10);
  const features = {
    urlKey: articleKeyFromUrl(entry.url),
    authors: new Set(toArray(meta.authors).map(normalizeForMatch).filter(Boolean)),
    year: Number.isNaN(year) ? null : year,
    kind: String(meta.publisher ?? '').includes('학위논문') ? 'thesis' : meta.journal_name ? 'article' : null,
    main,
    full: main + sub,
    hasSub: Boolean(sub),
    digits: main.match(/\d+/g)?.join(',') ?? '',
  };
  featureCache.set(entry, features);
  return features;
}

// 서지정보만으로 같은 논문이라고 볼 만한지
function isLikelySameArticle(a, b) {
  const fa = articleFeatures(a);
  const fb = articleFeatures(b);
  if (!fa.main || !fb.main) return false;
  if (fa.kind && fb.kind && fa.kind !== fb.kind) return false;
  if (fa.year !== null && fb.year !== null && Math.abs(fa.year - fb.year) > 1) return false;
  if (fa.authors.size && fb.authors.size && fa.authors.isDisjointFrom(fb.authors)) return false;
  // '(1)', '(2)' 처럼 숫자만 다른 연속 논문은 제목이 비슷해도 다른 논문
  if (fa.digits !== fb.digits) return false;
  if (similarity(fa.full, fb.full) >= TITLE_SIMILARITY_THRESHOLD) return true;
  // 한쪽 DB에만 부제목이 있는 경우에 한해 본제목끼리 비교 (본제목이 너무 짧으면 제외)
  return fa.hasSub !== fb.hasSub
    && Math.min(fa.main.length, fb.main.length) >= 6
    && similarity(fa.main, fb.main) >= TITLE_SIMILARITY_THRESHOLD;
}

// 내역에서 같은 논문을 찾는 색인. 저자가 겹치는 항목(과 저자 정보가 없는 항목)만 퍼지 비교한다.
function createArticleIndex(entries = []) {
  const byUrlKey = new Map();
  const byAuthor = new Map();
  const withoutAuthors = [];
  const all = [];

  const add = entry => {
    all.push(entry);
    const { urlKey, authors } = articleFeatures(entry);
    if (urlKey && !byUrlKey.has(urlKey)) byUrlKey.set(urlKey, entry);
    if (!authors.size) withoutAuthors.push(entry);
    for (const author of authors) {
      if (!byAuthor.has(author)) byAuthor.set(author, []);
      byAuthor.get(author).push(entry);
    }
  };

  const findMatch = entry => {
    const { urlKey, authors } = articleFeatures(entry);
    const sameUrl = urlKey && byUrlKey.get(urlKey);
    if (sameUrl) return sameUrl;
    const candidates = authors.size
      ? new Set([...[...authors].flatMap(author => byAuthor.get(author) ?? []), ...withoutAuthors])
      : all; // 저자 정보가 없으면 전체와 비교
    for (const candidate of candidates) {
      if (isLikelySameArticle(entry, candidate)) return candidate;
    }
    return null;
  };

  entries.forEach(add);
  return { add, findMatch };
}

// 묶음 번호가 없는 내역(이전 버전에서 쌓인 것)에 번호를 붙인다. 오래된 것부터 차례로 판별.
function assignArticleIds(history) {
  const index = createArticleIndex();
  for (const entry of [...history].sort((a, b) => (a.timestampId ?? 0) - (b.timestampId ?? 0))) {
    entry.articleId ||= index.findMatch(entry)?.articleId ?? crypto.randomUUID();
    index.add(entry);
  }
}


// ===== 2. 인용 양식 설정 (탭3) ================================================

// 설정은 '사용자가 고른 선택지' 그대로 저장하고, 인용 표기에 쓸 기호는
// 그때그때 resolveStyle()로 계산한다. 권호 표기 방식을 바꿔도
// 방식별로 입력해 둔 단위·접두사가 각각 보존된다.
const SETTINGS_KEY = 'citationSettings';
const DEFAULT_SETTINGS = {
  titleSeparator: 'dash-space',        // 'dash-space' | 'dash-nospace' | 'colon'
  volumeIssueStyle: 'none',            // 'none' | 'suffix' | 'prefix'
  suffix: { volume: '권', issue: '호', either: '호', addJe: true },
  prefix: { volume: 'Vol.', issue: 'No.', either: 'No.' },
  angleTitleBrackets: false,           // 「 」 대신 〈 〉
  angleJournalBrackets: false,         // 『 』 대신 《 》
  pageRange: { include: false, separator: '–', unit: '쪽' }
};
const TITLE_SEPARATORS = { 'dash-space': ' — ', 'dash-nospace': '—', 'colon': ': ' };

// 저장된 설정에 빠진 항목이 있으면 기본값으로 채움
function withDefaults(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    suffix: { ...DEFAULT_SETTINGS.suffix, ...saved.suffix },
    prefix: { ...DEFAULT_SETTINGS.prefix, ...saved.prefix },
    pageRange: { ...DEFAULT_SETTINGS.pageRange, ...saved.pageRange }
  };
}

// 1.7.4 이하 버전은 조합된 기호 문자열을 키별로 따로 저장했음 → 새 형식으로 변환
function migrateLegacySettings(old) {
  const titleSeparator = Object.keys(TITLE_SEPARATORS).find(key => TITLE_SEPARATORS[key] === old.titleSeparator)
    ?? DEFAULT_SETTINGS.titleSeparator;
  let volumeIssueStyle = 'none';
  if (old.volumeIssueSeparator === ' ') {
    const hasSuffix = [old.volumeSuffix, old.issueSuffix, old.eitherSuffix].some(Boolean);
    volumeIssueStyle = hasSuffix || old.volumePrefix === '제' ? 'suffix' : 'prefix';
  }
  return withDefaults({
    titleSeparator,
    volumeIssueStyle,
    ...(volumeIssueStyle === 'suffix' && {
      suffix: { volume: old.volumeSuffix ?? '', issue: old.issueSuffix ?? '', either: old.eitherSuffix ?? '', addJe: old.volumePrefix === '제' }
    }),
    ...(volumeIssueStyle === 'prefix' && {
      prefix: { volume: old.volumePrefix ?? '', issue: old.issuePrefix ?? '', either: old.eitherPrefix ?? '' }
    }),
    angleTitleBrackets: old.titleBracketLeft === '〈',
    angleJournalBrackets: old.journalBracketLeft === '《',
    pageRange: {
      include: Boolean(old.pageRangeInclude),
      separator: old.pageRangeSeparator ?? DEFAULT_SETTINGS.pageRange.separator,
      unit: old.pageRangeUnit ?? DEFAULT_SETTINGS.pageRange.unit
    }
  });
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(null);
  if (stored[SETTINGS_KEY]) return withDefaults(stored[SETTINGS_KEY]);
  if ('titleSeparator' in stored) {
    const migrated = migrateLegacySettings(stored);
    await chrome.storage.sync.set({ [SETTINGS_KEY]: migrated });
    console.log('이전 버전의 인용 양식 설정을 새 형식으로 옮겼습니다:', migrated);
    return migrated;
  }
  return withDefaults();
}

function saveSettings() {
  return chrome.storage.sync.set({ [SETTINGS_KEY]: state.settings });
}

// 설정(선택지) → 인용 표기에 실제로 들어갈 기호들
function resolveStyle(settings = state.settings) {
  const style = {
    titleSeparator: TITLE_SEPARATORS[settings.titleSeparator] ?? TITLE_SEPARATORS['dash-space'],
    volumePrefix: '', volumeSuffix: '', volumeIssueSeparator: '',
    issuePrefix: '', issueSuffix: '', eitherPrefix: '', eitherSuffix: '',
    titleBracketLeft: settings.angleTitleBrackets ? '〈' : '「',
    titleBracketRight: settings.angleTitleBrackets ? '〉' : '」',
    journalBracketLeft: settings.angleJournalBrackets ? '《' : '『',
    journalBracketRight: settings.angleJournalBrackets ? '》' : '』',
    pageRangeInclude: settings.pageRange.include,
    pageRangeSeparator: settings.pageRange.separator || DEFAULT_SETTINGS.pageRange.separator,
    pageRangeUnit: settings.pageRange.unit || DEFAULT_SETTINGS.pageRange.unit
  };
  switch (settings.volumeIssueStyle) {
    case 'suffix': {
      // 예: 제57권 제2호
      const je = settings.suffix.addJe ? '제' : '';
      Object.assign(style, {
        volumePrefix: je, issuePrefix: je, eitherPrefix: je,
        volumeSuffix: settings.suffix.volume, issueSuffix: settings.suffix.issue, eitherSuffix: settings.suffix.either,
        volumeIssueSeparator: ' '
      });
      break;
    }
    case 'prefix':
      // 예: Vol.57 No.2
      Object.assign(style, {
        volumePrefix: settings.prefix.volume, issuePrefix: settings.prefix.issue, eitherPrefix: settings.prefix.either,
        volumeIssueSeparator: ' '
      });
      break;
    default:
      // 예: 57(2) — 호수만 괄호에 넣음
      Object.assign(style, { issuePrefix: '(', issueSuffix: ')' });
  }
  return style;
}

// --- 설정 화면 ---

const volIssSelect = $('#vol-iss-style');
const volIssContainer = $('#vol-iss-options');

// 권호 표기 방식별 추가 입력칸 (현재 설정값으로 채움)
function renderVolIssOptions() {
  const mode = state.settings.volumeIssueStyle;
  const field = (name, label) =>
    `<div class="field"><label>${label}</label><input type="text" name="${name}"></div>`;
  let html = '';
  if (mode === 'none') {
    html = '<p style="color: var(--text-secondary); font-size:13px; margin-top:12px; margin-left: 3px">💡 권/호의 구분이 따로 없을 경우(즉 권/호 둘 중 하나만 있는 경우), 괄호 없이 숫자만 표기됩니다.</p>';
  } else if (mode === 'suffix') {
    html = `
      ${field('volume-suffix', '권수 단위:')}
      ${field('issue-suffix', '호수 단위:')}
      ${field('either-suffix', '구분 없을 시 단위:')}
      <div class="field">
        <label class="checkbox-label">
          <span class="toggle-text">권호수 앞에 접두사 '제' 붙이기</span>
          <span class="toggle-switch">
            <input type="checkbox" name="prefix-제">
            <span class="slider"></span>
          </span>
        </label>
      </div>`;
  } else if (mode === 'prefix') {
    html = `
      ${field('volume-prefix', '권수 접두사:')}
      ${field('issue-prefix', '호수 접두사:')}
      ${field('either-prefix', '구분 없을 시 접두사:')}`;
  }
  volIssContainer.innerHTML = html;
  volIssContainer.dataset.mode = mode;
  // 값은 innerHTML이 아닌 .value로 넣어야 따옴표 등 특수문자가 깨지지 않음
  const set = (name, value) => { const el = $(`[name="${name}"]`, volIssContainer); if (el) el.value = value; };
  if (mode === 'suffix') {
    set('volume-suffix', state.settings.suffix.volume);
    set('issue-suffix', state.settings.suffix.issue);
    set('either-suffix', state.settings.suffix.either);
    $('[name="prefix-제"]', volIssContainer).checked = state.settings.suffix.addJe;
  } else if (mode === 'prefix') {
    set('volume-prefix', state.settings.prefix.volume);
    set('issue-prefix', state.settings.prefix.issue);
    set('either-prefix', state.settings.prefix.either);
  }
}

// 설정값 → 탭3 화면
function renderSettingsForm() {
  const s = state.settings;
  $(`input[name="title-sep-option"][value="${s.titleSeparator}"]`).checked = true;
  volIssSelect.value = s.volumeIssueStyle;
  renderVolIssOptions();
  $('input[name="title-brackets"]').checked = s.angleTitleBrackets;
  $('input[name="journal-brackets"]').checked = s.angleJournalBrackets;
  $('input[name="page-range-include"]').checked = s.pageRange.include;
  $('input[name="page-range-separator"]').value = s.pageRange.separator;
  $('input[name="page-range-unit"]').value = s.pageRange.unit;
}

// 탭3 화면 → 설정값
function readSettingsForm() {
  const value = name => $(`[name="${name}"]`, volIssContainer)?.value ?? '';
  const next = structuredClone(state.settings);
  next.titleSeparator = $('input[name="title-sep-option"]:checked')?.value ?? DEFAULT_SETTINGS.titleSeparator;
  // 지금 화면에 그려져 있는 방식의 입력칸만 읽음 (다른 방식의 값은 그대로 보존)
  const renderedMode = volIssContainer.dataset.mode;
  if (renderedMode === 'suffix') {
    next.suffix = {
      volume: value('volume-suffix'), issue: value('issue-suffix'), either: value('either-suffix'),
      addJe: $('[name="prefix-제"]', volIssContainer)?.checked ?? true
    };
  } else if (renderedMode === 'prefix') {
    next.prefix = { volume: value('volume-prefix'), issue: value('issue-prefix'), either: value('either-prefix') };
  }
  next.volumeIssueStyle = volIssSelect.value;
  next.angleTitleBrackets = $('input[name="title-brackets"]').checked;
  next.angleJournalBrackets = $('input[name="journal-brackets"]').checked;
  next.pageRange = {
    include: $('input[name="page-range-include"]').checked,
    // 비워 두면 기본값 사용 (이전 버전과 동일)
    separator: $('input[name="page-range-separator"]').value || DEFAULT_SETTINGS.pageRange.separator,
    unit: $('input[name="page-range-unit"]').value || DEFAULT_SETTINGS.pageRange.unit
  };
  return next;
}

// 설정을 바꾸면 즉시 저장하고 인용 표기·내역 표에 반영
function bindSettingsForm() {
  $('#tab3').addEventListener('change', event => {
    if (!event.target.matches('input, select, textarea')) return;
    const modeChanged = event.target === volIssSelect;
    state.settings = readSettingsForm();
    if (modeChanged) renderVolIssOptions();
    saveSettings();
    renderCitation();
    renderHistory(); // 내역 표의 제목에도 제목 구분자가 들어가므로 갱신
  });
}


// ===== 3. 인용 표기 조합 ======================================================

// 예: 홍길동, 「본제목 — 부제목」, 『학술지명』 57(2), 발간기관, 2002, 68–89쪽.
function formatCitation(meta, style = resolveStyle()) {
  const authors = joinList(meta.authors, '·');
  const separator = meta.title_sub ? style.titleSeparator : '';
  const title = `${style.titleBracketLeft}${meta.title_main ?? ''}${separator}${meta.title_sub ?? ''}${style.titleBracketRight}`;
  const journal = `${style.journalBracketLeft}${meta.journal_name ?? ''}${style.journalBracketRight}`;

  // 학술지명 + 권호 (학술지명도 권호도 없으면 이 부분 전체 생략: 학위논문 등)
  let journalPart = null;
  if (meta.volume && meta.issue) {
    journalPart = `${journal} ${style.volumePrefix}${meta.volume}${style.volumeSuffix}`
      + `${style.volumeIssueSeparator}${style.issuePrefix}${meta.issue}${style.issueSuffix}`;
  } else if (meta.volume || meta.issue) {
    journalPart = `${journal} ${style.eitherPrefix}${meta.volume || meta.issue}${style.eitherSuffix}`;
  } else if (meta.journal_name) {
    journalPart = journal;
  }

  // 쪽수 범위는 설정이 켜져 있고 첫/끝 페이지가 모두 있을 때만
  const pageRange = style.pageRangeInclude && meta.page_first && meta.page_last
    ? `, ${meta.page_first}${style.pageRangeSeparator}${meta.page_last}${style.pageRangeUnit}`
    : '';

  const parts = [authors, title, journalPart, meta.publisher ?? '', meta.year ?? ''].filter(part => part !== null);
  return `${parts.join(', ')}${pageRange}.`;
}

// 본제목 + 구분자 + 부제목 (내역 표 툴팁, RIS 등)
function formatFullTitle(meta, style = resolveStyle()) {
  const main = meta.title_main || '';
  return meta.title_sub ? `${main}${style.titleSeparator}${meta.title_sub}` : main;
}

function renderCitation() {
  $('.citation-input').value = isMetadataEmpty(state.metadata) ? '' : formatCitation(state.metadata);
}


// ===== 4. 탭1: 서지정보 필드, 복사·저장 버튼 =================================

const metadataField = key => $(`#tab1 .left-pane [name="${key}"]`);
const abstractField = metadataField('abstract');

// 내역 항목(또는 새로 추출한 pageInfo)을 탭1에 표시
function showEntry(entry) {
  state.timestampId = entry.timestampId;
  state.metadata = Object.fromEntries(METADATA_KEYS.map(key => [key, structuredClone(entry.metadata?.[key] ?? '')]));
  state.tags = [...(entry.projectTags ?? [])];
  renderMetadataFields();
  renderCitation();
  tagInput.render();
  if (REQUIRED_METADATA_KEYS.some(key => isEmptyValue(state.metadata[key]))) {
    showError('논문의 서지정보가 불완전하게 추출되었습니다');
  }
}

function renderMetadataFields() {
  for (const key of METADATA_KEYS) {
    const el = metadataField(key);
    if (!el) continue;
    el.value = joinList(state.metadata[key]);
    if (el.tagName === 'TEXTAREA' && el !== abstractField) fitTextarea(el);
  }
  collapseAbstract();
}

// 초록은 처음에 몇 줄만 보여주고, 클릭(포커스)하면 전체를 펼친다.
// 내용(value)은 항상 전체 초록이므로, 접힌 상태에서 수정해도 초록이 잘려 저장되지 않는다.
function collapseAbstract() {
  abstractField.style.overflowY = 'hidden';
  abstractField.style.height = 'auto';
  const fullHeight = abstractField.scrollHeight;
  const { lineHeight, paddingTop, paddingBottom } = getComputedStyle(abstractField);
  const linePx = Number.parseFloat(lineHeight) || 18;
  const collapsedHeight = linePx * ABSTRACT_COLLAPSED_LINES + Number.parseFloat(paddingTop) + Number.parseFloat(paddingBottom);
  const isLong = fullHeight > collapsedHeight + 1;
  abstractField.style.height = `${isLong ? collapsedHeight : fullHeight}px`;
  abstractField.classList.toggle('is-collapsed', isLong);
  abstractField.title = isLong ? '클릭하면 초록 전체를 볼 수 있습니다' : '';
}
function expandAbstract() {
  if (!abstractField.classList.contains('is-collapsed')) return;
  abstractField.classList.remove('is-collapsed');
  abstractField.title = '';
  fitTextarea(abstractField);
}

// 필드를 직접 수정하면 state.metadata에 반영하고 인용 표기를 다시 조합 (리스너는 한 번만 등록)
function bindMetadataFields() {
  $('#tab1 .left-pane .metadata-container').addEventListener('input', event => {
    const el = event.target;
    const key = el.name;
    if (!METADATA_KEYS.includes(key)) return;
    // 저자와 키워드는 콤마로 구분하여 배열로 저장
    state.metadata[key] = key === 'authors' || key === 'keywords'
      ? el.value.split(',').map(item => item.trim()).filter(Boolean)
      : el.value;
    if (el.tagName === 'TEXTAREA') fitTextarea(el);
    renderCitation();
  });
  abstractField.addEventListener('focus', expandAbstract);
}

// 서지정보를 '항목: 값' 줄글로
function formatMetadataText(meta) {
  return [
    `저자: ${joinList(meta.authors)}`,
    `본제목: ${meta.title_main}`,
    `부제목: ${meta.title_sub}`,
    `학술지명: ${meta.journal_name}`,
    `권수: ${meta.volume}`,
    `호수: ${meta.issue}`,
    `발간기관(학회): ${meta.publisher}`,
    `연도: ${meta.year}`,
    `첫 페이지: ${meta.page_first}`,
    `끝 페이지: ${meta.page_last}`,
    `키워드: ${joinList(meta.keywords)}`,
    `국문 초록: ${meta.abstract}`
  ].join('\n');
}

// Obsidian 노트용 YAML frontmatter (단축키 Ctrl/Cmd+Shift+Y)
function formatYaml(meta, tags) {
  const yamlList = (key, value) => {
    const items = toArray(value);
    if (items.length > 1) return [`${key}:`, ...items.map(item => `  - ${item}`)].join('\n');
    return `${key}: ${items[0] ?? ''}`;
  };
  let volumeIssue = '';
  if (meta.volume && meta.issue) volumeIssue = `${meta.volume}(${meta.issue})`;
  else if (meta.volume || meta.issue) volumeIssue = `"${meta.volume || meta.issue}"`;
  return [
    '---',
    yamlList('author', meta.authors),
    `title: ${meta.title_main}`,
    `subtitle: ${meta.title_sub}`,
    `journal: ${meta.journal_name}`,
    `volume-issue: ${volumeIssue}`,
    `publishing_society: ${meta.publisher}`,
    `year: "${meta.year}"`,
    `citation: ${formatCitation(meta)}`,
    yamlList('keywords', meta.keywords),
    'PDF: ',
    'tags: ',
    yamlList('project', tags),
    'check: false',
    '---',
    '> [!abstract] 초록',
    `> ${meta.abstract}`
  ].join('\n') + '\n\n';
}

function bindTab1Buttons() {
  const ensureMetadata = () => {
    if (!isMetadataEmpty(state.metadata)) return true;
    showError('복사할 서지정보가 없습니다');
    return false;
  };

  // [클립보드에 복사] 조합된 인용 표기 (사용자가 인용 표기 칸을 직접 고쳤다면 그 내용 그대로)
  $('#copy-citation-btn').addEventListener('click', () => {
    if (!ensureMetadata()) return;
    copyToClipboard($('.citation-input').value, '조합된 인용 표기가 클립보드에 복사되었습니다');
  });

  // [텍스트로 복사] 서지정보 전체
  $('#copy-metadata-btn').addEventListener('click', () => {
    if (!ensureMetadata()) return;
    copyToClipboard(formatMetadataText(state.metadata), '서지정보가 클립보드에 복사되었습니다');
  });

  // YAML 복사 단축키
  // e.key는 Shift를 누르면 'Y'(대문자), 한글 입력 상태에선 'ㅛ'가 되므로 물리 키 위치(e.code)로 판별
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyY') {
      event.preventDefault();
      if (!ensureMetadata()) return;
      copyToClipboard(formatYaml(state.metadata, state.tags), '서지정보(YAML)가 클립보드에 복사되었습니다');
    }
  });

  // [수정사항을 내역에 저장] 현재 표시 중인 논문의 서지정보를 덮어씀
  // 팝업을 열 때마다 같은 논문의 추출 내역이 한 건씩 쌓이므로, 태그와 마찬가지로
  // 같은 논문인 모든 내역 항목에 함께 반영한다. 묶음은 '수정 전' 서지정보 기준으로 찾아야
  // 저자·제목·연도 등을 고쳐도 고치지 않은 사본이 별도 행으로 남지 않는다.
  $('#save-metadata-btn').addEventListener('click', async () => {
    let found = false;
    await updateHistory(history => {
      const target = history.find(entry => entry.timestampId === state.timestampId);
      if (!target) return;
      history.filter(item => isSameArticle(item, target))
        .forEach(item => { item.metadata = structuredClone(state.metadata); });
      found = true;
    });
    if (!found) {
      showError('저장된 내역을 찾을 수 없어 수정사항이 저장되지 못했습니다');
      return;
    }
    showToast('서지정보의 직접 수정이 내역에 저장되었습니다');
    renderHistory();
  });
}


// ===== 5. 탭1: 프로젝트 태그 ==================================================

// 태그 입력창. 화면 그리기(render)와 저장(save)을 분리해,
// 내역을 불러와 태그를 표시할 때는 저장이 일어나지 않고 사용자가 태그를 바꿀 때만 저장한다.
const tagInput = (() => {
  const input = $('#tags-input');
  const list = $('#tag-list');
  const suggestions = $('#autocomplete-list');
  const container = input.closest('.tag-input-container');
  let candidates = [];             // 자동완성 후보: 내역 전체의 태그
  let suggestionClicked = false;   // 자동완성 항목 클릭 시 blur로 인한 중복 추가 방지

  const clearInput = () => { input.value = ''; };
  const hideSuggestions = () => suggestions.classList.add('hidden');

  function render() {
    list.replaceChildren(...state.tags.map((tag, index) => {
      const li = document.createElement('li');
      li.textContent = tag;
      const remove = document.createElement('span');
      remove.textContent = '×';
      remove.className = 'remove-tag';
      remove.addEventListener('click', event => {
        event.stopPropagation();
        setTags(state.tags.filter((_, i) => i !== index));
      });
      li.append(remove);
      return li;
    }));
    input.placeholder = state.tags.length === 0 ? '입력 후 Enter로 추가' : '';
    container.classList.toggle('filled', state.tags.length > 0);
  }

  // 사용자의 변경: 화면 갱신 + 같은 논문의 모든 내역 항목에 저장
  async function setTags(tags) {
    state.tags = [...new Set(tags)];
    render();
    if (!state.timestampId) return;
    await updateHistory(history => {
      const target = history.find(item => item.timestampId === state.timestampId);
      if (!target) return;
      history.filter(item => isSameArticle(item, target)).forEach(item => { item.projectTags = [...state.tags]; });
    });
    renderHistory();
    refreshCandidates();
  }

  // 입력값을 검사해 태그로 추가
  function addTag(rawValue) {
    const tag = rawValue.trim().replace(/,$/, '').trim();
    if (!tag) { clearInput(); return; }
    if (tag.length > MAX_TAG_LENGTH) {
      showError(`태그는 ${MAX_TAG_LENGTH}자 이하여야 합니다`);
      return; // 입력값을 남겨 둬서 고칠 수 있게 함
    }
    clearInput();
    if (state.tags.includes(tag)) return;
    if (state.tags.length >= MAX_TAGS) {
      showError(`태그는 최대 ${MAX_TAGS}개까지만 달 수 있습니다`);
      return;
    }
    setTags([...state.tags, tag]);
  }

  async function refreshCandidates() {
    candidates = [...new Set((await getHistory()).flatMap(item => item.projectTags ?? []))];
  }

  function renderSuggestions() {
    const value = input.value.trim();
    const matches = value
      ? candidates.filter(tag => !state.tags.includes(tag) && Hangul.search(tag, value) !== -1).slice(0, MAX_TAG_SUGGESTIONS)
      : [];
    suggestions.replaceChildren(...matches.map(tag => {
      const li = document.createElement('li');
      li.textContent = tag;
      li.tabIndex = 0;
      li.addEventListener('mousedown', () => { suggestionClicked = true; });
      li.addEventListener('click', () => { addTag(tag); hideSuggestions(); });
      return li;
    }));
    suggestions.classList.toggle('hidden', matches.length === 0);
  }

  function moveActiveSuggestion(step) {
    const items = [...suggestions.children];
    const current = items.findIndex(li => li.classList.contains('active'));
    const next = current === -1
      ? (step > 0 ? 0 : items.length - 1)
      : (current + step + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('active', i === next));
  }

  input.addEventListener('keydown', event => {
    // 한글 조합 중 Enter 등은 무시 (keyCode 229: 일부 환경에서 isComposing이 false로 오는 경우 대비)
    if (event.isComposing || event.keyCode === 229) return;
    const items = suggestions.classList.contains('hidden') ? [] : [...suggestions.children];
    const active = items.find(li => li.classList.contains('active'));

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!items.length) return;
        event.preventDefault();
        moveActiveSuggestion(event.key === 'ArrowDown' ? 1 : -1);
        return;
      case 'Tab':
        // Tab: 자동완성 첫 항목 선택
        if (!items.length) return;
        event.preventDefault();
        addTag(items[0].textContent);
        hideSuggestions();
        return;
      case 'Enter':
      case ',':
        if (active && event.key === 'Enter') {
          event.preventDefault();
          addTag(active.textContent);
          hideSuggestions();
          return;
        }
        if (!input.value.trim()) return;
        event.preventDefault();
        addTag(input.value);
        hideSuggestions();
        return;
      case 'Backspace':
        // 입력창이 비어 있을 때 Backspace: 마지막 태그 삭제
        if (input.value !== '') return;
        if (state.tags.length) setTags(state.tags.slice(0, -1));
        hideSuggestions();
        return;
    }
  });

  input.addEventListener('input', renderSuggestions);

  // 입력창 바깥 여백을 클릭해도 입력창에 포커스
  container.addEventListener('click', event => {
    if (event.target === container) input.focus();
  });

  // 입력창에서 벗어나면(바깥 클릭 등) 입력 중이던 값을 태그로 추가
  input.addEventListener('blur', () => {
    setTimeout(() => { // 자동완성 클릭 이벤트가 먼저 처리되도록 약간 늦춤
      hideSuggestions();
      if (suggestionClicked) { suggestionClicked = false; return; }
      if (input.value.trim()) addTag(input.value);
    }, 100);
  });

  return { render, refreshCandidates, focus: () => input.focus() };
})();


// ===== 6. 탭2: 내역 표, 선택 항목 삭제·복사·내보내기 ===========================

const historyContainer = $('#history-list');
const dedupToggle = $('#deduplicate');
const hideColumnsToggle = $('#hide-5-6-columns');
let historyById = new Map(); // 현재 표에 그려진 항목 (id 문자열 → 항목)

// 같은 논문 중 가장 이른 것만 남김
function keepEarliestPerArticle(history) {
  const earliest = new Map();
  for (const item of history) {
    const key = item.articleId ?? item; // 혹시 번호가 없으면 단독으로 취급
    const kept = earliest.get(key);
    if (!kept || item.timestamp.localeCompare(kept.timestamp) < 0) earliest.set(key, item);
  }
  return [...earliest.values()];
}

// 모든 필드(metadata, DB, URL, 추출 일시, 태그)가 완전히 같은 항목만 하나로
function removeExactDuplicates(history) {
  const groups = new Map();
  for (const item of history) {
    const key = JSON.stringify(item);
    if (!groups.has(key)) groups.set(key, item);
  }
  return [...groups.values()];
}

// 검색어(공백으로 나눈 모든 단어)가 서지정보 또는 태그에 들어 있는 항목만
function matchesSearch(item, terms) {
  const haystack = [...Object.values(item.metadata).flatMap(toArray), ...(item.projectTags ?? [])].join(' ');
  return terms.every(term => Hangul.search(haystack, term) !== -1);
}

const checkedIds = () => $$('#history-list tbody input[type="checkbox"]:checked').map(cb => cb.dataset.timestampId);

async function renderHistory() {
  const allHistory = await getHistory();
  const terms = $('#search-history').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = terms.length ? allHistory.filter(item => matchesSearch(item, terms)) : allHistory;
  const hideColumns = hideColumnsToggle.checked;
  $('#tab2').classList.toggle('hide-columns', hideColumns);

  const history = (dedupToggle.checked ? keepEarliestPerArticle(filtered) : removeExactDuplicates(filtered))
    .sort((a, b) => b.timestampId - a.timestampId); // 최신순
  historyById = new Map(history.map(item => [String(item.timestampId), item]));

  const style = resolveStyle();
  const columns = hideColumns ? ['author', 'title', 'tag'] : ['author', 'title', 'tag', 'db', 'time'];
  const headers = { author: '저자', title: '논문 제목', tag: '태그', db: '학술 DB', time: '추출 일시' };

  const table = document.createElement('table');
  Object.assign(table.style, { border: 'none', width: '100%' });
  table.innerHTML = `
    <thead><tr>
      <th style="border:none; padding:6px; width:30px"><input type="checkbox" id="select-all" style="margin:0"></th>
      ${columns.map(col => `<th style="border:none; text-align:left; padding:6px">${headers[col]}</th>`).join('')}
    </tr></thead>
    <tbody></tbody>`;
  const tbody = $('tbody', table);

  for (const item of history) {
    const id = String(item.timestampId);
    const tr = document.createElement('tr');
    tr.style.border = 'none';
    tr.dataset.timestampId = id;

    const checkCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.margin = '0';
    checkbox.dataset.timestampId = id;
    checkbox.checked = state.selectedIds.has(id);
    checkCell.append(checkbox);
    tr.append(checkCell);

    for (const column of columns) tr.append(createHistoryCell(column, item, style, hideColumns));
    tbody.append(tr);
  }

  // 다시 그리는 동안 스크롤 위치 유지
  const { scrollTop } = historyContainer;
  historyContainer.replaceChildren(table);
  historyContainer.scrollTop = scrollTop;
  for (const td of $$('th, td', table)) { td.style.border = 'none'; td.style.padding = '6px'; }
  updateSelectionControls();
}

function createHistoryCell(column, item, style, hideColumns) {
  const td = document.createElement('td');
  const meta = item.metadata;
  switch (column) {
    // 저자: 공저자면 첫 번째 저자 + ' 외'
    case 'author': {
      const authors = toArray(meta.authors);
      td.textContent = authors.length >= 2 ? `${authors[0]} 외` : authors.join(', ');
      td.title = authors.join(', ');
      td.dataset.open = '';
      break;
    }
    // 논문 제목: 기본은 본제목만, 열 숨기기 시 부제목 포함 전체 (툴팁은 항상 전체)
    case 'title': {
      const fullTitle = formatFullTitle(meta, style);
      const div = document.createElement('div');
      div.className = 'clamp-title';
      div.textContent = hideColumns ? fullTitle : (meta.title_main || '');
      td.append(div);
      td.title = fullTitle;
      td.dataset.open = '';
      break;
    }
    // 태그: 첫 번째 태그(8자 초과 시 생략) + 나머지 개수 배지
    case 'tag': {
      const tags = toArray(item.projectTags);
      if (tags.length) {
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, { position: 'relative', display: 'inline-block' });
        const chip = document.createElement('span');
        chip.className = 'history-tag-chip';
        chip.textContent = tags[0].length > 8 ? `${tags[0].slice(0, 8)}…` : tags[0];
        wrapper.append(chip);
        if (tags.length > 1) {
          const badge = document.createElement('span');
          badge.className = 'tag-badge';
          badge.textContent = `+${tags.length - 1}`;
          wrapper.append(badge);
        }
        td.append(wrapper);
      }
      td.title = tags.length ? tags.join(', ') : '태그 없음';
      Object.assign(td.style, { color: tags.length ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '12px' });
      td.dataset.open = '';
      break;
    }
    // 학술 DB: 추출했던 원래 페이지로 이동하는 링크
    case 'db': {
      const a = document.createElement('a');
      a.href = item.url;
      a.textContent = item.academicDB;
      a.target = '_blank';
      a.title = '검색 결과 페이지 바로가기';
      td.append(a);
      break;
    }
    // 추출 일시: 분 단위까지만 표시
    case 'time':
      td.textContent = withoutSeconds(item.timestamp);
      break;
  }
  if ('open' in td.dataset) td.style.cursor = 'pointer';
  return td;
}

// 체크 상태에 따라 하단 버튼 활성화, 전체 선택 체크박스 상태(전체/일부/없음) 갱신
function updateSelectionControls() {
  const checkboxes = $$('#history-list tbody input[type="checkbox"]');
  const checkedCount = checkboxes.filter(cb => cb.checked).length;
  for (const id of ['delete-history-selected', 'copy-citations-selected', 'export-bibliography-selected']) {
    $(`#${id}`).disabled = checkedCount === 0;
  }
  const selectAll = $('#select-all');
  if (!selectAll || checkboxes.length === 0) return;
  selectAll.checked = checkedCount > 0 && checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

// 내역 표의 클릭·체크 처리 (표를 다시 그려도 리스너는 컨테이너에 한 번만 등록)
function bindHistoryTable() {
  historyContainer.addEventListener('change', event => {
    const checkbox = event.target;
    if (checkbox.type !== 'checkbox') return;
    const targets = checkbox.id === 'select-all'
      ? $$('#history-list tbody input[type="checkbox"]')
      : [checkbox];
    for (const cb of targets) {
      cb.checked = checkbox.checked;
      if (cb.checked) state.selectedIds.add(cb.dataset.timestampId);
      else state.selectedIds.delete(cb.dataset.timestampId);
    }
    updateSelectionControls();
  });

  // 저자·제목·태그 칸 클릭: 탭1로 전환하여 해당 논문 표시
  historyContainer.addEventListener('click', event => {
    const cell = event.target.closest('td[data-open]');
    if (!cell) return;
    const item = historyById.get(cell.closest('tr').dataset.timestampId);
    if (!item) return;
    activateTab('tab1');
    try {
      showEntry(item);
    } catch (err) {
      console.error('내역 불러오기 실패:', err);
      showError('서지정보 내역에서 해당 논문의 서지정보를 불러오지 못했습니다');
      return;
    }
    showToast(`${withoutSeconds(item.timestamp)}에 추출된 서지정보를 불러왔습니다`);
  });

  // '중복 시 첫 번째만 표시'가 꺼져 있으면 '열 숨기기'를 켤 수 없음 (서로 연동)
  dedupToggle.addEventListener('change', () => {
    if (!dedupToggle.checked) hideColumnsToggle.checked = false;
    renderHistory();
  });
  hideColumnsToggle.addEventListener('change', () => {
    if (hideColumnsToggle.checked) dedupToggle.checked = true;
    renderHistory();
  });

  // 검색창
  const searchInput = $('#search-history');
  const clearButton = $('#clear-search');
  searchInput.addEventListener('input', () => {
    clearButton.style.display = searchInput.value ? 'flex' : 'none';
    renderHistory();
  });
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    clearButton.style.display = 'none';
    renderHistory();
    searchInput.focus();
  });
}

// 선택된 id → 내역 항목들
async function getEntries(ids) {
  const idSet = new Set(ids);
  return (await getHistory()).filter(item => idSet.has(String(item.timestampId)));
}

// '중복 시 첫 번째만 표시'가 꺼져 있을 때, 선택 항목 중 같은 논문이 있는지
async function selectionHasDuplicates(ids) {
  if (dedupToggle.checked || ids.length <= 1) return false;
  const entries = await getEntries(ids);
  return entries.some((a, i) => entries.slice(i + 1).some(b => isSameArticle(a, b)));
}

// 첫 번째 저자 → 연도 순 (참고문헌 목록 정렬)
function compareByAuthorThenYear(a, b) {
  const authorA = toArray(a.metadata.authors)[0] ?? '';
  const authorB = toArray(b.metadata.authors)[0] ?? '';
  return authorA.localeCompare(authorB)
    || (Number.parseInt(a.metadata.year) || 0) - (Number.parseInt(b.metadata.year) || 0);
}

// --- 삭제 ---
async function deleteSelected() {
  const ids = new Set(checkedIds());
  await updateHistory(history => {
    // '중복 시 첫 번째만 표시'가 켜져 있으면, 화면에 묶여 보이던 같은 논문의 모든 항목을 함께 삭제
    if (dedupToggle.checked) {
      const selected = history.filter(item => ids.has(String(item.timestampId)));
      history.filter(item => selected.some(sel => isSameArticle(sel, item)))
        .forEach(item => ids.add(String(item.timestampId)));
    }
    return history.filter(item => !ids.has(String(item.timestampId)));
  });
  ids.forEach(id => state.selectedIds.delete(id));
  showToast('선택한 항목이 삭제되었습니다');
  renderHistory();
  tagInput.refreshCandidates();
}

// --- 인용 표기 복사 ---
async function openCopyCitationsModal(ids) {
  const style = resolveStyle();
  const entries = (await getEntries(ids)).sort(compareByAuthorThenYear);
  state.pendingCitations = entries.map(item => formatCitation(item.metadata, style)).join('\n');
  // 모달에는 현재 양식을 보여주는 고정 예시를 표시
  $('#citation-example').textContent = formatCitation({
    authors: ['저자'], title_main: '본제목', title_sub: '부제목', journal_name: '학술지명',
    volume: '50', issue: '3', publisher: '발간기관', year: '2002', page_first: '68', page_last: '89'
  }, style);
  $('#copy-citations-modal').classList.remove('hidden');
}

// --- 내보내기: 엑셀 ---
async function exportExcel(ids) {
  const style = resolveStyle();
  const entries = (await getEntries(ids)).sort((a, b) => b.timestampId - a.timestampId);
  const columns = [
    ['저자', 10, item => joinList(item.metadata.authors)],
    ['본제목', 35, item => item.metadata.title_main || ''],
    ['부제목', 35, item => item.metadata.title_sub || ''],
    ['학술지명', 15, item => item.metadata.journal_name || ''],
    ['권수', 5, item => item.metadata.volume || ''],
    ['호수', 5, item => item.metadata.issue || ''],
    ['발행기관', 15, item => item.metadata.publisher || ''],
    ['연도', 5, item => item.metadata.year || ''],
    ['첫 페이지', 7, item => item.metadata.page_first || ''],
    ['끝 페이지', 7, item => item.metadata.page_last || ''],
    ['키워드', 35, item => joinList(item.metadata.keywords)],
    ['프로젝트 태그', 15, item => joinList(item.projectTags)],
    ['국문 초록', 35, item => item.metadata.abstract || ''],
    ['조합된 인용 표기', 100, item => formatCitation(item.metadata, style)],
    ['검색한 학술 DB', 13, item => item.academicDB],
    ['URL', 7, item => item.url],
    ['검색(추출) 일시', 15, item => item.timestamp]
  ];
  const rows = entries.map(item => Object.fromEntries(columns.map(([header, , value]) => [header, value(item)])));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = columns.map(([, width]) => ({ wch: width })); // 열 너비 (문자 수 기준)
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Selected Items');
  XLSX.writeFile(book, `Sickle-Cite 서지정보(${todayStamp()}).xlsx`);
  $('#export-bibliography-modal').classList.add('hidden');
  showToast('선택한 항목에 대한 정보를 엑셀 파일로 저장했습니다');
}

// --- 내보내기: RIS (Endnote, Mendeley, Zotero 등에서 가져오기 가능) ---
function formatRis(item, style) {
  const meta = item.metadata;
  const lines = [];
  const add = (tag, value) => { if (value) lines.push(`${tag}  - ${value}`); };
  add('TY', String(meta.publisher ?? '').includes('학위논문') ? 'THES' : 'JOUR');
  toArray(meta.authors).forEach(author => add('AU', author.trim()));
  add('TI', formatFullTitle(meta, style));
  add('JO', meta.journal_name);
  add('VL', meta.volume);
  add('IS', meta.issue);
  add('PB', meta.publisher);
  add('PY', meta.year);
  add('SP', meta.page_first);
  add('EP', meta.page_last);
  const keywords = Array.isArray(meta.keywords) ? meta.keywords : String(meta.keywords ?? '').split(',');
  keywords.forEach(keyword => add('KW', keyword.trim()));
  add('AB', meta.abstract);
  add('DB', item.academicDB);
  add('UR', item.url);
  return `${lines.join('\n')}\nER  - \n\n`;
}

async function exportRis(ids) {
  const style = resolveStyle();
  const entries = (await getEntries(ids)).sort((a, b) => b.timestampId - a.timestampId);
  const blob = new Blob([entries.map(item => formatRis(item, style)).join('')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sickle-Cite 서지정보(${todayStamp()}).ris`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  $('#export-bibliography-modal').classList.add('hidden');
  showToast('선택한 항목의 서지정보를 .ris 파일로 저장했습니다');
}

function bindHistoryButtons() {
  const openModal = id => $(`#${id}`).classList.remove('hidden');
  const closeModal = id => $(`#${id}`).classList.add('hidden');

  // 선택된 항목이 있는지, (중복 표시 중이면) 같은 논문이 중복 선택되지 않았는지 확인
  const validSelection = async emptyMessage => {
    const ids = checkedIds();
    if (ids.length === 0) { showError(emptyMessage); return null; }
    if (await selectionHasDuplicates(ids)) { showError('선택된 항목들 가운데 중복된 논문이 있습니다'); return null; }
    return ids;
  };

  // 삭제
  $('#delete-history-selected').addEventListener('click', () => openModal('delete-selected-confirm'));
  $('#confirm-selected-yes').addEventListener('click', () => {
    closeModal('delete-selected-confirm');
    deleteSelected();
  });
  $('#confirm-selected-no').addEventListener('click', () => closeModal('delete-selected-confirm'));

  // 인용 표기 복사
  $('#copy-citations-selected').addEventListener('click', async () => {
    const ids = await validSelection('복사할 항목을 선택해주세요');
    if (ids) openCopyCitationsModal(ids);
  });
  $('#copy-citations-confirm').addEventListener('click', async () => {
    const copied = await copyToClipboard(state.pendingCitations, '선택된 논문들의 인용 표기 전체가 클립보드에 복사되었습니다');
    if (copied) closeModal('copy-citations-modal');
  });
  $('#copy-citations-cancel').addEventListener('click', () => closeModal('copy-citations-modal'));

  // 서지정보 내보내기
  $('#export-bibliography-selected').addEventListener('click', async () => {
    if (await validSelection('내보낼 항목을 선택해주세요')) openModal('export-bibliography-modal');
  });
  const exportWith = exporter => () => {
    const ids = checkedIds();
    if (ids.length === 0) { showError('다운로드할 항목을 선택해주세요'); return; }
    exporter(ids);
  };
  $('#export-excel').addEventListener('click', exportWith(exportExcel));
  $('#export-ris').addEventListener('click', exportWith(exportRis));
  $('#export-cancel').addEventListener('click', () => closeModal('export-bibliography-modal'));
}


// ===== 7. 시작 (팝업이 열릴 때 한 번 실행) ====================================

// 현재 탭에 content_script.js를 주입하고, 그 실행 결과(pageInfo)를 받아옴
async function requestPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content_script.js']
  });
  const response = injection?.result;
  if (!response?.success) throw new Error(response?.error ?? '페이지 정보 요청 실패');

  const { pageInfo } = response;
  const { metadata, academicDB, url, timestamp } = pageInfo;
  const isFilled = value => typeof value === 'string' && value.trim() !== '';
  if (!metadata || !isFilled(academicDB) || !isFilled(url) || !isFilled(timestamp)) {
    throw new Error('페이지 정보가 유효하지 않습니다');
  }
  if (isMetadataEmpty(metadata)) throw new Error('메타데이터가 유효하지 않습니다');
  return pageInfo;
}

// 현재 페이지에서 서지정보를 추출하여 내역에 저장하고 탭1에 표시
async function loadCurrentPage() {
  let pageInfo;
  try {
    pageInfo = await requestPageInfo();
  } catch (err) {
    console.log(err);
    showError('논문 서지정보가 존재하지 않거나,\n아직 지원하지 않는 페이지입니다');
    return;
  }

  // 같은 논문을 전에 추출한 적이 있는지 (새 항목을 저장하기 전에 확인해야 자기 자신과 비교하지 않음)
  const history = await getHistory();
  const match = createArticleIndex(history).findMatch(pageInfo);
  const earliest = match && history
    .filter(item => isSameArticle(item, match))
    .sort((a, b) => a.timestampId - b.timestampId)[0];

  // 새 추출 결과는 항상 내역에 쌓되, 같은 논문이면 묶음 번호와 기존 태그를 이어받음
  await addToHistory({
    ...pageInfo,
    articleId: match?.articleId ?? crypto.randomUUID(),
    projectTags: [...(earliest?.projectTags ?? [])],
  });

  if (earliest) {
    // 사용자가 직접 수정해 저장했을 수 있으므로, 가장 처음 추출(·수정)된 내역을 보여줌
    showEntry(earliest);
    showToast(
      `동일한 논문의 서지정보를 이전에 추출한 적이 있습니다.\n최초(${withoutSeconds(earliest.timestamp)}) 추출된 서지정보를 불러왔습니다.`,
      { duration: 1500 }
    );
  } else {
    showEntry(pageInfo);
  }
  renderHistory();
  tagInput.refreshCandidates();
}

// Windows인 경우에만, 스크롤할 때만 스크롤바가 보이게 함
function setupWindowsScrollbars() {
  // navigator.platform은 폐기 예정(deprecated) → userAgentData 우선, 미지원 브라우저는 platform으로 대체
  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? '';
  if (!platform.startsWith('Win')) return;
  const selectors = [
    '#tab1 .left-pane .metadata-container',
    '#tab1 .right-pane .citation-input',
    '#tab1 .right-pane .tag-input-container',
    '#tab2 #history-list',
    '#tab3-scroll-area'
  ];
  for (const el of selectors.map(selector => $(selector)).filter(Boolean)) {
    el.classList.add('win-scrollbar', 'hide-scrollbar');
    let timeoutId;
    el.addEventListener('scroll', () => {
      el.classList.replace('hide-scrollbar', 'show-scrollbar');
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => el.classList.replace('show-scrollbar', 'hide-scrollbar'), 1000);
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 화면 이벤트 연결 (모두 한 번만)
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
  $$('#tab1 .left-pane textarea:not(.abstract-input)').forEach(ta => {
    ta.style.overflowY = 'hidden';
    fitTextarea(ta);
  });
  Object.assign(historyContainer.style, {
    position: 'relative', maxHeight: '343px', minHeight: '300px', overflowY: 'auto',
    paddingBottom: '20px' // 하단 버튼 영역 뒤로 내용이 가려지지 않도록 여유 공간
  });
  bindMetadataFields();
  bindTab1Buttons();
  bindHistoryTable();
  bindHistoryButtons();
  bindSettingsForm();
  setupWindowsScrollbars();
  tagInput.focus(); // 팝업을 열자마자 바로 태그를 입력할 수 있게

  // 설정을 먼저 불러온 뒤(인용 표기 조합에 필요) 내역 표시 → 현재 페이지 추출
  state.settings = await loadSettings();
  renderSettingsForm();
  // 이전 버전에서 쌓인 내역에는 묶음 번호가 없으므로 한 번 붙여 줌
  if ((await getHistory()).some(item => !item.articleId)) await updateHistory(assignArticleIds);
  renderHistory();
  loadCurrentPage();
});
