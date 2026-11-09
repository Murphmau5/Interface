#!/usr/bin/env node
/**
 * 无窗口 UI 截图 / 压测：构建 → vite preview → 无头 Edge + CDP。
 * 不依赖任何新增 npm 包，使用 Node 24 内置 fetch / WebSocket。
 *
 * 用法：
 *   node scripts/ui-shot/shot.mjs --theme light --out .screenshots/1.0.9/main-light.png
 *   node scripts/ui-shot/shot.mjs --theme dark  --out .screenshots/1.0.9/main-dark.png
 *   node scripts/ui-shot/shot.mjs --probe
 *   node scripts/ui-shot/shot.mjs --fixtures real --audit
 * 选项：
 *   --theme light|dark   模拟 prefers-color-scheme（应用 themeMode=system）
 *   --out <path>         截图输出路径（默认 .screenshots/1.0.9/main-<theme>.png）
 *   --select <index>     点选第 N 张卡片（默认选中第一条）
 *   --view grid|table    列表视图（默认 grid）
 *   --route <hash>       路由（默认 #/library）
 *   --probe              执行无窗口压测并输出 4 张探针图
 *   --audit              遍历当前夹具全部案例：缩略图、场景主体占比、中心偏差、溢出与控制台错误，
 *                        失败清单写入 .screenshots/1.0.9/_probe/audit-failures.json
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildFixtures, installTauriStub, loadRealFixtures } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ORIGIN = "http://127.0.0.1:4173";
const PROFILE_DIR = path.join(ROOT, ".screenshots", ".edge-profile");
const PROBE_DIR = path.join(ROOT, ".screenshots", "1.0.9", "_probe");

const log = (...args) => console.log("[ui-shot]", ...args);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = {
    theme: "light",
    out: null,
    select: null,
    view: "grid",
    route: "#/library",
    probe: false,
    audit: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--probe") options.probe = true;
    else if (arg === "--audit") options.audit = true;
    else if (arg === "--skip-build") options.skipBuild = true;
    else if (arg === "--fixtures") options.fixtures = argv[++i] === "real" ? "real" : "demo";
    else if (arg === "--theme") options.theme = argv[++i] === "dark" ? "dark" : "light";
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--select") options.select = Number(argv[++i]);
    else if (arg === "--view") options.view = argv[++i] === "table" ? "table" : "grid";
    else if (arg === "--route") options.route = argv[++i] || "#/library";
    else if (arg === "--help" || arg === "-h") {
      console.log("用法见 scripts/ui-shot/shot.mjs 顶部注释");
      process.exit(0);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

function runBuild() {
  log("npm run build");
  const result = spawnSync("npm run build", {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    windowsHide: true,
    timeout: 300000,
  });
  if (result.status !== 0) {
    throw new Error(`构建失败（退出码 ${result.status}），已停止截图/压测`);
  }
}

function startPreview() {
  // Vite 8 默认只绑 localhost(::1)，显式绑 127.0.0.1 以便 CDP 与轮询统一走 IPv4
  log("npx vite preview --host 127.0.0.1 --port 4173 --strictPort");
  const child = spawn("npx vite preview --host 127.0.0.1 --port 4173 --strictPort", {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stderrText = "";
  child.stdout.on("data", (chunk) => {
    if (process.env.UI_SHOT_VERBOSE) process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    child.stderrText = (child.stderrText + String(chunk)).slice(-4000);
    if (process.env.UI_SHOT_VERBOSE) process.stderr.write(chunk);
  });
  return child;
}

async function waitForPreview(preview, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (preview.exitCode !== null) {
      throw new Error(
        `vite preview 提前退出（${preview.exitCode}）：${preview.stderrText || "无输出"}`,
      );
    }
    try {
      const response = await fetch(`${ORIGIN}/`, { redirect: "manual" });
      if (response.status > 0 && response.status < 500) return;
    } catch {
      // 还没监听
    }
    await delay(200);
  }
  throw new Error("vite preview 未在 30s 内就绪");
}

function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("未找到 msedge.exe，请用 EDGE_PATH 指定路径");
}

function resetProfileDir() {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

function launchEdge() {
  resetProfileDir();
  const edgePath = findEdge();
  log(`msedge --headless=new (${edgePath})`);
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
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
}

async function waitForDevToolsPort(timeoutMs = 30000) {
  const portFile = path.join(PROFILE_DIR, "DevToolsActivePort");
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const lines = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
      const port = Number(lines[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // 文件还没生成
    }
    await delay(120);
  }
  throw new Error("未读到 DevToolsActivePort，Edge 可能未启动");
}

async function connectCdp(wsUrl) {
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
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result);
    }
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP WebSocket 连接失败")), {
      once: true,
    });
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP 超时：${method}`));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
    });

  return { socket, send };
}

async function attachPage(cdp) {
  let targets = (await cdp.send("Target.getTargets")).targetInfos.filter(
    (target) => target.type === "page",
  );
  if (!targets.length) {
    await cdp.send("Target.createTarget", { url: "about:blank" });
    targets = (await cdp.send("Target.getTargets")).targetInfos.filter(
      (target) => target.type === "page",
    );
  }
  if (!targets.length) throw new Error("没有可用的 page target");
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: targets[0].targetId,
    flatten: true,
  });
  return sessionId;
}

async function evaluate(cdp, sessionId, expression, label = "evaluate") {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true, userGesture: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      "unknown exception";
    throw new Error(`${label} 执行失败：${detail}`);
  }
  return result.result?.value;
}

const READY_EXPRESSION = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, timeout = 10000, label = "condition") => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      try { if (fn()) return true; } catch (error) { /* retry */ }
      await sleep(50);
    }
    return label;
  };
  const rail = await until(() => document.querySelectorAll(".rail-item").length > 0, 10000, "rail-item");
  if (rail !== true) return "rail-item 未出现";
  const list = await until(
    () => document.querySelectorAll("#content-list .list-card, #content-list .table-shell").length > 0,
    10000,
    "list",
  );
  if (list !== true) return "列表未出现";
  await document.fonts.ready;
  const images = await until(
    () => Array.from(document.images)
      .filter((img) => {
        const box = img.getBoundingClientRect();
        return box.top < window.innerHeight && box.bottom > 0;
      })
      .every((img) => img.complete === true),
    8000,
    "images",
  );
  if (images !== true) return "图片未加载完成";
  await sleep(400);
  return "ok";
})()`;

async function waitReady(cdp, sessionId) {
  const status = await evaluate(cdp, sessionId, READY_EXPRESSION, "waitReady");
  if (status !== "ok") throw new Error(`页面就绪检查失败：${status}`);
}

async function preparePage(cdp, sessionId, options) {
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);

  const data = options.fixtures === "real" ? loadRealFixtures() : buildFixtures();
  const source = `(${installTauriStub.toString()})(${JSON.stringify(data)});`;
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source }, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await setTheme(cdp, sessionId, options.theme);

  const route = options.route.startsWith("#") ? `/${options.route}` : options.route;
  await cdp.send("Page.navigate", { url: `${ORIGIN}${route}` }, sessionId);
  await waitReady(cdp, sessionId);

  if (options.view === "table") {
    await clickView(cdp, sessionId, "表格");
  }
  if (Number.isInteger(options.select)) {
    const selected = await examineSelect(cdp, sessionId, options.select, options.view);
    if (!selected) throw new Error(`--select ${options.select} 没有对应卡片`);
  }
  await delay(400);
}

async function setTheme(cdp, sessionId, theme) {
  await cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-color-scheme", value: theme }] },
    sessionId,
  );
}

async function clickView(cdp, sessionId, label) {
  const clicked = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const group = document.querySelector('[role="group"][aria-label="列表视图"]');
      if (!group) return false;
      const button = [...group.querySelectorAll("button")].find(
        (node) => node.textContent.trim() === ${JSON.stringify(label)},
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
    "clickView",
  );
  if (!clicked) throw new Error(`未找到视图按钮：${label}`);
  await delay(350);
}

async function examineSelect(cdp, sessionId, index, view) {
  return evaluate(
    cdp,
    sessionId,
    `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const nodes = [...document.querySelectorAll(
        ${JSON.stringify(view === "table" ? "#content-list .cell-title" : "#content-list .list-card")},
      )];
      const node = nodes[${index}];
      if (!node) return false;
      node.scrollIntoView({ block: "nearest" });
      await wait(50);
      node.click();
      await wait(150);
      return true;
    })()`,
    "selectCase",
  );
}

async function capture(cdp, sessionId, file) {
  const result = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false },
    sessionId,
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  const size = fs.statSync(file).size;
  log(`截图 ${path.relative(ROOT, file)} · ${size} bytes`);
  return { file, size };
}

async function drainErrors(cdp, sessionId) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const all = window.__shotErrors || [];
      const start = window.__shotErrorCursor || 0;
      window.__shotErrorCursor = all.length;
      return all.slice(start);
    })()`,
    "drainErrors",
  );
}

