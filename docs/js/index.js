'use strict';

const game = document.getElementById('game');
game.addEventListener('load', () => game.focus());
addEventListener('pointerdown', () => game.focus(), {passive:true});
