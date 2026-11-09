/**
 * 无头截图/压测用的夹具数据。
 * 与 src/lib/ipc.ts、src/lib/preview.ts、src-tauri/migrations/0003_categories.sql 对齐。
 */

import { DatabaseSync } from "node:sqlite";

const CATEGORY_GROUPS = {
  style: [
    {
      label: "形态与质感",
      categories: [
        ["style.neu", "新拟态"],
        ["style.glass", "玻璃拟态"],
        ["style.flat", "扁平"],
        ["style.skeuo", "拟物"],
      ],
    },
    {
      label: "组织方式",
      categories: [
        ["style.minimal", "极简"],
        ["style.bento", "Bento"],
        ["style.editorial", "编辑式"],
        ["style.dark", "Dark UI"],
      ],
    },
  ],
  motion: [
    {
      label: "转场",
      categories: [
        ["motion.page", "页面转场"],
        ["motion.overlay", "浮层转场"],
        ["motion.view", "视图切换"],
      ],
    },
    {
      label: "交互",
      categories: [
        ["motion.micro", "微交互"],
        ["motion.list", "列表与卡片"],
        ["motion.scroll", "滚动联动"],
      ],
    },
  ],
  feedback: [
    {
      label: "状态反馈",
      categories: [
        ["feedback.success", "成功"],
        ["feedback.error", "错误"],
        ["feedback.warning", "警告"],
        ["feedback.info", "信息"],
      ],
    },
    {
      label: "反馈组件",
      categories: [
        ["feedback.toast", "Toast / Snackbar"],
        ["feedback.loading", "加载与骨架"],
        ["feedback.empty", "空状态与错误页"],
        ["feedback.validation", "表单校验"],
        ["feedback.press", "按压反馈"],
      ],
    },
  ],
  component: [
    {
      label: "基础控件 atoms",
      categories: [
        ["component.button", "Button"],
        ["component.input", "Input / Select"],
        ["component.switch", "Switch / Checkbox"],
        ["component.card", "Card"],
      ],
    },
    {
      label: "复合模式 patterns",
      categories: [
        ["component.nav", "导航结构"],
        ["component.command", "命令面板"],
        ["component.settings-row", "设置项行"],
        ["component.notice", "顶部胶囊通知"],
      ],
    },
  ],
  theme: [
    {
      label: "结构与映射",
      categories: [
        ["theme.tokens", "Token 两层"],
        ["theme.parity", "双主题对等"],
        ["theme.swap", "换肤策略"],
      ],
    },
    {
      label: "案例",
      categories: [
        ["theme.snapshot", "深浅对照"],
        ["theme.system", "系统跟随"],
      ],
    },
  ],
};

const EASE_PUSH = "cubic-bezier(0.32,0.72,0,1)";
const EASE_MATERIAL = "cubic-bezier(0.4,0,0.2,1)";

function payload(preview) {
  return JSON.stringify({ v: 2, preview: { v: 2, ...preview } });
}

