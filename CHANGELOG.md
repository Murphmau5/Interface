# CHANGELOG.md — 版本变更记录

> 面向用户与维护者的变更摘要；详细过程见 `PROJECT_LOG.md`。

## [1.0.8] — 2026-11-09

主界面三栏仪器台化：左栏胶囊选中态与计数徽标、中栏卡片与表格统一密度与层级、右栏详情分节与参数三列读数；全部颜色与圆角走 token，深浅两套逐界面核对。

### Changed

- 左栏：胶囊选中态与设置页统一（去左侧竖条），组内计数徽标、内容域 / 工具位发丝线分组、合集胶囊、底部收藏 / 最近使用双读数瓦片、底栏 `本地库 · SQLite` + 版本号读数。
- 二级面板：返回行胶囊化，域标题带总数徽标，不可用项用弱化徽标。
- 中栏头部：eyebrow / 标题 / 总数徽标一行，描述限一行；工具栏与筛选分为两层；新建入口折叠为内联 composer。
- 中栏列表：卡片按容器宽度 1 / 2 / 3 列自适应，按行虚拟滚动；悬停保留 140ms 共享预览层；表格改 `table-fixed`，类型 / 平台 / 置信度列按中文实测放宽，横向滚动条消失。
- 右栏详情：预览与参数 / 标签 / 合集 / 素材 / 导出 / 属性 / 更多操作分节；标题就地重命名；收藏改为与铅笔同尺寸图标钮；参数按外观 / 播放 / 运动分组，行内「标签 / 控件 / 读数」三列；素材默认折叠，删除两步确认。
- 全局：新增 `--panel-highlight`、`--control-bg`、`--control-line`、`--rail-active-ring` 等语义 token；新规则只引用 token，圆角只用 `--radius-*`。
- 版本号同步至 1.0.8（`package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock`）。

### Fixed

- 详情节标题双发丝线：`::after` 与显式分隔 span 叠加。
- 表格「Android」「用户定义」被挤到相邻列。
- `Select` 的宽度 / flex 类只落在 `<select>` 而未作用到外层容器。
- 新建 composer 与「没有匹配的案例」空态同时出现。
- 详情收藏按钮尺寸与铅笔不一致。

### Added

- `scripts/ui-shot`：无头 Edge + CDP 的截图与压测通道，不弹出应用窗口。

### Known Issues

- 主界面截图使用夹具数据（14 条演示案例）在无头 Edge 下生成，未在本轮用真窗口核对真实库。
- 真窗口专属行为（标题栏拖动、最小化 / 最大化 / 关闭、原生拖拽导入）本轮未复测。
- 安装器只跑了静默安装，单屏交互页未重新点验；安装包未签名。
- 仅提供 Windows x64；macOS 未验证。

## [1.0.7] — 2026-11-09

内容包与在线更新：签名 zip + manifest、本地导入、可配置在线地址、版本合并、用户改动保护与干净卸载。

### Added

- 内容包格式：`manifest.json` + `signature.txt` + `content/...`；manifest 含格式版本、包 id / 名称 / 版本、`minAppVersion`、条目清单、逐文件 SHA-256 与增量 `removedItems`。
- Ed25519 签名校验：内置发布公钥，支持设置项 `content.trustedKeys` 追加自建公钥；签名不符整包拒绝。
- 本地导入：拖拽 `.zip` 或填写路径导入，不依赖在线服务、Key 或账号。
- 在线地址：设置项 `content.feedUrl`，支持显式 URL 安装；下载走 http/https 白名单、逐跳重定向校验与体积上限。
- 安全校验：zip 条目名拒绝 `..` / 绝对路径 / 盘符 / 反斜杠，拒绝可执行扩展名，校验条数、解压总量、单文件大小与压缩比。
- 包内 HTML 使用与素材导入相同的清洗器；原始 HTML 不入库，清洗结果嵌入 `payload.html`。
- 合并策略：按版本比较；用户改过不覆盖；用户删过不复活；仅显式 `removedItems` 移除条目；拒绝降级。
- 卸载：移除未改动条目；改过或收藏的条目保留并解除绑定；用户自建数据不受影响。
- 设置页新增「内容包」：本地导入、在线地址保存与安装、已安装列表、两步确认卸载与可读错误。
- 新增错误域 `AppError::ContentPackage`，错误码 `E_PKG_INVALID_ZIP`、`E_PKG_MANIFEST`、`E_PKG_SIGNATURE`、`E_PKG_MISSING`、`E_PKG_HASH`、`E_PKG_PATH`、`E_PKG_EXECUTABLE`、`E_PKG_TOO_LARGE`、`E_PKG_VERSION`、`E_PKG_ITEM`、`E_PKG_DOWNLOAD`。

