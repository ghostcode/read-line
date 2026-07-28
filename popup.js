// popup.js — Read-Line 设置弹窗逻辑

const COLORS = [
  "#44bd32", "#2ecc71", "#1abc9c", "#3498db",
  "#9b59b6", "#e74c3c", "#e67e22", "#f1c40f",
  "#ffffff", "#000000",
];

const lineTypeList = document.getElementById("lineTypeList");
const colorList = document.getElementById("colorList");
const toggleEl = document.getElementById("toggle");
const thicknessEl = document.getElementById("thickness");
const thicknessVal = document.getElementById("thicknessVal");
const currentSiteEl = document.getElementById("currentSite");
const blToggleBtn = document.getElementById("blToggleBtn");
const blListEl = document.getElementById("blList");
const modeBlacklistBtn = document.getElementById("modeBlacklist");
const modeWhitelistBtn = document.getElementById("modeWhitelist");
const modeDescEl = document.getElementById("modeDesc");
const listTitleEl = document.getElementById("listTitle");

let currentSettings = {
  enabled: true,
  color: "#44bd32",
  thickness: 2,
  lineType: "solid",
  mode: "blacklist",
};
let blacklist = [];
let whitelist = [];
let currentHostname = "";

// ========== 获取当前标签页 ==========
function getActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    callback(tabs[0]);
  });
}

// ========== 提取 hostname ==========
function getHostname(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

// ========== 从 activeTab 获取当前 hostname（优先），失败时回退到 content script ==========
function getCurrentHostname(callback) {
  getActiveTab((tab) => {
    if (!tab?.id) { callback(""); return; }

    // 优先：activeTab 权限下 tab.url 可用
    const host = getHostname(tab?.url || tab?.pendingUrl || "");
    if (host) { callback(host); return; }

    // 回退：向 content script 发消息
    chrome.tabs.sendMessage(
      tab.id,
      { type: "getHostname" },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.hostname) {
          callback("");
        } else {
          callback(response.hostname);
        }
      }
    );
  });
}

// ========== 向 content script 同步设置 ==========
function notifyContentScript() {
  getActiveTab((tab) => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(
      tab.id,
      { type: "applySettings", ...currentSettings },
      () => { if (chrome.runtime.lastError) return; }
    );
  });
}

// ========== 保存设置并同步 ==========
function saveAndNotify() {
  chrome.storage.sync.set(currentSettings);
  notifyContentScript();
}

// ========== 加载名单 ==========
function loadLists(callback) {
  chrome.storage.sync.get({ blacklist: [], whitelist: [] }, (items) => {
    blacklist = items.blacklist;
    whitelist = items.whitelist;
    if (callback) callback();
  });
}

// ========== 保存名单 ==========
function saveList(type) {
  chrome.storage.sync.set({
    [type]: type === "blacklist" ? blacklist : whitelist,
  });
}

// ========== 获取当前模式对应的名单 ==========
function currentList() {
  return currentSettings.mode === "blacklist" ? blacklist : whitelist;
}

// ========== 检查当前网站是否在当前模式的名单中 ==========
function isCurrentSiteInList() {
  return currentList().includes(currentHostname);
}

// ========== 渲染名单列表 ==========
function renderList() {
  const list = currentList();
  blListEl.innerHTML = "";
  if (list.length === 0) {
    const emptyText = currentSettings.mode === "blacklist"
      ? "暂无黑名单网站（所有网站默认显示阅读线）"
      : "暂无白名单网站（所有网站默认不显示阅读线）";
    blListEl.innerHTML = `<div class="bl-empty">${emptyText}</div>`;
    return;
  }
  list.forEach((host) => {
    const item = document.createElement("div");
    item.className = "bl-item";
    item.innerHTML = `<span>${host}</span><button class="bl-remove" data-host="${host}">×</button>`;
    blListEl.appendChild(item);
  });

  // 删除按钮事件
  blListEl.querySelectorAll(".bl-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const host = btn.dataset.host;
      if (currentSettings.mode === "blacklist") {
        blacklist = blacklist.filter((h) => h !== host);
      } else {
        whitelist = whitelist.filter((h) => h !== host);
      }
      saveList(currentSettings.mode);
      renderList();
      updateListToggleBtn();
    });
  });
}

// ========== 更新名单按钮文案和样式 ==========
function updateListToggleBtn() {
  if (!currentHostname) {
    blToggleBtn.textContent = "当前页面不支持";
    blToggleBtn.disabled = true;
    blToggleBtn.classList.remove("is-on");
    return;
  }
  blToggleBtn.disabled = false;
  if (currentSettings.mode === "blacklist") {
    if (isCurrentSiteInList()) {
      blToggleBtn.textContent = `移出黑名单（${currentHostname}）`;
      blToggleBtn.classList.add("is-on");
    } else {
      blToggleBtn.textContent = `添加到黑名单（${currentHostname}）`;
      blToggleBtn.classList.remove("is-on");
    }
  } else {
    // whitelist 模式
    if (isCurrentSiteInList()) {
      blToggleBtn.textContent = `移出白名单（${currentHostname}）`;
      blToggleBtn.classList.add("is-on");
    } else {
      blToggleBtn.textContent = `添加到白名单（${currentHostname}）`;
      blToggleBtn.classList.remove("is-on");
    }
  }
}

