/* =========================================================
   long.play — анимации первого экрана
   1. масштаб сцены под окно
   2. телевизор в CSS 3D (корпус из слоёв)
   3. интро (Web Animations API)
   4. параллакс от мыши + поворот телевизора (плавная пружина в rAF)
   5. частицы на canvas
   6. трава на WebGL: ~50 000 травинок, ветер и реакция на курсор
   ========================================================= */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  // детерминированный генератор случайных чисел (одинаковая трава/частицы при каждой загрузке)
  let seed = 20251103;
  const srand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const srange = (a, b) => a + srand() * (b - a);

  const STAGE_W = 1920;
  const STAGE_H = 1366;

  const state = {
    scale: 1,
    dpr: 1,
    // положение мыши 0..1; по умолчанию — как в референсе (курсор слева внизу)
    mouse: { x: 0.15, y: 0.83 },
    smooth: { x: 0.15, y: 0.83 },
    tv: { phi: 0, rx: 0 },
    time: 0,
    hasPointer: false,
    pointerIn: false,
    client: { x: 0, y: 0 },
    stageY: 0,
  };

  /* ---------- 1. масштаб сцены ---------- */
  const stage = $('#stage');
  // Сцена 1920×1366 покрывает окно (как background-size: cover).
  // По вертикали телевизор ставим в ту же относительную точку между заголовком
  // и нижним текстом, что и в референсе (на 1920×1366 смещение = 0).
  function fit() {
    const W = innerWidth;
    const H = innerHeight;
    const u = W / STAGE_W;
    const s = Math.max(u, H / STAGE_H);
    const bandTop = 345 * u;            // низ подзаголовка
    const bandBottom = H - 309 * u;     // верх нижнего текста
    const target = bandTop + 0.466 * (bandBottom - bandTop);
    const y = clamp(target - 677 * s, H - STAGE_H * s, 0); // 677 — центр телевизора на сцене
    state.scale = s;
    state.stageY = y;
    state.dpr = Math.min(2, (window.devicePixelRatio || 1) * s);
    document.documentElement.style.setProperty('--stage-scale', s.toFixed(5));
    document.documentElement.style.setProperty('--stage-y', y.toFixed(2) + 'px');
    resizeCanvases();
  }

  /* ---------- 2. телевизор: корпус из скруглённых слоёв ---------- */
  const tv = $('#tv');
  const tvBody = $('#tvBody');
  const TV_D = 208;
  (function buildTvBody() {
    const N = 44;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1); // 0 = задняя стенка, 1 = перед
      const z = -TV_D / 2 + k * (TV_D - 4);
      const slice = document.createElement('i');
      const l1 = Math.round(lerp(17, 47, Math.pow(k, 0.8)));
      const l2 = Math.round(lerp(10, 30, Math.pow(k, 0.8)));
      slice.style.transform = `translateZ(${z.toFixed(2)}px)`;
      slice.style.background = `linear-gradient(160deg, hsl(228 78% ${l1}%) 0%, hsl(228 80% ${Math.round((l1 + l2) / 2)}%) 55%, hsl(230 82% ${l2}%) 100%)`;
      frag.appendChild(slice);
    }
    tvBody.appendChild(frag);
  })();

  /* ---------- 3. интро ---------- */
  const heroText = $('#heroText');
  $$('.line', heroText).forEach((line) => {
    const words = line.textContent.split(' ');
    line.textContent = '';
    words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = w;
      line.appendChild(span);
      if (i < words.length - 1) line.appendChild(document.createTextNode(' '));
    });
  });

  const introAnims = [];
  function runIntro() {
    const words = $$('.word', heroText);
    const cta = $('#cta');
    const privacy = $('#privacy');
    const privacyInner = $('.privacy__inner', privacy);

    if (reduceMotion) {
      [...words, cta, privacy].forEach((el) => el.classList.add('is-in'));
      words.concat([cta, privacy]).forEach((el) => (el.style.opacity = 1));
      return;
    }

    const add = (el, frames, opts) => {
      const a = el.animate(frames, { fill: 'both', ...opts });
      introAnims.push(a);
      a.finished.then(() => {
        el.style.opacity = 1;
        a.cancel();
      }).catch(() => {});
      return a;
    };

    // кнопка: из сильного размытия, почти без сдвига (по кадрам референса 0.0–1.2 с)
    add(cta, [
      { opacity: 0, filter: 'blur(18px)', translate: '0 3px' },
      { opacity: 0.66, filter: 'blur(6px)', translate: '0 2px', offset: 0.27 },
      { opacity: 1, filter: 'blur(1.5px)', translate: '0 0.5px', offset: 0.73 },
      { opacity: 1, filter: 'blur(0px)', translate: '0 0' },
    ], { duration: 1100, delay: 0, easing: 'linear' });
    // чёрный квадрат с иконкой проявляется чуть позже самой кнопки
    const ctaIcon = $('.cta__icon', cta);
    const iconAnim = ctaIcon.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 800, delay: 250, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'both' });
    introAnims.push(iconAnim);
    iconAnim.finished.then(() => iconAnim.cancel()).catch(() => {});

    // текст: волна слева направо по словам, вторая строка чуть позже первой
    const box = heroText.getBoundingClientRect();
    const lines = $$('.line', heroText);
    words.forEach((w) => {
      const r = w.getBoundingClientRect();
      const xf = clamp((r.left + r.width / 2 - box.left) / box.width, 0, 1);
      const lineIdx = lines.indexOf(w.parentElement);
      // по кадрам: 1-я строка 0.06→0.53 с, 2-я строка 0.27→0.89 с (+0.42 с на «проявление» слова)
      const delay = lineIdx === 0 ? 60 + xf * 470 : 270 + xf * 620;
      add(w, [
        { opacity: 0, filter: 'blur(12px)', translate: '0 6px' },
        { opacity: 0.55, filter: 'blur(7px)', translate: '0 3px', offset: 0.35 },
        { opacity: 1, filter: 'blur(0px)', translate: '0 0' },
      ], { duration: 420, delay, easing: 'cubic-bezier(0.3, 0.5, 0.4, 1)' });
    });

    // нижняя полоса PRIVACY-FIRST: 0.7 → 1.4 с
    add(privacy, [
      { opacity: 0 },
      { opacity: 1 },
    ], { duration: 650, delay: 700, easing: 'cubic-bezier(0.3, 0.6, 0.3, 1)' });
    const innerAnim = privacyInner.animate([
      { filter: 'blur(10px)', opacity: 0.2 },
      { filter: 'blur(0px)', opacity: 1 },
    ], { duration: 600, delay: 820, easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)', fill: 'both' });
    introAnims.push(innerAnim);
    innerAnim.finished.then(() => innerAnim.cancel()).catch(() => {});

    // для проверки: ?t=0.8 — остановить интро на нужной секунде
    if (params.has('t')) {
      const t = parseFloat(params.get('t')) * 1000;
      introAnims.forEach((a) => { a.pause(); a.currentTime = t; });
    }
  }

  /* ---------- 4. мышь ---------- */
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    state.hasPointer = true;
    state.pointerIn = true;
    state.client.x = e.clientX;
    state.client.y = e.clientY;
    state.mouse.x = e.clientX / innerWidth;
    state.mouse.y = e.clientY / innerHeight;
  }, { passive: true });
  window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) state.pointerIn = false; });
  window.addEventListener('blur', () => { state.pointerIn = false; });

  const layers = $$('.layer[data-depth]').map((el) => ({ el, d: parseFloat(el.dataset.depth) }));
  const tvHalo = $('#tvHalo');
  const tvBloom = $('#tvBloom');

  /* ---------- 5. частицы ---------- */
  const pCanvas = $('#particles');
  const pctx = pCanvas.getContext('2d');
  const sprites = [];

  function makeSprite(size, kind) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    if (kind === 'sparkle') {
      const grd = g.createRadialGradient(r, r, 0, r, r, r);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.12, 'rgba(225,240,255,0.95)');
      grd.addColorStop(0.3, 'rgba(150,200,255,0.35)');
      grd.addColorStop(1, 'rgba(120,170,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      return c;
    }
    // боке: мягкий «цветок»/шестиугольник с чуть более яркой кромкой
    const soft = kind === 'soft';
    g.save();
    g.translate(r, r);
    if (soft) g.filter = `blur(${size * 0.08}px)`;
    const R = r * (soft ? 0.72 : 0.82);
    g.beginPath();
    const petals = 6;
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const rr = R * (1 - 0.07 * Math.cos(a * petals));
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, R);
    grd.addColorStop(0, 'rgba(214,226,255,0.55)');
    grd.addColorStop(0.6, 'rgba(206,220,255,0.62)');
    grd.addColorStop(0.9, 'rgba(232,240,255,0.85)');
    grd.addColorStop(1, 'rgba(232,240,255,0.2)');
    g.fillStyle = grd;
    g.fill();
    g.restore();
    return c;
  }
  sprites.bokeh = makeSprite(64, 'bokeh');
  sprites.soft = makeSprite(64, 'soft');
  sprites.sparkle = makeSprite(48, 'sparkle');

  const particles = [];
  (function buildParticles() {
    const count = reduceMotion ? 120 : 210;
    for (let i = 0; i < count; i++) {
      const sparkle = srand() < 0.09;
      const depth = srange(0.2, 1);
      particles.push({
        x: srange(-40, STAGE_W + 40),
        y: sparkle ? srange(860, 1260) : srange(-40, STAGE_H),
        size: sparkle ? srange(10, 22) : lerp(10, 28, depth) * srange(0.8, 1.15),
        alpha: sparkle ? srange(0.6, 1) : lerp(0.35, 0.85, srand()),
        vy: sparkle ? srange(-4, 4) : lerp(9, 34, depth),
        vx: srange(-3, 5),
        sway: srange(4, 18),
        freq: srange(0.15, 0.5),
        phase: srange(0, Math.PI * 2),
        tw: srange(0.6, 2.2),
        depth,
        kind: sparkle ? 'sparkle' : (srand() < 0.35 ? 'soft' : 'bokeh'),
      });
    }
  })();

  function drawParticles(dt, t) {
    const ctx = pctx;
    const k = state.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    const mx = state.smooth.x - 0.5;
    const my = state.smooth.y - 0.5;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      if (!reduceMotion) {
        p.y += p.vy * dt;
        p.x += p.vx * dt;
        if (p.kind === 'sparkle') {
          if (p.y < 840) p.vy = Math.abs(p.vy);
          if (p.y > 1280) p.vy = -Math.abs(p.vy);
        } else if (p.y > STAGE_H + 30) {
          p.y = -30;
          p.x = rand(-40, STAGE_W + 40);
        }
        if (p.x > STAGE_W + 50) p.x = -50;
        if (p.x < -50) p.x = STAGE_W + 50;
      }
      const sx = Math.sin(t * p.freq + p.phase) * p.sway;
      const px = p.x + sx - mx * 40 * p.depth;
      const py = p.y - my * 22 * p.depth;
      let a = p.alpha * (0.78 + 0.22 * Math.sin(t * p.tw + p.phase * 3));
      if (p.kind !== 'sparkle') {
        // над травой частицы почти не видны (теряются в траве)
        if (py > 900) a *= clamp(1 - (py - 900) / 260, 0, 1) * 0.6 + 0.08;
      } else {
        a *= 0.55 + 0.45 * Math.sin(t * p.tw * 1.7 + p.phase);
      }
      if (a <= 0.01) continue;
      // малая глубина резкости: у верхних углов частицы мягче и крупнее
      let kind = p.kind;
      let s = p.size;
      if (kind !== 'sparkle' && py < 760) {
        const cx = Math.min(px, STAGE_W - px);
        const corner = clamp(1 - Math.hypot(cx / 620, py / 760), 0, 1);
        if (corner > 0.15) { kind = 'soft'; s *= 1 + corner * 0.7; a *= 1 - corner * 0.35; }
      }
      ctx.globalAlpha = a;
      ctx.drawImage(sprites[kind], px - s / 2, py - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- 6. трава на WebGL: ~50 000 травинок, гнутся от курсора ---------- */
  // линия гребня холма (та же, что в маске холма в style.css), в координатах сцены
  const RIDGE_D = 'M-80 1012 C160 980 380 950 520 935 C590 905 650 886 700 876 C760 866 820 861 900 859 C980 858 1060 862 1120 866 C1180 870 1230 878 1280 890 C1340 903 1400 918 1460 932 C1540 948 1620 956 1690 960 C1760 962 1820 950 1880 936 C1920 928 1950 924 1960 922 L2000 920';
  const ridgeLUT = new Float32Array(STAGE_W + 161);
  (function buildRidge() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', RIDGE_D);
    svg.appendChild(path);
    document.body.appendChild(svg);
    const len = path.getTotalLength();
    ridgeLUT.fill(NaN);
    for (let s = 0; s <= len; s += 2) {
      const p = path.getPointAtLength(s);
      const xi = Math.round(p.x) + 80;
      if (xi >= 0 && xi < ridgeLUT.length) ridgeLUT[xi] = p.y;
    }
    let last = 1012;
    for (let i = 0; i < ridgeLUT.length; i++) {
      if (Number.isNaN(ridgeLUT[i])) ridgeLUT[i] = last; else last = ridgeLUT[i];
    }
    svg.remove();
  })();
  const ridgeY = (x) => ridgeLUT[clamp(Math.round(x) + 80, 0, ridgeLUT.length - 1)];

  // правая граница левой размытой кочки (за ней травинки не видны — не рисуем)
  const MOUND = [[700, -80], [752, 250], [845, 480], [915, 570], [975, 640], [1070, 680], [1200, 700], [1440, 720]];
  const moundX = (y) => {
    if (y <= MOUND[0][0]) return -999;
    for (let i = 1; i < MOUND.length; i++) {
      if (y <= MOUND[i][0]) {
        const [y0, x0] = MOUND[i - 1];
        const [y1, x1] = MOUND[i];
        return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
      }
    }
    return 720;
  };

  const GL_ORIGIN = { x: -60, y: 600 };
  const GL_SIZE = { w: 2040, h: 800 };
  const TV_GLOW = { x: 930, y: 884 };

  // сетка «пружинок» под травой: курсор толкает травинки, пружина возвращает их обратно
  const DG = { cols: 136, rows: 54 };
  const CELL_W = GL_SIZE.w / DG.cols;
  const CELL_H = GL_SIZE.h / DG.rows;
  const disp = new Float32Array(DG.cols * DG.rows * 2);
  const dvel = new Float32Array(DG.cols * DG.rows * 2);
  const dbytes = new Uint8Array(DG.cols * DG.rows * 4).fill(128);
  const touch = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };
  let dispIdle = true;

  function updateDisp(dt) {
    if (dt <= 0) return false;
    const p = touch;
    if (dispIdle && !p.active) return false;
    if (p.active) {
      const R = 125;
      const speed = Math.hypot(p.vx, p.vy);
      const power = clamp(0.45 + speed / 700, 0.45, 2.2);
      const c0 = Math.max(0, Math.floor((p.x - R - GL_ORIGIN.x) / CELL_W));
      const c1 = Math.min(DG.cols - 1, Math.ceil((p.x + R - GL_ORIGIN.x) / CELL_W));
      const r0 = Math.max(0, Math.floor((p.y - R - GL_ORIGIN.y) / CELL_H));
      const r1 = Math.min(DG.rows - 1, Math.ceil((p.y + R * 0.8 - GL_ORIGIN.y) / CELL_H));
      for (let r = r0; r <= r1; r++) {
        const cy = GL_ORIGIN.y + (r + 0.5) * CELL_H;
        for (let c = c0; c <= c1; c++) {
          const cx = GL_ORIGIN.x + (c + 0.5) * CELL_W;
          const dx = cx - p.x;
          const dy = (cy - p.y) * 1.35;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > R) continue;
          const f = (1 - d / R) * (1 - d / R) * power;
          const i = (r * DG.cols + c) * 2;
          // расталкиваем в стороны от курсора + «тащим» по направлению движения
          dvel[i] += (Math.sign(dx || 1) * 26 + p.vx * 0.045) * f * dt;
          dvel[i + 1] += 22 * f * dt; // слегка прижимаем вниз
        }
      }
    }
    // пружина с затуханием: травинка немного раскачивается и успокаивается
    const K = 38;
    const damp = Math.exp(-4.2 * dt);
    let maxAbs = 0;
    for (let i = 0; i < disp.length; i++) {
      let v = dvel[i] - disp[i] * K * dt;
      v *= damp;
      let x = disp[i] + v * dt;
      if (x > 1) { x = 1; v = 0; } else if (x < -1) { x = -1; v = 0; }
      disp[i] = x;
      dvel[i] = v;
      const a = Math.abs(x) + Math.abs(v) * 0.1;
      if (a > maxAbs) maxAbs = a;
    }
    dispIdle = maxAbs < 0.002 && !p.active;
    for (let j = 0, i = 0; j < dbytes.length; j += 4, i += 2) {
      dbytes[j] = 128 + disp[i] * 127;
      dbytes[j + 1] = 128 + disp[i + 1] * 127;
    }
    return true;
  }

  const grass = (function createGrass() {
    const canvas = $('#grassGL');
    if (!canvas) return null;
    let gl = null;
    try {
      gl = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) {
      document.documentElement.classList.add('no-webgl');
      return null;
    }

    const VS = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 aTpl;    // x: сторона (-1..1), y: позиция вдоль травинки (0..1)
    layout(location = 1) in vec4 aRoot;   // корень x, y, высота, ширина (px сцены)
    layout(location = 2) in vec4 aParam;  // наклон, фаза, seed, глубина
    uniform vec2 uOrigin;
    uniform vec2 uSize;
    uniform float uTime;
    uniform float uWind;
    uniform sampler2D uDisp;
    out vec2 vUV;
    out float vSeed;
    out vec2 vRoot;
    out float vDepth;
    out float vSoft;
    void main() {
      float t = aTpl.y;
      vec2 root = aRoot.xy;
      float h = aRoot.z;
      float w = aRoot.w;
      float depth = aParam.w;
      // ветер: волны разной частоты + порывы
      float gust = 0.5 + 0.5 * sin(uTime * 0.42 + root.x * 0.0024 - root.y * 0.004);
      float wind = (sin(uTime * 1.7 + root.x * 0.021 + aParam.y) * 0.05
                  + sin(uTime * 0.83 + root.x * 0.0062 + root.y * 0.012) * 0.085) * (0.55 + 0.9 * gust) * uWind;
      // смещение от курсора (сетка пружинок)
      vec2 d = texture(uDisp, (root - uOrigin) / uSize).xy * 2.0 - 1.0;
      float bend = aParam.x + wind + d.x * 1.35;
      float squash = clamp(1.0 - max(d.y, 0.0) * 0.55, 0.4, 1.0);
      // травинка — квадратичная кривая Безье от корня к кончику
      vec2 p0 = root;
      vec2 p2 = root + vec2(sin(bend) * h, -cos(bend) * h * squash);
      vec2 p1 = root + vec2(sin(bend * 0.3) * h * 0.5, -h * 0.55 * squash);
      float it = 1.0 - t;
      vec2 pos = it * it * p0 + 2.0 * it * t * p1 + t * t * p2;
      vec2 tg = normalize(2.0 * it * (p1 - p0) + 2.0 * t * (p2 - p1) + vec2(0.0, -1e-4));
      vec2 nrm = vec2(-tg.y, tg.x);
      // малая глубина резкости: ближние травинки шире и мягче
      float blur = max(0.0, depth - 0.55) * (depth > 1.1 ? 28.0 : 20.0);
      float halfW = w * 0.5 * pow(it, 0.75);
      pos += nrm * aTpl.x * (halfW + blur * 0.7);
      pos += tg * blur * 0.35 * (t * 2.0 - 1.0);
      vec2 clip = (pos - uOrigin) / uSize * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      vUV = vec2(aTpl.x, t);
      vSeed = aParam.z;
      vRoot = root;
      vDepth = depth;
      vSoft = clamp(blur / (halfW + blur + 0.5), 0.0, 1.0);
    }`;

    const FS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    in float vSeed;
    in vec2 vRoot;
    in float vDepth;
    in float vSoft;
    uniform vec2 uTv;
    uniform float uLight;
    out vec4 outColor;
    void main() {
      float t = vUV.y;
      float edge = abs(vUV.x);
      float a = 1.0 - smoothstep(1.0 - max(vSoft, 0.22), 1.0, edge);
      a *= mix(1.0, 0.5, vSoft);
      a *= 1.0 - smoothstep(0.4, 1.0, t) * vSoft * 0.9; // размытые травинки без острых кончиков
      float right = smoothstep(1080.0, 1650.0, vRoot.x);
      float s1 = fract(vSeed * 7.13);
      float s2 = fract(vSeed * 13.71);
      float s3 = fract(vSeed * 3.37);
      // основание: тёмное сине-зелёное, середина: оливковая, кончик: золотой у части травинок
      vec3 base = mix(vec3(0.11, 0.12, 0.08), vec3(0.05, 0.09, 0.17), right);
      vec3 mid = mix(vec3(0.30, 0.29, 0.13), vec3(0.13, 0.19, 0.27), right);
      mid = mix(mid, vec3(0.20, 0.25, 0.30), s3 * 0.35);
      float golden = step(0.50 - right * 0.08, s1);
      vec3 tip = mix(vec3(0.27, 0.32, 0.36), vec3(0.86, 0.58, 0.19), golden);
      tip = mix(tip, vec3(0.98, 0.78, 0.36), step(0.92, s2) * 0.7);
      vec3 col = mix(base, mid, smoothstep(0.0, 0.55, t));
      col = mix(col, tip, smoothstep(0.38, 1.0, t) * (0.55 + 0.45 * golden));
      // свет экрана телевизора
      vec2 dl = (vRoot - uTv) / vec2(310.0, 92.0);
      float L = exp(-dot(dl, dl)) * uLight;
      col += vec3(1.0, 0.50, 0.12) * L * (0.30 + 0.95 * t);
      col = mix(col, vec3(1.0, 0.84, 0.52), L * L * 0.4 * t);
      // ближняя левая кочка: тёмная оливковая, мягкая, почти без бликов
      float mound = step(1.1, vDepth) * (1.0 - smoothstep(620.0, 780.0, vRoot.x));
      col = mix(col, col * vec3(0.72, 0.72, 0.6) + vec3(0.075, 0.07, 0.025), mound);
      // дымка у дальних травинок справа
      float far = (1.0 - smoothstep(0.0, 0.22, vDepth)) * right;
      col = mix(col, vec3(0.40, 0.43, 0.62), far * 0.32);
      outColor = vec4(col * a, a);
    }`;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      console.warn('WebGL grass disabled:', e.message);
      document.documentElement.classList.add('no-webgl');
      return null;
    }

    // травинки: у гребня много мелких, у камеры — мало крупных
    const list = [];
    const add = (x, y, h, w, lean, depth) => list.push(x, y, h, w, lean, srange(0, 6.2832), srand(), depth);
    const target = 50000;
    let made = 0;
    for (let tries = 0; made < target && tries < target * 14; tries++) {
      const x = srange(GL_ORIGIN.x + 10, GL_ORIGIN.x + GL_SIZE.w - 10);
      const r = ridgeY(x);
      const y = srange(r - 3, 1430);
      if (x < moundX(y) - 50) continue;
      const depth = clamp((y - r) / 470, 0, 1.25);
      const far = clamp((x - 1250) / 500, 0, 1);
      const sc = (0.5 + 1.7 * Math.pow(depth, 1.25)) * (1 - 0.22 * far);
      if (srand() > Math.pow(0.5 / sc, 2)) continue;
      // «вихры»: наклон по плавному шуму + наклон по склону
      const clump = Math.sin(x * 0.011 + y * 0.023) * Math.cos(x * 0.0061 - y * 0.017);
      const lean = clump * 0.6 + (srand() - 0.5) * 0.55 + clamp((x - 960) / 900, -1, 1) * 0.18;
      add(x, y, srange(14, 30) * sc, srange(2.0, 3.4) * sc, lean, depth);
      made++;
    }
    // густая светящаяся трава у основания телевизора
    for (let i = 0; i < 3200; i++) {
      const x = srange(740, 1190);
      const r = ridgeY(x);
      const y = r + Math.pow(srand(), 1.5) * 44 - 2;
      add(x, y, srange(16, 38), srange(2.0, 3.2), (srand() - 0.5) * 0.75, clamp((y - r) / 470, 0, 1));
    }
    const hillCount = list.length / 8;
    // левая ближняя кочка: крупные размытые травинки, торчат в небо неровным краем
    const moundTop = (x) => {
      for (let i = 1; i < MOUND.length; i++) {
        if (x <= MOUND[i][1]) {
          const [y0, x0] = MOUND[i - 1];
          const [y1, x1] = MOUND[i];
          return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
        }
      }
      return 1440;
    };
    for (let i = 0; i < 1500; i++) {
      const x = srange(-70, 720);
      const top = moundTop(x) + 70; // только внутри кочки: край делает мягкая маска
      if (top > 1400) continue;
      const y = top + Math.pow(srand(), 0.7) * (1440 - top);
      const lean = (srand() - 0.5) * 0.36 + 0.05;
      add(x, y, srange(34, 80), srange(3.5, 7), lean, srange(1.12, 1.3));
    }
    // сортировка: дальние рисуются первыми, ближняя кочка — поверх всего
    const n = list.length / 8;
    const key = (i) => list[i * 8 + 1] + (i >= hillCount ? 10000 : 0);
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => key(a) - key(b));
    const inst = new Float32Array(list.length);
    for (let i = 0; i < n; i++) for (let k = 0; k < 8; k++) inst[i * 8 + k] = list[order[i] * 8 + k];

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const tplBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tplBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, -1, 0.34, 1, 0.34, -1, 0.68, 1, 0.68, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, DG.cols, DG.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, dbytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const U = {};
    ['uOrigin', 'uSize', 'uTime', 'uWind', 'uDisp', 'uTv', 'uLight'].forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });

    let lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });

    return {
      count: n,
      resize(k) {
        canvas.width = Math.round(GL_SIZE.w * k);
        canvas.height = Math.round(GL_SIZE.h * k);
      },
      draw(t, light, dispChanged) {
        if (lost) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (dispChanged) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DG.cols, DG.rows, gl.RGBA, gl.UNSIGNED_BYTE, dbytes);
        gl.uniform1i(U.uDisp, 0);
        gl.uniform2f(U.uOrigin, GL_ORIGIN.x, GL_ORIGIN.y);
        gl.uniform2f(U.uSize, GL_SIZE.w, GL_SIZE.h);
        gl.uniform1f(U.uTime, t);
        gl.uniform1f(U.uWind, reduceMotion ? 0 : 1);
        gl.uniform2f(U.uTv, TV_GLOW.x, TV_GLOW.y);
        gl.uniform1f(U.uLight, light);
        gl.bindVertexArray(vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 7, n);
        gl.bindVertexArray(null);
      },
    };
  })();
  window.__grassBlades = grass ? grass.count : 0;

  function resizeCanvases() {
    const k = state.dpr;
    pCanvas.width = Math.round(STAGE_W * k);
    pCanvas.height = Math.round(STAGE_H * k);
    if (grass) grass.resize(Math.min(k, 2));
    if (reduceMotion) {
      drawParticles(0, 0);
      if (grass) grass.draw(0, 1, true);
    }
  }

  /* ---------- главный цикл ---------- */
  const PERSPECTIVE = 560;
  const SCREEN_LOCAL = { x: -34, z: TV_D / 2 };
  const camera = $('#camera');
  const grassLayer = layers.find((L) => L.el.classList.contains('grass-layer'));

  // плавное «догоняние» с инерцией (критически демпфированная пружина, как SmoothDamp в играх):
  // разгоняется и тормозит мягко, без рывков, и не зависит от частоты кадров
  function smoothDamp(cur, target, vel, smoothTime, dt) {
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = cur - target;
    const temp = (vel.v + omega * change) * dt;
    vel.v = (vel.v - omega * temp) * exp;
    return target + (change + temp) * exp;
  }
  const velX = { v: 0 };
  const velY = { v: 0 };
  const SMOOTH_TIME = 0.55; // ≈ инерция телевизора и сцены в референсе

  function frame(now) {
    const t = now / 1000;
    const dt = Math.min(0.05, t - (state.time || t));
    state.time = t;

    // без мыши — лёгкий «автопилот», чтобы сцена жила и на тач-экранах
    if (!state.hasPointer && params.get('static') !== '1' && t > 6) {
      state.mouse.x = 0.5 + Math.sin(t * 0.21) * 0.3;
      state.mouse.y = 0.6 + Math.sin(t * 0.17) * 0.15;
    }

    state.smooth.x = smoothDamp(state.smooth.x, state.mouse.x, velX, SMOOTH_TIME, dt);
    state.smooth.y = smoothDamp(state.smooth.y, state.mouse.y, velY, SMOOTH_TIME, dt);
    const mx = state.smooth.x - 0.5;
    const my = state.smooth.y - 0.5;

    // «дыхание» камеры: зум 1 → 1.05 и лёгкий сдвиг, цикл 18 с
    const b = reduceMotion ? 0 : 0.5 - 0.5 * Math.cos((t / 18) * Math.PI * 2);
    const camScale = 1 + 0.05 * b;
    const camTx = -14 * b;
    const camTy = -6 * b;
    camera.style.transform = `translate3d(${camTx.toFixed(2)}px, ${camTy.toFixed(2)}px, 0) scale(${camScale.toFixed(5)})`;

    // параллакс слоёв
    for (const L of layers) {
      L.x = -mx * 36 * L.d;
      L.y = -my * 20 * L.d;
      L.el.style.transform = `translate3d(${L.x.toFixed(2)}px, ${L.y.toFixed(2)}px, 0)`;
    }

    // курсор → координаты травы (учитываем масштаб сцены, «дыхание» камеры и параллакс слоя)
    if (state.hasPointer && state.pointerIn) {
      const s = state.scale;
      const sx0 = (state.client.x - (innerWidth / 2 - (STAGE_W * s) / 2)) / s;
      const sy0 = (state.client.y - state.stageY) / s;
      const cx = 960 + (sx0 - camTx - 960) / camScale;
      const cy = 847 + (sy0 - camTy - 847) / camScale;
      const gx = cx - (grassLayer ? grassLayer.x : 0);
      const gy = cy - (grassLayer ? grassLayer.y : 0);
      if (touch.active && dt > 0) {
        touch.vx = lerp(touch.vx, (gx - touch.x) / dt, 0.5);
        touch.vy = lerp(touch.vy, (gy - touch.y) / dt, 0.5);
      } else {
        touch.vx = 0;
        touch.vy = 0;
      }
      touch.x = gx;
      touch.y = gy;
      touch.active = true;
    } else {
      touch.active = false;
    }

    // поворот телевизора: «смотрит» на курсор, плюс лёгкое покачивание
    const phiTarget = 32.6 - 30.5 * state.smooth.x;
    const sway = reduceMotion ? 0 : Math.sin(t * 0.55) * 1.6;
    const roll = reduceMotion ? 0 : Math.sin(t * 0.43 + 1) * 1.1;
    const bob = reduceMotion ? 0 : Math.sin(t * 0.8) * 1.5;
    const phi = phiTarget + sway;
    const rx = -6 + my * -6;
    tv.style.transform = `translateY(${bob.toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${(-phi).toFixed(2)}deg) rotateZ(${(-7 + roll).toFixed(2)}deg)`;

    // где сейчас экран (проекция центра экрана) — туда двигаем свечение
    const pr = (phi * Math.PI) / 180;
    const sxw = SCREEN_LOCAL.x * Math.cos(pr) - SCREEN_LOCAL.z * Math.sin(pr);
    const szw = SCREEN_LOCAL.x * Math.sin(pr) + SCREEN_LOCAL.z * Math.cos(pr);
    const sx = sxw * (PERSPECTIVE / (PERSPECTIVE - szw));

    // мерцание экрана: сумма синусов + редкие короткие «провалы»
    let flicker = 1;
    if (!reduceMotion) {
      flicker = 0.93 + 0.035 * Math.sin(t * 13.1) + 0.025 * Math.sin(t * 29.7 + 1.3) + 0.02 * Math.sin(t * 3.3);
      const blip = Math.sin(t * 0.9) > 0.995 ? 0.12 : 0;
      flicker -= blip;
    }
    tvBloom.style.transform = `translate3d(${(sx + 36).toFixed(2)}px, ${bob.toFixed(2)}px, 0)`;
    tvBloom.style.opacity = flicker.toFixed(3);
    tvHalo.style.opacity = (0.9 + (flicker - 0.93) * 1.5).toFixed(3);

    drawParticles(dt, t);
    const dispChanged = updateDisp(dt);
    if (grass) grass.draw(t, 0.95 + (flicker - 0.93) * 1.6, dispChanged);

    if (!reduceMotion) requestAnimationFrame(frame);
  }

  /* ---------- видео ---------- */
  function startVideos() {
    $$('video').forEach((v) => {
      v.muted = true;
      if (reduceMotion) { v.pause(); return; }
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    });
  }

  /* ---------- старт ---------- */
  fit();
  window.addEventListener('resize', fit);
  startVideos();

  // интро стартует, когда шрифты готовы и браузер отрисовал первые плавные кадры
  // (при первом открытии первый кадр может «зависнуть» — без этого интро проскочило бы)
  const whenSmooth = () => new Promise((resolve) => {
    const start = performance.now();
    let last = start;
    let good = 0;
    const tick = (t) => {
      good = t - last < 60 ? good + 1 : 0;
      last = t;
      if (good >= 3 || t - start > 2500) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1200))])
    .then(whenSmooth)
    .then(() => {
      window.__introStart = performance.now();
      runIntro();
    });

  requestAnimationFrame(frame);
})();
