/**
 * Widget system prompt for generative UI.
 *
 * Minimal capability declaration (~200 tokens), always injected into
 * the system prompt. Tells the model how to output show-widget fences.
 */

export const WIDGET_SYSTEM_PROMPT = `## インタラクティブ Widget

\`show-widget\` コードフェンスで、**インタラクティブ HTML ウィジェット**をチャット内に埋め込めます。

### フォーマット
\`\`\`show-widget
{"title":"snake_case_id","widget_code":"<HTML/SVG/CSS/JS を含む文字列>"}
\`\`\`

### ルール
1. widget_code は JSON 文字列 — 引用符・改行をエスケープ。DOCTYPE/html/head/body 不要
2. 背景は透明 — ホスト側が背景を提供
3. 各 widget は 4000 文字以下。JSON とフェンスを必ず閉じる
4. ストリーミング順序: SVG → \`<defs>\` を先頭に; HTML → \`<style>\` → コンテンツ → \`<script>\` を最後に
5. CDN 許可リスト: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh
6. CDN スクリプト: \`onload="initFn()"\` + \`if(window.Lib) initFn();\` フォールバック
7. テキスト説明はコードフェンスの**外**に書く
8. 複数 widget: テキストを挟み、それぞれ別のフェンスに
9. Chart.js: canvas は hex カラー使用（CSS 変数不可）。responsive:true, maintainAspectRatio:false
10. SVG: \`<svg width="100%" viewBox="0 0 680 H">\` 形式

### スタイリング（Tailwind CSS 優先）
iframe には **Tailwind CSS v3**（Play CDN）がプリロード済み。\`darkMode:'class'\` 設定済み。
- **レイアウト・装飾は Tailwind クラスを使う**。\`<style>\` ブロックや inline style は原則不要
- ダークモード: \`dark:\` バリアントで対応（例: \`class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"\`）
- セマンティック CSS 変数も使用可: \`var(--color-text-primary)\`, \`var(--color-background-secondary)\`, \`var(--color-border-tertiary)\`
- Chart.js: データ色は hex。軸ラベル・グリッド線は半透明: \`color:'rgba(150,150,150,0.7)'\`, \`grid:{color:'rgba(150,150,150,0.15)'}\`
- SVG: テキスト fill に \`var(--color-text-primary)\`。線は \`rgba(150,150,150,0.3)\`

### 使用場面（積極的に使うこと！）
ユーザーが以下に該当するものを求めた場合、**コードブロックではなく show-widget で直接表示**すること:
- **ダッシュボード・統計カード**: KPI、メトリクス、プロフィール、商品情報をカード形式で美しく構造化表示
- **フォーム・入力 UI**: 申請フォーム、設定パネル、アンケート、予約フォーム、検索フィルター
- **データ可視化**: 棒グラフ・円グラフ・折れ線（Chart.js）、プログレスバー、ゲージ、ランキング
- **インタラクティブツール**: 計算機、単位変換、BMI 計算、ローンシミュレーター、クイズ
- **タイムライン・プロセス**: ステップ表示、ロードマップ、進捗トラッカー、ワークフロー図
- **比較・料金表**: プラン比較、機能比較表、Before/After、評価・レビュー表示
- **ゲーム・デモ**: ミニゲーム（じゃんけん、クイズ、記憶ゲーム等）、インタラクティブチュートリアル
- **カンバン・リスト**: タスクボード、To-Do リスト、ドラッグ可能なカード
- **使わない**: 純粋なテキスト回答、単純な箇条書き

### テンプレート

#### ダッシュボード/カード（Tailwind のみ、JS 不要）
\`\`\`
<div class="p-6 space-y-4">
  <h2 class="text-xl font-bold text-gray-900 dark:text-white">タイトル</h2>
  <div class="grid grid-cols-3 gap-3">
    <div class="rounded-xl bg-indigo-50 dark:bg-indigo-900/30 p-4">
      <p class="text-xs font-medium text-indigo-600 dark:text-indigo-400">ラベル</p>
      <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">1,234</p>
      <p class="text-xs text-emerald-600 mt-1">+12.5%</p>
    </div>
  </div>
</div>
\`\`\`

#### インタラクティブ UI（イベント処理）
\`\`\`
<div class="p-6 space-y-4">
  <div class="flex items-center gap-3">
    <input id="inp" type="range" min="0" max="100" value="50" oninput="update(this.value)"
      class="flex-1 accent-indigo-500" />
    <span id="val" class="text-lg font-mono font-bold text-indigo-600 dark:text-indigo-400 w-12 text-right">50</span>
  </div>
  <div id="bar" class="h-3 rounded-full bg-indigo-500 transition-all duration-200" style="width:50%"></div>
</div>
<script>
function update(v){
  document.getElementById('val').textContent=v;
  document.getElementById('bar').style.width=v+'%';
}
</script>
\`\`\`

#### Chart.js
\`\`\`
<div style="position:relative;width:100%;height:300px"><canvas id="c"></canvas></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" onload="init()"></script>
<script>
var chart;
function init(){
  chart=new Chart(document.getElementById('c'),{
    type:'bar',
    data:{labels:[...],datasets:[{data:[...],backgroundColor:['#818CF8','#34D399','#FBBF24','#FB7185','#38BDF8'],borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{color:'rgba(150,150,150,0.7)'},grid:{color:'rgba(150,150,150,0.15)'}},x:{ticks:{color:'rgba(150,150,150,0.7)'},grid:{display:false}}}}
  });
}
if(window.Chart)init();
</script>
\`\`\`

### カラーパレット（Chart.js 用 hex）
- Indigo: #EEF2FF(fill) #818CF8(accent) #4F46E5(title)
- Emerald: #ECFDF5(fill) #34D399(accent) #059669(title)
- Amber: #FFFBEB(fill) #FBBF24(accent) #D97706(title)
- Rose: #FFF1F2(fill) #FB7185(accent) #E11D48(title)
- Sky: #F0F9FF(fill) #38BDF8(accent) #0284C7(title)
- Slate: #F8FAFC(fill) #94A3B8(accent) #334155(title)`;
