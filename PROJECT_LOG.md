# PROJECT_LOG.md — 项目日志

> 追加记录，不覆盖历史。每条记录真实发生的工作，未执行的事项不得写成已完成。

---

## 2026-11-08 20:5x（Asia/Shanghai）— Phase 0 文档基线建立

- Agent/工具：Trae Agent（DeepSeek-V4.1-Flash）
- 任务名称：建立 AI Agent 项目治理基线并产出启动前 10 份设计与规划文档
- 用户需求摘要：
  1. 依据《通用 AI Agent 项目治理与开发约束提示词》，在空项目中建立治理文件。
  2. 依据《界序 INTERFACE》需求原文与视觉参考图，产出 A–J 十份文档。
  3. 已确定基调：双主题对等、Token 两层、强调色按主题换值、仪器台视觉、风格页并排双快照、预览为核心、本地优先。
  4. 结构决策：4 内容域 + 3 工具位；单主表 + kind + typed payload；命名待确认。
  5. 修正：默认主题为「跟随系统」，非深色。
  6. 补充：组件域分 atoms/patterns 两层；跨域单主域去重规则。
- 本阶段边界：只写文档，不初始化 Tauri、不安装依赖、不写业务代码、不生成前端页面。

### 新增/修改的文件

| 文件 | 动作 | 内容 |
|---|---|---|
| `PROJECT_CONSTITUTION.md` | 新增 | 15 章宪法：目标边界、技术基线、模块边界、编码、UI/UX、数据存储、接口、依赖、安全、质量、构建发布、修改扩展、禁止事项、基调约束、修订记录 |
| `PROJECT_OVERVIEW.md` | 新增 | 项目总览、功能状态、技术结构、文档地图、风险 |
| `TASKS.md` | 新增 | Phase 0 完成项、10 个待确认问题、Phase 1–7 状态、风险 |
| `DECISIONS.md` | 新增 | D-001–D-016，含默认主题、导航、单主表、组件两层、置信度、Token、预览隔离、Playwright、SQLx、向量检索、命名等 |
| `PROJECT_LOG.md` | 新增 | 本记录 |
| `CHANGELOG.md` | 新增 | v0.1.0 文档基线 |
| `README.md` | 新增 | 项目说明与文档索引 |
| `docs/A-PRD.md` ~ `docs/J-ACCEPTANCE.md` | 新增 | 启动前 10 份设计文档 |
| `docs/ARCHITECTURE-REVIEW.md` | 新增 | 架构自检结论 |
| `.agent/logs/` `.agent/temp/` `.agent/reports/` `docs/` `artifacts/` | 新增目录 | 治理目录骨架 |
| `artifacts/reference/深色动效设计灵感库.png` | 新增（复制） | 视觉参考图归档（源文件在只读附件目录，未修改源文件） |

### 执行过的工具与检查

- 读取：治理提示词、项目需求 TXT、视觉参考图 PNG。
- 目录创建：PowerShell `New-Item`。
- 文件复制：PowerShell `Copy-Item`（仅从只读附件复制参考图，未修改源）。
- 校验：文档间字段/表名/Token 值一致性人工核对（见 `docs/ARCHITECTURE-REVIEW.md`）。
- 未执行：依赖安装、工程初始化、编译、自动化测试、应用运行。（当前无代码，属预期）

### 未完成事项与风险

- 10 个待确认问题（Q-01–Q-10）未解决，Phase 1 不得启动。
- 命名未定，Tauri identifier 无法确定。
- 预览沙箱与 Playwright 方案仍待验证（设计层面已给出风险与降级路径）。
- 文档内数值（Token、时长、间距）为基线建议，需用户确认或在 Phase 1 落地时复核。

### 需要用户确认

- 文档基线整体确认；Q-01–Q-12 逐项答复；确认后方可进入 Phase 1。

---

## 2026-11-08 21:3x（Asia/Shanghai）— 架构自检与文档一致性修正

