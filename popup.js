// 전역
let currentMetadataGlobal = {};
let currentTimestampIdGlobal = ''; // 현재 탭 1에 띄워져 있는 정보값을 저장된 history 중에서 식별하기 위함

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
      // 탭1로 전환 시 태그 불러오기 시도
      if (tabId === 'tab1' && currentTimestampIdGlobal) {
        loadProjectTags();
      }
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
        html = '<p style="color: var(--text-secondary); font-size:13px; margin-top:12px; margin-left: 3px">💡 권/호의 구분이 따로 없을 경우(즉 권/호 둘 중 하나만 있는 경우), 괄호 없이 숫자만 표기됩니다.</p>';
    } else if (val === 'suffix') {
        html = `
        <div class="field"><label>권수 단위:</label><input type="text" name="volume-suffix" value="권"></div>
        <div class="field"><label>호수 단위:</label><input type="text" name="issue-suffix" value="호"></div>
        <div class="field"><label>구분 없을 시 단위:</label><input type="text" name="either-suffix" value="호"></div>
        <div class="field">
          <label class="checkbox-label">
            <span class="toggle-text">권호수 앞에 접두사 ‘제’ 붙이기</span>
            <span class="toggle-switch">
              <input type="checkbox" name="prefix-제" checked>
              <span class="slider"></span>
            </span>
          </label>
        </div>
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

// 이벤트 리슨 동작 1. "클립보드에 복사" 버튼 클릭 시 인용문 클립보드에 복사
const copyBtn = document.getElementById('copy-citation-btn');
if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    // 메타데이터 전체가 비어있으면 복사 취소 및 에러 토스트
    const isEmpty = Object.values(currentMetadataGlobal)
      .every(v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
    if (isEmpty) {
      showToastError('복사할 서지정보가 없습니다');
      return;
    }
    const citationText = document.querySelector('textarea.citation-input')?.value || '';
    navigator.clipboard.writeText(citationText)
      .then(() => {
        console.log('조합된 인용 표기가 클립보드에 복사되었습니다:', citationText);
        showToast('조합된 인용 표기가 클립보드에 복사되었습니다');
      })
      .catch(err => console.error('복사 실패:', err));
  });
}
// 이벤트 리슨 동작 2. "텍스트로 복사" 버튼 클릭 시 메타데이터 텍스트 클립보드에 복사
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
// 이벤트 리슨 동작 3. YAML 형식으로 메타데이터 및 인용 표기를 클립보드에 복사
// 단축키(Ctrl+Shift+Y 또는 Cmd+Shift+Y) 이벤트 리스너
document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+Y 또는 Cmd+Shift+Y (Mac)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'y') {
    e.preventDefault();
    copyYamlToClipboard();
  }
});
// 버튼 클릭 이벤트 리스너 (1.6.0 버전부터는 버튼 삭제)
const copyYamlBtn = document.getElementById('copy-yaml-btn');
if (copyYamlBtn) {
  copyYamlBtn.addEventListener('click', () => {
    copyYamlToClipboard();
  });
}
// YAML 형식으로 클립보드에 복사하는 함수
function copyYamlToClipboard() {
  // YAML 복사 버튼 함수 직접 실행
  const meta = currentMetadataGlobal;
  // 메타데이터 비어있는지 확인
  const isEmpty = Object.values(meta)
    .every(v => v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
  if (isEmpty) {
    showToastError('복사할 서지정보가 없습니다');
    return;
  }

  // author 부분
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

  // keywords 부분
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
  
  // projectTags 정보를 가져온 후 YAML 생성하여 클립보드에 복사
  chrome.storage.local.get({ history: [] }, items => {
    let projectTagsYaml = 'project: ';
    
    if (currentTimestampIdGlobal) {
      const history = items.history;
      const item = history.find(item => item.timestampId === currentTimestampIdGlobal);
      
      if (item && item.projectTags && Array.isArray(item.projectTags) && item.projectTags.length > 0) {
        if (item.projectTags.length === 1) {
          projectTagsYaml = `project: ${item.projectTags[0]}`;
        } else {
          projectTagsYaml = ['project:'].concat(item.projectTags.map(tag => `  - ${tag}`)).join('\n');
        }
      }
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
      projectTagsYaml,
      'check: false',
      '---',
      `> [!abstract] 초록`,
      `> ${meta.abstract}`
    ].join('\n') + '\n\n';
    
    navigator.clipboard.writeText(yamlText)
      .then(() => {
        console.log('서지정보(YAML)가 클립보드에 복사되었습니다:', yamlText);
        showToast('서지정보(YAML)가 클립보드에 복사되었습니다');
      })
      .catch(err => console.error('YAML 복사 실패:', err));
  });
}
// 이벤트 리슨 동작 4. "내역에 수정사항 저장" 버튼 클릭 시 메타데이터를 내역에 저장
// "내역에 수정사항 저장" 버튼 클릭 시, 현재 수정된 metadata를 history에 덮어쓰기
const saveMetaBtn = document.getElementById('save-metadata-btn');
if (saveMetaBtn) {
  saveMetaBtn.addEventListener('click', () => {
    chrome.storage.local.get({ history: [] }, items => {
      const history = items.history;
      const idx = history.findIndex(item => item.timestampId === currentTimestampIdGlobal);
      if (idx >= 0) {
        history[idx].metadata = { ...currentMetadataGlobal };
        chrome.storage.local.set({ history }, () => {
          showToast('서지정보의 직접 수정이 내역에 저장되었습니다');
          renderHistory();
        });
      } else {
        showToastError('저장된 내역을 찾을 수 없어 수정사항이 저장되지 못했습니다');
      }
    });
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

// 동일 논문을 deduplicateHistory 기준으로 판단하는 헬퍼 함수
function isSameArticleBase(a, b) {
  // a, b는 pageInfo 객체 또는 history item 객체
  // a.metadata, b.metadata가 있으면 그 내부를 비교
  const metaA = a.metadata || a;
  const metaB = b.metadata || b;
  return (
    JSON.stringify(metaA.authors) === JSON.stringify(metaB.authors) &&
    metaA.title_main === metaB.title_main &&
    metaA.title_sub === metaB.title_sub &&
    metaA.journal_name === metaB.journal_name &&
    metaA.publisher === metaB.publisher &&
    metaA.year === metaB.year
  );
}
// popup 실행(현재 페이지에서 추출) 시 이미 저장된 논문이면 알림을 띄우고 태그 UI 자동 채움
function syncTagsFromDuplicate(pageInfo) {
  chrome.storage.local.get({ history: [] }, items => {
    const matchedItem = items.history.find(item => isSameArticleBase(item, pageInfo));
    if (matchedItem) {
      showToast('동일한 논문의 서지정보를 이전에 추출한 적이 있습니다');
      if (matchedItem.projectTags && Array.isArray(matchedItem.projectTags)) {
        if (typeof window.updateTagUI === "function") {
          window.updateTagUI(matchedItem.projectTags);
          saveTags(matchedItem.projectTags);
        }
      }
    }
  });
}

// 메타데이터 처리 -----------------------

// 메타 1: PageInfo(Metadata + AcademicDB + URL + Timestamp + Timestamp ID) 요청
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
  const { metadata, academicDB, url, timestamp, timestampId } = pageInfo;
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

// 메타 2: 메타데이터를 탭1의 각 메타데이터 필드에 채우기 (추출된(받아온) 최초 메타데이터를 채우거나, 탭 2에서 클릭한 메타데이터를 채우거나)
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
// 이 함수는 매개변수에다가 변경사항을 덧씌워서 그 변수 값을 결과로 반환함
function updateCurrentMetadata(meta) {
  const keys = ['authors','title_main','title_sub','journal_name','volume','issue','publisher','year','page_first','page_last','keywords','abstract'];
  keys.forEach(key => {
    const el = document.querySelector(`#tab1 .left-pane [name="${key}"]`);
    if (!el) return;
    el.addEventListener('input', () => {
      // authors와 keywords는 콤마로 구분하여 배열로 저장
      if (key === 'authors' || key === 'keywords') {
        const inputValue = el.value.trim();
        if (inputValue) {
          // 콤마로 분리하고 각 항목의 앞뒤 공백 제거, 빈 항목 필터링
          meta[key] = inputValue.split(',')
            .map(item => item.trim())
            .filter(item => item !== '');
        } else {
          meta[key] = [];
        }
      } else {
        // 나머지 필드는 기존처럼 문자열로 저장
        meta[key] = el.value;
      }
      
      console.log(`메타데이터 업데이트: ${key} =`, meta[key]);
      console.log('업데이트 된 메타데이터는 다음과 같음:', getMetadataText(meta));
      fillCitation(meta);
    });
  });
  return meta; // 이후에 이 결과는 fetchCurrentMetadata()를 거쳐 전역변수 currentMetadataGlobal에 저장될 것임
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
  return updateCurrentMetadata(currentMetadata); // currentMetadata를 받아와서 거기에 변경사항을 업데이트하고 결과로 반환
  // 이때 결과는 updateCurrentMetadata에 의해 사용자의 직접 수정을 반영한 currentMetadata임
  // 이후 이는 다시 전역변수 currentMetadataGlobal에 저장될 것임
}