### Changed

- 版本号同步至 1.0.7（`package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock`）。

### Known Issues

- 无真实公网内容包分发服务器；在线安装仅在本地假 HTTP 服务器上验证，未用真实 CDN 跳转演练。
- 内置签名公钥为开发签名密钥，私钥保存在本地 `.agent/keys`，未做发布级密钥管理。
- 安装包未签名，首次运行可能出现 SmartScreen 提示。
- 仅提供 Windows x64；macOS 未验证。

## [1.0.6] — 2026-11-09

联网抓取链路：单 URL 抓取入候选池、URL 守卫与逐跳重定向校验、正文提取与近似去重；搜索采集支持 Tavily / Brave / Bing / custom 四种服务。

### Added

- 单 URL 抓取：粘贴公开 http/https 网址，抓取正文写入「候选池」待审核。
- URL 守卫：只允许 http/https；拒绝带用户名密码、本机 / 内网 / 链路本地 / 保留地址与内部域名；重定向逐跳校验，最多 5 跳；单页响应上限 2 MB；只接受 `text/html`、`application/xhtml+xml`、`text/plain`。
- 正文提取：剥离 script / style / noscript / 注释 / SVG，取 title、meta description 与正文。
- 去重：同一规范化 URL 在非 rejected 候选中存在则不重复创建；内容近似（字符二元组 Jaccard ≥ 0.85 且两边文本 ≥ 120 字）也判重。
- 搜索采集：支持 Tavily / Brave / Bing / custom 四种搜索服务配置，命中后逐条抓取入候选池。
- 抓取失败逐条返回 `{ url, outcome, code, message }`，批量汇总 created / duplicates / failed，不静默吞。
- 后端新增 `AppError::Fetch`，错误码：`E_URL_INVALID`、`E_URL_SCHEME`、`E_URL_BLOCKED`、`E_URL_REDIRECT`、`E_FETCH_TIMEOUT`、`E_NETWORK`、`E_HTTP_STATUS`、`E_CONTENT_TYPE`、`E_TOO_LARGE`、`E_EMPTY_CONTENT`、`E_SEARCH_UNAVAILABLE`、`E_SEARCH_PARSE`。

### Changed

- 抓到的 HTML 一律以 `html.state = "unclean"`、`needsCleaning = true` 入库，只存 ≤ 16 KB 摘要，不执行、不渲染。
- 版本号同步至 1.0.6（`package.json` / `tauri.conf.json`；`Cargo.toml` / `Cargo.lock` 原已为 1.0.6）。

### Known Issues

- 真实第三方搜索 Provider（Tavily / Brave / Bing）与真实第三方大模型服务的端到端调用**未验证**：本地只有假 OpenAI 兼容服务器测试，无真实 Key。
- AI 工作台分析与搜索采集均需要配置 Key；未配置时只能粘贴网址抓取。
- 安装包未签名，首次运行可能出现 SmartScreen 提示。
- 仅提供 Windows x64；macOS 未验证。

## [1.0.3] — 2026-11-09

安装器升级路径修正：旧版本上双击新包即可覆盖升级，不再弹出「安装前卸载 / 请勿卸载」二选一页。

### Fixed

