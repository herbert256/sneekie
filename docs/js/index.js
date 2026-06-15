'use strict';

function useCleanUrls(){
  return location.hostname === 'sneekie.xyz' || location.hostname === 'www.sneekie.xyz';
}

function pageHref(path){
  return useCleanUrls() ? path.replace(/\.html$/, '') : path;
}

const game = document.getElementById('game');
const src = pageHref('html/game.html');
if(new URL(game.getAttribute('src') || '', location.href).href !== new URL(src, location.href).href){
  game.src = src;
}
game.addEventListener('load', () => game.focus());
addEventListener('pointerdown', () => game.focus(), {passive:true});