- 新增 `docs/ARCHITECTURE-REVIEW.md`：记录 20 项技术冲突/风险、14 项功能补充、9 项依赖修正、跨文档一致性核验与 5 个编码前原型。
- 自检中修正：
  - 删除 payload 内 `styleRefs / motionRefs / feedbackRefs / relatedIds`，统一以 `case_relations` 作为跨案例引用唯一真相。
  - `cases` 表补充 `discovery_task_id` 外键与索引。
  - 设置键对齐：补充 `ai.baseUrl / ai.timeoutMs / ai.maxConcurrent / ai.maxOutputTokens`。
  - `SearchProvider.getPageContent` 明确必须经 `security/url_guard` 与共享抓取器，禁止绕过 SSRF 校验。
  - Phase 5 网页分析改为先实现最小安全抓取/提取，Phase 6 复用增强，消除反向阶段依赖。
  - 双快照改为「双实例实时渲染优先，静态快照降级且标注」，消除对无头渲染的隐式依赖。
  - 宪法 §5.3 补充允许派生结构性 Token 的边界。
  - 新增待确认项 Q-11（Theme 独立成域）、Q-12（视频抽帧是否引入 ffmpeg）。
- 未执行：任何代码、依赖、构建与运行验证。
- 结论：文档无未解决的自相矛盾；预览协议与双实例渲染两项需在 Phase 3 前做原型。

---

## 2026-11-08 22:xx（Asia/Shanghai）— 用户定案同步与许可落地

### 本轮收到的已定事项

- 命名：正式产品名 **界序 INTERFACE**；`UI Motion Lab` 降为内部代号。
- 范围：七个 Phase 全做，顺序不变；AI 从 Phase 5 接入，Phase 6 自动发现。
- 许可：MIT，不办理软件著作权登记；示例素材全部自绘；依赖许可白名单；字体/图标约束；用户导入素材只存本地不分发。
- 技术：采纳素材内容寻址、AI 落库 Rust 侧硬校验、数据库 rusqlite。
- 交互：左栏导航栈推入（≤2 层、240ms、三路返回）；卡片悬停 140ms 自动预览、全局唯一共享层。
- 产品：中文优先界面与集中词条表；三层中文搜索（trigram + 分词 + 拼音）；AI 采用 BYOK 与无 Key 降级。

### 本轮动作

| 文件 | 动作 |
|---|---|
| `LICENSE` | 新增 MIT 原文（年份 2026，署名「界序 INTERFACE contributors」） |
| `docs/素材来源与许可.md` | 新增：登记口径、内置素材、字体、图标、依赖许可表、GSAP 冲突、用户导入规则 |
| `PROJECT_CONSTITUTION.md` | 新增 §15 许可与合规；补充导航栈/悬停预览/中文优先/BYOK/依赖白名单；§6.2 改内容寻址；§7 改 Rust 硬门禁 |
| `DECISIONS.md` | 新增 D-019～D-026；D-011 改为已采纳 rusqlite；D-014 命名已定；D-017 补反方证据 |
| `docs/H-UI-DESIGN.md` | 新增 §3.4 导航栈、§5.3 悬停预览；更新条带与左栏关系、动效时长、验收要点 |
| `docs/B-ARCHITECTURE.md` | 新增 §6.6 中文搜索、§6.7 界面语言、§15 许可；更新数据目录与预览安全研究结论 |
| `docs/A-PRD.md` / `F-PROVIDERS.md` | 搜索需求细化；BYOK 与密钥表述红线；Rust 硬校验 |
| `docs/D-ER-DESIGN.md` / `E-DATA-MODEL.md` | `assets` 改为内容寻址对象库，新增 `case_assets` 关联 |
| `docs/I-PHASES.md` / `J-ACCEPTANCE.md` | 新增导航栈、悬停层、中文搜索、BYOK、许可等任务与验收 |
| `README.md` | 标题改「界序 INTERFACE」；新增开源声明；待确认清单更新 |
| `PROJECT_OVERVIEW.md` / `TASKS.md` / `CHANGELOG.md` | 命名、技术状态、Q-01/Q-05 关闭，新增 Q-13～Q-16 |

### 环境事实（重要）

- 工作区已出现并行会话产物：`package.json`、`package-lock.json`、`node_modules/`、`index.html`、`vite.config.ts`、`tsconfig.json`、`eslint.config.js`、`src/`、`src-tauri/`、`.screenshots/`。
- 另有并行研究文档：`docs/技术栈方案.md`、`docs/知识域分类提案.md`、`docs/总清单.md`，以及 `.agent/logs/2026-11-08*.md`。
- 本会话未修改上述工程文件；它们与本阶段「只写文档、不初始化工程」边界冲突，保留/暂停/回滚待用户裁决（Q-13）。
- `docs/知识域分类提案.md` 主张 Theme 不独立、扩展为 7 域，与本轮用户结构与 D-017 推荐独立存在分歧，已记录在 D-017，保留 Q-11 待裁。
- `docs/技术栈方案.md` 建议 rusqlite、Tauri 自定义协议判 local、CSP 需响应头等结论，已吸收进 B/DECISIONS；其「Zod 硬门禁」与宪法冲突已按 Rust 硬校验修正。

