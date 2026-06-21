'use strict';

/* ---- lightbox: click a layout image to pop up a big version (X / Esc / backdrop to close) ---- */
const lb = document.getElementById('lb');
const lbClose = document.getElementById('lb-close');
let lbImg = null;
let lbLastFocus = null;
const openLargerLabel = document.body.dataset.openLarger || '';
const layoutPreviewFallback = document.body.dataset.layoutPreviewFallback || 'layout preview';

function ensureLbImg(){
  if(lbImg) return lbImg;
  lbImg = document.createElement('img');
  lbImg.id = 'lb-img';
  lbImg.alt = '';
  lb.appendChild(lbImg);
  return lbImg;
}

function openLb(img){
  lbLastFocus = document.activeElement;
  const preview = ensureLbImg();
  preview.src = img.src; preview.alt = img.alt || '';
  lb.classList.add('on'); lb.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  lbClose.focus({preventScroll:true});
}

function closeLb(){
  if(!lb.classList.contains('on')) return;
  lb.classList.remove('on'); lb.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if(lbImg){ lbImg.remove(); lbImg = null; }
  if(lbLastFocus && typeof lbLastFocus.focus === 'function'){
    lbLastFocus.focus({preventScroll:true});
  }
  lbLastFocus = null;
}

document.querySelectorAll('.gallery .lay img').forEach(img => {
  img.tabIndex = 0;
  img.setAttribute('role', 'button');
  img.setAttribute('aria-label', openLargerLabel + (img.alt || layoutPreviewFallback));
  img.addEventListener('click', () => openLb(img));
  img.addEventListener('keydown', e => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      openLb(img);
    }
  });
});
lbClose.addEventListener('click', closeLb);
lb.addEventListener('click', e => { if(e.target !== lbImg) closeLb(); });          // click anywhere but the image closes
document.addEventListener('keydown', e => {
  if(!lb.classList.contains('on')) return;
  if(e.key === 'Escape'){
    e.preventDefault();
    closeLb();
  } else if(e.key === 'Tab'){
    e.preventDefault();
    lbClose.focus({preventScroll:true});
  }
});
