# Widget Generative UI 触发机制调查与改进方案

## 调查范围

| 对象 | 路径/来源 | 说明 |
|------|----------|------|
| **Claude Artifacts** | claude.ai (web) | Anthropic 官方 generative UI，泄露的 system prompt + 公开文档 |
| **CodePilot** | `/mnt/c/Users/wzhao/Downloads/CodePilot-main` | 参考实现，基于 Claude Agent SDK |
| **rag-deploy (当前)** | `/mnt/c/Users/wzhao/Documents/2026/rag-deploy/rag-ui` | 当前实现，基于 Gemini + Next.js |

---

## 一、Claude Artifacts 如何工作

### 1.1 触发判断

Claude 在每次生成前用隐藏的 `<antThinking>` 标签进行推理（前端会剥离不展示给用户），评估是否该创建 artifact：

**创建 artifact 的条件（全部满足）：**
- 内容 **>15行**，自己完结
- 用户可能想 **编辑、迭代、复用**
- 内容 **脱离对话上下文仍有意义**
- 最终会在 **对话之外使用**（报告、代码文件、演示等）

**不创建的条件：**
- 简短代码片段、数学公式、小例子
- 解释性/教学性内容
- 对已有 artifact 的评论/建议
- 纯对话性内容
- 不太可能被修改的一次性回答

**黄金法则：不确定时，默认不创建。不必要的 artifact 对用户体验是"jarring"（突兀的）。**

### 1.2 Artifact 类型系统

| 类型 | MIME | 说明 |
|------|------|------|
| Code | `application/vnd.ant.code` | 需要 `language` 属性，任意编程语言 |
| Markdown | `text/markdown` | 富文本文档 |
| HTML | `text/html` | 单文件 HTML/CSS/JS，CDN 限 cdnjs.cloudflare.com |
| SVG | `image/svg+xml` | 必须用 `viewBox` 不用 width/height |
| Mermaid | `application/vnd.ant.mermaid` | 流程图、时序图、ER 图等 |
| React | `application/vnd.ant.react` | 默认导出，Tailwind + shadcn/ui + recharts 等预装 |

### 1.3 渲染架构

- `<antArtifact>` XML 标签嵌在流式响应中，前端拦截
- iframe 托管在 `claudeusercontent.com`（独立源，与 claude.ai 隔离）
- `postMessage()` 通信
- DOMPurify 消毒 HTML
- React 组件用 React Runner 实时执行
- 严格 CSP 限制网络访问

### 1.4 编辑模式（2025 新增）

| 模式 | 场景 | 方式 |
|------|------|------|
| create | 新 artifact | 完整生成 |
| update | 小修改/bug fix | 字符串替换 (`old_str` → `new_str`)，~3-4x 更快 |
| rewrite | 大幅重构 | 完整重新生成 |

---

## 二、CodePilot 如何工作

### 2.1 两层 Progressive Disclosure

**Tier 1: 始终注入 (~150 tokens)**

文件: `src/lib/widget-guidelines.ts:17-41`

```xml
<widget-capability>
You can create interactive visualizations using the `show-widget` code fence.

## Format
```show-widget
{"title":"snake_case_id","widget_code":"<raw HTML/SVG string>"}
```

## Required rules (always apply)
1. widget_code is JSON string — escape quotes, newlines. No DOCTYPE/html/head/body
2. Transparent background — host provides bg
3. Each widget ≤ 3000 chars. Always close JSON + fence
4. Streaming order: SVG → <defs> first; HTML → <style> → content → <script> last
5. CDN allowlist: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh
6. CDN scripts: onload="initFn()" + if(window.Lib) initFn(); fallback
7. Text explanations go OUTSIDE the code fence
8. Multi-widget: interleave text, each widget in a SEPARATE fence
9. SVG: width="100%" viewBox="0 0 680 H", arrow marker in <defs>
10. Interactive controls MUST update visuals — call chart.update() after data changes
11. Clickable drill-down: onclick="window.__widgetSendMessage('...')"
</widget-capability>
```

**Tier 2: 按需加载 (~1500+ tokens)**

文件: `src/lib/claude-client.ts:519-539`

当检测到关键词时，通过 MCP 工具 `codepilot_load_widget_guidelines` 动态注入 5 个详细设计模块：

```
interactive — 交互控件设计（滑块、切换、下拉菜单、动画过渡）
chart       — 图表设计（Chart.js 最佳实践、颜色方案、响应式）
mockup      — 原型/模型设计（卡片布局、表单、仪表盘）
art         — 艺术/装饰性 SVG（几何图案、数据艺术）
diagram     — 流程图/架构图（节点-边布局、箭头、分组）
```