### 未执行

- 未安装依赖、未初始化工程、未构建、未运行、未修改任何 `src/` 或 `src-tauri/` 业务代码。
- 未接入构建期许可检查（属 Phase 1）。

---

## 2026-11-08 23:xx（Asia/Shanghai）— 产品决策与发布制度落地

### 本轮收到的已定事项

- 搜索双作用域：本地默认 + `Ctrl+Enter` 联网；网络候选独立区域、不得混入本地列表、禁止自动联网；无 Key 降级为粘贴网址。
- 安装包不含知识库内容，仅框架与自绘示例；库由联网采集、用户导入与 AI 候选逐步填充。
- 数据规模按万级结构设计：虚拟滚动、分页、缩略图多档、索引先行；向量检索只留接口。
- 强制审核，无免审开关；所有外部来源只能进候选池。
- 导出双格式：Markdown + JSON，一次操作，文件名带版本与日期。
- GitHub 仓库名 `Interface`（public，撞名则 `jiexu-Interface`），默认分支 `main`，需 `.gitignore`。
- 发布制度：`docs/release-notes/` + 模板；`v1.0.0` 定位为初始框架预览版；GitHub 发布任务阻塞待授权。

### 本轮动作

| 文件 | 动作 |
|---|---|
| `README.md` | 重写为可发布首页：首行版本定位、功能清单（已交付/脚手架/规划中）、安装与首用引导、仓库信息、许可与素材合规、开源致谢 |
| `docs/release-notes/template.md` | 新增发版说明模板（版本、日期、Added/Changed/Fixed/Known Issues/校验和） |
| `docs/release-notes/v1.0.0.md` | 新增初始框架预览版草稿（明确标注未构建、未发布） |
| `.gitignore` | 新增，排除 `target/`、`node_modules/`、`.agent/temp`、本地数据库与素材目录 |
| `docs/A-PRD.md` | 新增双作用域搜索、万级结构、安装包无内容、强制审核、双格式导出；新增 §3.3 库内容来源与合规边界 |
| `docs/B-ARCHITECTURE.md` | 新增 `search_local`/`search_network`/`candidates_*`/`url_fetch_preview`/`export_case`；性能预算改为万级；离线矩阵改 BYOK 口径 |
| `docs/D-ER-DESIGN.md` | 新增 `candidates` 候选池表；删除 `discovery.requireApproval`；新增 ER 关系 |
| `docs/E-DATA-MODEL.md` | 新增 `SearchScope`、`Candidate`、`CandidateListItem` |
| `docs/F-PROVIDERS.md` | 新增输出去向与强制审核 |
| `docs/G-AI-PIPELINE.md` | S0/S1/S10/S11 增加候选池与强制审核；明确禁止自动联网 |
| `docs/H-UI-DESIGN.md` | 新增 §5.1.1 双作用域搜索、§9.1 设置页结构；列表增万级虚拟滚动与导出入口；空库说明安装包无内容 |
| `docs/I-PHASES.md` | Phase 2 增万级结构/双格式导出/候选池审核；Phase 5 强制审核；Phase 7 安装包无内容与发版说明 |
| `docs/J-ACCEPTANCE.md` | 新增双作用域搜索、大数据量与审核、发布与仓库验收 |
| `TASKS.md` | 新增双作用域搜索与候选池、GitHub 发布阻塞任务、v1.0.0 构建任务 |
| `DECISIONS.md` | 新增 D-027～D-030 |
| `CHANGELOG.md` | 0.1.2 |

### 阻塞与提醒

- **v1.0.0 安装包当前无法产出**：Phase 1 尚未完成，且工作区并行脚手架未经评审；README 与 Release 均标注「待构建 / 待发布」，未虚构可下载链接。
- GitHub 建仓/推送/Release 全部**阻塞待授权**，未执行任何远程操作。
- `docs/release-notes/v1.0.0.md` 的校验和为空，按制度不得发布。

---

## 2026-11-08（Asia/Shanghai）— 收尾核对与并行材料登记

### 核对结果

