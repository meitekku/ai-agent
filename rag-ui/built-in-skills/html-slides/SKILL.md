---
name: html-slides
description: Create professional HTML presentations with GSAP animations, 12 style presets, and Japanese UI. Use when users request presentations, slideshows, proposals, or pitch decks as HTML artifacts. Features Wake Lock, fullscreen, keyboard/touch navigation, responsive viewport fitting (dvh + clamp), and anti-generic-AI design rules. Always follow the "show background first, then fade in content" principle.
---

# HTML Slides

Create zero-dependency single-file HTML presentations with GSAP animations, professional design presets, and Japanese UI standards.

## 4 Non-Negotiable Principles

1. **Show Background First, Fade In Content** — Background appears instantly, content elements fade in sequentially via GSAP `.anim-elem` stagger. No black screens, no whole-page fades.
2. **Every Slide = 100dvh, No Scrolling** — Content overflows? Split into multiple slides. Never cram, never scroll.
3. **Distinctive Design** — No generic AI aesthetics. Choose a bold style preset and commit to it.
4. **Japanese UI** — All controls in Japanese, natural localization, no stiff loanwords.

---

## Animation System (GSAP)

### The Core Pattern

```javascript
function goToSlide(index) {
    if (index < 0 || index >= totalSlides || index === currentSlide) return;

    const forward = index > currentSlide;
    currentSlide = index; // Update IMMEDIATELY — no waiting for onComplete

    // Kill ALL running tweens
    slides.forEach(s => gsap.killTweensOf(s.querySelectorAll('.anim-elem')));

    // 1. Target slide ON TOP — background visible instantly
    const target = slides[index];
    target.classList.add('active');
    target.style.zIndex = 20;

    // 2. Prepare target content
    const elements = target.querySelectorAll('.anim-elem');
    gsap.set(elements, { opacity: 0, y: forward ? 20 : -20 });

    // 3. Deactivate all other slides (target already on top)
    slides.forEach((s, i) => {
        if (i !== index) {
            s.classList.remove('active');
            s.style.zIndex = '';
            gsap.set(s.querySelectorAll('.anim-elem'), { opacity: 1, y: 0 });
        }
    });

    // 4. Animate target content in — fully interruptible, no lock
    gsap.to(elements, {
        opacity: 1, y: 0,
        duration: 0.5, stagger: forward ? 0.06 : -0.06,
        ease: 'power2.out',
        onComplete: () => { target.style.zIndex = ''; }
    });

    updatePageNumber();
}
```

### Marking Animated Elements

```html
<div class="slide active">
    <div class="slide-content">
        <h1 class="anim-elem">タイトル</h1>
        <p class="anim-elem">説明文</p>
        <div class="anim-elem glass-panel">コンテンツ</div>
    </div>
</div>
```

```css
.anim-elem { opacity: 0; transform: translateY(20px); }
```

**FORBIDDEN:**
- Entire page fading in/out together
- Black screen during slide transition
- Background and content animating simultaneously
- Missing `.anim-elem` on content elements

For detailed animation patterns (cards, timelines, 3D, easing reference), see `references/animations.md`.

---

## Viewport Fitting

**MANDATORY** — include `references/viewport.css` contents in every presentation.

Key rules:
- `.slide`: `height: 100vh; height: 100dvh; overflow: hidden;`
- ALL font sizes: `clamp(min, preferred, max)` — never fixed px/rem
- Images: `max-height: min(50vh, 400px)`
- Height breakpoints: 700px, 600px, 500px
- Width breakpoint: 600px
- `prefers-reduced-motion` support
- Never negate CSS functions directly (`-clamp()` silently fails) — use `calc(-1 * clamp(...))`

### Content Density Limits Per Slide

| Slide Type | Maximum Content |
|------------|----------------|
| Title | 1 heading + 1 subtitle + optional tagline |
| Content | 1 heading + 4-6 bullets OR 1 heading + 2 paragraphs |
| Feature grid | 1 heading + 6 cards max (2×3 or 3×2) |
| Code | 1 heading + 8-10 lines of code |
| Quote | 1 quote (max 3 lines) + attribution |
| Image | 1 heading + 1 image (max 60vh height) |
| Data/Chart | 1 heading + 1 chart + optional 2-line caption |

