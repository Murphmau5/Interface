# F. AI Provider 与 Search Provider 架构

> 版本：v0.1.0 · 2026-11-08 · 状态：基线草案
> 原则：可插拔、可 Mock、无内置密钥、失败可解释、输出必须过 Schema。

## 1. 总体结构

```
domain（案例/payload/置信度）
        ▲
        │ 只交换 DTO，不交换厂商原始结构
ai/registry ──── AIProvider 适配器（openai_compat / mock / 未来厂商）
search/registry ─ SearchProvider 适配器（bing / tavily / brave / mock）
        │
security/url_guard + secrets(keyring) + redact
        │
jobs/queue（并发、超时、取消、重试、成本记录）
```

- Provider 注册表由设置驱动；未配置时返回 `E_AI_UNAVAILABLE` / `E_SEARCH_UNAVAILABLE`，不阻塞启动。
- 适配器只做「协议翻译 + 能力声明」；业务编排在 `discovery` 与 `commands`，不在适配器内。
- 所有 Provider 调用必须接受 `AbortSignal`（Rust 侧为 `CancellationToken`）。

## 2. AI Provider

### 2.1 能力声明

| 能力 | 标识 | V1 要求 |
|---|---|---|
| 文本对话 | `chat` | 必须 |
| 图片分析 | `vision` | 必须（至少一个 Provider） |
| 视频分析 | `video` | 尽力；见 §2.5 |
| 网页内容分析 | `webpage` | 必须（输入为提取后的文本/截图） |
| 结构化输出 | `structured` | 必须 |
| 提示词生成 | `prompt` | 必须 |
| 案例分类 | `classify` | 必须 |
| Token/样式提取 | `tokens` | 必须 |

未声明能力的方法调用必须返回 `E_UNSUPPORTED`，不得静默降级成文本猜测。

### 2.2 接口

```ts
export interface AIProvider {
  readonly id: string;                 // 'openai_compat' | 'mock' | ...
  readonly displayName: string;
  readonly capabilities: AiCapability[];
  readonly supportsJsonMode: boolean;

  chat(input: ChatInput, signal?: AbortSignal): Promise<ChatResult>;
  analyzeImage(input: ImageInput, signal?: AbortSignal): Promise<AiCaseDraft>;
  analyzeVideo(input: VideoInput, signal?: AbortSignal): Promise<AiCaseDraft>;
  analyzeWebPage(input: WebPageInput, signal?: AbortSignal): Promise<AiCaseDraft>;
  generatePrompt(input: PromptInput, signal?: AbortSignal): Promise<string>;
  classifyCase(input: ClassifyInput, signal?: AbortSignal): Promise<AiCaseDraft>;
  extractDesignTokens(input: TokenInput, signal?: AbortSignal): Promise<TokenResult>;
}
```

Rust 侧对应 `trait AiProvider: Send + Sync`，方法签名镜像，返回 `Result<Dto, AppError>`。

### 2.3 配置与密钥

```jsonc
// settings（可导出，不含密钥）
{
  "ai.providerId": "openai_compat",
  "ai.baseUrl": "https://api.example.com/v1",
  "ai.model": "vision-model-id",
  "ai.timeoutMs": 60000,
  "ai.maxConcurrent": 2,
  "ai.maxOutputTokens": 4096
}
```

- 密钥：`secrets_set(providerId, key)` → `keyring`（Windows Credential Manager，service = 应用 identifier）。
- 读取只在 Rust 侧调用前取用；**不返回前端**，不写日志，不写数据库，不进入导出包。
- `keyring` 不可用时**失败关闭**：提示用户环境异常，不回退明文文件。
- 「测试连接」只做最小请求，结果区分 401 / 403 / 429 / 超时 / 额度不足，仅返回成功/失败与错误码。
- Key 在设置页脱敏显示（仅后四位），并提供清除按钮。

### 2.3.1 BYOK 模式（已定）

