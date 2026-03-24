/**
 * CSS variable bridge — maps widget variable names to rag-ui's OKLCH
 * design tokens so model-generated widgets inherit the current theme.
 *
 * Tailwind CSS v4 (@tailwindcss/browser) is loaded in the iframe srcdoc.
 * This file provides: CSS variable bridge, form element base styles,
 * and fallback utility classes (for when Tailwind hasn't loaded yet).
 */

// ── CSS variable mapping (widget names → rag-ui token names) ─────────────

const WIDGET_CSS_BRIDGE = /* css */ `
/* ── Backgrounds ──────────────────────────────────── */
--color-background-primary:   var(--background);
--color-background-secondary: var(--muted);
--color-background-tertiary:  color-mix(in oklch, var(--muted-foreground) 10%, var(--background));

/* ── Text ─────────────────────────────────────────── */
--color-text-primary:         var(--foreground);
--color-text-secondary:       var(--muted-foreground);
--color-text-tertiary:        color-mix(in oklch, var(--muted-foreground) 60%, transparent);

/* ── Borders ──────────────────────────────────────── */
--color-border-tertiary:      var(--border);
--color-border-secondary:     var(--border);
--color-border-primary:       color-mix(in oklch, var(--foreground) 40%, transparent);

/* ── Typography ───────────────────────────────────── */
--font-sans:                  -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-mono:                  ui-monospace, 'SF Mono', 'Cascadia Code', monospace;

/* ── Layout ───────────────────────────────────────── */
--border-radius-md:           8px;
--border-radius-lg:           12px;

/* ── Chart palette (mapped from rag-ui chart-1~5) ── */
--color-chart-1:              var(--chart-1);
--color-chart-2:              var(--chart-2);
--color-chart-3:              var(--chart-3);
--color-chart-4:              var(--chart-4);
--color-chart-5:              var(--chart-5);
`;

// ── Scoped utility classes ──────────────────────────────────────────────

const WIDGET_UTILITIES = /* css */ `
/* ── Display ─────────────────────────────────────── */
.hidden { display: none; }
.block { display: block; }
.inline-block { display: inline-block; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.grid { display: grid; }

/* ── Flex ─────────────────────────────────────────── */
.flex-col { flex-direction: column; }
.flex-row { flex-direction: row; }
.flex-wrap { flex-wrap: wrap; }
.flex-1 { flex: 1 1 0%; }
.shrink-0 { flex-shrink: 0; }
.items-start { align-items: flex-start; }
.items-center { align-items: center; }
.items-end { align-items: flex-end; }
.justify-start { justify-content: flex-start; }
.justify-center { justify-content: center; }
.justify-end { justify-content: flex-end; }
.justify-between { justify-content: space-between; }

/* ── Grid ─────────────────────────────────────────── */
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.col-span-2 { grid-column: span 2 / span 2; }
.col-span-full { grid-column: 1 / -1; }

/* ── Gap ──────────────────────────────────────────── */
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.gap-6 { gap: 24px; }
.gap-8 { gap: 32px; }

/* ── Spacing ──────────────────────────────────────── */
.m-0 { margin: 0; }
.mx-auto { margin-left: auto; margin-right: auto; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mb-2 { margin-bottom: 8px; }
.mb-4 { margin-bottom: 16px; }
.p-0 { padding: 0; }
.p-2 { padding: 8px; }
.p-3 { padding: 12px; }
.p-4 { padding: 16px; }
.px-2 { padding-left: 8px; padding-right: 8px; }
.px-3 { padding-left: 12px; padding-right: 12px; }
.px-4 { padding-left: 16px; padding-right: 16px; }
.py-1 { padding-top: 4px; padding-bottom: 4px; }
.py-2 { padding-top: 8px; padding-bottom: 8px; }
.py-3 { padding-top: 12px; padding-bottom: 12px; }

/* ── Width / Height ───────────────────────────────── */
.w-full { width: 100%; }
.h-full { height: 100%; }
.min-w-0 { min-width: 0; }
.max-w-full { max-width: 100%; }

/* ── Typography ───────────────────────────────────── */
.text-xs { font-size: 12px; line-height: 1.5; }
.text-sm { font-size: 14px; line-height: 1.5; }
.text-base { font-size: 16px; line-height: 1.6; }
.text-lg { font-size: 18px; line-height: 1.6; }
.text-xl { font-size: 20px; line-height: 1.4; }
.text-2xl { font-size: 24px; line-height: 1.3; }
.text-3xl { font-size: 30px; line-height: 1.2; }
.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.font-mono { font-family: var(--font-mono); }

/* ── Border radius ────────────────────────────────── */
.rounded { border-radius: 8px; }
.rounded-md { border-radius: 8px; }
.rounded-lg { border-radius: 12px; }
.rounded-xl { border-radius: 16px; }
.rounded-full { border-radius: 9999px; }

/* ── Borders ──────────────────────────────────────── */
.border { border: 1px solid var(--color-border-tertiary); }
.border-0 { border-width: 0; }
.border-t { border-top: 1px solid var(--color-border-tertiary); }
.border-b { border-bottom: 1px solid var(--color-border-tertiary); }

/* ── Overflow ─────────────────────────────────────── */
.overflow-hidden { overflow: hidden; }
.overflow-auto { overflow: auto; }
.overflow-x-auto { overflow-x: auto; }

/* ── Position ─────────────────────────────────────── */
.relative { position: relative; }
.absolute { position: absolute; }

/* ── Misc ─────────────────────────────────────────── */
.opacity-50 { opacity: 0.5; }
.cursor-pointer { cursor: pointer; }
.transition { transition: all 0.15s ease; }
.transition-colors { transition: color 0.15s, background-color 0.15s, border-color 0.15s; }

/* ── Surface colors ───────────────────────────────── */
.bg-surface-primary { background-color: var(--color-background-primary); }
.bg-surface-secondary { background-color: var(--color-background-secondary); }
.bg-transparent { background-color: transparent; }

/* ── Text semantic colors ─────────────────────────── */
.text-content-primary { color: var(--color-text-primary); }
.text-content-secondary { color: var(--color-text-secondary); }
.text-content-tertiary { color: var(--color-text-tertiary); }

/* ── Color ramps ──────────────────────────────────── */
.bg-indigo-50 { background-color: #EEF2FF; }
.bg-indigo-400 { background-color: #818CF8; }
.bg-indigo-600 { background-color: #4F46E5; }
.text-indigo-600 { color: #4F46E5; }
.text-indigo-800 { color: #3730A3; }
.border-indigo-200 { border-color: #C7D2FE; }
.bg-emerald-50 { background-color: #ECFDF5; }
.bg-emerald-400 { background-color: #34D399; }
.text-emerald-600 { color: #059669; }
.text-emerald-800 { color: #065F46; }
.border-emerald-200 { border-color: #A7F3D0; }
.bg-amber-50 { background-color: #FFFBEB; }
.bg-amber-400 { background-color: #FBBF24; }
.text-amber-600 { color: #D97706; }
.text-amber-800 { color: #92400E; }
.border-amber-200 { border-color: #FDE68A; }
.bg-rose-50 { background-color: #FFF1F2; }
.bg-rose-400 { background-color: #FB7185; }
.text-rose-600 { color: #E11D48; }
.border-rose-200 { border-color: #FECDD3; }
.bg-sky-50 { background-color: #F0F9FF; }
.bg-sky-400 { background-color: #38BDF8; }
.text-sky-600 { color: #0284C7; }
.border-sky-200 { border-color: #BAE6FD; }
.bg-slate-50 { background-color: #F8FAFC; }
.bg-slate-200 { background-color: #E2E8F0; }
.bg-slate-600 { background-color: #64748B; }
.text-slate-500 { color: #64748B; }
.text-slate-600 { color: #475569; }
.text-slate-800 { color: #334155; }
.border-slate-200 { border-color: #E2E8F0; }
`;

