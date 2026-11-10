/**
 * 并排对比验收：多选 2 条可对比、超过 2 条禁用并说明原因、双预览共用播放控制、
 * 参数表只高亮不同字段、置信度差异提示、Esc 退出回到原列表。
 * 与 ai-export-check 相同的无头 Edge + 假 Tauri 后端。
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildFixtures, installTauriStub } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ORIGIN = "http://127.0.0.1:4177";
const PROFILE_DIR = path.join(ROOT, ".screenshots", ".edge-compare");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log("[compare]", ...args);

const FIXTURES = buildFixtures();

const LEFT_TITLE = "新拟态镶嵌面板";
const RIGHT_TITLE = "玻璃面板悬停层";
const THIRD_TITLE = "错峰入场列表";

function startPreview() {
  return spawn("npx vite preview --host 127.0.0.1 --port 4177 --strictPort", {
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

function installFixtures(cdp, sessionId, fixtures) {
  return cdp.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: `(${installTauriStub.toString()})(${JSON.stringify(fixtures)});` },
    sessionId,
  );
}

function click(cdp, sessionId, selector, label = "click") {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) return false;
      target.click();
      return true;
    })()`,
    label,
  );
}

/** Ctrl 点击指定标题的卡片，模拟多选 */
function ctrlClickCard(cdp, sessionId, title) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const cards = [...document.querySelectorAll("[data-case-id]")];
      const target = cards.find((card) => (card.getAttribute("aria-label") || "").includes(${JSON.stringify(title)}));
      if (!target) return false;
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
      return true;
    })()`,
    `ctrl-click-${title}`,
  );
}

async function screenshot(cdp, sessionId, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
  const dir = path.join(ROOT, ".screenshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  return file;
}

function readBar(cdp, sessionId) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const button = document.querySelector("[data-compare-action]");
      return {
        count: document.querySelector("[data-selection-count]")?.textContent?.trim() ?? null,
        hint: document.querySelector("[data-compare-hint]")?.textContent?.trim() ?? null,
        disabled: button ? button.disabled : null,
        title: button?.getAttribute("title") ?? null,
      };
    })()`,
    "read-bar",
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

    await installFixtures(cdp, sessionId, FIXTURES);
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2600);

    const initial = await evaluate(
      cdp,
      sessionId,
      `({ cards: document.querySelectorAll("[data-case-id]").length, url: location.pathname })`,
      "initial",
    );
    record("列表已就绪", initial.cards >= 10 && initial.url === "/library", initial);

    // ---------- 选 1 条：禁用 + 原因 ----------
    await ctrlClickCard(cdp, sessionId, LEFT_TITLE);
    await delay(220);
    const one = await readBar(cdp, sessionId);
    record(
      "只选 1 条时对比禁用并说明原因",
      one.count === "已选 1 条" && one.disabled === true && one.hint === "再选 1 条才能对比",
      one,
    );

    // ---------- 选 2 条：可用 ----------
    await ctrlClickCard(cdp, sessionId, RIGHT_TITLE);
    await delay(220);
    const two = await readBar(cdp, sessionId);
    record(
      "选中 2 条时对比可用",
      two.count === "已选 2 条" && two.disabled === false && two.hint === "选中 2 条后可以并排对比",
      two,
    );

    // ---------- 选 3 条：禁用 + 说明超过 2 条 ----------
    await ctrlClickCard(cdp, sessionId, THIRD_TITLE);
    await delay(220);
    const three = await readBar(cdp, sessionId);
    record(
      "超过 2 条时禁用并说明只支持 2 条",
      three.count === "已选 3 条" && three.disabled === true && three.hint?.includes("对比只支持 2 条"),
      three,
    );

    // 取消第 3 条，回到 2 条
    await ctrlClickCard(cdp, sessionId, THIRD_TITLE);
    await delay(220);

    // ---------- 打开对比 ----------
    const opened = await click(cdp, sessionId, "[data-compare-action]", "open-compare");
    await delay(700);
    const view = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const sides = [...document.querySelectorAll("[data-compare-side]")];
        return {
          open: Boolean(document.querySelector("[data-compare-view]")),
          sides: sides.length,
          sideTitles: sides.map((side) => side.querySelector("h2")?.textContent?.trim() ?? ""),
          stages: document.querySelectorAll("[data-compare-side] .preview-stage").length,
          confidence: document.querySelector("[data-compare-confidence-warning]")?.textContent ?? null,
          confidenceTone: document.querySelector("[data-compare-confidence-warning]")?.dataset.compareConfidenceWarning ?? null,
          diffRows: document.querySelectorAll('[data-compare-row="diff"]').length,
          sameRowsRendered: document.querySelectorAll('[data-compare-row="same"]').length,
          sameToggle: document.querySelector("[data-compare-same-toggle]")?.textContent?.trim() ?? null,
          diffLabels: [...document.querySelectorAll('[data-compare-row="diff"] th')].map((node) => node.textContent?.trim()),
          playPressed: document.querySelector("[data-compare-play]")?.getAttribute("aria-pressed") ?? null,
        };
      })()`,
      "read-view",
    );
    metrics.diffRows = view.diffRows;
    record("点击对比打开覆盖层", opened === true && view.open === true, { open: view.open });
    record(
      "左右各一块预览且标题对得上",
      view.sides === 2 && view.stages === 2 && view.sideTitles[0] === LEFT_TITLE && view.sideTitles[1] === RIGHT_TITLE,
      view.sideTitles,
    );
    record(
      "参数表只渲染不同字段，相同项折叠",
      view.diffRows === 4 &&
        view.sameRowsRendered === 0 &&
        view.sameToggle?.includes("展开相同的 1 项") === true,
      { diffRows: view.diffRows, sameToggle: view.sameToggle, labels: view.diffLabels },
    );
    record(
      "置信度不同时显式提示不可同等可信",
      view.confidenceTone === "trust" &&
        view.confidence?.includes("置信度不同") &&
        view.confidence.includes("不要把两者当成同等可信"),
      view.confidence,
    );

    // ---------- 共用播放控制 ----------
    record("默认两侧同帧播放", view.playPressed === "true", view.playPressed);
    await click(cdp, sessionId, "[data-compare-play]", "pause-both");
    await delay(250);
    const paused = await evaluate(
      cdp,
      sessionId,
      `({
        pressed: document.querySelector("[data-compare-play]")?.getAttribute("aria-pressed"),
        label: document.querySelector("[data-compare-play]")?.textContent?.trim(),
        statuses: [...document.querySelectorAll("[data-compare-side]")].map((side) => side.textContent.includes("PAUSED")),
      })`,
      "paused",
    );
    record(
      "同时暂停作用于两侧",
      paused.pressed === "false" && paused.label === "同时播放" && paused.statuses.every(Boolean),
      paused,
    );

    await click(cdp, sessionId, "[data-compare-replay=\"left\"]", "replay-left");
    await delay(250);
    const afterReplay = await evaluate(
      cdp,
      sessionId,
      `({
        pressed: document.querySelector("[data-compare-play]")?.getAttribute("aria-pressed"),
        statuses: [...document.querySelectorAll("[data-compare-side]")].map((side) => side.textContent.includes("PLAYING") || side.textContent.includes("LOOP")),
      })`,
      "after-replay",
    );
    record(
      "单侧重播会恢复播放且只点了左侧",
      afterReplay.pressed === "true" && afterReplay.statuses.every(Boolean),
      afterReplay,
    );

    await screenshot(cdp, sessionId, "compare-view.png");

    // ---------- 展开相同项 ----------
    await click(cdp, sessionId, "[data-compare-same-toggle]", "toggle-same");
    await delay(180);
    const sameExpanded = await evaluate(
      cdp,
      sessionId,
      `({
        rows: document.querySelectorAll('[data-compare-row="same"]').length,
        values: [...document.querySelectorAll('[data-compare-row="same"] td')].map((node) => node.textContent?.trim()),
        diffAttribute: document.querySelector('[data-compare-row="same"]')?.dataset.compareDiff ?? null,
        toggle: document.querySelector("[data-compare-same-toggle]")?.textContent?.trim(),
      })`,
      "same-expanded",
    );
    record(
      "展开后能看到相同项且不带差异标记",
      sameExpanded.rows === 1 && sameExpanded.diffAttribute === "false" && sameExpanded.toggle.includes("收起"),
      sameExpanded,
    );

    // ---------- Esc 退出 ----------
    await cdp.send(
      "Input.dispatchKeyEvent",
      { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchKeyEvent",
      { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
      sessionId,
    );
    await delay(350);
    const afterEsc = await evaluate(
      cdp,
      sessionId,
      `({
        open: Boolean(document.querySelector("[data-compare-view]")),
        cards: document.querySelectorAll("[data-case-id]").length,
        path: location.pathname,
        count: document.querySelector("[data-selection-count]")?.textContent?.trim() ?? null,
      })`,
      "after-esc",
    );
    record(
      "Esc 退出对比并回到原列表",
      afterEsc.open === false && afterEsc.cards === initial.cards && afterEsc.path === "/library",
      afterEsc,
    );
    record(
      "退出后选择状态仍在，可继续操作",
      afterEsc.count === "已选 2 条",
      afterEsc.count,
    );

    // 再次打开确认状态未坏
    await click(cdp, sessionId, "[data-compare-action]", "reopen-compare");
    await delay(500);
    const reopened = await evaluate(
      cdp,
      sessionId,
      `Boolean(document.querySelector("[data-compare-view]"))`,
      "reopened",
    );
    record("可再次进入对比", reopened === true, reopened);

    const passed = checks.filter((check) => check.pass).length;
    log(`汇总：${passed}/${checks.length} PASS`);
    log(`指标：${JSON.stringify(metrics)}`);
    if (passed !== checks.length) process.exitCode = 1;
  } finally {
    try {
      cdp?.socket.close();
    } catch {
      // ignore
    }
    edge?.kill();
    preview.kill();
    await delay(300);
  }
}

await main();