- 治理七件套、A–J 十份文档、`LICENSE`、`docs/素材来源与许可.md`、`docs/release-notes/`（模板 + v1.0.0 草稿）、`.gitignore` 全部存在。
- 参考图已归档到 `artifacts/reference/深色动效设计灵感库.png`；工作区根目录另有一份同名副本（非本会话创建，未删除）。
- 跨文档一致性抽查：默认主题、`activeType`、`componentLayer`、三层中文搜索、BYOK、强制审核均无「深色为默认」或「可关闭审核」残留。

### 新发现的并行材料

| 文件 | 说明 | 处置 |
|---|---|---|
| `docs/补充清单_结构文案与适配.md` | 并行会话产出；为「布局与结构 / 内容与文案 / 可及性与适配」3 个新域补齐 47 条条目，支持 7 域模型 | 只登记，不改写；作为 Q-02 反方证据 |
| `scripts/check-licenses.mjs`、`dist/` | 并行工程产物 | 只登记，未执行/未修改 |

### 本轮文档动作

- `docs/C-STRUCTURE.md`：补登 `补充清单_结构文案与适配.md` 与 `scripts/check-licenses.mjs`；删除重复的 `.gitignore` 行。
- `TASKS.md`：环境事实补全并行产物清单；Q-02 补记 7 域反方证据。
- `DECISIONS.md`：D-017 补记第二份研究材料同样倾向主题不独立。
- 本轮未写业务代码、未初始化工程、未执行任何远程操作。

---

## 2026-11-10（Asia/Shanghai）— 1.0.16 内置内容包升级收尾，按用户要求暂停

> 说明：1.0.0–1.0.15 的发版过程当时记录在 CHANGELOG 与 GitHub Release，本文件没有逐版补登；本条目只如实记录 1.0.16 这一批，以及停在哪里。

### 背景

1.0.15 上了参数证据链，但内置内容包「装过就跳过」，已装用户升级软件后参数级 `verified` 仍为 0——9 行官方原文只写在内容源里，进不了已有数据库。本批只修这条落地缺口，并修正 M3 缓动的版本表述，不新增功能。

### 完成的改动

| 文件 | 动作 | 内容 |
|---|---|---|
| `src-tauri/src/content_pkg.rs` | 修改 | `import_builtin_if_needed` 先验签读 manifest，比对已装版本与随包版本；仅随包更高时走 `import_package` 合并。新增「用户手动卸载过」标记（设置项 `content.uninstalledBuiltin`），卸载内置包时在事务内写入，之后不再装回；手动重新导入会清除标记。升级后写 `content.builtinUpgrade` 记录（version / fromVersion / added / updated / kept / at） |
| `src-tauri/src/lib.rs` | 修改 | 启动同步日志带出版本与新增 / 更新 / 保留计数 |
| `content/v1/items.json` | 修改 | 包版本 1.1.0 → 1.1.1；`style.material3.easing` 的 `specRef.version` 改为「Pre-Expressive 旧 token（Expressive 起改用 spring；官方已标注 no longer maintained）」，数值不变 |
| `src/features/settings/ContentPackagesSection.tsx` | 修改 | 已安装列表新增静默升级记录行；来源标出「内置」 |
| `src/lib/constants.ts`、`src/styles/settings.css` | 修改 | 新增设置项键与记录行样式 |
| `scripts/ui-shot/spec-ref-check.mjs` | 修改 | 断言改为新口径，并新增一条「版本写明 Pre-Expressive 且已停维护」，现 20 项 |
| `CHANGELOG.md`、`README.md`、`docs/release-notes/v1.0.16.md` | 修改/新增 | 版本、下载、校验和与发版说明 |

### 验证结果（真实库，非夹具）

- 启动前真实库：83 条（78 内置 + 5 用户），内置包 1.0.0，参数级 `verified` 为 0。
- 启动 1.0.16 后：内置包静默合并到 1.1.1（更新 78），库中 9 个参数级 `verified`：`style.material3.easing` + 8 个组件 `hitTarget`；逐条核对 `specRef` 五字段（platform/version/component/url/quote）均非空。
- 界面：点开缓动来源，弹层显示平台版本、组件、原文引句与「打开官方文档」；截图存于 `.screenshots/1.0.16-spec-popover.png`（该目录不入库）。
- 设置 → 内容包：已安装列表显示「随软件更新到 v1.1.1（新增 0、更新 78、保留 0）」。
- 二次启动：`installed_at` / `updated_at` 与升级记录时间戳均未变化，确认同版本不重复写入。
- Rust 单测 78 项通过，含新写的三组：同版本跳过与高版本合并、用户改动/删除保留、卸载后不装回；格式 1、格式 2 老包导入单测保留。
- 无头回归 `spec-ref-check.mjs` 20/20；静态门 `tsc --noEmit`、`eslint .`、`vite build`、许可证白名单通过。

