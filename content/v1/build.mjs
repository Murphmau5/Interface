// 内容包 V1 构建器：items.json → 条目载荷 + manifest + Ed25519 签名 + zip。
// 只依赖 Node 内置模块，产物可直接走应用内 content_pkg 导入。

import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const sourcePath = join(here, "items.json");
const keyPath = join(here, "signing-key.pem");
const publicKeyPath = join(here, "public-key.txt");
const outRoot = join(root, "dist", "content");
const stageDir = join(outRoot, "jiexu-v2");
const zipPath = join(outRoot, "jiexu-content-v2.zip");
// 随安装包分发的内置副本：tauri.conf.json 的 bundle.resources 指向这里
const resourceDir = join(root, "src-tauri", "resources", "content");
const resourceZipPath = join(resourceDir, "jiexu-content-v2.zip");

const EXPECTED_COUNTS = { style: 19, theme: 6, component: 33, motion: 10, feedback: 10 };
const TOTAL_EXPECTED = 78;

const EASING_RE =
  /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(-?[0-9.]+,\s*-?[0-9.]+,\s*-?[0-9.]+,\s*-?[0-9.]+\))$/;

const LIMITS = {
  motion: { durationMs: [120, 5000], delayMs: [0, 2000], staggerMs: [0, 400], distance: [0, 64], scale: [0.8, 1.2], opacity: [0, 1], blur: [0, 16] },
  feedback: { triggerMs: [0, 2000], holdMs: [200, 6000], decayMs: [100, 3000] },
  component: { durationMs: [80, 1200] },
  theme: { durationMs: [300, 3000], holdMs: [200, 4000] },
  style: { radiusPx: [0, 28], depth: [0, 20], durationMs: [80, 1200] },
};

const SCENE_VALUES = {
  style: new Set(["flat", "neumorphic", "glass", "clay", "brutalism", "neobrutalism", "editorial", "bento", "card"]),
  motion: new Set(["stagger", "page-push", "shared-element", "micro", "spring", "parallax", "loading", "easing", "reduced"]),
  feedback: new Set(["toast", "validation", "submit", "confirm", "loading", "empty", "error", "states"]),
  theme: new Set(["crossfade", "light", "dark", "system", "brand", "accent", "override"]),
  component: new Set(["switch", "button", "input", "segmented", "checkbox", "radio", "slider", "tabs", "progress", "skeleton", "badge", "nav", "menu", "modal", "toast", "card", "list", "empty"]),
};

function fail(message) {
  throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertRange(kind, key, value) {
  const range = LIMITS[kind]?.[key];
  if (!range) return;
  if (typeof value !== "number" || value < range[0] || value > range[1]) {
    fail(`${kind}.${key} 超出范围 ${range[0]}–${range[1]}：${value}`);
  }
}

/** 按域给出参数来源：总清单推断项保持 estimated，节奏类自定为 user_defined。 */
function sourcesFor(item) {
  const timing = {
    style: ["durationMs", "easing"],
    theme: ["durationMs", "holdMs", "easing"],
    component: ["durationMs", "easing"],
    motion: ["easing"],
    feedback: ["easing"],
  }[item.kind] ?? [];
  const structural = { style: ["treatment"], motion: ["scene"], feedback: ["scene"], theme: ["scene"], component: ["control"] }[item.kind] ?? [];
  const out = {};
  for (const key of Object.keys(item.preview)) {
    if (key === "v" || key === "kind") continue;
    if (item.unknown?.includes(key)) out[key] = "unknown";
    else if (item.reused && structural.includes(key)) out[key] = "user_defined";
    else if (timing.includes(key)) out[key] = "user_defined";
    else out[key] = "estimated";
  }
  // 条目可以显式覆盖参数级来源（例如带官方原文的 verified）
  for (const [key, level] of Object.entries(item.paramSources ?? {})) {
    out[key] = level;
  }
  return out;
}

/* ------------------------------ 证据校验 ------------------------------ */

function compact(text) {
  return String(text).replace(/\s+/g, "");
}

function numberTokens(text) {
  return String(text).match(/\d+(?:\.\d+)?/g) ?? [];
}

function containsNumber(quote, token) {
  let start = 0;
  const boundary = (ch) => ch === undefined || !/[\d.]/.test(ch);
  for (;;) {
    const index = quote.indexOf(token, start);
    if (index < 0) return false;
    if (boundary(quote[index - 1]) && boundary(quote[index + token.length])) return true;
    start = index + token.length;
  }
}

function bezierValues(text) {
  const match = String(text).match(/cubic-bezier\(([^)]*)\)/);
  if (!match) return null;
  const values = match[1]
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length === 4 ? values : null;
}

