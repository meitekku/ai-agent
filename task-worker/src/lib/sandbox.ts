import { ConnectionConfig, Sandbox } from "@alibaba-group/opensandbox";

const OPENSANDBOX_URL = process.env.OPENSANDBOX_URL || "opensandbox:8080";

const config = new ConnectionConfig({
  domain: OPENSANDBOX_URL,
  requestTimeoutSeconds: 120,
});

export async function executeCode(
  language: string,
  code: string,
  timeoutSeconds = 60,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const image = language === "python" ? "python:3.12-slim" : "node:22-slim";
  const sandbox = await Sandbox.create({
    connectionConfig: config,
    image,
    timeoutSeconds,
  });

  try {
    const filename = language === "python" ? "script.py" : "script.js";
    const cmd =
      language === "python" ? `python ${filename}` : `node ${filename}`;

    await sandbox.files.write(filename, code);
    const result = await sandbox.commands.run(cmd);

    return {
      exitCode: result.exitCode ?? 1,
      stdout: (result.logs?.stdout?.map((l: any) => l.text).join("") || "").slice(0, 10000),
      stderr: (result.logs?.stderr?.map((l: any) => l.text).join("") || "").slice(0, 5000),
    };
  } finally {
    await sandbox.close();
  }
}
