const fs = require('fs');

const svg = fs.readFileSync('public/assets/logo.svg', 'utf8')
  .replace('<?xml version="1.0" encoding="UTF-8"?>', '')
  .replace('xmlns="http://www.w3.org/2000/svg" ', '');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Preview - Splash Screen Caule</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0c1322;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #4edea3;
    font-family: system-ui, -apple-system, sans-serif;
    gap: 30px;
    padding: 20px;
  }
  .stage {
    position: relative;
    width: 280px;
    height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .seed {
    position: absolute;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #1dd882, #0D9B63);
    box-shadow: 0 0 20px rgba(13,155,99,0.6);
    z-index: 10;
  }
  .svg-wrap {
    position: absolute;
    width: 240px;
    height: 240px;
  }
  .svg-wrap svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
    max-width: 400px;
  }
  button {
    padding: 10px 18px;
    border: 1px solid #0D9B63;
    background: transparent;
    color: #4edea3;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }
  button:hover, button.active {
    background: #0D9B63;
    color: #0c1322;
  }
  .info {
    font-size: 12px;
    color: #5a7a6e;
    text-align: center;
    line-height: 1.7;
  }
  @keyframes seedLife {
    0%   { opacity: 1; transform: scale(1); }
    40%  { transform: scale(1.3); }
    70%  { opacity: 1; transform: scale(0.9); }
    100% { opacity: 0; transform: scale(0.1); }
  }
  @keyframes stemGrow {
    0%   { opacity: 0; transform: scaleY(0); }
    5%   { opacity: 1; }
    100% { opacity: 1; transform: scaleY(1); }
  }
  @keyframes petalBloom {
    0%   { opacity: 0; transform: scale(0.2) rotate(-15deg); }
    70%  { transform: scale(1.05) rotate(2deg); }
    100% { opacity: 1; transform: scale(1) rotate(0deg); }
  }
  .anim-seed   { animation: seedLife 1.0s ease-out forwards; }
  .anim-stem   { animation: stemGrow 2.0s cubic-bezier(0.4, 0, 0.2, 1) forwards; opacity: 0; animation-delay: 0.5s; }
  .anim-orange { animation: petalBloom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0; animation-delay: 2.0s; }
  .anim-blue   { animation: petalBloom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0; animation-delay: 2.8s; }
  .paused .anim-seed,
  .paused .anim-stem,
  .paused .anim-orange,
  .paused .anim-blue {
    animation: none !important;
    opacity: 0;
  }
  .paused .anim-seed { opacity: 1; transform: scale(1); }
  .debug .anim-seed,
  .debug .anim-stem,
  .debug .anim-orange,
  .debug .anim-blue {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
</style>
</head>
<body>
  <div class="stage paused" id="stage">
    <div class="seed" id="seed"></div>
    <div class="svg-wrap">
      ${svg}
    </div>
  </div>
  <div class="controls">
    <button onclick="play()">▶ Reproduzir</button>
    <button onclick="pause()">⏸ Pausar</button>
    <button onclick="toggleDebug()">👁 Mostrar tudo</button>
  </div>
  <div class="info">
    0.0s — Semente verde pulsa<br>
    0.5s — Semente some + caule começa a crescer<br>
    2.0s — Pétala laranja brota<br>
    2.8s — Pétalas azuis brotam<br>
    ~4s — Animação completa
  </div>
  <script>
    const stage = document.getElementById('stage');
    const seed = document.getElementById('seed');
    const stem = document.getElementById('caule-stem') || document.getElementById('caule-green');
    const orange = document.getElementById('petal-orange') || document.getElementById('folha-orange');
    const blue = document.getElementById('petal-blue') || document.getElementById('petala-blue');
    if (stem) stem.classList.add('anim-stem');
    if (orange) orange.classList.add('anim-orange');
    if (blue) blue.classList.add('anim-blue');
    console.log('Elements found:', { stem: !!stem, orange: !!orange, blue: !!blue });
    function play() {
      stage.classList.remove('debug');
      stage.classList.add('paused');
      void stage.offsetWidth;
      stage.classList.remove('paused');
      seed.classList.add('anim-seed');
    }
    function pause() {
      stage.classList.add('paused');
    }
    function toggleDebug() {
      stage.classList.toggle('debug');
    }
    setTimeout(play, 500);
  </script>
</body>
</html>`;

fs.writeFileSync('splash-preview.html', html, 'utf8');
console.log('Generated splash-preview.html');