每个模块包含：设计哲学、颜色调色板、具体 HTML/SVG 代码模式。

### 2.2 关键词触发检测

文件: `src/lib/claude-client.ts:521`

```javascript
const widgetKeywords = /可视化|图表|流程图|时间线|架构图|对比|
  visualiz|diagram|chart|flowchart|timeline|infographic|
  interactive|widget|show-widget|hierarchy|dashboard/i;
```

触发条件（任一满足）：
1. 当前用户消息匹配关键词
2. 会话历史中已有 `show-widget` 输出（恢复上下文）
3. 系统提示含 widget 相关关键词

### 2.3 前端解析架构

**三阶段处理：**

| 阶段 | 函数 | 时机 |
|------|------|------|
| 流式部分解析 | `extractPartialWidget()` | fence 未关闭时，提取部分 widget_code |
| 完整解析 | `parseAllShowWidgets()` | fence 关闭后，正则匹配所有完整 fence |
| Key 稳定 | `computePartialWidgetKey()` | 确保流式→完成过渡时 React key 不变 |

**关键技巧：**
- 在 streamdown **外部**解析 widget（不依赖 streamdown 的 `isIncomplete`）
- `isStreaming` 通过检测 fence 关闭 ` ``` ` 自行判定
- 流式阶段截断未关闭的 `<script>` 标签（防止脚本源码显示为文本）
- `computePartialWidgetKey()` 保持 React key 稳定，防止 iframe 重挂载 → 高度塌陷 → 滚动跳动

### 2.4 iframe 渲染

**postMessage 协议：**

| 消息类型 | 方向 | 内容 |
|----------|------|------|
| `widget:ready` | iframe → parent | iframe 就绪 |
| `widget:update` | parent → iframe | 流式更新（sanitizeForStreaming，去除 script） |
| `widget:finalize` | parent → iframe | 最终内容（sanitizeForIframe，允许 script 执行） |
| `widget:resize` | iframe → parent | ResizeObserver 高度变化 |
| `widget:theme` | parent → iframe | MutationObserver 检测暗色模式切换 |
| `widget:link` | iframe → parent | 链接拦截，由 parent 用 `window.open` 打开 |

**安全模型（三层防御）：**
1. **流式预览**: `sanitizeForStreaming()` — 去除 `<script>`、`on*` 事件、`javascript:` URL
2. **最终内容**: `sanitizeForIframe()` — 仅去除 `<iframe>`/`<object>`/`<embed>` 等嵌套标签
3. **iframe sandbox**: `sandbox="allow-scripts"` + CSP (`connect-src 'none'` 阻断网络请求)

---

## 三、rag-deploy 当前实现

### 3.1 System Prompt 注入

文件: `rag-ui/app/api/chat/route.ts:1459-1460`

```typescript
// 无条件注入到所有请求
systemPrompt += "\n\n" + WIDGET_SYSTEM_PROMPT;
```

### 3.2 Widget Guidelines 内容

文件: `rag-ui/lib/widget-guidelines.ts`

当前包含：
- 格式规则（JSON fence 格式、CDN 白名单、流式顺序）
- 样式指南（Tailwind CSS 优先、暗色模式、CSS 变量）
- 使用场景列表（数据可视化、计算器、表单、流程图、游戏）
- Chart.js 模板（仅一个 bar chart）
- 颜色调色板（6 组）

### 3.3 前端实现

文件对应关系：

| rag-deploy | CodePilot | 状态 |
|------------|-----------|------|
| `lib/widget-parser.ts` | `MessageItem.tsx` + `StreamingMessage.tsx` | 一致 |
| `components/widget-renderer.tsx` | `WidgetRenderer.tsx` | 一致 |
| `lib/widget-sanitizer.ts` | `widget-sanitizer.ts` | 一致 |
| `lib/widget-css-bridge.ts` | `widget-css-bridge.ts` | 一致 |
| `components/ai-elements/message.tsx` | `MessageItem.tsx` | 一致 |
| `components/widget-shimmer.tsx` | `StreamingMessage.tsx` shimmer | 一致 |

**结论：前端解析/渲染/流式/安全全部正确复现了 CodePilot 的架构，没有问题。**

---

## 四、问题诊断

### 问题 1: 没有详细设计规范（生成质量低）

| | CodePilot | rag-deploy |
|--|-----------|------------|
| 格式规则 | 有（~150 tokens） | 有（~400 tokens） |
| 设计哲学 | 有（flat, warm minimal, seamless） | **无** |
| 交互模式 | 有（滑块、切换、动画过渡） | **无** |
| 图表规范 | 有（Chart.js CSP-safe 颜色、响应式） | 部分（仅 hex 颜色） |
| 原型/布局 | 有（卡片、表单、仪表盘模式） | **无** |
| 流程图规范 | 有（节点-边布局、箭头、分组） | **无** |
| SVG 艺术 | 有（几何图案、数据艺术） | **无** |

**影响**: 模型知道 widget 的输出格式，但不知道如何设计好看、有用的 widget。即使触发了，产出也千篇一律。

### 问题 2: 触发判断框架缺失（触发频率低）

当前 `widget-guidelines.ts:37-44` 只列举了使用场景，但缺少**决策规则**：

```
# 当前（弱）
"ユーザーが以下に該当するものを求めた場合"
→ 模型理解为：用户明确要求时才用

