import { createPosterCache } from "@/lib/byteBudgetCache";
import type { PreviewSpec } from "@/lib/preview";

type PosterTheme = "dark" | "light";

interface Palette {
  bg: string;
  surface: string;
  raised: string;
  border: string;
  text: string;
  faint: string;
  accent: string;
  accentSoft: string;
}

const PALETTES: Record<PosterTheme, Palette> = {
  dark: {
    bg: "#0b0f13",
    surface: "#12181d",
    raised: "#182026",
    border: "#2a343d",
    text: "#e4ecf2",
    faint: "#6b7a86",
    accent: "#7fd3e8",
    accentSoft: "rgba(127,211,232,0.16)",
  },
  light: {
    bg: "#eef2f7",
    surface: "#f7fafd",
    raised: "#ffffff",
    border: "#ccd7e2",
    text: "#14202b",
    faint: "#63727f",
    accent: "#0e7a8a",
    accentSoft: "rgba(14,122,138,0.14)",
  },
};

const WIDTH = 240;
const HEIGHT = 140;

function rows(p: Palette): string {
  return [0, 1, 2, 3]
    .map((index) => {
      const y = 30 + index * 22;
      return `
        <rect x="26" y="${y}" width="188" height="16" rx="4" fill="${p.raised}" stroke="${p.border}" />
        <rect x="33" y="${y + 4.5}" width="7" height="7" rx="1.5" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
        <rect x="46" y="${y + 6.5}" width="96" height="3" rx="1.5" fill="${p.border}" />
        <rect x="150" y="${y + 6.5}" width="52" height="3" rx="1.5" fill="${p.border}" opacity="0.7" />`;
    })
    .join("");
}

function feedback(p: Palette): string {
  return `
    <rect x="62" y="44" width="116" height="28" rx="6" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
    <circle cx="78" cy="58" r="3.5" fill="${p.accent}" />
    <rect x="88" y="56" width="66" height="4" rx="2" fill="${p.text}" opacity="0.75" />
    <rect x="62" y="84" width="30" height="4" rx="2" fill="${p.accent}" />
    <rect x="92" y="84" width="52" height="4" rx="2" fill="${p.accent}" opacity="0.35" />
    <rect x="144" y="84" width="34" height="4" rx="2" fill="${p.border}" />
    <rect x="62" y="96" width="48" height="3" rx="1.5" fill="${p.faint}" opacity="0.5" />`;
}

function component(p: Palette): string {
  return `
    <rect x="84" y="52" width="52" height="30" rx="15" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
    <circle cx="121" cy="67" r="10" fill="${p.accent}" />
    <rect x="84" y="94" width="72" height="4" rx="2" fill="${p.border}" />`;
}

function themeBoard(p: Palette): string {
  return `
    <rect x="30" y="26" width="86" height="88" rx="7" fill="${p.raised}" stroke="${p.border}" />
    <rect x="42" y="38" width="38" height="3" rx="1.5" fill="${p.text}" opacity="0.5" />
    <rect x="42" y="50" width="62" height="26" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
    <rect x="42" y="84" width="46" height="3" rx="1.5" fill="${p.border}" />
    <rect x="124" y="26" width="86" height="88" rx="7" fill="${p.surface}" stroke="${p.border}" />
    <rect x="136" y="38" width="38" height="3" rx="1.5" fill="${p.faint}" opacity="0.6" />
    <rect x="136" y="50" width="62" height="26" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.35" />
    <rect x="136" y="84" width="46" height="3" rx="1.5" fill="${p.border}" />`;
}

function style(p: Palette, spec: Extract<PreviewSpec, { kind: "style" }>): string {
  const radius = Math.min(20, spec.radiusPx);
  const shadow =
    spec.treatment === "neumorphic"
      ? `filter="url(#pv-inset)"`
      : spec.treatment === "glass"
        ? `stroke-opacity="0.7"`
        : "";
  return `
    <defs>
      <filter id="pv-inset" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.35" />
      </filter>
    </defs>
    <rect x="46" y="28" width="148" height="84" rx="${radius}" fill="${p.raised}" stroke="${p.border}" ${shadow} />
    <rect x="60" y="42" width="18" height="18" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
    <rect x="60" y="70" width="104" height="3" rx="1.5" fill="${p.border}" />
    <rect x="60" y="80" width="70" height="3" rx="1.5" fill="${p.border}" opacity="0.7" />`;
}

/** 按 kind 自绘静态缩略图（SVG data URI），替代每卡一个实时预览场景 */
export function buildPosterUri(spec: PreviewSpec, theme: PosterTheme): string {
  const p = PALETTES[theme];

  let body: string;
  switch (spec.kind) {
    case "motion":
      body = rows(p);
      break;
    case "feedback":
      body = feedback(p);
      break;
    case "component":
      body = component(p);
      break;
    case "theme":
      body = themeBoard(p);
      break;
    case "style":
      body = style(p, spec);
      break;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${p.bg}" />
    <path d="M0 16H${WIDTH}M0 32H${WIDTH}M0 48H${WIDTH}M0 64H${WIDTH}M0 80H${WIDTH}M0 96H${WIDTH}M0 112H${WIDTH}M0 128H${WIDTH}M16 0V${HEIGHT}M32 0V${HEIGHT}M48 0V${HEIGHT}M64 0V${HEIGHT}M80 0V${HEIGHT}M96 0V${HEIGHT}M112 0V${HEIGHT}M128 0V${HEIGHT}M144 0V${HEIGHT}M160 0V${HEIGHT}M176 0V${HEIGHT}M192 0V${HEIGHT}M208 0V${HEIGHT}M224 0V${HEIGHT}" stroke="${p.border}" stroke-opacity="0.18" stroke-width="1" />
    ${body}
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const posterCache = createPosterCache();

/** 走 200MB 字节预算缓存；主题切换会自然分成两组 key */
export function getPosterUri(spec: PreviewSpec, theme: PosterTheme): string {
  const key = `${theme}:${JSON.stringify(spec)}`;
  const hit = posterCache.get(key);
  if (hit) return hit;

  const uri = buildPosterUri(spec, theme);
  posterCache.set(key, uri, uri.length * 2);
  return uri;
}
