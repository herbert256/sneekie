'use strict';
/* Click a page → show it in real browser fullscreen, just the image on black. Esc exits. */
const pageFs = document.getElementById('page-fs');
const pageFsImg = document.getElementById('page-fs-img');
const pageFsClose = document.getElementById('page-fs-close');
let pageLastFocus = null;

function openPage(thumb){
  pageLastFocus = document.activeElement;
  pageFsImg.src = thumb.dataset.full;
  pageFsImg.alt = thumb.dataset.cap || thumb.querySelector('img')?.alt || 'Magazine page preview';
  pageFs.classList.add('on');                                  // shows it (also the fullscreen target / fallback overlay)
  pageFs.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  pageFsClose.focus({preventScroll:true});   // land focus on the Close button so keyboard users can reach it
  if(pageFs.requestFullscreen) pageFs.requestFullscreen().catch(() => {});
}

function finishClose(){
  if(!pageFs.classList.contains('on')) return;
  pageFs.classList.remove('on');
  pageFs.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  pageFsImg.removeAttribute('src');
  pageFsImg.alt = '';
  if(pageLastFocus && typeof pageLastFocus.focus === 'function'){
    pageLastFocus.focus({preventScroll:true});
  }
  pageLastFocus = null;
}

function closePage(){
  if(document.fullscreenElement === pageFs) document.exitFullscreen().catch(() => {});
  finishClose();
}

document.querySelectorAll('.thumb').forEach(t => t.addEventListener('click', () => openPage(t)));
pageFsClose.addEventListener('click', e => { e.stopPropagation(); closePage(); });
pageFs.addEventListener('click', e => { if(e.target === pageFs) closePage(); });
document.addEventListener('fullscreenchange', () => { if(!document.fullscreenElement) finishClose(); });
document.addEventListener('keydown', e => {
  if(!pageFs.classList.contains('on')) return;
  if(e.key === 'Escape'){
    e.preventDefault();
    closePage();
  } else if(e.key === 'Tab'){
    e.preventDefault();
    pageFsClose.focus({preventScroll:true});
  }
});
