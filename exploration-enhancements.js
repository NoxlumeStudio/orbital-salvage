/* Shared, opt-in exploration camera and scanner. Never changes hotspot coordinates. */
(() => {
  'use strict';
  function mount({ viewport, scene, scanButton, resetButton, onScan = () => {} }) {
    if (!viewport || !scene) return null;
    const points = new Map();
    let scale = 1, panX = 0, panY = 0, scanning = false;
    let dragging = false, moved = false, blockClickUntil = 0;
    let gestureStart = null;
    const limit = (value, min, max) => Math.max(min, Math.min(max, value));
    function bounds() {
      return { x: (scale - 1) * viewport.clientWidth / 2, y: (scale - 1) * viewport.clientHeight / 2 };
    }
    function paint() {
      const max = bounds();
      panX = limit(panX, -max.x, max.x);
      panY = limit(panY, -max.y, max.y);
      scene.style.transform = `translate3d(${panX}px,${panY}px,0) scale(${scale})`;
      viewport.classList.toggle('explore-zoomed', scale > 1.005);
      if (resetButton) resetButton.disabled = scale <= 1.005;
    }
    function zoom(next, clientX, clientY) {
      const previous = scale;
      const target = limit(next, 1, 3);
      if (Math.abs(target - previous) < .001) return;
      const rect = viewport.getBoundingClientRect();
      const offsetX = clientX - rect.left - rect.width / 2;
      const offsetY = clientY - rect.top - rect.height / 2;
      const ratio = target / previous;
      panX = offsetX - (offsetX - panX) * ratio;
      panY = offsetY - (offsetY - panY) * ratio;
      scale = target;
      paint();
    }
    function reset() { scale = 1; panX = 0; panY = 0; paint(); }
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    function onPointerDown(e) {
      if (!e.isPrimary && e.pointerType === 'mouse') return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragging = false;
      moved = false;
      if (points.size === 2) {
        const [a, b] = [...points.values()];
        gestureStart = { gap: distance(a,b), scale, center: middle(a,b) };
      }
    }
    function onPointerMove(e) {
      const old = points.get(e.pointerId);
      if (!old) return;
      points.set(e.pointerId, { x:e.clientX, y:e.clientY });
      if (points.size >= 2) {
        const [a,b] = [...points.values()];
        const mid = middle(a,b);
        if (!gestureStart) gestureStart = {gap:distance(a,b),scale,center:mid};
        zoom(gestureStart.scale * distance(a,b) / Math.max(1,gestureStart.gap), mid.x, mid.y);
        panX += mid.x - gestureStart.center.x;
        panY += mid.y - gestureStart.center.y;
        gestureStart = {gap:distance(a,b),scale,center:mid};
        moved = true;
        paint();
        return;
      }
      if (scale > 1.005) {
        const dx = e.clientX-old.x, dy=e.clientY-old.y;
        if (Math.hypot(dx,dy)>1) {panX+=dx;panY+=dy;dragging=true;moved=true;paint();}
      }
    }
    function onPointerUp(e) {
      points.delete(e.pointerId);
      if (moved || dragging) blockClickUntil = performance.now() + 350;
      if (points.size < 2) gestureStart=null;
      if (!points.size) {dragging=false;moved=false;}
    }
    function onWheel(e) {
      e.preventDefault();
      zoom(scale * (e.deltaY < 0 ? 1.16 : 1/1.16),e.clientX,e.clientY);
    }
    function onClickCapture(e) {
      if (performance.now() < blockClickUntil) {e.preventDefault();e.stopImmediatePropagation();}
    }
    function setScanner(on) {
      scanning=!!on;
      viewport.classList.toggle('explore-scanning',scanning);
      if (scanButton) {scanButton.setAttribute('aria-pressed',String(scanning));scanButton.textContent=scanning?'スキャン終了':'スキャン';}
      if (scanning) {
        viewport.classList.remove('scan-sweep');
        void viewport.offsetWidth;
        viewport.classList.add('scan-sweep');
        onScan();
      } else viewport.classList.remove('scan-sweep');
    }
    viewport.addEventListener('pointerdown',onPointerDown);
    viewport.addEventListener('pointermove',onPointerMove);
    window.addEventListener('pointerup',onPointerUp);
    window.addEventListener('pointercancel',onPointerUp);
    viewport.addEventListener('click',onClickCapture,true);
    viewport.addEventListener('wheel',onWheel,{passive:false});
    scanButton?.addEventListener('click',()=>setScanner(!scanning));
    resetButton?.addEventListener('click',reset);
    window.addEventListener('resize',paint);
    paint();
    function destroy() {
      viewport.removeEventListener('pointerdown',onPointerDown);
      viewport.removeEventListener('pointermove',onPointerMove);
      window.removeEventListener('pointerup',onPointerUp);
      window.removeEventListener('pointercancel',onPointerUp);
      viewport.removeEventListener('click',onClickCapture,true);
      viewport.removeEventListener('wheel',onWheel);
      window.removeEventListener('resize',paint);
      points.clear();
    }
    return {reset, zoom, setScanner, isScanning:()=>scanning, destroy};
  }
  window.ExplorationEnhancements={mount};
})();
