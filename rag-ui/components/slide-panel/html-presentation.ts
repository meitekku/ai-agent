import { SLIDE_CDN_HEAD } from "./constants";

/**
 * Build a self-contained HTML presentation file from slide HTMLs.
 * Features: keyboard/click navigation, transitions, fullscreen API, Wake Lock, progress bar.
 */
export function buildPresentationHtml(
  slides: { title: string; html: string }[],
  deckTitle: string,
): string {
  const escapedSlides = slides.map((s) =>
    s.html.replace(/<\/script>/gi, "<\\/script>"),
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(deckTitle)}</title>
${SLIDE_CDN_HEAD}
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#000;font-family:'Noto Sans JP','Inter',sans-serif}

/* Slide container */
.deck{position:relative;width:100vw;height:100vh;overflow:hidden}
.slide{
  position:absolute;inset:0;
  display:flex;align-items:center;justify-content:center;
  opacity:0;pointer-events:none;
  transition:opacity .45s ease,transform .45s ease;
  transform:translateX(40px);
}
.slide.active{opacity:1;pointer-events:auto;transform:translateX(0)}
.slide.prev{opacity:0;transform:translateX(-40px)}
.slide-inner{
  width:1280px;height:720px;
  transform-origin:center center;
  overflow:hidden;
  box-shadow:0 8px 32px rgba(0,0,0,0.4);
}

/* Controls overlay */
.controls{
  position:fixed;bottom:0;left:0;right:0;
  display:flex;align-items:center;justify-content:space-between;
  padding:8px 20px;
  background:linear-gradient(transparent,rgba(0,0,0,0.7));
  opacity:0;transition:opacity .3s;z-index:100;
  color:#fff;font-size:13px;
}
.deck:hover .controls,.controls:focus-within{opacity:1}
.controls button{
  background:rgba(255,255,255,0.15);border:none;color:#fff;
  border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;
  transition:background .2s;
}
.controls button:hover{background:rgba(255,255,255,0.3)}

/* Progress bar */
.progress{
  position:fixed;top:0;left:0;height:3px;
  background:rgba(59,130,246,0.8);
  transition:width .3s ease;z-index:101;
}

/* Cursor auto-hide */
.deck.presenting{cursor:none}
.deck.presenting:hover{cursor:default}
.deck.presenting .controls{cursor:default}

/* Print */
@media print{
  .controls,.progress{display:none!important}
  body{background:#fff}
  .slide{
    position:relative!important;opacity:1!important;
    transform:none!important;pointer-events:auto!important;
    page-break-after:always;
  }
  .slide-inner{box-shadow:none;transform:none!important}
}
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<div class="deck" id="deck">
${escapedSlides.map((html, i) => `  <div class="slide${i === 0 ? " active" : ""}" data-index="${i}"><div class="slide-inner">${html}</div></div>`).join("\n")}

  <div class="controls" id="controls">
    <div style="display:flex;align-items:center;gap:12px">
      <button onclick="prev()" title="前へ (←)">◀</button>
      <span id="counter">1 / ${slides.length}</span>
      <button onclick="next()" title="次へ (→)">▶</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <button onclick="toggleFS()" id="fsbtn" title="全画面 (F11 / F)">⛶ 全画面</button>
    </div>
  </div>
</div>

<script>
(function(){
  var current=0,total=${slides.length};
  var slides=document.querySelectorAll('.slide');
  var counter=document.getElementById('counter');
  var progress=document.getElementById('progress');

  function show(n,dir){
    if(n<0||n>=total)return;
    var old=current;current=n;
    for(var i=0;i<total;i++){
      slides[i].className='slide'+(i===n?' active':i<n?' prev':'');
    }
    counter.textContent=(n+1)+' / '+total;
    progress.style.width=((n+1)/total*100)+'%';
  }

  window.next=function(){show(current+1,1)};
  window.prev=function(){show(current-1,-1)};

  // Keyboard
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' '||e.key==='Enter'){e.preventDefault();next()}
    else if(e.key==='ArrowLeft'||e.key==='Backspace'){e.preventDefault();prev()}
    else if(e.key==='Home'){e.preventDefault();show(0)}
    else if(e.key==='End'){e.preventDefault();show(total-1)}
    else if(e.key==='f'||e.key==='F'){toggleFS()}
    else if(e.key==='Escape'&&document.fullscreenElement){document.exitFullscreen()}
  });

  // Click navigation (left 30% = prev, right 70% = next)
  document.getElementById('deck').addEventListener('click',function(e){
    if(e.target.closest('.controls'))return;
    if(e.target.closest('[data-editable]'))return;
    var x=e.clientX/window.innerWidth;
    if(x<0.3)prev();else next();
  });

  // Touch swipe
  var tx=0;
  document.addEventListener('touchstart',function(e){tx=e.changedTouches[0].clientX},{passive:true});
  document.addEventListener('touchend',function(e){
    var dx=e.changedTouches[0].clientX-tx;
    if(Math.abs(dx)>50){dx<0?next():prev()}
  },{passive:true});

  // Fullscreen
  window.toggleFS=function(){
    if(!document.fullscreenElement){document.documentElement.requestFullscreen().catch(function(){})}
    else{document.exitFullscreen()}
  };

  // Wake Lock (prevent screen dimming)
  var wakeLock=null;
  async function requestWakeLock(){
    try{if('wakeLock' in navigator){wakeLock=await navigator.wakeLock.request('screen')}}catch(e){}
  }
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible')requestWakeLock();
  });
  requestWakeLock();

  // Auto-scale slides to fit viewport
  function scaleSlides(){
    var vw=window.innerWidth,vh=window.innerHeight;
    var scale=Math.min(vw/1280,vh/720);
    var inners=document.querySelectorAll('.slide-inner');
    for(var i=0;i<inners.length;i++){
      inners[i].style.transform='scale('+scale+')';
    }
  }
  window.addEventListener('resize',scaleSlides);
  scaleSlides();

  // Initialize progress
  progress.style.width=(1/total*100)+'%';

  // Lucide icons
  if(typeof lucide!=='undefined')lucide.createIcons();
})();
<\/script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
