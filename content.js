/**
 * Read-Line — 网页阅读辅助线
 * 支持实线、虚线、波浪线三种类型
 * 支持网站黑名单
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  color: "#44bd32",
  thickness: 2,
  lineType: "solid",   // "solid" | "dashed" | "wavy"
};

let settings = { ...DEFAULT_SETTINGS };
let blacklist = [];
let svgEl = null;   // 外层 SVG（固定定位，覆盖视口）
let gEl = null;      // 内层 <g>，由 transform 控制 Y 偏移
let lineEl = null;   // <line> 元素（solid / dashed 共用）
let pathEl = null;   // <path> 元素（wavy）
let rafId = null;
let mouseY = 0;
let currentHostname = "";

const WAVE_SEG = 20;   // 波浪每段宽度（px）
const WAVE_AMP = 3;    // 波浪振幅（px）

// ========== 获取当前 hostname ==========
function getHostname() {
  try { return new URL(location.href).hostname; } catch { return ""; }
}

// ========== 检查当前网站是否在黑名单 ==========
function isBlacklisted() {
  return blacklist.includes(currentHostname);
}

// ========== 加载设置 ==========
function loadSettings(callback) {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      settings = { ...DEFAULT_SETTINGS, ...items };
      if (callback) callback();
    });
  } else {
    if (callback) callback();
  }
}

// ========== 加载黑名单 ==========
function loadBlacklist(callback) {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.sync.get({ blacklist: [] }, (items) => {
      blacklist = items.blacklist;
      if (callback) callback();
    });
  } else {
    if (callback) callback();
  }
}

// ========== 保存设置 ==========
function saveSettings() {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.sync.set(settings);
  }
}

// ========== 生成波浪路径（相对于 y=0，跨满视口宽度）==========
function makeWavyPath() {
  const w = Math.ceil(window.innerWidth / WAVE_SEG) * WAVE_SEG + WAVE_SEG;
  let d = `M 0 0`;
  for (let x = 0; x < w; x += WAVE_SEG) {
    const cx = x + WAVE_SEG / 2;
    const cy = (Math.floor(x / WAVE_SEG) % 2 === 0) ? -WAVE_AMP : WAVE_AMP;
    const ex = x + WAVE_SEG;
    d += ` Q ${cx} ${cy} ${ex} 0`;
  }
  return d;
}

// ========== 创建 SVG 阅读线（只执行一次）==========
function createLine() {
  svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("width", "100%");
  svgEl.setAttribute("height", "100vh");
  svgEl.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100vh;" +
    "z-index:999;pointer-events:none;overflow:visible;";

  gEl = document.createElementNS("http://www.w3.org/2000/svg", "g");
  gEl.setAttribute("transform", "translate(0,0)");
  svgEl.appendChild(gEl);

  // <line>：实线 / 虚线共用
  lineEl = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineEl.setAttribute("x1", "0");
  lineEl.setAttribute("y1", "0");
  lineEl.setAttribute("x2", "100%");
  lineEl.setAttribute("y2", "0");
  lineEl.setAttribute("stroke-linecap", "round");
  gEl.appendChild(lineEl);

  // <path>：波浪线
  pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathEl.setAttribute("d", makeWavyPath());
  pathEl.setAttribute("fill", "none");
  gEl.appendChild(pathEl);

  applyLineStyles();
  document.body.appendChild(svgEl);
}

// ========== 应用样式（颜色、线宽、线型、显隐）==========
function applyLineStyles() {
  if (!lineEl || !pathEl || !svgEl) return;

  const blacklisted = isBlacklisted();
  svgEl.style.display = (settings.enabled && !blacklisted) ? "" : "none";

  if (settings.lineType === "solid" || settings.lineType === "dashed") {
    lineEl.style.display = "";
    pathEl.style.display = "none";
    lineEl.setAttribute("stroke", settings.color);
    lineEl.setAttribute("stroke-width", settings.thickness);
    lineEl.setAttribute(
      "stroke-dasharray",
      settings.lineType === "dashed"
        ? `${settings.thickness * 4} ${settings.thickness * 2}`
        : "none"
    );
  } else {
    lineEl.style.display = "none";
    pathEl.style.display = "";
    pathEl.setAttribute("stroke", settings.color);
    pathEl.setAttribute("stroke-width", settings.thickness);
  }
}

// ========== 更新位置 ==========
function updateLinePosition() {
  if (!gEl) return;
  gEl.setAttribute("transform", `translate(0, ${mouseY - 10})`);
  rafId = null;
}

function scheduleUpdate() {
  if (!settings.enabled || isBlacklisted() || rafId) return;
  rafId = requestAnimationFrame(updateLinePosition);
}

// ========== 窗口 resize ==========
function onResize() {
  if (pathEl && settings.lineType === "wavy") {
    pathEl.setAttribute("d", makeWavyPath());
  }
}

// ========== 初始化 ==========
function init() {
  currentHostname = getHostname();

  loadSettings(() => {
    loadBlacklist(() => {
      createLine();

      document.addEventListener("mousemove", (e) => {
        mouseY = e.clientY;
        scheduleUpdate();
      });

      window.addEventListener("resize", onResize);
      scheduleUpdate();
    });
  });

  // 监听 storage 变化：黑名单或设置变更时实时响应
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;

      if (changes.blacklist) {
        blacklist = changes.blacklist.newValue || [];
        applyLineStyles();
        if (settings.enabled && !isBlacklisted()) scheduleUpdate();
      }

      if (changes.enabled) {
        settings.enabled = changes.enabled.newValue;
        applyLineStyles();
        if (settings.enabled && !isBlacklisted()) scheduleUpdate();
      }
      if (changes.color) {
        settings.color = changes.color.newValue;
        applyLineStyles();
      }
      if (changes.thickness) {
        settings.thickness = changes.thickness.newValue;
        applyLineStyles();
      }
      if (changes.lineType) {
        settings.lineType = changes.lineType.newValue;
        applyLineStyles();
        if (settings.lineType === "wavy") {
          pathEl.setAttribute("d", makeWavyPath());
        }
      }
    });
  }
}

// ========== 监听来自 popup 的消息 ==========
if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.type === "applySettings") {
      settings.enabled = message.enabled ?? settings.enabled;
      settings.color = message.color ?? settings.color;
      settings.thickness = message.thickness ?? settings.thickness;
      settings.lineType = message.lineType ?? settings.lineType;
      saveSettings();
      if (svgEl) {
        applyLineStyles();
        if (settings.lineType === "wavy") {
          pathEl.setAttribute("d", makeWavyPath());
        }
        if (settings.enabled && !isBlacklisted()) scheduleUpdate();
      }
      sendResponse({ ...settings });
      return true;
    }

    if (message.type === "getHostname") {
      sendResponse({ hostname: window.location.hostname });
      return true;
    }

    if (message.type === "getSettings") {
      sendResponse({ ...settings });
      return true;
    }

    if (message.type === "toggle") {
      settings.enabled = !settings.enabled;
      saveSettings();
      if (svgEl) {
        applyLineStyles();
        if (settings.enabled && !isBlacklisted()) scheduleUpdate();
      }
      sendResponse({ enabled: settings.enabled });
      return true;
    }
  });
}

// ========== 键盘快捷键 Ctrl+Shift+L ==========
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
    e.preventDefault();
    // 黑名单网站禁止快捷键切换
    if (isBlacklisted()) return;
    settings.enabled = !settings.enabled;
    saveSettings();
    if (svgEl) {
      applyLineStyles();
      if (settings.enabled) scheduleUpdate();
    }
  }
});

// ========== DOM 就绪后初始化 ==========
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