function quoteMatches(actual, ref) {
  if (typeof actual === "number") return containsNumber(ref.quote, String(actual));
  if (typeof actual !== "string") return false;
  const value = actual.trim();
  if (value.startsWith("cubic-bezier")) {
    const expected = bezierValues(value);
    const quoted = bezierValues(ref.quote);
    return Boolean(
      expected && quoted && expected.every((number, index) => number === quoted[index]),
    );
  }
  const tokens = numberTokens(value);
  if (tokens.length === 0) return compact(ref.quote).includes(compact(value));
  return tokens.every((token) => containsNumber(ref.quote, token));
}

function validRef(ref) {
  if (!ref || typeof ref !== "object") return false;
  return ["platform", "version", "component", "url", "quote"].every(
    (key) => typeof ref[key] === "string" && ref[key].trim().length > 0,
  ) && typeof ref.url === "string" && ref.url.startsWith("https://");
}

function validateEvidence(item) {
  const sources = sourcesFor(item);
  for (const [key, level] of Object.entries(sources)) {
    if (level !== "verified") continue;
    const ref = item.paramRefs?.[key];
    if (!validRef(ref)) fail(`条目 ${item.id} 的 ${key} 声称 verified，但缺少合法 specRef`);
    if (!(key in item.preview)) fail(`条目 ${item.id} 的 ${key} 不在 preview 中`);
    if (!quoteMatches(item.preview[key], ref)) {
      fail(`条目 ${item.id} 的 ${key} 原文引句与数值不对应`);
    }
  }
  for (const [key, ref] of Object.entries(item.paramRefs ?? {})) {
    if (!validRef(ref)) fail(`条目 ${item.id} 的 specRef.${key} 不完整或 URL 非 https`);
  }
  for (const [key, list] of Object.entries(item.paramRefAlts ?? {})) {
    if (!Array.isArray(list) || !list.every(validRef)) {
      fail(`条目 ${item.id} 的 paramRefAlts.${key} 含不合法参考值`);
    }
  }
}

function validate(data) {
  const pkg = data.package ?? fail("缺少 package 段");
  for (const key of ["id", "name", "version", "minAppVersion"]) {
    if (!pkg[key]) fail(`package.${key} 不能为空`);
  }
  if (!Array.isArray(data.categories) || data.categories.length === 0) fail("categories 不能为空");
  const categoryIds = new Set();
  for (const category of data.categories) {
    if (categoryIds.has(category.id)) fail(`类目 id 重复：${category.id}`);
    if (!/^[a-z0-9._-]{1,80}$/.test(category.id)) fail(`类目 id 不合法：${category.id}`);
    if (!SCENE_VALUES[category.domain]) fail(`类目 domain 非法：${category.id}`);
    categoryIds.add(category.id);
  }

  const itemIds = new Set();
  const counts = {};
  for (const item of data.items) {
    if (itemIds.has(item.id)) fail(`条目 id 重复：${item.id}`);
    itemIds.add(item.id);
    if (!/^[a-z0-9._-]{1,80}$/.test(item.id)) fail(`条目 id 不合法：${item.id}`);
    if (!SCENE_VALUES[item.kind]) fail(`条目 ${item.id} 的 kind 非法`);
    if (!categoryIds.has(item.categoryId)) fail(`条目 ${item.id} 引用了未声明类目`);
    if (!item.prompt || item.prompt.length < 20) fail(`条目 ${item.id} 缺少有效提示词`);
    const preview = item.preview ?? fail(`条目 ${item.id} 缺少 preview`);
    if (preview.v !== 2 || preview.kind !== item.kind) fail(`条目 ${item.id} preview 版本或类型不符`);
    for (const [key, value] of Object.entries(preview)) {
      if (key === "v" || key === "kind") continue;
      if (key === "easing" && !EASING_RE.test(value)) fail(`条目 ${item.id} easing 非法：${value}`);
      if (key === "scene" || key === "control" || key === "treatment") {
        const field = key === "scene" ? "scene" : key === "control" ? "control" : "treatment";
        if (!SCENE_VALUES[item.kind].has(value)) fail(`条目 ${item.id} ${field} 非法：${value}`);
      }
      assertRange(item.kind, key, value);
    }
    validateEvidence(item);
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  }
  for (const [kind, expected] of Object.entries(EXPECTED_COUNTS)) {
    if ((counts[kind] ?? 0) !== expected) fail(`${kind} 条目数 ${counts[kind] ?? 0}，预期 ${expected}`);
  }
  if (data.items.length !== TOTAL_EXPECTED) fail(`条目总数 ${data.items.length}，预期 ${TOTAL_EXPECTED}`);
  return { counts };
}

