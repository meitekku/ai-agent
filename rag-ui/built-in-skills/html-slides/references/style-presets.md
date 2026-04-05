# Style Presets Reference

12 curated visual styles. Each preset includes CSS custom properties, font pairing, and signature design elements. **Abstract shapes only — no illustrations.**

---

## Dark Themes

### 1. Bold Signal

**Vibe:** Confident, bold, modern, high-impact

**Layout:** Colored card on dark gradient. Number top-left, navigation top-right, title bottom-left.

**Typography:**
- Display: `Archivo Black` (900) — [Google Fonts](https://fonts.google.com/specimen/Archivo+Black)
- Body: `Space Grotesk` (400/500) — [Google Fonts](https://fonts.google.com/specimen/Space+Grotesk)

```css
:root {
    --bg-primary: #1a1a1a;
    --bg-gradient: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%);
    --card-bg: #FF5722;
    --text-primary: #ffffff;
    --text-on-card: #1a1a1a;
    --accent: #FF5722;
    --font-display: 'Archivo Black', sans-serif;
    --font-body: 'Space Grotesk', sans-serif;
}
```

**Signature Elements:**
- Bold colored card as focal point (orange, coral, or vibrant accent)
- Large section numbers (01, 02, etc.)
- Navigation breadcrumbs with active/inactive opacity states
- Grid-based layout for precise alignment

---

### 2. Electric Studio

**Vibe:** Bold, clean, professional, high contrast

**Layout:** Split panel — white top, blue bottom. Brand marks in corners.

**Typography:**
- Display: `Manrope` (800) — [Google Fonts](https://fonts.google.com/specimen/Manrope)
- Body: `Manrope` (400/500)

```css
:root {
    --bg-dark: #0a0a0a;
    --bg-white: #ffffff;
    --accent: #4361ee;
    --text-dark: #0a0a0a;
    --text-light: #ffffff;
    --font-display: 'Manrope', sans-serif;
    --font-body: 'Manrope', sans-serif;
}
```

**Signature Elements:**
- Two-panel vertical split
- Accent bar on panel edge
- Quote typography as hero element
- Minimal, confident spacing

---

### 3. Creative Voltage

**Vibe:** Bold, creative, energetic, retro-modern

**Layout:** Split panels — electric blue left, dark right. Script accents.

**Typography:**
- Display: `Syne` (700/800) — [Google Fonts](https://fonts.google.com/specimen/Syne)
- Mono: `Space Mono` (400/700) — [Google Fonts](https://fonts.google.com/specimen/Space+Mono)

```css
:root {
    --bg-primary: #0066ff;
    --bg-dark: #1a1a2e;
    --accent: #d4ff00;
    --text-light: #ffffff;
    --font-display: 'Syne', sans-serif;
    --font-body: 'Space Mono', monospace;
}
```

**Signature Elements:**
- Electric blue + neon yellow contrast
- Halftone texture patterns
- Neon badges/callouts
- Script typography for creative flair

---

### 4. Dark Botanical

**Vibe:** Elegant, sophisticated, artistic, premium

**Layout:** Centered content on dark. Abstract soft shapes in corner.

**Typography:**
- Display: `Cormorant` (400/600) — [Google Fonts](https://fonts.google.com/specimen/Cormorant) — elegant serif
- Body: `IBM Plex Sans` (300/400) — [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Sans)

```css
:root {
    --bg-primary: #0f0f0f;
    --text-primary: #e8e4df;
    --text-secondary: #9a9590;
    --accent: #d4a574;
    --accent-pink: #e8b4b8;
    --accent-gold: #c9b896;
    --font-display: 'Cormorant', serif;
    --font-body: 'IBM Plex Sans', sans-serif;
}
```

**Signature Elements:**
- Abstract soft gradient circles (blurred, overlapping)
- Warm color accents (pink, gold, terracotta)
- Thin vertical accent lines
- Italic signature typography
- No illustrations — only abstract CSS shapes

---

## Light Themes

### 5. Notebook Tabs

**Vibe:** Editorial, organized, elegant, tactile

**Layout:** Cream paper card on dark background. Colorful tabs on right edge.

**Typography:**
- Display: `Bodoni Moda` (400/700) — [Google Fonts](https://fonts.google.com/specimen/Bodoni+Moda)
- Body: `DM Sans` (400/500) — [Google Fonts](https://fonts.google.com/specimen/DM+Sans)

```css
:root {
    --bg-outer: #2d2d2d;
    --bg-page: #f8f6f1;
    --text-primary: #1a1a1a;
    --tab-1: #98d4bb; /* Mint */
    --tab-2: #c7b8ea; /* Lavender */
    --tab-3: #f4b8c5; /* Pink */
    --tab-4: #a8d8ea; /* Sky */
    --tab-5: #ffe6a7; /* Cream */
    --font-display: 'Bodoni Moda', serif;
    --font-body: 'DM Sans', sans-serif;
}
```

**Signature Elements:**
- Paper container with subtle shadow
- Colorful section tabs on right edge (vertical text)
- Binder hole decorations on left
- Tab text: `font-size: clamp(0.5rem, 1vh, 0.7rem)`

---

### 6. Pastel Geometry

**Vibe:** Friendly, organized, modern, approachable

**Layout:** White card on pastel background. Vertical pills on right edge.

**Typography:**
- Display + Body: `Plus Jakarta Sans` (400-800) — [Google Fonts](https://fonts.google.com/specimen/Plus+Jakarta+Sans)

```css
:root {
    --bg-primary: #c8d9e6;
    --card-bg: #faf9f7;
    --accent: #f0b4d4;
    --pill-mint: #a8d4c4;
    --pill-sage: #5a7c6a;
    --pill-lavender: #9b8dc4;
    --font-display: 'Plus Jakarta Sans', sans-serif;
    --font-body: 'Plus Jakarta Sans', sans-serif;
}
```

**Signature Elements:**
- Rounded card with soft shadow
- Vertical pills on right edge with varying heights
- Download/action icon in corner

---

### 7. Split Pastel

**Vibe:** Playful, modern, friendly, creative

**Layout:** Two-color vertical split (peach left, lavender right).

**Typography:**
- Display + Body: `Outfit` (400-800) — [Google Fonts](https://fonts.google.com/specimen/Outfit)

```css
:root {
    --bg-peach: #f5e6dc;
    --bg-lavender: #e4dff0;
    --text-dark: #1a1a1a;
    --badge-mint: #c8f0d8;
    --badge-yellow: #f0f0c8;
    --badge-pink: #f0d4e0;
    --font-display: 'Outfit', sans-serif;
    --font-body: 'Outfit', sans-serif;
}
```

**Signature Elements:**
- Split background colors
- Playful badge pills with icons
- Grid pattern overlay on right panel
- Rounded CTA buttons

---

### 8. Vintage Editorial

**Vibe:** Witty, confident, editorial, personality-driven

**Layout:** Centered content on cream. Abstract geometric shapes as accent.

**Typography:**
- Display: `Fraunces` (700/900) — [Google Fonts](https://fonts.google.com/specimen/Fraunces) — distinctive serif
- Body: `Work Sans` (400/500) — [Google Fonts](https://fonts.google.com/specimen/Work+Sans)

```css
:root {
    --bg-cream: #f5f3ee;
    --text-primary: #1a1a1a;
    --text-secondary: #555;
    --accent: #e8d4c0;
    --font-display: 'Fraunces', serif;
    --font-body: 'Work Sans', sans-serif;
}
```

**Signature Elements:**
- Abstract geometric shapes (circle outline + line + dot)
- Bold bordered CTA boxes
- Witty, conversational copy style
- No illustrations — only geometric CSS shapes

---

## Specialty Themes

### 9. Neon Cyber

**Vibe:** Futuristic, techy, confident

**Typography:**
- Display: `Clash Display` — [Fontshare](https://www.fontshare.com/fonts/clash-display)
- Body: `Satoshi` — [Fontshare](https://www.fontshare.com/fonts/satoshi)

```css
:root {
    --bg-primary: #0a0f1c;
    --accent: #00ffcc;
    --accent-magenta: #ff00aa;
    --text-primary: #ffffff;
    --font-display: 'Clash Display', sans-serif;
    --font-body: 'Satoshi', sans-serif;
}
```

**Signature Elements:** Particle canvas backgrounds, neon glow (box-shadow), grid patterns, scanline overlay

---

### 10. Keynote Apple

**Vibe:** Dramatic, premium, product-launch

**Typography:**
- Display: `Inter Tight` (700/800) — [Google Fonts](https://fonts.google.com/specimen/Inter+Tight)
- Body: `Inter Tight` (400/500)

```css
:root {
    --bg-primary: #000000;
    --bg-gradient: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
    --accent: #007AFF;
    --text-primary: #ffffff;
    --font-display: 'Inter Tight', sans-serif;
    --font-body: 'Inter Tight', sans-serif;
}
```

**Signature Elements:** Full-bleed gradient backgrounds, oversized titles, cinematic reveals, product-centric layout

---

### 11. Data Focus

**Vibe:** Clean, analytical, dashboard-like

**Typography:**
- Display: `Archivo` (800) — [Google Fonts](https://fonts.google.com/specimen/Archivo)
- Body + Data: `Nunito` (400/600) — [Google Fonts](https://fonts.google.com/specimen/Nunito)
- Mono: `JetBrains Mono` — for data values

```css
:root {
    --bg-primary: #0f172a;
    --card-bg: #1e293b;
    --accent-up: #22c55e;
    --accent-down: #ef4444;
    --accent-neutral: #3b82f6;
    --text-primary: #f1f5f9;
    --font-display: 'Archivo', sans-serif;
    --font-body: 'Nunito', sans-serif;
}
```

**Signature Elements:** Trend indicators (▲ green / ▼ red), KPI cards with large numbers, Chart.js integration, minimal decoration

---

### 12. Paper & Ink

**Vibe:** Editorial, literary, thoughtful

**Typography:**
- Display: `Cormorant Garamond` (500/700) — [Google Fonts](https://fonts.google.com/specimen/Cormorant+Garamond)
- Body: `Source Serif 4` (400/600) — [Google Fonts](https://fonts.google.com/specimen/Source+Serif+4)

```css
:root {
    --bg-primary: #faf9f7;
    --text-primary: #1a1a1a;
    --text-secondary: #555;
    --accent: #c41e3a;
    --font-display: 'Cormorant Garamond', serif;
    --font-body: 'Source Serif 4', serif;
}
```

**Signature Elements:** Drop caps, pull quotes, elegant horizontal rules (`<hr>` styled), generous margins, print-inspired layout

---

## Font Pairing Quick Reference

| # | Preset | Display Font | Body Font | Source |
|---|--------|-------------|-----------|--------|
| 1 | Bold Signal | Archivo Black | Space Grotesk | Google |
| 2 | Electric Studio | Manrope 800 | Manrope 400 | Google |
| 3 | Creative Voltage | Syne 700 | Space Mono | Google |
| 4 | Dark Botanical | Cormorant 600 | IBM Plex Sans | Google |
| 5 | Notebook Tabs | Bodoni Moda | DM Sans | Google |
| 6 | Pastel Geometry | Plus Jakarta Sans 700 | Plus Jakarta Sans 400 | Google |
| 7 | Split Pastel | Outfit 700 | Outfit 400 | Google |
| 8 | Vintage Editorial | Fraunces 700 | Work Sans | Google |
| 9 | Neon Cyber | Clash Display | Satoshi | Fontshare |
| 10 | Keynote Apple | Inter Tight 700 | Inter Tight 400 | Google |
| 11 | Data Focus | Archivo 800 | Nunito 400 | Google |
| 12 | Paper & Ink | Cormorant Garamond | Source Serif 4 | Google |

---

## DO NOT USE (Generic AI Patterns)

**Fonts:** Inter, Roboto, Arial, system fonts as display text

**Colors:** `#6366f1` generic indigo, purple-to-blue gradients on white, `#8b5cf6` overused violet

**Layouts:** Everything centered, generic hero sections, identical card grids with same border-radius

**Decorations:** Realistic illustrations, gratuitous glassmorphism everywhere, drop shadows without purpose, gradient blobs on every slide

---

## CSS Gotchas

### Negating CSS Functions

```css
/* WRONG — silently ignored by browsers (no console error): */
right: -clamp(28px, 3.5vw, 44px);

/* CORRECT — wrap in calc(): */
right: calc(-1 * clamp(28px, 3.5vw, 44px));
```

CSS does not allow a leading `-` before function names. The browser silently discards the declaration.