# 应该（强）
"回答中出现以下情况时，自动使用 show-widget 而非纯文本"
→ 3+ 数值 → chart
→ 2+ 项对比 → comparison card
→ 4+ 步骤 → flowchart/timeline
→ KPI/指标 → dashboard gauge
→ 层级/组织 → hierarchy diagram
```

### 问题 3: CRM 外无积极触发指示（覆盖范围窄）

`route.ts:233` 只在 `hasCrm` 条件内指示用 widget 显示 KPI：

```typescript
if (hasCrm) {
  // "KPI は show-widget を使って視覚的に表示"
}
```

一般聊天场景（数据分析、技术架构、比较评估等）完全没有触发指示。

### 问题 4: 模板不足（多样性低）

当前只有 **1 个模板**（Chart.js bar chart）。CodePilot 有 5 个设计模块各含多个模式。模型缺少「素材库」来参考，生成出来的都是 bar chart 或简单 SVG。

---

## 五、改进方案

### 约束条件

- Gemini 没有 MCP，无法像 CodePilot 那样按需加载详细 guidelines
- System prompt 已经很长，不能无限膨胀
- 目标：增量 ~800 tokens 以内

### 方案 A: 扩展 widget-guidelines.ts

在现有格式规则之后，追加：

**A1. 判断框架（~200 tokens）**

```markdown
### 自動判断ルール（回答内容に基づき自動判定）
以下の条件に該当する回答は、テキストではなく show-widget で視覚化すること：
- **数値 3 つ以上**: 棒グラフ / 円グラフ / レーダーチャートで比較
- **2 項目以上の比較**: サイドバイサイド比較カード
- **4 ステップ以上の手順**: フローチャート / タイムライン
- **KPI / 指標**: ゲージ / ダッシュボードカード
- **階層・組織構造**: ツリー / 階層図
- **割合・構成比**: 円グラフ / 積み上げバー
- **時系列データ**: 折れ線グラフ / エリアチャート
- **カテゴリ分類**: グリッドカード / タグクラウド

判断に迷ったら widget を使う — テキストで済む内容を widget にしても問題ないが、widget で見せるべき内容をテキストにするのは機会損失。
```

**A2. 設計原則（~150 tokens）**

```markdown
### デザイン原則
- **フラット**: グラデーション・影・ぼかし・グロー禁止。ソリッド塗りのみ
- **暖かいミニマル**: 角丸 (rounded-xl)、slate 系暖色ニュートラル、indigo アクセント
- **チャットに溶け込む**: 外部埋込感を出さない、ホストの UI と調和させる
- **モバイル対応**: width:100%、相対単位、横スクロール禁止
```

**A3. 追加テンプレート（~400 tokens）**

```markdown
### SVG フローチャート テンプレート
<svg width="100%" viewBox="0 0 600 200">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="var(--color-text-primary)"/></marker></defs>
  <rect x="10" y="70" width="120" height="60" rx="12" fill="#EEF2FF" stroke="#818CF8"/>
  <text x="70" y="105" text-anchor="middle" fill="var(--color-text-primary)" font-size="14">ステップ1</text>
  <line x1="130" y1="100" x2="200" y2="100" stroke="#818CF8" marker-end="url(#ah)"/>
  <!-- 後続ノードを追加 -->
</svg>

### 比較カード テンプレート
<div class="grid grid-cols-2 gap-4 p-4">
  <div class="rounded-xl border border-indigo-200 p-4">
    <div class="text-xs font-semibold text-indigo-600 mb-2">オプション A</div>
    <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">¥1,200</div>
    <div class="text-sm text-gray-500 mt-1">月額</div>
    <ul class="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">
      <li>✓ 機能 A</li><li>✓ 機能 B</li><li>✗ 機能 C</li>
    </ul>
  </div>
  <div class="rounded-xl border border-emerald-200 p-4">
    <div class="text-xs font-semibold text-emerald-600 mb-2">オプション B</div>
    <!-- 同様の構造 -->
  </div>
