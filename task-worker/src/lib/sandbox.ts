import { ConnectionConfig, Sandbox } from "@alibaba-group/opensandbox";
import { guessMimeType } from "./mime";

const OPENSANDBOX_URL = process.env.OPENSANDBOX_URL || "opensandbox:8080";
const RAG_UI_URL = process.env.RAG_UI_URL || "http://rag-ui:3000";

const config = new ConnectionConfig({
  domain: OPENSANDBOX_URL,
  requestTimeoutSeconds: 120,
  useServerProxy: true,
});

export interface CodeResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  files?: UploadedFile[];
}

export interface UploadedFile {
  filename: string;
  fileId: string;
  size: number;
  url: string;
}

export async function executeCode(
  language: string,
  code: string,
  executionId: number,
  timeoutSeconds = 120,
): Promise<CodeResult> {
  const usePythonImage = language === "python" || language === "bash" || language === "shell";
  const image = usePythonImage
    ? (process.env.SANDBOX_PYTHON_IMAGE || "sandbox-python:latest")
    : (process.env.SANDBOX_NODE_IMAGE || "node:26-slim");
  const sandbox = await Sandbox.create({
    connectionConfig: config,
    image,
    timeoutSeconds,
  });

  try {
    // Ensure /output directory exists
    await sandbox.commands.run("mkdir -p /output");

    let filename: string;
    let cmd: string;
    if (language === "bash" || language === "shell") {
      // Wrap each line with rtk for token-efficient output
      filename = "script.sh";
      cmd = `bash ${filename}`;
    } else if (language === "python") {
      filename = "script.py";
      cmd = `python ${filename}`;
    } else if (language === "typescript") {
      filename = "script.ts";
      cmd = `node ${filename}`;
    } else {
      filename = "script.js";
      cmd = `node ${filename}`;
    }

    // For bash scripts on sandbox-python image, add rtk to PATH aliases
    // so common commands (ls, find, grep, git, curl, etc.) auto-compress output
    if ((language === "bash" || language === "shell") && usePythonImage) {
      const rtkInit = [
        "# RTK wrappers for token-efficient output",
        "if command -v rtk &>/dev/null; then",
        "  for _c in ls find grep cat head tail wc du df ps tree curl wget git pip uv; do",
        '    eval "$_c() { rtk $_c \\"\\$@\\"; }"',
        "  done",
        "  unset _c",
        "fi",
      ].join("\n");
      code = rtkInit + "\n\n" + code;
    }

    await sandbox.files.writeFiles([{ path: filename, data: code }]);
    const result = await sandbox.commands.run(cmd);

    const stdout = (result.logs?.stdout?.map((l: any) => l.text).join("") || "");
    const stderr = (result.logs?.stderr?.map((l: any) => l.text).join("") || "");

    // Collect files from /output/
    const uploadedFiles = await extractOutputFiles(sandbox, executionId);

    return {
      exitCode: result.exitCode ?? 1,
      stdout,
      stderr,
      files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
    };
  } finally {
    await sandbox.close();
  }
}

async function extractOutputFiles(
  sandbox: Sandbox,
  executionId: number,
): Promise<UploadedFile[]> {
  try {
    // List files in /output
    const lsResult = await sandbox.commands.run(
      "find /output -maxdepth 1 -type f -printf '%f\\n' 2>/dev/null || true",
    );
    const names = (lsResult.logs?.stdout?.map((l: any) => l.text).join("") || "")
      .split("\n")
      .map((n: string) => n.trim())
      .filter(Boolean);

    if (names.length === 0) return [];

    const uploaded: UploadedFile[] = [];

    for (const name of names) {
      try {
        const mediaType = guessMimeType(name);
        // readBytesStream returns AsyncIterable<Uint8Array>.
        // Bun's ReadableStream.from() accepts AsyncIterable but TS types omit the static method.
        const stream = sandbox.files.readBytesStream(`/output/${name}`);
        const fromStream = (ReadableStream as unknown as { from(i: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> }).from;
        const readable = fromStream(stream);

        const res = await fetch(`${RAG_UI_URL}/api/task-files`, {
          method: "POST",
          headers: {
            "x-filename": encodeURIComponent(name),
            "x-media-type": mediaType,
            "x-execution-id": String(executionId),
            "content-type": mediaType,
          },
          body: readable,
          // @ts-ignore — duplex required for streaming request body in Node.js/Bun
          duplex: "half",
        });

        if (res.ok) {
          const data = await res.json();
          uploaded.push({
            filename: data.filename || name,
            fileId: data.fileId,
            size: data.size,
            url: data.url,
          });
          console.log(`[sandbox] Streamed /output/${name} → fileId=${data.fileId} (${data.size} bytes)`);
        } else {
          console.error(`[sandbox] Upload failed for /output/${name}: ${res.status}`);
        }
      } catch (err) {
        console.error(`[sandbox] Failed to extract /output/${name}:`, err);
      }
    }

    return uploaded;
  } catch {
    return [];
  }
}
