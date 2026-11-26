/* PHOTOREAL sprites - real candy photos, same API as before */
(function () {
  'use strict';

  // Keep EXACT same order - game-core.js uses type index -> ORDER[index]
  // 0=soda, 1=jelly, 2=donut, 3=strawberry, 4=lollipop, 5=chocolate, 6=bearY, 7=cherry, 8=sugar, 9=bearG, 10=bearP
  const ORDER = ['soda', 'jelly', 'donut', 'strawberry', 'lollipop', 'chocolate', 'bearY', 'cherry', 'sugar', 'bearG', 'bearP'];

  // Real photos - Unsplash, high-res, cropped square
  const PHOTOS = {
    // 0 - Real cola soda can - glossy, real condensation
    soda: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&q=90&fit=crop&crop=center',
    // 1 - Real blue jelly / gummy
    jelly: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&q=90&fit=crop&crop=center',
    // 2 - Real pink donut with sprinkles
    donut: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400&q=90&fit=crop&crop=center',
    // 3 - Real strawberry - fresh, seeds, shine
    strawberry: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&q=90&fit=crop&crop=center',
    // 4 - Real swirl lollipop
    lollipop: 'https://images.unsplash.com/photo-1560008581-09826d1de69e?w=400&q=90&fit=crop&crop=center',
    // 5 - Real chocolate bar
    chocolate: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&q=90&fit=crop&crop=center',
    // 6 - Real yellow gummy bear
    bearY: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&q=90&fit=crop&crop=center',
    // 7 - Real cherries
    cherry: 'https://images.unsplash.com/photo-1502741224143-90386d7f8c82?w=400&q=90&fit=crop&crop=center',
    // 8 - Real sugar cubes / rock candy
    sugar: 'https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=400&q=90&fit=crop&crop=center',
    // 9 - Real green gummy bear
    bearG: 'https://images.unsplash.com/photo-1613919113640-25732ec5e61f?w=400&q=90&fit=crop&crop=center',
    // 10 - Real pink gummy bear
    bearP: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&q=90&fit=crop&crop=center',
    // avatar stays cartoon - not a candy
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&q=80&fit=crop'
  };

  const cache = {};
  function url(name) {
    if (cache[name]) return cache[name];
    // Return real photo URL directly - no canvas drawing
    // Preload to make board load fast
    const src = PHOTOS[name] || PHOTOS['jelly'];
    const img = new Image();
    img.src = src;
    return (cache[name] = src);
  }

  // Preload all so game doesn't flicker on first board
  ORDER.forEach(n => { const i = new Image(); i.src = PHOTOS[n]; });

  window.Sprites = { ORDER, url, forType: (t) => url(ORDER[t % ORDER.length]) };
})();
