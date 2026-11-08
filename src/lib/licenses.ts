export interface LicenseEntry {
  name: string;
  license: string;
  note: string;
}

export const LICENSE_POLICY = {
  allowed: ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "OFL"],
  forbidden: ["GPL", "AGPL", "LGPL", "SSPL"],
};

export const LICENSE_ENTRIES: LicenseEntry[] = [
  { name: "React / React DOM", license: "MIT", note: "界面运行时" },
  { name: "React Router", license: "MIT", note: "路由" },
  { name: "Zustand", license: "MIT", note: "界面状态" },
  { name: "TanStack Query", license: "MIT", note: "IPC 数据查询" },
  { name: "Tauri", license: "MIT OR Apache-2.0", note: "桌面壳层" },
  { name: "Lucide", license: "ISC", note: "图标（版权声明见 THIRD_PARTY_NOTICES.md）" },
  { name: "Tailwind CSS", license: "MIT", note: "样式工具" },
  { name: "Vite", license: "MIT", note: "前端构建" },
  { name: "TypeScript", license: "Apache-2.0", note: "类型系统" },
  { name: "SQLx", license: "MIT OR Apache-2.0", note: "SQLite 访问" },
  { name: "Serde / serde_json", license: "MIT OR Apache-2.0", note: "序列化" },
  { name: "SQLite（内嵌）", license: "Public Domain", note: "本地数据库" },
];
