# Slide Types Reference

12 standard slide types with HTML templates. Every type respects content density limits — if content overflows, split into multiple slides.

---

## 1. Title Slide

The opening slide. Large title, subtitle, presenter info.

**Density limit:** 1 heading + 1 subtitle + optional tagline/date

```html
<div class="slide active">
    <div class="slide-content flex flex-col items-center justify-center text-center">
        <!-- Background: use preset gradient or mesh, NOT blue-to-purple -->
        <div class="anim-elem accent-line mx-auto mb-6"></div>
        <h1 class="anim-elem font-[family-name:var(--font-display)]
                   text-[length:var(--title-size)] font-normal leading-[1.1] tracking-tight">
            プレゼンテーションタイトル
        </h1>
        <p class="anim-elem text-[length:var(--h3-size)] text-[color:var(--text-muted)] mt-4">
            サブタイトル・概要
        </p>
        <p class="anim-elem text-[length:var(--small-size)] text-[color:var(--text-muted)] mt-8">
            発表者名 — 2026年4月
        </p>
    </div>
</div>
```

---

## 2. Agenda / Table of Contents

Overview of presentation structure with numbered sections.

**Density limit:** 1 heading + up to 6 sections

```html
<div class="slide">
    <div class="slide-content p-[length:var(--slide-padding)]">
        <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mb-8">目��</h2>
        <div class="space-y-4">
            <div class="anim-elem flex items-center gap-4">
                <span class="text-[length:var(--h2-size)] font-black opacity-30">01</span>
                <span class="text-[length:var(--body-size)]">課題分析</span>
            </div>
            <div class="anim-elem flex items-center gap-4">
                <span class="text-[length:var(--h2-size)] font-black opacity-30">02</span>
                <span class="text-[length:var(--body-size)]">ソリューション提案</span>
            </div>
            <div class="anim-elem flex items-center gap-4">
                <span class="text-[length:var(--h2-size)] font-black opacity-30">03</span>
                <span class="text-[length:var(--body-size)]">導入計画・お見���り</span>
            </div>
        </div>
    </div>
</div>
```

---

## 3. Section Divider

Marks the beginning of a new section. Big number/icon as focal point.

**Density limit:** 1 number + 1 title + optional 1-line description

```html
<div class="slide">
    <div class="slide-content flex flex-col items-center justify-center text-center">
        <span class="anim-elem text-8xl font-black opacity-20">01</span>
        <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mt-4">
            課題分析
        </h2>
        <p class="anim-elem text-[length:var(--body-size)] opacity-60 mt-2">
            現状の課題と業界動向
        </p>
    </div>
</div>
```

---

## 4. Content Slide

Standard content with heading + bullets or paragraphs.

**Density limit:** 1 heading + 4-6 bullets OR 1 heading + 2 paragraphs

```html
<div class="slide">
    <div class="slide-content p-[length:var(--slide-padding)]">
        <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mb-6">
            現状の課題
        </h2>
        <ul class="space-y-3">
            <li class="anim-elem flex items-start gap-3 text-[length:var(--body-size)]">
                <span class="text-[color:var(--accent)] mt-1">●</span>
                データの分断により意思決定が遅延
            </li>
            <li class="anim-elem flex items-start gap-3 text-[length:var(--body-size)]">
                <span class="text-[color:var(--accent)] mt-1">●</span>
                手作業による非効率な業務プロセス
            </li>
            <li class="anim-elem flex items-start gap-3 text-[length:var(--body-size)]">
                <span class="text-[color:var(--accent)] mt-1">●</span>
                セキュリティリスクの増大
            </li>
        </ul>
    </div>
</div>
```

---

## 5. Quote Slide

Large quote with attribution. Use for testimonials, key insights.

**Density limit:** 1 quote (max 3 lines) + attribution