// ========== 更新名单区域标题 ==========
function updateListSectionTitle() {
  listTitleEl.textContent = currentSettings.mode === "blacklist"
    ? "不显示辅助线的网站"
    : "显示辅助线的网站";
}

// ========== 更新模式描述 ==========
function updateModeDesc() {
  modeDescEl.textContent = currentSettings.mode === "blacklist"
    ? "默认所有网站显示阅读线，名单内的不显示"
    : "默认所有网站不显示阅读线，名单内的才显示";
}

// ========== 渲染模式按钮高亮 ==========
function renderModeButtons() {
  modeBlacklistBtn.classList.toggle("active", currentSettings.mode === "blacklist");
  modeWhitelistBtn.classList.toggle("active", currentSettings.mode === "whitelist");
}

// ========== 加载设置并渲染 UI ==========
function loadSettings() {
  chrome.storage.sync.get(
    {
      enabled: true,
      color: "#44bd32",
      thickness: 2,
      lineType: "solid",
      mode: "blacklist",
    },
    (items) => {
      currentSettings = items;
      toggleEl.checked = currentSettings.enabled;
      thicknessEl.value = currentSettings.thickness;
      thicknessVal.textContent = currentSettings.thickness;
      renderColors();
      renderLineTypes();
      renderModeButtons();
      updateModeDesc();
      updateListSectionTitle();
    }
  );
}

// ========== 渲染颜色按钮 ==========
function renderColors() {
  colorList.innerHTML = "";
  COLORS.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "color-btn";
    btn.style.background = c;
    if (c === "#ffffff") btn.style.border = "2px solid #ccc";
    if (c === currentSettings.color) btn.classList.add("active");
    btn.addEventListener("click", () => {
      currentSettings.color = c;
      saveAndNotify();
      renderColors();
    });
    colorList.appendChild(btn);
  });
}

// ========== 渲染线型按钮 ==========
function renderLineTypes() {
  const buttons = lineTypeList.querySelectorAll(".lt-btn");
  buttons.forEach((btn) => {
    const type = btn.dataset.type;
    btn.classList.toggle("active", type === currentSettings.lineType);
  });
}

// ========== 线型按钮事件（事件委托）==========
lineTypeList.addEventListener("click", (e) => {
  const btn = e.target.closest(".lt-btn");
  if (!btn) return;
  currentSettings.lineType = btn.dataset.type;
  saveAndNotify();
  renderLineTypes();
});

// ========== 事件绑定 ==========
toggleEl.addEventListener("change", () => {
  currentSettings.enabled = toggleEl.checked;
  saveAndNotify();
});

thicknessEl.addEventListener("input", () => {
  currentSettings.thickness = parseInt(thicknessEl.value, 10);
  thicknessVal.textContent = currentSettings.thickness;
  saveAndNotify();
});

// ========== 模式切换事件 ==========
modeBlacklistBtn.addEventListener("click", () => {
  if (currentSettings.mode === "blacklist") return;
  currentSettings.mode = "blacklist";
  saveAndNotify();
  renderModeButtons();
  updateModeDesc();
  updateListSectionTitle();
  renderList();
  updateListToggleBtn();
});

modeWhitelistBtn.addEventListener("click", () => {
  if (currentSettings.mode === "whitelist") return;
  currentSettings.mode = "whitelist";
  saveAndNotify();
  renderModeButtons();
  updateModeDesc();
  updateListSectionTitle();
  renderList();
  updateListToggleBtn();
});

// ========== 名单按钮事件 ==========
blToggleBtn.addEventListener("click", () => {
  if (!currentHostname) return;
  if (isCurrentSiteInList()) {
    // 移出名单
    if (currentSettings.mode === "blacklist") {
      blacklist = blacklist.filter((h) => h !== currentHostname);
    } else {
      whitelist = whitelist.filter((h) => h !== currentHostname);
    }
  } else {
    // 加入名单
    if (currentSettings.mode === "blacklist") {
      blacklist.push(currentHostname);
    } else {
      whitelist.push(currentHostname);
    }
  }
  saveList(currentSettings.mode);
  renderList();
  updateListToggleBtn();
});

// ========== 启动 ==========
getCurrentHostname((hostname) => {
  currentHostname = hostname;
  currentSiteEl.textContent = currentHostname
    ? `当前网站：${currentHostname}`
    : "当前页面不支持（如 chrome:// 内部页面）";

  loadSettings();
  loadLists(() => {
    renderList();
    updateListToggleBtn();
  });
});