- 升级与同版本重装时自动静默卸载旧版本并跳过选择页，用户无需手动选择。
- 降级提示页的版本号改用真实 `DisplayVersion`，修掉「版本为 旧的 的」占位符错误。
- 旧版本程序正在运行时，交互安装给出可读确认提示；静默安装沿用强制结束进程行为。
- 卸载旧版本失败或文件仍被占用时，弹出可读提示并退出，避免半装状态。

### Changed

- 版本号同步至 1.0.3（`package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock` / 关于页与左栏兜底值）。
- 新增自定义 NSIS 模板 `src-tauri/installer.nsi`，仅改动重装页逻辑与两条中英文文案。

### Known Issues

- 降级仍会提示，且降级到旧版本后旧程序可能无法打开更高版本的数据库。
- 安装包未签名，首次运行可能出现 SmartScreen 提示。
- 仅提供 Windows x64；macOS 未验证。

## [1.0.2] — 2026-11-09

中文搜索本地优先、标签/合集落库、素材内容寻址、候选强制审核与双格式导出；列表与缓存的占用改为按字节封顶。

### Added

- 中文搜索：`LIKE` + 拼音物化列（全拼 + 首字母），默认只搜本地；1 万条实测 P95 15.5ms，未引入 FTS5。
- 搜索作用域两个：本地（默认）与联网（`Ctrl+Enter`）；未配置 Key 时联网入口降级为「粘贴网址登记候选」，不自动发请求。
- 标签与合集落库，可给案例增删标签、加入/移出合集；收藏与最近使用沉到左栏底部，作为视图而非分类。
- 筛选唯一状态：类型 / 平台 / 置信度 / 组件层，附排序与网格 / 表格双视图。
- 素材按 sha256 内容寻址导入（`objects/<前2>/<3-4>/<sha>.<ext>`），同图只存一份，引用去重；HTML 仅存储并标记未清洗，不执行。
- `candidates` 候选池与审核动作：通过、拒绝、编辑后入库；状态只允许 pending → approved/rejected，**没有免审开关**。
- 导出改为一次操作同时产出 Markdown 与 JSON，文件名带版本与日期。
- 新增 `platform` / `component_layer` 字段，组件类案例自动推导层级（atom / pattern）。

### Changed

- 列表与候选返回体改为按字节预算截断：案例 8MB、候选 4MB（累计 payload），标签/合集/素材 500 行上限（每行约 120–300B）。
- 流量计数全部来自 SQL：总数、分面、收藏/最近、合集与标签计数，前端不再写死。
- 删除无效的 `search_text` 索引：`LIKE '%kw%'` 用不到，只白占磁盘与页缓存。
- 素材导入失败逐条返回可读错误（超限、不可读、类型不支持），不再静默吞掉。

### Known Issues

- 搜索走全表 `LIKE` 扫描；数据量再上 10 倍需重测，届时再评估 FTS5 + 二元组。
- 标签目前仅作案例元数据，尚无「按标签浏览」的独立入口。
- 安装包未签名，首次运行可能出现 SmartScreen 提示。
- 仅提供 Windows x64；macOS 未验证。

## [1.0.1] — 2026-11-09

预览从固定演示改为按类型拆分的可调渲染器；类目从占位分组改为 SQLite 真实落库；打通案例闭环与导出；窗口默认改为最小可用尺寸。

### Added

- 预览按 `kind` 拆成五个独立渲染器：动效 / 反馈 / 组件 / 主题 / 风格，全部自绘，不加载外部素材。
- 动效渲染器支持时长、延迟、阶梯间隔、位移、缩放、透明度、模糊、缓动八个参数。
- 反馈渲染器按「触发 / 停留 / 消退」三段参数驱动，状态色随语气切换。
- 组件渲染器提供真实可交互控件（开关 / 按钮 / 输入框），非交互态用 WAAPI 演示。
- 主题渲染器深浅两层交叉淡入，完整周期由淡入与保持时长换算。
- 风格渲染器支持平面 / 新拟态 / 玻璃三种处理，圆角与深度即时生效。
- `categories` 表落库 36 条类目（风格 8 / 动效 6 / 反馈 9 / 组件 8 / 主题 5），左栏计数由 SQL 实时统计。
- 左栏二级面板接入真实数据，含加载态、空态、失败重试与「域 › 类目」面包屑。
- 案例闭环导出 Markdown：元信息表 + 参数表 + 提示词 + 预览代码块。

