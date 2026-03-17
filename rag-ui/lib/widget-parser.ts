/**
 * Widget parser for show-widget code fences.
 *
 * Two-layer design (following CodePilot):
 * 1. splitWidgetSegments() — splits markdown into text/widget segments
 *    (called in MessageResponse, OUTSIDE streamdown)
 * 2. Internal JSON parsing — extracts title + widget_code from fence content
 */

// ── Segment types ────────────────────────────────────────────────────────

export interface TextSegment {
  type: "text";
  content: string;
}

export interface WidgetSegment {
  type: "widget";
  title: string | undefined;
  widgetCode: string;
}

export type ContentSegment = TextSegment | WidgetSegment;

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Parse ALL completed show-widget fences in markdown.
 * Returns alternating text/widget segments.
 */
export function parseAllShowWidgets(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const fenceRegex = /```show-widget\s*\n?([\s\S]*?)\n?\s*```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(text)) !== null) {
    // Text before this fence
    const before = text.slice(lastIndex, match.index).trim();
    if (before) segments.push({ type: "text", content: before });

    // Parse widget JSON
    try {
      const json = JSON.parse(match[1]);
      if (json.widget_code) {
        segments.push({
          type: "widget",
          title: json.title || undefined,
          widgetCode: String(json.widget_code),
        });
      }
    } catch {
      /* skip malformed widget */
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing text after last widget
  const trailing = text.slice(lastIndex).trim();
  if (trailing) segments.push({ type: "text", content: trailing });

  return segments;
}

/**
 * Extract partial widget_code from an incomplete (still streaming) fence body.
 * The fence body is the text after "```show-widget\n" without closing "```".
 */
export function extractPartialWidget(fenceBody: string): {
  title: string | undefined;
  widgetCode: string | null;
  scriptsTruncated: boolean;
} {
  // Try full JSON parse first (JSON may be complete before fence closes)
  try {
    const json = JSON.parse(fenceBody);
    if (json.widget_code) {
      return {
        title: json.title || undefined,
        widgetCode: String(json.widget_code),
        scriptsTruncated: false,
      };
    }
  } catch {
    /* expected — JSON is truncated */
  }

  // Manual string-search extraction for truncated JSON
  const keyIdx = fenceBody.indexOf('"widget_code"');
  if (keyIdx === -1) return { title: undefined, widgetCode: null, scriptsTruncated: false };

  const colonIdx = fenceBody.indexOf(":", keyIdx + 13);
  if (colonIdx === -1) return { title: undefined, widgetCode: null, scriptsTruncated: false };

  const quoteIdx = fenceBody.indexOf('"', colonIdx + 1);
  if (quoteIdx === -1) return { title: undefined, widgetCode: null, scriptsTruncated: false };

  let raw = fenceBody.slice(quoteIdx + 1);
  // Strip trailing close-quote + brace if present
  raw = raw.replace(/"\s*\}\s*$/, "");
  if (raw.endsWith("\\")) raw = raw.slice(0, -1);

  let widgetCode: string | null = null;
  try {
    widgetCode = raw
      .replace(/\\\\/g, "\x00BS\x00")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\x00BS\x00/g, "\\");
  } catch {
    widgetCode = null;
  }

  // Extract title
  let title: string | undefined;
  const titleMatch = fenceBody.match(/"title"\s*:\s*"([^"]*?)"/);
  if (titleMatch) title = titleMatch[1];

  // Truncate at unclosed <script> to avoid showing script source as text
  let scriptsTruncated = false;
  if (widgetCode) {
    const lastScript = widgetCode.lastIndexOf("<script");
    if (lastScript !== -1) {
      const afterScript = widgetCode.slice(lastScript);
      if (!/<script[\s\S]*?<\/script>/i.test(afterScript)) {
        widgetCode = widgetCode.slice(0, lastScript).trim() || null;
        scriptsTruncated = true;
      }
    }
  }

  return { title, widgetCode, scriptsTruncated };
}

/**
 * Compute a stable React key for a partial (streaming) widget so that
 * when the fence closes, React preserves the WidgetRenderer instance
 * instead of remounting it (which would destroy the iframe → scroll jump).
 */
export function computePartialWidgetKey(content: string): string {
  const lastFenceStart = content.lastIndexOf("```show-widget");
  const beforePart = content.slice(0, lastFenceStart).trim();
  const hasCompletedFences =
    beforePart.length > 0 && /```show-widget/.test(beforePart);
  const completedSegments = hasCompletedFences
    ? parseAllShowWidgets(beforePart)
    : [];
  return `w-${hasCompletedFences ? completedSegments.length : beforePart ? 1 : 0}`;
}