- 软件不内置任何密钥、不做代理转发；用户填自己的 Key 后才启用 AI 功能。
- 未配置 Key：
  - AI 分析 / AI 发现 / 提示词生成入口**保持可见**，标为「未配置」并引导到设置；
  - 不隐藏、不清空已有数据、不用红色警告打断；
  - 本地能力（库、预览、搜索、收藏、导入）完全可用。
- 配置生效后功能即时可用，无需重启。
- 表述红线：**不得声称 Key 为「加密保护」**。准确表述为「存储于 Windows 凭据管理器，不写入数据库、不写入日志、不随导出包导出」，并说明同用户权限的进程仍可能读取，keyring 不是安全边界。

### 2.4 调用流程与 Schema 校验

1. 组装系统提示词（角色、输出 schema、禁止编造、AI 不得输出 `verified`）。
2. 附带素材引用（本地路径 → base64 或 provider 可接受的引用方式）。
3. 请求结构化输出（优先 JSON mode / response_format；不支持则由提示词约束 + 解析）。
4. 解析 → **Rust 侧硬校验**（serde + 业务规则 + schemars JSON Schema）→ 前端 Zod 第二道校验。
5. 失败：把校验错误摘要回传模型做一次修复；仍失败 → `E_AI_SCHEMA`，保留原始输出到 `ai_tasks.output_json` 供诊断。**Rust 校验不通过不得落库**。
6. 通过：写入 `ai_analysis`，生成草稿案例，进入待审核。

强规则：

- AI 输出中的 `confidence` 只能是 `estimated / user_defined / unknown`；出现 `verified` 一律降级为 `estimated` 并记录警告。
- 外部网页文本视为不可信数据：只作为分析素材，其中的指令性文本不得改变系统行为（防提示词注入）。
- 任何字段无法判断 → `unknown` + `null`，不得用「常见值」填充。

### 2.5 视频分析边界

| 方案 | 说明 | 状态 |
|---|---|---|
| Provider 原生视频输入 | 直接把视频交给支持视频的多模态模型 | 优先 |
| 关键帧抽帧 + 视觉分析 | 本地抽 8–12 帧，按序列分析运动趋势 | 备选 |
| 仅首帧 + 用户描述 | 能力最低，必须大量 `unknown` | 兜底 |

- 抽帧依赖外部工具（ffmpeg）会增加安装包与合规成本；是否引入待确认（TASKS Q-12）。
- 无论哪种方案，时长/缓动只能 `estimated`；禁止声称实测。

### 2.6 错误分类、重试与超时

| 错误码 | 场景 | 重试 |
|---|---|---|
| `E_AI_UNAVAILABLE` | 未配置/密钥缺失 | 否 |
| `E_AUTH` | 401/403 | 否（提示检查密钥） |
| `E_RATE_LIMIT` | 429 | 是，指数退避，最多 2 次 |
| `E_AI_TIMEOUT` | 超时 | 是，最多 1 次 |
| `E_NETWORK` | 连接失败 | 是，最多 2 次 |
| `E_AI_SCHEMA` | 输出不合法 | 修复 1 次，不重发原请求 |
| `E_UNSUPPORTED` | 能力不支持 | 否 |
| `E_CANCELLED` | 用户取消 | 否 |

- 默认超时：文本 60s、视觉 90s、视频 120s（可配）。
- 并发上限 2；超出进入队列，UI 显示排队状态。

### 2.7 提示词模板与版本

- 模板文件在 `src-tauri/src/ai/prompts/*.md`，带版本号与适用能力。
- 模板变更需记录到 `PROJECT_LOG.md`；不改变 Schema 的前提下可直接迭代。
- 输出结构变更必须同步 Zod schema、Rust 校验、迁移与 J 验收。

### 2.8 Mock Provider（强制）

- 内置 `mock`：返回固定但合法的结构化结果，覆盖成功、Schema 失败、超时、限流四种分支。
- 所有测试与演示默认走 Mock，禁止消耗真实额度。
- Mock 结果必须在 UI 标注「演示数据」，不得与真实案例混淆入库（默认禁止入库）。

