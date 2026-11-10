/**
 * 参数证据链（specRef）验收：
 * 1) 内容侧：9 行参数级 verified，且每行 specRef 五字段齐全、URL 为 https、quote 对得上数值
 * 2) 界面：参数行来源点可点开，弹层显示平台版本、组件、原文引句与可点链接
 * 3) 无 specRef 的参数点开显示「无官方原文，来源为推测」
 * 4) 口径徽标：平台条目显示 平台 · 版本，通用控件显示「非平台绑定」
 * 5) 老包兼容：payload v2 声称 verified 但无 specRef，前端降级为 estimated
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { installTauriStub } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ORIGIN = "http://127.0.0.1:4178";
const PROFILE_DIR = path.join(ROOT, ".screenshots", ".edge-spec-ref");
const SOURCE = path.join(ROOT, "content", "v1", "items.json");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log("[spec-ref]", ...args);

const checks = [];
function record(name, pass, detail) {
  checks.push({ name, pass, detail });
  log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
}

/* ------------------------------ 内容侧校验 ------------------------------ */

const data = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const items = data.items;

function numberTokens(text) {
  return String(text).match(/\d+(?:\.\d+)?/g) ?? [];
}
function bezierValues(text) {
  const match = String(text).match(/cubic-bezier\(([^)]+)\)/);
  if (!match) return null;
  const values = match[1].split(",").map((part) => Number(part.trim()));
  return values.length === 4 && values.every((value) => Number.isFinite(value)) ? values : null;
}
function quoteMatches(actual, quote) {
  if (typeof actual === "number") {
    return new RegExp(`(^|[^\\d.])${String(actual).replace(".", "\\.")}([^\\d.]|$)`).test(quote);
  }
  const bezier = bezierValues(actual);
  if (bezier) {
    const quoted = bezierValues(quote);
    return Boolean(quoted) && bezier.every((value, index) => Math.abs(value - quoted[index]) < 1e-9);
  }
  const tokens = numberTokens(actual);
  if (tokens.length === 0) return false;
  return tokens.every((token) => quote.includes(token));
}
function validRef(ref) {
  if (!ref || typeof ref !== "object") return false;
  const fields = ["platform", "version", "component", "url", "quote"];
  return fields.every(
    (key) => typeof ref[key] === "string" && ref[key].trim().length > 0,
  ) && ref.url.startsWith("https://");
}

const verifiedRows = [];
const problems = [];
for (const item of items) {
  for (const [key, level] of Object.entries(item.paramSources ?? {})) {
    if (level !== "verified") continue;
    verifiedRows.push(`${item.id}.${key}`);
    const ref = item.paramRefs?.[key];
    if (!validRef(ref)) problems.push(`${item.id}.${key} 缺合法 specRef`);
    else if (!(key in item.preview)) problems.push(`${item.id}.${key} 不在 preview 中`);
    else if (!quoteMatches(item.preview[key], ref.quote)) {
      problems.push(`${item.id}.${key} 引句与数值不对应`);
    }
  }
  for (const [key, ref] of Object.entries(item.paramRefs ?? {})) {
    if (!validRef(ref)) problems.push(`${item.id}.${key} specRef 不完整`);
  }
  for (const [key, list] of Object.entries(item.paramRefAlts ?? {})) {
    if (!Array.isArray(list) || !list.every(validRef)) problems.push(`${item.id}.${key} 参考值不合法`);
  }
}

record("参数级 verified 恰为 9 行", verifiedRows.length === 9, verifiedRows);
record("全部 specRef 五字段齐全且 https、引句对得上数值", problems.length === 0, problems);

