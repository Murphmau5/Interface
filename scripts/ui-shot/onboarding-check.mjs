import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildFixtures, installTauriStub } from "./fixtures.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ORIGIN = "http://127.0.0.1:4174";
const PROFILE_DIR = path.join(ROOT, ".screenshots", ".edge-onboarding");
const ONBOARDING_KEY = "ui.onboarding";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log("[onboarding]", ...args);

const BASE_FIXTURES = structuredClone(buildFixtures());
const CASE_TITLES = BASE_FIXTURES.cases.map((row) => row.title);

function startPreview() {
  return spawn("npx vite preview --host 127.0.0.1 --port 4174 --strictPort", {
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

function readDialog(cdp, sessionId) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const dialog = document.querySelector('[data-onboarding="dialog"]');
      if (!dialog) return null;
      return {
        step: dialog.dataset.step,
        text: dialog.textContent || "",
        focused: document.activeElement === dialog,
        overlay: Boolean(document.querySelector('[data-onboarding="overlay"]')),
      };
    })()`,
    "read-dialog",
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

    // 首次启动：settings 里没有引导标记
    const firstRun = structuredClone(BASE_FIXTURES);
    delete firstRun.settings[ONBOARDING_KEY];
    let script = await installFixtures(cdp, sessionId, firstRun);
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2500);

    const first = await readDialog(cdp, sessionId);
    record(
      "首启无标记时自动出现（第 1 步）",
      Boolean(first) && first.step === "1" && first.overlay === true && first.focused === true,
      first && { step: first.step, focused: first.focused },
    );
    record(
      "第 1 步讲用途：规格而非收藏夹",
      Boolean(first) &&
        first.text.includes("这里存的是规格，不是链接") &&
        first.text.includes("不是收藏夹") &&
        first.text.includes("estimated"),
      null,
    );
    const sampleHit = CASE_TITLES.filter((title) => first?.text.includes(title));
    record("第 1 步用真实案例（非占位图）", sampleHit.length >= 2, sampleHit);
    const lightShot = await screenshot(cdp, sessionId, "onboarding-step1-light.png");

    // 第 2 步：三栏分工
    await click(cdp, sessionId, '[data-onboarding-action="next"]', "next");
    await delay(300);
    const second = await readDialog(cdp, sessionId);
    record(
      "第 2 步讲三栏分工",
      second?.step === "2" &&
        second.text.includes("左栏") &&
        second.text.includes("中栏") &&
        second.text.includes("右栏") &&
        second.text.includes("内容域"),
      second && { step: second.step },
    );

    // 第 3 步：参数即时生效 + 落库
    await click(cdp, sessionId, '[data-onboarding-action="next"]', "next");
    await delay(300);
    const third = await readDialog(cdp, sessionId);
    record(
      "第 3 步讲参数即时生效与落库",
      third?.step === "3" &&
        third.text.includes("app.db") &&
        third.text.includes("用户定义") &&
        third.text.includes("预览当场重放"),
      third && { step: third.step },
    );
    record(
      "第 3 步参数取自真实条目",
      Boolean(third) && /(时长|缓动|圆角|层深)/.test(third.text) && CASE_TITLES.some((title) => third.text.includes(title)),
      null,
    );

    // 上一步可回退
    await click(cdp, sessionId, '[data-onboarding-action="prev"]', "prev");
    await delay(300);
    const back = await readDialog(cdp, sessionId);
    await click(cdp, sessionId, '[data-onboarding-action="next"]', "next");
    await delay(300);
    const forward = await readDialog(cdp, sessionId);
    record("上一步 / 下一步可来回切换", back?.step === "2" && forward?.step === "3", {
      back: back?.step,
      forward: forward?.step,
    });

    // 深浅两套都读一遍计算样式
    const themes = await evaluate(
      cdp,
      sessionId,
      `(async () => {
        const dialog = document.querySelector('[data-onboarding="dialog"]');
        const read = () => {
          const style = getComputedStyle(dialog);
          return { bg: style.backgroundColor, color: style.color };
        };
        document.documentElement.dataset.theme = "light";
        await new Promise((resolve) => setTimeout(resolve, 160));
        const light = read();
        document.documentElement.dataset.theme = "dark";
        await new Promise((resolve) => setTimeout(resolve, 160));
        const dark = read();
        return { light, dark };
      })()`,
      "theme-probe",
    );
    const opaque = (value) => Boolean(value) && value !== "rgba(0, 0, 0, 0)" && value !== "transparent";
    record(
      "深浅两套主题都正常",
      opaque(themes.light.bg) &&
        opaque(themes.dark.bg) &&
        themes.light.bg !== themes.dark.bg &&
        themes.light.color !== themes.dark.color,
      themes,
    );
    await screenshot(cdp, sessionId, "onboarding-step3-dark.png");

    // 看完 → 写标记 → 关闭
    await click(cdp, sessionId, '[data-onboarding-action="finish"]', "finish");
    await delay(500);
    const afterFinish = await readDialog(cdp, sessionId);
    const doneMarker = await evaluate(
      cdp,
      sessionId,
      `window.__TAURI_INTERNALS__.invoke("settings_get_all").then((all) => all[${JSON.stringify(ONBOARDING_KEY)}])`,
      "marker-done",
    );
    record("看完后关闭并写入标记", afterFinish === null && doneMarker === "v1:done", { doneMarker });

    // 模拟下次启动：标记已在库里，不应再弹
    await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier }, sessionId);
    const persisted = structuredClone(BASE_FIXTURES);
    persisted.settings[ONBOARDING_KEY] = "v1:done";
    script = await installFixtures(cdp, sessionId, persisted);
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2500);
    const relaunch = await readDialog(cdp, sessionId);
    record("标记存在时不再自动出现", relaunch === null, relaunch);

    // 设置页可重新打开
    await evaluate(cdp, sessionId, `location.hash = "#/settings"; true`, "goto-settings");
    await delay(1200);
    const sectionPicked = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const target = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "使用引导");
        target?.click();
        return Boolean(target);
      })()`,
      "settings-onboarding",
    );
    await delay(600);
    const settingsRow = await evaluate(
      cdp,
      sessionId,
      `document.body.textContent.includes("已看完") && document.body.textContent.includes("ui.onboarding")`,
      "settings-row",
    );
    const reopened = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const target = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "打开引导");
        target?.click();
        return Boolean(target);
      })()`,
      "settings-open",
    );
    await delay(400);
    const reopenedDialog = await readDialog(cdp, sessionId);
    record(
      "设置里可重新打开引导",
      sectionPicked === true && settingsRow === true && reopened === true && reopenedDialog?.step === "1",
      { settingsRow, step: reopenedDialog?.step },
    );

    // 跳过 → 写 v1:skipped
    await click(cdp, sessionId, '[data-onboarding-action="skip"]', "skip");
    await delay(500);
    const skipMarker = await evaluate(
      cdp,
      sessionId,
      `window.__TAURI_INTERNALS__.invoke("settings_get_all").then((all) => all[${JSON.stringify(ONBOARDING_KEY)}])`,
      "marker-skip",
    );
    const afterSkip = await readDialog(cdp, sessionId);
    record("跳过也写入标记", afterSkip === null && skipMarker === "v1:skipped", { skipMarker });

    // 全新标记再跑一次，直接跳过，确认跳过路径也能止住下次弹出
    await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier }, sessionId);
    const skipRun = structuredClone(BASE_FIXTURES);
    delete skipRun.settings[ONBOARDING_KEY];
    await installFixtures(cdp, sessionId, skipRun);
    await cdp.send("Page.navigate", { url: `${ORIGIN}/library` }, sessionId);
    await delay(2500);
    const skipFirst = await readDialog(cdp, sessionId);
    await click(cdp, sessionId, '[data-onboarding-action="skip"]', "skip-first");
    await delay(500);
    const skipFirstMarker = await evaluate(
      cdp,
      sessionId,
      `window.__TAURI_INTERNALS__.invoke("settings_get_all").then((all) => all[${JSON.stringify(ONBOARDING_KEY)}])`,
      "marker-skip-first",
    );
    record(
      "首启直接跳过：关闭且写标记",
      skipFirst?.step === "1" && skipFirstMarker === "v1:skipped" && (await readDialog(cdp, sessionId)) === null,
      { step: skipFirst?.step, skipFirstMarker },
    );

    log(`截图：${lightShot}`);
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