const LAYOUT_EXPRESSION = `(() => {
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      left: Math.round(box.left),
      top: Math.round(box.top),
      right: Math.round(box.right),
      bottom: Math.round(box.bottom),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  };
  const rail = document.querySelector(".rail") || document.querySelector("aside");
  const middle = document.querySelector('main section[aria-label$="列表"]');
  const detail = document.querySelector('main section[aria-label$="详情"]');
  const scroller = document.getElementById("content-list");
  const scrollerBox = scroller ? rect(scroller) : null;
  const middleBox = rect(middle);
  const cards = [...document.querySelectorAll("#content-list .list-card")].map((card) => {
    const box = rect(card);
    return {
      label: card.getAttribute("aria-label"),
      rect: box,
      horizontallyInside: Boolean(
        middleBox && box.left >= middleBox.left - 1 && box.right <= middleBox.right + 1,
      ),
      verticallyInsideViewport: Boolean(
        scrollerBox && box.top >= scrollerBox.top - 1 && box.bottom <= scrollerBox.bottom + 1,
      ),
    };
  });
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    },
    rail: rect(rail),
    middle: middleBox,
    detail: rect(detail),
    scroller: scrollerBox,
    cardCount: cards.length,
    cardsOutsideMiddle: cards.filter((card) => !card.horizontallyInside),
    cardsVerticalOverscan: cards.filter(
      (card) => card.horizontallyInside && !card.verticallyInsideViewport,
    ).length,
    theme: document.documentElement.dataset.theme || null,
  };
})()`;