// 태그 처리 -----------------------

// 태그 1: 입력 필드를 초기화하는 함수 (input과 UI 입쳐진 list 모두 비움)
function clearTagsInput() {
  const tagsInput = document.getElementById('tags-input');
  if (tagsInput) {
    tagsInput.value = '';
  }
  const tagList = document.getElementById('tag-list');
  if (tagList) {
    tagList.innerHTML = '';
  }
}
// 태그 2: 저장된 프로젝트 태그를 불러오는 함수 (1을 포함)
function loadProjectTags() {
  if (!currentTimestampIdGlobal) return;
  clearTagsInput();
  chrome.storage.local.get({ history: [] }, items => {
    const history = items.history;
    const item = history.find(item => item.timestampId === currentTimestampIdGlobal);
    if (item && item.projectTags && Array.isArray(item.projectTags)) {
      if (typeof window.updateTagUI === "function") {
        window.updateTagUI(item.projectTags);
      }
    }
  });
}
// 태그 3: 태그 자동 저장 함수
function saveTags(tags) {
  const uniqueTags = [...new Set(tags)];
  chrome.storage.local.get({ history: [] }, items => {
    const history = items.history;
    const targetItem = history.find(item => item.timestampId === currentTimestampIdGlobal);
    if (targetItem) {
      history.forEach(item => {
        if (isSameArticleBase(item, targetItem)) {
          item.projectTags = uniqueTags;
        }
      });
      chrome.storage.local.set({ history }, () => {
        renderHistory();
      });
    }
  });
}
// 태그 4: UI 및 입력 로직을 초기화하는 함수
function initializeTagInput() {
  const tagsInput = document.getElementById('tags-input');
  const tagList = document.getElementById('tag-list');
  let tags = [];
  // 입력창 초기화 함수
  function updateTagsInput() {
    if (tagsInput) {
      tagsInput.value = '';
    }
  }
  //현재 tags 배열을 기반으로 UI를 새로 그리는 함수
  function updateTagUI(newTags) {
    tags = Array.isArray(newTags) ? [...newTags] : [];
    if (tagList) {
      tagList.innerHTML = '';
      tags.forEach((tag, idx) => {
        const li = document.createElement('li');
        li.textContent = tag;
        const x = document.createElement('span');
        x.textContent = '×';
        x.className = 'remove-tag';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          tags.splice(idx, 1);
          updateTagUI(tags);
          updateTagsInput(); // Enter 키 눌러 list에 태그 추가 시 입력창 초기화
        });
        li.appendChild(x);
        tagList.appendChild(li);
      });
    }
    updateTagsInput();
    if (tagsInput) {
      tagsInput.placeholder = tags.length === 0 ? '입력 후 Enter로 추가' : '';
    }
    // 태그 UI가 갱신될 때마다 자동 저장
    saveTags(tags);
  }
  // 이벤트 리스너 1: 입력창 키보드 입력 처리
  if (tagsInput && tagList) {
    tagsInput.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;

      const value = tagsInput.value.trim();

      if ((e.key === 'Enter' || e.key === ',') && value) {
        e.preventDefault();
        if (tags.length >= 10) {
          showToastError('태그는 최대 10개까지만 달 수 있습니다');
          updateTagsInput();
          return;
        }
        const cleanValue = value.endsWith(',') ? value.slice(0, -1).trim() : value;
        if (cleanValue && !tags.includes(cleanValue)) {
          tags.push(cleanValue);
          updateTagUI(tags);
        } else {
          updateTagsInput();
        }
      } else if (e.key === 'Backspace' && tagsInput.value === '') {
        if (tags.length > 0) {
          tags.pop();
          updateTagUI(tags);
        }
      }
    });
    // 이벤트 리스너 2: 태그 입력창 클릭 시 포커스 이동
    const container = tagsInput.closest('.tag-input-container');
    if (container) {
      container.addEventListener('click', (e) => {
        if (e.target === container) tagsInput.focus();
      });
    }
    // 이벤트 리스너 3: 태그 입력창 비활성화(바깥 부분 클릭 등) 시 태그 추가
    tagsInput.addEventListener('blur', () => {
      const value = tagsInput.value.trim();
      if (value && tags.length < 10 && !tags.includes(value)) {
        tags.push(value);
        updateTagUI(tags);
      } else if (tags.length >= 10) {
        showToastError('태그는 최대 10개까지만 달 수 있습니다');
        updateTagsInput();
      } else {
        updateTagsInput(); // 중복 태그 입력 시 입력창 초기화
      }
    });
  }

  window.updateTagUI = updateTagUI;
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
    // 단위와 접두사를 안 쓸 경우, 호수만 괄호에 넣어서 표기
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

  // 쪽수 범위 표기 여부
  const pageRangeInclude = document.querySelector('input[name="page-range-include"]')?.checked;
  // 쪽수 범위 구분자
  const pageRangeSeparator = document.querySelector('input[name="page-range-separator"]')?.value || '–';
  // 쪽수 범위 단위
  const pageRangeUnit = document.querySelector('input[name="page-range-unit"]')?.value || '쪽';

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
    journalBracketRight,
    pageRangeInclude, // 유일하게 이것만 불리언
    pageRangeSeparator,
    pageRangeUnit
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
      fillCitation(currentMetadataGlobal); // 탭 1에서는 조합된 인용 표기를 갱신
      renderHistory(); // 탭 2에서는 내역 표를 갱신(툴팁에 제목 구분자가 들어가기 때문)
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
    journalBracketRight: '』',
    pageRangeInclude: false,
    pageRangeSeparator: '–',
    pageRangeUnit: '쪽'
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
    // 쪽수 범위 표기 복원
    document.querySelector('input[name="page-range-include"]').checked = items.pageRangeInclude;
    document.querySelector('input[name="page-range-separator"]').value = items.pageRangeSeparator;
    document.querySelector('input[name="page-range-unit"]').value = items.pageRangeUnit;
  });
}