```html
<div class="slide">
    <div class="slide-content flex flex-col items-center justify-center text-center
                px-[clamp(2rem,8vw,8rem)]">
        <blockquote class="anim-elem text-[length:var(--h2-size)] font-light italic leading-relaxed">
            「デジタル変革は技術の問題ではなく、人と文化の変革である」
        </blockquote>
        <p class="anim-elem text-[length:var(--body-size)] opacity-60 mt-6">
            — 山田太郎、代表取締役
        </p>
    </div>
</div>
```

---

## 6. Comparison (Two-Column)

Side-by-side comparison. Before/After, Pros/Cons, Us/Them.

**Density limit:** 1 heading + 2 columns × 3-4 items each

```html
<div class="slide">
    <div class="slide-content p-[length:var(--slide-padding)]">
        <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mb-6">
            導入前 vs 導入後
        </h2>
        <div class="grid grid-cols-2 gap-6">
            <div class="anim-elem glass-panel p-6">
                <h3 class="text-[length:var(--h3-size)] font-semibold mb-4 opacity-60">Before</h3>
                <ul class="space-y-2 text-[length:var(--body-size)]">
                    <li>手動データ集計: 週 8 ���間</li>
                    <li>エラー率: 15%</li>
                    <li>レポート作成: 2 日</li>
                </ul>
            </div>
            <div class="anim-elem glass-panel p-6 border-[color:var(--accent)]">
                <h3 class="text-[length:var(--h3-size)] font-semibold mb-4 text-[color:var(--accent)]">After</h3>
                <ul class="space-y-2 text-[length:var(--body-size)]">
                    <li>自動集計: 週 30 分</li>
                    <li>エラー率: 0.5%</li>
                    <li>リアルタイムダッシュボード</li>
                </ul>
            </div>
        </div>
    </div>
</div>
```

---

## 7. Flow / Process

Step-by-step flow. Horizontal for 3-4 steps, vertical for more.

**Density limit:** 1 heading + 3-5 steps

```html
<div class="slide">
    <div class="slide-content p-[length:var(--slide-padding)]">
        <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mb-8">導入ステップ</h2>
        <div class="flex items-center justify-between gap-4">
            <div class="anim-elem flex flex-col items-center text-center flex-1">
                <div class="w-12 h-12 rounded-full bg-[color:var(--accent)] flex items-center justify-center font-bold">1</div>
                <p class="text-[length:var(--body-size)] mt-2">ヒアリン��</p>
            </div>
            <div class="anim-elem text-xl opacity-30">→</div>
            <div class="anim-elem flex flex-col items-center text-center flex-1">
                <div class="w-12 h-12 rounded-full bg-[color:var(--accent)] flex items-center justify-center font-bold">2</div>
                <p class="text-[length:var(--body-size)] mt-2">設計・開発</p>
            </div>
            <div class="anim-elem text-xl opacity-30">→</div>
            <div class="anim-elem flex flex-col items-center text-center flex-1">
                <div class="w-12 h-12 rounded-full bg-[color:var(--accent)] flex items-center justify-center font-bold">3</div>
                <p class="text-[length:var(--body-size)] mt-2">テスト・導入</p>
            </div>
            <div class="anim-elem text-xl opacity-30">→</div>
            <div class="anim-elem flex flex-col items-center text-center flex-1">
                <div class="w-12 h-12 rounded-full bg-[color:var(--accent)] flex items-center justify-center font-bold">4</div>
                <p class="text-[length:var(--body-size)] mt-2">運用・改善</p>
            </div>
        </div>
    </div>
</div>
```

---

## 8. Card Grid

Feature cards in 2×2, 2×3, or 3×2 layout.

**Density limit:** 1 heading + 6 cards max