const OVERFLOW_EXPRESSION = `(() => {
  const offenders = [];
  const beyondViewport = [];
  for (const element of document.querySelectorAll("body *")) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.right > window.innerWidth + 1) {
      beyondViewport.push({
        tag: element.tagName.toLowerCase(),
        className: String(element.className || "").slice(0, 120),
        right: Math.round(box.right),
        width: Math.round(box.width),
      });
    }
    const delta = element.scrollWidth - element.clientWidth;
    if (delta <= 1) continue;
    const style = getComputedStyle(element);
    if (style.overflowX === "hidden" || style.overflowX === "clip") continue;
    offenders.push({
      tag: element.tagName.toLowerCase(),
      className: String(element.className || "").slice(0, 120),
      scrollWidth: Math.round(element.scrollWidth),
      clientWidth: Math.round(element.clientWidth),
      delta: Math.round(delta),
      overflowX: style.overflowX,
      width: Math.round(box.width),
    });
  }
  offenders.sort((a, b) => b.delta - a.delta);
  return {
    count: offenders.length,
    offenders: offenders.slice(0, 15),
    beyondViewport: beyondViewport.slice(0, 10),
  };
})()`;

const TABLE_ALIGNMENT_EXPRESSION = `(() => {
  const headers = [...document.querySelectorAll("#content-list .list-table thead th")];
  const rows = [...document.querySelectorAll("#content-list .list-table tbody tr")].filter(
    (row) => row.querySelectorAll("td").length === headers.length,
  );
  const row = rows[0];
  if (!row) return { error: "没有可对照的表格行" };
  const cells = [...row.querySelectorAll("td")];
  return {
    headers: headers.map((th, index) => {
      const a = th.getBoundingClientRect();
      const b = cells[index]?.getBoundingClientRect();
      return {
        label: (th.textContent || "").trim() || "col-" + index,
        thLeft: Math.round(a.left),
        thWidth: Math.round(a.width),
        tdLeft: b ? Math.round(b.left) : null,
        tdWidth: b ? Math.round(b.width) : null,
        deltaLeft: b ? Math.round(b.left - a.left) : null,
        deltaWidth: b ? Math.round(b.width - a.width) : null,
      };
    }),
  };
})()`;