const RAW_CASES = [
  {
    id: "c0000000-0000-4000-8000-000000000001",
    kind: "style",
    title: "新拟态镶嵌面板",
    summary: "内阴影 + 半透明描边做出下沉镶嵌感，层次靠明度差而不是投影，适合工具型面板。",
    confidence: "verified",
    isFavorite: true,
    categoryId: "style.neu",
    platform: "web",
    componentLayer: null,
    createdAt: "2025-12-02T09:10:00.000Z",
    updatedAt: "2026-11-08T10:20:00.000Z",
    preview: {
      kind: "style",
      treatment: "neumorphic",
      radiusPx: 16,
      depth: 10,
      durationMs: 320,
      easing: "ease-out",
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000002",
    kind: "motion",
    title: "错峰入场列表",
    summary: "列表行按 70ms 错峰上移淡入，位移与透明度同时收敛，滚动时不会打乱阅读节奏。",
    confidence: "verified",
    isFavorite: true,
    categoryId: "motion.list",
    platform: "web",
    componentLayer: null,
    createdAt: "2025-12-18T03:30:00.000Z",
    updatedAt: "2026-11-07T06:05:00.000Z",
    preview: {
      kind: "motion",
      scene: "stagger",
      durationMs: 900,
      delayMs: 0,
      staggerMs: 70,
      easing: EASE_PUSH,
      distance: 8,
      scale: 1,
      opacity: 0,
      blur: 0,
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000003",
    kind: "feedback",
    title: "Toast 三段节奏",
    summary: "触发 → 停留 → 消退三段拆开控制，停留段保证可读，消退段不阻塞下层交互。",
    confidence: "estimated",
    isFavorite: true,
    categoryId: "feedback.toast",
    platform: "ios",
    componentLayer: null,
    createdAt: "2026-01-09T11:00:00.000Z",
    updatedAt: "2026-11-05T14:42:00.000Z",
    preview: {
      kind: "feedback",
      scene: "toast",
      triggerMs: 0,
      holdMs: 900,
      decayMs: 440,
      easing: "cubic-bezier(0.2,0.8,0.2,1)",
      tone: "success",
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000004",
    kind: "component",
    title: "分段控件指示器",
    summary: "三段等宽，指示器只用 transform 平移，切换时容器尺寸保持稳定，不产生布局跳动。",
    confidence: "verified",
    isFavorite: false,
    categoryId: "component.button",
    platform: "desktop",
    componentLayer: "atom",
    createdAt: "2026-01-22T02:15:00.000Z",
    updatedAt: "2026-11-03T08:12:00.000Z",
    preview: {
      kind: "component",
      control: "segmented",
      durationMs: 260,
      easing: EASE_PUSH,
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000005",
    kind: "theme",
    title: "深浅交叉淡入",
    summary: "两套语义 Token 共用同一结构，切换只换值；背景与文字同步过渡，避免白色闪帧。",
    confidence: "user_defined",
    isFavorite: false,
    categoryId: "theme.snapshot",
    platform: "web",
    componentLayer: null,
    createdAt: "2026-02-04T07:45:00.000Z",
    updatedAt: "2026-10-31T12:30:00.000Z",
    preview: {
      kind: "theme",
      scene: "crossfade",
      durationMs: 1000,
      holdMs: 600,
      easing: EASE_MATERIAL,
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000006",
    kind: "style",
    title: "玻璃面板悬停层",
    summary: "半透明表面加轻度背景模糊，描边略亮于底色，悬停时只抬升表面不改变内容位置。",
    confidence: "estimated",
    isFavorite: false,
    categoryId: "style.glass",
    platform: "web",
    componentLayer: null,
    createdAt: "2026-02-19T05:20:00.000Z",
    updatedAt: "2026-10-29T09:55:00.000Z",
    preview: {
      kind: "style",
      treatment: "glass",
      radiusPx: 14,
      depth: 8,
      durationMs: 240,
      easing: "ease-out",
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000007",
    kind: "feedback",
    title: "表单校验抖动",
    summary: "描边转为错误语义色并做一次小幅 shake，行内错误文案随字段出现，不弹全局提示。",
    confidence: "verified",
    isFavorite: false,
    categoryId: "feedback.validation",
    platform: "android",
    componentLayer: null,
    createdAt: "2026-03-03T01:05:00.000Z",
    updatedAt: "2026-10-27T15:18:00.000Z",
    preview: {
      kind: "feedback",
      scene: "validation",
      triggerMs: 120,
      holdMs: 1200,
      decayMs: 480,
      easing: "cubic-bezier(0.2,0.8,0.2,1)",
      tone: "error",
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000008",
    kind: "motion",
    title: "页面推入转场",
    summary: "前层向左推出，后层同步前移并轻微缩放，形成纵深；返回时反向播放同一曲线。",
    confidence: "estimated",
    isFavorite: false,
    categoryId: "motion.page",
    platform: "ios",
    componentLayer: null,
    createdAt: "2026-03-16T08:40:00.000Z",
    updatedAt: "2026-10-24T07:22:00.000Z",
    preview: {
      kind: "motion",
      scene: "page-push",
      durationMs: 420,
      delayMs: 0,
      staggerMs: 0,
      easing: EASE_PUSH,
      distance: 12,
      scale: 1,
      opacity: 0,
      blur: 0,
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000009",
    kind: "component",
    title: "滑杆填充过渡",
    summary: "拖拽更新 0–100 的数值，填充条用 scaleX 表达，knob 只做轻微阴影变化，避免逐帧重排。",
    confidence: "user_defined",
    isFavorite: false,
    categoryId: "component.input",
    platform: "android",
    componentLayer: "atom",
    createdAt: "2026-03-28T04:10:00.000Z",
    updatedAt: "2026-10-21T03:36:00.000Z",
    preview: {
      kind: "component",
      control: "slider",
      durationMs: 180,
      easing: "ease-out",
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000010",
    kind: "theme",
    title: "跟随系统主题",
    summary: "用 prefers-color-scheme 同时渲染两个样品窗口，日 / 月指示器同步高亮，不写死当前主题。",
    confidence: "verified",
    isFavorite: false,
    categoryId: "theme.system",
    platform: "desktop",
    componentLayer: null,
    createdAt: "2026-04-07T09:30:00.000Z",
    updatedAt: "2026-10-18T11:08:00.000Z",
    preview: {
      kind: "theme",
      scene: "system",
      durationMs: 1200,
      holdMs: 800,
      easing: EASE_MATERIAL,
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000011",
    kind: "style",
    title: "便当格信息拼贴",
    summary: "四格不等尺寸的 CSS grid，间距统一，每格独立表面与圆角，适合承载异构信息。",
    confidence: "verified",
    isFavorite: false,
    categoryId: "style.bento",
    platform: "desktop",
    componentLayer: null,
    createdAt: "2026-04-21T06:00:00.000Z",
    updatedAt: "2026-10-16T05:44:00.000Z",
    preview: {
      kind: "style",
      treatment: "bento",
      radiusPx: 18,
      depth: 6,
      durationMs: 360,
      easing: "ease-out",
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000012",
    kind: "feedback",
    title: "确认对话框倒计时",
    summary: "对话框缩放淡入，底部倒计时条按停留时长 linear 缩短，取消与删除两个动作保持可见。",
    confidence: "estimated",
    isFavorite: false,
    categoryId: "feedback.toast",
    platform: "web",
    componentLayer: null,
    createdAt: "2026-05-06T10:25:00.000Z",
    updatedAt: "2026-10-15T13:02:00.000Z",
    preview: {
      kind: "feedback",
      scene: "confirm",
      triggerMs: 80,
      holdMs: 1600,
      decayMs: 520,
      easing: EASE_MATERIAL,
      tone: "warning",
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000013",
    kind: "motion",
    title: "按压微交互回弹",
    summary: "按钮按下缩到 0.96 再回位，触感反馈控制在 240ms 内，不打断连续点击。",
    confidence: "user_defined",
    isFavorite: false,
    categoryId: "motion.micro",
    platform: "android",
    componentLayer: null,
    createdAt: "2026-05-19T02:50:00.000Z",
    updatedAt: "2026-10-13T04:27:00.000Z",
    preview: {
      kind: "motion",
      scene: "micro",
      durationMs: 240,
      delayMs: 0,
      staggerMs: 0,
      easing: "cubic-bezier(0.2,0.8,0.2,1)",
      distance: 4,
      scale: 0.96,
      opacity: 1,
      blur: 0,
    },
  },
  {
    id: "c0000000-0000-4000-8000-000000000014",
    kind: "component",
    title: "徽标数字弹跳",
    summary: "数字变化时做一次 scale 弹跳，超过 99 显示 99+；命中区域保持 32px 以上。",
    confidence: "user_defined",
    isFavorite: false,
    categoryId: "component.notice",
    platform: "ios",
    componentLayer: "pattern",
    createdAt: "2026-06-01T08:15:00.000Z",
    updatedAt: "2026-10-12T09:40:00.000Z",
    preview: {
      kind: "component",
      control: "badge",
      durationMs: 200,
      easing: "ease-out",
    },
  },
];

export const CASES = RAW_CASES.map(({ preview, ...rest }) => ({
  ...rest,
  payloadJson: payload(preview),
}));

export const COLLECTIONS = [
  {
    id: "col-panels",
    name: "导航与面板",
    description: "侧栏、悬浮层与信息拼贴，关注层级与密度。",
    count: 4,
    createdAt: "2026-09-02T03:00:00.000Z",
  },
  {
    id: "col-rhythm",
    name: "节奏样本",
    description: "入场、推入与按压，正好一套完整的节奏对照。",
    count: 3,
    createdAt: "2026-09-18T06:30:00.000Z",
  },
  {
    id: "col-theme",
    name: "主题对照",
    description: "深浅切换与系统跟随，用来核对 Token 对等性。",
    count: 2,
    createdAt: "2026-10-01T09:45:00.000Z",
  },
];

export const COLLECTION_IDS = {
  "col-panels": [
    "c0000000-0000-4000-8000-000000000001",
    "c0000000-0000-4000-8000-000000000002",
    "c0000000-0000-4000-8000-000000000006",
    "c0000000-0000-4000-8000-000000000011",
  ],
  "col-rhythm": [
    "c0000000-0000-4000-8000-000000000003",
    "c0000000-0000-4000-8000-000000000008",
    "c0000000-0000-4000-8000-000000000013",
  ],
  "col-theme": [
    "c0000000-0000-4000-8000-000000000005",
    "c0000000-0000-4000-8000-000000000010",
  ],
};

export const TAGS = [
  { id: "tag-nav", label: "导航", count: 2 },
  { id: "tag-glass", label: "玻璃", count: 1 },
  { id: "tag-motion", label: "动效", count: 3 },
  { id: "tag-dark", label: "深色", count: 2 },
];

export const TAGS_BY_CASE = {
  "c0000000-0000-4000-8000-000000000001": ["深色", "导航"],
  "c0000000-0000-4000-8000-000000000002": ["动效"],
  "c0000000-0000-4000-8000-000000000003": ["动效", "深色"],
  "c0000000-0000-4000-8000-000000000006": ["玻璃", "导航"],
  "c0000000-0000-4000-8000-000000000010": ["深色"],
};

export const SETTINGS = {
  "ui.panel.leftWidth": "236",
  "ui.panel.middleWidth": "400",
  "ui.themeMode": "system",
  // 既有截图与回归都按「已看过引导」跑，避免首启遮罩挡住交互
  "ui.onboarding": "v1:done",
};

export const AI_SETTINGS = {
  provider: {
    providerId: "demo",
    baseUrl: "https://api.example.com/v1",
    model: "demo",
    authMode: "bearer",
    timeoutMs: 30000,
    maxOutputTokens: 2048,
  },
  search: {
    providerId: "demo",
    baseUrl: "https://api.example.com/v1",
    authMode: "bearer",
  },
  credential: { configured: false, last4: "", updatedAt: null },
  searchCredential: { configured: false, last4: "", updatedAt: null },
};

export const APP_INFO = {
  appVersion: "1.0.9",
  dataDir: "C:\\Users\\Demo\\AppData\\Roaming\\jiexu",
  dbPath: "C:\\Users\\Demo\\AppData\\Roaming\\jiexu\\library.db",
  platform: "windows",
  caseCount: CASES.length,
};

/** catalog_list：domain 与 NAV_SECTIONS[k].kind 一致，计数来自夹具 */
export function buildCatalog(cases) {
  return Object.entries(CATEGORY_GROUPS).map(([domain, groups]) => ({
    domain,
    total: cases.filter((item) => item.kind === domain).length,
    groups: groups.map((group) => ({
      label: group.label,
      categories: group.categories.map(([id, label]) => ({
        id,
        label,
        count: cases.filter((item) => item.categoryId === id).length,
      })),
    })),
  }));
}

export const CATALOG = buildCatalog(CASES);

export function buildFixtures() {
  return {
    cases: CASES,
    catalog: CATALOG,
    collections: COLLECTIONS,
    collectionIds: COLLECTION_IDS,
    tags: TAGS,
    tagsByCase: Object.fromEntries(
      Object.entries(TAGS_BY_CASE).map(([caseId, labels]) => [
        caseId,
        labels.map((label) => ({
          id: `tag-${label}`,
          label,
        })),
      ]),
    ),
    settings: SETTINGS,
    aiSettings: AI_SETTINGS,
    appInfo: APP_INFO,
  };
}

/**
 * 真实库模式：只读打开应用 SQLite，把 cases 表映射成同样的数据结构。
 * 收藏、合集、标签都按库里实际内容来，不用演示数据补齐。
 */
export function loadRealFixtures() {
  const dbPath = `${process.env.APPDATA}\\com.jiexu.interface\\app.db`;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db
    .prepare(
      `select id, kind, title, summary, payload_json, confidence, is_favorite,
              created_at, updated_at, category_id, platform, component_layer
         from cases
        where deleted_at is null
        order by updated_at desc`,
    )
    .all();
  db.close();

  const cases = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    payloadJson: row.payload_json,
    confidence: row.confidence,
    isFavorite: row.is_favorite === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryId: row.category_id,
    platform: row.platform,
    componentLayer: row.component_layer,
  }));

  return {
    cases,
    catalog: buildCatalog(cases),
    collections: [],
    collectionIds: {},
    tags: [],
    tagsByCase: {},
    settings: SETTINGS,
    aiSettings: AI_SETTINGS,
    appInfo: { ...APP_INFO, caseCount: cases.length },
  };
}

/**
 * 注入到页面里的最小 Tauri 运行时。
 * 用函数序列化后调用，保证不依赖 Node 作用域；未知命令一律返回 null。
 */
export function installTauriStub(data) {
  const errors = [];
  window.__shotErrors = errors;
  // @tauri-apps/api/event 的 unlisten 会直接访问这个全局，缺失会导致 unhandledrejection
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    registerListener: () => {},
    unregisterListener: () => {},
  };

  const describe = (value) => {
    try {
      if (value instanceof Error) return value.stack || value.message;
      if (typeof value === "string") return value;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  const record = (kind, args) => {
    errors.push({ kind, text: args.map(describe).join(" "), at: Date.now() });
  };
  const nativeError = console.error.bind(console);
  const nativeWarn = console.warn.bind(console);
  console.error = (...args) => {
    record("console.error", args);
    nativeError(...args);
  };
  console.warn = (...args) => {
    record("console.warn", args);
    nativeWarn(...args);
  };
  window.addEventListener("error", (event) => {
    record("window.onerror", [event.message || "unknown error"]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    record("unhandledrejection", [event.reason]);
  });

  const state = {
    cases: data.cases.map((item) => ({ ...item })),
    catalog: data.catalog,
    collections: data.collections.map((item) => ({ ...item })),
    collectionIds: data.collectionIds,
    tags: data.tags.map((item) => ({ ...item })),
    tagsByCase: { ...data.tagsByCase },
    settings: { ...data.settings },
    aiSettings: data.aiSettings,
    appInfo: data.appInfo,
  };

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const countBy = (rows, key) => {
    const result = {};
    for (const row of rows) {
      const value = row[key];
      if (!value) continue;
      result[value] = (result[value] || 0) + 1;
    }
    return result;
  };

  const applyScope = (rows, input) => {
    const scope = input.scope || "all";
    let next = rows;
    if (scope === "favorites") next = next.filter((row) => row.isFavorite);
    else if (scope === "recent") {
      next = next.filter((row) => new Date(row.updatedAt).getTime() >= cutoff);
    } else if (scope === "collection") {
      const ids = state.collectionIds[input.collectionId] || [];
      next = next.filter((row) => ids.includes(row.id));
    }
    if (input.categoryId) next = next.filter((row) => row.categoryId === input.categoryId);
    if (input.search) {
      const query = String(input.search).trim().toLowerCase();
      if (query) {
        next = next.filter((row) =>
          `${row.title} ${row.summary}`.toLowerCase().includes(query),
        );
      }
    }
    return next;
  };

  let seq = 0;
  let eventId = 0;

  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    plugins: {
      path: { sep: "\\", delimiter: ";" },
    },
    transformCallback: (callback, once) => {
      const id = ++seq;
      window[`_${id}`] = callback;
      if (once) {
        window[`_once_${id}`] = true;
      }
      return id;
    },
    unregisterCallback: (id) => {
      delete window[`_${id}`];
      delete window[`_once_${id}`];
    },
    convertFileSrc: (value) => value,
    invoke: async (command, args) => {
      const input = (args && args.input) || {};

      switch (command) {
        case "settings_get_all":
          return state.settings;
        case "settings_set":
          if (args && args.key) state.settings[args.key] = args.value;
          return null;

        case "cases_query": {
          let rows = applyScope(state.cases.slice(), input);
          if (input.kind) rows = rows.filter((row) => row.kind === input.kind);
          if (input.platform) rows = rows.filter((row) => row.platform === input.platform);
          if (input.confidence) {
            rows = rows.filter((row) => row.confidence === input.confidence);
          }
          if (input.layer) rows = rows.filter((row) => row.componentLayer === input.layer);
          const sort = input.sort || "updated";
          rows.sort((a, b) => {
            if (sort === "title") return a.title.localeCompare(b.title, "zh-Hans-CN");
            const key = sort === "created" ? "createdAt" : "updatedAt";
            return new Date(b[key]).getTime() - new Date(a[key]).getTime();
          });
          const total = rows.length;
          const offset = Number(input.offset || 0);
          const limit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : rows.length;
          return { items: rows.slice(offset, offset + limit), total };
        }
        case "cases_facets": {
          const rows = applyScope(state.cases.slice(), input);
          return {
            kinds: countBy(rows, "kind"),
            platforms: countBy(rows, "platform"),
            confidences: countBy(rows, "confidence"),
            layers: countBy(rows, "componentLayer"),
          };
        }
        case "cases_view_counts": {
          const recent = state.cases.filter(
            (row) => new Date(row.updatedAt).getTime() >= cutoff,
          );
          return {
            total: state.cases.length,
            favorites: state.cases.filter((row) => row.isFavorite).length,
            recent: recent.length,
          };
        }
        case "cases_counts":
          return countBy(state.cases, "kind");

        case "catalog_list":
          return state.catalog;

        case "cases_tags":
          return state.tagsByCase[(args && args.caseId) || ""] || [];
        case "tags_list":
          return state.tags;
        case "cases_set_tags": {
          const labels = (args && args.labels) || [];
          const refs = labels.map((label) => {
            const existing = state.tags.find((tag) => tag.label === label);
            return existing ? { id: existing.id, label: existing.label } : {
              id: `tag-${label}`,
              label,
            };
          });
          if (args && args.caseId) state.tagsByCase[args.caseId] = refs;
          return refs;
        }

        case "collections_list":
          return state.collections;
        case "collections_create": {
          const name = (args && args.name) || "新合集";
          const row = {
            id: `col-${state.collections.length + 1}`,
            name,
            description: "",
            count: 0,
            createdAt: new Date().toISOString(),
          };
          state.collections.push(row);
          return row;
        }
        case "collections_add_case": {
          const collectionId = args && args.collectionId;
          const caseId = args && args.caseId;
          if (collectionId && caseId) {
            const ids = state.collectionIds[collectionId] || [];
            if (!ids.includes(caseId)) ids.push(caseId);
            state.collectionIds[collectionId] = ids;
            const row = state.collections.find((item) => item.id === collectionId);
            if (row) row.count = ids.length;
          }
          return null;
        }
        case "collections_remove_case":
          return null;

        case "cases_toggle_favorite": {
          const row = state.cases.find((item) => item.id === (args && args.id));
          if (!row) return false;
          row.isFavorite = !row.isFavorite;
          return row.isFavorite;
        }
        case "cases_update_payload": {
          const row = state.cases.find((item) => item.id === (args && args.id));
          if (!row) return null;
          row.payloadJson = args.payloadJson;
          row.updatedAt = new Date().toISOString();
          return row;
        }
        case "cases_rename": {
          const row = state.cases.find((item) => item.id === (args && args.id));
          if (!row) return null;
          row.title = args.title;
          return row;
        }
        case "cases_soft_delete":
          return null;
        case "cases_create": {
          const create = input;
          const row = {
            id: `c-created-${state.cases.length + 1}`,
            kind: create.kind || "style",
            title: create.title || "未命名案例",
            summary: create.summary || "",
            confidence: create.confidence || "user_defined",
            isFavorite: false,
            categoryId: create.categoryId || null,
            platform: create.platform || "web",
            componentLayer: create.componentLayer || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            payloadJson: create.payloadJson || "{}",
          };
          state.cases.unshift(row);
          return row;
        }
        case "cases_export_bundle": {
          const title = (input && input.title) || "export";
          return {
            markdownPath: `C:\\Users\\Demo\\AppData\\Roaming\\jiexu\\exports\\${title}.md`,
            jsonPath: `C:\\Users\\Demo\\AppData\\Roaming\\jiexu\\exports\\${title}.json`,
            fileStem: title,
          };
        }
        case "cases_export_markdown":
          return "C:\\Users\\Demo\\AppData\\Roaming\\jiexu\\exports\\case.md";

        case "assets_list_for_case":
          return [];
        case "content_packages_list":
          return [];

        case "app_info":
          return state.appInfo;
        case "ai_settings_get":
          return state.aiSettings;

        case "plugin:event|listen":
          return ++eventId;
        case "plugin:event|unlisten":
          return null;
        case "plugin:window|is_maximized":
          return false;

        default:
          if (command.startsWith("plugin:")) return null;
          return null;
      }
    },
  };
}
