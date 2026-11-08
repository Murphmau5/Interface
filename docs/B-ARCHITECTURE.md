# B. 技术架构设计文档

> 版本：v0.1.0 · 2026-11-08 · 状态：基线草案，待用户确认
> 关键技术选型存疑项标注「待确认」，不在本文档中伪装成已定。

## 1. 架构目标

1. 本地优先：AI 与搜索是增强，不是启动依赖。
2. 可验证：数据模型与 UI 都强制携带置信度。
3. 可扩展：新增案例 kind、AI Provider、Search Provider 不改横切能力。
4. 可隔离：案例预览不获得主应用权限。
5. 可迁移：领域层不依赖 Windows 专有 API，为 macOS 留路径。

## 2. 技术栈与版本策略

| 层 | 选型 | 说明 |
|---|---|---|
| 桌面壳 | Tauri 2 | 单窗口；不使用 Electron |
| 前端 | React + TypeScript（strict）+ Vite | Phase 1 锁定具体版本并记录 |
| 样式 | Tailwind CSS + CSS 变量语义 Token | 禁止组件硬编码颜色/圆角 |
| 状态 | Zustand（UI 态）+ TanStack Query（数据） | 业务数据不塞 Zustand |
| 路由 | React Router | 路由表集中 |
| 校验 | Zod（前端第二道） | Rust 侧 serde + schemars 为硬门禁；见 §6.4 |
| 图标 | Lucide | 不自绘体系 |
| 动效 | 外壳：CSS + Motion；预览：CSS / WAAPI（默认） | GSAP 许可不在白名单，默认不打包（D-026） |
| 后端 | Rust（stable）+ Tokio + Serde | 领域层平台无关 |
| 数据库 | SQLite 3 + **rusqlite（bundled）+ 自写迁移器（已采纳）** | 不使用 tauri-plugin-sql；单写队列 |
| 搜索 | FTS5 `trigram` + 分词索引（`unicode61`）+ 拼音索引 | 详见 §6.6 |
| 凭据 | `keyring` crate → Windows Credential Manager | 不回退明文 |
| HTTP | `reqwest`（rustls） | 超时、限流、UA 可配 |
| 哈希 | `sha2` | 素材去重 |
| 日志 | `tracing` + 本地滚动文件 | 不含密钥 |

## 3. 进程与线程模型

```
Tauri 主进程（Rust）
├─ 窗口/WebView（React 前端）
├─ 命令层（IPC handlers）
├─ 服务层（domain / db / ai / search / discovery / preview / security）
├─ 任务执行器（Tokio runtime，AI/抓取任务带取消令牌）
└─ SQLite（单写连接池 + WAL）

WebView 内
├─ 主应用渲染器（React）
└─ 预览 iframe（sandbox，独立 CSP，preview:// 协议）
```

- 单窗口 V1。预览不新开系统进程。
- 长任务（分析、发现）在 Rust 侧执行，进度通过 Tauri event 推送；前端不做长轮询。
- 所有长任务必须支持取消；取消是协作式（检查点）。

## 4. 分层与职责

### 4.1 前端

| 层 | 职责 | 禁止 |
|---|---|---|
| `app/` | 路由、Provider、全局布局 | 不放业务规则 |
| `features/*` | 各域与工具位的页面与交互 | 不直接写 SQL/HTTP |
| `components/ui` | 设计系统基元（Button、Field、Chip、Panel…） | 不依赖 feature |
| `preview/host` | 预览 iframe 宿主、控制指令、参数面板绑定 | 不执行案例代码 |
| `preview/runtime` | 隔离运行时（postMessage 协议、参数应用） | 不 import 主应用 |
| `data/` | IPC 封装、Query hooks、DTO 映射 | 不写 UI |
| `design/` | Token 定义、主题映射、全局样式 | 不写业务 |
| `i18n/` | 集中词条表（V1 仅中文一套）、文案访问器 | 组件内禁止硬编码文案 |
| `lib/` | 纯工具（格式化、校验适配、日期） | 无副作用 |

### 4.2 Rust

