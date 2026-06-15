'use strict';

function useCleanUrls(){
  return location.hostname === 'sneekie.xyz' || location.hostname === 'www.sneekie.xyz';
}

function pageHref(path){
  return useCleanUrls() ? path.replace(/\.html$/, '') : path;
}

const game = document.getElementById('game');
game.src = pageHref('html/game.html');
game.addEventListener('load', () => game.focus());
addEventListener('pointerdown', () => game.focus(), {passive:true});