**Content exceeds limits? Split into multiple slides.**

---

## 12 Slide Types

Use the appropriate type for each slide's content:

| # | Type | Structure |
|---|------|-----------|
| 1 | **Title** | Large title + subtitle + presenter/date |
| 2 | **Agenda** | Numbered section list (01, 02, 03...) |
| 3 | **Section Divider** | Big number/icon + section title |
| 4 | **Content** | Heading + bullets or paragraphs |
| 5 | **Quote** | Large quote + attribution |
| 6 | **Comparison** | Two-column side-by-side |
| 7 | **Flow/Process** | Step-by-step horizontal or vertical flow |
| 8 | **Card Grid** | 2×2, 2×3, or 3×2 feature cards |
| 9 | **Data/Chart** | Chart.js or CSS chart + interpretation |
| 10 | **Code Block** | Syntax-highlighted code + explanation |
| 11 | **Image** | Full or half image + text |
| 12 | **Closing** | Thank you / CTA / contact info |

See `references/slide-types.md` for HTML templates of each type.

---

## 12 Style Presets

Choose a preset that matches the presentation's mood. **Never use defaults — always commit to a specific preset.**

### Dark Themes
| Preset | Vibe | Display Font | Accent |
|--------|------|-------------|--------|
| **Bold Signal** | Confident, high-impact | Archivo Black | #FF5722 orange card |
| **Electric Studio** | Bold, clean, split-panel | Manrope 800 | #4361ee blue |
| **Creative Voltage** | Energetic, retro-modern | Syne 700 | #d4ff00 neon yellow |
| **Dark Botanical** | Elegant, sophisticated | Cormorant 600 | #d4a574 warm gold |

### Light Themes
| Preset | Vibe | Display Font | Accent |
|--------|------|-------------|--------|
| **Notebook Tabs** | Editorial, tactile | Bodoni Moda | Colorful tabs (mint/lavender/pink) |
| **Pastel Geometry** | Friendly, modern | Plus Jakarta Sans | Pink/mint/sage pills |
| **Split Pastel** | Playful, creative | Outfit 700 | Peach + lavender split |
| **Vintage Editorial** | Witty, personality | Fraunces 700 | Warm cream + geometric shapes |

### Specialty Themes
| Preset | Vibe | Display Font | Accent |
|--------|------|-------------|--------|
| **Neon Cyber** | Futuristic, techy | Clash Display | #00ffcc cyan + #ff00aa magenta |
| **Keynote Apple** | Dramatic, premium | SF-style sans | Gradient backgrounds |
| **Data Focus** | Clean, dashboard | System mono | Trend indicators, chart-first |
| **Paper & Ink** | Literary, thoughtful | Cormorant Garamond | #c41e3a crimson accent |

### Mood → Preset Guide

| Mood | Recommended Presets |
|------|-------------------|
| Impressed/Confident | Bold Signal, Electric Studio, Dark Botanical |
| Excited/Energized | Creative Voltage, Neon Cyber, Split Pastel |
| Calm/Focused | Notebook Tabs, Paper & Ink, Data Focus |
| Inspired/Moved | Dark Botanical, Vintage Editorial, Keynote Apple |
| Business/Corporate | Electric Studio, Data Focus, Notebook Tabs |
| Tech/Developer | Neon Cyber, Bold Signal, Creative Voltage |

See `references/style-presets.md` for full CSS variables, font links, and signature elements of each preset.

---

## Required Features

### Japanese Controls

```html
<div class="controls">
    <button onclick="goToSlide(currentSlide - 1)">
        <i class="fa-solid fa-chevron-left"></i> 前へ
    </button>
    <button onclick="toggleFullscreen()">
        <i class="fa-solid fa-expand"></i> 全画面
    </button>
    <button onclick="goToSlide(currentSlide + 1)">
        次へ <i class="fa-solid fa-chevron-right"></i>
    </button>
</div>
```

