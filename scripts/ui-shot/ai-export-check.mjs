/**
 * AI 出口验收：单条复制 / 批量多选 / 批量复制与导出 / 选择随类目切换失效。
 * 使用与 onboarding-check 相同的无头 Edge + 假 Tauri 后端。
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildFixtures, installTauriStub } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ORIGIN = "http://127.0.0.1:4175";
const PROFILE_DIR = path.join(ROOT, ".screenshots", ".edge-ai-export");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log("[ai-export]", ...args);

const BASE_FIXTURES = structuredClone(buildFixtures());
const BATCH_SIZE = 20;

// 夹具只有 14 条，复制出 6 条凑到 20，专门量批量耗时
const EXTRA = BASE_FIXTURES.cases.slice(0, BATCH_SIZE - BASE_FIXTURES.cases.length);
const FIXTURES = structuredClone(BASE_FIXTURES);
FIXTURES.cases = [
  ...FIXTURES.cases,
  ...EXTRA.map((item, index) => ({
    ...item,
    id: `${item.id}-extra-${index + 1}`,
    title: `${item.title}（补充 ${index + 1}）`,
    isFavorite: false,
  })),
];

function startPreview() {
  return spawn("npx vite preview --host 127.0.0.1 --port 4175 --strictPort", {
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

function clickByText(cdp, sessionId, selector, text, label = "click-text") {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((node) => (node.textContent || "").trim().startsWith(${JSON.stringify(text)}));
      if (!target) return false;
      target.click();
      return true;
    })()`,
    label,
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

function mouse(cdp, sessionId, type, x, y) {
  return cdp.send(
    "Input.dispatchMouseEvent",
    {
      type,
      x,
      y,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
    },
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

    await installFixtures(cdp, sessionId, FIXTURES);
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2600);

    // 剪贴板替身：记录 writeText 的完整文本，供长度与内容断言
    const clipboardReady = await evaluate(
      cdp,
      sessionId,
      `(() => {
        window.__copied = [];
        const clipboard = {
          writeText: async (text) => { window.__copied.push({ text, at: performance.now() }); },
          readText: async () => (window.__copied.at(-1)?.text ?? ""),
        };
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
        return typeof navigator.clipboard.writeText === "function";
      })()`,
      "clipboard-stub",
    );
    record("剪贴板替身可用", clipboardReady === true, null);

    // 拦住导出调用，拿到实际写入的 Markdown / JSON
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const native = window.__TAURI_INTERNALS__.invoke;
        window.__TAURI_INTERNALS__.invoke = async (command, args) => {
          if (command === "cases_export_bundle") window.__exported = args.input;
          return native(command, args);
        };
        return true;
      })()`,
      "export-probe",
    );

    const listState = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const cards = [...document.querySelectorAll("[data-case-id]")];
        const first = cards[0];
        return {
          cards: cards.length,
          caseId: first?.dataset.caseId ?? null,
          title: (first?.getAttribute("aria-label") || "").replace(/（[^）]*）$/, ""),
          selectAllLabel: document.querySelector("[data-select-all]")?.textContent?.trim() ?? null,
          copyButtons: document.querySelectorAll("[data-copy-action]").length,
        };
      })()`,
      "list-state",
    );
    record(
      "详情页有两个复制动作",
      listState.copyButtons === 2,
      listState.copyButtons,
    );
    record(
      "全选入口始终可见",
      typeof listState.selectAllLabel === "string" && listState.selectAllLabel.includes("全选"),
      listState.selectAllLabel,
    );

    // ---------- 单条：复制提示词 ----------
    const promptShown = await evaluate(
      cdp,
      sessionId,
      `document.querySelector('[aria-labelledby="prompt-heading"] pre')?.textContent?.trim() ?? ""`,
      "prompt-shown",
    );
    await click(cdp, sessionId, '[data-copy-action="prompt"]', "copy-prompt");
    await delay(300);
    const promptCopy = await evaluate(
      cdp,
      sessionId,
      `(() => ({
        text: window.__copied.at(-1)?.text ?? "",
        status: document.querySelector("[data-copy-status]")?.textContent ?? "",
        tone: document.querySelector("[data-copy-status]")?.dataset.copyStatus ?? "",
      }))()`,
      "read-prompt-copy",
    );
    await delay(1600);
    const promptStatusLater = await evaluate(
      cdp,
      sessionId,
      `document.querySelector("[data-copy-status]")?.textContent ?? ""`,
      "prompt-status-later",
    );
    record(
      "复制提示词：内容与界面展示一致",
      promptCopy.text.length > 0 && promptCopy.text === promptShown,
      { chars: promptCopy.text.length },
    );
    record(
      "复制成功反馈不只闪一下",
      promptCopy.tone === "ok" && promptCopy.status.includes("已复制") && promptStatusLater === promptCopy.status,
      { status: promptCopy.status, later: promptStatusLater },
    );
    metrics.singlePromptChars = promptCopy.text.length;

    // ---------- 单条：复制为 Markdown ----------
    await click(cdp, sessionId, '[data-copy-action="markdown"]', "copy-markdown");
    await delay(300);
    const markdownCopy = await evaluate(
      cdp,
      sessionId,
      `(() => ({
        text: window.__copied.at(-1)?.text ?? "",
        status: document.querySelector("[data-copy-status]")?.textContent ?? "",
      }))()`,
      "read-markdown-copy",
    );
    const md = markdownCopy.text;
    const clean =
      !md.includes("已选") &&
      !md.includes("复制提示词") &&
      !md.includes("复制为 Markdown") &&
      !md.includes("导出文件") &&
      !md.includes(listState.caseId ?? "\u0000");
    record(
      "单条 Markdown 含标题 / 类目 / 参数表 / 提示词",
      md.startsWith(`# ${listState.title}`) &&
        md.includes("- 内容域：") &&
        md.includes("- 类目：") &&
        md.includes("## 参数") &&
        md.includes("| 参数 | 值 |") &&
        md.includes("## 提示词") &&
        md.includes(promptShown.slice(0, 40)),
      { chars: md.length, head: md.split("\n").slice(0, 8) },
    );
    record("单条 Markdown 不含界面角标与 ID", clean, null);
    metrics.singleMarkdownChars = md.length;

    // ---------- Ctrl 点选 3 条 ----------
    const ctrlClicked = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const cards = [...document.querySelectorAll("[data-case-id]")].slice(0, 3);
        for (const card of cards) {
          card.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
        }
        return cards.length;
      })()`,
      "ctrl-select",
    );
    await delay(300);
    const threeSelected = await evaluate(
      cdp,
      sessionId,
      `(() => ({
        count: document.querySelector("[data-selection-count]")?.textContent?.trim() ?? "",
        marked: document.querySelectorAll('[data-case-id][data-multi-selected="true"]').length,
      }))()`,
      "read-ctrl-selection",
    );
    record(
      "Ctrl 点选后显示已选 N 条",
      ctrlClicked === 3 && threeSelected.count === "已选 3 条" && threeSelected.marked === 3,
      threeSelected,
    );

    // ---------- 框选 ----------
    const start = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const cards = [...document.querySelectorAll("[data-case-id]")].slice(0, 6);
        const a = cards[0].getBoundingClientRect();
        const b = cards[1].getBoundingClientRect();
        return {
          from: { x: a.right + 4, y: a.top + 12 },
          to: { x: b.left + b.width / 2, y: b.bottom + 10 },
          cards: cards.length,
        };
      })()`,
      "marquee-points",
    );
    await mouse(cdp, sessionId, "mousePressed", start.from.x, start.from.y);
    await mouse(cdp, sessionId, "mouseMoved", start.from.x + 12, start.from.y + 6);
    await mouse(cdp, sessionId, "mouseMoved", start.to.x, start.to.y);
    await delay(120);
    const marqueeVisible = await evaluate(
      cdp,
      sessionId,
      `Boolean(document.querySelector("[data-marquee]"))`,
      "marquee-visible",
    );
    await mouse(cdp, sessionId, "mouseReleased", start.to.x, start.to.y);
    await delay(250);
    const marqueeResult = await evaluate(
      cdp,
      sessionId,
      `(() => ({
        count: document.querySelector("[data-selection-count]")?.textContent?.trim() ?? "",
        marked: document.querySelectorAll('[data-case-id][data-multi-selected="true"]').length,
        marquee: Boolean(document.querySelector("[data-marquee]")),
      }))()`,
      "read-marquee",
    );
    const marqueeCountOk = /^已选 [1-9]\d* 条$/.test(marqueeResult.count);
    record(
      "框选可选中若干条并清除选框",
      marqueeVisible === true &&
        marqueeResult.marquee === false &&
        marqueeCountOk &&
        marqueeResult.marked >= 2,
      { marqueeVisible, ...marqueeResult },
    );

    // ---------- 全选当前结果 ----------
    await click(cdp, sessionId, "[data-select-all]", "select-all");
    await delay(300);
    const allState = await evaluate(
      cdp,
      sessionId,
      `(() => ({
        count: document.querySelector("[data-selection-count]")?.textContent?.trim() ?? "",
        label: document.querySelector("[data-select-all]")?.textContent?.trim() ?? "",
      }))()`,
      "read-select-all",
    );
    record(
      `全选当前结果为 ${BATCH_SIZE} 条`,
      allState.count === `已选 ${BATCH_SIZE} 条` && allState.label.includes("取消全选"),
      allState,
    );
    await screenshot(cdp, sessionId, "ai-export-selection-bar.png");

    // ---------- 批量复制 20 条 ----------
    const beforeCopy = await evaluate(
      cdp,
      sessionId,
      "window.__copied.length",
      "copied-before",
    );
    await click(cdp, sessionId, '[data-batch-action="copy"]', "batch-copy");
    let batchState = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await delay(50);
      batchState = await evaluate(
        cdp,
        sessionId,
        `(() => ({
          copied: window.__copied.length,
          text: window.__copied.at(-1)?.text ?? "",
          status: document.querySelector("[data-selection-status]")?.textContent ?? "",
        }))()`,
        "read-batch-copy",
      );
      if (batchState.copied > beforeCopy && batchState.status.includes("已复制")) break;
    }
    const batchText = batchState?.text ?? "";
    const mergedCount = (batchText.match(/^## /gm) || []).length;
    const paramBlocks = (batchText.match(/^### 参数$/gm) || []).length;
    const promptBlocks = (batchText.match(/^### 提示词$/gm) || []).length;
    const separators = (batchText.match(/^---$/gm) || []).length;
    const sections = batchText
      .split(/\n\n---\n\n/)
      .map((section) => section.trim())
      .filter(Boolean);
    const sectionLens = sections.map((section) => section.length);
    const promptLens = sections.map((section) => {
      const tail = section.split("### 提示词\n\n")[1] ?? "";
      return tail.trim().length;
    });
    const elapsedMatch = /(\d+(?:\.\d+)?)ms/.exec(batchState?.status ?? "");
    metrics.batch20Chars = batchText.length;
    metrics.batch20ElapsedMs = elapsedMatch ? Number(elapsedMatch[1]) : null;
    metrics.singleDocCharsRange = [
      Math.min(...sectionLens),
      Math.max(...sectionLens),
    ];
    metrics.singlePromptCharsRange = [
      Math.min(...promptLens),
      Math.max(...promptLens),
    ];

    record(
      "批量复制为合并 Markdown：20 条各带参数表与提示词",
      mergedCount === BATCH_SIZE &&
        paramBlocks === BATCH_SIZE &&
        promptBlocks === BATCH_SIZE &&
        separators === BATCH_SIZE - 1,
      { mergedCount, paramBlocks, promptBlocks, separators },
    );
    record(
      "批量复制不含界面计数",
      !batchText.includes("已选") && !batchText.includes("字 ·") && !batchText.includes("导出文件"),
      null,
    );
    record(
      "批量复制反馈带条数 / 字数 / 耗时",
      Boolean(batchState?.status?.includes(`${BATCH_SIZE} 条`)) &&
        batchState?.status?.includes("字") &&
        metrics.batch20ElapsedMs !== null,
      { status: batchState?.status, elapsedMs: metrics.batch20ElapsedMs },
    );

    // ---------- 批量导出（Markdown + JSON） ----------
    await click(cdp, sessionId, '[data-batch-action="export"]', "batch-export");
    await delay(700);
    const exportState = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const input = window.__exported || {};
        let json = null;
        try { json = JSON.parse(input.json || "null"); } catch { json = null; }
        return {
          title: input.title ?? "",
          mdSections: ((input.markdown || "").match(/^## /gm) || []).length,
          jsonItems: Array.isArray(json?.items) ? json.items.length : 0,
          status: document.querySelector("[data-selection-status]")?.textContent ?? "",
        };
      })()`,
      "read-export",
    );
    record(
      "批量导出同时写 Markdown 与 JSON",
      exportState.mdSections === BATCH_SIZE &&
        exportState.jsonItems === BATCH_SIZE &&
        exportState.status.includes("Markdown + JSON") &&
        exportState.status.includes(".md"),
      exportState,
    );

    // ---------- 切换类目后选择不残留 ----------
    await clickByText(cdp, sessionId, ".rail-item", "风格", "open-style");
    await delay(900);
    await clickByText(cdp, sessionId, ".rail-item-sm", "新拟态", "pick-category-a");
    await delay(900);
    const afterCategory = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const cards = [...document.querySelectorAll("[data-case-id]")];
        const card = cards[0];
        return {
          cards: cards.length,
          bar: Boolean(document.querySelector("[data-selection-bar]")),
          scope: location.hash,
          caseId: card?.dataset.caseId ?? null,
        };
      })()`,
      "read-style-category",
    );
    let categorySelect = { count: "", marked: 0 };
    if (afterCategory.caseId) {
      await evaluate(
        cdp,
        sessionId,
        `(() => {
          const card = document.querySelector("[data-case-id]");
          card?.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
          return true;
        })()`,
        "select-in-category",
      );
      await delay(300);
      categorySelect = await evaluate(
        cdp,
        sessionId,
        `(() => ({
          count: document.querySelector("[data-selection-count]")?.textContent?.trim() ?? "",
          marked: document.querySelectorAll('[data-case-id][data-multi-selected="true"]').length,
        }))()`,
        "read-category-selection",
      );
    }
    record(
      "进入类目后旧选择已清空",
      afterCategory.cards > 0 && !afterCategory.bar,
      { scope: afterCategory.scope, bar: afterCategory.bar, cards: afterCategory.cards },
    );
    record("类目内可重新选择", categorySelect.count === "已选 1 条", categorySelect);

    await clickByText(cdp, sessionId, ".rail-item-sm", "玻璃拟态", "pick-category-b");
    await delay(800);
    const afterSwitch = await evaluate(
      cdp,
      sessionId,
      `(() => ({
        bar: Boolean(document.querySelector("[data-selection-bar]")),
        count: document.querySelector("[data-selection-count]")?.textContent?.trim() ?? "",
        status: Boolean(document.querySelector("[data-selection-status]")),
        cards: document.querySelectorAll("[data-case-id]").length,
      }))()`,
      "read-category-switch",
    );
    record(
      "切换类目后选择不残留",
      afterSwitch.bar === false && afterSwitch.count === "" && afterSwitch.status === false,
      afterSwitch,
    );

    // ---------- 页面没有未捕获错误 ----------
    const errors = await evaluate(
      cdp,
      sessionId,
      `(window.__shotErrors || []).filter((entry) => entry.kind === "window.onerror" || entry.kind === "unhandledrejection")`,
      "read-errors",
    );
    record("无未捕获错误", Array.isArray(errors) && errors.length === 0, errors?.length ?? errors);

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