// 인용 1: 메타데이터와 인용 양식 설정값을 조합해 최종적인 인용(citation)을 도출
function getCombinedCitation(meta, style) {
  // 서브타이틀이 없으면 구분 기호 제거
  const checkedSeparator = meta.title_sub ? style.titleSeparator : '';
  const combinedAuthors = Array.isArray(meta.authors) ? meta.authors.join('·') : meta.authors;
  const hasVol = meta.volume !== '';
  const hasIss = meta.issue !== '';
  let pageRangePart = '';
  if (style.pageRangeInclude) {
    pageRangePart = `, ${meta.page_first}${style.pageRangeSeparator}${meta.page_last}${style.pageRangeUnit}`;
  }
  let combinedCitation = '';
  // 권수와 호수 둘 다 있을 경우
  if (hasVol && hasIss) {
    combinedCitation = `${combinedAuthors}, ${style.titleBracketLeft}${meta.title_main}${checkedSeparator}${meta.title_sub}${style.titleBracketRight}, ${style.journalBracketLeft}${meta.journal_name}${style.journalBracketRight} ${style.volumePrefix}${meta.volume}${style.volumeSuffix}${style.volumeIssueSeparator}${style.issuePrefix}${meta.issue}${style.issueSuffix}, ${meta.publisher}, ${meta.year}${pageRangePart}.`;
  // 권수와 호수 둘 중 하나만 있을 경우
  } else if (hasVol || hasIss) {
    combinedCitation = `${combinedAuthors}, ${style.titleBracketLeft}${meta.title_main}${checkedSeparator}${meta.title_sub}${style.titleBracketRight}, ${style.journalBracketLeft}${meta.journal_name}${style.journalBracketRight} ${style.eitherPrefix}${meta.volume}${meta.issue}${style.eitherSuffix}, ${meta.publisher}, ${meta.year}${pageRangePart}.`;
  } else {
    // 학술지명 값이 비어 있을 경우(학위논문일 경우 등) 학술지명 부분 전체를 제거 ("『』, "이 나타나지 않도록)
    if (!meta.journal_name) {
      combinedCitation = `${combinedAuthors}, ${style.titleBracketLeft}${meta.title_main}${checkedSeparator}${meta.title_sub}${style.titleBracketRight}, ${meta.publisher}, ${meta.year}${pageRangePart}.`;
    } else {
      combinedCitation = `${combinedAuthors}, ${style.titleBracketLeft}${meta.title_main}${checkedSeparator}${meta.title_sub}${style.titleBracketRight}, ${style.journalBracketLeft}${meta.journal_name}${style.journalBracketRight}, ${meta.publisher}, ${meta.year}${pageRangePart}.`;
    }
  }
  return combinedCitation;
}

