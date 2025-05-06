// 전역
let currentMetadataGlobal = {};

// ----------------------------------------------------------------

// Popup의 동적인 부분 1 -- 탭 버튼 작동
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Deactivate all tabs and contents
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      // Activate the clicked tab and its content
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
});

// Popup의 동적인 부분 2 -- 탭1 중 본제목, 부제목, 키워드 textareas 사이즈 자동 재조정
document.querySelectorAll('#tab1 .left-pane textarea:not(.abstract-input)').forEach(ta => {
ta.style.overflowY = 'hidden';
const resize = () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
};
ta.addEventListener('input', resize);
resize();
});

// Popup의 동적인 부분 3 -- 탭3 중, 권호수 옵션
const volIssSelect = document.getElementById('vol-iss-style');
const volIssContainer = document.getElementById('vol-iss-options');
function updateVolIssOptions() {
    const val = volIssSelect.value;
    let html = '';
    if (val === 'none') {
        html = '<p style="color: var(--text-secondary); font-size:13px; margin-top:12px; margin-left: 3px">권/호의 구분이 따로 없을 경우(즉 권/호 둘 중 하나만 있는 경우), 괄호 없이 숫자만 표기됩니다.</p>';
    } else if (val === 'suffix') {
        html = `
        <div class="field"><label>권수 단위:</label><input type="text" name="volume-suffix" value="권"></div>
        <div class="field"><label>호수 단위:</label><input type="text" name="issue-suffix" value="호"></div>
        <div class="field"><label>구분 없을 시 단위:</label><input type="text" name="either-suffix" value="호"></div>
        <div class="field"><label>권호수 앞에 접두사 "제" 붙이기</label><input type="checkbox" name="prefix-제" checked></div>
        `;
    } else if (val === 'prefix') {
        html = `
        <div class="field"><label>권수 접두사:</label><input type="text" name="volume-prefix" value="Vol."></div>
        <div class="field"><label>호수 접두사:</label><input type="text" name="issue-prefix" value="No."></div>
        <div class="field"><label>구분 없을 시 접두사:</label><input type="text" name="either-prefix" value="No."></div>
        `;
    }
    volIssContainer.innerHTML = html;
}
volIssSelect.addEventListener('change', updateVolIssOptions);
// 초기 로드 시 호출
updateVolIssOptions();