| 模块 | 职责 | 依赖 |
|---|---|---|
| `commands/*` | 参数校验、权限、错误映射、调用服务 | domain、db、ai… |
| `domain/*` | 案例模型、kind 判别、payload、置信度、关系 | 无（纯逻辑） |
| `db/*` | 连接池、迁移、仓储、FTS | domain |
| `ai/*` | Provider 注册、调用、Schema 校验、提示词模板 | domain、security |
| `search/*` | Provider 注册、搜索、来源元数据 | domain、security |
| `discovery/*` | 采集流水线、去重、限流、取消、审核入队 | ai、search、db |
| `preview/*` | 本地协议、资源白名单、清单生成 | db、security |
| `security/*` | URL 守卫、路径守卫、凭据、密钥脱敏 | 无 |
| `jobs/*` | 任务队列、进度、取消令牌 | 各服务 |
| `platform/*` | Windows 主题监听、路径、凭据适配 | OS API（仅此层） |

## 5. IPC 契约

### 5.1 命名与信封

- command：snake_case；DTO 字段：camelCase（Serde `rename_all`）。
- 成功：直接返回 DTO。
- 失败：`{ code, message, retryable, details? }`。

错误码基线：

```
E_VALIDATION       入参或 payload 校验失败
E_NOT_FOUND        资源不存在
E_CONFLICT         唯一约束/重复案例冲突
E_DB               数据库错误
E_IO               文件读写错误
E_BLOCKED_URL      URL 被安全策略拒绝
E_NETWORK          网络失败
E_AI_UNAVAILABLE   Provider 未配置/不可用
E_AI_TIMEOUT       AI 超时
E_AI_SCHEMA        AI 输出不符合 Schema
E_SEARCH_UNAVAILABLE
E_RATE_LIMIT
E_PREVIEW_SANDBOX  沙箱/协议错误
E_CANCELLED        任务被取消
E_UNSUPPORTED      当前版本不支持
```

### 5.2 命令清单（V1 基线）

| 域 | 命令 |
|---|---|
| 案例 | `cases_list` `cases_get` `cases_create` `cases_update` `cases_soft_delete` `cases_restore` `cases_search` `cases_counts` |
| 关系 | `case_relations_list` `case_relations_add` `case_relations_remove` |
| 标签/集合 | `tags_list` `tags_upsert` `collections_list` `collections_create` `collections_add_case` `collections_remove_case` |
| 资产 | `assets_import` `assets_get` `assets_delete` |
| 预览 | `preview_manifest` `preview_asset_url`（内部协议生成，不暴露任意路径） |
| AI | `ai_providers_list` `ai_provider_test` `ai_analyze_asset` `ai_generate_prompt` `ai_compose_spec` `ai_task_cancel` |
| 发现 | `discovery_start` `discovery_cancel` `discovery_status` `discovery_candidates_list` |
| 审核 | `review_list` `review_approve` `review_reject` `review_update_draft` |
| 设置 | `settings_get` `settings_set` `secrets_set` `secrets_exists` `secrets_delete` |
| 数据 | `backup_export` `backup_import` `storage_stats` `storage_root_set` `export_case`（Markdown + JSON 双格式，内容一致，文件名带版本与日期） |

### 5.3 事件

`ai_task_progress`、`discovery_progress`、`discovery_candidate_added`、`theme_system_changed`、`db_migration_status`。

## 6. 关键数据流

### 6.1 读

UI → `data/*` Query → command → 仓储 → DTO（含 `confidence` 摘要）→ 缓存 → 渲染。

### 6.2 写

UI → command → 入参 Zod/Rust 校验 → payload schema → 事务写 `cases` + 关联 → `case_history` → 返回 DTO → Query 失效。

### 6.3 预览

1. UI 调 `preview_manifest(caseId)` 取清单：entry URL、CSP、能力开关、参数 schema。
2. 宿主创建 `iframe sandbox="allow-scripts"`（**禁止** `allow-same-origin`），加载 `preview://case/<id>/index.html`。
3. 运行时启动后回发 `ready`；宿主 postMessage 注入参数。
4. 用户操作 → 宿主发 `control { action: play|pause|replay|reset|loop|speed|duration|easing|distance|state|viewport }`。
5. 运行时回发 `state`，宿主展示当前进度；失败回发 `error`，宿主可见提示。

参数真实生效是产品硬要求：运行时必须实现参数到渲染的直接映射，不允许「面板动了、画面没动」。

**共享悬停预览层（已定）：**

