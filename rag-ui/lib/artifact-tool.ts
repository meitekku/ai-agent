import { tool } from "ai";
import type { UIMessageStreamWriter } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  createArtifact,
  createArtifactVersion,
  getArtifact,
  getCurrentContent,
  updateArtifactMeta,
} from "./artifact-db";

export function createArtifactTool({
  writer,
  conversationId,
}: {
  writer: UIMessageStreamWriter;
  conversationId: string;
}) {
  return tool({
    description: `コンテンツ（HTML、コード、テキスト等）をサイドパネルに作成・更新するツール。
長文・構造化コンテンツはこのツールで右パネルに表示する。短いインライン表示には show-widget を使い分けること。
- create: 新規作成。完全なコンテンツを content に書く
- update: 部分修正。oldStr → newStr のテキスト置換（小さな変更に使う）
- rewrite: 全体書き換え。content に新しい完全なコンテンツを書く（大きな変更に使う）`,
    inputSchema: z.object({
      command: z.enum(["create", "update", "rewrite"]).describe("操作タイプ"),
      id: z
        .string()
        .optional()
        .describe("update/rewrite 時の既存 artifact ID"),
      title: z
        .string()
        .optional()
        .describe("create 時のタイトル（update/rewrite で変更も可）"),
      kind: z
        .enum(["html", "code", "text", "markdown"])
        .optional()
        .describe("コンテンツ種別（create 時に指定、デフォルト html）。markdown: 見出し・リスト・表などの構造化テキスト"),
      content: z
        .string()
        .optional()
        .describe("create/rewrite 時の完全なコンテンツ"),
      oldStr: z
        .string()
        .optional()
        .describe("update 時の置換前テキスト（現在のコンテンツ内に一致する必要がある）"),
      newStr: z
        .string()
        .optional()
        .describe("update 時の置換後テキスト"),
      language: z
        .string()
        .optional()
        .describe("code kind の場合のプログラミング言語（python, javascript, typescript, sql 等）"),
      description: z
        .string()
        .optional()
        .describe("この変更の簡潔な説明"),
    }),
    execute: async (args) => {
      switch (args.command) {
        case "create": {
          const id = nanoid(12);
          const kind = args.kind ?? "html";
          const title = args.title ?? "Untitled";
          const content = args.content ?? "";

          await createArtifact(id, conversationId, kind, title, content);

          writer.write({
            type: "data-artifact" as any,
            data: {
              event: "create",
              id,
              title,
              kind,
              content,
              version: 1,
              language: args.language ?? "",
            },
          });

          return {
            id,
            title,
            kind,
            version: 1,
            message: "Artifact created and displayed in the side panel.",
          };
        }

        case "update": {
          if (!args.id) return { error: "id is required for update" };
          if (!args.oldStr || args.newStr === undefined)
            return { error: "oldStr and newStr are required for update" };

          const artifact = await getArtifact(args.id);
          if (!artifact) return { error: "artifact not found" };

          const current = await getCurrentContent(args.id);
          if (!current) return { error: "no content found" };

          if (!current.includes(args.oldStr)) {
            return {
              error: `oldStr not found in current content. Make sure the string matches exactly.`,
            };
          }

          const newContent = current.replace(args.oldStr, args.newStr);
          const newVersion = artifact.currentVersion + 1;

          await Promise.all([
            createArtifactVersion(
              args.id,
              newVersion,
              newContent,
              "update",
              args.description ?? "",
            ),
            updateArtifactMeta(args.id, {
              currentVersion: newVersion,
              ...(args.title ? { title: args.title } : {}),
            }),
          ]);

          writer.write({
            type: "data-artifact" as any,
            data: {
              event: "update",
              id: args.id,
              title: args.title ?? artifact.title,
              kind: artifact.kind,
              content: newContent,
              version: newVersion,
            },
          });

          return {
            id: args.id,
            version: newVersion,
            message: "Artifact updated in the side panel.",
          };
        }

        case "rewrite": {
          if (!args.id) return { error: "id is required for rewrite" };
          if (!args.content)
            return { error: "content is required for rewrite" };

          const artifact = await getArtifact(args.id);
          if (!artifact) return { error: "artifact not found" };

          const newVersion = artifact.currentVersion + 1;

          await Promise.all([
            createArtifactVersion(
              args.id,
              newVersion,
              args.content,
              "rewrite",
              args.description ?? "",
            ),
            updateArtifactMeta(args.id, {
              currentVersion: newVersion,
              ...(args.title ? { title: args.title } : {}),
              ...(args.kind ? { kind: args.kind } : {}),
            }),
          ]);

          writer.write({
            type: "data-artifact" as any,
            data: {
              event: "rewrite",
              id: args.id,
              title: args.title ?? artifact.title,
              kind: args.kind ?? artifact.kind,
              content: args.content,
              version: newVersion,
            },
          });

          return {
            id: args.id,
            version: newVersion,
            message: "Artifact rewritten in the side panel.",
          };
        }

        default:
          return { error: `Unknown command: ${args.command}` };
      }
    },
  });
}
