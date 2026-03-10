"use client";

const NON_RENDER_TAGS = new Set(["script", "style", "link", "meta"]);

function getSlideRoot(doc: Document): HTMLElement | null {
  for (const node of Array.from(doc.body.children)) {
    const el = node as HTMLElement;
    if (NON_RENDER_TAGS.has(el.tagName.toLowerCase())) continue;
    return el;
  }
  return null;
}

function hasMeaningfulSlideContent(root: HTMLElement): boolean {
  const text = (root.innerText || "").replace(/\s+/g, " ").trim();
  if (text.length >= 4) return true;
  return Boolean(
    root.querySelector(
      "svg, img, table, canvas, video, [data-editable='true']",
    ),
  );
}

export function getRenderedSlideIssue(doc: Document): string | null {
  const root = getSlideRoot(doc);
  if (!root) return "missing slide root";

  const rect = root.getBoundingClientRect();
  if (rect.width < 200 || rect.height < 100) {
    return `unexpected root size ${Math.round(rect.width)}x${Math.round(rect.height)}`;
  }

  if (!hasMeaningfulSlideContent(root)) {
    return "slide root rendered without meaningful content";
  }

  return null;
}
