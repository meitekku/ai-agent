import {
  SLIDE_CDN_HEAD,
  DRAG_CSS,
  GRIP_SVG,
  COPY_SVG,
  TRASH_SVG,
  MAX_RETRIES,
} from "./constants";
import type { SlideSection } from "./types";

// ============================================================
// slideSrcDoc / failedSlideHtml
// ============================================================

export function slideSrcDoc(html: string) {
  return `<!DOCTYPE html>
<html><head>${SLIDE_CDN_HEAD}</head>
<body style="margin:0;padding:0;overflow:hidden;">
${html}
<script>lucide.createIcons();<\/script>
</body></html>`;
}

export function failedSlideHtml(title: string, errorMsg: string) {
  return `<div style="width:1280px;height:720px;display:flex;align-items:center;justify-content:center;background:#1e293b;color:#94a3b8;font-family:'Noto Sans JP',sans-serif;flex-direction:column;gap:16px;">
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
<p style="font-size:20px;color:#e2e8f0;margin:0;">${title}</p>
<p style="font-size:14px;color:#64748b;margin:0;max-width:600px;text-align:center;">${errorMsg}</p>
</div>`;
}

// ============================================================
// parsePlanMd (same logic as html-slide-viewer)
// ============================================================

export function parsePlanMd(md: string): {
  title: string;
  slides: SlideSection[];
} {
  const lines = md.split("\n");
  let title = "Slides";
  const slides: SlideSection[] = [];
  let current: SlideSection | null = null;

  for (const line of lines) {
    const stripped = line.trim();

    if (/^#\s+/.test(stripped) && !/^##/.test(stripped)) {
      title = stripped.replace(/^#\s+/, "").trim();
      continue;
    }

    const slideMatch = stripped.match(/^##\s+スライド\d+[:\s：]\s*(.+)/);
    if (slideMatch) {
      if (current) slides.push(current);
      current = { title: slideMatch[1].trim(), type: "content", plan_text: "" };
      continue;
    }

    if (/^##\s+/.test(stripped) && !slideMatch) {
      if (current) slides.push(current);
      current = {
        title: stripped.replace(/^##\s+/, "").trim(),
        type: "content",
        plan_text: "",
      };
      continue;
    }

    if (current) {
      current.plan_text += line + "\n";
      const typeMatch = stripped.match(/^-\s*タイプ[:\s：]\s*(.+)/);
      if (typeMatch) {
        const rawType = typeMatch[1].trim().toLowerCase();
        if (rawType === "cover" || rawType === "back-cover") {
          current.type = rawType;
        } else if (rawType.includes("back") && rawType.includes("cover")) {
          current.type = "back-cover";
        } else if (rawType.includes("cover")) {
          current.type = "cover";
        }
      }
    }
  }

  if (current) slides.push(current);
  return { title, slides };
}

// ============================================================
// fetchWithRetry — exponential backoff for 429/503
// ============================================================

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Combine user abort signal with timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const userSignal = options.signal;

    // If user already aborted, throw immediately
    if (userSignal?.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException("Aborted", "AbortError");
    }

    // Listen for user abort to also abort timeout controller
    const onUserAbort = () => timeoutController.abort();
    userSignal?.addEventListener("abort", onUserAbort, { once: true });

    try {
      const res = await fetch(url, {
        ...options,
        signal: timeoutController.signal,
      });

      clearTimeout(timeoutId);
      userSignal?.removeEventListener("abort", onUserAbort);

      // Retry on rate limit or server overload
      if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** attempt, 16000);
        console.warn(
          `[slide-panel] ${res.status} on ${url}, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      userSignal?.removeEventListener("abort", onUserAbort);

      // User abort — don't retry
      if (userSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      // Timeout — treat as retryable on first attempts
      if (
        e instanceof DOMException &&
        e.name === "AbortError" &&
        attempt < MAX_RETRIES
      ) {
        const delay = Math.min(1000 * 2 ** attempt, 16000);
        console.warn(
          `[slide-panel] timeout on ${url}, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw e;
    }
  }

  throw new Error("Max retries exceeded");
}

// ============================================================
// Drag helpers (module-level)
// ============================================================

export const SKIP_TAGS = new Set(["script", "style", "br", "hr"]);
export const LEAF_TAGS = new Set(["table", "svg", "img", "canvas", "video", "iframe"]);

export function findDraggableBlocks(container: HTMLElement): HTMLElement[] {
  let root: HTMLElement | null = null;
  for (const child of Array.from(container.children) as HTMLElement[]) {
    const tag = child.tagName.toLowerCase();
    if (
      tag === "style" ||
      child.hasAttribute("data-drag-toolbar") ||
      child.hasAttribute("data-resize")
    )
      continue;
    root = child;
    break;
  }
  if (!root) return [];

  const results: HTMLElement[] = [];
  const isInjected = (el: Element) =>
    el.hasAttribute("data-drag-toolbar") || el.hasAttribute("data-resize");
  const significantChildren = (parent: HTMLElement): HTMLElement[] =>
    (Array.from(parent.children) as HTMLElement[]).filter((c) => {
      if (isInjected(c)) return false;
      const t = c.tagName.toLowerCase();
      if (SKIP_TAGS.has(t)) return false;
      return c.offsetHeight >= 20 && c.offsetWidth >= 40;
    });

  const collect = (parent: HTMLElement, depth: number) => {
    if (depth > 6) return;
    for (const child of Array.from(parent.children) as HTMLElement[]) {
      const tag = child.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) continue;
      if (isInjected(child)) continue;
      if (child.offsetHeight < 20 || child.offsetWidth < 40) continue;
      if (LEAF_TAGS.has(tag)) {
        results.push(child);
        continue;
      }
      const sigKids = significantChildren(child);
      const isLarge = child.offsetWidth > 640 || child.offsetHeight > 360;
      results.push(child);
      if (
        depth < 6 &&
        (sigKids.length >= 2 || (isLarge && sigKids.length >= 1))
      ) {
        collect(child, depth + 1);
      }
    }
  };

  collect(root, 0);
  return results;
}

