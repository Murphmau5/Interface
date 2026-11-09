import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildFixtures, installTauriStub } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ORIGIN = "http://127.0.0.1:4173";
const PROFILE_DIR = path.join(ROOT, ".screenshots", ".edge-palette");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log("[palette]", ...args);

function startPreview() {
  return spawn("npx vite preview --host 127.0.0.1 --port 4173 --strictPort", {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
}

async function waitForPreview(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${ORIGIN}/`, { redirect: "manual" });
      if (response.status > 0 && response.status < 500) return;
    } catch {
      // not ready
    }
    await delay(200);
  }
  throw new Error("vite preview 未就绪");
}

function launchEdge() {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const candidates = [
    process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const edgePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!edgePath) throw new Error("未找到 msedge.exe");
  return spawn(
    edgePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"], windowsHide: true },
  );
}

async function waitForPort(timeoutMs = 30000) {
  const portFile = path.join(PROFILE_DIR, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const lines = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
      const port = Number(lines[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // wait
    }
    await delay(120);
  }
  throw new Error("未读到 DevToolsActivePort");
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP 连接失败")), { once: true });
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP 超时：${method}`));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { socket, send };
}

async function evaluate(cdp, sessionId, expression, label = "eval") {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true, userGesture: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(`${label}：${result.exceptionDetails.exception?.description}`);
  }
  return result.result?.value;
}

const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

