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

let currentSettings = {
  enabled: true,
  color: "#44bd32",
  thickness: 2,
  lineType: "solid",
};
let blacklist = [];
let currentHostname = "";

// ========== 获取当前标签页 ==========
function getActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    callback(tabs[0]);
  });
}

// ========== 从 content script 获取当前 hostname ==========
function getCurrentHostname(callback) {
  getActiveTab((tab) => {
    if (!tab?.id) {
      callback("");
      return;
    }
    // 向 content script 请求 hostname（不需要 tabs 权限）
    chrome.tabs.sendMessage(
      tab.id,
      { type: "getHostname" },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.hostname) {
          // content script 未注入该页面（如 chrome://），无法识别
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

// ========== 加载黑名单 ==========
function loadBlacklist(callback) {
  chrome.storage.sync.get({ blacklist: [] }, (items) => {
    blacklist = items.blacklist;
    if (callback) callback();
  });
}

// ========== 保存黑名单 ==========
function saveBlacklist() {
  chrome.storage.sync.set({ blacklist });
}

// ========== 检查当前网站是否在黑名单 ==========
function isCurrentSiteBlacklisted() {
  return blacklist.includes(currentHostname);
}

// ========== 渲染黑名单列表 ==========
function renderBlacklist() {
  blListEl.innerHTML = "";
  if (blacklist.length === 0) {
    blListEl.innerHTML = '<div class="bl-empty">暂无隐藏辅助线的网站</div>';
    return;
  }
  blacklist.forEach((host) => {
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
      blacklist = blacklist.filter((h) => h !== host);
      saveBlacklist();
      renderBlacklist();
      updateBlToggleBtn();
      // storage 监听会自动通知各标签页，无需单独发消息
    });
  });
}

// ========== 更新隐藏/显示按钮文案和样式 ==========
function updateBlToggleBtn() {
  if (!currentHostname) {
    blToggleBtn.textContent = "当前页面不支持";
    blToggleBtn.disabled = true;
    blToggleBtn.classList.remove("is-on");
    return;
  }
  blToggleBtn.disabled = false;
  if (isCurrentSiteBlacklisted()) {
    blToggleBtn.textContent = "在此网站显示辅助线";
    blToggleBtn.classList.add("is-on");
  } else {
    blToggleBtn.textContent = "在此网站隐藏辅助线";
    blToggleBtn.classList.remove("is-on");
  }
}

// ========== 加载设置并渲染 UI ==========
function loadSettings() {
  chrome.storage.sync.get(
    { enabled: true, color: "#44bd32", thickness: 2, lineType: "solid" },
    (items) => {
      currentSettings = items;
      toggleEl.checked = currentSettings.enabled;
      thicknessEl.value = currentSettings.thickness;
      thicknessVal.textContent = currentSettings.thickness;
      renderColors();
      renderLineTypes();
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

// ========== 黑名单按钮事件 ==========
blToggleBtn.addEventListener("click", () => {
  if (!currentHostname) return;
  if (isCurrentSiteBlacklisted()) {
    blacklist = blacklist.filter((h) => h !== currentHostname);
  } else {
    blacklist.push(currentHostname);
  }
  saveBlacklist();
  renderBlacklist();
  updateBlToggleBtn();
  // 不再发 applySettings，让 content.js 通过 storage 监听自动响应
});

// ========== 启动 ==========
// 先通过 content script 获取当前网站 hostname，再加载设置和黑名单
getCurrentHostname((hostname) => {
  currentHostname = hostname;
  currentSiteEl.textContent = currentHostname
    ? `当前网站：${currentHostname}`
    : "当前页面不支持（如 chrome:// 内部页面）";

  loadSettings();
  loadBlacklist(() => {
    renderBlacklist();
    updateBlToggleBtn();
  });
});