// 기능 1. "클립보드에 복사" 버튼 클릭 시 인용문 클립보드에 복사
const copyBtn = document.getElementById('copy-citation-btn');
if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    // 메타데이터 전체가 비어있으면 복사 취소 및 에러 토스트
    const isEmpty = Object.values(currentMetadataGlobal)
      .every(v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
    if (isEmpty) {
      showToastError('메타데이터가 없습니다');
      return;
    }
    const citationText = getCombinedCitation(currentMetadataGlobal, getStyleSettings());
    navigator.clipboard.writeText(citationText)
      .then(() => {
        console.log('조합된 서지사항이 클립보드에 복사되었습니다:', citationText);
        showToast('조합된 서지사항이 복사되었습니다');
      })
      .catch(err => console.error('복사 실패:', err));
  });
}
// 기능 2. "텍스트로 복사" 버튼 클릭 시 메타데이터 텍스트 클립보드에 복사
const copyMetadataBtn = document.getElementById('copy-metadata-btn');
if (copyMetadataBtn) {
  copyMetadataBtn.addEventListener('click', () => {
    // 메타데이터 전체가 비어있으면 복사 취소 및 에러 토스트
    const isEmpty = Object.values(currentMetadataGlobal)
      .every(v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
    if (isEmpty) {
      showToastError('복사할 서지정보가 없습니다');
      return;
    }
    const metadataText = getMetadataText(currentMetadataGlobal);
    navigator.clipboard.writeText(metadataText)
      .then(() => {
        console.log('서지정보가 클립보드에 복사되었습니다:', metadataText);
        showToast('서지정보가 클립보드에 복사되었습니다');
      })
      .catch(err => console.error('메타데이터 복사 실패:', err));
  });
}
// 기능 3. "YAML로 복사" 버튼 클릭 시 YAML 형식 메타데이터 클립보드에 복사
const copyYamlBtn = document.getElementById('copy-yaml-btn');
if (copyYamlBtn) {
  copyYamlBtn.addEventListener('click', () => {
    // 메타데이터 전체가 비어있으면 복사 취소 및 에러 토스트
    const isEmpty = Object.values(currentMetadataGlobal)
      .every(v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
    if (isEmpty) {
      showToastError('복사할 서지정보가 없습니다');
      return;
    }
    const meta = currentMetadataGlobal;
    // Prepare YAML author block
    let authorYaml;
    if (Array.isArray(meta.authors)) {
      if (meta.authors.length === 1) {
        authorYaml = `author: ${meta.authors[0]}`;
      } else if (meta.authors.length > 1) {
        authorYaml = ['author:'].concat(meta.authors.map(name => `  - ${name}`)).join('\n');
      } else {
        authorYaml = 'author: ';
      }
    } else {
      authorYaml = `author: ${meta.authors || ''}`;
    }
    // Prepare YAML keywords block
    let keywordsYaml;
    if (Array.isArray(meta.keywords)) {
      if (meta.keywords.length === 1) {
        keywordsYaml = `keywords: ${meta.keywords[0]}`;
      } else if (meta.keywords.length > 1) {
        keywordsYaml = ['keywords:'].concat(meta.keywords.map(kw => `  - ${kw}`)).join('\n');
      } else {
        keywordsYaml = 'keywords: ';
      }
    } else {
      keywordsYaml = `keywords: ${meta.keywords || ''}`;
    }
    const citation = getCombinedCitation(meta, getStyleSettings());
    let volumeIssue = '';
    if (meta.volume && meta.issue) {
      volumeIssue = `${meta.volume}(${meta.issue})`;
    } else if (meta.volume) {
      volumeIssue = `"${meta.volume}"`;
    } else if (meta.issue) {
      volumeIssue = `"${meta.issue}"`;
    } else {
      volumeIssue = '';
    }
    const yamlText = [
      '---',
      authorYaml,
      'translator: ',
      `title: ${meta.title_main}`,
      `subtitle: ${meta.title_sub}`,
      `journal: ${meta.journal_name}`,
      `volume-issue: ${volumeIssue}`,
      `publishing_society: ${meta.publisher}`,
      `year: "${meta.year}"`,
      `citation: ${citation}`,
      keywordsYaml,
      'PDF: ',
      'tags: ',
      'project: ',
      `author_add'l_info: `,
      'cit_of_old_original_ver: ',
      'check: false',
      '---',
      `> [!abstract] 초록`,
      `> ${meta.abstract}`
    ].join('\n') + '\n\n';
    navigator.clipboard.writeText(yamlText)
      .then(() => {
        console.log('서지정보(YAML)가 클립보드에 복사되었습니다:', yamlText);
        showToast('서지정보(YAML)가 복사되었습니다');
      })
      .catch(err => console.error('YAML 복사 실패:', err));
  });
}
// 사용자에게 잠깐 보이는 알림을 생성하고 제거
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(37, 37, 37, 0.8)',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '6px',
    zIndex: '1200',
    opacity: '0',
    transition: 'opacity 0.5s ease'
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove());
  }, 1000);
}
function showToastError(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(179, 73, 73, 0.8)',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '6px',
    zIndex: '1200',
    opacity: '0',
    transition: 'opacity 0.5s ease',
    whiteSpace: 'pre-line'
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove());
  }, 1500);
}

// ----------------------------------------------------------------

// ** 함수 **

function getMetadataText(meta) {
  const combinedAuthors = Array.isArray(meta.authors) ? meta.authors.join(', ') : (meta.authors || '');
  const keywordsList = Array.isArray(meta.keywords) ? meta.keywords.join(', ') : (meta.keywords || '');
  const lines = [
    `저자: ${combinedAuthors}`,
    `본제목: ${meta.title_main}`,
    `부제목: ${meta.title_sub}`,
    `학술지명: ${meta.journal_name}`,
    `권수: ${meta.volume}`,
    `호수: ${meta.issue}`,
    `발간기관(학회): ${meta.publisher}`,
    `연도: ${meta.year}`,
    `첫 페이지: ${meta.page_first}`,
    `끝 페이지: ${meta.page_last}`,
    `키워드: ${keywordsList}`,
    `국문 초록: ${meta.abstract}`
  ];
  return lines.join('\n');
}

// 메타 1: PageInfo(메타데이터 + DB 타입 + URL + timestamp) 요청
async function requestPageInfo() {
  // 현재 활성 탭 정보 가져오기
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // content_script.js를 탭에 주입
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content_script.js']
  });
  // GET_PAGE_INFO 메시지 전송 및 응답 대기
  const response = await new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_INFO' }, resolve);
  });
  if (!response?.success) {
    throw new Error(response?.error || '페이지 정보 요청 실패');
  }
  // 수신한 pageInfo 유효성 검사
  const pageInfo = response.pageInfo;
  const { metadata, academicDB, url, timestamp } = pageInfo;
  // 필수 필드 존재 및 빈 문자열 검사
  if (
    !metadata ||
    typeof academicDB !== 'string' || !academicDB.trim() ||
    typeof url !== 'string' || !url.trim() ||
    typeof timestamp !== 'string' || !timestamp.trim()
  ) {
    throw new Error('페이지 정보가 유효하지 않습니다');
  }
  // metadata 내부 값들이 전부 empty인지 검사
  const values = Object.values(metadata);
  if (values.length === 0 || values.every(v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0))) {
    throw new Error('메타데이터가 유효하지 않습니다');
  }
  return pageInfo;
}