async function pressKey(cdp, sessionId, key, vk, modifiers = 0) {
  const base = { key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await cdp.send("Input.dispatchKeyEvent", { ...base, type: "rawKeyDown" }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" }, sessionId);
  await delay(120);
}

const checks = [];
function record(name, pass, detail) {
  checks.push({ name, pass, detail });
  log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
}

async function main() {
  const preview = startPreview();
  let edge = null;
  let cdp = null;
  try {
    await waitForPreview();
    edge = launchEdge();
    const port = await waitForPort();
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    cdp = await connect(version.webSocketDebuggerUrl);
    const targets = (await cdp.send("Target.getTargets")).targetInfos.filter(
      (target) => target.type === "page",
    );
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId: targets[0].targetId,
      flatten: true,
    });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: `(${installTauriStub.toString()})(${JSON.stringify(buildFixtures())});` },
      sessionId,
    );
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2500);

    const ready = await evaluate(
      cdp,
      sessionId,
      `document.querySelectorAll(".rail-item").length > 0`,
      "ready",
    );
    record("页面就绪", ready === true, ready);

    // 1. Ctrl+K 打开，清点命令
    await pressKey(cdp, sessionId, "k", 75, MOD.ctrl);
    const opened = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const dialog = document.querySelector(".command-dialog");
        if (!dialog) return null;
        return {
          items: dialog.querySelectorAll(".command-item").length,
          groups: [...dialog.querySelectorAll(".command-group-label")].map((node) => node.textContent),
          footer: dialog.querySelector(".command-foot")?.textContent,
          focused: document.activeElement?.getAttribute("aria-label"),
        };
      })()`,
      "palette-open",
    );
    record("Ctrl+K 打开命令面板", Boolean(opened), opened);

    // 2. 输入「表格」后回车执行切视图
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const input = document.querySelector(".command-dialog input");
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "表格");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`,
      "type",
    );
    await delay(400);
    const filtered = await evaluate(
      cdp,
      sessionId,
      `[...document.querySelectorAll(".command-item")].map((node) => node.textContent)`,
      "filtered",
    );
    record("输入后过滤命令", filtered.length >= 1, filtered);
    await pressKey(cdp, sessionId, "Enter", 13);
    await delay(300);
    const view = await evaluate(
      cdp,
      sessionId,
      `({
        closed: !document.querySelector(".command-dialog"),
        视图: document.querySelector('[role="group"][aria-label="列表视图"] button[aria-pressed="true"]')?.textContent?.trim() || null,
      })`,
      "after-enter",
    );
    record("回车执行并关闭面板", view.closed === true && view["视图"] === "表格", view);

    // 3. Ctrl+F 聚焦搜索框，再按 / 应该输入字符而不是被快捷键劫持
    await pressKey(cdp, sessionId, "f", 70, MOD.ctrl);
    const focus1 = await evaluate(
      cdp,
      sessionId,
      `document.activeElement?.getAttribute("data-search-input") !== null`,
      "focus",
    );
    record("Ctrl+F 聚焦搜索框", focus1 === true, focus1);
    await cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "keyDown",
        key: "/",
        code: "Slash",
        windowsVirtualKeyCode: 191,
        nativeVirtualKeyCode: 191,
        text: "/",
        unmodifiedText: "/",
      },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "keyUp",
        key: "/",
        code: "Slash",
        windowsVirtualKeyCode: 191,
        nativeVirtualKeyCode: 191,
      },
      sessionId,
    );
    await delay(200);
    const slash = await evaluate(
      cdp,
      sessionId,
      `({
        value: document.querySelector("[data-search-input]").value,
        focused: document.activeElement?.getAttribute("data-search-input") !== null,
      })`,
      "slash",
    );
    record("输入框内 / 不抢键", slash.value.endsWith("/") && slash.focused === true, slash);
    // 清空搜索，避免影响下一步
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const input = document.querySelector("[data-search-input]");
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`,
      "clear",
    );
    await delay(350);
    await evaluate(cdp, sessionId, `document.activeElement.blur(); true`, "blur");

    // 4. Ctrl+N 从案例库跳到内容域并展开新建表单
    // headless Edge 在浏览器层截走 Ctrl+N（新窗口），改用页面内合成事件验证监听逻辑
    await evaluate(
      cdp,
      sessionId,
      `window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true, cancelable: true })); true`,
      "ctrl-n",
    );
    await delay(2000);
    const created = await evaluate(
      cdp,
      sessionId,
      `({
        hash: location.hash,
        heading: document.querySelector("main h1, main h2")?.textContent?.trim() || null,
        form: Boolean(document.getElementById("case-title-input")),
        focused: document.activeElement?.id || null,
      })`,
      "create",
    );
    record("Ctrl+N 新建案例", created.form === true && created.hash === "#/style", created);

    // 5. 既有 Esc 语义不变：展开二级导航后 Esc 逐级返回
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const target = [...document.querySelectorAll(".rail-item")].find((node) =>
          node.textContent.trim().startsWith("风格"),
        );
        target?.click();
        return Boolean(target);
      })()`,
      "open-section",
    );
    await delay(500);
    const navState = () =>
      `[...document.querySelectorAll(".nav-layer")].map((node) => node.dataset.state).join(",")`;
    const navOpened = (await evaluate(cdp, sessionId, navState(), "nav-open")) ===
      "root-out,active";
    await pressKey(cdp, sessionId, "Escape", 27);
    await delay(300);
    const navClosed = (await evaluate(cdp, sessionId, navState(), "nav-close")) ===
      "active,secondary-out";
    record("Esc 逐级返回未变", navOpened && navClosed, {
      navOpened,
      navClosed,
    });

    // 6. 面板内 Ctrl+K 再按一次应关闭；Esc 同样能关
    await pressKey(cdp, sessionId, "k", 75, MOD.ctrl);
    await delay(250);
    const reopened = await evaluate(
      cdp,
      sessionId,
      `Boolean(document.querySelector(".command-dialog"))`,
      "reopen",
    );
    await pressKey(cdp, sessionId, "k", 75, MOD.ctrl);
    await delay(250);
    const closedAgain = await evaluate(
      cdp,
      sessionId,
      `!document.querySelector(".command-dialog")`,
      "close-again",
    );
    record("Ctrl+K 开关面板", reopened === true && closedAgain === true, {
      reopened,
      closedAgain,
    });

    await pressKey(cdp, sessionId, "k", 75, MOD.ctrl);
    await delay(250);
    await pressKey(cdp, sessionId, "Escape", 27);
    await delay(250);
    const escClosed = await evaluate(
      cdp,
      sessionId,
      `!document.querySelector(".command-dialog")`,
      "esc-close",
    );
    record("Esc 关闭命令面板", escClosed === true, escClosed);

    // 7. 命令面板切主题
    await pressKey(cdp, sessionId, "k", 75, MOD.ctrl);
    await delay(300);
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const input = document.querySelector(".command-dialog input");
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "深色");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`,
      "theme-type",
    );
    await delay(400);
    await pressKey(cdp, sessionId, "Enter", 13);
    await delay(300);
    const theme = await evaluate(
      cdp,
      sessionId,
      `({
        theme: document.documentElement.dataset.theme,
        closed: !document.querySelector(".command-dialog"),
      })`,
      "theme",
    );
    record("命令面板切主题", theme.theme === "dark" && theme.closed === true, theme);

    // 8. 设置页快捷键表（只读）
    await evaluate(cdp, sessionId, `location.hash = "#/settings"; true`, "goto-settings");
    await delay(1200);
    const pickedShortcutSection = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const target = [...document.querySelectorAll("button")].find(
          (node) => node.textContent?.trim() === "快捷键",
        );
        target?.click();
        return Boolean(target);
      })()`,
      "settings-shortcuts",
    );
    await delay(600);
    const table = await evaluate(
      cdp,
      sessionId,
      `({
        rows: document.querySelectorAll(".shortcut-table tbody tr").length,
        disabled: document.querySelectorAll(".shortcut-table input, .shortcut-table button").length,
      })`,
      "shortcut-table",
    );
    record(
      "设置页快捷键表",
      pickedShortcutSection === true && table.rows >= 10 && table.disabled === 0,
      table,
    );
  } finally {
    try {
      cdp?.socket?.close();
    } catch {
      // ignore
    }
    edge?.kill();
    preview.kill();
  }

  const failed = checks.filter((check) => !check.pass);
  console.log(JSON.stringify({ checks, failed: failed.length }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
