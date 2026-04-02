# Vertex AI / AI Studio デュアルモード

同じ Gemini モデルに対して 2 つの課金経路がある:

|                       | AI Studio                           | Vertex AI                      |
| --------------------- | ----------------------------------- | ------------------------------ |
| エンドポイント        | `generativelanguage.googleapis.com` | `aiplatform.googleapis.com`    |
| 認証                  | `GEMINI_API_KEY`                    | Service Account JSON           |
| GCP Free Trial credit | **使用不可**（明示的に除外）        | **使用可**                     |
| 設定                  | `GEMINI_API_KEY=xxx`                | `USE_VERTEX_AI=true` + SA JSON |

## 切替方法

`.env` に以下を設定するだけ:

```
USE_VERTEX_AI=true
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=global
GCP_SA_KEY_FILE=./your-sa-key.json
```

## Vertex AI 制約事項

- **GCP_LOCATION=global 必須**: Gemini 3.x preview モデルは `global` のみ対応（`asia-northeast1` 等では 404）
- **Google Search grounding**: Vertex AI モードでは `gemini.tools.googleSearch()` 非対応。ウェブ検索は Tavily（`TAVILY_API_KEY`）が必要
- **コード変更箇所**: `rag.py`, `ocr.py`, `ollama-provider.ts`, `embedding-client.ts`, `slide-provider.ts`, `crm-service/lib/gemini.ts`, `chat/route.ts`（providerOptions key 切替）
