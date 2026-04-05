# Skills ファイルシステム化 + Chat Files 関連 — 記録

**日付**: 2026-04-05
**ブランチ**: `main`

---

## 1. 背景

### Skills の課題
- skills テーブルの `content` TEXT 列に全コンテンツを拍平化して保存（ZIP の参照ファイル構造が消失）
- agentskills.io 業界標準（SKILL.md + ディレクトリ構造 + progressive disclosure）に準拠していなかった
- バイナリファイル（画像等）を含む skill パッケージに対応不可

### Chat Files の課題
- `chat_files` テーブルに `message_id` が無く、AI 生成ファイルを特定メッセージに関連付け不可
- メッセージ底部にファイルカード（Claude Web スタイル）を表示する仕組みが無かった

---

## 2. 変更内容

### Part A: Skills ファイルシステム化

**アーキテクチャ変更:**
- DB `skills` テーブルに `content_dir` 列追加（ディスクパスへの参照）
- コンテンツをディスク `data/skills/{id}/` に保存（SKILL.md + 参照ファイル）
- `loadSkill` tool が `skillDirectory` を返却 → agent が `readFile` で参照ファイルを按需読込（progressive disclosure L3）

**内置 Skills 機構:**
- `built-in-skills/` ディレクトリにソースコード同梱の skill を配置
- 起動時に `syncBuiltInSkills()` が DB + ディスクに自動同步（幂等）
- `source_type = "built-in"` で識別、ユーザーが禁用可能
- 初期内置: `frontend-design`（anthropics/skills）、`html-slides`

**新規ファイル:**
| ファイル | 内容 |
|---------|------|
| `lib/skill-storage.ts` | ディスク読み書き層（save/read/update/delete） |
| `lib/built-in-skills.ts` | 起動時内置スキル自動同步 |
| `built-in-skills/frontend-design/SKILL.md` | プロダクション品質フロントエンド設計 |
| `built-in-skills/html-slides/` | HTML プレゼンテーション（SKILL.md + 5 参照ファイル） |
| `scripts/migrate-skills-to-disk.ts` | 旧データ移行スクリプト |

**変更ファイル:**
| ファイル | 変更 |
|---------|------|
| `lib/skills-db.ts` | `content_dir` 列、`createSkillWithFiles()`、ディスク優先読取、`DELETE RETURNING` |
| `lib/skill-zip-parser.ts` | `body` + `refs[]` 構造化返却、`IGNORED_DIRS` 縮小、`TEXT_EXTENSIONS` 拡張 |
| `app/api/skills/*.ts` | 5 ルート全てディスク書込に対応 |
| `app/api/chat/route.ts` | `loadSkill` が `skillDirectory` 返却 |
| `task-worker/src/lib/skills-db.ts` | ディスク読取 + `getSkillDirectory()` |
| `task-worker/src/lib/tools.ts` | `loadSkill` が `skillDirectory` 返却 |
| `instrumentation.node.ts` | 起動時 `syncBuiltInSkills()` 呼出 |
| `docker-compose.yml` | `skills-data` volume（rag-ui: rw, task-worker: ro） |
| `Dockerfile` | `mkdir /app/data/skills` + `COPY built-in-skills` |

### Part B: Chat Files メッセージ関連付け

**変更ファイル:**
| ファイル | 変更 |
|---------|------|
| `lib/chat-files-db.ts` | `message_id` 列、`getFilesByMessageId()`、`updateFilesMessageId()` |
| `app/api/chat/route.ts` | `generatedFileIds` 収集、`onFinish` でメッセージに関連付け |
| `components/chat-message.tsx` | `FileCard` コンポーネント + `MessageFile` 型 + `files` prop |

**注意**: `FileCard` は UI コンポーネントとして実装済みだが、`chat-page.tsx` からデータを渡す部分は未接続。`executeCode` tool をチャットに追加した際に接続予定。

---

## 3. Docker Volume 構成

```yaml
volumes:
  skills-data:        # 新規追加

rag-ui:
  volumes:
    - skills-data:/app/data/skills      # read-write
task-worker:
  volumes:
    - skills-data:/app/data/skills:ro   # read-only
```

---

## 4. テスト結果

| テスト | 結果 |
|--------|------|
| 手動 skill 作成 → ディスク保存 | ✅ |
| ZIP アップロード → ファイル構造保持 | ✅ |
| skill 削除 → ディスク + DB 両方クリーン | ✅ |
| `loadSkill` → `skillDirectory` 返却 | ✅ |
| 内置 skills 自動同步（起動時） | ✅ |
| html-slides skill でプレゼン生成 | ✅ |
| task-worker 共有 volume 読取 | ✅ |
| `chat_files.message_id` 関連付け | ✅（generateImage） |

---

## 5. 関連ファイル

| ファイル | 内容 |
|---------|------|
| `lib/skill-storage.ts` | ディスク I/O（agentskills.io 準拠） |
| `lib/built-in-skills.ts` | 起動時自動同步 |
| `lib/skills-db.ts` | DB CRUD + `createSkillWithFiles` |
| `lib/skill-zip-parser.ts` | ZIP 解析（構造化返却） |
| `lib/chat-files-db.ts` | chat_files CRUD + message_id |
| `components/chat-message.tsx` | FileCard コンポーネント |
| `built-in-skills/` | 内置 skill ソース |
| `scripts/migrate-skills-to-disk.ts` | 旧データ移行 |