### Changed

- 参数面板与预览双向实时绑定，移除「应用」按钮，改值即重播。
- 保存改为 600ms 防抖自动写入，卸载时补写未落库改动，并显示保存状态与时间。
- `Esc` 语义改为「先清类目，再返回域」，三路返回与 240ms 栏宽位移保持一致。
- 窗口默认尺寸改为最小可用尺寸：`width/minWidth = 1000`、`height/minHeight = 680`（逻辑像素），由左栏 228 + 分隔条 8 + 中栏 384 + 分隔条 8 + 详情最小 360 计算，向上取整留 12px 余量。
- 构建管线改为隐藏窗口执行 + 日志判定，不再弹控制台窗口。

### Performance

- 列表改为固定行高虚拟滚动，405 条时仅渲染十余节点。
- 缩略图缓存改为 200MB 字节预算 LRU，不再按张数限制。
- 切换 100 次案例无持有型泄漏：DOM 节点恒为 394、动画对象恒为 10、`.preview-stage` 恒为 1。

### Known Issues

- FCP 由 260ms 升至 328ms（+68ms），来自新增渲染器与参数面板。
- 安装包未签名，首次运行可能出现 SmartScreen 提示。
- 导出仅显示路径文本，暂无「打开所在文件夹」。
- 悬停微预览容器随滚动销毁，但动画仍在运行。

## [1.0.0] — 2026-11-08

首个可安装骨架版本（Phase 1）。本版本只交付应用外壳与数据通路，不含 AI / 采集 / 审核等业务功能。

### Added

- Tauri 2 + React 19 + TypeScript + Vite 工程骨架，Windows 10/11 x64，产品名统一为「界序 INTERFACE」（`com.jiexu.interface`）。
- 三栏主界面：左栏导航栈、中栏列表、右栏详情；左栏与中栏宽度可拖动，并持久化到 SQLite。
- 左栏导航栈：一级域向内推入二级面板，位移等于栏宽、240ms、`cubic-bezier(0.32, 0.72, 0, 1)`，仅使用 transform / opacity；支持「‹ 返回」、`Esc`、`Alt+←`；栈深上限 2 层；返回还原滚动位置与已选类目。
- 一级域：风格 / 动效 / 反馈与状态 / 组件 / 主题；工具位：AI 工作台 / AI 发现 / 设置；收藏与最近使用固定在左栏底部。
- SQLite（SQLx + 内嵌迁移）：启动时在应用数据目录自动建库，`settings` 表与 `cases` 表最小 schema，WAL 模式。
- 主题系统：默认跟随系统，支持「跟随系统 / 深色 / 浅色」三态并持久化；系统明暗变化实时跟随。
- 两层 Design Token：语义层定义一次，深/浅主题各提供一套值；组件只引用语义层。
- 基础 UI 组件：Button / Input / Card / Select / Switch / Tooltip / EmptyState / LoadingState / SegmentedControl，全部有真实行为；未实现项禁用并在界面与悬停提示中说明原因。
- 卡片悬停预览：默认显示首帧，悬停 140ms 后自动播放，移出立即复位；全局唯一共享预览层，列表滚动即销毁；Tab 聚焦同样触发；遵循 `prefers-reduced-motion`（只播一次、不循环）；主题类条目播放深浅交叉淡入。
- 右栏完整预览与悬停微预览共用同一播放内核（`PreviewStage`），右栏支持播放 / 停止 / 重播 / 循环。
- 内置三条自绘示例案例（错峰入场、按压反馈、深浅交叉淡入），全部手写 HTML/CSS，无外部截图、插画或录屏。
- 设置页：主题三态、减少动效、面板宽度恢复、数据库路径与案例数、settings 写入并读回（重启后仍在）、开源许可清单。
- 合规底座：根目录 MIT `LICENSE`、`THIRD_PARTY_NOTICES.md`、`npm run check:licenses`（前端 + Rust 依赖许可检查，白名单 MIT / Apache-2.0 / BSD-2-Clause / BSD-3-Clause / ISC / OFL，禁止 GPL / AGPL / LGPL / SSPL）。
- 自绘应用图标与 NSIS 安装包配置。