// 인용 2: 탭1 우측 textarea에 조합된 citation을 삽입 -> 이벤트 리스너가 있는 다른 함수에서 호출
function fillCitation(meta) {
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

// 히스토리 1: 히스토리에 pageInfo 추가(저장)
function savePageInfoToHistory(pageInfo) {
  chrome.storage.local.get({ history: [] }, items => {
    const merged = items.history.concat(pageInfo);
    // 같은 논문인지 판별하는 함수
    function isSameArticle(a, b) {
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
        isSameArticle(u.metadata, item.metadata)
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
          // 메타데이터와 projectTags를 모두 검색 대상에 포함
          const metaValues = Object.values(item.metadata).flatMap(v => Array.isArray(v) ? v : [v]);
          const tagValues = Array.isArray(item.projectTags) ? item.projectTags : [];
          const haystack = [...metaValues, ...tagValues].join(' ').toLowerCase();
          return terms.every(term => haystack.includes(term));
        })
      : rawHistory;
    // 체크박스 상태에 따라 중복 처리 분기
    const isDedup = document.getElementById('deduplicate')?.checked;
    const history = isDedup
      ? deduplicateHistory(baseHistory)        // timestamp 제외 기준 중복 제거
      : deduplicateFullHistory(baseHistory);   // 전체 필드 기준 중복 제거 (timestamp 포함)
    // timestampId 기준 내림차순 정렬 (밀리초 단위 정확도)
    history.sort((a, b) => b.timestampId - a.timestampId);
    const container = document.getElementById('history-list');
    if (!container) return;
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.maxHeight = '500px';   // 최대 높이를 500px로 제한
    container.style.overflowY  = 'auto';   // 넘칠 때 세로 스크롤 활성화
    container.style.minHeight = '300px';   // 최소 높이
    container.style.paddingBottom = '20px';   // 체크박스 뒤로 내용이 스크롤되지 않도록 여유 공간 확보
    const table = document.createElement('table');
    table.style.border = 'none';
    table.style.width = '100%';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['저자','논문 제목','태그','학술 DB','추출 일시'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.border = 'none';
      th.style.textAlign = 'left';
      th.style.padding = '6px';
      headerRow.appendChild(th);
    });
    // 삭제 컬럼 헤더
    const thDel = document.createElement('th');
    thDel.style.border = 'none';
    thDel.style.padding = '6px';
    thDel.textContent = ''; // 아이콘용 빈 헤더
    headerRow.appendChild(thDel);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    history.forEach(item => {
      const tr = document.createElement('tr');
      tr.style.border = 'none';
      // 저자 표시 규칙 수정: 공저자일 때 처음 1명 + ' 외'
      const authorsArray = Array.isArray(item.metadata.authors) ? item.metadata.authors : item.metadata.authors ? [item.metadata.authors] : [];
      let authorText = '';
      if (authorsArray.length >= 2) {
        authorText = authorsArray[0] + ' 외';
      } else {
        authorText = authorsArray.join(', ');
      }
      // 제목 정보 불러오기
      const titleMain = item.metadata.title_main || ''; // 표에서는 이것만 씀
      const titleSub = item.metadata.title_sub || '';
      const styleSettings = getStyleSettings();
      const checkedSeparator = item.metadata.title_sub ? styleSettings.titleSeparator : '';
      const fullTitle = `${titleMain}${checkedSeparator}${titleSub}`; // 툴팁용
      ['author', 'title', 'tag', 'db', 'time'].forEach((_, idx) => {
        const td = document.createElement('td');
        td.style.border = 'none';
        td.style.padding = '6px';
        // 제1열: 저자
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
            try {
              fillMetadataField(item.metadata);
              currentTimestampIdGlobal = item.timestampId;
              loadProjectTags(); // 태그 로딩 추가
            } catch (err) {
              console.error('fillMetadataField error:', err);
              showToastError('서지정보 내역에서 해당 논문의 서지정보를 불러오지 못했습니다');
              return;
            }
            updateCurrentMetadata(currentMetadataGlobal); // 사용자가 직접 수정 시 즉각 currentMetadataGlobal에 업데이트됨
            fillCitation(currentMetadataGlobal);
          });
        // 제2열: 제목
        } else if (idx === 1) {
          // 제목 셀: line-clamp 적용을 위한 div 래퍼 생성
          const titleDiv = document.createElement('div');
          titleDiv.className = 'clamp-title';
          titleDiv.textContent = titleMain;
          td.appendChild(titleDiv);
          td.title = fullTitle; //툴팁(기본) 툴팁에서는 전체 제목을 보여줌
          td.dataset.tooltip = titleMain;
          // 클릭 시 탭1으로 전환 후 데이터 채우기
          td.style.cursor = 'pointer';
          td.addEventListener('click', () => {
            const tab1Btn = document.querySelector('.tab-btn[data-tab="tab1"]');
            if (tab1Btn) tab1Btn.click();
            currentMetadataGlobal = item.metadata;
            try {
              fillMetadataField(item.metadata);
              currentTimestampIdGlobal = item.timestampId;
              loadProjectTags(); // 태그 로딩 추가
            } catch (err) {
              console.error('fillMetadataField error:', err);
              showToastError('서지정보 내역에서 해당 논문의 서지정보를 불러오지 못했습니다');
              return;
            }
            updateCurrentMetadata(currentMetadataGlobal); // 사용자가 직접 수정 시 즉각 currentMetadataGlobal에 업데이트됨
            fillCitation(currentMetadataGlobal);
          });
        // 제3열: 태그
        } else if (idx === 2) {
          const tagsArray = Array.isArray(item.projectTags) ? item.projectTags : [];
          td.innerHTML = '';
          if (tagsArray.length > 0) {
            // 첫 번째 태그만 표시 (최대 8자 + …)
            const firstTag = document.createElement('span');
            firstTag.className = 'history-tag-chip';
            const raw = tagsArray[0];
            const truncated = raw.length > 8 ? raw.slice(0, 8) + '…' : raw;
            firstTag.textContent = truncated;

            // 태그 배지용 wrapper div 추가
            const tagWrapper = document.createElement('div');
            tagWrapper.style.position = 'relative';
            tagWrapper.style.display = 'inline-block';
            tagWrapper.appendChild(firstTag);

            if (tagsArray.length > 1) {
              const badge = document.createElement('span');
              badge.className = 'tag-badge';
              badge.textContent = `+${tagsArray.length - 1}`;
              tagWrapper.appendChild(badge);
            }

            td.appendChild(tagWrapper);
            td.title = tagsArray.join(', ');
          } else {
            td.textContent = '';
            td.title = '태그 없음';
          }
          td.style.color = tagsArray.length > 0 ? 'var(--accent)' : 'var(--text-secondary)';
          td.style.fontSize = '12px';
          td.style.cursor = 'pointer';
          // 클릭 시 탭1으로 전환 후 데이터 채우기 (다른 열과 동일한 동작)
          td.addEventListener('click', () => {
            const tab1Btn = document.querySelector('.tab-btn[data-tab="tab1"]');
            if (tab1Btn) tab1Btn.click();
            currentMetadataGlobal = item.metadata;
            try {
              fillMetadataField(item.metadata);
              currentTimestampIdGlobal = item.timestampId;
              loadProjectTags(); // 태그 로딩 추가
            } catch (err) {
              console.error('fillMetadataField error:', err);
              showToastError('서지정보 내역에서 해당 논문의 서지정보를 불러오지 못했습니다');
              return;
            }
            updateCurrentMetadata(currentMetadataGlobal);
            fillCitation(currentMetadataGlobal);
          });
        // 제4열: 학술 DB
        } else if (idx === 3) {
          const a = document.createElement('a');
          a.href = item.url;
          a.textContent = item.academicDB;
          a.target = '_blank';
          a.title = '검색 결과 페이지 바로가기'; //툴팁(기본)
          td.appendChild(a);
        //제5열: 추출 일시
        } else if (idx === 4) {
          // 분 단위까지만 표시 (초 단위 제거)
          td.textContent = item.timestamp.slice(0, item.timestamp.lastIndexOf(':'));
        }
        tr.appendChild(td);
      });
      // 삭제 버튼 셀
      const tdDel = document.createElement('td');
      tdDel.style.border = 'none';
      tdDel.style.padding = '6px';
      const btn = document.createElement('button');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" alt="삭제" width="14" height="14" style="color: var(--text-secondary)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
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
          '프로젝트 태그': Array.isArray(item.projectTags) ? item.projectTags.join(', ') : (item.projectTags || ''),
          '국문 초록': item.metadata.abstract || '',
          '조합된 인용 표기': getCombinedCitation(item.metadata, getStyleSettings()),
          '검색한 학술 DB': item.academicDB,
          'URL': item.url,
          '검색(추출) 일시': item.timestamp
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        // 열 너비 설정 (wch: 문자 수 기반 너비)
        ws['!cols'] = [
          { wch: 10 }, // 저자
          { wch: 35 }, // 본제목
          { wch: 35 }, // 부제목
          { wch: 15 }, // 학술지명
          { wch: 5 }, // 권수
          { wch: 5 }, // 호수
          { wch: 15 }, // 발행기관
          { wch: 5 }, // 연도
          { wch: 7 }, // 첫 페이지
          { wch: 7 }, // 마지막 페이지
          { wch: 35 }, // 키워드
          { wch: 15 }, // 프로젝트 태그
          { wch: 35 }, // 국문 초록
          { wch: 100 }, // 조합된 인용 표기
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

// DOM이 로드되는 것을 리슨하여,
document.addEventListener('DOMContentLoaded', () => {
  // 1. 저장된 인용 양식 설정값을 불러와 탭3 재구성하기.
  restoreStyleSettings();
  // 2. 실행 시마다 pageInfo를 history에 저장
  requestPageInfo()
    .then(pageInfo => {
      currentTimestampIdGlobal = pageInfo.timestampId; // 추출한 정보 중 타임스탬프ID를 전역변수에 저장
      savePageInfoToHistory(pageInfo); // 추출한 정보를 히스토리에 저장
      syncTagsFromDuplicate(pageInfo); // 이미 저장된 논문이면 알림을 띄우고 태그 UI 자동 채움
    })
    .catch(err => console.log('히스토리 저장 실패.', err));
  // 3. 메타데이터 불러오고 탭1의 각 필드에 넣기(recievedMetadata). 직접 수정 발생 시 이를 업데이트하기. 조합된 인용 표기 채워 넣기.
  fetchCurrentMetadata()
    .then(currentMetadata => {
      currentMetadataGlobal = currentMetadata || {};
      fillCitation(currentMetadataGlobal);
      loadProjectTags();
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
  downloadHistory();

  // 태그 UI 초기화 함수 호출
  initializeTagInput();

  // Windows인 경우에만 스크롤바 설정을 적용
  if (navigator.platform.startsWith('Win')) {
    const scrollTargets = [
      '#tab1 .left-pane .metadata-container',
      '#tab1 .right-pane .citation-input',
      '#tab1 .right-pane .tag-input-container',
      '#tab2 #history-list',
      '#tab3-scroll-area'
    ];

    scrollTargets.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        el.classList.add('win-scrollbar', 'hide-scrollbar');
        let timeoutId;
        el.addEventListener('scroll', () => {
          el.classList.add('show-scrollbar');
          el.classList.remove('hide-scrollbar');
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            el.classList.remove('show-scrollbar');
            el.classList.add('hide-scrollbar');
          }, 1000);
        });
      }
    });
    
    const tagList = document.getElementById('tag-list');
    if (tagList) {
      const container = tagList.closest('.tag-input-container');
      if (container) {
        const currentTags = Array.from(tagList.querySelectorAll('li')).filter(li => li.textContent.trim() !== '');
        container.classList.toggle('filled', currentTags.length > 0);
      }
    }
  }
});