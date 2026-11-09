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

function motionBody(p: Palette, scene: Extract<PreviewSpec, { kind: "motion" }>["scene"]): string {
  switch (scene) {
    case "stagger":
      return rows(p);
    case "page-push":
      return `
        <rect x="46" y="38" width="150" height="64" rx="6" fill="${p.surface}" stroke="${p.border}" />
        <rect x="36" y="33" width="158" height="72" rx="6" fill="${p.raised}" stroke="${p.border}" />
        <rect x="26" y="28" width="166" height="80" rx="6" fill="${p.raised}" stroke="${p.accent}" stroke-opacity="0.55" />
        <rect x="36" y="42" width="72" height="4" rx="2" fill="${p.text}" opacity="0.6" />
        <rect x="36" y="54" width="46" height="3" rx="1.5" fill="${p.border}" />`;
    case "shared-element":
      return `
        <rect x="44" y="40" width="40" height="40" rx="5" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <path d="M92 60H118" stroke="${p.accent}" stroke-width="2" stroke-dasharray="3 3" />
        <rect x="126" y="30" width="88" height="60" rx="6" fill="${p.raised}" stroke="${p.accent}" stroke-opacity="0.55" />
        <rect x="132" y="36" width="30" height="30" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
        <rect x="132" y="72" width="54" height="3" rx="1.5" fill="${p.border}" />`;
    case "micro":
      return `
        <rect x="80" y="52" width="80" height="30" rx="8" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <rect x="95" y="64" width="50" height="4" rx="2" fill="${p.text}" opacity="0.65" />
        <circle cx="172" cy="48" r="5" fill="${p.accent}" />
        <path d="M164 88H188" stroke="${p.border}" stroke-width="2" stroke-linecap="round" />`;
    case "spring":
      return `
        <path d="M40 96C68 42 132 132 196 48" fill="none" stroke="${p.accent}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="4 4" />
        <rect x="30" y="86" width="34" height="20" rx="4" fill="${p.surface}" stroke="${p.border}" />
        <rect x="172" y="36" width="34" height="20" rx="4" fill="${p.raised}" stroke="${p.accent}" stroke-opacity="0.6" />`;
    case "parallax":
      return `
        <rect x="26" y="46" width="98" height="52" rx="5" fill="${p.surface}" stroke="${p.border}" />
        <rect x="72" y="36" width="98" height="52" rx="5" fill="${p.raised}" stroke="${p.border}" />
        <rect x="118" y="26" width="98" height="52" rx="5" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />`;
    case "loading":
      return `
        <circle cx="98" cy="58" r="5" fill="${p.accent}" />
        <circle cx="120" cy="58" r="5" fill="${p.accent}" opacity="0.7" />
        <circle cx="142" cy="58" r="5" fill="${p.accent}" opacity="0.4" />
        <rect x="62" y="80" width="116" height="6" rx="3" fill="${p.surface}" />
        <rect x="62" y="80" width="64" height="6" rx="3" fill="${p.accent}" opacity="0.8" />`;
    case "easing":
      return `
        <rect x="34" y="46" width="172" height="8" rx="4" fill="${p.surface}" stroke="${p.border}" />
        <circle cx="48" cy="50" r="6" fill="${p.faint}" />
        <path d="M54 38h108" stroke="${p.faint}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.6" />
        <rect x="34" y="84" width="172" height="8" rx="4" fill="${p.surface}" stroke="${p.border}" />
        <circle cx="170" cy="88" r="6" fill="${p.accent}" />
        <path d="M54 76h120" stroke="${p.accent}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.7" />`;
    case "reduced":
      return `
        <rect x="40" y="32" width="160" height="14" rx="4" fill="${p.raised}" stroke="${p.border}" />
        <rect x="40" y="54" width="160" height="14" rx="4" fill="${p.raised}" stroke="${p.border}" />
        <g opacity="0.35">
          <rect x="40" y="84" width="160" height="14" rx="4" fill="${p.raised}" stroke="${p.border}" />
          <rect x="40" y="106" width="160" height="14" rx="4" fill="${p.raised}" stroke="${p.border}" />
        </g>`;
    default: {
      const exhaustive: never = scene;
      return exhaustive;
    }
  }
}

