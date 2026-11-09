/**
 * 主搜索框双作用域验收：
 * 1) 默认只搜本地，命中不触发联网
 * 2) 本地零结果出现「本地没有找到，要不要联网找找」
 * 3) Ctrl+Enter 才走联网，结果单独成块「网络候选 · 未审核」，不进库列表
 * 4) 未配置 Key 时降级为粘贴网址抓取，不发联网检索请求
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildFixtures, installTauriStub } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ORIGIN = "http://127.0.0.1:4176";
const PROFILE_DIR = path.join(ROOT, ".screenshots", ".edge-search-scope");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log("[search-scope]", ...args);

function startPreview() {
  return spawn("npx vite preview --host 127.0.0.1 --port 4176 --strictPort", {
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

const checks = [];
function record(name, pass, detail) {
  checks.push({ name, pass, detail });
  log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
}

const TYPE_EXPRESSION = (value) => `(() => {
  const input = document.querySelector("[data-search-input]");
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
  return true;
})()`;

const PRESS_CTRL_ENTER = `(() => {
  const input = document.querySelector("[data-search-input]");
  if (!input) return false;
  input.focus();
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
  return true;
})()`;

const READ_STATE = `(() => ({
  cards: document.querySelectorAll("[data-case-id]").length,
  hint: document.querySelector("[data-local-empty-hint]")?.textContent?.trim() ?? "",
  hintButton: document.querySelector("[data-local-empty-hint] button")?.textContent?.trim() ?? "",
  onlineBlock: document.querySelector("[data-online-candidates]")?.textContent?.trim() ?? "",
  onlineItems: document.querySelectorAll("[data-online-candidates] li").length,
  onlinePanel: Boolean(document.querySelector('[aria-label="粘贴网址"]')),
  onlineMessage: [...document.querySelectorAll("p")].map((node) => node.textContent || "").find((text) => text.includes("降级") || text.includes("联网检索")) ?? "",
  calls: window.__discoveryCalls || 0,
  scopePanel: Boolean(document.querySelector('[aria-label="检索关键词"]')),
}))()`;

function installStub(cdp, sessionId, fixtures) {
  return cdp.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: `(${installTauriStub.toString()})(${JSON.stringify(fixtures)});` },
    sessionId,
  );
}

async function main() {
  const preview = startPreview();
  let edge = null;
  let cdp = null;
  const metrics = {};
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
      "Emulation.setDeviceMetricsOverride",
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );

    // ---------- 场景 A：未配置 Key ----------
    const noKey = structuredClone(buildFixtures());
    noKey.aiSettings.searchCredential = { configured: false, last4: "", updatedAt: null };
    const firstStub = await installStub(cdp, sessionId, noKey);
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2400);

    const initial = await evaluate(cdp, sessionId, READ_STATE, "initial-state");
    record("默认只搜本地：无联网面板", initial.onlinePanel === false, initial);

    await evaluate(cdp, sessionId, TYPE_EXPRESSION("玻璃"), "type-hit");
    await delay(600);
    const localHit = await evaluate(cdp, sessionId, READ_STATE, "local-hit");
    record(
      "本地命中：结果来自本地库且未联网",
      localHit.cards > 0 && localHit.onlineBlock === "" && localHit.calls === 0,
      localHit,
    );

    await evaluate(cdp, sessionId, TYPE_EXPRESSION("量子毛玻璃"), "type-miss");
    await delay(600);
    const localMiss = await evaluate(cdp, sessionId, READ_STATE, "local-miss");
    record(
      "本地零结果出现联网提示",
      localMiss.cards === 0 &&
        localMiss.hint.includes("本地没有找到，要不要联网找找"),
      { hint: localMiss.hint, cards: localMiss.cards },
    );
    record(
      "无 Key 时提示按钮降级为粘贴网址抓取",
      localMiss.hintButton === "粘贴网址抓取",
      localMiss.hintButton,
    );

    await evaluate(cdp, sessionId, PRESS_CTRL_ENTER, "ctrl-enter-no-key");
    await delay(500);
    const degraded = await evaluate(cdp, sessionId, READ_STATE, "degraded");
    record(
      "无 Key Ctrl+Enter 降级到粘贴网址抓取且不请求搜索服务",
      degraded.onlinePanel === true &&
        degraded.onlineMessage.includes("降级") &&
        degraded.onlineMessage.includes("粘贴网址抓取") &&
        degraded.calls === 0,
      { panel: degraded.onlinePanel, message: degraded.onlineMessage, calls: degraded.calls },
    );
    await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId).then(({ data }) => {
      const dir = path.join(ROOT, ".screenshots");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "search-scope-degraded.png"), Buffer.from(data, "base64"));
    });

    // ---------- 场景 B：已配置搜索 Key ----------
    await cdp.send(
      "Page.removeScriptToEvaluateOnNewDocument",
      { identifier: firstStub.identifier },
      sessionId,
    );
    const withKey = structuredClone(buildFixtures());
    withKey.aiSettings.searchCredential = {
      configured: true,
      last4: "9f2a",
      updatedAt: new Date().toISOString(),
    };
    await installStub(cdp, sessionId, withKey);
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2400);

    await evaluate(cdp, sessionId, TYPE_EXPRESSION("玻璃"), "type-hit-key");
    await delay(600);
    const keyHit = await evaluate(cdp, sessionId, READ_STATE, "local-hit-key");
    record(
      "配置 Key 后普通输入仍只搜本地",
      keyHit.cards > 0 && keyHit.onlineBlock === "" && keyHit.calls === 0,
      keyHit,
    );

    await evaluate(cdp, sessionId, TYPE_EXPRESSION("玻璃拟态导航"), "type-miss-key");
    await delay(600);
    const keyMiss = await evaluate(cdp, sessionId, READ_STATE, "local-miss-key");
    record(
      "配置 Key 时提示按钮指向 Ctrl+Enter 联网",
      keyMiss.cards === 0 && keyMiss.hintButton === "Ctrl+Enter 联网",
      { hint: keyMiss.hint, button: keyMiss.hintButton },
    );

    const startedAt = Date.now();
    await evaluate(cdp, sessionId, PRESS_CTRL_ENTER, "ctrl-enter-key");
    let online = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await delay(100);
      online = await evaluate(cdp, sessionId, READ_STATE, "online-result");
      if (online.onlineItems > 0) break;
    }
    metrics.ctrlEnterToBlockMs = Date.now() - startedAt;

    record(
      "Ctrl+Enter 才走联网：结果单独成块「网络候选 · 未审核」",
      online.onlineBlock.includes("网络候选 · 未审核") &&
        online.onlineItems === 3 &&
        online.onlineBlock.includes("待审核") &&
        online.onlineBlock.includes("已存在"),
      { items: online.onlineItems, block: online.onlineBlock.slice(0, 120) },
    );
    record(
      "联网结果不进库列表、不参与本地排序",
      online.cards === 0 && online.hint.includes("本地没有找到"),
      { cards: online.cards, hint: online.hint },
    );
    record(
      "联网检索实际调用了一次网关",
      online.calls >= 1,
      { calls: online.calls, elapsedMs: metrics.ctrlEnterToBlockMs },
    );
    await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId).then(({ data }) => {
      const dir = path.join(ROOT, ".screenshots");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "search-scope-online.png"), Buffer.from(data, "base64"));
    });

    console.log(JSON.stringify({ metrics, checks }, null, 2));
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
  log(`汇总：${checks.length - failed.length}/${checks.length} PASS`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