- 全页只有一个悬停预览容器，跟随当前卡片定位；切换卡片只换内容，不重建容器。
- 列表卡片内**不常驻** iframe/WebGL 上下文；悬停层复用与右栏相同的播放内核，只是参数集固定为「自动播放、单次、默认参数、卡片尺寸」。
- 触发延迟 140ms；移出立即 `stop + reset` 回首帧；列表滚动、筛选变化、打开详情时销毁。
- 同一时刻只允许一个悬停预览存活；`Tab` 聚焦等同 hover。
- `prefers-reduced-motion` 下只播一次、不循环。
- 悬停层默认不加载远程资源、不播放声音；资源不可用时显示首帧与「无预览」标记。

### 6.4 AI

素材 → `ai_analyze_asset` → 任务入队 → Provider → 原始输出 → Schema 校验（失败则一次修复，仍失败则拒绝）→ `ai_analysis` → 草稿案例（`status=draft`，`review=pending`）→ 待审核。

### 6.5 发现

`discovery_start` → 意图解析 → 关键词 → SearchProvider → 候选 URL → URL 守卫 → 抓取/截图 → 提取 → AI 分析 → 去重 → 草稿 → 待审核。详见 G。

### 6.6 中文优先搜索架构（已定，中文优先）

**三层索引（写入时维护，读取时统一排序）：**

| 层 | 实现 | 覆盖 | 说明 |
|---|---|---|---|
| 子串层 | FTS5 `trigram` | 任意位置子串（「卡展」→「卡片展开动效」） | FTS5 `trigram` 实际要求匹配串 ≥ 3 字符；**2 字查询**（如「卡展」）改走分词层 + `LIKE` 兜底 |
| 分词层 | 写入时用 jieba 类分词（`jieba-rs`，待确认）预切，索引进 FTS5 `unicode61` | 多词查询、2 字词 | 分词结果与原文同时入索引，避免切错后搜不到 |
| 拼音层 | 标题与标签生成全拼 + 首字母索引 | `kzpk` → 卡片展开 | 例如 `kapianzhankai` / `kzpk`；需处理多音字（只做常见读音，不追求全量） |

**查询管线（按顺序，命中即返回并记录档位）：**

1. 精确匹配（名称/别名完全相同）
2. 分词索引（按词命中）
3. `trigram` 子串
4. 同音/近义建议（「你是不是想找…」）；**不用编辑距离硬扛**

**排序权重：** 完全匹配 > 标题命中 > 标签命中 > 描述命中；同档内按最近使用、收藏加权；置信度不参与搜索排序。

**搜索范围：** 案例名称、描述、标签、平台、类型/域、风格名、提示词内容、来源站点。

**索引维护：** 与案例写入同一事务；重建索引命令 `search_rebuild_index` 仅在迁移/导入后执行；不在每次读取时重建。

**双作用域（已定）：**

| 作用域 | 触发 | 数据来源 | 呈现 |
|---|---|---|---|
| 本地（默认） | 输入即搜；`Enter` | `cases` 三层索引 | 主列表，参与排序与计数 |
| 联网 | `Ctrl+Enter`，或本地无结果时点击「要不要联网找找？」 | SearchProvider | 独立区域「网络候选 / 未审核」，带来源域名、作者、发现时间；不混入本地列表、不参与本地排序 |

- **禁止自动联网**：任何输入都不得隐式触发网络请求；必须显式按键或点击。
- 未配置搜索 Key：联网入口降级为「粘贴网址抓取该页面」，走 URL 守卫 + 抓取器，不依赖 Key。
- 候选与正式库**物理分表**：`candidates` 表存候选，审核通过后才生成 `cases`；候选不进入本地索引。

**IPC 命令：**

- `search_local(query, filters)` → 本地结果 + 计数
- `search_network(query)` → 候选列表（写入 `candidates`，返回 `CandidateListItem[]`）
- `candidates_list / candidates_approve / candidates_reject / candidates_expire`
- `url_fetch_preview(url)` → 不落库的页面抓取预览

### 6.7 界面语言（已定，中文优先）

- V1 全部界面文案、空状态、错误提示、示例数据一律中文。
- 文案集中存放在 `src/i18n/zh-CN.ts`（结构为 `key → string`），组件只通过 `t('key')` 访问。
- 即使只有中文一套，也保留 locale 结构与键名规范，为后续语言留位；不引入运行时切换 UI。

## 7. 预览安全模型