| Action | Label |
|--------|-------|
| Previous | 前へ |
| Next | 次へ |
| Fullscreen | 全画面 |
| Play | 再生 |
| Pause | 一時停止 |
| Reset | リセット |

### Page Number (Bottom-Left)

```html
<div class="slide-number">1 / 18</div>
```

```css
.slide-number {
    position: fixed;
    bottom: 2rem; left: 2rem;
    font-family: 'JetBrains Mono', monospace;
    opacity: 0.5; font-size: 1.2rem;
    z-index: 50;
}
```

### Fullscreen + Wake Lock

```javascript
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen()
            .then(() => requestWakeLock())
            .catch(() => {}); // Silent failure
    } else {
        document.exitFullscreen?.();
    }
}

let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
    } catch {} // Silent failure — never console.error()
}
```

### Keyboard + Touch Navigation

```javascript
document.addEventListener('keydown', (e) => {
    switch(e.key) {
        // Next: covers arrow keys, space, PageDown, Enter
        // Presentation remotes (Logitech Spotlight etc.) send PageDown or Enter
        case 'ArrowRight': case 'ArrowDown': case ' ':
        case 'PageDown': case 'Enter':
            e.preventDefault(); goToSlide(currentSlide + 1); break;
        // Prev: arrow keys, PageUp, Backspace
        case 'ArrowLeft': case 'ArrowUp':
        case 'PageUp': case 'Backspace':
            e.preventDefault(); goToSlide(currentSlide - 1); break;
        case 'f': case 'F':
            toggleFullscreen(); break;
        case 's': case 'S':
            toggleSpeakerNotes(); break;
        // Jump to first/last
        case 'Home': e.preventDefault(); goToSlide(0); break;
        case 'End': e.preventDefault(); goToSlide(totalSlides - 1); break;
    }
});

// Touch/swipe
let touchStartX = 0;
document.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
document.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goToSlide(currentSlide + (diff > 0 ? 1 : -1));
});
```

### Speaker Notes (Optional, S Key)

```javascript
function toggleSpeakerNotes() {
    const notes = slides[currentSlide].dataset.notes;
    if (!notes) return;
    const win = window.open('', 'notes', 'width=400,height=300');
    win.document.body.innerHTML = `
        <div style="font-family:sans-serif;padding:2rem;">
            <h3>スライド ${currentSlide + 1}</h3>
            <p>${notes}</p>
        </div>`;
}
```

```html
<div class="slide" data-notes="ここに発表者メモを記入">
```

---

## HTML Structure

### CDN Dependencies

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<!-- Font: choose from preset -->
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
```

### Body Layout

```css
body {
    overflow: hidden;
    background: var(--bg-deep);
    font-family: var(--font-body);
    color: var(--text-primary);
    width: 100vw;
    height: 100vh;
    height: 100dvh;
}
```

**NO `display: flex` on body** — slides use absolute positioning, not flexbox centering.
**NO `max-width`/`max-height`/`aspect-ratio`** — slides fill the full viewport. No letterboxing.

### Slide Layout (Full Viewport)

```css
.slide-container {
    width: 100%; height: 100%;
    position: relative;
}

.slide {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    opacity: 0; visibility: hidden; z-index: 1;
}

.slide.active { opacity: 1; visibility: visible; z-index: 10; }

