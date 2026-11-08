# C. 完整项目目录结构

> 版本：v0.1.0 · 2026-11-08
> 图例：`[已存在]` 当前文档基线；`[计划]` Phase 1–7 才创建。
> 原则：按「域 + 层」组织，不按页面堆文件；单文件职责单一。

```
e:\Workspace\Trae\界序 INTERFACE\
├─ PROJECT_CONSTITUTION.md              [已存在] 项目宪法
├─ PROJECT_OVERVIEW.md                  [已存在] 项目总览
├─ TASKS.md                             [已存在] 任务清单
├─ DECISIONS.md                         [已存在] 决策记录
├─ PROJECT_LOG.md                       [已存在] 项目日志
├─ CHANGELOG.md                         [已存在] 版本变更
├─ README.md                            [已存在] 说明与索引
├─ .editorconfig                        [计划]
├─
├─ .agent/                              [已存在]
│  ├─ logs/                             执行日志
│  ├─ temp/                             临时文件（可清理）
│  └─ reports/                          检查、测试、构建报告
│
├─ docs/                                [已存在]
│  ├─ A-PRD.md
│  ├─ B-ARCHITECTURE.md
│  ├─ C-STRUCTURE.md
│  ├─ D-ER-DESIGN.md
│  ├─ E-DATA-MODEL.md
│  ├─ F-PROVIDERS.md
│  ├─ G-AI-PIPELINE.md
│  ├─ H-UI-DESIGN.md
│  ├─ I-PHASES.md
│  ├─ J-ACCEPTANCE.md
│  ├─ ARCHITECTURE-REVIEW.md
│  ├─ 素材来源与许可.md
│  ├─ 技术栈方案.md                     [研究文档]
│  ├─ 知识域分类提案.md                 [研究文档]
│  ├─ 总清单.md                         [研究文档/合并稿]
│  ├─ 补充清单_结构文案与适配.md        [研究文档/并行会话产物]
│  └─ release-notes/
│     ├─ template.md                     发版说明模板
│     └─ v1.0.0.md                       初始框架预览版草稿（待构建/待发布）
│
├─ LICENSE                              MIT（已存在）
├─ .gitignore                           排除 target/、node_modules/、.agent/temp、本地库与素材（已存在）
│
├─ artifacts/                           [已存在]
│  ├─ reference/                        视觉参考图归档
│  ├─ builds/<version>/                 [计划] 安装包/构建产物
│  └─ exports/                          [计划] 临时导出样例（非用户数据）
│
├─ src-tauri/                           [计划] Rust / Tauri 后端
│  ├─ Cargo.toml
│  ├─ Cargo.lock
│  ├─ build.rs
│  ├─ tauri.conf.json
│  ├─ capabilities/
│  │  └─ default.json                   窗口权限、协议权限
│  ├─ icons/
│  ├─ migrations/
│  │  ├─ 0001_init.sql                  基线 schema
│  │  └─ 000X_<change>.sql              后续迁移（版本化）
│  └─ src/
│     ├─ main.rs
│     ├─ lib.rs                         注册命令、协议、事件
│     ├─ state.rs                       AppState：连接池、注册表、任务表
│     ├─ error.rs                       错误码与错误信封
│     ├─ commands/
│     │  ├─ mod.rs
│     │  ├─ cases.rs
│     │  ├─ relations.rs
│     │  ├─ tags.rs
│     │  ├─ collections.rs
│     │  ├─ assets.rs
│     │  ├─ preview.rs
│     │  ├─ ai.rs
│     │  ├─ discovery.rs
│     │  ├─ review.rs
│     │  ├─ settings.rs
│     │  └─ backup.rs
│     ├─ domain/
│     │  ├─ mod.rs
│     │  ├─ case.rs                      Case / DTO / 状态机
│     │  ├─ kind.rs                      CaseKind 枚举与判别
│     │  ├─ confidence.rs                FieldClaim / 四态规则
│     │  ├─ relation.rs                  case_relations
│     │  ├─ payload/
│     │  │  ├─ mod.rs
│     │  │  ├─ style.rs
│     │  │  ├─ motion.rs
│     │  │  ├─ feedback.rs
│     │  │  ├─ component.rs              atoms / patterns
│     │  │  └─ theme.rs                  候选（待确认）
│     │  └─ filters.rs                   列表筛选与排序
│     ├─ db/
│     │  ├─ mod.rs                       连接池、PRAGMA、完整性检查
│     │  ├─ migrate.rs
│     │  ├─ fts.rs
│     │  └─ repositories/
│     │     ├─ case_repo.rs
│     │     ├─ tag_repo.rs
│     │     ├─ relation_repo.rs
│     │     ├─ collection_repo.rs
│     │     ├─ asset_repo.rs
│     │     ├─ prompt_repo.rs
│     │     ├─ analysis_repo.rs
│     │     ├─ history_repo.rs
│     │     └─ settings_repo.rs
│     ├─ ai/
│     │  ├─ mod.rs
│     │  ├─ provider.rs                 AIProvider trait + DTO
│     │  ├─ registry.rs
│     │  ├─ capability.rs
│     │  ├─ schemas.rs                  Rust 硬门禁（serde + 业务规则 + schemars）
│     │  ├─ prompts/
│     │  │  ├─ analyze_image.md
│     │  │  ├─ analyze_video.md
│     │  │  ├─ analyze_webpage.md
│     │  │  ├─ generate_prompt.md
│     │  │  └─ compose_spec.md
│     │  ├─ providers/
│     │  │  ├─ mock.rs
│     │  │  └─ openai_compat.rs
│     │  └─ repair.rs                   一次修复策略
│     ├─ search/
│     │  ├─ mod.rs
│     │  ├─ provider.rs                SearchProvider trait
│     │  ├─ registry.rs
│     │  ├─ policy.rs                  来源、robots、版权策略
│     │  └─ providers/
│     │     ├─ mock.rs
│     │     ├─ bing.rs
│     │     ├─ tavily.rs
│     │     └─ brave.rs
│     ├─ discovery/
│     │  ├─ mod.rs
│     │  ├─ pipeline.rs                S0–S11 阶段编排
│     │  ├─ intent.rs                  查询意图解析
│     │  ├─ fetch.rs                   静态抓取
│     │  ├─ extract.rs                 标题/OG/DOM/CSS/媒体
│     │  ├─ screenshot.rs              [Phase 6] 可选
│     │  ├─ dedupe.rs                  URL/哈希/相似
│     │  ├─ draft.rs                   草稿案例生成
│     │  └─ limits.rs                  并发、限流、限额
│     ├─ preview/
│     │  ├─ mod.rs
│     │  ├─ protocol.rs               preview:// 处理
│     │  ├─ path_guard.rs
│     │  ├─ manifest.rs
│     │  └─ snapshot.rs               双主题快照
│     ├─ security/
│     │  ├─ mod.rs
│     │  ├─ url_guard.rs              SSRF / scheme / 内网
│     │  ├─ file_guard.rs             类型、大小、路径
│     │  ├─ secrets.rs                keyring 封装
│     │  └─ redact.rs                 日志脱敏
│     ├─ jobs/
│     │  ├─ mod.rs
│     │  ├─ queue.rs
│     │  └─ cancel.rs
│     └─ platform/
│        ├─ mod.rs
│        ├─ windows_theme.rs           系统主题监听
│        └─ paths.rs
│
├─ src/                                 [计划] React 前端
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ app/
│  │  ├─ router.tsx                    路由表（/library /style …）
│  │  ├─ providers.tsx                 Query / Theme / Toast
│  │  └─ layout/
│  │     ├─ AppShell.tsx               三栏外壳
│  │     ├─ LeftNav.tsx                域导航栈（≤2 层）
│  │     ├─ TopBar.tsx                 搜索、视图切换、收藏
│  │     └─ BottomTypeStrip.tsx        底部类型条带
│  ├─ i18n/
│  │  ├─ index.ts                      文案访问器 t(key)
│  │  └─ zh-CN.ts                      集中词条表（V1 唯一语言）
│  ├─ design/
│  │  ├─ tokens/
│  │  │  ├─ semantic.ts                语义 Token 名与文档
│  │  │  ├─ scale.ts                   spacing/radius/typography
│  │  │  └─ themes/
│  │  │     ├─ dark.ts
│  │  │     └─ light.ts
│  │  ├─ theme/
│  │  │  ├─ ThemeProvider.tsx          三态 + 系统监听
│  │  │  └─ useSystemTheme.ts
│  │  └─ styles/
│  │     ├─ global.css
│  │     └─ preview.css
│  ├─ components/
│  │  ├─ ui/                           Button/Input/Select/Switch/Slider/
│  │  │                                Checkbox/Radio/Card/Table/Avatar/
│  │  │                                Badge/Progress/Panel/Field/Chip/
│  │  │                                SegmentedControl/Tooltip/Dialog/Tabs
│  │  ├─ feedback/                     Toast/EmptyState/ErrorState/Skeleton
│  │  └─ data/                         CaseCard/CaseTable/ConfidenceChip/
│  │                                   RelationList/FilterBar/TypeCount
│  ├─ features/
│  │  ├─ library/                      默认视图（统计、最近、待审核）
│  │  ├─ style/
│  │  ├─ motion/
│  │  ├─ feedback/
│  │  ├─ components/                   atoms/patterns 子视图
│  │  ├─ theme/                        [候选] 待确认
│  │  ├─ collections/
│  │  ├─ recent/
│  │  ├─ case-detail/
│  │  │  ├─ CaseDetail.tsx
│  │  │  ├─ params/
│  │  │  │  ├─ StyleParams.tsx
│  │  │  │  ├─ MotionParams.tsx
│  │  │  │  ├─ FeedbackParams.tsx
│  │  │  │  ├─ ComponentParams.tsx
│  │  │  │  └─ ThemeParams.tsx         [候选]
│  │  │  └─ PromptTabs.tsx
│  │  ├─ ai-studio/
│  │  ├─ discovery/
│  │  ├─ review/
│  │  └─ settings/
│  │     ├─ ThemeSettings.tsx
│  │     ├─ AiSettings.tsx
│  │     ├─ SearchSettings.tsx
│  │     ├─ StorageSettings.tsx
│  │     ├─ PreviewSettings.tsx
│  │     ├─ BackupSettings.tsx
│  │     └─ About.tsx
│  ├─ preview/
│  │  ├─ host/
│  │  │  ├─ PreviewFrame.tsx
│  │  │  ├─ PreviewControls.tsx        播放/暂停/重播/循环/调速
│  │  │  ├─ ViewportSwitch.tsx         手机/桌面
│  │  │  └─ usePreviewBridge.ts
│  │  ├─ runtime/                      [独立入口] 隔离 iframe 运行时
│  │  │  ├─ index.html
│  │  │  ├─ runtime.ts                 postMessage 协议
│  │  │  ├─ params.ts                  参数应用
│  │  │  ├─ drivers/                   css.ts / waapi.ts / gsap.ts / lottie.ts
│  │  │  └─ react-spec/                规格驱动 React 渲染
│  │  └─ shared/
│  │     └─ protocol.ts                消息类型（双端共享，无业务依赖）
│  ├─ data/
│  │  ├─ ipc.ts                        invoke 封装 + 错误映射
│  │  ├─ queryKeys.ts
│  │  ├─ hooks/
│  │  └─ stores/                       Zustand：筛选、布局、视图偏好
│  └─ lib/
│     ├─ format.ts
│     ├─ confidence.ts
│     ├─ ids.ts
│     └─ validation.ts
│
├─ tests/                               [计划]
│  ├─ unit/                            前端单元（Vitest）
│  ├─ integration/                     数据/迁移/导入导出
│  ├─ e2e/                             关键路径
│  └─ fixtures/                        Mock 案例与 Mock Provider 响应
│
├─ scripts/                             [计划]
│  ├─ check.ps1                        tsc + eslint + clippy + test
│  ├─ seed-dev.ps1                     本地样例数据（仅开发）
│  ├─ backup-dev.ps1
│  └─ check-licenses.mjs               [并行会话产物，未验收] 前端依赖许可检查
│
├─ package.json                         [计划]
├─ pnpm-lock.yaml                       [计划] 包管理器待确认
├─ tsconfig.json                        [计划]
├─ vite.config.ts                       [计划]
├─ tailwind.config.ts                   [计划]
└─ vitest.config.ts                     [计划]
```

## 目录规则

1. `features/*` 不得互相深引用；共享 UI 上移到 `components/`。
2. `preview/runtime` 是独立构建入口，不得 import `features/`、`data/`、`stores/`。
3. Rust `commands` 不写 SQL；`repositories` 不调 AI/搜索。
4. 每个 kind 的 payload schema 唯一：Rust（serde + 校验）与前端 Zod 必须保持一致，Phase 1 建立共享 JSON Schema 源或逐字段对照测试。
5. 所有新增目录必须在本文档登记，不允许「悄悄新建一套平行结构」。
