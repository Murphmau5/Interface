# Third-Party Notices

界序 INTERFACE 自身以 MIT License 发布，全文见根目录 `LICENSE`。

应用内的所有示例案例、缩略图、动态预览场景均由本项目手写 HTML/CSS/React 绘制，
不使用外部截图、插画或录屏素材。

## 直接依赖许可清单

| 依赖 | 许可 |
|---|---|
| React / React DOM | MIT |
| React Router | MIT |
| Zustand | MIT |
| TanStack Query | MIT |
| Tauri | MIT OR Apache-2.0 |
| Lucide（图标） | ISC |
| Tailwind CSS | MIT |
| Vite | MIT |
| TypeScript | Apache-2.0 |
| rusqlite | MIT |
| SQLx（sqlite 驱动） | MIT OR Apache-2.0 |
| Serde / serde_json | MIT OR Apache-2.0 |
| SQLite（libsqlite3-sys 内嵌） | Public Domain |

## 传递依赖例外（已登记）

Rust 依赖树中以下许可属宽松型、但不在白名单内，已由 `scripts/check-licenses.mjs`
显式登记为传递依赖例外（直接依赖不适用例外）：

| 许可 | 涉及依赖 | 说明 |
|---|---|---|
| MPL-2.0 | cssparser / selectors / option-ext | 文件级 copyleft，不传染本项目源码；随 Tauri 依赖链引入 |
| Zlib | foldhash / zlib-rs | 宽松许可，非 copyleft |
| Unicode-3.0 | ICU / zerovec / yoke 等 | Unicode 数据组件许可，宽松 |
| Unlicense | same-file / walkdir | 与 MIT 双许可，宽松 |

上述组件随安装包分发时保留其版权与许可原文，源码均可从 crates.io 获取。


完整依赖许可通过 `npm run check:licenses` 校验，白名单为：
MIT / Apache-2.0 / BSD-2-Clause / BSD-3-Clause / ISC / OFL。
禁止 GPL / AGPL / LGPL / SSPL。

字体仅使用系统字体栈（Segoe UI Variable / Segoe UI / Microsoft YaHei UI）与
系统等宽字体（Cascadia Code / Consolas），不打包任何系统字体文件。

> 注：GSAP 的许可为 GreenSock 自有许可，不在本项目白名单，默认**不打包、不作为内置依赖**（见 `DECISIONS.md` D-026）。V1 预览运行时使用 CSS / WAAPI。

> 素材来源逐条登记于 `docs/素材来源与许可.md`；未自绘不得入安装包。

## Lucide · ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
