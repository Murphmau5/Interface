# PROJECT_OVERVIEW.md — 项目总览

> 版本：v0.1.0（文档基线，尚未进入编码）
> 更新日期：2026-11-08

## 1. 项目基本信息

| 项 | 内容 |
|---|---|
| 产品名 | **界序 INTERFACE** |
| 内部代号 | UI Motion Lab（不用于用户可见文案） |
| 命名状态 | **已确认**（D-014） |
| 一句话定位 | 一间双主题的深色实验室，不是素材展厅 |
| 目标平台 | Windows 10 / 11（macOS 仅保留架构可能性） |
| 当前阶段 | 启动前文档基线（Phase 0）；工作区存在并行工程脚手架，未纳入本基线 |
| 当前版本 | 产品 v1.0.0（初始框架预览版，安装包待构建）；文档基线 v0.1.2 |
| 许可 | MIT（不办理软件著作权登记） |
| 发布 | GitHub `Interface`（public，待授权）；发版说明在 `docs/release-notes/` |

## 2. 要解决的问题

把散落在网页、截图、视频、代码演示中的 UI 设计知识，转成**可验证、可检索、可预览、可复用的结构化案例**，并让这些案例能直接变成给编程 Agent 使用的提示词。

核心差异：每个关键参数都带 `verified / estimated / user_defined / unknown` 置信度，推测值不允许伪装成真实参数。

## 3. 核心功能

### 3.1 内容域（4 个）

| 域 | 回答的问题 | 主要分类 |
|---|---|---|
| 风格 Style | 这套界面整体像什么 | 新拟态、玻璃拟态、扁平、极简、Material、Fluent、液态玻璃、拟物、Bento、编辑式、Dark UI、赛博朋克 |
| 动效 Motion | 状态之间怎么过渡 | 页面/卡片/弹窗/微交互/其他动效 |
| 交互反馈 Feedback | 什么触发了什么回应 | 成功/错误/警告/信息、Toast、Snackbar、Tooltip、Loading、Skeleton、Progress、空状态、拖拽、点击、触觉 |
| UI 组件 Components | 长什么样、出现在哪儿 | 基础控件 atoms + 复合模式 patterns |
| 主题 Theme（候选，待确认） | 同一套界面怎么换皮 | 深浅切换、品牌色、强调色推导、跟随系统、继承与覆盖 |

### 3.2 组件域两层

- **atoms**：Button、Input、Select、Switch、Slider、Checkbox、Radio、Card、Table、Avatar、Badge、Progress 等。单个、无场景、只讲形态与状态。
- **patterns**：顶部胶囊通知、顶部/底部导航条、底部 Tab、侧边栏、命令面板、搜索栏、设置项行、Banner、空状态、下拉刷新、分页器、面包屑等。成组、带位置、带生命周期。
- patterns 额外记录：出现位置（顶部/底部/内联/浮层/全屏）、生命周期（常驻/临时/可关闭）、停留与消退时间、点击与关闭行为、配套动效、配套反馈。

### 3.3 跨域去重

每条案例只有一个主域 `kind`；组件域答「长什么样、出现在哪儿」，反馈域答「什么触发了什么回应」，动效域答「状态之间怎么过渡」。其余通过关联字段引用。例：顶部胶囊通知主域 = 组件，关联 feedback「信息提示」与 motion「自顶部滑入」。

### 3.4 工具位（3 个）

- **AI 工作台**：素材分析、结构化输出、提示词生成、设计组合。
- **AI 发现**：自然语言搜索、多来源候选、网页抓取、案例识别、去重、待审核。
- **设置**：主题、AI、搜索、存储、预览、采集、备份。

### 3.5 导航与列表

- 一级 = 已确认的 4 内容域 + 3 工具位；**Theme 是否成为第 5 个内容域待确认**（D-017 推荐独立）。
- 库的默认视图（合并原「首页 Dashboard」与「知识库管理」）作为进入知识库的落地页。
- 「我的收藏」「最近使用」下沉到左栏底部，是视图不是分类。
- 列表区底部有按类型切换的**类型条带**（全部 / 风格 / 控件 / 主题 / 动效 / 反馈），与左栏共用同一个 `activeType` 状态（D-018，待确认）。
- 列表支持网格与表格两种视图；表格用于收集后的清单核对。
- 该结构调整见 `DECISIONS.md` D-002（待用户确认）。

## 4. 功能状态

