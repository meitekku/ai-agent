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
} from "@react-email/components";

interface ToolCall {
  tool: string;
  args: Record<string, string>;
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
  success: { label: "Completed", color: "#16a34a", bg: "#f0fdf4", icon: "\u2705" },
  failure: { label: "Failed", color: "#dc2626", bg: "#fef2f2", icon: "\u274c" },
  timeout: { label: "Timed Out", color: "#d97706", bg: "#fffbeb", icon: "\u23f0" },
};

export function TaskResultEmail({
  taskName,
  status,
  result,
  error,
  executionMs,
  toolCalls = [],
  cronExpr,
  executionId,
  appUrl,
}: TaskResultEmailProps) {
  const cfg = statusConfig[status];
  const durationStr = executionMs
    ? executionMs >= 60000
      ? `${(executionMs / 60000).toFixed(1)}m`
      : `${(executionMs / 1000).toFixed(1)}s`
    : "N/A";

  return (
    <Html>
      <Head />
      <Body style={body}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Img
              src={`${appUrl || "https://ai.wgzhao.me"}/icon.png`}
              width="40"
              height="40"
              alt="FG"
              style={logoImg}
            />
          </Section>

          {/* Header */}
          <Section style={{ ...statusBanner, backgroundColor: cfg.bg }}>
            <Text style={{ ...statusIcon, fontSize: "32px", margin: "0" }}>
              {cfg.icon}
            </Text>
            <Heading
              as="h1"
              style={{ ...heading, color: cfg.color, margin: "8px 0 0" }}
            >
              Task {cfg.label}
            </Heading>
          </Section>

          {/* Task Info */}
          <Section style={section}>
            <Heading as="h2" style={subheading}>
              {taskName}
            </Heading>
            {cronExpr && (
              <Text style={meta}>Schedule: {cronExpr}</Text>
            )}
            {executionId && (
              <Text style={meta}>Execution ID: #{executionId}</Text>
            )}
          </Section>

          <Hr style={divider} />

          {/* Stats */}
          <Section style={section}>
            <Row>
              <Column style={statCol}>
                <Text style={statLabel}>Status</Text>
                <Text style={{ ...statValue, color: cfg.color }}>
                  {cfg.label}
                </Text>
              </Column>
              <Column style={statCol}>
                <Text style={statLabel}>Duration</Text>
                <Text style={statValue}>{durationStr}</Text>
              </Column>
              <Column style={statCol}>
                <Text style={statLabel}>Tool Calls</Text>
                <Text style={statValue}>{toolCalls.length}</Text>
              </Column>
            </Row>
          </Section>

          <Hr style={divider} />

          {/* Tool Calls */}
          {toolCalls.length > 0 && (
            <Section style={section}>
              <Heading as="h3" style={sectionTitle}>
                Tool Calls
              </Heading>
              {toolCalls.map((tc, i) => (
                <Section key={i} style={toolCallCard}>
                  <Row>
                    <Column>
                      <Text style={toolName}>{tc.tool}</Text>
                      <Text style={toolArgs}>
                        {JSON.stringify(tc.args).slice(0, 120)}
                      </Text>
                    </Column>
                    <Column style={{ width: "80px", textAlign: "right" as const }}>
                      <Text style={toolDuration}>{tc.duration_ms}ms</Text>
                    </Column>
                  </Row>
                  {tc.result_summary && (
                    <Text style={toolResult}>{tc.result_summary}</Text>
                  )}
                </Section>
              ))}
            </Section>
          )}

          {/* Result or Error */}
          {status === "success" && result && (
            <>
              <Hr style={divider} />
              <Section style={section}>
                <Heading as="h3" style={sectionTitle}>
                  Result
                </Heading>
                <Section style={resultBox}>
                  <Text style={resultText}>
                    {result.slice(0, 3000)}
                    {result.length > 3000 ? "\n\n... (truncated)" : ""}
                  </Text>
                </Section>
              </Section>
            </>
          )}

          {status !== "success" && error && (
            <>
              <Hr style={divider} />
              <Section style={section}>
                <Heading as="h3" style={{ ...sectionTitle, color: "#dc2626" }}>
                  Error
                </Heading>
                <Section style={errorBox}>
                  <Text style={errorText}>{error.slice(0, 2000)}</Text>
                </Section>
              </Section>
            </>
          )}

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              Sent by FG Task Worker &middot; {(appUrl || "https://ai.wgzhao.me").replace(/^https?:\/\//, "")}
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
  padding: "20px 24px 0",
  textAlign: "center" as const,
};

const logoImg: React.CSSProperties = {
  borderRadius: "8px",
};

const statusBanner: React.CSSProperties = {
  padding: "24px",
  textAlign: "center" as const,
};

const statusIcon: React.CSSProperties = {
  lineHeight: "1",
};

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "700",
  letterSpacing: "-0.02em",
};

const subheading: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#18181b",
  margin: "0 0 4px",
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

const statCol: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "8px",
};

const statLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  color: "#a1a1aa",
  margin: "0 0 4px",
};

const statValue: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "700",
  color: "#18181b",
  margin: "0",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#3f3f46",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 12px",
};

const toolCallCard: React.CSSProperties = {
  backgroundColor: "#fafafa",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "8px",
  border: "1px solid #e4e4e7",
};

const toolName: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#18181b",
  margin: "0",
  fontFamily: "monospace",
};

const toolArgs: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  margin: "2px 0 0",
  fontFamily: "monospace",
  wordBreak: "break-all" as const,
};

const toolDuration: React.CSSProperties = {
  fontSize: "12px",
  color: "#a1a1aa",
  margin: "0",
  fontFamily: "monospace",
};

const toolResult: React.CSSProperties = {
  fontSize: "12px",
  color: "#52525b",
  margin: "8px 0 0",
  padding: "8px",
  backgroundColor: "#ffffff",
  borderRadius: "4px",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
};

const resultBox: React.CSSProperties = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  padding: "16px",
  border: "1px solid #bbf7d0",
};

const resultText: React.CSSProperties = {
  fontSize: "13px",
  color: "#166534",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  lineHeight: "1.6",
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
