'use strict';
/* Click a page → show it in real browser fullscreen, just the image on black. Esc exits. */
const pageFs = document.getElementById('page-fs');
const pageFsClose = document.getElementById('page-fs-close');
let pageFsImg = null;
let pageLastFocus = null;
const magText = key => typeof window.sneekieText === 'function' ? window.sneekieText(key) : key;

function ensurePageFsImg(){
  if(pageFsImg) return pageFsImg;
  pageFsImg = document.createElement('img');
  pageFsImg.id = 'page-fs-img';
  pageFsImg.alt = '';
  pageFs.appendChild(pageFsImg);
  return pageFsImg;
}

function openPage(thumb){
  pageLastFocus = document.activeElement;
  const preview = ensurePageFsImg();
  preview.src = thumb.dataset.full;
  preview.alt = thumb.dataset.cap || thumb.querySelector('img')?.alt || magText('magazinePreviewFallback');
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
  if(pageFsImg){ pageFsImg.remove(); pageFsImg = null; }
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