.slide-content {
    width: 100%; height: 100%;
    position: relative; overflow: hidden;
    padding: var(--slide-padding);
    display: flex; flex-direction: column; justify-content: center;
}
```

### Initialization

```javascript
window.addEventListener('load', () => {
    const firstElements = slides[0].querySelectorAll('.anim-elem');
    gsap.set(firstElements, { opacity: 0, y: 20 });
    gsap.to(firstElements, {
        opacity: 1, y: 0,
        duration: 0.6, stagger: 0.1,
        ease: "power2.out", delay: 0.3
    });
    requestWakeLock();
});
```

See `assets/template.html` for a complete working starter.

---

## Japanese Localization

### Natural Expression (Avoid Stiff Loanwords)

| Stiff | Natural |
|-------|---------|
| コア原則 | 基本原則 |
| ベストプラクティス | 推奨方法 |
| ソリューション | 解決策 |
| ワークフロー | 作業手順 |
| チェックリスト | 確認項目 |
| スケープゴート | 責任転嫁 |

### Content Faithfulness

When user provides content (Markdown, text, etc.):
- **DO NOT** delete, add, or modify content arbitrarily
- **MUST** include all sections, code blocks, and text
- **DO** translate naturally to Japanese if needed

---

## Anti-AI Aesthetic Rules

**DO NOT USE:**
- **Fonts**: Inter, Roboto, Arial, system fonts as display
- **Colors**: `#6366f1` generic indigo, purple gradients on white backgrounds
- **Layouts**: Everything centered, generic hero sections, identical card grids
- **Decorations**: Realistic illustrations, gratuitous glassmorphism, shadows without purpose

**DO:**
- Choose a specific preset and commit fully
- Vary between light and dark themes across presentations
- Use distinctive font pairings (see presets)
- Create atmosphere with gradients, patterns, textures

---

## Multi-Slide Generation Strategy

For presentations with 6+ slides, **do NOT generate all slides in one shot**. Use incremental building:

1. **`create`**: Generate the boilerplate (CSS, JS, controls) + first 3-4 slides (Cover, Agenda, first content slides)
2. **`update`**: Add the next 3-4 slides (insert before the closing `</div><!-- slide-container -->`)
3. **`update`**: Add remaining slides + Closing slide

This avoids quality degradation on later slides. Each `update` call focuses on fewer slides = better content for each.

**For the `update` calls**, use `oldStr` / `newStr` to insert new `<div class="slide">` blocks before the closing slide or before `</div><!-- end slide-container -->`.

## Proposal-Specific Guidelines

When generating business proposals (提案書) as HTML slides:

1. **Structure**: Cover → Agenda → Challenge Analysis → KPI/Data → Solution → Case Study → Pricing → Timeline → Closing
2. **Charts**: Use Chart.js via CDN for KPI gauges, radar charts, bar charts
3. **Data Visualization**: Revenue/cost figures in large display type, comparison tables in cards
4. **Branding**: Ask for or infer company colors, apply to accent variables
5. **Tone**: Professional but not boring — use the chosen preset's personality
6. **Content**: All text in Japanese, formal business register (です/ます調)

---

## Checklist Before Delivery

- [ ] Background appears immediately, content fades in sequentially
- [ ] All animated elements have `.anim-elem` class
- [ ] Every slide fits in 100dvh — no overflow, no scrolling
- [ ] Font sizes use `clamp()`, not fixed values
- [ ] Buttons use Japanese text (前へ, 次へ, 全画面)
- [ ] Page number in bottom-left, format "N / 総数"
- [ ] Body uses `display: flex; align-items: center; justify-content: center`
- [ ] Wake Lock and Fullscreen errors handled silently (no console output)
- [ ] `isAnimating` flag prevents rapid click conflicts
- [ ] Keyboard (arrows, space, PageDown/Up, Enter, Backspace, Home/End, F, S) + touch/swipe working
- [ ] Presentation remote compatible (PageDown/Enter = next, PageUp/Backspace = prev)
- [ ] Style preset applied consistently (colors, fonts, signature elements)
- [ ] Content faithful to original (if provided)
- [ ] Japanese text natural and idiomatic
- [ ] `prefers-reduced-motion` respected

## Reference Documents

| File | Purpose | When to Read |
|------|---------|-------------|
| `references/viewport.css` | Mandatory base CSS — include in every presentation | Always |
| `references/animations.md` | GSAP animation patterns, easing, stagger reference | When generating |
| `references/style-presets.md` | 12 presets with full CSS variables and signature details | Style selection |
| `references/slide-types.md` | 12 slide type HTML templates | Content structuring |
| `assets/template.html` | Complete working starter template | Starting point |
