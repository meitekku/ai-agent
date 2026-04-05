# rag-deploy — RAG 一体化 Docker 部署

Gemini-only の自己完結型 Docker Compose プロジェクト。rag-ui（Next.js フロントエンド）と lightrag-service（Python バックエンド）を PostgreSQL + Valkey と共にパッケージ化。GPU 不要、`GEMINI_API_KEY` のみで任意のマシンにデプロイ可能。

## 詳細ドキュメント

必要に応じて参照:

- [プロジェクト構造](docs/project-structure.md) — 全サービスのファイルツリー
- [環境変数](docs/env-vars.md) — docker-compose + .env 設定一覧
- [task-worker AI ツール](docs/task-worker-tools.md) — AI ツール一覧 + sandbox + /output/
- [Vertex AI / AI Studio](docs/vertex-ai.md) — デュアルモード切替・制約事項
- [踩坑記録 + トラブルシューティング](docs/gotchas.md) — 既知の問題と対処法

## アーキテクチャ

```
docker-compose.yml
├── rag-ui        (Next.js standalone, Bun)     → port 4002:3000
├── crm-service   (Bun + Hono)                  → port 8009 (internal)
├── task-worker   (Bun + Hono)                  → port 8010 (internal)
├── opensandbox   (Python FastAPI)              → port 8080 (internal)
├── lightrag      (Python FastAPI, uv)          → port 8007 (internal)
├── postgres      (pgvector/pgvector:pg18)      → port 5432 (internal)
└── valkey        (valkey/valkey:8)             → port 6379 (internal)
```

外部公開ポートは **4002 のみ**。内部サービス（postgres/valkey/lightrag/crm-service/task-worker/opensandbox）はホストに公開しない。

## デプロイ環境

### 本番（EC2） — AI博覧会デモ用

| 項目       | 値                                                         |
| ---------- | ---------------------------------------------------------- |
| URL        | https://ai.agent.kakiage-kun.jp                            |
| Instance   | `i-0789466d74768eaf9` t4g.medium (ARM64, 2C/4GB, 30GB gp3) |
| Elastic IP | `35.74.76.156`                                             |
| Region     | ap-northeast-1                                             |
| Nginx      | 80/443 → localhost:4002, Let's Encrypt SSL (auto-renew)    |
| 定時開閉   | EventBridge Scheduler: 08:00 JST start / 22:00 JST stop    |
| SSH        | `ssh -i ~/.ssh/rag-deploy-key.pem ec2-user@35.74.76.156`   |

### 開発（Orange Pi） — 社内常駐

| 項目 | 値                       |
| ---- | ------------------------ |
| SSH  | `ssh zwg@100.106.83.107` |
| Dir  | `~/rag-deploy`           |

## CI/CD — GitHub Actions (Self-hosted Mac Runner)

2 つのリポジトリが同じ Mac 上の別々の runner でビルドし、異なるターゲットにデプロイ:

| リポジトリ                 | remote   | Runner                 | デプロイ先 |
| -------------------------- | -------- | ---------------------- | ---------- |
| `wgzhaocv/rag-deploy`      | `origin` | `~/actions-runner`     | Orange Pi  |
| `FGjp-techdes/ai-agent-v2` | `fg`     | `~/actions-runner-ec2` | EC2        |

Mac (ARM64) でビルド → `docker save` + `scp` → ターゲットで `docker load` + `up -d`。
`github.repository` で分岐し、同一 `deploy.yml` で両方のフローを定義。

## コマンド

```bash
# ── ローカル ──
docker compose --profile prod up -d --build    # ビルド+起動
docker compose --profile prod ps
docker compose --profile prod logs -f lightrag
docker compose --profile prod down
docker compose --profile prod down -v          # データ含め完全削除
docker compose --profile prod build --no-cache # 強制再ビルド

# ── EC2 操作（AWS CLI） ──
aws ec2 start-instances --region ap-northeast-1 --instance-ids i-0789466d74768eaf9   # 開機
aws ec2 stop-instances --region ap-northeast-1 --instance-ids i-0789466d74768eaf9    # 関機
aws ec2 reboot-instances --region ap-northeast-1 --instance-ids i-0789466d74768eaf9  # 再起動
aws ec2 terminate-instances --region ap-northeast-1 --instance-ids i-0789466d74768eaf9 # 削除

# ── EC2 SSH ──
ssh -i ~/.ssh/rag-deploy-key.pem ec2-user@35.74.76.156
# EC2 上で: cd ~/rag-deploy && docker compose --profile prod ps

# ── デプロイ ──
git push fg main      # → EC2 へ自動デプロイ
git push origin main   # → Orange Pi へ自動デプロイ
```

