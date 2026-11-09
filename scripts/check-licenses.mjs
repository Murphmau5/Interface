/**
 * 依赖许可检查：
 *  - 前端（生产依赖）通过 license-checker-rseidelsohn 读取 node_modules
 *  - Rust 通过 cargo metadata 读取 Cargo 解析出的全部依赖
 *
 * 规则：
 *  1. 白名单：MIT / Apache-2.0 / BSD-2-Clause / BSD-3-Clause / ISC / OFL
 *  2. 禁止：GPL / AGPL / LGPL / SSPL（任何一条支路都无法落到白名单即判不合规）
 *  3. 仅传递依赖可登记「例外」：许可证属宽松型但不在白名单（MPL-2.0 / Zlib /
 *     Unicode-3.0 / Unlicense），必须在下方 TRANSITIVE_ALLOWANCES 写明归属与理由
 *  4. 直接依赖不适用例外，必须严格落在白名单内
 *
 * 用法：npm run check:licenses
 * 退出码 1 表示存在不合规依赖。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "OFL",
]);

const FORBIDDEN_MARKERS = ["AGPL", "LGPL", "GPL", "SSPL"];

/**
 * 传递依赖例外：仅在直接依赖无法避免时登记，并写明是谁引入的。
 * 这些许可证都属宽松型（非 copyleft 传染到本项目源码），随安装包分发时
 * 需要保留版权与许可证原文，已在 THIRD_PARTY_NOTICES.md 登记。
 */
const TRANSITIVE_ALLOWANCES = new Map([
  [
    "MPL-2.0",
    "Tauri 依赖链中的 cssparser / selectors / option-ext；文件级 copyleft，不传染本项目源码",
  ],
  ["Zlib", "Tauri 依赖链中的 foldhash / zlib-rs；宽松许可"],
  ["Unicode-3.0", "Tauri 依赖链中的 ICU / zerovec 组件；宽松许可"],
  ["Unlicense", "Tauri 依赖链中的 same-file / walkdir（亦可用 MIT）；宽松许可"],
  [
    "CDLA-Permissive-2.0",
    "rustls-platform-verifier 依赖的 webpki-root-certs 根证书数据；宽松数据许可，不传染本项目源码",
  ],
]);

/** Rust 旧式双许可写法 `MIT/Apache-2.0` 等价于 `MIT OR Apache-2.0` */
function normalizeLicense(value) {
  if (Array.isArray(value)) value = value.join(" OR ");
  if (typeof value !== "string") return "";
  return value
    .replace(/^\(|\)$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, " OR ")
    .trim();
}

function stripException(expression) {
  return expression.replace(/\s+WITH\s+[A-Za-z0-9.-]+/gi, "").trim();
}

function hasForbidden(expression) {
  const upper = expression.toUpperCase();
  return FORBIDDEN_MARKERS.some((marker) => upper.includes(marker));
}

/**
 * 解析 SPDX 风格表达式（支持 AND / OR / 旧式 `/`，忽略括号层级）：
 *  - OR：任一合规支路即可
 *  - AND：所有支路都必须合规
 * 返回值 resolved 为实际落到的白名单许可证，便于报告。
 */
function evaluate(expression) {
  const license = normalizeLicense(expression);
  if (!license) return { allowed: false, resolved: "" };

  const orBranches = license.split(/\s+OR\s+/i);
  for (const rawBranch of orBranches) {
    const parts = stripException(rawBranch.replace(/[()]/g, " "))
      .split(/\s+AND\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.every((part) => ALLOWED.has(part))) {
      return { allowed: true, resolved: parts.join(" AND ") };
    }
  }
  return { allowed: false, resolved: "" };
}

function classify(expression, isDirect) {
  const normalized = normalizeLicense(expression);
  if (!normalized) return { status: "violation", reason: "缺少许可证声明" };

  const result = evaluate(normalized);
  if (result.allowed) return { status: "ok", reason: "" };

  // 只有「整条表达式都是同一类宽松例外」时才算已登记例外
  const stripped = stripException(normalized.replace(/[()]/g, "")).trim();
  if (!isDirect && TRANSITIVE_ALLOWANCES.has(stripped)) {
    return { status: "allowed-exception", reason: TRANSITIVE_ALLOWANCES.get(stripped) };
  }

  if (hasForbidden(normalized)) {
    return { status: "violation", reason: "命中禁止的 copyleft 许可" };
  }
  if (/\sWITH\s/i.test(normalized)) {
    return { status: "violation", reason: "许可证例外条款未登记" };
  }
  return {
    status: "violation",
    reason: isDirect ? "直接依赖不在白名单内" : "传递依赖不在白名单且未登记例外",
  };
}

