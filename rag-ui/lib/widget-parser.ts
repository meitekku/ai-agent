/**
 * Streaming-safe JSON parser for show-widget code fences.
 *
 * Widget format: {"title":"...","widget_code":"<HTML string>"}
 *
 * During streaming (isIncomplete=true), JSON may be truncated mid-value.
 * We manually extract fields without JSON.parse to handle partial content.
 */

export interface ParsedWidget {
  title: string | null;
  widgetHtml: string | null;
  /** True when <script> tag is still being streamed (not yet closed). */
  scriptsTruncated: boolean;
  /** True when JSON.parse succeeded — widget_code is complete. */
  jsonComplete: boolean;
}

/**
 * Parse widget content from a show-widget code fence.
 *
 * @param code - Raw content inside the code fence
 * @param isIncomplete - True while streaming (fence not yet closed)
 */
export function parseWidgetContent(
  code: string,
  isIncomplete: boolean,
): ParsedWidget {
  // Always try JSON.parse first — even during streaming, if the JSON is
  // already complete (closing brace written) we get the accurate result.
  // This also handles the case where isIncomplete never flips to false.
  try {
    const obj = JSON.parse(code);
    return {
      title: obj.title ?? null,
      widgetHtml: obj.widget_code ?? null,
      scriptsTruncated: false,
      jsonComplete: true,
    };
  } catch {
    // Fall through to manual parsing
  }

  // Manual extraction for incomplete/malformed JSON
  const title = extractJsonStringValue(code, "title");
  const widgetHtml = extractWidgetCode(code);

  // Check if a <script> tag is still open (truncated during streaming)
  let scriptsTruncated = false;
  if (widgetHtml && isIncomplete) {
    const lastScriptOpen = widgetHtml.lastIndexOf("<script");
    if (lastScriptOpen !== -1) {
      const afterOpen = widgetHtml.slice(lastScriptOpen);
      if (!/<\/script\s*>/i.test(afterOpen)) {
        scriptsTruncated = true;
      }
    }
  }

  return { title, widgetHtml, scriptsTruncated, jsonComplete: false };
}

/** Extract a simple string value from JSON by key (regex). */
function extractJsonStringValue(json: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, "s");
  const m = json.match(re);
  return m ? m[1] : null;
}

/**
 * Extract widget_code value from potentially incomplete JSON.
 * Handles JSON string escaping: \" → ", \\n → newline, \\\\ → \.
 */
function extractWidgetCode(json: string): string | null {
  const marker = '"widget_code"';
  const idx = json.indexOf(marker);
  if (idx === -1) return null;

  // Find the opening quote of the value
  let i = idx + marker.length;
  while (i < json.length && json[i] !== '"') i++;
  if (i >= json.length) return null;
  i++; // skip opening quote

  // Unescape JSON string character by character
  let result = "";
  while (i < json.length) {
    const ch = json[i];
    if (ch === '"') break; // unescaped quote = end of string
    if (ch === "\\") {
      i++;
      if (i >= json.length) break;
      const esc = json[i];
      if (esc === '"') result += '"';
      else if (esc === "n") result += "\n";
      else if (esc === "t") result += "\t";
      else if (esc === "r") result += "\r";
      else if (esc === "\\") result += "\\";
      else if (esc === "/") result += "/";
      else result += esc;
    } else {
      result += ch;
    }
    i++;
  }

  return result || null;
}

/**
 * Strip incomplete <script> from streaming HTML to avoid broken preview.
 * Returns HTML up to the last unclosed <script> tag.
 */
export function stripIncompleteScript(html: string): string {
  const lastScriptOpen = html.lastIndexOf("<script");
  if (lastScriptOpen === -1) return html;
  const afterOpen = html.slice(lastScriptOpen);
  if (!/<\/script\s*>/i.test(afterOpen)) {
    return html.slice(0, lastScriptOpen);
  }
  return html;
}