// 메타 2: 추출된(받아온) 최초 메타데이터를 탭1 좌측의 각 메타데이터 필드에 채우기
function fillMetadataField(meta) {
  // undefined인 메타데이터 속성은 빈 문자열로 대체
  Object.keys(meta).forEach(key => {
    if (meta[key] === undefined) {
      meta[key] = '';
    }
  });
  currentMetadataGlobal = meta;
  // 필수 메타데이터 누락시 알림
  if (['authors','title_main','publisher','year'].some(key => !meta[key])) {
    showToastError('논문의 서지정보가 불완전하게 추출되었습니다');
  }
  const keys = ['authors','title_main','title_sub','journal_name','volume','issue','publisher','year','page_first','page_last','keywords','abstract'];
  keys.forEach(key => {
    const el = document.querySelector(`#tab1 .left-pane [name="${key}"]`);
    if (!el) return;
    let val = meta[key];
    if (Array.isArray(val)) val = val.join(', ');
    if (key === 'abstract') {
      // abstract 특수 처리 + 높이 자동 조정
      const fullText = val || '';
      const isLong = fullText.length > 100;
      const truncated = fullText.slice(0, 100);
      // 스크롤 방지
      el.style.overflowY = 'hidden';
      if (isLong) {
        el.value = truncated + '...[더 보기]';
        // 클릭 시 전체 텍스트로 확장
        const expand = () => {
          el.value = fullText;
          // 스크롤 방지
          el.style.overflowY = 'hidden';
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
          el.removeEventListener('click', expand);
        };
        el.addEventListener('click', expand);
      } else {
        el.value = fullText;
      }
      // textarea 높이 자동 조정
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    } else {
      el.value = val || '';
      if (el.tagName.toLowerCase() === 'textarea') {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
    }
  });
}

// 메타 3: 탭1 좌측 메타데이터 필드에서 직접 수정이 이뤄질 경우, 그러한 이벤트를 리슨해서 메타데이터를 업데이트
function updateCurrentMetadata(meta) {
  const keys = ['authors','title_main','title_sub','journal_name','volume','issue','publisher','year','page_first','page_last','keywords','abstract'];
  keys.forEach(key => {
    const el = document.querySelector(`#tab1 .left-pane [name="${key}"]`);
    if (!el) return;
    el.addEventListener('input', () => {
      meta[key] = el.value;
      console.log(`메타데이터 업데이트: ${key} =`, el.value)
      console.log('업데이트 된 메타데이터는 다음과 같음:', getMetadataText(meta));
      updateCitation(meta)
    });
  });
  return meta;
}

// 메타 1~3 종합
async function fetchCurrentMetadata() {
  // 추출된(받아온) 최초 메타테이터를 recievedMetadata에 저장
  const { metadata: recievedMetadata, academicDB, url, timestamp } = await requestPageInfo();
  if (!recievedMetadata) {
    showToastError('논문 서지정보가 존재하지 않거나,\n아직 지원하지 않는 페이지입니다');
    return;
  }
  // 별도로 currentMetadata를 분리, 초기값은 recievedMetadata에서 가져옴
  const currentMetadata = { ...recievedMetadata };
  // 최초 메타데이터를 탭1 좌측의 각 메타데이터 필드에 채우기
  fillMetadataField(recievedMetadata);
  // 탭1 좌측 메타데이터 필드에서 직접 수정 시 즉각 업데이트, 수정된 최신 메타데이터를 반환
  return updateCurrentMetadata(currentMetadata);
}

// 설정 1: 탭3의 설정값을 객체로 반환
function getStyleSettings() {
  // 제목·부제목 구분 기호
  const sepOption = document.querySelector('input[name="title-sep-option"]:checked')?.value;
  let titleSeparator;
  if (sepOption === 'dash-space') titleSeparator = ' — ';
  else if (sepOption === 'dash-nospace') titleSeparator = '—';
  else if (sepOption === 'colon') titleSeparator = ': ';

  // 권호수 표기 방식
  const volIssOption = document.getElementById('vol-iss-style').value;
  let volumePrefix = '', volumeSuffix = '', volumeIssueSeparator = '', issuePrefix = '', issueSuffix = '', eitherPrefix = '', eitherSuffix = '';
  if (volIssOption === 'none') {
    // no prefix/suffix, parentheses for issue
    issuePrefix = '(';
    issueSuffix = ')';
  } else if (volIssOption === 'suffix') {
    // 단위 입력값 읽기
    volumeSuffix = document.querySelector('input[name="volume-suffix"]')?.value || '';
    issueSuffix = document.querySelector('input[name="issue-suffix"]')?.value || '';
    eitherSuffix = document.querySelector('input[name="either-suffix"]')?.value || '';
    volumeIssueSeparator = ' ';
    // "제" 접두사 옵션
    const prefixFlag = document.querySelector('input[name="prefix-제"]')?.checked;
    if (prefixFlag) {
      volumePrefix = issuePrefix = eitherPrefix = '제';
    }
  } else if (volIssOption === 'prefix') {
    volumePrefix = document.querySelector('input[name="volume-prefix"]')?.value || '';
    issuePrefix = document.querySelector('input[name="issue-prefix"]')?.value || '';
    eitherPrefix = document.querySelector('input[name="either-prefix"]')?.value || '';
    volumeIssueSeparator = ' ';
  }

  // 제목 기호 설정 (홑낫표 vs 화살괄호)
  const singleBracketFlag = document.querySelector('input[name="title-brackets"]')?.checked;
  let titleBracketLeft, titleBracketRight;
  if (singleBracketFlag) {
    titleBracketLeft = '〈';
    titleBracketRight = '〉';
  } else {
    titleBracketLeft = '「';
    titleBracketRight = '」';
  }

  // 겹낫표 설정 (겹낫표 vs 화살괄호)
  const doubleBracketFlag = document.querySelector('input[name="journal-brackets"]')?.checked;
  let journalBracketLeft, journalBracketRight;
  if (doubleBracketFlag) {
    journalBracketLeft = '《';
    journalBracketRight = '》';
  } else {
    journalBracketLeft = '『';
    journalBracketRight = '』';
  }

  return {
    titleSeparator,
    volumePrefix,
    volumeSuffix,
    volumeIssueSeparator,
    issuePrefix,
    issueSuffix,
    eitherPrefix,
    eitherSuffix,
    titleBracketLeft,
    titleBracketRight,
    journalBracketLeft,
    journalBracketRight
  };
}

// 설정 2: 탭3의 설정값 객체를 저장 (설정 1을 포함)
function saveStyleSettings() {
  const styleSettings = getStyleSettings();
  chrome.storage.sync.set(styleSettings, () => {
    console.log('인용 양식 설정 변경사항 저장됨:', styleSettings);
  });
}

// 설정 3: 탭3의 설정을 위한 각 요소에 변경이 생길 때마다 그러한 이벤트를 리슨하여 설정값 (재)저장 (설정 2를 포함)
function resaveChangedStyleSettings() {
  const tab3 = document.getElementById('tab3');
  if (!tab3) return;
  tab3.addEventListener('change', function(event) {
    const target = event.target;
    if (
      target.matches('input, select, textarea')
    ) {
      saveStyleSettings();
      updateCitation(currentMetadataGlobal);
    }
  });
}

// 설정 4: 저장된 인용 양식 설정값을 불러와 탭3 재구성(popup을 다시 열었을 때)
function restoreStyleSettings() {
  chrome.storage.sync.get({
    titleSeparator: ' — ',
    volumePrefix: '',
    volumeSuffix: '',
    volumeIssueSeparator: '',
    issuePrefix: '(',
    issueSuffix: ')',
    eitherPrefix: '',
    eitherSuffix: '',
    titleBracketLeft: '「',
    titleBracketRight: '」',
    journalBracketLeft: '『',
    journalBracketRight: '』'
  }, items => {
    // 제목 구분 기호 복원
    if (items.titleSeparator === ' — ') document.querySelector('input[name="title-sep-option"][value="dash-space"]').checked = true;
    else if (items.titleSeparator === '—') document.querySelector('input[name="title-sep-option"][value="dash-nospace"]').checked = true;
    else if (items.titleSeparator === ': ') document.querySelector('input[name="title-sep-option"][value="colon"]').checked = true;
    // 권호수 표기 방식 복원
    let mode = 'none';
    if (items.volumeIssueSeparator === ' ') {
      // 판별: suffix or prefix?
      mode = items.volumeSuffix ? 'suffix' : 'prefix';
    }
    volIssSelect.value = mode;
    updateVolIssOptions();
    // 동적 필드 값 복원
    if (mode === 'suffix') {
      document.querySelector('input[name="volume-suffix"]').value = items.volumeSuffix;
      document.querySelector('input[name="issue-suffix"]').value = items.issueSuffix;
      document.querySelector('input[name="either-suffix"]').value = items.eitherSuffix;
      document.querySelector('input[name="prefix-제"]').checked = items.volumePrefix === '제';
    } else if (mode === 'prefix') {
      document.querySelector('input[name="volume-prefix"]').value = items.volumePrefix;
      document.querySelector('input[name="issue-prefix"]').value = items.issuePrefix;
      document.querySelector('input[name="either-prefix"]').value = items.eitherPrefix;
    }
    // 제목 기호 복원
    document.querySelector('input[name="title-brackets"]').checked = items.titleBracketLeft === '〈';
    // 겹낫표 복원
    document.querySelector('input[name="journal-brackets"]').checked = items.journalBracketLeft === '《';
  });
}

// 인용 1: 메타데이터와 인용 양식 설정값을 조합해 최종적인 인용(citation)을 도출
function getCombinedCitation(meta, style) {
  // 서브타이틀이 없으면 구분 기호 제거
  const checkedSeparator = meta.title_sub ? style.titleSeparator : '';
  const combinedAuthors = Array.isArray(meta.authors) ? meta.authors.join('·') : meta.authors;
  const hasVol = meta.volume !== '';
  const hasIss = meta.issue !== '';
  let combinedCitation = '';
  if (hasVol && hasIss) {
    combinedCitation = `${combinedAuthors}, ${style.titleBracketLeft}${meta.title_main}${checkedSeparator}${meta.title_sub}${style.titleBracketRight}, ${style.journalBracketLeft}${meta.journal_name}${style.journalBracketRight} ${style.volumePrefix}${meta.volume}${style.volumeSuffix}${style.volumeIssueSeparator}${style.issuePrefix}${meta.issue}${style.issueSuffix}, ${meta.publisher}, ${meta.year}.`;
  } else if (hasVol || hasIss) {
    combinedCitation = `${combinedAuthors}, ${style.titleBracketLeft}${meta.title_main}${checkedSeparator}${meta.title_sub}${style.titleBracketRight}, ${style.journalBracketLeft}${meta.journal_name}${style.journalBracketRight} ${style.eitherPrefix}${meta.volume}${meta.issue}${style.eitherSuffix}, ${meta.publisher}, ${meta.year}.`;
  } else {
    // 학술지명 값이 비어 있을 경우(학위논문일 경우 등) 학술지명 부분 전체를 제거 ("『』, "이 나타나지 않도록)
    if (!meta.journal_name) {
      combinedCitation = `${combinedAuthors}, ${style.titleBracketLeft}${meta.title_main}${checkedSeparator}${meta.title_sub}${style.titleBracketRight}, ${meta.publisher}, ${meta.year}.`;
    } else {
      combinedCitation = `${combinedAuthors}, ${style.titleBracketLeft}${meta.title_main}${checkedSeparator}${meta.title_sub}${style.titleBracketRight}, ${style.journalBracketLeft}${meta.journal_name}${style.journalBracketRight}, ${meta.publisher}, ${meta.year}.`;
    }
  }
  return combinedCitation;
}

// 인용 2: 탭1 우측 textarea에 조합된 citation을 삽입 -> 이벤트 리스너가 있는 다른 함수에서 호출
function updateCitation(meta) {
  const textarea = document.querySelector('.citation-input');
  if (
    !meta ||
    Object.values(meta).every(
      v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
    )
  ) {
    if (textarea) textarea.value = '';
    return;
  }
  const style = getStyleSettings();
  const combinedCitation = getCombinedCitation(meta, style);
  if (textarea) textarea.value = combinedCitation;
}

// 히스토리 1: 저장된 히스토리에 pageInfo 추가
function savePageInfoToHistory(pageInfo) {
  chrome.storage.local.get({ history: [] }, items => {
    const merged = items.history.concat(pageInfo);
    // 메타데이터 깊은 비교 함수
    function isSameMetadata(a, b) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every(key => {
        const valA = a[key];
        const valB = b[key];
        if (Array.isArray(valA) && Array.isArray(valB)) {
          return valA.length === valB.length && valA.every((v, i) => v === valB[i]);
        }
        return valA === valB;
      });
    }
    // 중복 제거
    const uniqueHistory = [];
    merged.forEach(item => {
      const exists = uniqueHistory.some(u =>
        u.academicDB === item.academicDB &&
        u.url === item.url &&
        u.timestamp === item.timestamp &&
        isSameMetadata(u.metadata, item.metadata)
      );
      if (!exists) uniqueHistory.push(item);
    });
    // 저장
    chrome.storage.local.set({ history: uniqueHistory }, () => {
      console.log('히스토리 저장 및 중복 제거 완료:', uniqueHistory);
      // 저장 후 UI 갱신
      renderHistory();
    });
  });
}