## データ永続化

| Volume          | マウント先               | 内容                                               |
| --------------- | ------------------------ | -------------------------------------------------- |
| `pgdata`        | /var/lib/postgresql/data | PostgreSQL（ベクトル、KV、ドキュメント、スライド） |
| `valkeydata`    | /data                    | Valkey キャッシュ                                  |
| `lightrag-data` | /app/data                | NetworkX グラフファイル                            |
| `chat-files`    | /app/data/chat-files     | チャット添付ファイル（画像・PDF 等）               |
| `skills-data`   | /app/data/skills         | スキルファイル（SKILL.md + 参照ファイル）          |

## リソース使用量

7 コンテナ合計約 **550 MB**（アイドル時）:

| コンテナ    | メモリ  |
| ----------- | ------- |
| lightrag    | ~254 MB |
| rag-ui      | ~109 MB |
| crm-service | ~40 MB  |
| postgres    | ~37 MB  |
| task-worker | ~40 MB  |
| opensandbox | ~50 MB  |
| valkey      | ~10 MB  |

## ビルド時の注意

- **rag-ui Dockerfile**: `ARG GEMINI_API_KEY=enabled`（ダミー値）を build 時に渡す。`next.config.ts` の `NEXT_PUBLIC_LLM_BACKEND` は build 時に評価されるため、ダミー値で "Gemini" に確定させる。実際の API Key は runtime の `environment` で注入。
- **init.sql**: `CREATE EXTENSION vector` のみ。アプリケーションテーブル（ingest*jobs, lightrag*\*, skills, chat_conversations, chat_messages, chat_files, artifacts, artifact_versions, scheduled_tasks, task_executions, task_notifications, ui_config）は各サービス起動時に自動作成。
- **Embedding 768 次元**: Gemini gemini-embedding-001 は Matryoshka 対応でデフォルト 3072 → 768 に縮小。全新規デプロイのため互換性問題なし。

## スキルシステム（agentskills.io 準拠）

[agentskills.io](https://agentskills.io/specification) 標準に準拠したファイルベースのスキル管理。DB はメタデータのみ、コンテンツはディスクに保存。

### ストレージ

```
data/skills/{skillId}/
  SKILL.md              <- frontmatter(name+description) + 指示本文
  template.html         <- 参照ファイル（ZIP アップロード時の元構造を保持）
  scripts/              <- 実行スクリプト（任意）
```

- **DB**: `skills` テーブル（id, name, description, enabled, source_type, content_dir, registry_id）
- **ディスク**: `skills-data` Docker volume → `/app/data/skills`（task-worker は `:ro` マウント）
- **content_dir**: DB 列。スキル ID 文字列（例: `"42"`）。NULL の場合は旧データとして DB `content` 列にフォールバック

### Progressive Disclosure（3 段階読み込み）

| レベル | 内容 | タイミング |
|--------|------|-----------|
| L1 | name + description | 常時 system prompt に注入（~100 tokens/skill） |
| L2 | SKILL.md 本文 | `loadSkill` ツール呼出時 |
| L3 | 参照ファイル | agent が `readFile` ツールで必要時に読み込み |

### `loadSkill` ツール

```typescript
// 戻り値（cookbook 標準）:
{
  name: "skill-name",
  content: "SKILL.md body (frontmatter 除去)",
  skillDirectory: "/app/data/skills/42"  // agent が readFile で参照ファイルを読める
}
```

### スキルソース

| ソース | source_type | 動作 |
|--------|-------------|------|
| 手動作成 | `manual` | UI から name + content 入力 |
| ZIP アップロード | `zip` | SKILL.md + 参照ファイルをディレクトリ構造ごと保存 |
| skills.sh レジストリ | `registry` | GitHub から SKILL.md 取得、`registry_id` で自動更新対応 |

### マイグレーション

旧データ（`content_dir` が NULL）を磁盘に移行:
```bash
docker exec rag-ui bun run scripts/migrate-skills-to-disk.ts
```

## チャットファイル関連

- `chat_files` テーブルに `message_id` 列追加。AI 回复で生成されたファイル（画像等）を特定のメッセージに関連付け
- `onFinish` コールバックで `updateFilesMessageId()` を呼び、生成ファイルを assistant メッセージにリンク
- `FileCard` コンポーネント（`chat-message.tsx`）: メッセージ底部にファイルカード表示（Claude Web スタイル）