</div>

### ダッシュボード KPI テンプレート
<div class="grid grid-cols-3 gap-3 p-4">
  <div class="rounded-xl bg-indigo-50 dark:bg-indigo-950 p-4 text-center">
    <div class="text-3xl font-bold text-indigo-600">85%</div>
    <div class="text-xs text-gray-500 mt-1">受注確率</div>
  </div>
  <!-- 他の KPI カード -->
</div>

### タイムライン テンプレート
<div class="relative pl-8 space-y-6 p-4">
  <div class="absolute left-3 top-2 bottom-2 w-0.5 bg-indigo-200 dark:bg-indigo-800"></div>
  <div class="relative">
    <div class="absolute -left-5 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-gray-900"></div>
    <div class="text-xs text-indigo-600 font-semibold">2026-01</div>
    <div class="text-sm text-gray-900 dark:text-gray-100">イベント説明</div>
  </div>
  <!-- 後続イベント -->
</div>
```

### 方案 B: buildSystemPrompt 中追加通用 widget 指示

文件: `rag-ui/app/api/chat/route.ts`

在回答ルール部分（非 CRM 限定）追加：

```typescript
// 在 buildSystemPrompt 末尾、CRM 判定之外追加
prompt += `
- **データの視覚化**: 回答に数値比較・手順・構造データが含まれる場合、show-widget でインタラクティブに可視化する。テキストテーブルより widget を優先`;
```

### 方案 C: 不改动（仅参考）

CodePilot 的 `codepilot_load_widget_guidelines` MCP 工具在 Gemini 环境下无法使用。如果未来切回 Claude，可考虑实现完整的 progressive disclosure。

---

## 六、实施优先级

| 优先级 | 修改 | 文件 | 预期效果 |
|--------|------|------|----------|
| **P0** | 判断框架 (A1) | `lib/widget-guidelines.ts` | 触发频率大幅提升 |
| **P0** | 设计原则 (A2) | `lib/widget-guidelines.ts` | 生成质量提升 |
| **P1** | 追加模板 (A3) | `lib/widget-guidelines.ts` | 多样性提升 |
| **P1** | 通用 widget 指示 (B) | `app/api/chat/route.ts` | CRM 外覆盖 |
| **P2** | progressive disclosure（Claude 切换时） | 未来 | 长期优化 |

### Token 影响估算

| 项目 | 现状 tokens | 追加 tokens |
|------|------------|-------------|
| WIDGET_SYSTEM_PROMPT | ~400 | +750 (~1150 合计) |
| buildSystemPrompt widget 指示 | 0 | +50 |
| **合计** | ~400 | **+800** |

每个请求多 ~800 tokens 的 system prompt，对 Gemini 的影响可忽略（Gemini 3 Flash 的 input pricing 极低）。

---

## 七、参考资料

### Claude Artifacts
- [Anthropic 帮助中心: What are Artifacts](https://support.claude.com/en/articles/9487310)
- [泄露 System Prompt (2024-06)](https://gist.github.com/dedlim/6bf6d81f77c19e20cd40594aa09e3ecd)
- [逆向工程分析 - Reid Barber](https://www.reidbarber.com/blog/reverse-engineering-claude-artifacts)
- [Anthropic 构建 Artifacts 的过程 - Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/how-anthropic-built-artifacts)

### CodePilot 关键文件
- `src/lib/widget-guidelines.ts` — System prompt + 5 模块设计规范
- `src/lib/claude-client.ts:519-539` — 关键词检测 + MCP 动态加载
- `src/app/api/chat/route.ts:336-343` — System prompt 注入
- `src/components/chat/WidgetRenderer.tsx` — iframe 渲染 + postMessage
- `src/components/chat/StreamingMessage.tsx:260-356` — 流式部分解析
- `src/components/chat/MessageItem.tsx:160-215` — 完整 fence 解析
- `src/lib/widget-sanitizer.ts` — 消毒 + receiver srcdoc

### rag-deploy 当前文件
- `rag-ui/lib/widget-guidelines.ts` — 当前 system prompt（需扩展）
- `rag-ui/app/api/chat/route.ts:1459-1460` — 注入点
- `rag-ui/lib/widget-parser.ts` — 解析（无需改动）
- `rag-ui/components/widget-renderer.tsx` — 渲染（无需改动）
- `rag-ui/components/ai-elements/message.tsx:352-452` — 集成（无需改动）
- `rag-ui/lib/widget-sanitizer.ts` — 消毒（无需改动）
- `rag-ui/lib/widget-css-bridge.ts` — CSS 桥接（无需改动）
