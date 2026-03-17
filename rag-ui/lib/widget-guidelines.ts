/**
 * Widget system prompt for generative UI.
 *
 * Minimal capability declaration (~150 tokens), always injected into
 * the system prompt. Tells the model how to output show-widget fences.
 */

export const WIDGET_SYSTEM_PROMPT = `## インタラクティブ Widget

\`show-widget\` コードフェンスで、グラフ・計算機・可視化などの**インタラクティブ HTML ウィジェット**をチャット内に埋め込めます。

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

### ダークモード対応（重要）
ホストがダークモードとライトモードを切り替えます。以下の CSS 変数を使うと自動追従します:
- テキスト: \`var(--color-text-primary)\`, \`var(--color-text-secondary)\`
- 背景: 透明のまま。コンテナに背景色を付ける場合は \`var(--color-background-secondary)\`
- ボーダー: \`var(--color-border-tertiary)\`
- **HTML/CSS**: 文字色・背景色・ボーダーに上記 CSS 変数を使う。\`#334155\` のような固定色は避ける
- **Chart.js**: データ色は hex で OK。ただし軸ラベル・グリッド線は半透明を使う: \`color:'rgba(150,150,150,0.7)'\`, \`grid:{color:'rgba(150,150,150,0.15)'}\`
- **SVG**: テキスト fill に \`var(--color-text-primary)\` を使用。線は \`rgba(150,150,150,0.3)\`

### 使用場面
- データの可視化（棒グラフ、円グラフ、折れ線グラフ）
- インタラクティブな計算機・シミュレーター
- フローチャート、タイムライン、アーキテクチャ図
- **使わない**: 純粋なテキスト回答、単純な表

### Chart.js テンプレート
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
