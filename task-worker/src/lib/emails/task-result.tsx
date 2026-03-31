import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Row,
  Column,
  Img,
  Markdown,
} from "@react-email/components";

interface ToolCall {
  tool: string;
  args?: Record<string, unknown>;
  result_summary: string;
  duration_ms: number;
}

interface TaskResultEmailProps {
  taskName: string;
  status: "success" | "failure" | "timeout";
  result?: string;
  error?: string;
  executionMs?: number;
  toolCalls?: ToolCall[];
  cronExpr?: string;
  executionId?: number;
  appUrl?: string;
}

const statusConfig = {
  success: { label: "完了", color: "#16a34a", bg: "#f0fdf4", icon: "\u2705" },
  failure: { label: "失敗", color: "#dc2626", bg: "#fef2f2", icon: "\u274c" },
  timeout: { label: "タイムアウト", color: "#d97706", bg: "#fffbeb", icon: "\u23f0" },
};

export function TaskResultEmail({
  taskName,
  status,
  result,
  error,
  executionMs,
  toolCalls = [],
  executionId,
  appUrl,
}: TaskResultEmailProps) {
  const cfg = statusConfig[status];
  const durationStr = executionMs
    ? executionMs >= 60000
      ? `${(executionMs / 60000).toFixed(1)}分`
      : `${(executionMs / 1000).toFixed(1)}秒`
    : "N/A";

  return (
    <Html>
      <Head>
        <title>{taskName} - {cfg.label}</title>
      </Head>
      <Body style={body}>
        <Container style={container}>
          {/* Logo + App Name */}
          <Section style={logoSection}>
            <Row>
              <Column style={{ textAlign: "center" as const }}>
                <Img
                  src={`${appUrl}/icon.png`}
                  width="32"
                  height="32"
                  alt="Stella"
                  style={{ ...logoImg, display: "inline-block", verticalAlign: "middle" }}
                />
                <Text style={appName}>Stella</Text>
              </Column>
            </Row>
          </Section>

          {/* Header — task name as title */}
          <Section style={{ ...statusBanner, backgroundColor: cfg.bg }}>
            <Text style={{ fontSize: "28px", margin: "0", lineHeight: "1" }}>
              {cfg.icon}
            </Text>
            <Heading
              as="h1"
              style={{ ...heading, margin: "8px 0 0" }}
            >
              {taskName}
            </Heading>
            <Text style={{ ...meta, color: cfg.color, fontWeight: "600", margin: "4px 0 0" }}>
              {cfg.label}
              {executionId ? ` · #${executionId}` : ""}
              {` · ${durationStr}`}
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Result */}
          {status === "success" && result && (
            <Section style={section}>
              <Section style={resultBox}>
                <Markdown
                  markdownCustomStyles={{
                    p: { fontSize: "14px", color: "#1e293b", lineHeight: "1.7", margin: "0 0 8px" },
                    bold: { fontWeight: "700" },
                    li: { fontSize: "14px", color: "#1e293b", lineHeight: "1.7" },
                    h1: { fontSize: "18px", fontWeight: "700", margin: "0 0 8px" },
                    h2: { fontSize: "16px", fontWeight: "700", margin: "0 0 8px" },
                    h3: { fontSize: "15px", fontWeight: "600", margin: "0 0 6px" },
                    codeInline: { fontSize: "13px", backgroundColor: "#f1f5f9", padding: "1px 4px", borderRadius: "3px" },
                  }}
                >
                  {result.slice(0, 3000) + (result.length > 3000 ? "\n\n... (省略)" : "")}
                </Markdown>
              </Section>
            </Section>
          )}

          {/* Error */}
          {status !== "success" && error && (
            <Section style={section}>
              <Section style={errorBox}>
                <Text style={errorText}>{error.slice(0, 2000)}</Text>
              </Section>
            </Section>
          )}

          {/* Tool Calls — compact */}
          {toolCalls.length > 0 && (
            <>
              <Hr style={divider} />
              <Section style={section}>
                <Text style={sectionTitle}>
                  使用ツール ({toolCalls.length})
                </Text>
                {toolCalls.map((tc, i) => (
                  <Section key={i} style={toolCallCard}>
                    <Text style={toolName}>{tc.tool}</Text>
                    {tc.result_summary && (
                      <Text style={toolResult}>
                        {tc.result_summary.slice(0, 150)}
                      </Text>
                    )}
                  </Section>
                ))}
              </Section>
            </>
          )}

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              FG タスクワーカー &middot;{" "}
              {appUrl?.replace(/^https?:\/\//, "") ?? ""}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ============================================================
// Styles
// ============================================================

const body: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: "0",
  padding: "40px 0",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  maxWidth: "600px",
  margin: "0 auto",
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const logoSection: React.CSSProperties = {
  padding: "20px 24px 8px",
  textAlign: "center" as const,
};

const logoImg: React.CSSProperties = {
  borderRadius: "8px",
};

const appName: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "middle",
  fontSize: "16px",
  fontWeight: "700",
  color: "#18181b",
  margin: "0 0 0 8px",
  letterSpacing: "-0.02em",
};

const statusBanner: React.CSSProperties = {
  padding: "24px",
  textAlign: "center" as const,
};

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "700",
  color: "#18181b",
  letterSpacing: "-0.02em",
};

const meta: React.CSSProperties = {
  fontSize: "13px",
  color: "#71717a",
  margin: "2px 0",
};

const section: React.CSSProperties = {
  padding: "16px 24px",
};

const divider: React.CSSProperties = {
  borderColor: "#e4e4e7",
  margin: "0",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "600",
  color: "#a1a1aa",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 8px",
};

const toolCallCard: React.CSSProperties = {
  backgroundColor: "#fafafa",
  borderRadius: "8px",
  padding: "10px 12px",
  marginBottom: "6px",
  border: "1px solid #e4e4e7",
};

const toolName: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: "600",
  color: "#18181b",
  margin: "0",
  fontFamily: "monospace",
};

const toolResult: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  margin: "4px 0 0",
  lineHeight: "1.4",
  wordBreak: "break-word" as const,
};

const resultBox: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "16px",
  border: "1px solid #e2e8f0",
};

const resultText: React.CSSProperties = {
  fontSize: "14px",
  color: "#1e293b",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  lineHeight: "1.7",
};

const errorBox: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "16px",
  border: "1px solid #fecaca",
};

const errorText: React.CSSProperties = {
  fontSize: "13px",
  color: "#991b1b",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  fontFamily: "monospace",
  lineHeight: "1.6",
};

const footer: React.CSSProperties = {
  padding: "16px 24px",
  textAlign: "center" as const,
};

const footerText: React.CSSProperties = {
  fontSize: "12px",
  color: "#a1a1aa",
  margin: "0",
};