// 히스토리 a. 히스토리 항목 삭제
function deleteHistoryItem(targetItem) {
  const isDedup = document.getElementById('deduplicate')?.checked;
  chrome.storage.local.get({ history: [] }, items => {
    let filtered;
    if (isDedup) {
      // 중복 기준(metadata, academicDB, url)으로 일치하는 모든 항목 제거
      const targetKey = JSON.stringify({
        metadata: targetItem.metadata,
        academicDB: targetItem.academicDB,
        url: targetItem.url
      });
      filtered = items.history.filter(item => {
        const itemKey = JSON.stringify({
          metadata: item.metadata,
          academicDB: item.academicDB,
          url: item.url
        });
        return itemKey !== targetKey;
      });
    } else {
      // 정확히 일치하는 단일 항목만 제거 (timestamp 포함)
      filtered = items.history.filter(item =>
        !(
          item.academicDB === targetItem.academicDB &&
          item.url === targetItem.url &&
          item.timestamp === targetItem.timestamp &&
          JSON.stringify(item.metadata) === JSON.stringify(targetItem.metadata)
        )
      );
    }
    chrome.storage.local.set({ history: filtered }, () => {
      console.log('히스토리 항목 삭제됨:', targetItem);
      renderHistory();
    });
  });
}

// 히스토리 b-1. metadata 기준 중복 제거 (가장 이른 timestamp만 남김)
function deduplicateHistory(historyArray) {
  const groups = {};
  historyArray.forEach(item => {
    const key = JSON.stringify({
      authors: item.metadata.authors,
      title_main: item.metadata.title_main,
      title_sub: item.metadata.title_sub,
      journal_name: item.metadata.journal_name,
      publisher: item.metadata.publisher,
      year: item.metadata.year
    });
    if (!groups[key] || item.timestamp.localeCompare(groups[key].timestamp) < 0) {
      groups[key] = item;
    }
  });
  return Object.values(groups);
}

