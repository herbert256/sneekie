'use strict';

const pageFs = document.getElementById('page-fs');
const pageFsClose = document.getElementById('page-fs-close');
const pagePrev = document.getElementById('page-prev');
const pageNext = document.getElementById('page-next');
const pageStage = document.getElementById('page-stage');
const pageFsCaption = document.getElementById('page-fs-caption');
const pageZoomOut = document.getElementById('page-zoom-out');
const pageZoomReset = document.getElementById('page-zoom-reset');
const pageZoomIn = document.getElementById('page-zoom-in');
const pageThumbs = Array.from(document.querySelectorAll('.page-gallery .thumb[data-full]'));

if(pageFs && pageFsClose && pageStage && pageFsCaption && pageThumbs.length){
  let pageLastFocus = null;
  let pageIndex = 0;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let drag = null;
  let pinch = null;
  let pageFsImg = null;
  const pointers = new Map();
  const minScale = 1;
  const maxScale = 4;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const isOpen = () => pageFs.classList.contains('on');
  const wrapPage = index => (index + pageThumbs.length) % pageThumbs.length;
  const focusables = () => [pageFsClose, pagePrev, pageNext, pageZoomOut, pageZoomReset, pageZoomIn].filter(Boolean);
  const previewFallback = pageFs.dataset.previewFallback || 'Magazine page preview';

  function pageCaption(thumb){
    return thumb.dataset.cap || thumb.querySelector('img')?.alt || previewFallback;
  }

  function ensurePageImage(){
    if(pageFsImg && pageFsImg.isConnected) return pageFsImg;
    pageFsImg = document.createElement('img');
    pageFsImg.id = 'page-fs-img';
    pageFsImg.alt = '';
    pageFsImg.addEventListener('load', updateTransform);
    pageStage.appendChild(pageFsImg);
    return pageFsImg;
  }

  function removePageImage(){
    if(!pageFsImg) return;
    pageFsImg.remove();
    pageFsImg = null;
  }

  function clampOffset(){
    if(scale <= minScale || !pageFsImg?.offsetWidth || !pageFsImg?.offsetHeight){
      offsetX = 0;
      offsetY = 0;
      return;
    }
    const maxX = Math.max(0, (pageFsImg.offsetWidth * scale - pageStage.clientWidth) / 2);
    const maxY = Math.max(0, (pageFsImg.offsetHeight * scale - pageStage.clientHeight) / 2);
    offsetX = clamp(offsetX, -maxX, maxX);
    offsetY = clamp(offsetY, -maxY, maxY);
  }

  function updateTransform(){
    clampOffset();
    if(!pageFsImg) return;
    pageFsImg.style.transform = `translate3d(${Math.round(offsetX)}px, ${Math.round(offsetY)}px, 0) scale(${scale.toFixed(3)})`;
    pageStage.classList.toggle('is-zoomed', scale > 1.01);
    pageZoomReset.textContent = `${Math.round(scale * 100)}%`;
  }

  function setScale(nextScale, point){
    const previousScale = scale;
    scale = clamp(nextScale, minScale, maxScale);
    if(scale === minScale){
      offsetX = 0;
      offsetY = 0;
    } else if(point && previousScale !== scale){
      const stageBox = pageStage.getBoundingClientRect();
      const centerX = stageBox.left + stageBox.width / 2;
      const centerY = stageBox.top + stageBox.height / 2;
      const ratio = scale / previousScale;
      offsetX -= (point.x - centerX - offsetX) * (ratio - 1);
      offsetY -= (point.y - centerY - offsetY) * (ratio - 1);
    }
    updateTransform();
  }

  function resetZoom(){
    scale = minScale;
    offsetX = 0;
    offsetY = 0;
    updateTransform();
  }

  function showPage(index){
    pageIndex = wrapPage(index);
    const thumb = pageThumbs[pageIndex];
    const caption = pageCaption(thumb);
    const image = ensurePageImage();
    image.src = thumb.dataset.full;
    image.alt = caption;
    pageFsCaption.textContent = caption;
    pointers.clear();
    drag = null;
    pinch = null;
    resetZoom();
  }

  function openPage(index){
    pageLastFocus = document.activeElement;
    showPage(index);
    pageFs.classList.add('on');
    pageFs.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    pageFsClose.focus({ preventScroll:true });
    if(pageFs.requestFullscreen){
      pageFs.requestFullscreen().catch(() => {});
    }
  }

  function finishClose(){
    if(!isOpen()) return;
    pageFs.classList.remove('on');
    pageFs.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    pageFsCaption.textContent = '';
    pointers.clear();
    drag = null;
    pinch = null;
    resetZoom();
    removePageImage();
    if(pageLastFocus && typeof pageLastFocus.focus === 'function'){
      pageLastFocus.focus({ preventScroll:true });
    }
    pageLastFocus = null;
  }

  function closePage(){
    if(document.fullscreenElement === pageFs && document.exitFullscreen){
      document.exitFullscreen().catch(() => {}).finally(finishClose);
      return;
    }
    finishClose();
  }

  function previousPage(){
    showPage(pageIndex - 1);
  }

  function nextPage(){
    showPage(pageIndex + 1);
  }

  function zoomBy(amount, point){
    setScale(scale + amount, point || null);
  }

  function pointDistance(a, b){
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointCenter(a, b){
    return { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 };
  }

  function pointerList(){
    return Array.from(pointers.values());
  }

  function startDrag(e){
    drag = {
      id:e.pointerId,
      startX:e.clientX,
      startY:e.clientY,
      lastX:e.clientX,
      lastY:e.clientY,
      startOffsetX:offsetX,
      startOffsetY:offsetY
    };
  }

  pageThumbs.forEach((thumb, index) => {
    thumb.addEventListener('click', () => openPage(index));
  });

  pageFsClose.addEventListener('click', e => {
    e.stopPropagation();
    closePage();
  });

  pagePrev?.addEventListener('click', e => {
    e.stopPropagation();
    previousPage();
  });

  pageNext?.addEventListener('click', e => {
    e.stopPropagation();
    nextPage();
  });

  pageZoomOut?.addEventListener('click', e => {
    e.stopPropagation();
    zoomBy(-0.35);
  });

  pageZoomReset?.addEventListener('click', e => {
    e.stopPropagation();
    resetZoom();
  });

  pageZoomIn?.addEventListener('click', e => {
    e.stopPropagation();
    zoomBy(0.35);
  });

  pageStage.addEventListener('wheel', e => {
    if(!isOpen()) return;
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -0.25 : 0.25, { x:e.clientX, y:e.clientY });
  }, { passive:false });

  pageStage.addEventListener('dblclick', e => {
    if(scale > 1.01) resetZoom();
    else setScale(2, { x:e.clientX, y:e.clientY });
  });

  pageStage.addEventListener('pointerdown', e => {
    if(!isOpen()) return;
    pageStage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pointers.size === 1){
      startDrag(e);
      pinch = null;
    } else if(pointers.size === 2){
      const [a, b] = pointerList();
      pinch = {
        startDistance:pointDistance(a, b),
        startScale:scale
      };
      drag = null;
    }
  });

  pageStage.addEventListener('pointermove', e => {
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pinch && pointers.size >= 2){
      const [a, b] = pointerList();
      const distance = pointDistance(a, b);
      if(pinch.startDistance > 0){
        setScale(pinch.startScale * (distance / pinch.startDistance), pointCenter(a, b));
      }
      return;
    }
    if(drag && drag.id === e.pointerId){
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      if(scale > 1.01){
        offsetX = drag.startOffsetX + e.clientX - drag.startX;
        offsetY = drag.startOffsetY + e.clientY - drag.startY;
        updateTransform();
      }
    }
  });

  function endPointer(e){
    const canSwipe = drag && drag.id === e.pointerId && scale <= 1.01 && pointers.size === 1;
    if(canSwipe){
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if(Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.35){
        if(dx < 0) nextPage();
        else previousPage();
      }
    }
    pointers.delete(e.pointerId);
    try { pageStage.releasePointerCapture(e.pointerId); } catch(_) {}
    if(pointers.size === 1){
      const [remaining] = pointers.entries();
      const [id, point] = remaining;
      drag = {
        id,
        startX:point.x,
        startY:point.y,
        lastX:point.x,
        lastY:point.y,
        startOffsetX:offsetX,
        startOffsetY:offsetY
      };
      pinch = null;
    } else {
      drag = null;
      pinch = null;
    }
  }

  pageStage.addEventListener('pointerup', endPointer);
  pageStage.addEventListener('pointercancel', endPointer);

  document.addEventListener('fullscreenchange', () => {
    if(!document.fullscreenElement) finishClose();
  });

  document.addEventListener('keydown', e => {
    if(!isOpen()) return;
    if(e.key === 'Escape'){
      e.preventDefault();
      closePage();
    } else if(e.key === 'ArrowLeft'){
      e.preventDefault();
      previousPage();
    } else if(e.key === 'ArrowRight'){
      e.preventDefault();
      nextPage();
    } else if(e.key === '+' || e.key === '='){
      e.preventDefault();
      zoomBy(0.35);
    } else if(e.key === '-' || e.key === '_'){
      e.preventDefault();
      zoomBy(-0.35);
    } else if(e.key === '0'){
      e.preventDefault();
      resetZoom();
    } else if(e.key === 'Tab'){
      const items = focusables();
      const current = items.indexOf(document.activeElement);
      const next = e.shiftKey
        ? (current <= 0 ? items.length - 1 : current - 1)
        : (current < 0 || current === items.length - 1 ? 0 : current + 1);
      e.preventDefault();
      items[next]?.focus({ preventScroll:true });
    }
  });
}