| 威胁 | 对策 |
|---|---|
| 案例脚本读取本地文件 | 不开 `allow-same-origin`；`file://` 与任意路径不可达；只暴露 `preview://` 白名单 |
| 案例发起网络请求 | CSP `connect-src 'none'`、`img-src` 限定 `preview:`/`data:`；外部资源不入库 |
| 案例访问主应用 | 独立 iframe，无共享 storage/主应用全局；postMessage 校验 `event.source` 与消息白名单 |
| 路径穿越 | 协议处理器只解析相对 `assets/<caseId>/preview/` 内路径，拒绝 `..`、绝对路径、符号链接 |
| 恶意大文件 | 单文件与总包大小上限；类型白名单；导入前嗅探 |
| 拓扑枚举 | 协议 URL 不可猜测？caseId 为 UUID；仍以路径守卫为主 |

CSP 基线（Phase 3 定稿）：

```
default-src 'none';
img-src preview: data: blob:;
media-src preview:;
style-src preview: 'unsafe-inline';
script-src preview: 'nonce-<per-manifest>';
font-src preview:;
connect-src 'none';
```

**研究补充（2026-11-08，来自 `docs/技术栈方案.md`，基线不变但必须加固）：**

- Tauri 在 Windows 会把自定义协议页（`http(s)://<scheme>.localhost`）判为 **local**，capability 默认可达。因此 `sandbox` 不能作为唯一防线。
- `allow-scripts` 不含 `allow-same-origin` 时 iframe 为 opaque origin：`localStorage`/`indexedDB`/`cookie` 不可用，`postMessage` 的 `event.origin` 为 `null`（**不可作身份凭据**）。
- `app.security.csp` 只作用于 Tauri 构建的 HTML；预览文档的硬约束必须由**协议处理器写响应头**，父文档 `frame-src` 决定能否加载。
- 必须叠加：会话 token（一次性、随 manifest 下发）+ 协议路径白名单 + 子文档 CSP 响应头 + `event.source` 校验 + 心跳看门狗（超时回收 iframe）。
- 上述结论不改变 D-009 的方案方向，但把「单一 sandbox 防线」降级为「多层防线」；Phase 3 原型按此验收。

React 案例：V1 不执行任意 React 源码，使用「规格驱动运行时」——案例提供结构化规格，运行时用受控组件渲染；复杂案例退化为 HTML/CSS/JS。此边界写入 J 验收。

## 8. 存储与备份

### 8.1 数据目录（安装版）

```
<appData>/jiexu-interface/
├─ db/app.db
├─ assets/objects/<sha256>/          # 内容寻址对象库（已采纳）
├─ snapshots/<caseId>/light.png, dark.png
├─ exports/
├─ logs/
└─ backups/
```

- 素材采用**内容寻址对象库 + 关联表**（`assets` + `case_assets`），不做 `assets/<caseId>/` 直接堆文件；导出时再物化为案例目录（D-021）。
- 设置可指定存储根路径（`storage.rootPath`），迁移时必须先校验目标可写并复制校验和。
- 开发期项目数据（文档、日志、报告）留在项目工作根目录；运行时数据不写开发目录。

### 8.2 备份

导出 `.umlbak`（zip）：`manifest.json`（版本、schema 版本、时间、统计）+ `app.db` 快照 + `assets/` + `snapshots/`；**排除密钥与凭据**。
导入：校验版本与 schema → 可选合并/覆盖 → 迁移 → 重建 FTS → 记录日志。

## 9. 离线与降级矩阵

| 条件 | 行为 |
|---|---|
| AI 未配置 | AI 入口可见并标「未配置」，点击进入设置引导；不清空数据、不用红色警告；库、预览、搜索、收藏、导入完全可用 |
| 搜索未配置 | 联网入口降级为「粘贴网址抓取该页面」；手动 URL 导入仍可用 |
| 断网 | 发现任务快速失败并记录；本地功能不受影响；AI 请求超时后可见错误 |
| 模型超时 | 任务标记失败，可重试；不阻塞其他任务 |
| Schema 失败 | 一次修复尝试；仍失败则拒绝入库并保留原始输出供诊断 |
| 数据库损坏 | 启动时完整性检查；提示从备份恢复；不自动清库 |

## 10. 并发、限流与取消

- AI 并发上限默认 2（可配）；搜索并发 1；抓取并发 2（按域名串行）。
- 每 Provider 令牌桶限流；429 退避。
- 超时：AI 60s（视觉 90s）、搜索 20s、网页抓取 30s；可配但写入设置。
- 取消：任务粒度令牌，检查点在网络前后、AI 调用前后、入库前。
- 同一 URL 去重锁，避免并发重复采集。