/* ------------------------------- zip 写入 ------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() / 2) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = file.data;
    const compressed = deflateRawSync(raw, { level: 9 });
    const payload = compressed.length < raw.length ? compressed : raw;
    const method = compressed.length < raw.length ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, payload);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(dosTime, 12);
    entry.writeUInt16LE(dosDate, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(payload.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(0, 30);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt16LE(0, 38);
    entry.writeUInt32LE(0, 40);
    entry.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([entry, name]));

    offset += local.length + name.length + payload.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuffer, end]);
}

/* -------------------------------- 构建 -------------------------------- */

const data = JSON.parse(readFileSync(sourcePath, "utf8"));
const { counts } = validate(data);

if (!existsSync(keyPath)) {
  const pair = generateKeyPairSync("ed25519");
  writeFileSync(keyPath, pair.privateKey.export({ type: "pkcs8", format: "pem" }));
  const der = pair.publicKey.export({ type: "spki", format: "der" });
  writeFileSync(publicKeyPath, `${der.subarray(der.length - 32).toString("hex")}\n`);
  console.log(`已生成开发签名密钥：${keyPath}`);
}
const publicKeyHex = readFileSync(publicKeyPath, "utf8").trim();
const privateKey = createPrivateKey(readFileSync(keyPath));
const der = Buffer.from(publicKeyHex, "hex");
if (der.length !== 32) fail("public-key.txt 不是 32 字节 Ed25519 公钥");

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(join(stageDir, "content"), { recursive: true });

const manifestItems = [];
const manifestFiles = [];
for (const item of data.items) {
  const payload = {
    v: 3,
    preview: item.preview,
    prompt: item.prompt,
    paramSources: sourcesFor(item),
    ...(item.paramRefs ? { paramRefs: item.paramRefs } : {}),
    ...(item.paramRefAlts ? { paramRefAlts: item.paramRefAlts } : {}),
    ...(item.specBinding ? { specBinding: item.specBinding } : {}),
  };
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const relative = `content/${item.id}.json`;
  const buffer = Buffer.from(text, "utf8");
  writeFileSync(join(stageDir, relative), buffer);
  manifestFiles.push({ path: relative, sha256: sha256(buffer) });
  manifestItems.push({
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    confidence: item.confidence ?? "estimated",
    platform: "web",
    categoryId: item.categoryId,
    version: "1.0.0",
    path: relative,
    tags: item.tags ?? [],
  });
}

const manifest = {
  format: "jiexu.content-package",
  formatVersion: 2,
  id: data.package.id,
  name: data.package.name,
  version: data.package.version,
  minAppVersion: data.package.minAppVersion,
  createdAt: new Date().toISOString(),
  categories: data.categories,
  items: manifestItems,
  removedItems: [],
  files: manifestFiles,
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(join(stageDir, "manifest.json"), manifestBytes);
const signature = sign(null, manifestBytes, privateKey).toString("hex");
writeFileSync(join(stageDir, "signature.txt"), `${signature}\n`);

const zipEntries = [
  { name: "manifest.json", data: manifestBytes },
  { name: "signature.txt", data: Buffer.from(`${signature}\n`, "utf8") },
  ...data.items.map((item) => ({
    name: `content/${item.id}.json`,
    data: readFileSync(join(stageDir, "content", `${item.id}.json`)),
  })),
];
const zip = buildZip(zipEntries);
writeFileSync(zipPath, zip);
mkdirSync(resourceDir, { recursive: true });
copyFileSync(zipPath, resourceZipPath);

console.log(`内容包：${zipPath}`);
console.log(`内置副本：${resourceZipPath}`);
console.log(`大小：${(zip.length / 1024).toFixed(1)} KB，sha256：${sha256(zip)}`);
console.log(`签名公钥：${publicKeyHex}`);
console.log(`条目：${data.items.length}（${Object.entries(counts).map(([kind, n]) => `${kind} ${n}`).join(" / ")}）`);
console.log(`类目：${data.categories.length}`);
