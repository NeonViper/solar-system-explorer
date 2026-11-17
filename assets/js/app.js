/* ============================================================================
 * app.js — Solar System Explorer application.
 *
 * Offline 3D Solar System on locally-stored three.js (r150). All textures,
 * fonts and data resolve through relative paths; nothing touches the network.
 *
 * Layout of this file:
 *   1  helpers & state           4  simulation clock & positions
 *   2  renderer, scene, camera   5  camera behaviour (focus/follow/presets)
 *   3  body construction         6  UI wiring & info panel
 * ==========================================================================*/
(function () {
  'use strict';

  var DATA = window.SSE_DATA, CORE = window.SSE_CORE, PROC = window.SSE_PROC;
  var DEG = CORE.DEG;

  /* ========================= 1. helpers & state ============================ */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function fmtNum(v, d) { return v.toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d }); }
  function fmtSci(v) {
    if (!isFinite(v)) return '—';
    var e = Math.floor(Math.log10(Math.abs(v) || 1));
    if (e >= -2 && e <= 4) return fmtNum(v, Math.abs(v) < 10 ? 3 : 1);
    return (v / Math.pow(10, e)).toFixed(2) + '×10^' + e;
  }
  function setLoading(msg) { var m = $('loadingMsg'); if (m) m.textContent = msg; }

  var RATE_LABELS = [
    ['60 s/s', 60 / 86400], ['10 min/s', 600 / 86400], ['1 h/s', 1 / 24], ['6 h/s', 0.25],
    ['1 d/s', 1], ['3 d/s', 3], ['1 wk/s', 7], ['1 mo/s', 30.44], ['6 mo/s', 182.6],
    ['1 y/s', 365.25], ['10 y/s', 3652.5], ['50 y/s', 18262.5]
  ];

  var state = {
    jd: CORE.jdFromDate(new Date()),
    playing: true,
    rate: 1,                    // simulated days per real second (signed)
    rateLabel: '1 d/s',
    observerMode: 'helio',      // helio | geo | topo
    follow: true,
    selected: null,             // body id
    hover: null,
    showOrbits: { planets: true, dwarf: true, moons: false, selectedOnly: false },
    showLabels: true, showMoonLabels: false, showTrails: true,
    showGrid: false, showMarkers: true,
    scaleMode: 'explorer',      // explorer | real
    sizeScale: 30, moonSizeScale: 180, distScale: 8, moonDistScale: 600,
    quality: 'high', bloom: true, shadows: true, stars: true, nebula: true,
    clouds: true, atmo: true, glare: 100,
    loc: { name: 'Your location', lat: 41.0082, lon: 28.9784, elev: 40, tz: 3 },
    surfaceMode: false
  };

  /* scale model -------------------------------------------------------------
   * Explorer mode exaggerates radii so everything is visible; "Scientific
   * scale" uses true proportional radii and distances (bodies become dust).
   * Calculated positions themselves are never distorted by these knobs. */
  function auUnits() { return CORE.AU_UNITS * (state.scaleMode === 'real' ? 1 : state.distScale); }
  function planetRadiusUnits(rKm) {
    if (state.scaleMode === 'real') return rKm / CORE.AU_KM * CORE.AU_UNITS * state.distScale;
    return rKm / 6371 * 6 * state.sizeScale / 100;
  }
  function moonRadiusUnits(rKm) {
    var base = state.scaleMode === 'real' ? rKm / CORE.AU_KM * CORE.AU_UNITS * state.distScale
      : rKm / 6371 * 6 * state.sizeScale / 100 * state.moonSizeScale / 100;
    return base;
  }
  function sunRadiusUnits() {
    if (state.scaleMode === 'real') return 695700 / CORE.AU_KM * CORE.AU_UNITS * state.distScale;
    return 3 + state.sizeScale * 0.12;
  }
  function moonOrbitUnits(aKm, parentRUnits, parentR_km) {
    var v = aKm / 384400 * 4.5 * state.moonDistScale / 100;
    if (state.scaleMode === 'real') v = aKm / CORE.AU_KM * CORE.AU_UNITS * state.distScale;
    var clearance = parentRUnits * 1.35 + 0.05;   // never sink a moon inside its planet
    return Math.max(v, clearance);
  }

  /* texture loader -----------------------------------------------------------*/
  var texCache = {};
  var texManager = { wanted: 0, loaded: 0, done: false };
  function tex(name) {
    if (!name) return null;
    if (texCache[name]) return texCache[name].ok ? texCache[name].tex : null;
    texManager.wanted++;
    var t = new THREE.TextureLoader().load('assets/textures/' + name,
      function (tx) { texCache[name] = { ok: true, tex: tx }; texManager.loaded++; afterTex(name, tx); },
      undefined,
      function () { texCache[name] = { ok: false }; texManager.loaded++; afterTex(name, null); });
    texCache[name] = { ok: null, tex: null };   // pending
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  var texWaiters = {};
  function afterTex(name, tx) {
    (texWaiters[name] || []).forEach(function (cb) { cb(tx); });
    texWaiters[name] = [];
    if (texManager.loaded >= texManager.wanted && !texManager.done) { texManager.done = true; setLoading('building…'); }
  }
  function onTex(name, cb) {
    var c = texCache[name];
    if (c && c.ok != null) { cb(c.ok ? c.tex : null); return; }
    if (!c) { tex(name); }
    // fire exactly once: afterTex() already replays waiters when the load resolves,
    // so no extra polling here (a poll used to fire the callback twice → duplicate meshes)
    var once = false;
    (texWaiters[name] = texWaiters[name] || []).push(function (tx) {
      if (once) return; once = true; cb(tx);
    });
  }

  /* ===================== 2. renderer, scene, camera ======================== */
  var host = $('sceneHost');
  var renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, 1, 0.001, 4e8);
  scene.add(camera);
  /* Sync renderer + camera projection with the viewport right away: the
     default aspect of 1 stretches every sphere by the viewport's aspect
     (≈1.8× on a 16:9 screen) until some later event called resize(). */
  resize();

  var root = new THREE.Group();          // everything scaled lives here
  scene.add(root);

  // lights: the Sun is a point light at origin + faint fill so night sides read
  var sunLight = new THREE.PointLight(0xfff3d6, 2.4, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 1e6;
  root.add(sunLight);
  root.add(new THREE.AmbientLight(0x27313f, 0.55));

  /* GPU readout */
  (function () {
    try {
      var gl = renderer.getContext();
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      $('gpuReadout').textContent = 'GPU: ' + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'WebGL capable');
    } catch (e) { $('gpuReadout').textContent = 'GPU: WebGL'; }
  })();

  /* ---- hand-rolled orbit camera with damping ------------------------------
   * spherical (theta azimuth, phi polar) around state-dependent target. */
  var cam = {
    theta: 0.9, phi: 1.12, radius: 1500, radiusWanted: 1500,
    target: new THREE.Vector3(), targetWanted: new THREE.Vector3(),
    update: function (dt, followRate) {
      this.radius = lerp(this.radius, this.radiusWanted, clamp(dt * 6, 0, 1));
      if (followRate) {
        /* True follow: pin the target exactly. Any smoothing filter — even
           with velocity feedforward — keeps a lag proportional to speed /
           convergence rate; on a tiny focus radius that lag throws the
           moon out of frame once the sim runs faster than a few days/s.
           The body itself moves smoothly, so an exact pin adds no jerk. */
        this.target.copy(this.targetWanted);
        if (this._prevW) this._prevW.copy(this.targetWanted);
      } else {
        var rf = clamp(dt * 5, 0, 1);
        /* Velocity feedforward for the smoothed path (fly-ins, geo mode):
           plain exponential smoothing leaves a constant lag behind a
           moving target (lag = speed*dt*(1-rf)/rf); carrying the target's
           per-frame motion through the filter zeroes steady-state lag
           while keeping transitions smooth. */
        if (!this._prevW) this._prevW = this.targetWanted.clone();
        if (!this._mv) this._mv = new THREE.Vector3();
        this._mv.copy(this.targetWanted).sub(this._prevW).multiplyScalar(1 - rf);
        this.target.add(this._mv);
        this.target.lerp(this.targetWanted, rf);
        this._prevW.copy(this.targetWanted);
      }
      var s = this.radius;
      camera.position.set(
        this.target.x + s * Math.sin(this.phi) * Math.cos(this.theta),
        this.target.y + s * Math.cos(this.phi),
        this.target.z + s * Math.sin(this.phi) * Math.sin(this.theta));
      camera.lookAt(this.target);
    }
  };
  function resize() {
    var w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  /* Layout can change without any window resize event — the mobile player
     bar wrapping to two rows, fullscreen, or the settings drawer settling —
     so keep the projection glued to the host box whenever it changes. */
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);

  /* pointer controls on the canvas — mouse, pen and touch:
     1 finger drag = rotate · 2 finger pinch = zoom · right-drag/shift = pan
     tap = select · double-tap = fly in (focus camera)                  */
  (function controls() {
    var cv = renderer.domElement;
    cv.style.touchAction = 'none';               // capture gestures on the canvas
    var pointers = {};                           // pointerId -> {x, y}
    var drag = null, pinch = null;
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    function pair() {
      var a = Object.keys(pointers);
      return [pointers[a[0]], pointers[a[1]]];
    }
    cv.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { }
      if (Object.keys(pointers).length === 2) {  // second finger -> pinch mode
        var p = pair();
        pinch = { d0: Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)), r0: cam.radiusWanted };
        drag = null;
      } else if (Object.keys(pointers).length === 1) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, btn: e.button, moved: 0 };
      }
    });
    cv.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
      if (pinch && Object.keys(pointers).length >= 2) {
        var p = pair();
        var d = Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y));
        cam.radiusWanted = clamp(pinch.r0 * pinch.d0 / d, minRadius(), maxRadius());
        return;
      }
      if (!drag || e.pointerId !== drag.id) {
        if (!drag && e.pointerType !== 'touch') onHover(e);
        return;
      }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.btn === 2 || e.shiftKey) {         // pan: move target in view plane
        var r = cam.radius * 0.0012;
        var right = new THREE.Vector3().subVectors(camera.position, cam.target).cross(camera.up).normalize();
        var up = new THREE.Vector3().subVectors(camera.position, cam.target).cross(right).normalize();
        cam.targetWanted.addScaledVector(right, -dx * r).addScaledVector(up, dy * r);
      } else {
        cam.theta -= dx * 0.0052;
        cam.phi = clamp(cam.phi - dy * 0.0052, 0.015, Math.PI - 0.015);
      }
    });
    function endPointer(e) {
      var wasDrag = drag, wasPinch = pinch;
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (Object.keys(pointers).length === 0) {
        if (wasDrag && !wasPinch && wasDrag.id === e.pointerId &&
            wasDrag.moved < 10 && wasDrag.btn === 0) onClickPick(e);
        drag = null;
      }
    }
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = Math.pow(1.0016, e.deltaY);
      cam.radiusWanted = clamp(cam.radiusWanted * f, minRadius(), maxRadius());
    }, { passive: false });
    function minRadius() { return state.scaleMode === 'real' ? 0.01 : 0.05; }
    function maxRadius() { return state.observerMode === 'topo' ? 800 : 6e7; }
  })();

  /* touch devices: describe gestures the way they work here */
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    var hudHintEl = $('hudHint');
    if (hudHintEl) hudHintEl.textContent = 'Drag to rotate · pinch to zoom · tap a body to inspect';
  }

  /* ---- star field + nebula backdrop ---------------------------------------- */
  var starPoints = (function () {
    var g = new THREE.BufferGeometry();
    var N = 6000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    var R = PROC.rng(20260812);
    for (var i = 0; i < N; i++) {
      var u = R() * 2 - 1, a = R() * Math.PI * 2, r = 3.2e6;
      var s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(a); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(a);
      var w = 0.55 + R() * 0.45, k = R();
      col[i * 3] = w * (k < 0.15 ? 0.75 : 1); col[i * 3 + 1] = w * (k < 0.15 ? 0.82 : 0.98); col[i * 3 + 2] = w;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.95 });
    var p = new THREE.Points(g, m);
    p.renderOrder = -2;
    scene.add(p);
    return p;
  })();

  function radialGlowTexture(inner, mid) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 256;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, inner || 'rgba(255,240,200,1)');
    g.addColorStop(0.25, mid || 'rgba(255,190,90,0.55)');
    g.addColorStop(0.6, 'rgba(255,140,40,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    var t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  var glowTex = radialGlowTexture();

  var nebula = null;
  (function () {
    // Procedural seamless nebula: the stars.jpg photo had a bright cropped half that
    // wrapped into a hard gray "dome" band across the sky. This canvas texture is
    // horizontal-seamless and keeps the glow faint so the star Points do the work.
    var W = 2048, H = 1024;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#04060c'; ctx.fillRect(0, 0, W, H);
    var seed = 987654321;
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    function blob(x, y, r, hue, lum, a) {
      for (var w = -1; w <= 1; w++) { // wrap horizontally so the seam is invisible
        var xx = x + w * W;
        if (xx < -r || xx > W + r) continue;
        var g = ctx.createRadialGradient(xx, y, 0, xx, y, r);
        g.addColorStop(0, 'hsla(' + hue + ',35%,' + lum + '%,' + a + ')');
        g.addColorStop(1, 'hsla(' + hue + ',35%,' + lum + '%,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(xx, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // faint galactic band: a sine curve across the sphere with denser dust along it.
    // ~20 blob layers overlap per pixel, so per-blob alpha must stay in the 0.01–0.03 range
    for (var i = 0; i < 900; i++) {
      var tt = i / 900, bx = tt * W;
      var by = H * 0.5 + Math.sin(tt * Math.PI * 2) * H * 0.18 + (rnd() - 0.5) * H * 0.16;
      blob(bx, by, 40 + rnd() * 170, 215 + rnd() * 55, 35 + rnd() * 15, 0.014 + rnd() * 0.014);
    }
    // sparse general nebulosity
    for (var j = 0; j < 220; j++) {
      blob(rnd() * W, rnd() * H, 60 + rnd() * 260, 190 + rnd() * 90, 30 + rnd() * 14, 0.007 + rnd() * 0.011);
    }
    var t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    // mipmapping this fine noise made a checkerboard moiré across the whole sky
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    var geo = new THREE.SphereGeometry(3.4e6, 48, 24);
    var mat = new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false });
    nebula = new THREE.Mesh(geo, mat);
    nebula.renderOrder = -3;
    scene.add(nebula);
  })();

  /* ===================== 3. body construction ============================== */
  var bodies = {};        // id -> { def, group, mesh, halo?, ring?, label, orbitLine, trail, rUnits, pos }
  var orbitLines = { planets: [], dwarf: [], moons: [] };
  var labels = [];
  var trails = [];

  function bodyPosUnits(b) {
    return b.posWorld;
  }

  function makeOrbitLine(colorHex, opacity) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 721), 3));
    var m = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: opacity == null ? 0.4 : opacity, depthWrite: false });
    var line = new THREE.Line(g, m);
    line.frustumCulled = false;
    return line;
  }

  function updateOrbitLine(line, fnSample) {
    var arr = line.geometry.attributes.position.array;
    for (var i = 0; i <= 720; i++) {
      var p = fnSample(i / 720);
      arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2];
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }

  function makeLabel(text, cls) {
    var d = el('div', 'label ' + (cls || ''), text);
    $('labelLayer').appendChild(d);
    labels.push({ el: d, obj: null, parentBody: null });
    return labels[labels.length - 1];
  }

  function sphereGeo(r) {
    var seg = state.quality === 'low' ? 24 : state.quality === 'medium' ? 40 : 64;
    return new THREE.SphereGeometry(r, seg, Math.max(12, seg / 2));
  }

  function addBodyCommon(def, group, parentGroup) {
    (parentGroup || root).add(group);
    var b = { def: def, group: group, mesh: null, label: null, posWorld: new THREE.Vector3() };
    bodies[def.id] = b;
    return b;
  }

  /* ---- Sun ---------------------------------------------------------------- */
  var sunBody = (function () {
    var g = new THREE.Group();
    var rSun = sunRadiusUnits();
    var mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var mesh = new THREE.Mesh(sphereGeo(rSun), mat);
    g.add(mesh);
    onTex('sun.jpg', function (t) {
      if (t) { mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; }
    });
    // corona sprite
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(rSun * 7);
    g.add(sp);
    root.add(g);
    var b = { def: DATA.sun, group: g, mesh: mesh, corona: sp, posWorld: new THREE.Vector3(0, 0, 0) };
    bodies.sun = b;
    b.label = makeLabel('Sun', 'label-star');
    b.label.obj = b;
    return b;
  })();

  /* ---- planets & dwarf planets -------------------------------------------- */
  function buildPlanet(def, isDwarf) {
    var tilt = new THREE.Group();
    tilt.rotation.z = (def.tiltDeg || 0) * DEG;
    var spin = new THREE.Group();
    tilt.add(spin);
    var rU = planetRadiusUnits(def.radiusKm);
    var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color), roughness: 0.92, metalness: 0.0 });
    var mesh = new THREE.Mesh(sphereGeo(rU), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    spin.add(mesh);
    var g = new THREE.Group();
    g.add(tilt);
    root.add(g);

    var b = { def: def, group: g, spin: spin, tilt: tilt, mesh: mesh, rUnits: rU, posWorld: new THREE.Vector3(), isDwarf: !!isDwarf };
    bodies[def.id] = b;

    // real texture or procedural fallback
    var texName = def.tex;
    onTex(texName, function (t) {
      if (t) {
        mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true;
        if (def.id === 'earth') {
          mat.emissive = new THREE.Color(0x2a3a55);   // will be replaced by night map
          onTex('earth_night.jpg', function (nt) {
            if (nt) { mat.emissiveMap = nt; mat.emissiveIntensity = 0.9; mat.emissive = new THREE.Color(0xffffff); mat.needsUpdate = true; }
          });
          if (def.texCloud) onTex(def.texCloud, function (ct) {
            if (!ct) return;
            var cm = new THREE.MeshStandardMaterial({ map: ct, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
            var clouds = new THREE.Mesh(sphereGeo(rU * 1.015), cm);
            b.clouds = clouds; spin.add(clouds);
          });
        }
      } else {
        var cv = PROC.make(def.id, 1024);
        var pt = new THREE.CanvasTexture(cv);
        pt.encoding = THREE.sRGBEncoding;
        mat.map = pt; mat.color.set(0xffffff); mat.needsUpdate = true;
      }
    });

    // Earth atmosphere rim
    if (def.id === 'earth') {
      var atmo = new THREE.Mesh(sphereGeo(rU * 1.045), new THREE.MeshBasicMaterial({
        color: 0x6fa8ff, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      g.add(atmo);
    }

    // Saturn / Uranus / Jupiter faint rings
    if (def.ring) {
      var ringGeo = new THREE.RingGeometry(rU * 1.24, rU * 2.27, 128);
      // remap UVs radially so the ring texture reads outer→inner
      (function () {
        var p = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v3 = new THREE.Vector3();
        for (var i = 0; i < p.count; i++) {
          v3.fromBufferAttribute(p, i);
          var r = v3.length();
          uv.setXY(i, (r - rU * 1.24) / (rU * (2.27 - 1.24)), 0.5);
        }
      })();
      var ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, roughness: 0.85, depthWrite: false });
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.receiveShadow = true;
      tilt.add(ring);
      b.ring = ring;
      onTex(def.ring, function (t) {
        if (t) { ringMat.map = t; ringMat.alphaMap = t; ringMat.transparent = true; ringMat.needsUpdate = true; }
      });
    }

    // orbit line (heliocentric ellipse sampled from the same solver)
    var line = makeOrbitLine(def.color, isDwarf ? 0.28 : 0.42);
    root.add(line);
    b.orbitLine = line;
    orbitLines[isDwarf ? 'dwarf' : 'planets'].push(line);
    line.userData.body = b;

    // trail
    var trailGeo = new THREE.BufferGeometry();
    var TRAIL_N = 400;
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    var trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
    trail.frustumCulled = false;
    trail.visible = false;
    root.add(trail);
    b.trail = { line: trail, n: TRAIL_N, count: 0, pts: [] };
    trails.push(b);

    // label
    b.label = makeLabel(def.name, isDwarf ? 'label-dwarf' : 'label-planet');
    b.label.obj = b;
    return b;
  }
  DATA.planets.forEach(function (p) { buildPlanet(p, false); });
  DATA.dwarfPlanets.forEach(function (p) { buildPlanet(p, true); });

  /* ---- moons --------------------------------------------------------------- */
  var moonGroups = {};   // parent id -> THREE.Group attached to that planet's tilt group
  function buildMoon(m) {
    var pg = moonGroups[m.parent];
    if (!pg) {
      pg = new THREE.Group();
      var pb = bodies[m.parent];
      (pb.tilt || pb.group).add(pg);
      moonGroups[m.parent] = pg;
    }
    var pb = bodies[m.parent];
    var rU = moonRadiusUnits(m.radiusKm);
    var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(m.color), roughness: 0.95 });
    var mesh = new THREE.Mesh(sphereGeo(Math.max(rU, 0.0008)), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    var g = new THREE.Group();
    g.add(mesh);
    pg.add(g);
    var b = { def: m, group: g, mesh: mesh, rUnits: rU, parent: pb, posWorld: new THREE.Vector3(), isMoon: true };
    bodies[m.id] = b;

    onTex(m.tex, function (t) {
      if (t) { mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; }
      else {
        var cv = PROC.make(m.id, 512);
        var pt = new THREE.CanvasTexture(cv);
        pt.encoding = THREE.sRGBEncoding;
        mat.map = pt; mat.color.set(0xffffff); mat.needsUpdate = true;
      }
    });

    // circular orbit ring around parent
    var seg = 96, pts = [];
    for (var i = 0; i <= seg; i++) {
      var th = i / seg * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
    }
    var ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
    var ring = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.22, depthWrite: false }));
    ring.rotation.x = (m.orbit[3] || 0) * DEG;
    pg.add(ring);
    b.moonRing = ring;
    orbitLines.moons.push(ring);
    ring.userData.body = b;

    b.label = makeLabel(m.name, 'label-moon');
    b.label.obj = b;
    b.label.el.style.display = 'none';
    return b;
  }
  DATA.moons.forEach(buildMoon);

  /* ---- asteroid belt (instanced, deterministic) ---------------------------- */
  var belt = (function () {
    var N = state.quality === 'low' ? 900 : 3000;
    var geo = new THREE.IcosahedronGeometry(1, 0);
    var mat = new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 1 });
    var inst = new THREE.InstancedMesh(geo, mat, N);
    var dummy = new THREE.Object3D();
    var R = PROC.rng(18010101);
    var items = [];
    for (var i = 0; i < N; i++) {
      var a = 2.1 + Math.pow(R(), 0.8) * 1.25;             // 2.1–3.35 AU
      if (R() < 0.14) a = 2.5 + (R() < 0.5 ? -0.28 : 0.3); // Kirkwood-ish clumping
      var th = R() * Math.PI * 2;
      var e = R() * 0.14, inc = (R() - 0.5) * 0.16;
      var s = 0.004 + R() * R() * 0.05;
      items.push({ a: a, th: th, e: e, inc: inc, s: s, n: 360 / (365.25 * Math.pow(a, 1.5)) });
    }
    inst.frustumCulled = false;
    root.add(inst);
    return { inst: inst, items: items, dummy: dummy };
  })();

  function updateBelt(jd) {
    var d = belt.dummy, items = belt.items, A = auUnits();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var th = it.th + it.n * (jd - CORE.J2000);
      var r = it.a * (1 - it.e * Math.cos(th));
      var x = r * Math.cos(th) * A, z = -r * Math.sin(th) * A, y = r * Math.sin(th) * it.inc * A;
      d.position.set(x, y, z);
      d.rotation.set(th, th * 1.7, 0);
      var s = it.s * A * 0.1;
      d.scale.setScalar(Math.max(s, 0.002));
      d.updateMatrix();
      belt.inst.setMatrixAt(i, d.matrix);
    }
    belt.inst.instanceMatrix.needsUpdate = true;
  }

  /* ================== 4. simulation clock & positions ======================= */
  var simDaysTotal = 0;
  var jd0 = state.jd;

  function setJd(jd) {
    if (Math.abs(jd - state.jd) > 0.05) resetTrails();
    state.jd = jd;
  }

  function resetTrails() {
    for (var id in bodies) {
      var b = bodies[id];
      if (b.trail) { b.trail.pts = []; b.trail.count = 0; }
    }
  }

  var _buf = [0, 0, 0], _buf2 = [0, 0, 0];

  function updatePositions(jd) {
    var A = auUnits();

    // planets & dwarf planets
    var all = DATA.planets.concat(DATA.dwarfPlanets);
    for (var i = 0; i < all.length; i++) {
      var def = all[i], b = bodies[def.id];
      CORE.heliocentric(def.orbit, jd, def.orbitSource, _buf);
      CORE.scenePos(_buf, state.scaleMode === 'real' ? 1 : state.distScale, _buf2);
      b.posWorld.set(_buf2[0], _buf2[1], _buf2[2]);
      b.group.position.copy(b.posWorld);
      b.helioAu = _buf.slice();
      // spin
      if (def.rotPeriodH) {
        var rot = ((jd - CORE.J2000) * 24 / def.rotPeriodH) * 360;
        b.spin.rotation.y = rot * DEG;
      }
      if (b.clouds) b.clouds.rotation.y = rot * DEG * 1.08;
      // orbit ellipse (sampled from the same solver over one mean period)
      if (b.orbitLine && b.orbitLine.visible) {
        var el = CORE.elementsAt(def.orbit, jd, def.orbitSource);
        var P = 365.25 * Math.pow(Math.abs(el.a), 1.5);
        var arr = b.orbitLine.geometry.attributes.position.array;
        for (var k = 0; k <= 720; k++) {
          CORE.heliocentric(def.orbit, jd + (k / 720) * P, def.orbitSource, _buf);
          CORE.scenePos(_buf, state.scaleMode === 'real' ? 1 : state.distScale, _buf2);
          arr[k * 3] = _buf2[0]; arr[k * 3 + 1] = _buf2[1]; arr[k * 3 + 2] = _buf2[2];
        }
        b.orbitLine.geometry.attributes.position.needsUpdate = true;
        b.orbitLine.geometry.computeBoundingSphere();
      }
    }

    // moons
    for (var mi = 0; mi < DATA.moons.length; mi++) {
      var m = DATA.moons[mi], mb = bodies[m.id];
      var pb = bodies[m.parent];
      CORE.moonLocal(m, jd, _buf);          // fills _buf; return value is an object, not the array
      var localKm = _buf;
      var mu = moonOrbitUnits(m.orbit[0], pb.rUnits || 1, m.radiusKm);
      var scale = mu / Math.max(Math.hypot(localKm[0], localKm[1], localKm[2]), 1e-9);
      mb.group.position.set(localKm[0] * scale, localKm[1] * scale, localKm[2] * scale);
      mb.group.getWorldPosition(mb.posWorld);
      if (mb.moonRing) mb.moonRing.scale.setScalar(mu);
      mb.distKm = Math.hypot(localKm[0], localKm[1], localKm[2]);
      // tidally locked moons keep one face toward the parent
      if (m.tidallyLocked) mb.mesh.rotation.y = -Math.atan2(localKm[2], localKm[0]) + Math.PI / 2;
      else if (m.rotPeriodH) mb.mesh.rotation.y = ((jd - CORE.J2000) * 24 / m.rotPeriodH) * 360 * DEG;
    }

    // sun spin + corona pulse
    sunBody.mesh.rotation.y = ((jd - CORE.J2000) * 24 / DATA.sun.rotPeriodH) * 360 * DEG;

    updateBelt(jd);
    updateTrails();
  }

  function updateTrails() {
    if (!state.showTrails) return;
    for (var i = 0; i < trails.length; i++) {
      var b = trails[i], t = b.trail;
      var p = b.posWorld;
      var last = t.pts[t.pts.length - 1];
      if (!last) {
        t.pts.push(p.clone());
      } else {
        var d2 = p.distanceToSquared(last);
        /* At high sim rates a frame can advance months of orbital motion;
           connecting such far-apart samples draws chords across the orbit
           (the woven-web artifact). If a step exceeds ~1.7° of the orbit,
           restart the trail instead of connecting the jump. */
        var maxSeg = Math.max(p.length() * 0.03, auUnits() * 2e-4);
        if (d2 > maxSeg * maxSeg) { t.pts = [p.clone()]; t.count = 0; }
        else if (d2 > 1e-6) { t.pts.push(p.clone()); }
      }
      if (t.pts.length > t.n) t.pts.shift();
      t.line.visible = b.orbitLine && state.showTrails && t.pts.length > 2 &&
        !(state.observerMode === 'topo');
      if (!t.line.visible) continue;
      var arr = t.line.geometry.attributes.position.array;
      var carr = t.line.geometry.attributes.color.array;
      var col = new THREE.Color(b.def.color);
      var n = t.pts.length;
      for (var k = 0; k < n; k++) {
        arr[k * 3] = t.pts[k].x; arr[k * 3 + 1] = t.pts[k].y; arr[k * 3 + 2] = t.pts[k].z;
        var f = (k / n) * (k / n);
        carr[k * 3] = col.r * f; carr[k * 3 + 1] = col.g * f; carr[k * 3 + 2] = col.b * f;
      }
      t.line.geometry.setDrawRange(0, n);
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.geometry.attributes.color.needsUpdate = true;
    }
  }

  /* ===================== 5. camera behaviour ================================= */
  function focusRadiusFor(b) {
    var r = b.rUnits || (b.def.id === 'sun' ? sunRadiusUnits() : 1);
    return Math.max(r * 6, 0.08);
  }

  function selectBody(id, fly) {
    if (!bodies[id]) return;
    state.selected = id;
    var b = bodies[id];
    document.querySelectorAll('.body-item').forEach(function (d) {
      d.classList.toggle('is-sel', d.getAttribute('data-id') === id);
    });
    showInfo(b.def);
    if (fly !== false) {
      cam.radiusWanted = focusRadiusFor(b);
      if (b.def.kind !== 'star') state.follow = true;
      setFollowUi();
    }
    updateOrbitVisibility();
    if (state.observerMode === 'topo') topoSkyDirty = true;
  }

  function deselect() {
    state.selected = null;
    state.follow = false; setFollowUi();
    $('infoPanel').hidden = true;
    document.querySelectorAll('.body-item.is-sel').forEach(function (d) { d.classList.remove('is-sel'); });
    updateOrbitVisibility();
  }

  function updateCamera(dt) {
    var following = false;
    if (state.follow && state.selected && bodies[state.selected]) {
      cam.targetWanted.copy(bodies[state.selected].posWorld);
      following = true;
    }
    if (state.observerMode === 'geo') {
      cam.targetWanted.copy(bodies.earth.posWorld);
    }
    if (state.observerMode === 'topo') {
      cam.targetWanted.set(0, 0, 0);
    }
    cam.update(dt, following ? 14 : 0);
  }

  /* ---- picking --------------------------------------------------------------- */
  var raycaster = new THREE.Raycaster();
  var pickMeshes = [];
  (function () {
    for (var id in bodies) {
      var b = bodies[id];
      if (b.mesh) { b.mesh.userData.bodyId = id; pickMeshes.push(b.mesh); }
    }
  })();

  function pointerRay(e) {
    var rect = renderer.domElement.getBoundingClientRect();
    var v = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    // generous pick: expand ray sphere by testing bounding spheres manually
    var best = null, bestD = Infinity;
    for (var i = 0; i < pickMeshes.length; i++) {
      var m = pickMeshes[i];
      if (!m.visible || !m.parent.visible) continue;
      var sph = m.geometry.boundingSphere || m.geometry.computeBoundingSphere() || m.geometry.boundingSphere;
      if (!sph) continue;
      var center = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
      var rad = Math.max(sph.radius * m.getWorldScale(new THREE.Vector3()).x, cam.radius * 0.012);
      var pt = new THREE.Vector3();
      raycaster.ray.closestPointToPoint(center, pt);
      var d = pt.distanceTo(center);
      if (d < rad) {
        var along = raycaster.ray.direction.dot(center.clone().sub(raycaster.ray.origin));
        if (along > 0 && along < bestD) { bestD = along; best = m.userData.bodyId; }
      }
    }
    return best;
  }

  function onClickPick(e) {
    var id = pointerRay(e);
    if (id) selectBody(id, true);
    else if (e.button === 0) { /* keep selection; empty click just pans */ }
  }

  var hoverTip = $('hoverTip'), lastHover = 0;
  function onHover(e) {
    var now = performance.now();
    if (now - lastHover < 90) return;
    lastHover = now;
    var id = pointerRay(e);
    if (id) {
      hoverTip.hidden = false;
      hoverTip.style.left = (e.clientX + 14) + 'px';
      hoverTip.style.top = (e.clientY + 10) + 'px';
      var b = bodies[id];
      var dist = b.posWorld.length() / auUnits();
      hoverTip.innerHTML = '<b>' + b.def.name + '</b>' +
        (id === 'sun' ? '' : ' · ' + dist.toFixed(2) + ' AU from Sun');
      renderer.domElement.style.cursor = 'pointer';
    } else {
      hoverTip.hidden = true;
      renderer.domElement.style.cursor = 'grab';
    }
  }

  /* ---- view presets ---------------------------------------------------------- */
  function setView(theta, phi, radius, targetBody) {
    cam.theta = theta; cam.phi = phi;
    cam.radiusWanted = radius; cam.radius = radius;
    state.follow = !!targetBody;
    if (targetBody && bodies[targetBody]) cam.targetWanted.copy(bodies[targetBody].posWorld);
    else cam.targetWanted.set(0, 0, 0);
    setFollowUi();
  }

  var PRESETS = [
    { name: 'Full system', fn: function () { setView(0.9, 1.0, auUnits() * 42); } },
    { name: 'Inner worlds', fn: function () { setView(0.9, 1.05, auUnits() * 1.3); } },
    { name: 'Outer giants', fn: function () { setView(2.2, 1.1, auUnits() * 26); } },
    { name: 'Earth & Moon', fn: function () { selectBody('moon'); } },
    { name: 'Jupiter system', fn: function () { selectBody('jupiter'); } },
    { name: 'Saturn & rings', fn: function () { selectBody('saturn'); cam.phi = 1.35; } },
    { name: 'Pluto & Charon', fn: function () { selectBody('pluto'); } },
    { name: 'Ecliptic top', fn: function () { setView(0.9, 0.03, auUnits() * 20); } },
    { name: 'Edge-on', fn: function () { setView(0.9, Math.PI / 2 - 0.02, auUnits() * 20); } },
    { name: 'Scientific scale', fn: function () { setScaleMode('real'); setView(0.9, 1.0, auUnits() * 1.15); } }
  ];

  /* ---- right-side view buttons (Reset view / Top view / Edge-on / Follow) ----
   * these existed in index.html but had no listeners wired up */
  $('btnResetCam').addEventListener('click', function () {
    setView(0.9, 1.0, auUnits() * 42);
    toast('View reset — full Solar System');
  });
  $('btnTopView').addEventListener('click', function () {
    setView(0.9, 0.03, auUnits() * 20);
    toast('Top view — straight down on the ecliptic plane');
  });
  $('btnEdgeView').addEventListener('click', function () {
    setView(0.9, Math.PI / 2 - 0.02, auUnits() * 20);
    toast('Edge-on view — the system seen from the ecliptic plane');
  });
  $('btnFollow').addEventListener('click', function () {
    if (!state.follow && !state.selected) { toast('Follow needs a selection — click a body first'); return; }
    state.follow = !state.follow; setFollowUi();
    toast('Camera follow ' + (state.follow ? 'on' : 'off'));
  });

  /* ---- ecliptic grid ---------------------------------------------------------- */
  var grid = new THREE.PolarGridHelper(auUnits() * 40, 12, 16, 96, 0x35506b, 0x24374d);
  grid.material.transparent = true; grid.material.opacity = 0.35; grid.material.depthWrite = false;
  grid.visible = false;
  root.add(grid);

  /* ===================== Earth-surface observer mode ========================= */
  var skyGroup = new THREE.Group();
  scene.add(skyGroup);
  skyGroup.visible = false;   // the dome+ground stay hidden until Earth-surface mode
  var skyObjs = {};
  (function buildSky() {
    var dome = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 32, 16),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, vertexColors: true }));
    var pos = dome.geometry.attributes.position, cols = [];
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 1200;
      var t = clamp(y, 0, 1);
      cols.push(lerp(0.02, 0.03, t), lerp(0.03, 0.06, t), lerp(0.06, 0.14, t));
    }
    dome.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    skyGroup.add(dome);
    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(1400, 64),
      new THREE.MeshBasicMaterial({ color: 0x0b0e10 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.2;
    skyGroup.add(ground);

    function addDot(id, color, size) {
      var mat = new THREE.MeshBasicMaterial({ color: color });
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), mat);
      skyGroup.add(mesh);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      glow.scale.setScalar(size * 6);
      mesh.add(glow);
      if (id === 'moon') glow.visible = false;
      skyObjs[id] = mesh;
    }
    addDot('sun', 0xffe9b0, 22);
    addDot('moon', 0xe8e8ea, 20);
    DATA.planets.concat(DATA.dwarfPlanets).forEach(function (p) { addDot(p.id, p.color, 3.4); });
  })();
  var topoSkyDirty = true;

  function altAzToScene(alt, az, R) {
    var a = alt * DEG, z = az * DEG;
    return new THREE.Vector3(R * Math.cos(a) * Math.sin(z), R * Math.sin(a), R * Math.cos(a) * Math.cos(z));
  }

  function updateTopoSky(jd) {
    var lat = state.loc.lat, lon = state.loc.lon;
    const lstDeg = CORE.lst(jd, lon);
    var domeR = 900;

    // Sun
    heliTopo('sun', jd, lat, lstDeg);
    // Moon
    (function () {
      CORE.moonGeoEcliptic(moonDef(), jd, _buf);
      CORE.geoToEq(_buf[0], _buf[1], _buf[2], _buf2);
      var rd = CORE.radDec(_buf2);
      var aa = CORE.altAz(rd.ra, rd.dec, lstDeg, lat);
      placeSky('moon', aa);
    })();
    // planets
    var earthH = bodies.earth.helioAu;
    DATA.planets.concat(DATA.dwarfPlanets).forEach(function (p) {
      if (p.id === 'earth') return;
      CORE.heliocentric(p.orbit, jd, p.orbitSource, _buf);
      var gx = _buf[0] - earthH[0], gy = _buf[1] - earthH[1], gz = _buf[2] - earthH[2];
      CORE.geoToEq(gx, gy, gz, _buf2);
      var rd = CORE.radDec(_buf2);
      var aa = CORE.altAz(rd.ra, rd.dec, lstDeg, lat);
      placeSky(p.id, aa);
    });

    $('soLst').textContent = (lstDeg / 15).toFixed(2) + ' h';
    var vc = new THREE.Vector3(Math.sin(cam.theta), Math.cos(cam.phi), Math.sin(cam.theta) * 0).normalize();
    // derive view centre from camera direction
    var dir = new THREE.Vector3().subVectors(cam.target, camera.position).normalize();
    var altV = Math.asin(clamp(dir.y, -1, 1)) / DEG;
    var azV = (Math.atan2(dir.x, dir.z) / DEG + 360) % 360;
    $('soAlt').textContent = altV.toFixed(0) + '°';
    $('soAz').textContent = azV.toFixed(0) + '°';
    topoSkyDirty = false;

    function placeSky(id, aa) {
      var o = skyObjs[id];
      if (!o) return;
      var p = altAzToScene(aa.alt, aa.az, domeR);
      o.position.copy(p);
      o.visible = aa.alt > -2;
    }
  }
  function moonDef() { return DATA.moons.filter(function (m) { return m.id === 'moon'; })[0]; }
  function heliTopo(id, jd, lat, lstDeg) {
    // Sun geocentric = -earth heliocentric
    var e = bodies.earth.helioAu;
    CORE.geoToEq(-e[0], -e[1], -e[2], _buf2);
    var rd = CORE.radDec(_buf2);
    var aa = CORE.altAz(rd.ra, rd.dec, lstDeg, lat);
    var o = skyObjs[id];
    o.position.copy(altAzToScene(aa.alt, aa.az, 900));
    o.visible = aa.alt > -2;
  }

  function enterTopo() {
    state.surfaceMode = true;
    root.visible = false;
    starPoints.visible = state.stars;
    if (nebula) nebula.visible = false;
    skyGroup.visible = true;
    $('surfaceOverlay').hidden = false;
    cam.radiusWanted = 0.001; cam.radius = 0.001;
    cam.phi = clamp(cam.phi, 0.05, Math.PI / 2 + 0.12);
    topoSkyDirty = true;
    $('soWhere').textContent = state.loc.name + '  (' + state.loc.lat.toFixed(3) + ', ' + state.loc.lon.toFixed(3) + ')';
    setView(0.9, Math.PI / 2 - 0.25, 0.001);
  }
  function leaveTopo() {
    state.surfaceMode = false;
    root.visible = true;
    if (nebula) nebula.visible = state.nebula;
    starPoints.visible = state.stars;
    skyGroup.visible = false;
    $('surfaceOverlay').hidden = true;
    setView(0.9, 1.0, auUnits() * 42);
  }

  /* ---- labels ---------------------------------------------------------------- */
  function updateLabels() {
    if (!state.showLabels) { labels.forEach(function (l) { l.el.style.display = 'none'; }); return; }
    var w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    var v = new THREE.Vector3();
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i], b = l.obj;
      if (!b || b.def.kind === 'moon' && !state.showMoonLabels && state.selected !== b.def.id && (!bodies[b.def.parent] || state.selected !== b.def.parent)) {
        l.el.style.display = 'none'; continue;
      }
      if (state.surfaceMode) { l.el.style.display = 'none'; continue; }
      v.copy(b.posWorld);
      if (b.def.kind === 'moon') b.group.getWorldPosition(v);
      var dist = v.distanceTo(camera.position);
      v.project(camera);
      var behind = v.z > 1;
      var tooFar = b.def.kind === 'moon' && dist > cam.radius * 1.4 && state.selected !== b.def.parent;
      if (behind || tooFar || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { l.el.style.display = 'none'; continue; }
      l.el.style.display = 'block';
      l.el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
      l.el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
    }
  }


  /* ===================== 6. clock, time controls, timeline ================== */
  function toast(msg, ms) {
    var t = el('div', 'toast', msg);
    $('toastHost').appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .4s'; t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 420);
    }, ms || 2600);
  }

  function tzMs() { return state.loc.tz * 3600000; }
  function simDate() { return new Date(CORE.dateFromJd(state.jd).getTime() + tzMs()); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function jdToYearFrac(jd) { return 2000 + (jd - 2451545.0) / 365.25; }
  function yearFracToJd(y) { return 2451545.0 + (y - 2000) * 365.25; }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function updateClockUi() {
    var d = simDate();
    var y = d.getUTCFullYear();
    $('simDateLong').textContent = MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + y;
    $('simTimeShort').textContent = pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
    $('simJD').textContent = 'JD ' + state.jd.toFixed(3);
    $('simTZ').textContent = 'UTC' + (state.loc.tz >= 0 ? '+' : '') + (state.loc.tz % 1 === 0 ? state.loc.tz : state.loc.tz.toFixed(2));
    var sc = $('timeScrubber');
    if (document.activeElement !== sc) {
      var yf = jdToYearFrac(state.jd);
      sc.value = clamp(yf, +sc.min, +sc.max);
    }
    $('tlMid').textContent = yf.toFixed(3);
    var di = $('dateInput'), ti = $('timeInput');
    if (document.activeElement !== di) di.value = isoDate(d);
    if (document.activeElement !== ti) ti.value = pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
    $('speedReadout').textContent = state.rateLabel + (state.playing ? '' : ' (paused)');
  }
  function isoDate(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }

  /* clock click uses the displayed (tz-shifted) civil fields */
  function civilToJd(y, mo, dy, h, mi) {
    return CORE.jdFromCivil(y, mo, dy, h - state.loc.tz, mi);
  }
  function setFromBottomCal() {
    var dv = $('dateInput').value, tv = $('timeInput').value || '00:00';
    if (!/^\d{3,}-\d\d-\d\d$/.test(dv)) return;
    var p = dv.split('-'), t = tv.split(':');
    setJd(civilToJd(+p[0], +p[1], +p[2], +t[0], +t[1]));
  }
  $('dateInput').addEventListener('change', setFromBottomCal);
  $('timeInput').addEventListener('change', setFromBottomCal);

  /* bottom timeline scrubber */
  var scrubbing = false;
  $('timeScrubber').addEventListener('input', function () { setJd(yearFracToJd(+this.value)); });
  $('timeScrubber').addEventListener('pointerdown', function () { scrubbing = true; });
  window.addEventListener('pointerup', function () { scrubbing = false; });

  /* play / rate controls ------------------------------------------------------*/
  function setRate(daysPerSec, label) {
    state.rate = daysPerSec;
    state.rateLabel = label || (daysPerSec === 0 ? 'paused' : formatRate(daysPerSec));
    $('speedReadout').textContent = state.rateLabel + (state.playing ? '' : ' (paused)');
    var sel = $('speedSel');
    for (var i = 0; i < sel.options.length; i++) {
      if (Math.abs(parseFloat(sel.options[i].value) - Math.abs(daysPerSec)) < 1e-9) { sel.value = sel.options[i].value; break; }
    }
    $('speedCustom').value = state.rateLabel;
    $('modePill').title = state.rate < 0 ? 'Time flows backward' : 'Time flows forward';
  }
  function formatRate(v) {
    var a = Math.abs(v), sign = v < 0 ? '-' : '';
    if (a >= 365.25 * 100) return sign + Math.round(a / 365.25) + ' y/s';
    if (a >= 365.25 * 2) return sign + (a / 365.25).toFixed(1) + ' y/s';
    if (a >= 2) return sign + (a >= 20 ? Math.round(a) : a.toFixed(1)) + ' d/s';
    if (a >= 1 / 24) return sign + (a * 24 >= 2 ? Math.round(a * 24) : (a * 24).toFixed(1)) + ' h/s';
    if (a >= 1 / 600) return sign + Math.round(a * 1440) + ' min/s';
    return sign + Math.max(1, Math.round(a * 86400)) + ' s/s';
  }
  function parseRate(txt) {
    var m = /^\s*(-?\d*\.?\d+)\s*(s|sec|seconds?|min|m|min(s)?|h|hr|hours?|d|day|days|wk|week|weeks?|mo|month|months|y|yr|year|years?)?\s*(\/\s*s)?\s*$/i.exec(txt);
    if (!m) return null;
    var v = parseFloat(m[1]);
    var unit = (m[2] || 'd').toLowerCase();
    var days = 1;
    if (unit[0] === 's') days = 1 / 86400;
    else if (unit[0] === 'm' && unit.indexOf('mo') !== 0) days = 1 / 1440;
    else if (unit[0] === 'h') days = 1 / 24;
    else if (unit[0] === 'd') days = 1;
    else if (unit[0] === 'w') days = 7;
    else if (unit[0] === 'mo') days = 30.44;
    else if (unit[0] === 'y') days = 365.25;
    return v * days;
  }
  function stepRate(dir) {
    var labels = RATE_LABELS, cur = Math.abs(state.rate);
    var idx = -1, best = Infinity;
    for (var i = 0; i < labels.length; i++) {
      var dd = Math.abs(Math.log(labels[i][1] / Math.max(cur, 1e-9)));
      if (dd < best) { best = dd; idx = i; }
    }
    idx = clamp(idx + dir, 0, labels.length - 1);
    setRate(labels[idx][1] * (state.rate < 0 ? -1 : 1), labels[idx][0]);
  }
  (function fillSpeedSel() {
    var sel = $('speedSel');
    RATE_LABELS.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r[1]; o.textContent = r[0];
      sel.appendChild(o);
    });
    sel.value = 1;
    sel.addEventListener('change', function () { setRate(parseFloat(this.value) * (state.rate < 0 ? -1 : 1), this.selectedOptions[0].textContent); });
    var inp = $('speedCustom');
    inp.addEventListener('change', function () {
      var v = parseRate(this.value);
      if (v == null || v === 0) { toast('Could not read rate. Try e.g. "3 h/s" or "100 d/s"'); updateClockUi(); return; }
      setRate(v);
    });
  })();

  function setPlaying(p) {
    state.playing = p;
    $('btnPlay').textContent = p ? '❚❚' : '▶';
    $('btnPlay').title = p ? 'Pause the simulation' : 'Play the simulation';
    $('speedReadout').textContent = state.rateLabel + (p ? '' : ' (paused)');
  }
  $('btnPlay').addEventListener('click', function () { setPlaying(!state.playing); });
  $('btnRev').addEventListener('click', function () { setRate(-Math.abs(state.rate)); });
  $('btnFwd').addEventListener('click', function () { setRate(Math.abs(state.rate)); });
  $('btnRewFast').addEventListener('click', function () { stepRate(-1); });
  $('btnFFFast').addEventListener('click', function () { stepRate(+1); });
  $('btnResetTime').addEventListener('click', function () {
    setJd(CORE.jdFromDate(new Date())); toast('Jumped to the present moment');
  });

  /* date popover ---------------------------------------------------------------*/
  var pop = $('datePopover');
  function openDatePop() {
    var d = simDate();
    $('pickDate').value = isoDate(d);
    $('pickTime').value = pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
    $('pickYear').value = Math.round(d.getUTCFullYear());
    $('pickYearSlider').value = clamp(jdToYearFrac(state.jd), 1800, 2050);
    pop.hidden = false;
  }
  $('btnOpenDate').addEventListener('click', openDatePop);
  $('btnCloseDate').addEventListener('click', function () { pop.hidden = true; });
  $('btnGoDate').addEventListener('click', function () {
    var dv = $('pickDate').value;
    if (/^\d{3,}-\d\d-\d\d$/.test(dv)) {
      var t = ($('pickTime').value || '00:00').split(':');
      var p = dv.split('-');
      setJd(civilToJd(+p[0], +p[1], +p[2], +t[0], +t[1]));
    } else if ($('pickYear').value) {
      var y = +$('pickYear').value;
      setJd(yearFracToJd(y));
    }
    pop.hidden = true;
  });
  $('btnNowDate').addEventListener('click', function () { setJd(CORE.jdFromDate(new Date())); pop.hidden = true; });
  $('pickYearSlider').addEventListener('input', function () { setJd(yearFracToJd(+this.value)); });
  $('pickQuick').addEventListener('change', function () {
    var J = {
      now: null, j2000: 2451545.0, moonlanding: CORE.jdFromCivil(1969, 7, 20, 20, 17),
      cassini: CORE.jdFromCivil(2004, 7, 1, 12), newhorizons: CORE.jdFromCivil(2015, 7, 14, 12),
      perseid: CORE.jdFromCivil(2026, 8, 12, 22), eclipse: CORE.jdFromCivil(2026, 8, 12, 17, 45),
      transit: CORE.jdFromCivil(2117, 5, 19, 12)
    }[this.value];
    if (this.value === 'now') setJd(CORE.jdFromDate(new Date()));
    else if (J != null) { setJd(J); if (this.value === 'transit') toast('2117 is outside the 1800–2050 best-fit element range — position extrapolated'); }
    this.value = '';
    pop.hidden = true;
  });


  /* ===================== 7. navigation, options, info panel ================= */

  /* ---- body list & search ----------------------------------------------------*/
  var KIND_LABEL = { planet: 'Planet', dwarf: 'Dwarf planet', moon: 'Moon', star: 'Star' };
  function allDefs() {
    return [DATA.sun].concat(DATA.planets).concat(DATA.dwarfPlanets).concat(DATA.moons);
  }
  function renderBodyList(filter) {
    var host = $('bodyList');
    host.innerHTML = '';
    var f = (filter || '').trim().toLowerCase();
    function sectionTitle(t) { host.appendChild(el('div', 'list-group', t)); }
    function item(def) {
      if (f && def.name.toLowerCase().indexOf(f) !== 0 && def.name.toLowerCase().indexOf(f) < 0) return false;
      var d = el('div', 'body-item', '');
      d.setAttribute('data-id', def.id);
      d.innerHTML = '<span class="dot" style="background:' + def.color + '"></span>' +
        '<span class="bi-name">' + def.name + '</span>' +
        '<span class="bi-kind">' + (KIND_LABEL[def.kind] || (def.parent ? 'Moon' : '')) + '</span>';
      d.addEventListener('click', function () { selectBody(def.id, true); });
      host.appendChild(d);
      return true;
    }
    var any = false;
    sectionTitle('Star'); if (item(DATA.sun)) any = true;
    sectionTitle('Planets'); DATA.planets.forEach(function (p) { if (item(p)) any = true; });
    sectionTitle('Dwarf planets'); DATA.dwarfPlanets.forEach(function (p) { if (item(p)) any = true; });
    sectionTitle('Moons');
    DATA.moons.forEach(function (m) {
      var mm = { id: m.id, name: m.name, color: m.color, kind: 'moon' };
      if (item(mm)) any = true;
    });
    if (f && !any) host.appendChild(el('div', 'list-empty', 'Nothing matches “' + filter + '”.'));
    var sel = document.querySelector('.body-item.is-sel');
    if (!sel && state.selected) {
      var d2 = host.querySelector('[data-id="' + state.selected + '"]');
      if (d2) d2.classList.add('is-sel');
    }
  }
  renderBodyList('');
  var searchT = null;
  $('searchInput').addEventListener('input', function () {
    var v = this.value;
    clearTimeout(searchT);
    searchT = setTimeout(function () { renderBodyList(v); }, 90);
  });
  $('btnClearSearch').addEventListener('click', function () {
    $('searchInput').value = ''; renderBodyList('');
  });

  /* ---- view presets ----------------------------------------------------------*/
  PRESETS.forEach(function (p) {
    var b = el('button', 'btn', p.name);
    b.addEventListener('click', p.fn);
    $('presetGrid').appendChild(b);
  });

  /* ---- collapse sections ------------------------------------------------------*/
  document.querySelectorAll('.blk-head').forEach(function (h) {
    h.addEventListener('click', function () {
      var id = this.getAttribute('data-collapse');
      var body = $('blk-' + id);
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      this.classList.toggle('is-collapsed', open);
    });
  });

  /* ---- location ---------------------------------------------------------------*/
  var LOC_PRESETS = [
    ['Istanbul — 41.008° N, 28.978° E', 41.0082, 28.9784, 40, 3],
    ['Greenwich, London — 51.478° N, 0°', 51.4779, 0, 46, 0],
    ['New York — 40.713° N, 74.006° W', 40.7128, -74.006, 10, -5],
    ['Los Angeles — 34.052° N, 118.244° W', 34.0522, -118.2437, 71, -8],
    ['Reykjavík — 64.147° N, 21.94° W', 64.1466, -21.9426, 46, 0],
    ['Tromsø (aurora zone) — 69.649° N, 18.956° E', 69.6492, 18.9553, 9, 1],
    ['Nairobi — 1.292° S, 36.822° E', -1.2921, 36.8219, 1795, 3],
    ['Tokyo — 35.68° N, 139.69° E', 35.6762, 139.6503, 40, 9],
    ['Sydney — 33.868° S, 151.209° E', -33.8688, 151.2093, 3, 10],
    ['McMurdo Station, Antarctica — 77.846° S', -77.8459, 166.689, 10, 12],
    ['Atacama Desert (VLT) — 24.627° S, 70.404° W', -24.6275, -70.4044, 2635, -4],
    ['Mauna Kea Observatories — 19.821° N', 19.8207, -155.4681, 4145, -10]
  ];
  (function fillLocPreset() {
    var s = $('locPreset');
    LOC_PRESETS.forEach(function (l, i) {
      var o = document.createElement('option'); o.value = i; o.textContent = l[0]; s.appendChild(o);
    });
    s.addEventListener('change', function () {
      var l = LOC_PRESETS[+this.value];
      $('locName').value = l[0].split(' — ')[0];
      $('locLat').value = l[1]; $('locLon').value = l[2]; $('locElev').value = l[3]; $('locTz').value = l[4];
      applyLocation();
    });
  })();
  function applyLocation() {
    state.loc.name = $('locName').value || 'Your location';
    state.loc.lat = clamp(parseFloat($('locLat').value) || 0, -90, 90);
    state.loc.lon = ((parseFloat($('locLon').value) || 0) + 540) % 360 - 180;
    state.loc.elev = parseFloat($('locElev').value) || 0;
    state.loc.tz = clamp(parseFloat($('locTz').value) || 0, -12, 14);
    $('locReadout').innerHTML = state.loc.name + ' — lat ' + state.loc.lat.toFixed(4) +
      ', lon ' + state.loc.lon.toFixed(4) + ', elev ' + fmtNum(state.loc.elev, 0) + ' m, UTC' +
      (state.loc.tz >= 0 ? '+' : '') + state.loc.tz;
    topoSkyDirty = true;
    if (state.surfaceMode) $('soWhere').textContent = state.loc.name + '  (' + state.loc.lat.toFixed(3) + ', ' + state.loc.lon.toFixed(3) + ')';
    if (state.selected) refreshInfoLive();
    toast('Location updated — observer math now uses ' + state.loc.name);
  }
  $('btnApplyLocation').addEventListener('click', applyLocation);
  $('btnUseDeviceTz').addEventListener('click', function () {
    $('locTz').value = -new Date().getTimezoneOffset() / 60;
    applyLocation();
  });
  applyLocation();

  /* ---- observer mode ------------------------------------------------------------*/
  function setObserverMode(mode) {
    if (mode === state.observerMode) return;
    var prev = state.observerMode;
    state.observerMode = mode;
    document.querySelectorAll('#obsModeSeg .seg-btn').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-obs') === mode);
    });
    $('frameReadout').textContent = mode === 'helio' ? 'Heliocentric' : mode === 'geo' ? 'Geocentric' : 'Earth surface';
    if (prev === 'topo' && mode !== 'topo') leaveTopo();
    if (mode === 'topo') {
      selectBody('sun', false);
      enterTopo();
      toast('Earth-surface view: the dome shows the real sky for your location and date. “Next body in sky” hops between objects.');
    } else {
      state.surfaceMode = false;
      root.visible = true; skyGroup.visible = false;
      $('surfaceOverlay').hidden = true;
      if (nebula) nebula.visible = state.nebula;
      starPoints.visible = state.stars;
      if (mode === 'geo') {
        selectBody('earth', false);
        state.follow = false; setFollowUi();
        cam.radiusWanted = auUnits() * 0.02;
        cam.targetWanted.copy(bodies.earth.posWorld);
      } else {
        state.follow = true; setFollowUi();
        setView(0.9, 1.0, auUnits() * 42);
      }
    }
    updateOrbitVisibility();
  }
  document.querySelectorAll('#obsModeSeg .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { setObserverMode(this.getAttribute('data-obs')); });
  });

  /* ---- orbits & labels options ----------------------------------------------------*/
  function updateOrbitVisibility() {
    var o = state.showOrbits, sel = state.selected;
    orbitLines.planets.forEach(function (l) {
      var b = l.userData.body;
      l.visible = (o.planets && (!o.selectedOnly || b.def.id === sel));
    });
    orbitLines.dwarf.forEach(function (l) {
      var b = l.userData.body;
      l.visible = (o.dwarf && (!o.selectedOnly || b.def.id === sel));
    });
    orbitLines.moons.forEach(function (l) {
      var b = l.userData.body;
      var parentSel = b.def.parent === sel;
      /* never draw a moon's own orbit ring while it is selected — the camera
         focuses onto the ring line itself and tiny float errors make the
         whole frame wobble (very visible on Phoebe's 12.9M-km orbit) */
      l.visible = (o.moons || parentSel) && b.def.id !== sel && (!o.selectedOnly || parentSel);
    });
  }
  function bindChk(id, fn) {
    var c = $(id);
    c.addEventListener('change', function () { fn(this.checked); });
  }
  bindChk('optOrbitPlanets', function (v) { state.showOrbits.planets = v; updateOrbitVisibility(); });
  bindChk('optOrbitDwarf', function (v) { state.showOrbits.dwarf = v; updateOrbitVisibility(); });
  bindChk('optOrbitMoons', function (v) { state.showOrbits.moons = v; updateOrbitVisibility(); });
  bindChk('optOrbitSelected', function (v) { state.showOrbits.selectedOnly = v; updateOrbitVisibility(); });
  bindChk('optLabels', function (v) { state.showLabels = v; });
  bindChk('optLabelMoons', function (v) { state.showMoonLabels = v; });
  bindChk('optTrails', function (v) { state.showTrails = v; if (!v) resetTrails(); });
  bindChk('optEclipticGrid', function (v) { grid.visible = v; });
  bindChk('optMarkers', function (v) { state.showMarkers = v; });

  /* ---- scale --------------------------------------------------------------------*/
  function setScaleMode(mode) {
    if (mode === state.scaleMode) return;
    state.scaleMode = mode;
    document.querySelectorAll('#scaleModeSeg .seg-btn').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-scale') === mode);
    });
    rescaleBodies();
    resetTrails();
    $('scaleHint').textContent = mode === 'real'
      ? 'Scientific scale: true proportional sizes and distances — planets become specks. Zoom close to a body to see it.'
      : 'Explorer mode exaggerates body sizes so they are visible. Calculated orbital positions are never altered by these controls.';
    $('hudScaleNotice').textContent = mode === 'real'
      ? 'SCIENTIFIC SCALE — sizes and distances true to reality'
      : 'Sizes exaggerated for visibility · orbital positions are computed, not decorative';
    updateScaleReadout();
  }
  document.querySelectorAll('#scaleModeSeg .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { setScaleMode(this.getAttribute('data-scale')); });
  });
  function rescaleBodies() {
    for (var id in bodies) {
      var b = bodies[id];
      if (id === 'sun') {
        var rs = sunRadiusUnits();
        b.mesh.scale.setScalar(rs / (b.geoR || (b.geoR = b.mesh.geometry.parameters.radius)));
        b.corona.scale.setScalar(rs * 7 * state.glare / 100);
        continue;
      }
      if (!b.mesh || !b.mesh.geometry.parameters) continue;
      var g0 = b.geoR || (b.geoR = b.mesh.geometry.parameters.radius);
      var want = b.isMoon ? moonRadiusUnits(b.def.radiusKm) : planetRadiusUnits(b.def.radiusKm);
      var k = want / g0;
      b.mesh.scale.setScalar(k);
      if (b.clouds) b.clouds.scale.setScalar(k);
      if (b.ring) b.ring.scale.setScalar(k);
      b.rUnits = want;
    }
  }
  function bindSlider(id, outId, key, fmt, after) {
    var s = $(id), o = $(outId);
    function upd() {
      state[key] = parseFloat(s.value);
      o.textContent = fmt(state[key]);
      if (after) after();
    }
    s.addEventListener('input', upd);
    upd();
  }
  bindSlider('sizeScale', 'sizeScaleOut', 'sizeScale', function (v) { return v + '×'; }, function () { rescaleBodies(); updateScaleReadout(); });
  bindSlider('moonSizeScale', 'moonSizeScaleOut', 'moonSizeScale', function (v) { return v + '×'; }, function () { rescaleBodies(); updateScaleReadout(); });
  bindSlider('distScale', 'distScaleOut', 'distScale', function (v) { return v + '×'; }, function () { resetTrails(); updateScaleReadout(); });
  bindSlider('moonDistScale', 'moonDistScaleOut', 'moonDistScale', function (v) { return v + '×'; }, updateScaleReadout);
  function updateScaleReadout() {
    $('scaleReadout').innerHTML =
      '1 AU = ' + fmtNum(auUnits(), 0) + ' scene units · Earth radius drawn ' +
      fmtNum(planetRadiusUnits(6371) / auUnits() * CORE.AU_KM, 0) + '× reality';
  }
  updateScaleReadout();

  /* ---- graphics -------------------------------------------------------------------*/
  var Q_PR = { low: 1, medium: 1.25, high: Math.min(window.devicePixelRatio || 1, 2), ultra: Math.min(window.devicePixelRatio || 1, 2) * 1.5 };
  function setQuality(q) {
    state.quality = q;
    document.querySelectorAll('#qualitySeg .seg-btn').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-q') === q);
    });
    renderer.setPixelRatio(Q_PR[q]);
    belt.inst.visible = q !== 'low';
    if (nebula) nebula.visible = state.nebula && q !== 'low';
    resize();
  }
  document.querySelectorAll('#qualitySeg .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { setQuality(this.getAttribute('data-q')); });
  });
  bindChk('optBloom', function (v) {
    state.bloom = v;
    sunBody.corona.visible = v;
    for (var id in bodies) { var b = bodies[id]; if (b.halo) b.halo.visible = v && state.atmo; }
  });
  bindChk('optShadows', function (v) {
    state.shadows = v;
    renderer.shadowMap.enabled = v;
    sunLight.castShadow = v;
    scene.traverse(function (o) { if (o.material) o.material.needsUpdate = true; });
  });
  bindChk('optStars', function (v) { state.stars = v; starPoints.visible = v && !state.surfaceMode ? v : v; starPoints.visible = v; });
  bindChk('optNebula', function (v) { state.nebula = v; if (nebula && !state.surfaceMode) nebula.visible = v; });
  bindChk('optClouds', function (v) {
    state.clouds = v;
    for (var id in bodies) if (bodies[id].clouds) bodies[id].clouds.visible = v;
  });
  bindChk('optAtmo', function (v) { state.atmo = v; });
  bindSlider('glareScale', 'glareScaleOut', 'glare', function (v) { return v + '%'; }, function () {
    sunBody.corona.scale.setScalar(sunRadiusUnits() * 7 * state.glare / 100);
  });

  /* ---- accuracy panel ---------------------------------------------------------------*/
  $('accuracyReadout').innerHTML =
    'Positions solve Keplerian elements from JPL SDP tables (1800–2050 fit; Pluto 3000 BC–3000 AD). ' +
    'Expected accuracy: ≲1′ of arc for the major planets inside the fit window, ≲0.3° for dwarf planets, ' +
    '≲0.5° for major-moon longitudes (mean-element model).';
  $('btnRunChecks').addEventListener('click', function () {
    var res = CORE.selfTest(DATA);
    var host = $('checkResults');
    host.hidden = false;
    var pass = 0;
    host.innerHTML = res.map(function (r) {
      if (r.ok) pass++;
      return '<div class="chk-row ' + (r.ok ? 'is-ok' : 'is-bad') + '"><span>' +
        (r.ok ? '✓' : '✗') + '</span><span>' + r.name + '</span><span class="mono">' + r.detail + '</span></div>';
    }).join('') + '<div class="chk-row ' + (pass === res.length ? 'is-ok' : 'is-warn') + '"><b>' +
      pass + '/' + res.length + ' checks passed</b></div>';
    toast(pass === res.length ? 'All ephemeris self-tests passed' : pass + '/' + res.length + ' self-tests passed', 4000);
  });


  /* ===================== 8. info panel ====================================== */
  var infoDef = null, infoTab = 'facts';

  function setFollowUi() {
    var t = 'Camera frame: heliocentric (Sun-centred) by default';
    if (state.follow && state.selected && bodies[state.selected]) {
      t = 'Camera follows ' + bodies[state.selected].def.name;
    }
    $('modePill').title = t;
    var fb = $('btnFollow');
    if (fb) fb.classList.toggle('is-on', !!state.follow);
  }

  function row(label, value) {
    return '<div class="irow"><span>' + label + '</span><b>' + (value == null || value === '' ? '—' : value) + '</b></div>';
  }
  function para(txt) { return txt ? '<p class="ipara">' + txt + '</p>' : ''; }
  function kindLabel(def) {
    if (def.kind === 'star') return 'Star · G2V main sequence';
    if (def.kind === 'dwarf' || def.isDwarf) return 'Dwarf planet';
    if (def.parent) return 'Moon of ' + (bodies[def.parent] ? bodies[def.parent].def.name : def.parent);
    return 'Planet';
  }
  function fmtDistAu(au) {
    return fmtNum(au, 4) + ' AU · ' + fmtSci(au * CORE.AU_KM) + ' km';
  }

  /* live observing geometry for the selected body */
  function liveObsFor(id) {
    var jd = state.jd, lat = state.loc.lat, lon = state.loc.lon;
    var lstDeg = CORE.lst(jd, lon);
    var e = bodies.earth.helioAu || [1, 0, 0];
    var out = [];
    function geo(g) { // g = geocentric ecliptic [x,y,z] in AU
      CORE.geoToEq(g[0], g[1], g[2], _buf2);
      var rd = CORE.radDec(_buf2);
      var aa = CORE.altAz(rd.ra, rd.dec, lstDeg, lat);
      var r = Math.hypot(g[0], g[1], g[2]);
      var sunR = Math.hypot(-e[0], -e[1], -e[2]);
      var dot = (g[0] * -e[0] + g[1] * -e[1] + g[2] * -e[2]) / (r * sunR);
      var elong = Math.acos(clamp(dot, -1, 1)) / DEG;
      out.push(row('Distance from Earth', fmtDistAu(r)));
      out.push(row('Right ascension', (rd.ra / 15).toFixed(3) + ' h · Dec ' + (rd.dec >= 0 ? '+' : '') + rd.dec.toFixed(2) + '°'));
      out.push(row('Altitude / azimuth (you)', (aa.alt >= 0 ? '' : 'below horizon, ') + aa.alt.toFixed(1) + '° / ' + aa.az.toFixed(1) + '°'));
      out.push(row('Elongation from Sun', elong.toFixed(1) + '°' + (elong > 175 ? ' — near opposition' : elong < 8 ? ' — near conjunction' : '')));
      return rd;
    }
    if (id === 'sun') {
      geo([-e[0], -e[1], -e[2]]);
    } else if (bodies[id] && bodies[id].isMoon) {
      var pb = bodies[id].parent;
      CORE.moonLocal(bodies[id].def, jd, _buf);
      var moonAu = _buf.map(function (v) { return v / CORE.AU_KM; });
      var ph = bodies[id].posWorld.length() / auUnits();
      out.push(row('Distance from ' + pb.def.name, fmtNum(bodies[id].distKm, 0) + ' km'));
      var g = [pb.helioAu[0] + moonAu[0] - e[0], pb.helioAu[1] + moonAu[1] - e[1], pb.helioAu[2] + moonAu[2] - e[2]];
      var rd = geo(g);
      var sunDir = [-e[0], -e[1], -e[2]];
      var sr = Math.hypot.apply(null, sunDir);
      var dot = (g[0] * sunDir[0] + g[1] * sunDir[1] + g[2] * sunDir[2]) / (Math.hypot.apply(null, g) * sr);
      var i = (1 - Math.acos(clamp(dot, -1, 1))) / Math.PI;
      out.push(row('Illuminated fraction', (i * 100).toFixed(0) + '% (phase)'));
    } else {
      var b = bodies[id];
      if (b.helioAu) {
        out.push(row('Distance from Sun', fmtDistAu(Math.hypot.apply(null, b.helioAu))));
        geo([b.helioAu[0] - e[0], b.helioAu[1] - e[1], b.helioAu[2] - e[2]]);
      }
    }
    return out.join('');
  }

  function factsHtml(def) {
    var s = '';
    s += para(def.blurb);
    s += '<div class="igroup">Physical</div>';
    if (def.kind === 'star') {
      s += row('Radius', fmtNum(def.radiusKm, 0) + ' km (' + (def.radiusKm / 6371).toFixed(1) + ' Earth radii)');
      s += row('Mass', fmtSci(def.massKg) + ' kg (' + fmtSci(def.massKg / 5.97237e24) + ' Earths)');
      s += row('Surface temperature', def.tempC + ' °C');
      s += row('Rotation period', (def.rotPeriodH / 24).toFixed(2) + ' days (equatorial)');
      s += row('Light travel time to Earth', '8 min ' + Math.round(149597870.7 / 299792.458 - 480) + ' s');
    } else if (def.parent) {
      s += row('Mean radius', fmtNum(def.radiusKm, 2) + ' km');
      if (def.gravity) s += row('Surface gravity', def.gravity + ' m/s² (' + (def.gravity / 9.807 * 100).toFixed(1) + '% of Earth)');
      s += row('Temperature', (def.tempC || '—') + (def.tempC && String(def.tempC).indexOf('°') < 0 && !/[a-z(]/.test(String(def.tempC).slice(-1)) ? ' °C' : ''));
      s += row('Rotation', def.tidallyLocked ? 'Tidally locked to ' + bodies[def.parent].def.name : (def.rotPeriodH ? fmtNum(def.rotPeriodH, 2) + ' h' : '—'));
    } else {
      s += row('Radius', fmtNum(def.radiusKm, 1) + ' km (' + (def.radiusKm / 6371).toFixed(3) + ' Earth radii)');
      s += row('Mass', fmtSci(def.massKg) + ' kg · ' + fmtNum(def.massEarths, 3) + ' Earth masses');
      s += row('Density', def.density + ' g/cm³');
      s += row('Surface gravity', def.gravity + ' m/s² · escape ' + def.escapeVel + ' km/s');
      s += row('Rotation period', def.rotNote || (fmtNum(Math.abs(def.rotPeriodH), 2) + ' h' + (def.rotPeriodH < 0 ? ' retrograde' : '')));
      s += row('Axial tilt', def.tiltDeg + '°');
      s += row('Bond albedo', def.albedo);
      s += row('Temperature', (def.tempC || '—') + (def.tempC && /−|\d/.test(String(def.tempC)) && String(def.tempC).indexOf('°') < 0 ? ' °C' : ''));
    }
    s += '<div class="igroup">Discovered</div>' + row('Known since', def.discovered || (def.parent ? '— (see mission notes)' : '—'));
    if (def.dayInfo) s += para(def.dayInfo);
    return s;
  }
  function orbitHtml(def) {
    var s = '';
    if (def.parent) {
      var m = def.orbit;
      s += '<div class="igroup">Orbit of ' + def.name + ' around ' + bodies[def.parent].def.name + '</div>';
      s += row('Semi-major axis', fmtNum(m[0], 0) + ' km (' + (m[0] / 384400).toFixed(2) + ' × lunar distance)');
      s += row('Sidereal period', fmtNum(Math.abs(m[1]), 4) + ' days' + (m[1] < 0 ? ' (retrograde)' : ''));
      s += row('Eccentricity', m[2]);
      s += row('Inclination', m[3] + '° (to ' + (def.parent === 'earth' ? "Earth's equator plane" : "parent's equator") + ')');
      s += para('Moons shown use mean circular/Keplerian elements — accurate to a few degrees of longitude for the major moons; irregular moons and resonant librations (Hyperion!) are simplified.');
    } else if (def.kind === 'star') {
      s += para('The Sun sits at the origin of the scene. Everything else orbits it.');
    } else {
      var el0 = CORE.elementsAt(def.orbit, state.jd, def.orbitSource);
      s += '<div class="igroup">Instantaneous osculating elements (computed now)</div>';
      s += row('Semi-major axis a', el0.a.toFixed(5) + ' AU');
      s += row('Eccentricity e', el0.e.toFixed(5));
      s += row('Inclination i', el0.i.toFixed(3) + '°');
      s += row('Longitude of perihelion', ((el0.longPeri % 360 + 360) % 360).toFixed(2) + '°');
      s += row('Longitude of node', ((el0.longNode % 360 + 360) % 360).toFixed(2) + '°');
      s += row('Mean longitude', ((el0.L % 360 + 360) % 360).toFixed(2) + '°');
      s += '<div class="igroup">Mean orbit (NASA fact sheet)</div>';
      if (def.orbitalPeriodD) s += row('Orbital period', fmtNum(def.orbitalPeriodD, 2) + ' d · ' + def.periodY + ' yr');
      if (def.periAU) s += row('Perihelion / aphelion', def.periAU + ' / ' + def.apoAU + ' AU');
      if (def.velKms) s += row('Mean orbital speed', def.velKms + ' km/s');
      s += para('Elements from JPL “Keplerian Elements for Approximate Positions of the Major Planets”. The curve drawn in the scene is sampled from the same solver used for the bodies themselves.');
    }
    return s;
  }
  function worldHtml(def) {
    var s = para(def.blurb) + '<div class="igroup">World &amp; exploration</div>';
    if (def.atmosphere) s += row('Atmosphere', def.atmosphere);
    if (def.moonsCount != null) s += row('Known moons', def.moonsCount);
    if (def.moonNote) s += para(def.moonNote);
    s += para(def.world);
    return s;
  }
  function obsHtml(def) {
    if (def.kind === 'star') {
      return para('The Sun as seen from your saved location, right now in simulation time.') +
        '<div class="ilive" id="infoLive">' + liveObsFor(def.id) + '</div>';
    }
    var vis = def.parent ? '' : para('Position from your saved location (' + state.loc.name + '), at the current simulation moment. Updates as time flows.');
    return vis + '<div class="ilive" id="infoLive">' + liveObsFor(def.id) + '</div>';
  }

  function showInfo(def) {
    infoDef = def;
    $('infoPanel').hidden = false;
    $('infoTitle').textContent = def.name;
    $('infoKicker').textContent = kindLabel(def);
    $('infoSwatch').style.background = def.color;
    $('infoParent').textContent = def.parent
      ? 'Orbits ' + (bodies[def.parent] ? bodies[def.parent].def.name : def.parent) + ' · parent ' + (bodies[def.parent] && bodies[def.parent].def.parent ? 'orbits ' + bodies[def.parent].def.parent : 'the Sun')
      : (def.kind === 'star' ? 'Barycentre of the Solar System' : 'Orbits the Sun');
    $('infoNote').textContent = 'Positions computed locally from Keplerian elements — no network ephemeris.';
    renderInfoTab();
  }
  function renderInfoTab() {
    if (!infoDef) return;
    var html = infoTab === 'facts' ? factsHtml(infoDef)
      : infoTab === 'orbit' ? orbitHtml(infoDef)
      : infoTab === 'world' ? worldHtml(infoDef)
      : obsHtml(infoDef);
    $('infoScroll').innerHTML = html;
    document.querySelectorAll('#infoTabs .tab').forEach(function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-tab') === infoTab);
    });
  }
  function refreshInfoLive() {
    var host = $('infoLive');
    if (host && infoDef) host.innerHTML = liveObsFor(infoDef.id);
  }
  document.querySelectorAll('#infoTabs .tab').forEach(function (t) {
    t.addEventListener('click', function () { infoTab = this.getAttribute('data-tab'); renderInfoTab(); });
  });
  $('btnCloseInfo').addEventListener('click', function () { deselect(); });
  $('btnFocusBody').addEventListener('click', function () {
    if (!infoDef) return;
    selectBody(infoDef.id, true);
    var b = bodies[infoDef.id];
    cam.radiusWanted = focusRadiusFor(b) * (infoDef.parent ? 2.4 : 3.5);
    toast('Camera focusing on ' + infoDef.name);
  });

  /* ===================== 9. selection marker ================================= */
  var selMarker = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.32, 72),
    new THREE.MeshBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  selMarker.visible = false;
  selMarker.renderOrder = 5;
  scene.add(selMarker);
  function updateMarker() {
    var b = state.selected && bodies[state.selected];
    if (!b || !state.showMarkers || state.surfaceMode) { selMarker.visible = false; return; }
    selMarker.visible = true;
    var p = b.posWorld;
    if (b.isMoon) b.group.getWorldPosition(p);
    selMarker.position.copy(p);
    /* Scale off the smoothed orbit radius (not the raw distance, which
       oscillates at the body's orbital speed and made the ring pulsate),
       and clamp so the ring hugs the body instead of engulfing the screen
       when focusing on tiny moons like Phoebe. */
    var msc = Math.min(Math.max(cam.radius * 0.045, (b.rUnits || 0.05) * 1.6), cam.radius * 0.22);
    selMarker.scale.setScalar(msc);
    selMarker.lookAt(camera.position);
  }

  /* ===================== 10. timeline ticks, surface controls ================ */
  (function buildTlTicks() {
    var host = $('tlTicks'), lo = 1800, hi = 2050;
    for (var y = 1800; y <= 2050; y += 10) {
      var t = document.createElement('span');
      var major = y % 50 === 0;
      t.style.cssText = 'position:absolute;left:' + ((y - lo) / (hi - lo) * 100).toFixed(3) + '%;top:0;width:1px;background:rgba(140,170,200,' + (major ? 0.5 : 0.22) + ');height:' + (major ? 9 : 5) + 'px';
      host.appendChild(t);
    }
  })();

  var soIdx = 0;
  $('soPickNext').addEventListener('click', function () {
    var jd = state.jd, lat = state.loc.lat, lstDeg = CORE.lst(jd, state.loc.lon);
    var e = bodies.earth.helioAu || [1, 0, 0];
    var cands = [];
    function cand(id, g) {
      CORE.geoToEq(g[0], g[1], g[2], _buf2);
      var rd = CORE.radDec(_buf2);
      var aa = CORE.altAz(rd.ra, rd.dec, lstDeg, lat);
      if (aa.alt > -1) cands.push({ id: id, alt: aa.alt, az: aa.az });
    }
    cand('sun', [-e[0], -e[1], -e[2]]);
    CORE.moonGeoEcliptic(moonDef(), jd, _buf);
    cand('moon', [_buf[0], _buf[1], _buf[2]]);
    DATA.planets.concat(DATA.dwarfPlanets).forEach(function (p) {
      if (p.id === 'earth') return;
      CORE.heliocentric(p.orbit, jd, p.orbitSource, _buf);
      cand(p.id, [_buf[0] - e[0], _buf[1] - e[1], _buf[2] - e[2]]);
    });
    if (!cands.length) { toast('Nothing is above the horizon right now — try a different time'); return; }
    cands.sort(function (a, b) { return a.az - b.az; });
    soIdx = (soIdx + 1) % cands.length;
    var pick = cands[soIdx];
    var p = altAzToScene(pick.alt, pick.az, 1).negate();   // camera sits opposite the target
    cam.phi = clamp(Math.acos(clamp(p.y, -1, 1)), 0.05, Math.PI - 0.05);
    cam.theta = Math.atan2(p.z, p.x);
    var nm = (bodies[pick.id] && bodies[pick.id].def.name) || pick.id;
    toast('Facing ' + nm + ' — alt ' + pick.alt.toFixed(1) + '°, az ' + pick.az.toFixed(0) + '°');
  });
  $('soLeave').addEventListener('click', function () { setObserverMode('helio'); });

  /* ===================== 11. help, panels, keyboard ========================== */
  var HELP =
    '<p><b>Mouse:</b> drag = orbit · right-drag / Shift-drag = pan · wheel = zoom · click a body = select + info.</p>' +
    '<p><b>Keyboard:</b> Space = play/pause · , . = slower / faster · ← → = ±1 day (Shift = ±1 year) · ' +
    'N = now · F = follow toggle · L = labels · O = orbits · M = moon orbits · T = trails · G = grid · ' +
    'Esc = close panel · H = this help.</p>' +
    '<p><b>Scales:</b> “Explorer” exaggerates sizes so you can see everything; “Scientific scale” is true proportion (planets become specks — that is the real Solar System). Neither changes calculated positions.</p>' +
    '<p><b>Accuracy:</b> planets solve JPL Keplerian elements (1800–2050 fit) — arc-minute class. Major moons use mean elements — fraction-of-a-degree class. The Earth-surface dome is a real alt/az sky for your location: rise/set times, phases and oppositions are all emergent from the math, not scripted.</p>' +
    '<p>Everything here runs offline from local files and local data (JPL elements, NASA fact sheets — sources in tools/sources/).</p>';
  $('helpBody').innerHTML = HELP;
  $('btnHelp').addEventListener('click', function () { $('helpModal').hidden = false; });
  $('btnCloseHelp').addEventListener('click', function () { $('helpModal').hidden = true; });
  $('helpModal').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
  $('btnSettings').addEventListener('click', function () {
    var app = document.querySelector('.app');
    var lp = document.getElementById('leftPanel');
    /* ≤900px the left panel is a slide-in drawer driven by .is-open;
       wider screens use the in-flow .app.panel-hidden collapse */
    if (window.matchMedia('(max-width:900px)').matches) {
      var open = lp.classList.toggle('is-open');
      this.classList.toggle('is-on', open);
      this.setAttribute('aria-expanded', String(open));
    } else {
      var hidden = app.classList.toggle('panel-hidden');
      this.classList.toggle('is-on', !hidden);
      this.setAttribute('aria-expanded', String(!hidden));
    }
    resize();
  });
  /* drawer starts closed on small screens: keep the gear state honest */
  if (window.matchMedia('(max-width:900px)').matches) {
    $('btnSettings').classList.remove('is-on');
    $('btnSettings').setAttribute('aria-expanded', 'false');
  }
  /* tapping the 3D view closes an open drawer */
  document.getElementById('viewport').addEventListener('pointerdown', function () {
    var lp = document.getElementById('leftPanel');
    if (lp.classList.contains('is-open')) {
      lp.classList.remove('is-open');
      $('btnSettings').classList.remove('is-on');
      $('btnSettings').setAttribute('aria-expanded', 'false');
    }
  });
  /* ---- phone-only pull tab on the player bar: tap or drag the grip to
     stow the controls downward and give the info card the whole screen ---- */
  (function () {
    var tab = document.getElementById('barTab'), bar = document.getElementById('bottombar');
    var app = document.querySelector('.app');
    if (!tab || !bar) return;
    var TABH = 26;                                   /* visible strip when stowed */
    function mobile() { return window.matchMedia('(max-width:760px)').matches; }
    function publish() {                             /* how tall the bar looks right now */
      var collapsed = app.classList.contains('bar-collapsed');
      document.documentElement.style.setProperty('--barh', (collapsed ? TABH : bar.offsetHeight) + 'px');
      tab.setAttribute('aria-expanded', String(!collapsed));
    }
    if (window.ResizeObserver) new ResizeObserver(publish).observe(bar);
    window.addEventListener('resize', publish);
    publish();
    var startY = 0, lastY = 0, moved = false, dragging = false;
    tab.addEventListener('pointerdown', function (e) {
      if (!mobile()) return;
      dragging = true; moved = false; startY = lastY = e.clientY;
      bar.style.transition = 'none';
      try { tab.setPointerCapture(e.pointerId); } catch (_) {}
    });
    tab.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      lastY = e.clientY;
      if (Math.abs(lastY - startY) > 6) moved = true;
      var h = bar.offsetHeight - TABH;
      var y = (app.classList.contains('bar-collapsed') ? h : 0) + (lastY - startY);
      bar.style.transform = 'translateY(' + Math.max(0, Math.min(h, y)) + 'px)';
    });
    function release() {
      if (!dragging) return;
      dragging = false;
      bar.style.transition = ''; bar.style.transform = '';
      if (!mobile()) return;
      var collapsed = app.classList.contains('bar-collapsed');
      var h = Math.max(20, bar.offsetHeight - TABH), dy = lastY - startY;
      if (!moved) collapsed = !collapsed;                    /* plain tap toggles */
      else if (!collapsed && dy > h * 0.3) collapsed = true; /* pull down to stow */
      else if (collapsed && dy < -h * 0.3) collapsed = false;/* pull up to restore */
      app.classList.toggle('bar-collapsed', collapsed);
      publish();
    }
    tab.addEventListener('pointerup', release);
    tab.addEventListener('pointercancel', function () {
      dragging = false; bar.style.transition = ''; bar.style.transform = '';
    });
    tab.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        app.classList.toggle('bar-collapsed');
        publish();
      }
    });
  })();

  window.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    var k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
    else if (e.key === 'ArrowRight') setJd(state.jd + (e.shiftKey ? 365.25 : 1));
    else if (e.key === 'ArrowLeft') setJd(state.jd - (e.shiftKey ? 365.25 : 1));
    else if (k === '.' || k === '>') stepRate(+1);
    else if (k === ',' || k === '<') stepRate(-1);
    else if (k === 'n') { setJd(CORE.jdFromDate(new Date())); toast('Now'); }
    else if (k === 'f') {
      if (!state.follow && !state.selected) { toast('Follow needs a selection — click a body first'); }
      else { state.follow = !state.follow; setFollowUi(); toast('Camera follow ' + (state.follow ? 'on' : 'off')); }
    }
    else if (k === 'l') { state.showLabels = !state.showLabels; $('optLabels').checked = state.showLabels; }
    else if (k === 'o') { state.showOrbits.planets = !state.showOrbits.planets; $('optOrbitPlanets').checked = state.showOrbits.planets; updateOrbitVisibility(); }
    else if (k === 'm') { state.showOrbits.moons = !state.showOrbits.moons; $('optOrbitMoons').checked = state.showOrbits.moons; updateOrbitVisibility(); }
    else if (k === 't') { state.showTrails = !state.showTrails; $('optTrails').checked = state.showTrails; if (!state.showTrails) resetTrails(); }
    else if (k === 'g') { grid.visible = !grid.visible; $('optEclipticGrid').checked = grid.visible; }
    else if (k === 'h' || e.key === '?') $('helpModal').hidden = !$('helpModal').hidden;
    else if (e.key === 'Enter') {
      if (!$('helpModal').hidden) return;
      setObserverMode(state.observerMode === 'topo' ? 'helio' : 'topo');
    }
    else if (e.key === 'Escape') {
      if (!$('helpModal').hidden) $('helpModal').hidden = true;
      else if (!$('datePopover').hidden) $('datePopover').hidden = true;
      else if (!$('infoPanel').hidden) deselect();
    }
  });

  /* ===================== 12. main loop ======================================= */
  var lastT = performance.now(), fpsFrames = 0, fpsT = lastT;
  var uiT = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;

    if (state.playing && state.rate !== 0) {
      state.jd += state.rate * dt;      // continuous flow — never resets trails
      topoSkyDirty = true;
    }

    updatePositions(state.jd);
    /* per-frame projection guard: any layout change (panel toggles, bottom
       bar wrapping, fullscreen, rotation) that missed a resize event/observer
       callback is caught here, so spheres are never stretched */
    var hw = host.clientWidth, hh = host.clientHeight;
    if (hw > 0 && hh > 0 && Math.abs(camera.aspect - hw / hh) > 1e-3) resize();
    updateCamera(dt);
    if (state.observerMode === 'topo' && topoSkyDirty) updateTopoSky(state.jd);
    updateMarker();
    updateLabels();

    // text UI at ~10 Hz
    uiT += dt;
    if (uiT > 0.1) {
      uiT = 0;
      updateClockUi();
      if (!$('infoPanel').hidden && infoTab === 'obs') refreshInfoLive();
    }

    fpsFrames++;
    if (now - fpsT > 1000) {
      $('fpsMeter').textContent = Math.round(fpsFrames * 1000 / (now - fpsT));
      fpsFrames = 0; fpsT = now;
    }

    renderer.render(scene, camera);
  }

  /* ===================== 13. boot ============================================= */
  updateOrbitVisibility();
  setFollowUi();
  updatePositions(state.jd);
  updateCamera(0);
  renderer.render(scene, camera);
  setLoading('ready');
  window.__SSE = { bodies: bodies, state: state, camera: camera, scene: scene, renderer: renderer, cam: cam, auUnits: auUnits, moonOrbitUnits: moonOrbitUnits, planetRadiusUnits: planetRadiusUnits, selectBody: selectBody, deselect: deselect };
  requestAnimationFrame(frame);
  setTimeout(function () {
    var ld = $('loading');
    ld.style.transition = 'opacity .5s';
    ld.style.opacity = '0';
    setTimeout(function () { ld.style.display = 'none'; }, 550);
  }, 350);
})();

/* ===================== 14. PWA service worker ===============================
   Makes the app installable (Add to Home Screen / Install app) and fully
   offline after the first visit. Registered on https origins; the QA harness
   (or local testing) enables it on http via ?swdebug in the URL or
   localStorage sse-sw=1. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var devOn = false;
  try { devOn = /[?&]swdebug/.test(location.search) || localStorage.getItem('sse-sw') === '1'; } catch (e) {}
  if (location.protocol !== 'https:' && !devOn) return;
  navigator.serviceWorker.register('sw.js').catch(function (err) {
    if (window.console) console.warn('service worker registration failed:', err);
  });
})();