const material3 = items.find((item) => item.id === "style.material3");
record(
  "style.material3 缓动为 M3 Standard (0.2,0,0,1)",
  material3?.preview?.easing === "cubic-bezier(0.2,0,0,1)",
  material3?.preview?.easing,
);
record(
  "style.material3 绑定 Material 3 Expressive 2025+",
  material3?.specBinding?.bound === true && material3?.specBinding?.version === "Expressive 2025+",
  material3?.specBinding,
);
record(
  "缓动 specRef 版本写明 Pre-Expressive 且官方已停维护",
  /Pre-Expressive/.test(material3?.paramRefs?.easing?.version ?? "") &&
    /no longer maintained/.test(material3?.paramRefs?.easing?.version ?? ""),
  material3?.paramRefs?.easing?.version,
);

const components = items.filter((item) => item.kind === "component");
const generic = components.filter((item) => item.specBinding?.bound === false);
record(
  "33 个通用控件标注非平台绑定",
  components.length === 33 && generic.length === 33,
  { components: components.length, generic: generic.length },
);

const hitTargetItems = components.filter((item) => typeof item.preview?.hitTarget === "number");
record(
  "外扩热区控件带 WCAG 2.2 SC 2.5.8 原文与三平台参考值",
  hitTargetItems.length === 8 &&
    hitTargetItems.every(
      (item) =>
        item.paramRefs?.hitTarget?.url.includes("WCAG22") &&
        (item.paramRefAlts?.hitTarget?.length ?? 0) === 3,
    ),
  hitTargetItems.map((item) => item.id),
);

/* ------------------------------ 夹具 ------------------------------ */

function sourcesFor(item) {
  const timing = {
    style: ["durationMs", "easing"],
    theme: ["durationMs", "holdMs", "easing"],
    component: ["durationMs", "easing"],
    motion: ["easing"],
    feedback: ["easing"],
  }[item.kind] ?? [];
  const structural = {
    style: ["treatment"],
    motion: ["scene"],
    feedback: ["scene"],
    theme: ["scene"],
    component: ["control"],
  }[item.kind] ?? [];
  const out = {};
  for (const key of Object.keys(item.preview)) {
    if (key === "v" || key === "kind") continue;
    if (item.unknown?.includes(key)) out[key] = "unknown";
    else if (item.reused && structural.includes(key)) out[key] = "user_defined";
    else if (timing.includes(key)) out[key] = "user_defined";
    else out[key] = "estimated";
  }
  return { ...out, ...(item.paramSources ?? {}) };
}

function payloadOf(item) {
  return JSON.stringify({
    v: 3,
    preview: item.preview,
    prompt: item.prompt ?? "",
    paramSources: sourcesFor(item),
    ...(item.paramRefs ? { paramRefs: item.paramRefs } : {}),
    ...(item.paramRefAlts ? { paramRefAlts: item.paramRefAlts } : {}),
    ...(item.specBinding ? { specBinding: item.specBinding } : {}),
  });
}

function caseOf(item) {
  const stamp = "2026-11-10T00:00:00.000Z";
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    payloadJson: payloadOf(item),
    confidence: item.confidence ?? "estimated",
    isFavorite: false,
    createdAt: stamp,
    updatedAt: stamp,
    categoryId: item.categoryId,
    platform: "web",
    componentLayer: null,
  };
}

const pick = (id) => {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`items.json 缺少 ${id}`);
  return found;
};

// 老包：payload v2，声称 verified 但没有 paramRefs / specBinding
const legacy = {
  id: "legacy.old-package",
  kind: "style",
  title: "老包样式",
  summary: "模拟 1.0.14 之前的内容包条目：声称 verified，但没有官方原文。",
  payloadJson: JSON.stringify({
    v: 2,
    preview: { v: 2, kind: "style", treatment: "flat", radiusPx: 8, depth: 2, durationMs: 200, easing: "ease-out" },
    paramSources: { easing: "verified", durationMs: "verified" },
  }),
  confidence: "estimated",
  isFavorite: false,
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  categoryId: "style.family.genre",
  platform: "web",
  componentLayer: null,
};