export function applyDragTranslate(el: HTMLElement, dx: number, dy: number) {
  const prevDx = parseFloat(el.dataset.dragX || "0");
  const prevDy = parseFloat(el.dataset.dragY || "0");
  const newDx = prevDx + dx;
  const newDy = prevDy + dy;
  el.dataset.dragX = String(newDx);
  el.dataset.dragY = String(newDy);
  if (!el.dataset.dragOrigTransform) {
    el.dataset.dragOrigTransform = el.style.transform || "";
  }
  const orig = el.dataset.dragOrigTransform;
  el.style.transform = orig
    ? `translate(${newDx}px,${newDy}px) ${orig}`
    : `translate(${newDx}px,${newDy}px)`;
}

export function setupDragHandles(container: HTMLElement) {
  const doc = container.ownerDocument;
  const styleId = "__drag-styles";
  if (!container.querySelector(`#${styleId}`)) {
    const style = doc.createElement("style");
    style.id = styleId;
    style.textContent = DRAG_CSS;
    container.prepend(style);
  }

  const blocks = findDraggableBlocks(container);
  for (const el of blocks) {
    if (el.hasAttribute("data-draggable")) continue;
    el.setAttribute("data-draggable", "");
    const cs = (container.ownerDocument.defaultView || window).getComputedStyle(
      el,
    );
    if (cs.position === "static") {
      el.style.position = "relative";
      el.setAttribute("data-drag-pos", "");
    }

    const toolbar = doc.createElement("div");
    toolbar.setAttribute("data-drag-toolbar", "");
    toolbar.style.position = "absolute";

    const grip = doc.createElement("div");
    grip.setAttribute("data-drag-handle", "");
    grip.innerHTML = GRIP_SVG;
    const copyBtn = doc.createElement("div");
    copyBtn.setAttribute("data-block-action", "copy");
    copyBtn.title = "コピー";
    copyBtn.innerHTML = COPY_SVG;
    const delBtn = doc.createElement("div");
    delBtn.setAttribute("data-block-action", "delete");
    delBtn.title = "削除";
    delBtn.innerHTML = TRASH_SVG;

    toolbar.append(grip, copyBtn, delBtn);
    el.prepend(toolbar);

    for (const dir of ["nw", "ne", "sw", "se", "n", "s", "e", "w"]) {
      const rh = doc.createElement("div");
      rh.setAttribute("data-resize", dir);
      el.appendChild(rh);
    }
  }
}

export function cleanupDragHandles(container: HTMLElement) {
  container
    .querySelectorAll("[data-drag-toolbar]")
    .forEach((el) => el.remove());
  container.querySelectorAll("[data-resize]").forEach((el) => el.remove());
  container.querySelectorAll("[data-draggable]").forEach((el) => {
    el.removeAttribute("data-draggable");
    el.removeAttribute("data-dragging");
    el.removeAttribute("data-resizing");
    el.removeAttribute("data-hovered");
    el.removeAttribute("data-selected");
    (el as HTMLElement).removeAttribute("data-resize-orig-w");
    (el as HTMLElement).removeAttribute("data-resize-orig-h");
    (el as HTMLElement).removeAttribute("data-resize-temp-dx");
    (el as HTMLElement).removeAttribute("data-resize-temp-dy");
  });
  container.querySelectorAll("[data-drag-pos]").forEach((el) => {
    (el as HTMLElement).style.position = "";
    el.removeAttribute("data-drag-pos");
  });
  const dragStyle = container.querySelector("#__drag-styles");
  if (dragStyle) dragStyle.remove();
}