async function runProbe(cdp, sessionId) {
  const report = {
    steps: [],
    errors: [],
    layout: null,
    overflowGrid: null,
    overflowTable: null,
    tableAlignment: null,
    themeSwitches: [],
    screenshots: [],
  };

  const step = async (name, fn) => {
    await fn();
    const errors = (await drainErrors(cdp, sessionId)) || [];
    report.steps.push({ name, errors });
    if (errors.length) {
      log(`步骤「${name}」产生 ${errors.length} 条 console/异常记录`);
    }
  };

  await step("左栏连续点击 ×20", async () => {
    await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        let railClicks = 0;
        for (let i = 0; i < 20; i += 1) {
          const items = [...document.querySelectorAll("aside .rail-item:not(.rail-item-sm)")];
          if (!items.length) break;
          items[i % items.length].click();
          railClicks += 1;
          await wait(55);
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await wait(20);
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await wait(20);
        }
        const tiles = [...document.querySelectorAll(".quick-tile")];
        for (const tile of tiles) {
          tile.click();
          await wait(80);
        }
        location.hash = "#/library";
        await wait(350);
        return { railClicks, tiles: tiles.length, route: location.hash };
      })()`,
      "probe.rail",
    );
  });

  await step("网格/表格切换 ×20", async () => {
    await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const group = () => document.querySelector('[role="group"][aria-label="列表视图"]');
        for (let i = 0; i < 20; i += 1) {
          const buttons = group() ? [...group().querySelectorAll("button")] : [];
          if (buttons.length < 2) break;
          const label = i % 2 === 0 ? "表格" : "网格";
          const button = buttons.find((node) => node.textContent.trim() === label);
          button?.click();
          await wait(55);
        }
        const buttons = group() ? [...group().querySelectorAll("button")] : [];
        buttons.find((node) => node.textContent.trim() === "网格")?.click();
        await wait(300);
        return true;
      })()`,
      "probe.view",
    );
  });

  await step("搜索输入与清空", async () => {
    await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const input = document.querySelector('input[aria-label="搜索案例"]');
        if (!input) return "no-input";
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(input, "玻璃");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(420);
        const filtered = document.querySelectorAll("#content-list .list-card").length;
        setter.call(input, "不存在的关键词");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(420);
        const empty = document.body.textContent.includes("没有匹配的案例");
        setter.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(450);
        return { filtered, empty };
      })()`,
      "probe.search",
    );
  });

  await step("连续点选卡片 ×10", async () => {
    await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const scroller = document.getElementById("content-list");
        const seen = new Set();
        for (let i = 0; i < 14 && seen.size < 10; i += 1) {
          const cards = [...document.querySelectorAll("#content-list .list-card")];
          if (!cards.length) break;
          const card = cards[i % cards.length];
          card.click();
          seen.add(card.getAttribute("aria-label"));
          await wait(60);
          if (scroller && i >= cards.length - 1) {
            scroller.scrollTop += 260;
            await wait(120);
          }
        }
        if (scroller) scroller.scrollTop = 0;
        await wait(150);
        const first = document.querySelector("#content-list .list-card");
        first?.click();
        await wait(250);
        return seen.size;
      })()`,
      "probe.cards",
    );
  });

  await step("素材展开/收起", async () => {
    await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const assetsButton = [...document.querySelectorAll('main section[aria-label$="详情"] button[aria-expanded]')]
          .find((node) => node.textContent.includes("素材"));
        if (!assetsButton) return "no-assets";
        assetsButton.click();
        await wait(220);
        const open = assetsButton.getAttribute("aria-expanded");
        assetsButton.click();
        await wait(180);
        return open;
      })()`,
      "probe.assets",
    );
  });

  await step("危险操作展开/取消", async () => {
    await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const details = [...document.querySelectorAll("main section[aria-label$='详情'] details.detail-section")]
          .find((node) => node.textContent.includes("更多操作"));
        if (!details) return "no-danger";
        details.querySelector("summary")?.click();
        await wait(150);
        const buttons = () => [...details.querySelectorAll("button")];
        const del = buttons().find((node) => node.textContent.trim() === "删除");
        del?.click();
        await wait(120);
        const confirming = buttons().some((node) => node.textContent.trim() === "确认删除");
        const cancel = buttons().find((node) => node.textContent.trim() === "取消");
        cancel?.click();
        await wait(120);
        details.querySelector("summary")?.click();
        await wait(120);
        return { confirming };
      })()`,
      "probe.danger",
    );
  });

  await step("参数拖动与回车", async () => {
    await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const detail = document.querySelector('main section[aria-label$="详情"]');
        if (!detail) return "no-detail";
        const numberInput = detail.querySelector(".param-number");
        if (numberInput) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          const min = Number(numberInput.min);
          const max = Number(numberInput.max);
          const next = String(Math.round((min + max) / 2));
          setter.call(numberInput, next);
          numberInput.dispatchEvent(new Event("input", { bubbles: true }));
          numberInput.dispatchEvent(new Event("change", { bubbles: true }));
          numberInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          await wait(160);
        }
        const range = detail.querySelector(".param-range");
        if (range) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          const next = String(Math.round((Number(range.min) + Number(range.max)) * 0.65));
          setter.call(range, next);
          range.dispatchEvent(new Event("input", { bubbles: true }));
          range.dispatchEvent(new Event("change", { bubbles: true }));
          await wait(160);
        }
        const select = detail.querySelector(".param-select");
        if (select && select.options.length > 1) {
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
          setter.call(select, select.options[select.options.length - 1].value);
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        await wait(900);
        return true;
      })()`,
      "probe.params",
    );
  });

  await step("深浅主题切换 ×6", async () => {
    for (let i = 0; i < 6; i += 1) {
      const theme = i % 2 === 0 ? "dark" : "light";
      await setTheme(cdp, sessionId, theme);
      const actual = await evaluate(
        cdp,
        sessionId,
        `(async () => {
          await new Promise((r) => setTimeout(r, 180));
          return document.documentElement.dataset.theme || null;
        })()`,
        "probe.theme",
      );
      report.themeSwitches.push({ requested: theme, actual });
    }
    await setTheme(cdp, sessionId, "light");
    await delay(250);
  });

  await evaluate(
    cdp,
    sessionId,
    `(async () => {
      location.hash = "#/library";
      const scroller = document.getElementById("content-list");
      if (scroller) scroller.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 350));
      return true;
    })()`,
    "probe.reset",
  );
  await drainErrors(cdp, sessionId);

  report.layout = await evaluate(cdp, sessionId, LAYOUT_EXPRESSION, "layout");
  report.overflowGrid = await evaluate(cdp, sessionId, OVERFLOW_EXPRESSION, "overflow-grid");

  await setTheme(cdp, sessionId, "light");
  await clickView(cdp, sessionId, "表格");
  await evaluate(
    cdp,
    sessionId,
    `(() => { const scroller = document.getElementById("content-list"); if (scroller) scroller.scrollTop = 0; return true; })()`,
    "table-top",
  );
  await delay(300);
  report.tableAlignment = await evaluate(
    cdp,
    sessionId,
    TABLE_ALIGNMENT_EXPRESSION,
    "table-alignment",
  );
  report.overflowTable = await evaluate(cdp, sessionId, OVERFLOW_EXPRESSION, "overflow-table");
  report.screenshots.push(
    await capture(cdp, sessionId, path.join(PROBE_DIR, "table-light.png")),
  );

  await clickView(cdp, sessionId, "网格");
  await delay(300);
  const hoverPoint = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const card = document.querySelector("#content-list .list-card");
      if (!card) return null;
      const box = card.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    })()`,
    "hover-point",
  );
  if (hoverPoint) {
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: hoverPoint.x, y: hoverPoint.y, button: "none" },
      sessionId,
    );
    await delay(260);
  }
  report.screenshots.push(
    await capture(cdp, sessionId, path.join(PROBE_DIR, "hover-light.png")),
  );
  if (hoverPoint) {
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: 4, y: 4, button: "none" },
      sessionId,
    );
    await delay(160);
  }

  const detailScrolled = await evaluate(
    cdp,
    sessionId,
    `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const scroller = document.querySelector('main section[aria-label$="详情"] div.overflow-y-auto');
      if (!scroller) return false;
      scroller.scrollTop = Math.min(420, scroller.scrollHeight - scroller.clientHeight);
      await wait(280);
      return scroller.scrollTop;
    })()`,
    "detail-scroll",
  );
  log(`详情滚动位置：${detailScrolled}`);
  report.screenshots.push(
    await capture(cdp, sessionId, path.join(PROBE_DIR, "detail-scrolled-light.png")),
  );

  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const scroller = document.querySelector('main section[aria-label$="详情"] div.overflow-y-auto');
      if (scroller) scroller.scrollTop = 0;
      return true;
    })()`,
    "detail-reset",
  );
  await setTheme(cdp, sessionId, "dark");
  await delay(420);
  report.screenshots.push(
    await capture(cdp, sessionId, path.join(PROBE_DIR, "grid-dark.png")),
  );
  await setTheme(cdp, sessionId, "light");
  await delay(200);

  const tailErrors = (await drainErrors(cdp, sessionId)) || [];
  if (tailErrors.length) report.steps.push({ name: "收尾", errors: tailErrors });

  report.errors = report.steps.flatMap((stepResult) =>
    stepResult.errors.map((error) => ({ step: stepResult.name, ...error })),
  );
  return report;
}

const AUDIT_EXPRESSION = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const stage = document.querySelector(".preview-stage");
  if (!stage) return { error: "找不到 .preview-stage" };
  const scene = stage.querySelector('.pv-scene[data-bench="true"]');
  if (!scene) return { error: "找不到 .pv-scene[data-bench=true]" };
  const s = stage.getBoundingClientRect();
  const b = scene.getBoundingClientRect();
  const overflow = {
    left: round(Math.max(0, s.left - b.left)),
    top: round(Math.max(0, s.top - b.top)),
    right: round(Math.max(0, b.right - s.right)),
    bottom: round(Math.max(0, b.bottom - s.bottom)),
  };
  return {
    kind: stage.getAttribute("data-kind"),
    stage: { x: round(s.left), y: round(s.top), w: round(s.width), h: round(s.height) },
    scene: { x: round(b.left), y: round(b.top), w: round(b.width), h: round(b.height) },
    heightRatio: round((b.height / s.height) * 100),
    centerOffset: round(((b.left + b.width / 2 - (s.left + s.width / 2)) / s.width) * 100),
    overflow,
    overflowTotal: round(Math.max(...Object.values(overflow))),
  };
})()`;