| 模块 | 状态 |
|---|---|
| 治理文档七件套 | 已完成（待用户确认基线） |
| 启动前 10 份设计文档 A–J | 已完成 |
| 架构自检 | 已完成，见 `docs/ARCHITECTURE-REVIEW.md` |
| 工程初始化（Tauri/依赖） | 未开始（需用户批准） |
| 业务代码 | 未开始 |

## 5. 技术栈与整体架构

- 桌面：Tauri 2；前端 React + TypeScript + Vite；后端 Rust；数据库 SQLite（rusqlite + bundled，已采纳）。
- 样式：Tailwind + 语义 Token CSS 变量，双主题。
- 状态：Zustand（UI 态）+ TanStack Query（数据）。
- 校验：Rust 侧硬门禁（serde + schemars）+ Zod 前端第二道。
- AI/Search：可插拔 Provider，密钥入 OS 凭据存储。
- 预览：隔离 iframe + `preview://` 本地协议 + postMessage 控制。

详细分层、数据流与安全模型见 [docs/B-ARCHITECTURE.md](docs/B-ARCHITECTURE.md)。

## 6. 文档地图

| 文档 | 内容 |
|---|---|
| [PROJECT_CONSTITUTION.md](PROJECT_CONSTITUTION.md) | 长期工程约束 |
| [docs/A-PRD.md](docs/A-PRD.md) | 产品需求文档 |
| [docs/B-ARCHITECTURE.md](docs/B-ARCHITECTURE.md) | 技术架构设计 |
| [docs/C-STRUCTURE.md](docs/C-STRUCTURE.md) | 完整目录结构 |
| [docs/D-ER-DESIGN.md](docs/D-ER-DESIGN.md) | 数据库 ER 设计 |
| [docs/E-DATA-MODEL.md](docs/E-DATA-MODEL.md) | 核心 TypeScript 类型 |
| [docs/F-PROVIDERS.md](docs/F-PROVIDERS.md) | AI / Search Provider 架构 |
| [docs/G-AI-PIPELINE.md](docs/G-AI-PIPELINE.md) | 采集与案例分析流程 |
| [docs/H-UI-DESIGN.md](docs/H-UI-DESIGN.md) | 主界面 UI 设计 |
| [docs/I-PHASES.md](docs/I-PHASES.md) | 七阶段任务拆分 |
| [docs/J-ACCEPTANCE.md](docs/J-ACCEPTANCE.md) | 阶段验收标准 |
| [docs/ARCHITECTURE-REVIEW.md](docs/ARCHITECTURE-REVIEW.md) | 架构自检结论 |
| [DECISIONS.md](DECISIONS.md) | 决策记录 |
| [TASKS.md](TASKS.md) | 任务状态 |
| [PROJECT_LOG.md](PROJECT_LOG.md) | 执行日志 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更 |
| [artifacts/reference/](artifacts/reference/) | 视觉参考图归档 |

## 7. 运行、调试、测试、构建

本基线未初始化工程。工作区虽存在并行会话生成的脚手架（`src/`、`src-tauri/`、`package.json` 等），但未经本基线评审，不能视为可运行版本；是否保留见 Q-13。Phase 1 完成后本节必须补齐：开发命令、构建命令、测试命令、数据目录说明、日志位置。

## 8. 已知限制与风险

1. 导航由 10 项改为 4+3 属结构调整；Theme 是否独立为第 5 域、底部类型条带的筛选语义均待确认（Q-02/Q-11）。
2. 单主表替代五张平行表属数据模型调整（待确认）。
3. 网页动态抓取依赖浏览器自动化，包体与合规风险高（见 D-010）。
4. AI 视觉分析无法从静态截图得出真实时长/缓动，只能标记 `estimated`。
5. V1 无向量检索；语义搜索能力受限（预留扩展）。
6. Windows 专有凭据与路径逻辑需隔离在平台层，避免阻断未来 macOS 迁移。
7. GSAP 许可不在白名单，预览运行时默认改用 CSS/WAAPI（D-026）。
8. 中文搜索需自建分词与拼音索引，维护成本高于英文前缀检索。

## 9. 当前阶段与下一步

- 当前：Phase 0 文档基线完成，等待用户确认。
- 下一步：用户确认后进入 Phase 1（Tauri 初始化、目录骨架、主题系统、三栏外壳、SQLite 迁移、基元组件）。
- 未获确认前：不初始化工程、不安装依赖、不写业务代码。
