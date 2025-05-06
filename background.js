chrome.commands.onCommand.addListener(command => {
  if (command === 'open-extension-popup') {
    // Manifest V3: action.openPopup()으로 팝업 강제 오픈
    chrome.action.openPopup().catch(err => {
      console.error('팝업 열기 실패:', err);
    });
  }
});