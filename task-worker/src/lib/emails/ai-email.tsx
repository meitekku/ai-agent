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

interface AiEmailProps {
  subject: string;
  body: string; // Markdown
  appUrl?: string;
}

export function AiEmail({
  subject,
  body,
  appUrl,
}: AiEmailProps) {
  return (
    <Html>
      <Head>
        <title>{subject}</title>
      </Head>
      <Body style={bodyStyle}>
        <Container style={container}>
          {/* Logo + App Name */}
          <Section style={logoSection}>
            <Row>
              <Column style={{ textAlign: "center" as const }}>
                <Img
                  src={`${appUrl}/icon.png`}
                  width="32"
                  height="32"
                  alt="FleGrowth Sales Assist"
                  style={{ ...logoImg, display: "inline-block", verticalAlign: "middle" }}
                />
                <Text style={appName}>FleGrowth Sales Assist</Text>
              </Column>
            </Row>
          </Section>

          {/* Subject heading */}
          <Section style={headerSection}>
            <Heading as="h1" style={heading}>
              {subject}
            </Heading>
          </Section>

          <Hr style={divider} />

          {/* Body — Markdown */}
          <Section style={contentSection}>
            <Section style={contentBox}>
              <Markdown
                markdownCustomStyles={{
                  p: { fontSize: "14px", color: "#1e293b", lineHeight: "1.7", margin: "0 0 8px" },
                  bold: { fontWeight: "700" },
                  li: { fontSize: "14px", color: "#1e293b", lineHeight: "1.7" },
                  h1: { fontSize: "18px", fontWeight: "700", margin: "16px 0 8px" },
                  h2: { fontSize: "16px", fontWeight: "700", margin: "14px 0 8px" },
                  h3: { fontSize: "15px", fontWeight: "600", margin: "12px 0 6px" },
                  codeInline: { fontSize: "13px", backgroundColor: "#f1f5f9", padding: "1px 4px", borderRadius: "3px" },
                  blockQuote: { borderLeft: "3px solid #e2e8f0", paddingLeft: "12px", margin: "8px 0", color: "#64748b" },
                }}
              >
                {body}
              </Markdown>
            </Section>
          </Section>

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              FleGrowth Sales Assist &middot;{" "}
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

const bodyStyle: React.CSSProperties = {
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

const headerSection: React.CSSProperties = {
  padding: "16px 24px 12px",
  textAlign: "center" as const,
};

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "700",
  color: "#18181b",
  letterSpacing: "-0.02em",
  margin: "0",
};

const divider: React.CSSProperties = {
  borderColor: "#e4e4e7",
  margin: "0",
};

const contentSection: React.CSSProperties = {
  padding: "16px 24px",
};

const contentBox: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "16px",
  border: "1px solid #e2e8f0",
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