function feedbackBody(
  p: Palette,
  scene: Extract<PreviewSpec, { kind: "feedback" }>["scene"],
): string {
  switch (scene) {
    case "toast":
      return `
        <rect x="62" y="44" width="116" height="28" rx="6" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <circle cx="78" cy="58" r="3.5" fill="${p.accent}" />
        <rect x="88" y="56" width="66" height="4" rx="2" fill="${p.text}" opacity="0.75" />
        <rect x="62" y="84" width="30" height="4" rx="2" fill="${p.accent}" />
        <rect x="92" y="84" width="52" height="4" rx="2" fill="${p.accent}" opacity="0.35" />
        <rect x="144" y="84" width="34" height="4" rx="2" fill="${p.border}" />
        <rect x="62" y="96" width="48" height="3" rx="1.5" fill="${p.faint}" opacity="0.5" />`;
    case "validation":
      return `
        <rect x="52" y="36" width="136" height="26" rx="5" fill="${p.surface}" stroke="#d85b5b" stroke-width="1.6" />
        <rect x="60" y="47" width="62" height="4" rx="2" fill="${p.text}" opacity="0.5" />
        <circle cx="60" cy="78" r="3" fill="#d85b5b" />
        <rect x="68" y="76" width="86" height="4" rx="2" fill="#d85b5b" opacity="0.8" />
        <path d="M42 44l-5 4M44 54l-6 1" stroke="#d85b5b" stroke-width="1.4" stroke-linecap="round" />`;
    case "submit":
      return `
        <rect x="74" y="52" width="92" height="30" rx="7" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <circle cx="106" cy="67" r="3" fill="${p.accent}" />
        <circle cx="117" cy="67" r="3" fill="${p.accent}" opacity="0.7" />
        <circle cx="128" cy="67" r="3" fill="${p.accent}" opacity="0.4" />
        <path d="M136 67l3 3 6-7" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round" />
        <rect x="90" y="94" width="60" height="3" rx="1.5" fill="${p.border}" />`;
    case "confirm":
      return `
        <rect x="56" y="30" width="128" height="78" rx="7" fill="${p.raised}" stroke="${p.border}" />
        <rect x="68" y="42" width="62" height="4" rx="2" fill="${p.text}" opacity="0.65" />
        <rect x="68" y="54" width="94" height="3" rx="1.5" fill="${p.border}" />
        <rect x="68" y="76" width="42" height="18" rx="4" fill="${p.surface}" stroke="${p.border}" />
        <rect x="118" y="76" width="44" height="18" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <rect x="56" y="104" width="128" height="4" rx="2" fill="${p.surface}" />
        <rect x="56" y="104" width="72" height="4" rx="2" fill="${p.accent}" opacity="0.7" />`;
    case "loading":
      return `
        <circle cx="96" cy="62" r="16" fill="none" stroke="${p.surface}" stroke-width="4" />
        <path d="M96 46a16 16 0 0 1 16 16" fill="none" stroke="${p.accent}" stroke-width="4" stroke-linecap="round" />
        <rect x="124" y="46" width="66" height="7" rx="3.5" fill="${p.raised}" stroke="${p.border}" />
        <rect x="124" y="60" width="46" height="7" rx="3.5" fill="${p.raised}" stroke="${p.border}" />
        <rect x="72" y="92" width="96" height="3" rx="1.5" fill="${p.border}" opacity="0.6" />`;
    case "empty":
      return `
        <path d="M88 60l10-10h44l10 10v30H88z" fill="${p.surface}" stroke="${p.border}" stroke-width="1.6" />
        <path d="M88 60h64" stroke="${p.border}" stroke-width="1.6" />
        <rect x="102" y="72" width="36" height="4" rx="2" fill="${p.faint}" opacity="0.6" />
        <rect x="96" y="98" width="48" height="16" rx="5" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />`;
    case "error":
      return `
        <rect x="48" y="42" width="144" height="24" rx="5" fill="${p.accentSoft}" stroke="#d85b5b" stroke-opacity="0.75" />
        <circle cx="62" cy="54" r="3.5" fill="#d85b5b" />
        <rect x="72" y="52" width="92" height="4" rx="2" fill="${p.text}" opacity="0.65" />
        <rect x="82" y="80" width="60" height="20" rx="5" fill="${p.surface}" stroke="${p.border}" />
        <rect x="97" y="88" width="30" height="4" rx="2" fill="${p.accent}" opacity="0.8" />`;
    case "states":
      return `
        <rect x="46" y="34" width="62" height="26" rx="7" fill="${p.surface}" stroke="${p.border}" />
        <rect x="132" y="34" width="62" height="26" rx="7" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <rect x="46" y="72" width="62" height="26" rx="7" fill="${p.accent}" />
        <rect x="132" y="72" width="62" height="26" rx="7" fill="${p.surface}" stroke="${p.border}" stroke-dasharray="4 3" opacity="0.55" />`;
    default: {
      const exhaustive: never = scene;
      return exhaustive;
    }
  }
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

function themeBody(p: Palette, scene: Extract<PreviewSpec, { kind: "theme" }>["scene"]): string {
  switch (scene) {
    case "crossfade":
      return themeBoard(p);
    case "light":
    case "dark": {
      const base = scene === "light" ? "#eef2f5" : "#07090c";
      const tier2 = scene === "light" ? "#e3e9ee" : "#10161c";
      const tier3 = scene === "light" ? "#d8e0e7" : "#1a2229";
      return `
        <rect x="42" y="24" width="156" height="92" rx="8" fill="${base}" stroke="${p.border}" />
        <rect x="54" y="36" width="132" height="20" rx="5" fill="${tier2}" />
        <rect x="54" y="62" width="132" height="20" rx="5" fill="${tier3}" />
        <rect x="54" y="88" width="132" height="16" rx="5" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.4" />`;
    }
    case "system":
      return `
        <rect x="34" y="34" width="80" height="72" rx="6" fill="#eef2f5" stroke="${p.border}" />
        <rect x="44" y="46" width="40" height="4" rx="2" fill="#14202b" opacity="0.6" />
        <rect x="44" y="58" width="60" height="30" rx="4" fill="#dde6ec" />
        <rect x="126" y="34" width="80" height="72" rx="6" fill="#07090c" stroke="${p.accent}" stroke-opacity="0.5" />
        <rect x="136" y="46" width="40" height="4" rx="2" fill="#e8eef3" opacity="0.6" />
        <rect x="136" y="58" width="60" height="30" rx="4" fill="#10161c" />
        <circle cx="120" cy="24" r="8" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
        <circle cx="120" cy="24" r="4" fill="${p.accent}" />`;
    case "brand":
      return `
        <rect x="38" y="36" width="48" height="48" rx="9" fill="${p.accent}" />
        <rect x="96" y="36" width="48" height="48" rx="9" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <rect x="154" y="36" width="48" height="48" rx="9" fill="${p.raised}" stroke="${p.accent}" stroke-opacity="0.5" />
        <rect x="84" y="96" width="72" height="20" rx="5" fill="${p.accent}" />
        <rect x="102" y="104" width="36" height="4" rx="2" fill="${p.bg}" opacity="0.75" />`;
    case "accent": {
      const steps = Array.from({ length: 10 })
        .map((_, index) => {
          const x = 30 + index * 18;
          return `<rect x="${x}" y="44" width="14" height="30" rx="2" fill="${p.accent}" opacity="${(0.18 + index * 0.09).toFixed(2)}" />`;
        })
        .join("");
      return `
        ${steps}
        <rect x="78" y="88" width="84" height="20" rx="5" fill="${p.accent}" />
        <rect x="96" y="96" width="48" height="4" rx="2" fill="${p.bg}" opacity="0.8" />`;
    }
    case "override":
      return `
        <rect x="34" y="26" width="172" height="88" rx="7" fill="${p.surface}" stroke="${p.border}" />
        <rect x="46" y="38" width="148" height="24" rx="4" fill="${p.raised}" />
        <rect x="76" y="70" width="88" height="32" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <path d="M70 86H56" stroke="${p.accent}" stroke-width="1.6" stroke-dasharray="3 3" />
        <path d="M60 82l-5 4 5 4" fill="none" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round" />`;
    default: {
      const exhaustive: never = scene;
      return exhaustive;
    }
  }
}

function componentBody(
  p: Palette,
  control: Extract<PreviewSpec, { kind: "component" }>["control"],
): string {
  switch (control) {
    case "switch":
      return `
        <rect x="84" y="52" width="52" height="30" rx="15" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <circle cx="121" cy="67" r="10" fill="${p.accent}" />
        <rect x="84" y="94" width="72" height="4" rx="2" fill="${p.border}" />`;
    case "button":
      return `
        <rect x="76" y="52" width="88" height="30" rx="6" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.6" />
        <rect x="98" y="64" width="44" height="6" rx="3" fill="${p.text}" opacity="0.65" />`;
    case "input":
      return `
        <rect x="54" y="50" width="132" height="30" rx="6" fill="${p.surface}" stroke="${p.accent}" stroke-opacity="0.6" />
        <rect x="64" y="63" width="64" height="5" rx="2.5" fill="${p.text}" opacity="0.45" />
        <rect x="154" y="58" width="2" height="14" fill="${p.accent}" />`;
    case "segmented":
      return `
        <rect x="58" y="48" width="124" height="32" rx="8" fill="${p.surface}" stroke="${p.border}" />
        <rect x="62" y="52" width="38" height="24" rx="6" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.55" />
        <rect x="108" y="62" width="22" height="4" rx="2" fill="${p.border}" />
        <rect x="142" y="62" width="22" height="4" rx="2" fill="${p.border}" />`;
    case "checkbox":
      return `
        <rect x="88" y="48" width="22" height="22" rx="5" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.7" />
        <path d="M94 59l4 4 7-8" fill="none" stroke="${p.accent}" stroke-width="2.2" stroke-linecap="round" />
        <rect x="118" y="56" width="52" height="5" rx="2.5" fill="${p.text}" opacity="0.5" />`;
    case "radio":
      return `
        <circle cx="94" cy="46" r="7" fill="none" stroke="${p.accent}" stroke-width="2" />
        <circle cx="94" cy="46" r="3" fill="${p.accent}" />
        <rect x="108" y="43" width="40" height="5" rx="2.5" fill="${p.text}" opacity="0.5" />
        <circle cx="94" cy="68" r="7" fill="none" stroke="${p.border}" stroke-width="2" />
        <rect x="108" y="65" width="40" height="5" rx="2.5" fill="${p.border}" />
        <circle cx="94" cy="90" r="7" fill="none" stroke="${p.border}" stroke-width="2" />
        <rect x="108" y="87" width="40" height="5" rx="2.5" fill="${p.border}" />`;
    case "slider":
      return `
        <rect x="48" y="64" width="144" height="6" rx="3" fill="${p.surface}" />
        <rect x="48" y="64" width="76" height="6" rx="3" fill="${p.accent}" opacity="0.8" />
        <circle cx="124" cy="67" r="9" fill="${p.raised}" stroke="${p.accent}" stroke-width="2" />`;
    case "tabs":
      return `
        <rect x="54" y="44" width="48" height="26" rx="6" fill="${p.accentSoft}" />
        <rect x="66" y="55" width="24" height="4" rx="2" fill="${p.accent}" />
        <rect x="112" y="55" width="24" height="4" rx="2" fill="${p.border}" />
        <rect x="150" y="55" width="24" height="4" rx="2" fill="${p.border}" />
        <rect x="54" y="78" width="132" height="2" rx="1" fill="${p.border}" opacity="0.6" />`;
    case "progress":
      return `
        <rect x="48" y="58" width="144" height="10" rx="5" fill="${p.surface}" stroke="${p.border}" />
        <rect x="50" y="60" width="92" height="6" rx="3" fill="${p.accent}" opacity="0.85" />
        <rect x="48" y="84" width="40" height="4" rx="2" fill="${p.border}" />`;
    case "skeleton":
      return `
        <rect x="52" y="34" width="68" height="68" rx="6" fill="${p.raised}" stroke="${p.border}" />
        <rect x="130" y="42" width="58" height="7" rx="3.5" fill="${p.raised}" stroke="${p.border}" />
        <rect x="130" y="58" width="44" height="7" rx="3.5" fill="${p.raised}" stroke="${p.border}" />
        <rect x="130" y="74" width="52" height="7" rx="3.5" fill="${p.raised}" stroke="${p.border}" />`;
    case "badge":
      return `
        <circle cx="104" cy="64" r="20" fill="${p.raised}" stroke="${p.border}" />
        <path d="M100 54c-4 0-6 3-6 7v5l-3 3h18l-3-3v-5c0-4-2-7-6-7Z" fill="none" stroke="${p.accent}" stroke-width="1.6" />
        <circle cx="124" cy="48" r="9" fill="${p.accent}" />
        <rect x="120" y="46" width="8" height="4" rx="1.5" fill="${p.bg}" opacity="0.8" />`;
    case "nav":
      return `
        <rect x="26" y="26" width="188" height="30" rx="7" fill="${p.raised}" stroke="${p.border}" />
        <rect x="34" y="37" width="26" height="7" rx="3" fill="${p.text}" opacity="0.55" />
        <rect x="74" y="35" width="34" height="12" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.55" />
        <rect x="116" y="37" width="26" height="7" rx="3" fill="${p.border}" />
        <rect x="150" y="37" width="26" height="7" rx="3" fill="${p.border}" />
        <rect x="26" y="72" width="48" height="5" rx="2.5" fill="${p.faint}" opacity="0.65" />
        <rect x="80" y="72" width="58" height="5" rx="2.5" fill="${p.faint}" opacity="0.4" />
        <rect x="26" y="92" width="188" height="26" rx="6" fill="${p.surface}" stroke="${p.border}" />`;
    case "menu":
      return `
        <rect x="96" y="30" width="116" height="76" rx="8" fill="${p.raised}" stroke="${p.border}" />
        <rect x="106" y="40" width="34" height="4" rx="2" fill="${p.faint}" opacity="0.5" />
        <rect x="106" y="52" width="96" height="13" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.45" />
        <rect x="106" y="69" width="96" height="13" rx="4" fill="${p.surface}" />
        <rect x="106" y="86" width="96" height="13" rx="4" fill="${p.surface}" opacity="0.7" />
        <circle cx="72" cy="30" r="5" fill="${p.accent}" />`;
    case "modal":
      return `
        <rect x="20" y="18" width="200" height="104" rx="8" fill="${p.surface}" opacity="0.55" />
        <rect x="54" y="34" width="132" height="72" rx="8" fill="${p.raised}" stroke="${p.border}" />
        <rect x="66" y="46" width="54" height="6" rx="3" fill="${p.text}" opacity="0.6" />
        <rect x="66" y="58" width="98" height="3" rx="1.5" fill="${p.border}" />
        <rect x="66" y="66" width="78" height="3" rx="1.5" fill="${p.border}" />
        <rect x="66" y="84" width="42" height="14" rx="4" fill="${p.surface}" stroke="${p.border}" />
        <rect x="114" y="84" width="44" height="14" rx="4" fill="${p.accent}" />`;
    case "toast":
      return `
        <rect x="52" y="40" width="136" height="26" rx="8" fill="${p.raised}" stroke="${p.accent}" stroke-opacity="0.5" />
        <circle cx="66" cy="53" r="4" fill="${p.accent}" />
        <rect x="76" y="50" width="74" height="5" rx="2.5" fill="${p.text}" opacity="0.6" />
        <rect x="60" y="76" width="120" height="22" rx="8" fill="${p.raised}" stroke="${p.border}" opacity="0.7" />
        <rect x="72" y="84" width="62" height="5" rx="2.5" fill="${p.border}" />`;
    case "card":
      return `
        <rect x="44" y="24" width="152" height="92" rx="9" fill="${p.raised}" stroke="${p.border}" />
        <rect x="56" y="36" width="34" height="4" rx="2" fill="${p.faint}" opacity="0.6" />
        <rect x="56" y="48" width="84" height="7" rx="3" fill="${p.text}" opacity="0.6" />
        <rect x="56" y="62" width="112" height="3" rx="1.5" fill="${p.border}" />
        <rect x="56" y="70" width="86" height="3" rx="1.5" fill="${p.border}" />
        <rect x="56" y="88" width="52" height="16" rx="5" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />`;
    case "list":
      return `
        <rect x="28" y="26" width="184" height="20" rx="4" fill="${p.surface}" />
        <rect x="38" y="33" width="46" height="4" rx="2" fill="${p.faint}" opacity="0.6" />
        <rect x="132" y="33" width="30" height="4" rx="2" fill="${p.faint}" opacity="0.5" />
        <rect x="28" y="50" width="184" height="20" rx="4" fill="${p.raised}" stroke="${p.accent}" stroke-opacity="0.35" />
        <rect x="38" y="57" width="58" height="4" rx="2" fill="${p.text}" opacity="0.55" />
        <rect x="132" y="57" width="30" height="4" rx="2" fill="${p.border}" />
        <rect x="28" y="74" width="184" height="20" rx="4" fill="${p.raised}" stroke="${p.border}" />
        <rect x="38" y="81" width="46" height="4" rx="2" fill="${p.text}" opacity="0.45" />
        <rect x="132" y="81" width="30" height="4" rx="2" fill="${p.border}" />
        <rect x="28" y="98" width="184" height="20" rx="4" fill="${p.raised}" stroke="${p.border}" />
        <rect x="38" y="105" width="52" height="4" rx="2" fill="${p.text}" opacity="0.4" />
        <rect x="132" y="105" width="30" height="4" rx="2" fill="${p.border}" />`;
    case "empty":
      return `
        <circle cx="120" cy="48" r="18" fill="${p.surface}" stroke="${p.border}" stroke-dasharray="4 3" />
        <rect x="104" y="45" width="32" height="4" rx="2" fill="${p.faint}" opacity="0.6" />
        <rect x="88" y="78" width="64" height="6" rx="3" fill="${p.text}" opacity="0.5" />
        <rect x="76" y="92" width="88" height="3" rx="1.5" fill="${p.border}" />
        <rect x="94" y="104" width="52" height="16" rx="5" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />`;
    default: {
      const exhaustive: never = control;
      return exhaustive;
    }
  }
}

function styleBody(
  p: Palette,
  spec: Extract<PreviewSpec, { kind: "style" }>,
): string {
  const radius =
    spec.treatment === "brutalism"
      ? 0
      : spec.treatment === "clay"
        ? Math.max(18, spec.radiusPx)
        : Math.min(20, spec.radiusPx);
  const shadow =
    spec.treatment === "neumorphic"
      ? `filter="url(#pv-inset)"`
      : spec.treatment === "glass"
        ? `stroke-opacity="0.7"`
        : "";
  switch (spec.treatment) {
    case "flat":
      return `
        <rect x="46" y="28" width="148" height="84" rx="${radius}" fill="${p.raised}" stroke="${p.border}" />
        <rect x="60" y="42" width="18" height="18" rx="4" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
        <rect x="60" y="70" width="104" height="3" rx="1.5" fill="${p.border}" />
        <rect x="60" y="80" width="70" height="3" rx="1.5" fill="${p.border}" opacity="0.7" />`;
    case "neumorphic":
    case "glass":
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
    case "clay":
      return `
        <rect x="46" y="30" width="148" height="80" rx="${radius}" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.3" />
        <rect x="60" y="44" width="18" height="18" rx="7" fill="${p.raised}" stroke="${p.border}" />
        <rect x="60" y="72" width="104" height="4" rx="2" fill="${p.text}" opacity="0.35" />
        <rect x="60" y="82" width="70" height="4" rx="2" fill="${p.text}" opacity="0.22" />`;
    case "brutalism":
      return `
        <rect x="52" y="34" width="148" height="80" fill="${p.surface}" stroke="${p.text}" stroke-width="2" />
        <rect x="44" y="26" width="148" height="80" fill="${p.raised}" stroke="${p.text}" stroke-width="2" />
        <rect x="56" y="40" width="52" height="10" fill="${p.text}" />
        <rect x="56" y="60" width="96" height="4" fill="${p.text}" opacity="0.7" />
        <rect x="56" y="72" width="64" height="4" fill="${p.text}" opacity="0.5" />`;
    case "neobrutalism":
      return `
        <rect x="58" y="38" width="148" height="80" rx="${radius}" fill="${p.text}" opacity="0.9" />
        <rect x="46" y="26" width="148" height="80" rx="${radius}" fill="${p.accentSoft}" stroke="${p.text}" stroke-width="2" />
        <rect x="56" y="38" width="42" height="26" rx="3" fill="${p.accent}" />
        <rect x="106" y="44" width="72" height="4" fill="${p.text}" opacity="0.8" />
        <rect x="106" y="56" width="52" height="4" fill="${p.text}" opacity="0.55" />`;
    case "editorial":
      return `
        <rect x="30" y="20" width="180" height="100" rx="3" fill="${p.raised}" stroke="${p.border}" />
        <rect x="42" y="34" width="104" height="12" fill="${p.text}" opacity="0.85" />
        <rect x="42" y="52" width="55" height="3" fill="${p.border}" />
        <rect x="42" y="60" width="55" height="3" fill="${p.border}" />
        <rect x="42" y="68" width="38" height="3" fill="${p.border}" />
        <rect x="108" y="52" width="1" height="42" fill="${p.border}" />
        <rect x="118" y="52" width="55" height="3" fill="${p.border}" />
        <rect x="118" y="60" width="55" height="3" fill="${p.border}" />
        <rect x="118" y="68" width="42" height="3" fill="${p.border}" />
        <rect x="42" y="90" width="2" height="18" fill="${p.accent}" />
        <rect x="50" y="94" width="82" height="3" fill="${p.faint}" opacity="0.6" />`;
    case "bento":
      return `
        <rect x="28" y="22" width="108" height="52" rx="${radius}" fill="${p.raised}" stroke="${p.border}" />
        <rect x="144" y="22" width="68" height="52" rx="${radius}" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.4" />
        <rect x="28" y="82" width="60" height="40" rx="${radius}" fill="${p.surface}" stroke="${p.border}" />
        <rect x="96" y="82" width="116" height="40" rx="${radius}" fill="${p.raised}" stroke="${p.border}" />`;
    case "card":
      return `
        <rect x="26" y="18" width="136" height="32" rx="${radius}" fill="${p.raised}" stroke="${p.border}" />
        <rect x="26" y="56" width="188" height="32" rx="${radius}" fill="${p.raised}" stroke="${p.border}" />
        <rect x="26" y="94" width="136" height="32" rx="${radius}" fill="${p.raised}" stroke="${p.border}" />
        <rect x="36" y="27" width="14" height="14" rx="3" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
        <rect x="58" y="32" width="62" height="4" fill="${p.border}" />
        <rect x="36" y="65" width="14" height="14" rx="3" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
        <rect x="58" y="70" width="102" height="4" fill="${p.border}" />
        <rect x="36" y="103" width="14" height="14" rx="3" fill="${p.accentSoft}" stroke="${p.accent}" stroke-opacity="0.5" />
        <rect x="58" y="108" width="62" height="4" fill="${p.border}" />`;
    default: {
      const exhaustive: never = spec.treatment;
      return exhaustive;
    }
  }
}

/** 按 kind 自绘静态缩略图（SVG data URI），替代每卡一个实时预览场景 */
export function buildPosterUri(spec: PreviewSpec, theme: PosterTheme): string {
  const p = PALETTES[theme];

  let body: string;
  switch (spec.kind) {
    case "motion":
      body = motionBody(p, spec.scene);
      break;
    case "feedback":
      body = feedbackBody(p, spec.scene);
      break;
    case "component":
      body = componentBody(p, spec.control);
      break;
    case "theme":
      body = themeBody(p, spec.scene);
      break;
    case "style":
      body = styleBody(p, spec);
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