### Known Issues

- 类目为占位分组名，条目数固定为 0：`cases` 表尚无类目字段，类目筛选待 Phase 2 接入。
- 预览仅支持三种内置自绘场景；自建案例 payload 为空时不播放，也不提供假动画。
- AI 工作台 / AI 发现只做到「草稿写入并读回」，分析、检索、Provider 与密钥管理未实现，主行动按钮禁用。
- 搜索、标签、关联、审核、导入导出、备份 / 还原均未实现，相关入口禁用或只读。
- 右栏详情仅支持重命名、收藏、软删除；参数面板、提示词与素材引用待后续阶段。
- 无代码签名，Windows 首次运行可能出现 SmartScreen 提示。
- 安装包使用 GNU 目标构建（本机无 MSVC 链接器），未做 MSVC 版本回归。

## [0.1.2] — 2026-11-08

### Added

- 可发布的 GitHub 首页 `README.md`：首行「v1.0.0 · 初始框架预览版」，含功能清单、安装、首用引导、仓库信息、合规声明与开源致谢。
- `docs/release-notes/template.md` 与 `docs/release-notes/v1.0.0.md`（草稿，待构建/待发布）。
- `.gitignore`：排除 `target/`、`node_modules/`、`.agent/temp`、本地数据库与素材目录。
- 双作用域搜索：默认本地、`Ctrl+Enter` 联网、禁止自动联网、无 Key 降级为粘贴网址。
- `candidates` 候选池表（与正式库物理分表）与强制审核流程。
- 万级数据结构：虚拟滚动、分页 40、缩略图 128/256/512 多档预生成。
- 导出双格式：Markdown + JSON，一次操作，文件名带版本与日期。
- `docs/素材来源与许可.md` 与 `LICENSE`（MIT）。
- TASKS 新增 GitHub 发布阻塞任务与 v1.0.0 构建任务。

### Changed

- 安装包口径：不含知识库内容，仅框架与自绘示例；库由联网采集、用户导入与 AI 候选填充。
- 性能预算改为 1 万条库口径。
- `discovery.requireApproval` 设置项删除，审核强制开启。
- 离线矩阵改为 BYOK 口径：AI 未配置时入口可见并引导，不禁用整块功能。

### Fixed

- 修正「定时任务可关闭审核」与用户强制审核要求的冲突。
- 修正「AI 未配置按钮禁用」与 BYOK 可见性要求的冲突。

### Known Issues

- v1.0.0 安装包未构建；README 与 Release 均标注「待发布」。
- GitHub 仓库/推送/Release 阻塞，等待用户授权。
- 发版说明校验和为空，按制度不得发布。

## [0.1.1] — 2026-11-08

### Added

- `LICENSE`（MIT，年份 2026，署名「界序 INTERFACE contributors」）。
- `docs/素材来源与许可.md`：素材登记口径、字体/图标/依赖许可表、GSAP 许可冲突、用户导入规则。
- 宪法 §15「许可与合规」：MIT、不登记软著、示例自绘、依赖白名单、字体/图标、用户导入与风格名不受保护。
- DECISIONS D-019～D-026：导航栈、悬停预览、内容寻址、Rust 硬校验、rusqlite、BYOK、许可基线、GSAP 冲突。
- H §3.4 左栏导航栈推入（240ms/栏宽/三路返回/滚动还原）。
- H §5.3 卡片悬停自动预览（140ms/全局唯一共享层/滚动销毁/Tab 等效）。
- B §6.6 中文优先三层搜索；§6.7 界面语言与集中词条表。
- B §15 许可与合规；B 预览安全章节补充 Tauri 自定义协议判 local、CSP 响应头、opaque origin 等研究结论。
- 数据模型：`assets` 改为内容寻址对象库，新增 `case_assets` 关联表。
- TASKS 专项任务：中文搜索、BYOK、悬停层、导航栈、词条表、许可检查、素材登记。
- Q-13～Q-16（并行工程产物处置、分词/拼音选型、WebView2 分发、签名与更新）。

