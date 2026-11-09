# 界序 INTERFACE

**v1.0.8 · 主界面仪器台化** —— 面向 UI 设计师与前端工程师的 Windows 桌面端设计知识库工作台，用来收集、分析、预览并复用软件的**风格、主题、动效、交互反馈与 UI 组件**。本版把主界面三栏按同一套仪器台语言重做：胶囊选中态、发丝线分区、等宽读数，参数不再挤成一片滑块；全部颜色与圆角走 token，深浅两套逐界面核对。

- **下载**：[GitHub Releases](https://github.com/Murphmau5/Interface/releases/tag/v1.0.8) → `INTERFACE_1.0.8_x64-setup.exe`（7.47 MiB）
- **平台**：Windows 10 1803+ / Windows 11，x64
- **主题**：跟随系统（默认）/ 深色 / 浅色
- **许可**：MIT

> 一间双主题的 UI 设计实验室，不是素材展厅。
> 本地优先 · AI 与搜索能力可插拔 · 中文字段与搜索优先

---

## 项目定位

**界序 INTERFACE** 是一款面向 UI 设计师与前端工程师的桌面端设计知识库工作台，用来收集、分析、预览并复用软件的**风格、主题、动效、交互反馈与 UI 组件**。

它和普通素材站的区别只有一件事：**可验证的规格化**。每个案例的参数都带置信度标记：

| 标记 | 含义 |
|---|---|
| `verified` | 有可核对的原始规格或源码证据 |
| `estimated` | 从截图/页面推测，可能有偏差 |
| `user_defined` | 用户自行填写 |
| `unknown` | 暂无法确定 |

**AI 永远不允许输出 `verified`。** 推测值不会被伪装成真实参数。

## 当前版本与状态

| 项 | 状态 |
|---|---|
| 版本 | **v1.0.8（主界面仪器台化）** |
| 阶段 | Phase 2 收口完成；本版重做主界面三栏观感，数据模型与 IPC 契约未改 |
| 安装包 | **已发布**（NSIS，Windows x64，未签名），见 GitHub Releases |
| 文档 | 治理七件套 + A–J 十份启动文档 + 架构自检，已就绪 |
| 代码 | 工程脚手架已通过安装 / 启动 / 卸载实测；功能项按验收逐条转 ✅ |
| 发布渠道 | GitHub Releases `v1.0.8` |

> 本版重点：左栏胶囊选中态与计数徽标、中栏卡片 1/2/3 列自适应与表格固定列宽、右栏详情分节与参数「标签 / 控件 / 读数」三列；所有新规则只引用语义 token，深浅两套主题逐个界面核对。同时修掉详情节标题双发丝线、表格列被挤压、Select 宽度类落错元素、新建 composer 与空态叠加等显示问题。主界面截图与压测在无头 Edge + CDP 下完成（夹具数据 14 条，未弹应用窗口）；真窗口的标题栏拖动与原生拖拽导入本轮未复测。

## 功能清单

图例：`✅ 已交付` · `🧱 脚手架存在未验收` · `🧭 规划中`

### 知识与浏览

- ✅ 案例库：单表 + 类型化 payload，支持风格 / 主题 / 动效 / 反馈 / 组件五类
- 🧭 左栏导航栈：按域深入，二级面板推入，栈深 ≤ 2
- 🧭 底部类型条带：按类型横切，与左栏共用同一筛选状态
- ✅ 网格视图 + 表格清单视图，支持排序与四维筛选（类型 / 平台 / 置信度 / 组件层）
- ✅ 收藏、最近使用、标签、合集（收藏与最近作为视图位于左栏底部）
- ✅ 内容包：签名 zip 本地导入即装，在线地址可选；版本合并、用户改动保护、干净卸载
- 🧭 置信度标记与证据链接

### 预览

- 🧭 右侧预览窗 + 参数面板：播放/暂停/重播/循环/调速/持续/缓动/距离/状态/视口
- 🧭 风格与主题详情并排展示 light / dark 双快照
- 🧭 卡片悬停 140ms 自动预览，全局唯一共享层
- 🧭 沙箱化预览（本地协议 + sandbox iframe + CSP）

### 搜索

- ✅ 中文搜索：`LIKE` + 拼音物化列（全拼 / 首字母），1 万条实测 P95 15.5ms，未启用 FTS5
- ✅ 双作用域：默认本地；`Ctrl+Enter` 显式联网；禁止自动联网，未配置 Key 时降级为「粘贴网址登记候选」
- ✅ 候选池「网络候选 / 未审核」，必须显式通过才进正式库，没有免审开关

### AI

- 🧭 BYOK（用户自带密钥），不内置密钥、不代理转发
- 🧭 AI 分析：网页 / 截图 / 视频 → 结构化案例草稿
- 🧭 AI 发现：搜索、抓取、去重、候选池
- 🧭 提示词生成
- 🧭 未配置 Key 时入口可见但不阻塞本地功能

### 工程与治理

- ✅ 治理七件套与 A–J 文档
- ✅ MIT LICENSE 与素材来源登记口径
- 🧱 Tauri 2 + React + TypeScript + Vite 工程骨架
- 🧱 语义 Token 与 dark / light 双主题
- 🧭 构建期依赖许可检查（`cargo-deny` + 前端许可检查）
- 🧭 安装包、签名与自动更新

## 技术栈

| 层 | 选择 |
|---|---|
| 桌面壳 | Tauri 2 |
| 前端 | React + TypeScript（strict）+ Vite |
| 样式 | Tailwind CSS + 语义 Token CSS 变量（双主题两层） |
| 状态 | Zustand（UI 态）+ TanStack Query（数据） |
| 后端 | Rust + Tokio + Serde |
| 数据库 | SQLite + rusqlite（bundled）+ 自写迁移器 |
| 搜索 | `LIKE` + 拼音物化列（未启用 FTS5；1 万条 P95 15.5ms） |
| 校验 | Rust 侧硬门禁（serde + schemars）+ Zod 前端第二道 |
| 图标 | Lucide（ISC） |
| 动效 | 外壳：CSS + Motion；预览：CSS / WAAPI |

## 安装方式（Windows）

1. 从 [GitHub Releases v1.0.8](https://github.com/Murphmau5/Interface/releases/tag/v1.0.8) 下载 `INTERFACE_1.0.8_x64-setup.exe`（7.47 MiB / 7,834,391 字节）。本地构建产物的原名是 `界序 INTERFACE_1.0.8_x64-setup.exe`，上传时附件名改为 ASCII 名，内容一致。
2. 核对 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 "INTERFACE_1.0.8_x64-setup.exe"
# 3fc2c1dac40dff3f29a32f1630ce8713b8248603c8576eddaa38e0f665d02d34
```

3. 运行安装包，按向导完成安装（当前用户级安装，无需管理员权限）。**已装 1.0.0 / 1.0.2 / 1.0.3 / 1.0.4 / 1.0.5 / 1.0.6 / 1.0.7 的用户直接双击即可覆盖升级，不需要先手动卸载。**
4. 首次启动读取系统主题，默认「跟随系统」。

**未签名提示**：本安装包未做代码签名，首次运行可能触发 Windows SmartScreen（「Windows 已保护你的电脑」）。确认 SHA-256 与上表一致后，可选择「更多信息 → 仍要运行」。校验和一致即可确认文件未被篡改。

系统要求：Windows 10 1803+ / Windows 11，x64；WebView2 运行时由安装包 bootstrapper 检测并按需安装。

## 构建方式

环境：Node.js 20+ / npm、Rust stable、MinGW-w64 工具链（`x86_64-pc-windows-gnu`）、Tauri 2。

```powershell
npm install
npm run build          # tsc --noEmit + vite build
npm run tauri build    # 产物：src-tauri/target/release/bundle/nsis/
```

前端校验：`npm run lint`、`npm run check`、`npm run check:licenses`。
安装包输出目录 `src-tauri/target/` 已在 `.gitignore` 中排除，构建产物只作为 Release 附件，不进入代码仓库。

## 首次使用引导

1. **选择主题**：默认跟随系统；可在设置中切换为深色或浅色。
2. **浏览案例**：左栏选择域，或使用底部类型条带按类型过滤。
3. **查看预览**：鼠标悬停卡片自动播放；点击卡片在右栏查看完整可调预览。
4. **导入自己的素材**：支持图片、视频、网址；导入即视为用户自行确认素材权利。
5. **配置 AI（可选）**：设置 → 模型配置，填入自己的 API Key；不配置也能完整使用本地库。
6. **配置联网搜索（可选）**：设置 → 搜索服务，选择 Bing / Tavily / Brave 并填入 Key；未配置时可用「粘贴网址抓取」。

## 文档索引

| 文档 | 用途 |
|---|---|
| [PROJECT_CONSTITUTION.md](PROJECT_CONSTITUTION.md) | 长期工程约束（最高优先级） |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | 目标、范围、状态、文档地图 |
| [docs/A-PRD.md](docs/A-PRD.md) | 产品需求 |
| [docs/B-ARCHITECTURE.md](docs/B-ARCHITECTURE.md) | 技术架构与安全模型 |
| [docs/C-STRUCTURE.md](docs/C-STRUCTURE.md) | 目录结构 |
| [docs/D-ER-DESIGN.md](docs/D-ER-DESIGN.md) | 数据库 ER 设计 |
| [docs/E-DATA-MODEL.md](docs/E-DATA-MODEL.md) | TypeScript 数据模型 |
| [docs/F-PROVIDERS.md](docs/F-PROVIDERS.md) | AI / Search Provider |
| [docs/G-AI-PIPELINE.md](docs/G-AI-PIPELINE.md) | AI 采集与分析流程 |
| [docs/H-UI-DESIGN.md](docs/H-UI-DESIGN.md) | 主界面 UI 方案与 Token 表 |
| [docs/I-PHASES.md](docs/I-PHASES.md) | 七阶段任务拆分 |
| [docs/J-ACCEPTANCE.md](docs/J-ACCEPTANCE.md) | 各阶段验收标准 |
| [docs/ARCHITECTURE-REVIEW.md](docs/ARCHITECTURE-REVIEW.md) | 架构自检结论 |
| [DECISIONS.md](DECISIONS.md) / [TASKS.md](TASKS.md) | 决策记录与待办 |
| [docs/release-notes/](docs/release-notes/) | 发版说明 |

## 许可证

本项目以 **MIT License** 开源，全文见 [LICENSE](LICENSE)。

- 不办理软件著作权登记。
- 开源不改变著作权归属；第三方素材不纳入本项目许可范围。
- 依赖许可白名单：MIT / Apache-2.0 / BSD-2-Clause / BSD-3-Clause / ISC / OFL；禁止 GPL / AGPL / LGPL / SSPL 及任何带商用限制的许可。
- 字体仅使用系统字体栈或 OFL 字体，不打包系统自带字体。
- 图标使用 ISC 许可的 Lucide，版权声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 素材合规声明

- **内置示例素材全部自绘**（HTML/CSS/JS 或 React 规格），安装包内不包含任何第三方截图、插画或录屏。
- 不使用 Dribbble、Mobbin、Behance 等站点截图打包分发。
- 用户自行导入的素材，其权利与分发责任由用户承担；软件只做本地存储与展示，不代为分发；导出包不自动嵌入第三方原文件。
- 风格名与设计参数不受著作权保护，可自由记录与生成提示词；受保护的是具体作品的表达。
- 素材来源逐条登记于 [docs/素材来源与许可.md](docs/素材来源与许可.md)。

## 开源致谢

感谢以下开源项目与服务：

- [Tauri](https://tauri.app/) — MIT / Apache-2.0
- [React](https://react.dev/) — MIT
- [Vite](https://vite.dev/) — MIT
- [TypeScript](https://www.typescriptlang.org/) — Apache-2.0
- [Tailwind CSS](https://tailwindcss.com/) — MIT
- [Zod](https://zod.dev/) — MIT
- [Motion](https://motion.dev/) — MIT
- [Lucide](https://lucide.dev/) — ISC
- [rusqlite](https://github.com/rusqlite/rusqlite) — MIT
- [SQLite](https://sqlite.org/) — Public Domain
- [Serde](https://serde.rs/) — MIT / Apache-2.0
- [TanStack Query](https://tanstack.com/query) — MIT
- [Zustand](https://zustand.docs.pmnd.rs/) — MIT

完整第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 仓库信息

- GitHub 仓库：[Murphmau5/Interface](https://github.com/Murphmau5/Interface)（public）。
- 默认分支：`main`。
- README 标题使用全称「界序 INTERFACE」，仓库名仅作标识。
- `.gitignore` 已排除 `node_modules/`、`src-tauri/target/`、`dist/`、`.screenshots/`、`.agent/logs/`、`artifacts/reference/`、本地数据库与素材目录。
- Release 附件含安装包与 SHA-256 校验和；发布说明存放在 [docs/release-notes/](docs/release-notes/)。

## 参与贡献

当前处于初始框架阶段，接口与数据模型仍可能调整。提交 Issue 前请先阅读 [PROJECT_CONSTITUTION.md](PROJECT_CONSTITUTION.md) 与 [TASKS.md](TASKS.md) 中的待确认事项。
