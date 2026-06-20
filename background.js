importScripts("filename_tools.js");

const extensionBrowser = globalThis.browser;
const extensionChrome = globalThis.chrome;
const fileNaming = globalThis.SickleCiteFileNaming;
const pendingContexts = [];
const CONTEXT_TTL_MS = 30 * 60 * 1000;
const MAX_CONTEXTS = 30;

function getRuntimeErrorMessage() {
  return extensionChrome?.runtime?.lastError?.message || "";
}

function storageSyncGet(query, callback) {
  const area = extensionBrowser?.storage?.sync
    ?? extensionBrowser?.storage?.local
    ?? extensionChrome?.storage?.sync
    ?? extensionChrome?.storage?.local;

  if (!area) {
    callback(typeof query === "object" && !Array.isArray(query) ? { ...query } : {});
    return;
  }

  if (area === extensionBrowser?.storage?.sync || area === extensionBrowser?.storage?.local) {
    area.get(query).then(callback).catch(() => {
      callback(typeof query === "object" && !Array.isArray(query) ? { ...query } : {});
    });
    return;
  }

  area.get(query, items => {
    if (getRuntimeErrorMessage()) {
      callback(typeof query === "object" && !Array.isArray(query) ? { ...query } : {});
      return;
    }
    callback(items || {});
  });
}

function cleanupContexts(now = Date.now()) {
  for (let index = pendingContexts.length - 1; index >= 0; index -= 1) {
    const entry = pendingContexts[index];
    if (!entry || !entry.context || now - entry.context.capturedAt > CONTEXT_TTL_MS) {
      pendingContexts.splice(index, 1);
    }
  }
  while (pendingContexts.length > MAX_CONTEXTS) {
    pendingContexts.shift();
  }
}

function hasUsefulContext(context) {
  if (!context || !fileNaming.isAllowedUrl(context.pageUrl || context.downloadUrl)) {
    return false;
  }
  if (context.kind === "report") {
    const report = context.report || {};
    return Boolean(report.reportTitle || report.originalFilename || report.fileTitle);
  }
  const meta = context.metadata || {};
  const authors = Array.isArray(meta.authors) ? meta.authors : [];
  return Boolean(meta.title_main || authors.length || meta.journal_name || meta.publisher || meta.year);
}

function rememberContext(context, sender) {
  if (!hasUsefulContext(context)) return;
  const tabId = sender?.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : -1;
  const frameId = sender && Number.isInteger(sender.frameId) ? sender.frameId : 0;
  const next = Object.assign({}, context, {
    capturedAt: Number(context.capturedAt) || Date.now()
  });
  pendingContexts.push({ context: next, tabId, frameId });
  cleanupContexts();
}

function downloadValues(item) {
  return [
    item && item.url,
    item && item.finalUrl,
    item && item.referrer,
    item && item.tabUrl,
    item && item.filename
  ].map(value => fileNaming.normalizeUrl(value || ""));
}

function basename(value) {
  return fileNaming.filenameFromUrl(value || "");
}

function contextScore(entry, downloadItem, now) {
  if (!entry || !entry.context || !downloadItem) return 0;
  const context = entry.context;
  const itemUrl = fileNaming.normalizeUrl(downloadItem.finalUrl || downloadItem.url || "");
  const itemReferrer = fileNaming.normalizeUrl(downloadItem.referrer || downloadItem.tabUrl || "");
  const contextUrl = fileNaming.normalizeUrl(context.downloadUrl || "");
  const pageUrl = fileNaming.normalizeUrl(context.pageUrl || "");
  const age = now - context.capturedAt;
  const sameTab = Number.isInteger(downloadItem.tabId) && downloadItem.tabId >= 0 && entry.tabId === downloadItem.tabId;
  let score = 0;

  if (sameTab) score += 8;
  if (contextUrl && itemUrl && (itemUrl === contextUrl || itemUrl.includes(contextUrl) || contextUrl.includes(itemUrl))) score += 8;
  if (pageUrl && itemReferrer && (itemReferrer === pageUrl || itemReferrer.includes(pageUrl) || pageUrl.includes(itemReferrer))) score += 6;
  if (contextUrl && itemUrl && basename(contextUrl) && itemUrl.includes(basename(contextUrl))) score += 4;
  if (age >= 0 && age < 5000) score += 4;
  else if (age >= 0 && age < CONTEXT_TTL_MS) score += 1;

  return score;
}

function chooseContext(downloadItem) {
  const now = Date.now();
  cleanupContexts(now);
  let best = null;
  pendingContexts.forEach(entry => {
    const score = contextScore(entry, downloadItem, now);
    if (!best || score > best.score || (score === best.score && entry.context.capturedAt > best.entry.context.capturedAt)) {
      best = { entry, score };
    }
  });

  if ((!best || best.score < 3) && pendingContexts.length === 1) {
    const only = pendingContexts[0];
    if (now - only.context.capturedAt < 5000) {
      best = { entry: only, score: best ? best.score : 3 };
    }
  }

  if (!best || best.score < 3) return null;
  const [entry] = pendingContexts.splice(pendingContexts.indexOf(best.entry), 1);
  return entry || best.entry;
}

function getDownloadsApi() {
  return extensionBrowser?.downloads ?? extensionChrome?.downloads;
}

function registerRuntimeListeners() {
  const runtime = extensionBrowser?.runtime ?? extensionChrome?.runtime;
  if (!runtime?.onMessage) return;

  runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== fileNaming.DOWNLOAD_CONTEXT_MESSAGE) {
      return false;
    }

    storageSyncGet({ [fileNaming.PDF_FILENAME_ENABLED_KEY]: true }, items => {
      if (fileNaming.isPdfFilenameEnabled(items)) {
        rememberContext(message.context, sender);
      }
      if (typeof sendResponse === "function") {
        sendResponse({ success: true });
      }
    });
    return true;
  });
}

function registerDownloadListener() {
  const downloads = getDownloadsApi();
  if (!downloads?.onDeterminingFilename?.addListener) return;

  downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    if (!fileNaming.isAllowedDownloadItem(downloadItem)) {
      return false;
    }

    storageSyncGet(null, settings => {
      if (!fileNaming.isPdfFilenameEnabled(settings)) {
        suggest();
        return;
      }

      const entry = chooseContext(downloadItem);
      if (!entry || !entry.context) {
        suggest();
        return;
      }

      const filename = fileNaming.renderFilename(entry.context, settings);
      if (!filename) {
        suggest();
        return;
      }

      suggest({
        filename,
        conflictAction: "uniquify"
      });
    });
    return true;
  });
}

registerRuntimeListeners();
registerDownloadListener();