### Changed

- 产品名统一为 **界序 INTERFACE**；`UI Motion Lab` 降为内部代号，不再出现在用户可见文案。
- 七个 Phase 全部保留，不缩减；AI 从 Phase 5 接入，Phase 6 自动发现。
- 数据库由 SQLx 改为 **rusqlite + bundled + 自写迁移器**。
- AI 落库校验由「Zod」改为「Rust 硬门禁 + Zod 第二道」。
- 预览运行时默认使用 CSS / WAAPI，GSAP 默认不打包。
- README 增加开源声明；运行状态说明改为「存在并行脚手架，未纳入基线」。

### Fixed

- 删除 payload 内重复的跨案例引用字段，统一以 `case_relations` 为唯一真相。
- 设置键、`discovery_task_id`、SearchProvider 安全约束、Phase 5/6 依赖顺序等跨文档不一致已修正。

### Removed

- 移除「产品名待定」的并列表述；移除 SQLx 作为默认选型。

### Security

- 依赖许可白名单与构建期检查（GPL/AGPL/LGPL/SSPL 阻断）。
- BYOK：不内置密钥、不代理转发；密钥表述红线（不得称「加密保护」）。
- 示例素材全部自绘，禁止第三方截图入包。

### Known Issues

- Theme 是否独立成域（Q-11）、导航结构（Q-02）、单主表（Q-03）仍待确认。
- 工作区存在并行工程脚手架，与「只写文档」边界冲突，待 Q-13 裁决。
- GSAP 许可与白名单冲突，默认不打包，待 D-026 裁决。
- Playwright、视频抽帧、WebView2 分发等待确认。
- 所有 Token 数值与阈值均为建议值，尚未在真实界面上验证。

## [0.1.0] — 2026-11-08

### Added

- 项目治理基线：`PROJECT_CONSTITUTION.md`、`PROJECT_OVERVIEW.md`、`TASKS.md`、`DECISIONS.md`、`PROJECT_LOG.md`、`README.md`。
- 启动前设计文档 A–J：PRD、技术架构、目录结构、ER 设计、TypeScript 数据模型、Provider 架构、AI 采集流程、UI 方案、七阶段拆分、阶段验收。
- 架构自检报告 `docs/ARCHITECTURE-REVIEW.md`。
- 目录骨架：`.agent/logs`、`.agent/temp`、`.agent/reports`、`docs/`、`artifacts/`。
- 视觉参考图归档至 `artifacts/reference/`。

### Changed

- 默认主题定为「跟随系统」（非深色），仅用户手动切换后记忆选择。
- 导航由 10 项平铺调整为 4 内容域 + 3 工具位（待确认）。
- 数据模型建议单主表 + kind + 类型化 payload（待确认）。
- 组件域明确 atoms / patterns 两层。
- 跨域去重规则：一案例一主域，其余通过 `case_relations` 关联引用。
- 增加底部类型条带（与左栏共用 `activeType`）与表格清单视图。
- 增加 Theme 独立成域评估（推荐独立，待确认）。
- 增加 AI 采集/分析流程、Provider 架构与架构自检报告。

### Fixed

- 无（本版本无代码）。

### Removed

- 无。

### Security

- 确立凭据存储、预览沙箱、SSRF 防护、版权与访问控制基线（仅文档约束）。

### Known Issues

- 产品名/工作区名分工未定。
- 主题是否独立成域、底部类型条带方案待确认。
- Playwright 采集方案、SQLx 选型、状态色扩展等待确认。
- 所有 Token 数值与阈值均为建议值，尚未在真实界面上验证。
