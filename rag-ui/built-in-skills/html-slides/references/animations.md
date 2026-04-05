# GSAP Animation Reference

## Core Principle: Show Background First, Fade In Content

```javascript
// CORRECT: background instant, content sequential
function goToSlide(index) {
    nextSlideEl.classList.add('active');             // background: instant
    gsap.set(elements, { opacity: 0, y: 20 });      // reset content
    gsap.to(elements, { opacity: 1, y: 0, stagger: 0.1 }); // fade in
}

// WRONG: entire page fading
gsap.to(nextSlideEl, { opacity: 1, duration: 0.5 });
```

---

## Effect-to-Feeling Guide

| Feeling | Animations | Visual Cues |
|---------|-----------|-------------|
| **Dramatic** | Slow fade-ins (1-1.5s), large scale (0.9→1) | Dark backgrounds, spotlight effects |
| **Techy** | Neon glow, glitch/scramble text, grid reveals | Particle canvas, monospace, cyan/magenta |
| **Playful** | Bouncy easing (back.out), floating/bobbing | Rounded corners, pastels, hand-drawn |
| **Professional** | Subtle fast (200-300ms), clean slides | Navy/slate, precise spacing, data focus |
| **Calm** | Very slow subtle motion, gentle fades | High whitespace, muted palette, serif |
| **Editorial** | Staggered text reveals, image-text interplay | Strong type hierarchy, pull quotes, grid-breaking |

---

## Entrance Patterns

### Fade + Slide Up (Standard)

```javascript
gsap.fromTo(element,
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }
);
```

### Directional Entry

```javascript
// From left
gsap.fromTo(el, { x: -50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'power3.out' });
// From right
gsap.fromTo(el, { x: 50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'power3.out' });
// From above
gsap.fromTo(el, { y: -50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' });
```

### Scale Bounce

```javascript
gsap.fromTo(element,
    { scale: 0, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(1.7)' }
);
```

### 3D Rotation

```javascript
gsap.fromTo(element,
    { rotationX: 90, opacity: 0 },
    { rotationX: 0, opacity: 1, duration: 1, ease: 'power3.out' }
);
```

### Blur In

```javascript
gsap.fromTo(element,
    { opacity: 0, filter: 'blur(10px)' },
    { opacity: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power2.out' }
);
```

---

## Card Grid Animation

```javascript
const cards = document.querySelectorAll('.card');
gsap.fromTo(cards,
    { y: 30, opacity: 0, scale: 0.9 },
    {
        y: 0, opacity: 1, scale: 1,
        duration: 0.6, stagger: 0.1,
        ease: 'back.out(1.5)'
    }
);
```

---

## Timeline Sequences

```javascript
const tl = gsap.timeline();
tl.fromTo('#title',
    { scale: 0, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(1.7)' }
)
.fromTo('#subtitle',
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6 },
    '-=0.4'  // overlap previous by 0.4s
)
.fromTo('.content',
    { opacity: 0 },
    { opacity: 1, duration: 0.5, stagger: 0.1 },
    '-=0.2'
);
```

---

## Slide Transition Variants

### Standard (Fade — recommended)

See `goToSlide()` in SKILL.md.

### Slide Horizontal

```javascript
function goToSlide(index) {
    const direction = index > currentSlide ? 1 : -1;
    gsap.to(currentSlideEl, {
        x: direction * -100 + '%', duration: 0.6, ease: 'power2.inOut',
        onComplete: () => { currentSlideEl.classList.remove('active'); gsap.set(currentSlideEl, { x: 0 }); }
    });
    nextSlideEl.classList.add('active');
    gsap.fromTo(nextSlideEl,
        { x: direction * 100 + '%' },
        { x: 0, duration: 0.6, ease: 'power2.inOut' }
    );
}
```

### Zoom Transition

```javascript
gsap.to(currentSlideEl, {
    scale: 0.8, opacity: 0, duration: 0.5, ease: 'power2.in',
    onComplete: () => { currentSlideEl.classList.remove('active'); gsap.set(currentSlideEl, { scale: 1 }); }
});
nextSlideEl.classList.add('active');
gsap.fromTo(nextSlideEl,
    { scale: 1.2, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.5, ease: 'power2.out' }
);
```

---

## Easing Reference

### Power Series (Most Common)

| Easing | Use For |
|--------|---------|
| `power1.out` | Subtle, gentle motion |
| `power2.out` | **Standard content fade-in (default)** |
| `power3.out` | Emphasis, titles |
| `power4.out` | Dramatic entrance |
| `power2.inOut` | Slide transitions |

### Special Effects

| Easing | Use For |
|--------|---------|
| `back.out(1.7)` | Cards, titles (overshoot bounce) |
| `elastic.out(1, 0.5)` | Icons, badges (spring effect) |
| `bounce.out` | Playful, casual |
| `expo.out` | Fast deceleration |

---

## Stagger Patterns

```javascript
// Fixed delay
gsap.to('.items', { opacity: 1, stagger: 0.1 });

// From center outward
gsap.to('.items', { opacity: 1, stagger: { amount: 1, from: 'center' } });

// Grid pattern (4 columns, 3 rows)
gsap.to('.items', { opacity: 1, stagger: { amount: 1.5, grid: [4, 3], from: 'start' } });
```

---

## Background Effects (CSS)

### Gradient Mesh

```css
.gradient-bg {
    background:
        radial-gradient(ellipse at 20% 80%, rgba(120, 0, 255, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(0, 255, 200, 0.2) 0%, transparent 50%),
        var(--bg-primary);
}
```

### Noise Texture

```css
.noise-bg::after {
    content: ''; position: absolute; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events: none; z-index: 1;
}
```

### Grid Pattern

```css
.grid-bg {
    background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 50px 50px;
}
```

---

## Glass Panel

```css
.glass-panel {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
}
```

---

## Performance Tips

```javascript
// GOOD: GPU-accelerated properties
gsap.to(el, { x: 100, y: 50, opacity: 0.5, scale: 1.2 });

// AVOID: CPU-intensive layout properties
gsap.to(el, { left: 100, top: 50, width: 200 });
```

```css
/* Hint GPU acceleration for animated elements */
.anim-elem { will-change: transform, opacity; }
```

- Batch initial states: `gsap.set(allElements, { opacity: 0, y: 20 })`
- Use `stagger` instead of manual delays
- Prefer `transform` + `opacity` — avoid `width`, `height`, `top`, `left`