function checkFrontend() {
  const checker = require("license-checker-rseidelsohn");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const directNames = new Set(Object.keys(pkg.dependencies ?? {}));

  return new Promise((resolve) => {
    checker.init({ start: root, production: true }, (error, packages) => {
      if (error) {
        resolve({
          violations: [{ name: "<license-checker>", license: "", reason: String(error) }],
          exceptions: [],
        });
        return;
      }
      const violations = [];
      const exceptions = [];
      for (const [nameAtVersion, info] of Object.entries(packages)) {
        if (nameAtVersion.startsWith(`${pkg.name}@`)) continue;
        const name = nameAtVersion.replace(/@[^@]+$/, "");
        const isDirect = directNames.has(name);
        const license = info.licenses;
        const verdict = classify(license, isDirect);
        if (verdict.status === "violation") {
          violations.push({ name: nameAtVersion, license: license || "<missing>", reason: verdict.reason });
        } else if (verdict.status === "allowed-exception") {
          exceptions.push({ name: nameAtVersion, license, reason: verdict.reason });
        }
      }
      violations.sort((a, b) => a.name.localeCompare(b.name));
      resolve({ violations, exceptions });
    });
  });
}

function checkRust() {
  const output = execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--manifest-path", path.join(root, "src-tauri", "Cargo.toml")],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      // cargo metadata 输出可达 1MB+，默认 maxBuffer 会触发 ENOBUFS
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  const metadata = JSON.parse(output);
  const rootPackage = metadata.packages.find(
    (pkg) => pkg.manifest_path.includes(`${path.sep}src-tauri${path.sep}Cargo.toml`),
  );
  if (!rootPackage) throw new Error("未在 cargo metadata 中找到 src-tauri 包");

  const rootNode = metadata.resolve.nodes.find((node) => node.id === rootPackage.id);
  const directIds = new Set((rootNode?.dependencies ?? []).map((id) => String(id)));

  const violations = [];
  const exceptions = [];
  for (const pkg of metadata.packages) {
    if (pkg.id === rootPackage.id) continue;
    const license = pkg.license ?? pkg.license_file ?? "";
    const verdict = classify(license, directIds.has(pkg.id));
    if (verdict.status === "violation") {
      violations.push({
        name: `${pkg.name}@${pkg.version}`,
        license: license || "<missing>",
        reason: verdict.reason,
      });
    } else if (verdict.status === "allowed-exception") {
      exceptions.push({
        name: `${pkg.name}@${pkg.version}`,
        license,
        reason: verdict.reason,
      });
    }
  }
  violations.sort((a, b) => a.name.localeCompare(b.name));
  return { violations, exceptions };
}

function report(title, result) {
  if (result.violations.length === 0) {
    console.log(`${title}：全部通过（例外 ${result.exceptions.length} 项，已登记）`);
    return 0;
  }
  console.error(`${title}：${result.violations.length} 项不合规`);
  for (const item of result.violations) {
    console.error(`  - ${item.name}  ${item.license}  → ${item.reason}`);
  }
  return result.violations.length;
}

async function main() {
  console.log("许可白名单：MIT / Apache-2.0 / BSD-2-Clause / BSD-3-Clause / ISC / OFL");
  console.log("禁止：GPL / AGPL / LGPL / SSPL；传递依赖例外需在脚本内登记\n");

  const frontend = await checkFrontend();
  const rust = checkRust();

  const failures = report("前端生产依赖", frontend) + report("Rust 依赖", rust);

  if (failures > 0) {
    console.error(`\n共 ${failures} 项不合规，检查未通过。`);
    process.exitCode = 1;
    return;
  }
  console.log("\n许可检查通过。");
}

main().catch((error) => {
  console.error("许可检查执行失败：", error);
  process.exitCode = 1;
});
