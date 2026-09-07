
  // subtle nav border on scroll
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 8);
  }, {passive:true});

  // close other FAQs when one opens (accordion behaviour)
  document.querySelectorAll('details.faq').forEach(d => {
    d.addEventListener('toggle', () => {
      if (d.open) {
        document.querySelectorAll('details.faq').forEach(other => {
          if (other !== d) other.open = false;
        });
      }
    });
  });

  // ==================== FLUID RIPPLES (reusable) ====================
  // A genuine 2D wave-equation simulation on a low-resolution height-field.
  // Each cell stores water height; every frame we propagate the wave to
  // neighbours and apply damping, exactly like the classic Hugo Elias
  // water effect. The result is rendered into ImageData using a base
  // colour modulated by the surface gradient (peaks lighter, troughs
  // darker — true refraction shading, not drawn rings).
  // Drops happen occasionally and on click, sending real waves across
  // the surface that bounce, interfere, and decay naturally.
  function mountFluidRipples(canvas, opts){
    if (!canvas) return;
    opts = opts || {};
    const BASE_R = opts.baseR ?? 245;
    const BASE_G = opts.baseG ?? 241;
    const BASE_B = opts.baseB ?? 232;
    // Tonal response per gradient unit. Auto-pick a sensible default
    // based on whether the base colour is dark or light so the ripples
    // stay visible on either.
    const luma = 0.299 * BASE_R + 0.587 * BASE_G + 0.114 * BASE_B;
    const SHADE = opts.shade ?? (luma < 128 ? 0.10 : 0.06);
    const AUTO_DROP_MIN = opts.autoDropMin ?? 2400;
    const AUTO_DROP_RANGE = opts.autoDropRange ?? 3200;
    const HOVER_POKE = opts.hoverPoke ?? 90;
    const CLICK_POKE = opts.clickPoke ?? 1400;
    const AUTO_POKE_MIN = opts.autoPokeMin ?? 700;
    const AUTO_POKE_RANGE = opts.autoPokeRange ?? 600;

    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    // Pixel-art smoothing off so upscale stays crisp-ish (browser still
    // bilinear-filters the drawImage step, which we want for softness).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Low-res simulation grid — high enough for nice waves, low enough
    // that we can run a full 2D propagation every frame at 60fps.
    const GRID_W = opts.gridW ?? 220;
    const GRID_H = opts.gridH ?? 140;

    // Two height buffers (ping-pong). Values are roughly in [-2048, 2048].
    let cur  = new Int16Array(GRID_W * GRID_H);
    let prev = new Int16Array(GRID_W * GRID_H);

    const sim = document.createElement('canvas');
    sim.width = GRID_W;
    sim.height = GRID_H;
    const sctx = sim.getContext('2d');
    const imgData = sctx.createImageData(GRID_W, GRID_H);

    let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

    function resize(){
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    // Inject energy at (gx,gy) — a "drop" of given strength
    function poke(gx, gy, strength){
      gx = gx | 0; gy = gy | 0;
      if (gx < 2 || gx > GRID_W - 3 || gy < 2 || gy > GRID_H - 3) return;
      // Soft drop: a small Gaussian-ish dot rather than a single pixel,
      // so the leading wavefront is smooth instead of pixelated.
      const radius = 3;
      for (let dy = -radius; dy <= radius; dy++){
        for (let dx = -radius; dx <= radius; dx++){
          const d2 = dx*dx + dy*dy;
          if (d2 > radius*radius) continue;
          const falloff = 1 - Math.sqrt(d2) / (radius + 1);
          prev[(gy + dy) * GRID_W + (gx + dx)] += (strength * falloff) | 0;
        }
      }
    }

    // One wave-equation step.
    // new = (left + right + up + down) / 2 - prev,  then * damping
    // This is the standard 2D wave-equation FD scheme.
    function step(){
      const w = GRID_W, h = GRID_H;
      // Damping: 1 = no decay; <1 = waves lose energy. 0.985 = lazy fade.
      // Implemented as multiply-then-shift to stay fast.
      // We do `new = ((sum)>>1) - prev` then `new -= new>>6` (≈ *0.984)
      for (let y = 1; y < h - 1; y++){
        const row = y * w;
        const rowU = row - w;
        const rowD = row + w;
        for (let x = 1; x < w - 1; x++){
          const i = row + x;
          const sum = cur[i - 1] + cur[i + 1] + cur[rowU + x] + cur[rowD + x];
          let v = (sum >> 1) - prev[i];
          v -= v >> 6; // damping
          prev[i] = v;
        }
      }
      // Swap buffers
      const tmp = cur; cur = prev; prev = tmp;
    }

    // Render the height-field into ImageData using the base tone.
    // Shading: for each cell, sample the X gradient (height diff with
    // left neighbour). A positive gradient → highlight (lighter); negative
    // → shadow (darker). This is the cheap-but-convincing refraction look.
    function render(){
      const data = imgData.data;
      const w = GRID_W, h = GRID_H;
      for (let y = 0; y < h; y++){
        const row = y * w;
        for (let x = 0; x < w; x++){
          const i = row + x;
          // X-gradient from neighbour to the left (clamped at edges)
          const xl = x > 0 ? cur[i - 1] : cur[i];
          const grad = cur[i] - xl;
          // Map gradient → tonal offset
          const t = grad * SHADE;
          let r = BASE_R + t;
          let g = BASE_G + t * 0.95;
          let b = BASE_B + t * 0.8;
          if (r < 0) r = 0; else if (r > 255) r = 255;
          if (g < 0) g = 0; else if (g > 255) g = 255;
          if (b < 0) b = 0; else if (b > 255) b = 255;
          const p = i << 2;
          data[p]   = r;
          data[p+1] = g;
          data[p+2] = b;
          data[p+3] = 255;
        }
      }
      sctx.putImageData(imgData, 0, 0);
      // Upscale onto the visible canvas — bilinear filtering provides the
      // soft "real water" look.
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(sim, 0, 0, W, H);
    }

    // Spawn an automatic drop occasionally
    let nextDropAt = performance.now() + 800;
    function maybeAutoDrop(now){
      if (now >= nextDropAt){
        const gx = (0.08 + Math.random() * 0.84) * GRID_W;
        const gy = (0.10 + Math.random() * 0.80) * GRID_H;
        poke(gx, gy, AUTO_POKE_MIN + (Math.random() * AUTO_POKE_RANGE | 0));
        nextDropAt = now + AUTO_DROP_MIN + Math.random() * AUTO_DROP_RANGE;
      }
    }

    function frame(now){
      maybeAutoDrop(now);
      step();
      render();
      rafId = requestAnimationFrame(frame);
    }

    let rafId = 0;
    let running = false;
    function start(){
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(frame);
    }
    function stop(){
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    // Pause when offscreen — keeps cost zero on canvases the user can't see
    if ('IntersectionObserver' in window){
      const io = new IntersectionObserver((entries) => {
        for (const e of entries){
          if (e.isIntersecting) start(); else stop();
        }
      }, {rootMargin: '120px'});
      io.observe(canvas);
    } else {
      start();
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 100);
    });

    // Click anywhere to drop a ripple
    canvas.parentElement.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const gx = ((e.clientX - rect.left) / rect.width) * GRID_W;
      const gy = ((e.clientY - rect.top)  / rect.height) * GRID_H;
      poke(gx, gy, CLICK_POKE);
    }, {passive: true});

    // Subtle ripples follow the cursor (very small pokes) so the surface
    // feels alive when the user moves the mouse.
    let lastMove = 0;
    canvas.parentElement.addEventListener('mousemove', (e) => {
      const now = performance.now();
      if (now - lastMove < 90) return; // throttle
      lastMove = now;
      const rect = canvas.getBoundingClientRect();
      const gx = ((e.clientX - rect.left) / rect.width) * GRID_W;
      const gy = ((e.clientY - rect.top)  / rect.height) * GRID_H;
      poke(gx, gy, HOVER_POKE);
    }, {passive: true});

    resize();
    // Seed two initial drops so the surface is moving on load
    poke(GRID_W * 0.30, GRID_H * 0.40, 1100);
    setTimeout(() => poke(GRID_W * 0.72, GRID_H * 0.62, 900), 700);
  }

  // Mount on the hero (parchment surface)
  // Keep these running on the marketing site because the canvas surface is a core part of the design direction.
  mountFluidRipples(document.getElementById('heroCanvas'), {
      baseR: 245, baseG: 241, baseB: 232,
      shade: 0.12,
      autoDropMin: 2600,
      autoDropRange: 3400,
      autoPokeMin: 650,
      autoPokeRange: 500,
      hoverPoke: 55,
      clickPoke: 1200,
      gridW: 360,
      gridH: 230,
  });
  // Process section — gentler version on the lighter paper background
  mountFluidRipples(document.getElementById('processCanvas'), {
      baseR: 251, baseG: 249, baseB: 244,
      shade: 0.05,
      autoDropMin: 4200, autoDropRange: 4500,
      autoPokeMin: 450, autoPokeRange: 350,
      hoverPoke: 50, clickPoke: 900,
      gridW: 180, gridH: 110,
  });
  // Mount on the final CTA (purple surface — #5150f7)
  mountFluidRipples(document.getElementById('finalCanvas'), {
      baseR: 81, baseG: 80, baseB: 247,
      shade: 0.14,
      autoDropMin: 2600,
      autoDropRange: 3400,
      autoPokeMin: 700,
      autoPokeRange: 500,
      hoverPoke: 60,
      clickPoke: 1300,
      gridW: 360,
      gridH: 210,
  });