async function runAudit(cdp, sessionId) {
  const entries = [];
  const failures = [];
  const processed = new Set();
  let guard = 0;

  const visibleLabels = () =>
    evaluate(
      cdp,
      sessionId,
      `[...document.querySelectorAll("#content-list .list-card")].map((card) => ({
        label: card.getAttribute("aria-label"),
        poster: Boolean(
          card.querySelector('.list-card-thumb img[src^="data:image/svg"]'),
        ),
      }))`,
      "audit.list",
    );

  while (guard < 80) {
    guard += 1;
    const cards = (await visibleLabels()) || [];
    for (const card of cards) {
      if (!card.label || processed.has(card.label)) continue;
      processed.add(card.label);

      const selected = await evaluate(
        cdp,
        sessionId,
        `(async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const card = [...document.querySelectorAll("#content-list .list-card")].find(
            (node) => node.getAttribute("aria-label") === ${JSON.stringify(card.label)},
          );
          if (!card) return false;
          card.scrollIntoView({ block: "nearest" });
          await wait(60);
          card.click();
          await wait(560);
          return true;
        })()`,
        "audit.select",
      );
      if (!selected) {
        failures.push({ label: card.label, reason: "卡片在点击前消失" });
        continue;
      }

      const kind = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const stage = document.querySelector(".preview-stage");
          return stage ? stage.getAttribute("data-kind") : null;
        })()`,
        "audit.kind",
      );
      if (!kind) {
        failures.push({ label: card.label, reason: "详情未渲染预览舞台" });
        continue;
      }

      const frozen = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const stage = document.querySelector(".preview-stage");
          if (!stage) return 0;
          const fraction = ${kind === "feedback" ? 0.22 : kind === "theme" ? 0.62 : 0.45};
          let count = 0;
          for (const animation of document.getAnimations()) {
            const target = animation.effect && animation.effect.target;
            if (!(target instanceof Element) || !stage.contains(target)) continue;
            try {
              const timing = animation.effect.getComputedTiming();
              const duration = Number(timing.duration) || 0;
              const delay = Number(timing.delay) || 0;
              animation.pause();
              animation.currentTime = delay + duration * fraction;
              count += 1;
            } catch {
              // 跳过不可暂停的动画
            }
          }
          return count;
        })()`,
        "audit.freeze",
      );
      void frozen;

      const metrics = await evaluate(cdp, sessionId, AUDIT_EXPRESSION, "audit.measure");
      const entry = {
        label: card.label,
        poster: card.poster,
        ...(metrics.error ? { error: metrics.error } : metrics),
      };
      entries.push(entry);

      const pass =
        !metrics.error &&
        card.poster &&
        metrics.heightRatio >= 60 &&
        Math.abs(metrics.centerOffset) <= 2 &&
        metrics.overflowTotal <= 1;
      if (!pass) {
        const file = path.join(
          PROBE_DIR,
          `audit-fail-${String(failures.length + 1).padStart(2, "0")}-${kind}.png`,
        );
        const shot = await capture(cdp, sessionId, file);
        failures.push({
          label: card.label,
          kind,
          poster: card.poster,
          reason: metrics.error || "场景主体不达标",
          file: path.relative(ROOT, file),
          size: shot.size,
          heightRatio: metrics.heightRatio,
          centerOffset: metrics.centerOffset,
          overflowTotal: metrics.overflowTotal,
        });
      }
    }

    const moved = await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const scroller = document.getElementById("content-list");
        if (!scroller) return { before: 0, after: 0, atBottom: true };
        const before = scroller.scrollTop;
        scroller.scrollTop = before + Math.max(240, scroller.clientHeight * 0.8);
        await wait(280);
        const after = scroller.scrollTop;
        return {
          before,
          after,
          atBottom: after + scroller.clientHeight >= scroller.scrollHeight - 2,
        };
      })()`,
      "audit.scroll",
    );
    if (!moved || (moved.after === moved.before && moved.atBottom)) break;
  }

  const errors = (await drainErrors(cdp, sessionId)) || [];
  log(`审计完成：${entries.length} 条有预览舞台，${processed.size} 张卡片被点到`);
  if (errors.length) log(`审计期间控制台/异常 ${errors.length} 条`);

  const report = { entries, failures, errors, processed: processed.size };
  fs.mkdirSync(PROBE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(PROBE_DIR, "audit-failures.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  return report;
}

function summarizeAudit(report) {
  const { entries, failures, errors } = report;
  console.log("\n=== 全量预览审计 ===");
  console.log(`已审计 ${entries.length} 条；失败 ${failures.length} 条；控制台错误 ${errors.length} 条`);
  const byKind = new Map();
  for (const entry of entries) {
    const key = entry.kind || entry.label;
    byKind.set(key, (byKind.get(key) || 0) + 1);
  }
  console.log(
    `按类型：${[...byKind.entries()].map(([kind, count]) => `${kind} ${count}`).join(" / ")}`,
  );
  const ratios = entries.filter((entry) => !entry.error).map((entry) => entry.heightRatio);
  if (ratios.length) {
    console.log(
      `场景高度占比：最小 ${Math.min(...ratios).toFixed(1)}%；中位 ${ratios
        .sort((a, b) => a - b)
        [Math.floor(ratios.length / 2)].toFixed(1)}%`,
    );
  }
  for (const failure of failures) {
    console.log(`FAIL ${failure.label} · ${failure.reason} ${failure.file || ""}`);
  }
  for (const error of errors.slice(0, 10)) {
    console.log(`ERR  ${error.kind}: ${error.text}`);
  }
  console.log("失败明细：.screenshots/1.0.9/_probe/audit-failures.json");
  console.log("====================\n");
  console.log(JSON.stringify({ entries: entries.length, failures, errors }, null, 2));
}

function cleanupProcess(child, label) {
  if (!child || child.killed || child.exitCode !== null) return;
  log(`结束 ${label} 进程 ${child.pid}`);
  try {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

function summarizeReport(report, options) {
  const errors = report.errors || [];
  const counts = new Map();
  for (const error of errors) {
    const key = `${error.kind}: ${error.text}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  console.log("\n=== 无窗口压测结果 ===");
  console.log(`视口：${report.layout?.viewport?.width}×${report.layout?.viewport?.height}`);
  console.log(
    `三栏：rail ${JSON.stringify(report.layout?.rail)} / middle ${JSON.stringify(
      report.layout?.middle,
    )} / detail ${JSON.stringify(report.layout?.detail)}`,
  );
  console.log(
    `文档：scrollWidth=${report.layout?.document?.scrollWidth} innerWidth=${report.layout?.document?.clientWidth}`,
  );
  console.log(
    `横向溢出断言：${
      (report.layout?.document?.scrollWidth ?? 0) <= (report.layout?.document?.clientWidth ?? 0)
        ? "通过"
        : "失败"
    }`,
  );
  console.log(
    `中栏卡片：${report.layout?.cardCount} 张，水平越界 ${
      report.layout?.cardsOutsideMiddle?.length ?? 0
    } 张，纵向 overscan ${report.layout?.cardsVerticalOverscan ?? 0} 张（虚拟列表预期）`,
  );
  if (report.layout?.cardsOutsideMiddle?.length) {
    console.log(JSON.stringify(report.layout.cardsOutsideMiddle, null, 2));
  }
  console.log(
    `非裁剪横向溢出元素：grid=${report.overflowGrid?.count ?? 0} table=${
      report.overflowTable?.count ?? 0
    }`,
  );
  if (report.overflowGrid?.offenders?.length) {
    console.log(JSON.stringify(report.overflowGrid.offenders, null, 2));
  }
  if (report.overflowGrid?.beyondViewport?.length) {
    console.log("超出视口右侧：", JSON.stringify(report.overflowGrid.beyondViewport, null, 2));
  }
  console.log("表头/单元格对齐：", JSON.stringify(report.tableAlignment, null, 2));
  console.log(
    "深浅切换：",
    report.themeSwitches.map((entry) => `${entry.requested}→${entry.actual}`).join(" "),
  );
  console.log(`截图：${report.screenshots.length} 张`);
  for (const shot of report.screenshots) {
    console.log(`  ${path.relative(ROOT, shot.file)} · ${shot.size} bytes`);
  }
  console.log(`控制台/异常：${errors.length} 条`);
  for (const [key, count] of counts) {
    console.log(`  ×${count} ${key}`);
  }
  console.log("======================\n");
  console.log(JSON.stringify({ ...report, mode: options.probe ? "probe" : "shot" }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let preview = null;
  let edge = null;
  let cdp = null;

  try {
    if (!options.skipBuild) runBuild();
    preview = startPreview();
    await waitForPreview(preview);

    edge = launchEdge();
    const devtoolsPort = await waitForDevToolsPort();
    const versionResponse = await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`);
    if (!versionResponse.ok) throw new Error(`DevTools /json/version 返回 ${versionResponse.status}`);
    const version = await versionResponse.json();
    if (!version.webSocketDebuggerUrl) throw new Error("/json/version 缺少 webSocketDebuggerUrl");

    cdp = await connectCdp(version.webSocketDebuggerUrl);
    const sessionId = await attachPage(cdp);
    await preparePage(cdp, sessionId, options);

    if (options.audit) {
      const report = await runAudit(cdp, sessionId);
      summarizeAudit(report);
      if (report.failures.length) process.exitCode = 1;
    } else if (options.probe) {
      const report = await runProbe(cdp, sessionId);
      summarizeReport(report, options);
    } else {
      const outFile = path.resolve(
        ROOT,
        options.out || `.screenshots/1.0.9/main-${options.theme}.png`,
      );
      const shot = await capture(cdp, sessionId, outFile);
      const state = await evaluate(
        cdp,
        sessionId,
        `({
          title: document.querySelector('main section[aria-label$="详情"] h1, main section[aria-label$="详情"] h2')?.textContent?.trim() || null,
          theme: document.documentElement.dataset.theme || null,
          view: document.querySelector('[role="group"][aria-label="列表视图"] button[aria-pressed="true"]')?.textContent?.trim() || null,
          detailPresent: Boolean(document.querySelector('main section[aria-label$="详情"] .preview-stage')),
          listCards: document.querySelectorAll("#content-list .list-card").length,
        })`,
        "final-state",
      );
      log(`输出 ${path.relative(ROOT, shot.file)} · ${shot.size} bytes`);
      console.log(JSON.stringify({ file: path.relative(ROOT, shot.file), size: shot.size, state }, null, 2));
    }
  } finally {
    try {
      cdp?.socket?.close();
    } catch {
      // ignore
    }
    cleanupProcess(edge, "Edge");
    cleanupProcess(preview, "vite preview");
    await delay(400);
    try {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // ignore
    }
  }
}

main().catch((error) => {
  console.error("[ui-shot] 失败：", error?.stack || error);
  process.exitCode = 1;
});
