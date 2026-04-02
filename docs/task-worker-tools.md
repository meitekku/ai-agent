# task-worker AI ツール一覧

| ツール                | 説明                                                                                                 | 使用条件                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `searchKnowledgeBase` | 内部ナレッジベース（RAG）検索。`kbSlug` 未指定時は KB 一覧を自動取得して AI が選択（auto-discovery） | 社内文書・マニュアル等の内部情報が必要な時                                                               |
| `webSearch`           | Tavily ウェブ検索                                                                                    | 最新ニュース・株価・公開情報が必要な時（`TAVILY_API_KEY` 必須）                                          |
| `readUrl`             | URL のテキスト抽出                                                                                   | webSearch で見つけた URL の詳細を読む時                                                                  |
| `google_search`       | Gemini 組み込み Google Search grounding                                                              | `TAVILY_API_KEY` 未設定 かつ AI Studio 使用時に自動追加（implicit、フィルター不可）                      |
| `crmApi`              | CRM サービス API 呼出（Salesforce/Kintone/分析/提案書）                                              | 商談データ・CRM 操作が必要な時。SF と Kintone は混ぜない                                                 |
| `executeCode`         | Python/JS コード実行（OpenSandbox）                                                                  | 計算・データ処理・可視化・ファイル変換・ML 等                                                            |
| `createFile`          | テキストファイル保存（CSV, JSON, MD 等）                                                             | レポート・データエクスポート等、ユーザーがダウンロードする成果物                                         |
| `generateImage`       | Gemini 画像生成（`gemini-3.1-flash-image-preview`、Vertex AI / AI Studio 両対応）                    | 画像・イラスト・図の生成が必要な時                                                                       |
| `sendEmail`           | メール送信（Resend + Markdown テンプレート）                                                         | ユーザーが明示的にメール送信を指示した時のみ                                                             |
| `analyzeImage`        | Gemini Vision で画像分析（OCR、チャート読取、オブジェクト識別）                                      | 画像 URL または fileId を指定。視覚的コンテンツの理解が必要な時                                          |
| `readFile`            | 以前の createFile/executeCode/generateImage 結果ファイルの読み取り                                   | 前ステップの出力を確認・再利用する時                                                                     |
| `httpRequest`         | 任意の外部 REST API 呼出（GET/POST/PUT/PATCH/DELETE）                                                | 天気・為替・株価・Webhook 等、他ツールでカバーされない外部 API                                           |
| `queryDatabase`       | PostgreSQL READ ONLY SQL クエリ（10s タイムアウト）                                                  | データ集計・統計・フィルタリング・レポート作成                                                           |
| `editFile`            | 既存ファイルのテキスト編集（replace/append/prepend/insertAfter）                                     | CSV に行追加、JSON 更新、テキスト修正等                                                                  |
| `listFiles`           | 現在/過去の実行のファイル一覧取得                                                                    | ファイル探索、grepFiles 前の確認                                                                         |
| `grepFiles`           | テキストファイル横断正規表現検索                                                                     | 複数ファイル内のキーワード検索                                                                           |
| `loadSkill`           | DB のスキル一覧から指定スキルの全文を読み込む                                                        | スキルが有効化されている時に implicit 追加（フィルター不可）。タスクに関連するスキルがあれば自動で呼出す |

## sandbox-python イメージ

`opensandbox/Dockerfile.sandbox-python` で構築。executeCode から利用。

**CLI ツール**: ffmpeg, imagemagick, graphviz, gnuplot, pandoc, weasyprint, curl, wget, httpie, jq, xmlstarlet, csvkit, miller, ripgrep, sqlite3, yt-dlp, gallery-dl, git, zip, bc, tree

**Python パッケージ**: numpy, scipy, pandas, matplotlib, seaborn, plotly, scikit-learn, openpyxl, xlsxwriter, requests, beautifulsoup4, lxml, feedparser, yfinance, tabulate, Pillow, pydantic, python-docx, reportlab, sympy

## /output/ 自動アップロード

sandbox 内で `/output/` ディレクトリに保存されたファイルは、コード実行完了後に自動的に `sandbox.files.readBytes()` → multipart/form-data で `POST /api/task-files` にアップロードされる。base64 変換なし、バイナリ直送。動画・画像・PDF 等の大容量バイナリファイルに対応。アップロードされたファイルは実行結果詳細画面でダウンロード可能。