const cases = [pick("style.material3"), pick("comp.switch"), pick("comp.icon-button")].map(caseOf);
cases.push({ ...legacy, title: legacy.title });

const { buildCatalog, buildFixtures } = await import("./fixtures.mjs");
const base = buildFixtures();
const FIXTURES = {
  ...base,
  cases,
  catalog: buildCatalog(cases),
  collections: [],
  collectionIds: {},
  tags: [],
  tagsByCase: {},
  appInfo: { ...base.appInfo, caseCount: cases.length },
};

/* ------------------------------ 浏览器 ------------------------------ */

function startPreview() {
  return spawn("npx vite preview --host 127.0.0.1 --port 4178 --strictPort", {
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

const openCase = (title) => `(() => {
  const card = [...document.querySelectorAll("[data-case-id]")].find((node) =>
    (node.getAttribute("aria-label") || "").includes(${JSON.stringify(title)}));
  if (!card) return false;
  card.click();
  return true;
})()`;

const READ_DETAIL = `(() => {
  const binding = document.querySelector("[data-binding]");
  return {
    binding: binding?.textContent?.trim() ?? null,
    bindingKind: binding?.getAttribute("data-binding") ?? null,
    sources: [...document.querySelectorAll("[data-spec-source]")].map((node) => ({
      key: node.getAttribute("data-spec-source"),
      tone: node.querySelector(".confidence-dot")?.getAttribute("data-tone") ?? null,
      title: node.getAttribute("title"),
    })),
    hitTarget: document.querySelector('[aria-label="热区（数值）"]')?.value ?? null,
  };
})()`;

const clickSource = (key) => `(() => {
  const node = document.querySelector('[data-spec-source=${JSON.stringify(key)}]');
  if (!node) return false;
  node.click();
  return true;
})()`;

const READ_POPOVER = `(() => {
  const panel = document.querySelector("[data-spec-popover]");
  if (!panel) return null;
  return {
    text: panel.textContent?.replace(/\\s+/g, " ").trim() ?? "",
    link: panel.querySelector("a[href], button")?.textContent?.trim() ?? "",
    quotes: [...panel.querySelectorAll("blockquote")].map((node) => node.textContent?.trim() ?? ""),
    alts: panel.querySelectorAll("li").length,
  };
})()`;

const CLOSE_POPOVER = `(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return document.querySelector("[data-spec-popover]") === null;
})()`;

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
      "Emulation.setDeviceMetricsOverride",
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await cdp.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: `(${installTauriStub.toString()})(${JSON.stringify(FIXTURES)});` },
      sessionId,
    );
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2600);

    const ready = await evaluate(
      cdp,
      sessionId,
      `({ cards: document.querySelectorAll("[data-case-id]").length, path: location.pathname })`,
      "ready",
    );
    record("列表已就绪", ready.cards >= 4 && ready.path === "/library", ready);

    // ---------- Material 3：平台绑定 + 有出处的缓动 ----------
    await evaluate(cdp, sessionId, openCase("Material 3"), "open-material3");
    await delay(500);
    const m3 = await evaluate(cdp, sessionId, READ_DETAIL, "read-material3");
    record(
      "平台条目显示口径徽标「Material 3 · Expressive 2025+」",
      m3.binding === "Material 3 · Expressive 2025+" && m3.bindingKind === "platform",
      m3.binding,
    );
    const easingRow = m3.sources.find((row) => row.key === "easing");
    record("缓动行来源点为 verified", easingRow?.tone === "verified", easingRow);

    await evaluate(cdp, sessionId, clickSource("easing"), "click-easing");
    await delay(220);
    const easingPopover = await evaluate(cdp, sessionId, READ_POPOVER, "read-easing-popover");
    record(
      "点开显示平台版本、组件与原文引句",
      Boolean(easingPopover) &&
        easingPopover.text.includes("Pre-Expressive") &&
        easingPopover.text.includes("no longer maintained") &&
        easingPopover.text.includes("Easing and duration tokens") &&
        easingPopover.quotes.some((quote) => quote.includes("cubic-bezier(0.2, 0.0, 0, 1.0)")),
      easingPopover,
    );
    record(
      "弹层提供可点开官方文档的入口",
      easingPopover?.link === "打开官方文档",
      easingPopover?.link,
    );
    await evaluate(cdp, sessionId, CLOSE_POPOVER, "close-easing");

    const durationRow = m3.sources.find((row) => row.key === "durationMs");
    await evaluate(cdp, sessionId, clickSource("durationMs"), "click-duration");
    await delay(220);
    const durationPopover = await evaluate(cdp, sessionId, READ_POPOVER, "read-duration-popover");
    record(
      "无 specRef 的参数点开显示「无官方原文，来源为推测」",
      durationRow !== undefined &&
        durationRow.tone !== "verified" &&
        durationPopover?.text.includes("无官方原文，来源为推测"),
      { row: durationRow, popover: durationPopover?.text },
    );
    await evaluate(cdp, sessionId, CLOSE_POPOVER, "close-duration");

    // ---------- 开关：非平台绑定 + hitTarget 证据 ----------
    await evaluate(cdp, sessionId, openCase("开关"), "open-switch");
    await delay(500);
    const sw = await evaluate(cdp, sessionId, READ_DETAIL, "read-switch");
    record(
      "通用控件显示「非平台绑定」",
      sw.binding === "非平台绑定" && sw.bindingKind === "generic",
      sw.binding,
    );
    record("组件参数含热区且默认 24px", sw.hitTarget === "24", sw.hitTarget);

    const hitRow = sw.sources.find((row) => row.key === "hitTarget");
    await evaluate(cdp, sessionId, clickSource("hitTarget"), "click-hit-target");
    await delay(220);
    const hitPopover = await evaluate(cdp, sessionId, READ_POPOVER, "read-hit-popover");
    record(
      "热区证据引 WCAG 2.2 SC 2.5.8 原文",
      hitRow?.tone === "verified" &&
        hitPopover?.quotes.some((quote) => quote.includes("at least 24 by 24 CSS pixels")),
      { row: hitRow, quotes: hitPopover?.quotes },
    );
    record(
      "弹层列出三平台参考值",
      hitPopover?.alts === 3 &&
        hitPopover.text.includes("48 x 48 dp") &&
        hitPopover.text.includes("44x44 pt") &&
        hitPopover.text.includes("48vp"),
      { alts: hitPopover?.alts },
    );
    await evaluate(cdp, sessionId, CLOSE_POPOVER, "close-hit-target");

    await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId).then(({ data: shot }) => {
      const dir = path.join(ROOT, ".screenshots");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "spec-ref-popover.png"), Buffer.from(shot, "base64"));
    });

    // ---------- 老包：声称 verified 但无出处 ----------
    await evaluate(cdp, sessionId, openCase("老包样式"), "open-legacy");
    await delay(500);
    const old = await evaluate(cdp, sessionId, READ_DETAIL, "read-legacy");
    record(
      "老包条目无口径徽标也不报错",
      old.binding === null && old.sources.length > 0,
      { binding: old.binding, rows: old.sources.length },
    );
    record(
      "老包声称 verified 无 specRef，前端降级为 estimated",
      old.sources.every((row) => row.tone === "estimated"),
      old.sources,
    );
    await evaluate(cdp, sessionId, clickSource("easing"), "click-legacy");
    await delay(220);
    const legacyPopover = await evaluate(cdp, sessionId, READ_POPOVER, "read-legacy-popover");
    record(
      "老包参数点开同样提示「无官方原文，来源为推测」",
      legacyPopover?.text.includes("无官方原文，来源为推测"),
      legacyPopover?.text,
    );

    console.log(JSON.stringify({ verifiedRows, checks }, null, 2));
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
