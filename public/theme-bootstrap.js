// 首屏防闪：只读取 localStorage 中上一次模式作为绘制缓存；
// 真实来源是 SQLite settings，应用启动后会以数据库值为准。
(function () {
  var mode = "system";
  try {
    mode = localStorage.getItem("ui.themeMode") || "system";
  } catch {
    mode = "system";
  }
  var prefersLight =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  var resolved = mode === "system" ? (prefersLight ? "light" : "dark") : mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
})();