// ── Form element styles ──────────────────────────────────────────────────

const FORM_STYLES = /* css */ `
input[type="range"] {
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--color-border-tertiary);
  border-radius: 2px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-text-primary);
  cursor: pointer;
}
input[type="text"],
input[type="number"],
select,
textarea {
  height: 36px;
  padding: 0 10px;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-size: 14px;
  font-family: var(--font-sans);
  outline: none;
}
input:focus,
select:focus,
textarea:focus {
  border-color: var(--color-border-primary);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--color-border-primary) 30%, transparent);
}
button {
  background: transparent;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md);
  padding: 6px 14px;
  font-size: 14px;
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background 0.15s;
}
button:hover {
  background: var(--color-background-tertiary);
}
`;

// ── Theme variable names to resolve from parent document ─────────────────

const THEME_VAR_NAMES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--radius",
];

/**
 * Read computed CSS variable values from the parent document.
 * Must be called client-side only.
 */
export function resolveThemeVars(): Record<string, string> {
  const computed = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {};
  for (const name of THEME_VAR_NAMES) {
    const val = computed.getPropertyValue(name).trim();
    if (val) vars[name] = val;
  }
  return vars;
}

/**
 * Generate the full CSS content for iframe srcdoc.
 * Includes: resolved theme variables, CSS bridge mappings, base typography,
 * utility classes (unscoped for iframe), form styles, and animations.
 */
export function getWidgetIframeStyleBlock(
  resolvedVars: Record<string, string>,
): string {
  const rootVars = Object.entries(resolvedVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  return `
:root {
${rootVars}
}
.dark {
  color-scheme: dark;
}
body {
  ${WIDGET_CSS_BRIDGE}
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.7;
  color: var(--color-text-primary);
  background: transparent;
}
* {
  box-sizing: border-box;
}
a {
  color: var(--primary);
  text-decoration: none;
  cursor: pointer;
}
a:hover {
  text-decoration: underline;
}
${WIDGET_UTILITIES}
${FORM_STYLES}
@keyframes widgetFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
}