// 히스토리 b-2. metadata, academicDB, url, timestamp 모두 포함하여 완전 동일 항목만 중복 제거 (가장 이른 timestamp 유지)
function deduplicateFullHistory(historyArray) {
  const groups = {};
  historyArray.forEach(item => {
    const key = JSON.stringify(item);
    if (!groups[key] || item.timestamp.localeCompare(groups[key].timestamp) < 0) {
      groups[key] = item;
    }
  });
  return Object.values(groups);
}

// 히스토리 2: 탭2에 히스토리 표 생성
function renderHistory() {
  chrome.storage.local.get({ history: [] }, items => {
    // 히스토리 데이터 불러오기
    const rawHistory = items.history.slice();
    // 검색 필터링 (공백 단위 분할, 모든 키워드 포함 여부)
    const searchValue = document.getElementById('search-history')?.value.trim().toLowerCase() || '';
    const terms = searchValue.split(/\s+/).filter(Boolean);
    const baseHistory = terms.length
      ? rawHistory.filter(item => {
          const haystack = Object.values(item.metadata)
            .flatMap(v => Array.isArray(v) ? v : [v])
            .join(' ')
            .toLowerCase();
          return terms.every(term => haystack.includes(term));
        })
      : rawHistory;
    // 체크박스 상태에 따라 중복 처리 분기
    const isDedup = document.getElementById('deduplicate')?.checked;
    const history = isDedup
      ? deduplicateHistory(baseHistory)        // timestamp 제외 기준 중복 제거
      : deduplicateFullHistory(baseHistory);   // 전체 필드 기준 중복 제거 (timestamp 포함)
    // 타임스탬프 최신순 정렬 (문자열 비교로 가능)
    history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.maxHeight = '500px';   // 최대 높이를 600px로 제한
    container.style.overflowY  = 'auto';   // 넘칠 때 세로 스크롤 활성화
    container.style.minHeight = '300px';   // 최소 높이
    container.style.paddingBottom = '20px';   // 체크박스 뒤로 내용이 스크롤되지 않도록 여유 공간 확보
    const table = document.createElement('table');
    table.style.border = 'none';
    table.style.width = '100%';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['저자','제목','학술DB','검색 일시'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.border = 'none';
      th.style.textAlign = 'left';
      th.style.padding = '4px';
      headerRow.appendChild(th);
    });
    // 삭제 컬럼 헤더
    const thDel = document.createElement('th');
    thDel.style.border = 'none';
    thDel.style.padding = '4px';
    thDel.textContent = ''; // 아이콘용 빈 헤더
    headerRow.appendChild(thDel);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    history.forEach(item => {
      const tr = document.createElement('tr');
      tr.style.border = 'none';
      // 저자 표시: 3명 이상일 때 처음 2명 + ' 외'
      const authorsArray = Array.isArray(item.metadata.authors) ? item.metadata.authors : item.metadata.authors ? [item.metadata.authors] : [];
      let authorText = '';
      if (authorsArray.length >= 3) {
        authorText = authorsArray.slice(0, 2).join(', ') + ' 외';
      } else {
        authorText = authorsArray.join(', ');
      }
      // 제목 표시: 공백 포함 최대 32자, 넘으면 '…' 추가
      const rawTitle = item.metadata.title_main || '';
      const titleText = rawTitle.length > 30
        ? rawTitle.slice(0, 32) + '…'
        : rawTitle;
      ['author', 'title', 'db', 'time'].forEach((_, idx) => {
        const td = document.createElement('td');
        td.style.border = 'none';
        td.style.padding = '4px';
        if (idx === 0) {
          td.textContent = authorText;
          td.title = Array.isArray(item.metadata.authors) //툴팁(기본)
            ? item.metadata.authors.join(', ')
            : (item.metadata.authors || '');
          td.dataset.tooltip = td.title;
          // 클릭 시 탭1으로 전환 후 데이터 채우기
          td.style.cursor = 'pointer';
          td.addEventListener('click', () => {
            const tab1Btn = document.querySelector('.tab-btn[data-tab="tab1"]');
            if (tab1Btn) tab1Btn.click();
            currentMetadataGlobal = item.metadata;
            fillMetadataField(item.metadata);
            updateCitation(item.metadata);
          });
        } else if (idx === 1) {
          td.textContent = titleText;
          td.title = rawTitle; //툴팁(기본)
          td.dataset.tooltip = rawTitle;
          td.style.cursor = 'pointer';
          td.addEventListener('click', () => {
            const tab1Btn = document.querySelector('.tab-btn[data-tab="tab1"]');
            if (tab1Btn) tab1Btn.click();
            currentMetadataGlobal = item.metadata;
            fillMetadataField(item.metadata);
            updateCitation(item.metadata);
          });
        } else if (idx === 2) {
          const a = document.createElement('a');
          a.href = item.url;
          a.textContent = item.academicDB;
          a.target = '_blank';
          a.title = '검색 결과 페이지 바로가기'; //툴팁(기본)
          td.appendChild(a);
        } else if (idx === 3) {
          // 분 단위까지만 표시 (초 단위 제거)
          td.textContent = item.timestamp.slice(0, item.timestamp.lastIndexOf(':'));
        }
        tr.appendChild(td);
      });
      // 삭제 버튼 셀
      const tdDel = document.createElement('td');
      tdDel.style.border = 'none';
      tdDel.style.padding = '4px';
      const btn = document.createElement('button');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" alt="삭제" width="16" height="16" style="color: var(--text-secondary)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
      btn.style.border = 'none';
      btn.style.background = 'none';
      btn.style.cursor = 'pointer';
      btn.title = '삭제'; //툴팁(기본)
      btn.addEventListener('click', () => deleteHistoryItem(item));
      tdDel.appendChild(btn);
      tr.appendChild(tdDel);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  });
}
// 히스토리 3. 체크박스 클릭 시 히스토리 다시 렌더
function reRenderHistoryCheck() {
  const dedupCheckbox = document.getElementById('deduplicate');
  if (dedupCheckbox) {
    dedupCheckbox.addEventListener('change', renderHistory);
  }
}
// 히스토리 4. 검색창에 입력 감지될 때마다 히스토리 다시 렌더
function reRenderHistorySearch() {
  const searchInput = document.getElementById('search-history');
  if (searchInput) {
    searchInput.addEventListener('input', renderHistory);
  }
}
// 히스토리 5. 다운로드 버튼을 누르면 히스토리를 엑셀로 다운로드
function downloadHistory() {
  const downloadBtn = document.getElementById('download-history');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      // 저장된 히스토리 불러오기
      chrome.storage.local.get({ history: [] }, items => {
        // 중복 처리: 체크박스 상태에 따라 전체 필드 기준 또는 timestamp 제외 기준 중복 제거
        const rawHistory = items.history.slice();
        const isDedup = document.getElementById('deduplicate')?.checked;
        const historyForExport = isDedup
          ? deduplicateHistory(rawHistory)
          : deduplicateFullHistory(rawHistory);
        const data = historyForExport.map(item => ({
          '저자': Array.isArray(item.metadata.authors) ? item.metadata.authors.join(', ') : (item.metadata.authors || ''),
          '본제목': item.metadata.title_main || '',
          '부제목': item.metadata.title_sub || '',
          '학술지명': item.metadata.journal_name || '',
          '권수': item.metadata.volume || '',
          '호수': item.metadata.issue || '',
          '발행기관': item.metadata.publisher || '',
          '연도': item.metadata.year || '',
          '첫 페이지': item.metadata.page_first || '',
          '끝 페이지': item.metadata.page_last || '',
          '키워드': Array.isArray(item.metadata.keywords) ? item.metadata.keywords.join(', ') : (item.metadata.keywords || ''),
          '국문 초록': item.metadata.abstract || '',
          '조합된 서지사항': getCombinedCitation(item.metadata, getStyleSettings()),
          '검색한 학술 DB': item.academicDB,
          'URL': item.url,
          '검색(추출) 일시': item.timestamp
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        // 열 너비 설정 (wch: 문자 수 기반 너비)
        ws['!cols'] = [
          { wch: 14 }, // 저자
          { wch: 35 }, // 본제목
          { wch: 35 }, // 부제목
          { wch: 14 }, // 학술지명
          { wch: 5 }, // 권수
          { wch: 5 }, // 호수
          { wch: 14 }, // 발행기관
          { wch: 5 }, // 연도
          { wch: 7 }, // 첫 페이지
          { wch: 7 }, // 마지막 페이지
          { wch: 35 }, // 키워드
          { wch: 35 }, // 국문 초록
          { wch: 100 }, // 조합된 서지사항
          { wch: 13 }, // 검색한 학술 DB
          { wch: 7 }, // URL
          { wch: 15 }  // 검색(추출) 일시
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'History');
        // 파일명을 오늘 날짜 기반으로 생성 (YY.MM.DD)
        const now = new Date();
        const year2 = String(now.getFullYear()).slice(-2);
        const month2 = String(now.getMonth() + 1).padStart(2, '0');
        const day2 = String(now.getDate()).padStart(2, '0');
        const filename = `Sickle-Cite 학술지논문 서지정보 내역(${year2}.${month2}.${day2}).xlsx`;
        XLSX.writeFile(wb, filename);
      });
    });
  }
}

// 이벤트 리스너

// 삭제 버튼 클릭 → 모달 띄우기
document.getElementById('delete-history-all').addEventListener('click', () => {
  document.getElementById('delete-confirm').classList.remove('hidden');
});
// 예: 히스토리 삭제 & 모달 닫기
document.getElementById('confirm-yes').addEventListener('click', () => {
  chrome.storage.local.set({ history: [] }, () => {
    showToast('저장된 내역이 모두 삭제되었습니다');
    renderHistory();
  });
  document.getElementById('delete-confirm').classList.add('hidden');
});
// 아니요: 모달만 닫기
document.getElementById('confirm-no').addEventListener('click', () => {
  document.getElementById('delete-confirm').classList.add('hidden');
});

// ----------------------------------------------------------------


// ** 실행 **

// 팝업 DOM이 로드되는 것을 리슨하여,
document.addEventListener('DOMContentLoaded', () => {
  // 1. 저장된 인용 양식 설정값을 불러와 탭3 재구성하기.
  restoreStyleSettings();
  // 2. 실행 시마다 pageInfo를 history에 저장
  requestPageInfo()
    .then(pageInfo => savePageInfoToHistory(pageInfo))
    .catch(err => console.log('히스토리 저장 실패.', err));
  // 3. 메타데이터 불러오고, 탭1의 각 필드에 넣기. 직접 수정 발생 시 이를 업데이트하기.
  fetchCurrentMetadata()
    .then(currentMetadata => {
      currentMetadataGlobal = currentMetadata || {};
      updateCitation(currentMetadataGlobal);
    })
    .catch(err => {
      console.log(err);
      showToastError('논문 서지정보가 존재하지 않거나,\n아직 지원하지 않는 페이지입니다');
    });
  // 4. 탭3의 설정 변경 시 이를 재저장하기.
  resaveChangedStyleSettings();
  // 5. 히스토리 탭 렌더링, 이벤트 리슨하여 리렌더링, 다운로드
  renderHistory();
  reRenderHistoryCheck();
  reRenderHistorySearch();
  downloadHistory()
});