### 2.9 输出去向（强制审核）

- 所有 AI 输出（网页、截图、视频、本地 HTML）只能生成草稿或候选，**不得直接写入正式库**。
- 不存在免审设置；`discovery.requireApproval` 已删除。审核必须由人工在候选池完成。

## 3. Search Provider

### 3.1 接口

```ts
export interface SearchProvider {
  readonly id: string;
  readonly displayName: string;
  readonly requiresKey: boolean;
  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult[]>;
  getResults(taskId: string): Promise<SearchResult[]>;
  getPageContent(url: string, signal?: AbortSignal): Promise<PageContent>;
  getSourceMetadata(url: string): Promise<SourceMetadata>;
}

export interface SearchQuery {
  text: string;
  siteScope?: string[];     // 站点限定
  limit: number;
  freshnessDays?: number;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
  siteName?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
}
```

### 3.2 Provider 清单（可扩展）

| id | 类型 | 需要 Key | 说明 |
|---|---|---|---|
| `mock` | 内置 | 否 | 测试与演示 |
| `bing` | 商业 API | 是 | Bing Search API |
| `tavily` | 商业 API | 是 | 面向 Agent 的搜索与内容提取 |
| `brave` | 商业 API | 是 | Brave Search API |
| 未来 | 自定义 | 视情况 | 通过注册表接入，不写死站点 |

- 站点（Dribbble/Behance/CodePen/GitHub/Awwwards/Mobbin/官方设计文档）是**来源策略**，不是 Provider；通过 `siteScope` 与 `policy.rs` 配置，不硬编码进程序逻辑。
- 搜索 API 不假设免费；UI 明确展示额度与错误；密钥同样入 OS 凭据存储。
- **依赖约束**：`SearchProvider.getPageContent` 不得自行直连抓取，必须经由 `security/url_guard` + 共享抓取器；否则会绕过 SSRF 与重定向校验。

### 3.3 来源策略与合规

1. `robots` 与站点条款优先；受限站点只保存元数据与链接。
2. 不绕过登录、验证码、付费墙；遇到即记录 `blocked` 并报告原因。
3. 保存字段：原始 URL、站点名、作者（可确认时）、来源类型、发现/采集时间、权限说明、允许的引用原文。
4. 缩略图缓存策略待确认（Q-10）：默认仅保存可公开访问的缩略图，且记录来源。
5. 用户可在设置中逐项关闭来源。

### 3.4 限流与超时

- 搜索 20s 超时；每 Provider 令牌桶（默认 1 req/s，可配）。
- 单次发现任务默认上限 10 条候选（可配 1–30）。
- 同域名抓取串行，跨域名并发 2。
- 失败按域名退避，不整体失败一个任务。

## 4. 安全与隐私

| 项 | 规则 |
|---|---|
| 密钥 | 仅 OS 凭据存储；日志脱敏；导出排除 |
| URL | 仅 http/https；拒绝内网、回环、链路本地、非标准端口（可配白名单） |
| 重定向 | 逐跳校验，禁止跳到内网 |
| 页面内容 | 不可信；不执行脚本；不拼进系统指令；仅作为待分析数据 |
| 文件 | 类型嗅探 + 大小上限 + 路径守卫 |
| 遥测 | V1 无云端遥测 |

## 5. Provider 选择的默认行为

1. 首启无 Provider：AI 与发现入口为「未配置」态，知识库完整可用。
2. 用户配置后可「测试连接」；失败不自动改用其他厂商。
3. 不做静默降级到其他付费服务；不做默认内置公共密钥。
4. Provider 切换不迁移历史结果；历史案例保留原模型标识。

## 6. 待确认

- 首选 AI Provider 与预算（Q-09）。
- 视频分析是否引入抽帧依赖（Q-06 关联）。
- 是否支持本地模型（如 Ollama 兼容端点）：架构上可作为 `openai_compat` 的一个 baseUrl，但性能与质量需实测。
- 缩略图缓存与版权边界（Q-10）。