```html
<div class="slide">
    <div class="slide-content p-[length:var(--slide-padding)]">
        <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mb-6">主な機能</h2>
        <div class="grid grid-cols-3 gap-4">
            <div class="anim-elem glass-panel p-5">
                <div class="text-2xl mb-2">📊</div>
                <h3 class="text-[length:var(--h3-size)] font-semibold">リアルタイム分析</h3>
                <p class="text-[length:var(--small-size)] opacity-70 mt-1">
                    ダッシュボードで即座に可視化
                </p>
            </div>
            <div class="anim-elem glass-panel p-5">
                <div class="text-2xl mb-2">🔒</div>
                <h3 class="text-[length:var(--h3-size)] font-semibold">セキュリティ</h3>
                <p class="text-[length:var(--small-size)] opacity-70 mt-1">
                    エンタープライズ級の保護
                </p>
            </div>
            <div class="anim-elem glass-panel p-5">
                <div class="text-2xl mb-2">⚡</div>
                <h3 class="text-[length:var(--h3-size)] font-semibold">高速処理</h3>
                <p class="text-[length:var(--small-size)] opacity-70 mt-1">
                    従来比 10 倍の処理速度
                </p>
            </div>
        </div>
    </div>
</div>
```

---

## 9. Data / Chart Slide

Chart.js visualization + interpretation text.

**Density limit:** 1 heading + 1 chart + optional 2-line caption

```html
<div class="slide">
    <div class="slide-content p-[length:var(--slide-padding)]">
        <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mb-4">売上推移</h2>
        <div class="anim-elem flex-1 flex items-center justify-center">
            <canvas id="chart1" style="max-height: min(50vh, 400px);"></canvas>
        </div>
        <p class="anim-elem text-[length:var(--small-size)] opacity-60 text-center mt-2">
            前年比 +32% の成長。Q3 の急増は新サービス投入による効果
        </p>
    </div>
</div>

<!-- Chart.js CDN (add to <head>) -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

---

## 10. Code Block

Syntax-highlighted code with explanation.

**Density limit:** 1 heading + 8-10 lines of code

```html
<div class="slide">
    <div class="slide-content p-[length:var(--slide-padding)]">
        <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mb-4">API 使用例</h2>
        <div class="anim-elem glass-panel p-6 font-mono text-[length:var(--body-size)] overflow-hidden">
            <pre><code>const response = await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '売上予測' })
});

const { prediction, confidence } = await response.json();
console.log(`予測: ${prediction}, 信頼度: ${confidence}%`);</code></pre>
        </div>
    </div>
</div>
```

---

## 11. Image Slide

Full or half image with text overlay or side-by-side.

**Density limit:** 1 heading + 1 image (max 60vh height)

```html
<!-- Half-and-half layout -->
<div class="slide">
    <div class="slide-content p-[length:var(--slide-padding)] flex flex-row items-center gap-8">
        <div class="flex-1">
            <h2 class="anim-elem text-[length:var(--h2-size)] font-bold mb-4">導入事例</h2>
            <p class="anim-elem text-[length:var(--body-size)] opacity-80">
                大手製造業 A 社様にて、生産ラインの最適化を実現
            </p>
        </div>
        <div class="anim-elem flex-1">
            <img src="case-study.png" alt="導入事例"
                 class="rounded-xl max-h-[min(50vh,400px)] object-contain">
        </div>
    </div>
</div>
```

---

## 12. Closing Slide

Thank you, CTA, or contact information.

**Density limit:** 1 thank-you message + optional contact/CTA

```html
<div class="slide">
    <div class="slide-content flex flex-col items-center justify-center text-center">
        <h2 class="anim-elem text-[length:var(--title-size)] font-black">
            ご清聴ありがとうございま��た
        </h2>
        <p class="anim-elem text-[length:var(--h3-size)] opacity-60 mt-4">
            ご質問・ご相談はお気軽にどうぞ
        </p>
        <div class="anim-elem mt-8 glass-panel px-8 py-4 text-[length:var(--body-size)]">
            <p>📧 contact@example.com</p>
            <p>📞 03-1234-5678</p>
        </div>
    </div>
</div>
```
