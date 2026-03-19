// ============================================================
// Constants
// ============================================================

export const SLIDE_W = 1280;
export const SLIDE_H = 720;
export const PLAN_TIMEOUT_MS = 60_000;
export const RENDER_TIMEOUT_MS = 90_000;
export const MAX_RETRIES = 3;

// Font family presets
export const FONT_PRESETS = [
  { label: "ゴシック体", css: "Noto Sans JP, Hiragino Sans, sans-serif" },
  { label: "明朝体", css: "Noto Serif JP, Hiragino Mincho ProN, serif" },
  { label: "丸ゴシック", css: "Rounded Mplus 1c, Noto Sans JP, sans-serif" },
  { label: "モノスペース", css: "Source Code Pro, Noto Sans Mono, monospace" },
] as const;

// Drag-to-move + Resize CSS
export const DRAG_CSS = `
[data-draggable] { overflow:visible !important; }
[data-draggable][data-hovered] > [data-drag-toolbar] { opacity:1 !important }
[data-draggable][data-hovered] > [data-resize] { opacity:1 !important }
[data-draggable][data-selected] { outline:2px solid rgba(59,130,246,0.6) !important; outline-offset:2px !important; }
[data-drag-toolbar] {
  position:absolute; top:-6px; left:-6px; z-index:100;
  display:flex; align-items:center; gap:2px;
  opacity:0; transition:opacity .15s; pointer-events:auto;
}
[data-drag-toolbar] > [data-drag-handle] {
  width:22px; height:22px;
  background:rgba(255,255,255,0.95); border:1px solid rgba(0,0,0,0.12);
  border-radius:5px; display:flex; align-items:center; justify-content:center;
  cursor:grab; box-shadow:0 1px 3px rgba(0,0,0,0.1);
}
[data-drag-handle]:active { cursor:grabbing }
[data-drag-toolbar] > [data-block-action] {
  width:20px; height:20px;
  background:rgba(255,255,255,0.95); border:1px solid rgba(0,0,0,0.10);
  border-radius:4px; display:flex; align-items:center; justify-content:center;
  cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.08);
  transition:background .1s;
}
[data-block-action]:hover { background:rgba(230,230,230,0.95) !important }
[data-block-action="delete"]:hover { background:rgba(254,202,202,0.95) !important }
[data-dragging] {
  outline:2px dashed rgba(20,184,166,0.5) !important;
  outline-offset:2px !important; opacity:0.85;
}
[data-resize] {
  position:absolute; background:white; border:1.5px solid rgba(20,184,166,0.7);
  border-radius:2px; z-index:101; opacity:0; transition:opacity .15s; pointer-events:auto;
  box-shadow:0 0 2px rgba(0,0,0,0.1);
}
[data-resize="se"],[data-resize="nw"],[data-resize="ne"],[data-resize="sw"] { width:8px; height:8px; }
[data-resize="se"] { bottom:-4px; right:-4px; cursor:se-resize; }
[data-resize="sw"] { bottom:-4px; left:-4px; cursor:sw-resize; }
[data-resize="ne"] { top:-4px; right:-4px; cursor:ne-resize; }
[data-resize="nw"] { top:-4px; left:-4px; cursor:nw-resize; }
[data-resize="e"],[data-resize="w"] { width:6px; height:20px; top:50%; margin-top:-10px; }
[data-resize="n"],[data-resize="s"] { height:6px; width:20px; left:50%; margin-left:-10px; }
[data-resize="e"] { right:-3px; cursor:e-resize; }
[data-resize="w"] { left:-3px; cursor:w-resize; }
[data-resize="n"] { top:-3px; cursor:n-resize; }
[data-resize="s"] { bottom:-3px; cursor:s-resize; }
[data-resizing] {
  outline:2px solid rgba(20,184,166,0.6) !important;
  outline-offset:1px !important;
}`;

export const GRIP_SVG = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="3" r="1.5" fill="#9CA3AF"/><circle cx="10" cy="3" r="1.5" fill="#9CA3AF"/><circle cx="4" cy="7" r="1.5" fill="#9CA3AF"/><circle cx="10" cy="7" r="1.5" fill="#9CA3AF"/><circle cx="4" cy="11" r="1.5" fill="#9CA3AF"/><circle cx="10" cy="11" r="1.5" fill="#9CA3AF"/></svg>`;
export const COPY_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
export const TRASH_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

export const SLIDE_CDN_HEAD = `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;700&family=M+PLUS+Rounded+1c:wght@400;700&family=Source+Code+Pro:wght@400;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
<script src="https://unpkg.com/lucide@latest"><\/script>
<style>body { font-family: 'Noto Sans JP', 'Inter', sans-serif; margin: 0; }</style>`;