## 11. 性能预算（万级结构先行，已定）

| 指标 | 目标 |
|---|---|
| 冷启动 | ≤ 2.5s |
| 列表滚动 | 1 万条库下 60fps（虚拟滚动） |
| 首屏分页 | 每页 40 条；滚动接近底部预取下一页 |
| 搜索首屏 | 1 万条库 ≤ 300ms（索引先行） |
| 详情打开 | ≤ 150ms（不含预览资源） |
| 预览首帧 | ≤ 800ms（本地资源） |
| 缩略图 | 多档预生成（128 / 256 / 512），按容器尺寸选择 |
| 空闲内存 | ≤ 250MB（悬停预览层不常驻渲染实例） |

**硬约束（D-028）：** 条目少时也必须按万级结构搭建，不做「先简化后重构」。

措施：虚拟滚动、分页加载、缩略图多档预生成、FTS/拼音索引先行、避免主线程同步大 JSON、预览按需加载、悬停共享层。

## 12. 日志与可观测性

- 本地结构化日志（JSON lines），按天滚动，默认保留 14 天。
- 字段：时间、级别、模块、任务 id、错误码、耗时；**不含**密钥、完整 cookie、用户隐私。
- 开发期日志与报告放 `.agent/logs`、`.agent/reports`；应用运行日志在 appData。
- 无云端遥测（V1）。

## 13. 测试策略

| 层 | 内容 |
|---|---|
| 单元 | Zod schema、置信度规则、URL 守卫、路径守卫、去重、Token 映射 |
| 集成 | 迁移、导入导出、软删除、FTS 搜索、审核流转 |
| 前端 | 关键组件交互、双主题快照、参数面板→预览指令 |
| 端到端 | 导入→详情→调参→收藏；AI Mock 全流程 |
| 安全 | 沙箱逃逸尝试、SSRF 用例、路径穿越用例 |

AI 测试默认用 Mock Provider，禁止污染真实 API 配额。

## 14. 构建与发布

- 开发：Vite dev + Tauri dev；构建：`tauri build`（Windows NSIS/MSI 待定）。
- 产物：`artifacts/builds/<version>/`（开发期）。
- 签名与自动更新：V1 不做自动更新；安装包签名待确认。
- 版本：`MAJOR.MINOR.PATCH`；每次发布更新 CHANGELOG 与日志。

## 15. 许可与合规（不可协商，已定）

| 项 | 约束 |
|---|---|
| 项目许可 | MIT；`LICENSE` 保留 MIT 原文，仅补年份与作者署名；不办理软件著作权登记 |
| 示例素材 | 全部自绘（HTML/CSS/JS 或 React 规格）；安装包内不得出现第三方截图、插画、录屏 |
| 依赖许可白名单 | 仅 MIT / Apache-2.0 / BSD-2-Clause / BSD-3-Clause / ISC / OFL；**禁止 GPL / AGPL / LGPL / SSPL 及任何商用限制许可** |
| 许可检查 | 必须构建期可执行：Rust 用 `cargo-deny`（`licenses` + `bans`）、前端用 `license-checker`/`pnpm licenses`，CI 失败即阻断 |
| 字体 | 仅系统字体栈或 OFL 字体（如 Inter）；禁止打包系统自带字体（微软雅黑、SF Pro 等） |
| 图标 | ISC 图标库（Lucide）；about 页与文档保留版权声明 |
| 用户导入素材 | 只本地存储与展示，不代为分发；导入时提示用户自行确认权利；导出包不自动嵌入第三方素材原文件 |
| 素材来源记录 | `docs/素材来源与许可.md` 逐条登记；未自绘不得入库；「用户导入」必须记录入库来源 |

## 16. 待确认架构问题

1. Playwright 可选 sidecar（Q-06）。
2. 向量检索是否彻底移出 V1（Q-07）。
3. 安装包格式与签名（NSIS / MSI；是否签名）。
4. 状态色 Token 扩展（Q-04）。
5. Theme 独立成域对路由与数据模型的影响（Q-11）。
6. 分词库选型（`jieba-rs` 为建议，需确认体积与词典维护成本）。
7. 拼音库选型（全拼/首字母生成方式，多音字处理边界）。
8. WebView2 分发形式（在线 / 离线变体 / fixedRuntime，影响包体 +127MB）。