### 提交与发布

- 提交 `f292f96`，tag `v1.0.16`，已推送 `origin/main`。
- Release：https://github.com/Murphmau5/Interface/releases/tag/v1.0.16 （**已于 2026-11-10 清理，链接失效；见下方「GitHub 清理与发布口径落定」**）
- 附件 `INTERFACE_1.0.16_x64-setup.exe`：8,153,871 字节，SHA-256 `99c976e1f80165234fdb99e4baa650a210e9b25be40c78645edfeacf59529e13`；从 Release 重新下载后核对，与本地一致。

### 当前停在哪个位置

- 1.0.16 已发版（发版提交 `f292f96`）；本条目随后单独提交，除此之外工作区没有进行到一半的代码改动。
- 真实库停留在升级后的状态（内置包 1.1.1、9 个参数级 `verified`）；改库前的备份在 `.agent/temp/pre-1016/`。

### 下次从哪里接

1. **继续内容治理**：26 行查不到官方原文的参数仍是 `estimated`，可按 `specRef` 规则二轮取证；取证到位的只升参数级，条目级仍保持 `estimated`。
2. **补平台验证**：真窗口交互（标题栏拖动、双击最大化 / 还原、边缘吸附）、原生拖拽图片导入、安装器单屏交互都未复测；仍然只验证了 Windows x64。
3. **可选补证**：真实库这次是 1.0.0 → 1.1.1（更新 78 条），没有在 1.0.15 的 1.1.0 包上重放「只更新 1 条」的升级样本；该分支由单测覆盖，未做真库重放。

### 已知问题与限制

- 用户改过 / 删过的条目在内置升级时按设计保留，不会被新内容覆盖或复活；需要新值时只能手动恢复该条目或重新导入内容包。
- 条目级置信度整体仍是 `estimated`；参数级有出处不等于整条被官方背书。
- 升级记录是追加式的一条，后续再升级会覆盖为最新一次，不保留历史。
- `PROJECT_LOG.md` 此前缺 1.0.0–1.0.15 的逐版记录，本次未回补。

---

## 2026-11-10（后续）— GitHub 清理与发布口径落定

### 任务

删除 GitHub 仓库 v1.0.1–v1.0.16 的全部 Release（含附件）与同名 tag，只保留 v1.0.0；把「测试版 1.0.x 不自动上传、正式版 1.1.0」的发布口径写进仓库文档。

### 执行结果

- 删除 **16 个 Release**（每个 1 个安装包附件，共 16 个附件）与 **16 个 tag**（v1.0.1–v1.0.16）。
- v1.0.0 的 Release、附件（`INTERFACE_1.0.0_x64-setup.exe`，5,932,704 字节，SHA-256 `d963bc0ea1b70bba0b017f044b0a352d162e069c76ae60c48a32f390d382a75b`）与 tag 未动。
- 远端最终状态：**Release 1 个（v1.0.0），tag 1 个（v1.0.0）**。
- 删除前的 tag → commit 对照表（含 release 标题、附件名与字节数）写在 `.agent/release-tags-backup-2026-11-10.md`；本地 tag v1.0.1–v1.0.16 全部保留，可按需重建远端。
- 更正上一条记录：其中「1.0.16 已发布 / Release 链接」已随本次清理失效，1.0.16 现在只作为本地测试版存在，不再有远端 Release。

### 文档落点

- `DECISIONS.md` 新增 **D-034**：测试版 1.0.x、正式版 1.1.0；测试构建不自动上传，只有明确说「开始上传」才发布。
- `README.md`：首屏下载、当前状态、安装方式只指 v1.0.0，并注明最新测试版在本地、未公开分发。
- `docs/release-notes/template.md`：加入测试构建 / 正式发布的头部说明。
- `docs/release-notes/v1.0.16.md`：改标为「测试构建（本地，未公开分发）」。

### 边界

- 本次未构建安装包，未改代码，未进入下一阶段。
- 未删除本地 tag；未改动 v1.0.0 的任何内容。

---

